import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { config, assertRuntimeConfig } from './config.js';
import { advanceCallnovaLead } from './callnova.js';
import { saveLead } from './crm.js';
import { sendDailyReport } from './email.js';
import { getInstagramProfile, sendInstagramCommentPrivateReply, sendInstagramCommentReply, sendInstagramMessage } from './instagram.js';
import { getConversation, getDailyReportData, getHandledCommentIds, rememberHandledCommentId, saveConversation } from './store.js';

const pendingMessages = new Map();
const recentBotMessages = new Map();
const handledMessageIds = new Set();
const recentInboundFingerprints = new Map();
const handledCommentIds = new Set();
const commentReplyTimestamps = [];
const followUpDelayMs = 10_000;
const commentReplyDelayMs = 10_000;
const maxCommentRepliesPerHour = 30;
const commentReplyWindowMs = 60 * 60 * 1000;
const duplicateMessageWindowMs = 30 * 60 * 1000;
const botEchoWindowMs = 2 * 60 * 1000;

function sendHtml(response, title, content) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Zarafet Takii</title><style>body{font-family:Arial,sans-serif;line-height:1.6;max-width:760px;margin:48px auto;padding:0 20px;color:#17202a}h1{font-size:28px}h2{margin-top:28px;font-size:20px}a{color:#7a5a27}</style></head><body><h1>${title}</h1>${content}</body></html>`);
}

