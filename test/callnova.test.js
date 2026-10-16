import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCallnovaLead, callnovaReplies, normalizeTurkishMobile } from '../src/callnova.js';

test('CallNova lead akışı sektör, şehir, hesap ve telefon sırasını izler', () => {
  const conversation = {};
  assert.equal(advanceCallnovaLead(conversation, 'Bilgi almak istiyorum').reply, callnovaReplies.askSector);
  assert.equal(advanceCallnovaLead(conversation, 'Ayakkabı').reply, callnovaReplies.askCity);
  assert.equal(advanceCallnovaLead(conversation, 'İstanbul').reply, callnovaReplies.askInstagram);
  assert.equal(advanceCallnovaLead(conversation, '@ornekhesap').reply, callnovaReplies.askBudget);
  assert.equal(advanceCallnovaLead(conversation, '25.000 TL').reply, callnovaReplies.askPhone);
  const result = advanceCallnovaLead(conversation, '0532 111 22 33');
  assert.equal(result.reply, callnovaReplies.completed);
  assert.equal(result.completedNow, true);
  assert.equal(conversation.callnovaLead.phone, '05321112233');
  assert.equal(conversation.callnovaLead.monthlyAdBudget, '25.000 TL');
});

test('geçersiz telefon tamamlanmış lead oluşturmaz', () => {
  const conversation = { callnovaLead: { stage: 'phone' } };
  assert.equal(advanceCallnovaLead(conversation, 'Şu an uygun değilim').reply, callnovaReplies.askValidPhone);
  assert.equal(conversation.callnovaLead.stage, 'phone');
});

test('tamamlanan lead yeni kayıt açmadan kısa yanıt verir', () => {
  const conversation = { callnovaLead: { stage: 'completed' } };
  assert.match(advanceCallnovaLead(conversation, 'Teşekkürler').reply, /Rica ederim/);
  const followUp = advanceCallnovaLead(conversation, 'Sağolun ne zaman ulaşır?');
  assert.match(followUp.reply, /kesin bir saat paylaşamıyorum/);
  assert.equal(followUp.completedNow, false);
  assert.match(advanceCallnovaLead(conversation, 'Paket fiyatı nedir?').reply, /Ücret/);
  assert.ok(advanceCallnovaLead(conversation, 'Başka bir sorum var').reply.length > 0);
  assert.equal(normalizeTurkishMobile('+90 532 111 22 33'), '05321112233');
});
