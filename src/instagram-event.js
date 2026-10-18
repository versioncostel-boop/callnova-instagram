// Instagram ad icebreakers arrive as postbacks, not necessarily message.text.
export function normalizeInstagramEvent(event = {}) {
  const value = event.value || event;
  const message = event.message || value.message || {};
  const postback = event.postback || value.postback;
  const text = message.text || postback?.title;
  return {
    senderId: event.sender?.id || value.sender?.id || value.from?.id || value.sender_id,
    messageId: message.mid || message.id || postback?.mid || event.message_id || value.message_id,
    text: typeof text === 'string' ? text.trim() : '',
    isEcho: Boolean(event.is_echo || value.is_echo || message.is_echo),
    kind: postback ? 'postback' : message.text ? 'text' : 'non-text'
  };
}
