const phonePattern = /(?:\+?90\s?)?(?:0\s?)?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/;

export function updateContact(contact, text) {
  const next = { ...contact };
  const phone = text.match(phonePattern)?.[0];
  if (phone) next.phone = phone.replace(/\D/g, '').replace(/^90/, '0').replace(/^5/, '05');

  const nameMatch = text.match(/(?:ad[ıi]m|ismim|ben)\s*(?:=|:|-)?\s*([A-Za-zÇĞİÖŞÜçğıöşü]+(?:\s+[A-Za-zÇĞİÖŞÜçğıöşü]+){1,2})/i);
  if (nameMatch) next.name = nameMatch[1].trim();
  if (!next.name && /^[A-Za-zÇĞİÖŞÜçğıöşü]+\s+[A-Za-zÇĞİÖŞÜçğıöşü]+$/.test(text.trim())) next.name = text.trim();
  return next;
}

export function requestedPhotos(text) {
  return /fotoğraf|fotograf|görsel|gorsel|resim|model.*gör/i.test(text);
}

export function purchaseStage(text) {
  if (/dekont/i.test(text)) return 'receipt_reported';
  if (/iban|havale|eft|ödeme|odeme/i.test(text)) return 'payment_pending';
  if (/sipariş|siparis|almak istiyorum|alıyorum|aliyorum|alacağım|alacagim/i.test(text)) return 'order_intent';
  return null;
}
