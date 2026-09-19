import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { config, assertRuntimeConfig } from './config.js';
import { createReply } from './ai.js';
import { saveLead } from './crm.js';
import { sendDailyReport } from './email.js';
import { getInstagramProfile, sendInstagramCommentPrivateReply, sendInstagramCommentReply, sendInstagramMessage } from './instagram.js';
import { commentWelcomeMessage } from './knowledge.js';
import { purchaseStage, requestedPhotos, updateContact } from './lead.js';
import { findSizeSuggestion } from './size.js';
import { getConversation, getDailyReportData, getHandledCommentIds, rememberHandledCommentId, saveConversation } from './store.js';

const pendingMessages = new Map();
const handledMessageIds = new Set();
const handledCommentIds = new Set();
const commentReplyTimestamps = [];
const replyDelayMs = 10_000;
const maxCommentRepliesPerHour = 30;
const commentReplyWindowMs = 60 * 60 * 1000;

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

async function handleMessage(senderId, text) {
  const conversation = await getConversation(senderId);

  conversation.contact = updateContact(conversation.contact, text);
  const wantsPhotos = requestedPhotos(text) || conversation.photoRequested;
  const paymentStage = purchaseStage(text);
  conversation.photoRequested = wantsPhotos;
  conversation.paymentStage = paymentStage || conversation.paymentStage;
  conversation.messages = [...conversation.messages, { role: 'user', text, at: new Date().toISOString() }].slice(-8);

  let reply = await createReply(conversation.messages, wantsPhotos, conversation.contact, findSizeSuggestion(text));
  const needsTeamFollowUp = reply.includes('[EKIP_BILDIRIMI]');
  if (needsTeamFollowUp) {
    reply = reply.replace(/\s*\[EKIP_BILDIRIMI\]\s*/g, ' ').trim();
    if (!/ekibimiz|ekip arkadaşlarımız|geri dönüş/i.test(reply)) {
      reply = `${reply} Ekibimiz konuyu kontrol edip size geri dönüş sağlayacak. 📩`;
    }
    conversation.teamFollowupNotifications ??= 0;
    if (conversation.teamFollowupNotifications < 2) {
      const profile = await getInstagramProfile(senderId).catch(() => ({}));
      await saveLead({
        instagramUserId: senderId,
        instagramUsername: profile.username || conversation.instagramUsername || '',
        name: conversation.contact.name || '',
        phone: conversation.contact.phone || '',
        source: 'instagram_dm',
        requested: 'human_followup',
        status: 'human_followup',
        issue: text,
        createdAt: new Date().toISOString()
      });
      conversation.instagramUsername = profile.username || conversation.instagramUsername || '';
      conversation.teamFollowupNotifications += 1;
    }
  }
  conversation.messages = [...conversation.messages, { role: 'assistant', text: reply, at: new Date().toISOString() }].slice(-8);

  const leadReason = conversation.paymentStage || (wantsPhotos ? 'photo_request' : null);
  conversation.savedLeadReasons ??= [];
  if (leadReason && conversation.contact.name && conversation.contact.phone && !conversation.savedLeadReasons.includes(leadReason)) {
    await saveLead({
      instagramUserId: senderId,
      name: conversation.contact.name,
      phone: conversation.contact.phone,
      source: 'instagram_dm',
      requested: leadReason,
      status: conversation.paymentStage || 'lead_open',
      createdAt: new Date().toISOString()
    });
    conversation.savedLeadReasons.push(leadReason);
  }

  await saveConversation(senderId, conversation);
  await sendInstagramMessage(senderId, reply);
  console.log(`DM yanıtlandı: ${senderId}`);
}

function queueIncomingMessage(senderId, text) {
  if (!senderId || !text?.trim()) return;
  console.log(`DM alındı: ${senderId}`);
  const pending = pendingMessages.get(senderId) || { texts: [], timer: null };
  pending.texts.push(text);
  clearTimeout(pending.timer);
  pending.timer = setTimeout(() => {
    pendingMessages.delete(senderId);
    handleMessage(senderId, pending.texts.join('\n')).catch(console.error);
  }, replyDelayMs);
  pendingMessages.set(senderId, pending);
}

