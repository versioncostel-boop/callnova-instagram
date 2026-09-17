import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve('data');
const conversationsFile = path.join(dataDir, 'conversations.json');
const leadsFile = path.join(dataDir, 'leads.json');
const handledCommentsFile = path.join(dataDir, 'handled-comments.json');

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeJson(file, value) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

export async function getConversation(userId) {
  const all = await readJson(conversationsFile, {});
  return all[userId] || { welcomed: false, messages: [], contact: {} };
}

export async function saveConversation(userId, conversation) {
  const all = await readJson(conversationsFile, {});
  all[userId] = conversation;
  await writeJson(conversationsFile, all);
}

export async function queueLead(lead) {
  const leads = await readJson(leadsFile, []);
  const existingIndex = leads.findIndex((item) => item.instagramUserId === lead.instagramUserId && item.phone === lead.phone);
  if (existingIndex >= 0) {
    leads[existingIndex] = { ...leads[existingIndex], ...lead, updatedAt: new Date().toISOString() };
    await writeJson(leadsFile, leads);
  } else {
    leads.push(lead);
    await writeJson(leadsFile, leads);
  }
}

export async function getDailyReportData(startIso, endIso) {
  const conversations = await readJson(conversationsFile, {});
  const leads = await readJson(leadsFile, []);
  const spokenTo = Object.entries(conversations).filter(([, conversation]) => {
    const messages = conversation.messages || [];
    return messages.some((message) => message.role === 'user' && message.at >= startIso && message.at < endIso);
  });
  const dailyLeads = leads.filter((lead) => lead.createdAt >= startIso && lead.createdAt < endIso);
  const hotIds = new Set(dailyLeads.filter((lead) => ['order_intent', 'payment_pending', 'receipt_reported', 'human_followup'].includes(lead.status)).map((lead) => lead.instagramUserId));
  const purchasedIds = new Set(dailyLeads.filter((lead) => lead.status === 'receipt_reported').map((lead) => lead.instagramUserId));
  return {
    spokenTo: spokenTo.length,
    hot: hotIds.size,
    cold: Math.max(0, spokenTo.length - hotIds.size),
    purchased: purchasedIds.size,
    messages: spokenTo.reduce((total, [, conversation]) => total + (conversation.messages || []).filter((message) => message.role === 'user' && message.at >= startIso && message.at < endIso).length, 0)
  };
}

export async function getHandledCommentIds() {
  return new Set(await readJson(handledCommentsFile, []));
}

export async function rememberHandledCommentId(commentId) {
  const ids = await readJson(handledCommentsFile, []);
  if (!ids.includes(commentId)) ids.push(commentId);
  await writeJson(handledCommentsFile, ids.slice(-5000));
}
