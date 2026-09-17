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

export async function getInstagramProfile(userId) {
  if (!userId) return {};
  const url = `https://graph.instagram.com/${config.instagramApiVersion}/${userId}?fields=id,username,name`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${config.instagramAccessToken}` } });
  if (!response.ok) return {};
  return response.json();
}

export async function listRecentInstagramComments(limit = 500) {
  if (!config.instagramAccountId) return [];
  const headers = { authorization: `Bearer ${config.instagramAccessToken}` };
  const comments = [];
  let mediaUrl = `https://graph.instagram.com/${config.instagramApiVersion}/${config.instagramAccountId}/media?fields=id&limit=25`;
  while (mediaUrl && comments.length < limit) {
    const mediaResponse = await fetch(mediaUrl, { headers });
    if (!mediaResponse.ok) throw new Error(`Instagram medya listesi alınamadı: ${mediaResponse.status}`);
    const mediaPayload = await mediaResponse.json();
    for (const item of mediaPayload.data || []) {
      let commentsUrl = `https://graph.instagram.com/${config.instagramApiVersion}/${item.id}/comments?fields=id,text,from,timestamp&limit=50`;
      while (commentsUrl && comments.length < limit) {
        const response = await fetch(commentsUrl, { headers });
        if (!response.ok) break;
        const commentPayload = await response.json();
        comments.push(...(commentPayload.data || []));
        commentsUrl = commentPayload.paging?.next || null;
      }
    }
    mediaUrl = mediaPayload.paging?.next || null;
  }
  return comments.slice(0, limit);
}
