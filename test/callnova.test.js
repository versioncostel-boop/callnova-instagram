import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCallnovaLead, callnovaReplies, normalizeTurkishMobile } from '../src/callnova.js';

test('CallNova lead akışı sektör, şehir, hesap ve telefon sırasını izler', () => {
  const conversation = {};
  assert.equal(advanceCallnovaLead(conversation, 'Bilgi almak istiyorum').reply, callnovaReplies.askSector);
  assert.equal(advanceCallnovaLead(conversation, 'Ayakkabı').reply, callnovaReplies.askCity);
  assert.equal(advanceCallnovaLead(conversation, 'İstanbul').reply, callnovaReplies.askInstagram);
  assert.equal(advanceCallnovaLead(conversation, '@ornekhesap').reply, callnovaReplies.askPhone);
  const result = advanceCallnovaLead(conversation, '0532 111 22 33');
  assert.equal(result.reply, callnovaReplies.completed);
  assert.equal(result.completedNow, true);
  assert.equal(conversation.callnovaLead.phone, '05321112233');
});

test('geçersiz telefon tamamlanmış lead oluşturmaz', () => {
  const conversation = { callnovaLead: { stage: 'phone' } };
  assert.equal(advanceCallnovaLead(conversation, 'Şu an uygun değilim').reply, callnovaReplies.askValidPhone);
  assert.equal(conversation.callnovaLead.stage, 'phone');
});

test('tamamlanan lead sonraki mesajlara otomatik cevap vermez', () => {
  const conversation = { callnovaLead: { stage: 'completed' } };
  assert.equal(advanceCallnovaLead(conversation, 'Teşekkürler').reply, '');
  assert.equal(normalizeTurkishMobile('+90 532 111 22 33'), '05321112233');
});