function acceptIncomingMessage(event) {
  const message = event.message || event.value?.message;
  const senderId = event.sender?.id || event.value?.sender?.id || event.value?.from?.id || event.value?.sender_id;
  const messageId = message?.mid || message?.id || event.message_id;
  if (!message?.text || event.message?.is_echo || event.value?.message?.is_echo) return;
  if (messageId && handledMessageIds.has(messageId)) return;
  if (messageId) {
    handledMessageIds.add(messageId);
    if (handledMessageIds.size > 5000) handledMessageIds.clear();
  }
  queueIncomingMessage(senderId, message.text);
}

async function queueCommentPrivateReply(commentId, commenterId, commentText = '') {
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
      sendInstagramCommentPrivateReply(commentId, commentWelcomeMessage)
    ])
      .then(() => rememberHandledCommentId(commentId))
      .catch(console.error);
  };
  setTimeout(sendWhenAllowed, replyDelayMs);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === 'GET' && url.pathname === '/privacy-policy') {
    return sendHtml(response, 'Gizlilik Politikası', `<p>Son güncelleme: 15 Eylül 2026</p><p>Zarafet Takii, Instagram üzerinden ürün sorularını yanıtlamak ve müşteri talebini yönetmek için otomatik yanıt sistemi kullanır.</p><h2>İşlediğimiz bilgiler</h2><p>Instagram kullanıcı kimliği, gönderilen mesajlar ve müşterinin görsel talebi sırasında gönüllü olarak paylaştığı ad soyad ile telefon numarası işlenebilir.</p><h2>Kullanım amacı</h2><p>Bilgiler, ürün sorularını yanıtlamak, ölçü önerisi sunmak, görsel talebini WhatsApp üzerinden takip etmek ve müşteri hizmeti sağlamak için kullanılır.</p><h2>Paylaşım ve saklama</h2><p>Mesaj yanıtları OpenAI hizmetiyle oluşturulabilir. Görsel isteyen müşterilerin iletişim bilgileri, müşteri takibi amacıyla yetkili ekip ve kullanılan CRM sistemiyle paylaşılabilir.</p><h2>Haklar ve iletişim</h2><p>Bilgi talebi, düzeltme veya silme isteği için <a href="mailto:zarafettakiiletisim@gmail.com">zarafettakiiletisim@gmail.com</a> adresinden bize ulaşabilirsiniz.</p><p><a href="/data-deletion">Veri silme talimatları</a> · <a href="/terms">Kullanım koşulları</a></p>`);
  }
  if (request.method === 'GET' && url.pathname === '/data-deletion') {
    return sendHtml(response, 'Veri Silme Talimatları', `<p>Zarafet Takii ile paylaştığınız kişisel verilerin silinmesini istemek için <a href="mailto:zarafettakiiletisim@gmail.com?subject=Veri%20Silme%20Talebi">zarafettakiiletisim@gmail.com</a> adresine “Veri Silme Talebi” konulu bir e-posta gönderin.</p><p>E-postada Instagram kullanıcı adınızı ve silinmesini istediğiniz iletişim bilgisini belirtin. Kimlik doğrulamasından sonra talep en geç 30 gün içinde sonuçlandırılır.</p>`);
  }
  if (request.method === 'GET' && url.pathname === '/terms') {
    return sendHtml(response, 'Kullanım Koşulları', `<p>Zarafet Takii Instagram yanıt sistemi ürün bilgisi ve müşteri hizmeti desteği sunar. Otomatik yanıtlar bilgi amaçlıdır; ürün stok durumu, teslimat ve nihai sipariş bilgileri ekip tarafından teyit edilir.</p><p>Hizmeti kullanarak Instagram ve Meta kurallarına uygun davranmayı kabul edersiniz.</p><p>İletişim: <a href="mailto:zarafettakiiletisim@gmail.com">zarafettakiiletisim@gmail.com</a></p>`);
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
