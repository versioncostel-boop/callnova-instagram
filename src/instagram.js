import { config } from './config.js';

export async function sendInstagramMessage(recipientId, text) {
  const url = config.instagramAccountId
    ? `https://graph.instagram.com/${config.instagramApiVersion}/${config.instagramAccountId}/messages`
    : `https://graph.facebook.com/${config.instagramApiVersion}/me/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.instagramAccessToken}` },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } })
  });
  if (!response.ok) throw new Error(`Instagram mesajı gönderilemedi: ${response.status}`);
}

export async function sendInstagramCommentPrivateReply(commentId, text) {
  if (!config.instagramAccountId) throw new Error('Yorum özel yanıtı için INSTAGRAM_ACCOUNT_ID gerekli.');
  const url = `https://graph.instagram.com/${config.instagramApiVersion}/${config.instagramAccountId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.instagramAccessToken}` },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } })
  });
  if (!response.ok) throw new Error(`Instagram yorum özel yanıtı gönderilemedi: ${response.status}`);
}
