import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseStage, requestedPhotos, updateContact } from '../src/lead.js';
import { leadEmailContent } from '../src/email.js';
import { findSizeSuggestion } from '../src/size.js';

test('fotoğraf isteğini algılar', () => assert.equal(requestedPhotos('Model fotoğraflarını atar mısınız?'), true));
test('isim ve telefonu yakalar', () => {
  const contact = updateContact({}, 'Ben Ayşe Yılmaz, numaram 0532 111 22 33');
  assert.equal(contact.name, 'Ayşe Yılmaz');
  assert.equal(contact.phone, '05321112233');
});
test('yalın ad soyadı, fotoğraf akışında iletişim adı olarak saklanabilir', () => {
  assert.equal(updateContact({}, 'Mehmet Kaya').name, 'Mehmet Kaya');
});
test('ödeme ve dekont aşamalarını algılar', () => {
  assert.equal(purchaseStage('IBAN atar mısınız?'), 'payment_pending');
  assert.equal(purchaseStage('Dekontu gönderdim'), 'receipt_reported');
});
test('ödeme bildirimi e-posta içeriğini oluşturur', () => {
  const email = leadEmailContent({ status: 'payment_pending', name: 'Ayşe Yılmaz', phone: '05321112233', instagramUserId: 'user-1', createdAt: '2026-09-16T00:00:00.000Z' });
  assert.match(email.subject, /Ödeme/);
  assert.match(email.text, /Ayşe Yılmaz/);
});
test('boy ve kilo ile tablodan ölçü önerir', () => {
  assert.deepEqual(findSizeSuggestion('Boyum 165 cm, kilom 70 kg'), { height: 165, weight: 70, size: '6.0 – 6.2' });
});