function verifySignature(rawBody, signature) {
  if (!signature || !config.metaAppSecret) return false;
  const expected = `sha256=${createHmac('sha256', config.metaAppSecret).update(rawBody).digest('hex')}`;
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function sendBotMessage(recipientId, text) {
  recentBotMessages.set(recipientId, { text, at: Date.now() });
  await sendInstagramMessage(recipientId, text);
}

async function handleMessage(senderId, text) {
  const conversation = await getConversation(senderId);
  conversation.messages = [...conversation.messages, { role: 'user', text, at: new Date().toISOString() }].slice(-8);
  const { reply, completedNow } = advanceCallnovaLead(conversation, text);

  if (completedNow && !conversation.callnovaLead.saved) {
    const profile = await getInstagramProfile(senderId).catch(() => ({}));
    await saveLead({
      instagramUserId: senderId,
      instagramUsername: profile.username || '',
      name: '',
      phone: conversation.callnovaLead.phone,
      source: 'callnova_instagram_dm',
      requested: 'advertising_consultation',
      status: 'callnova_lead_ready',
      issue: `Sektör: ${conversation.callnovaLead.sector} | Şehir: ${conversation.callnovaLead.city} | Reklam hesabı: @${conversation.callnovaLead.instagramAccount}`,
      createdAt: new Date().toISOString()
    });
    conversation.callnovaLead.saved = true;
  }

  if (reply) conversation.messages = [...conversation.messages, { role: 'assistant', text: reply, at: new Date().toISOString() }].slice(-8);
  await saveConversation(senderId, conversation);
  if (!reply) {
    console.log(`Lead tamamlandı, ek yanıt gönderilmedi: ${senderId}`);
    return;
  }
  await sendBotMessage(senderId, reply);
  console.log(`DM yanıtlandı: ${senderId}`);
}

async function queueIncomingMessage(senderId, text) {
  if (!senderId || !text?.trim()) return;
  console.log(`DM alındı: ${senderId}`);

  const pending = pendingMessages.get(senderId) || { texts: [], timer: null };
  pending.texts.push(text);
  clearTimeout(pending.timer);
  pending.timer = setTimeout(() => {
    pendingMessages.delete(senderId);
    handleMessage(senderId, pending.texts.join('\n')).catch(console.error);
  }, followUpDelayMs);
  pendingMessages.set(senderId, pending);
}

function customerIdForEcho(event) {
  return event.recipient?.id || event.value?.recipient?.id || event.recipient_id || event.value?.recipient_id;
}

function handleOutgoingEcho(event, messageText) {
  const customerId = customerIdForEcho(event);
  if (!customerId) return;
  const recentBotMessage = recentBotMessages.get(customerId);
  const isOwnBotEcho = recentBotMessage
    && recentBotMessage.text === messageText
    && Date.now() - recentBotMessage.at <= botEchoWindowMs;
  if (isOwnBotEcho) {
    console.log('Botun kendi mesaj eventi yok sayıldı.');
    return;
  }

  const pending = pendingMessages.get(customerId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingMessages.delete(customerId);
    console.log(`İnsan yanıt verdi: bekleyen bot yanıtı iptal edildi (${customerId}).`);
  }
}

function acceptIncomingMessage(event) {
  if (!config.botEnabled) {
    console.log('Bot pasif: gelen DM yanıtlanmadı.');
    return;
  }
  const message = event.message || event.value?.message;
  const senderId = event.sender?.id || event.value?.sender?.id || event.value?.from?.id || event.value?.sender_id;
  const messageId = message?.mid || message?.id || event.message_id;
  const isEcho = Boolean(event.is_echo || event.value?.is_echo || event.message?.is_echo || event.value?.message?.is_echo);
  if (!message?.text) return;
  if (isEcho || senderId === config.instagramAccountId) {
    handleOutgoingEcho(event, message.text);
    return;
  }
  if (messageId && handledMessageIds.has(messageId)) return;
  if (messageId) {
    handledMessageIds.add(messageId);
    if (handledMessageIds.size > 5000) handledMessageIds.clear();
  }
  const now = Date.now();
  const fingerprint = `${senderId}:${message.text.trim().toLocaleLowerCase('tr-TR')}`;
  const previousAt = recentInboundFingerprints.get(fingerprint);
  if (previousAt && now - previousAt < duplicateMessageWindowMs) {
    console.log(`Tekrarlanan müşteri mesajı yok sayıldı: ${senderId}`);
    return;
  }
  recentInboundFingerprints.set(fingerprint, now);
  for (const [key, timestamp] of recentInboundFingerprints) {
    if (now - timestamp > duplicateMessageWindowMs) recentInboundFingerprints.delete(key);
  }
  queueIncomingMessage(senderId, message.text).catch(console.error);
}

async function queueCommentPrivateReply(commentId, commenterId, commentText = '') {
  if (!config.commentAutomationEnabled) {
    console.log('Yorum otomasyonu pasif: yorum yanıtlanmadı.');
    return;
  }
  if (!config.botEnabled) {
    console.log('Bot pasif: gelen yorum yanıtlanmadı.');
    return;
  }
  if (!commentId || handledCommentIds.has(commentId)) return;
  if (/dm'?den|özelden|mesaj(?:dan|la) cevap verildi|cevaplandı/i.test(commentText)) return;
  if (commenterId) {
    const conversation = await getConversation(commenterId);
    if (conversation.messages?.length) return;
  }
  handledCommentIds.add(commentId);
  const sendWhenAllowed = () => {
    const now = Date.now();
    while (commentReplyTimestamps[0] <= now - commentReplyWindowMs) commentReplyTimestamps.shift();

    if (commentReplyTimestamps.length >= maxCommentRepliesPerHour) {
      const nextAllowedAt = commentReplyTimestamps[0] + commentReplyWindowMs + 100;
      setTimeout(sendWhenAllowed, Math.max(100, nextAllowedAt - now));
      return;
    }

    commentReplyTimestamps.push(now);
    Promise.all([
      sendInstagramCommentReply(commentId, 'DM’den bilgi verilmiştir. ✨'),
      sendInstagramCommentPrivateReply(commentId, 'Merhaba, reklam hizmeti için DM üzerinden bilgi paylaşabilirsiniz.')
    ])
      .then(() => rememberHandledCommentId(commentId))
      .catch(console.error);
  };
  setTimeout(sendWhenAllowed, commentReplyDelayMs);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === 'GET' && url.pathname === '/privacy-policy') {
    return sendHtml(response, 'Gizlilik Politikası', `<p>Son güncelleme: 16 Ekim 2026</p><p>CallNova, Instagram üzerinden reklam hizmeti hakkında bilgi isteyen işletmelerin talebini yönetmek için otomatik yanıt sistemi kullanır.</p><h2>İşlediğimiz bilgiler</h2><p>Instagram kullanıcı kimliği, gönderilen mesajlar, işletme sektörü, şehir, reklam hesabı ve gönüllü olarak paylaşılan telefon numarası işlenebilir.</p><h2>Kullanım amacı</h2><p>Bilgiler, reklam hizmeti talebini kaydetmek ve yetkili ekibin geri dönüş sağlaması amacıyla kullanılır.</p><h2>Paylaşım ve saklama</h2><p>İletişim bilgileri, müşteri takibi amacıyla yetkili ekip ve kullanılan CRM sistemiyle paylaşılabilir.</p><h2>Haklar ve iletişim</h2><p>Bilgi talebi, düzeltme veya silme isteği için CallNova ile Instagram üzerinden iletişime geçebilirsiniz.</p><p><a href="/data-deletion">Veri silme talimatları</a> · <a href="/terms">Kullanım koşulları</a></p>`);
  }
  if (request.method === 'GET' && url.pathname === '/data-deletion') {
    return sendHtml(response, 'Veri Silme Talimatları', `<p>CallNova ile paylaştığınız kişisel verilerin silinmesini istemek için Instagram üzerinden “Veri Silme Talebi” başlıklı mesaj gönderin.</p><p>Mesajda Instagram kullanıcı adınızı ve silinmesini istediğiniz iletişim bilgisini belirtin. Kimlik doğrulamasından sonra talep en geç 30 gün içinde sonuçlandırılır.</p>`);
  }
  if (request.method === 'GET' && url.pathname === '/terms') {
    return sendHtml(response, 'Kullanım Koşulları', `<p>CallNova Instagram yanıt sistemi reklam hizmeti talebini toplar ve ekibin geri dönüş sürecini başlatır. Otomatik yanıtlar bilgi amaçlıdır; nihai hizmet kapsamı ekip tarafından teyit edilir.</p><p>Hizmeti kullanarak Instagram ve Meta kurallarına uygun davranmayı kabul edersiniz.</p><p>İletişim: CallNova Instagram hesabı.</p>`);
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify({ ok: true }));
  }
  if (request.method === 'GET' && url.pathname === '/webhook') {
    if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === config.metaVerifyToken) {
      response.writeHead(200, { 'content-type': 'text/plain' });
      return response.end(url.searchParams.get('hub.challenge'));
    }
    response.writeHead(403); return response.end();
  }
  if (request.method === 'POST' && url.pathname === '/webhook') {
    const raw = await readBody(request);
    if (!verifySignature(raw, request.headers['x-hub-signature-256'])) {
      console.error('Webhook imzası reddedildi. META_APP_SECRET kontrol edilmeli.');
      response.writeHead(401); return response.end();
    }
    response.writeHead(200); response.end('EVENT_RECEIVED');
    const payload = JSON.parse(raw.toString('utf8'));
    const eventSummary = (payload.entry || []).flatMap((entry) => [
      ...(entry.messaging || []).map(() => 'messaging'),
      ...(entry.changes || []).map((change) => change.field || 'change')
    ]);
    console.log(`Webhook doğrulandı: ${eventSummary.join(', ') || 'boş event'}`);
    for (const entry of payload.entry || []) {
      for (const event of entry.messaging || []) {
        acceptIncomingMessage(event);
      }
      for (const change of entry.changes || []) {
        if (change.field === 'comments' && change.value?.id) {
          queueCommentPrivateReply(change.value.id, change.value.from?.id, change.value.text || '').catch(console.error);
        }
        if (change.field === 'messages') acceptIncomingMessage(change);
      }
    }
    return;
  }
  response.writeHead(404); response.end();
});

function scheduleDailyReport() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  setTimeout(async function runReport() {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    try {
      const report = await getDailyReportData(start.toISOString(), end.toISOString());
      await sendDailyReport(report, start.toISOString().slice(0, 10));
      console.log('Günlük rapor e-postası gönderildi.');
    } catch (error) {
      console.error('Günlük rapor gönderilemedi:', error);
    }
    scheduleDailyReport();
  }, Math.max(1000, next.getTime() - now.getTime()));
}

assertRuntimeConfig();
server.listen(config.port, () => {
  console.log(`CallNova bot port ${config.port} üzerinde çalışıyor.`);
  scheduleDailyReport();
  getHandledCommentIds()
    .then((ids) => ids.forEach((id) => handledCommentIds.add(id)))
    .catch((error) => console.error('Yorum geçmişi okunamadı:', error));
});
