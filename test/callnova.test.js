import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCallnovaLead, callnovaReplies, normalizeTurkishMobile, isBudgetAnswer } from '../src/callnova.js';

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

test('bütçe açıklama sorusu telefon adımına geçmez ve yanlış veri saklamaz', () => {
  const conversation = { callnovaLead: { stage: 'budget' } };
  for (const text of ['aylık mı yani nasıl yani', '10 bin yeter mi?', 'Bu ücret size mi ödeniyor?', 'Anlamadım', 'tamam']) {
    const result = advanceCallnovaLead(conversation, text);
    assert.ok(result.reply.length > 0);
    assert.equal(result.completedNow, false);
    assert.equal(conversation.callnovaLead.stage, 'budget');
    assert.equal(conversation.callnovaLead.monthlyAdBudget, undefined);
  }
  assert.match(advanceCallnovaLead(conversation, 'aylık mı yani nasıl yani').reply, /bir ayda/);
  assert.equal(advanceCallnovaLead(conversation, '20 bin TL').reply, callnovaReplies.askPhone);
  assert.equal(conversation.callnovaLead.monthlyAdBudget, '20 bin TL');
});

test('her form adımı araya giren soru ve onaydan sonra aynı bilgiyi bekler', () => {
  for (const stage of ['sector', 'city', 'instagram', 'budget', 'phone']) {
    const conversation = { callnovaLead: { stage } };
    for (const text of ['Neden soruyorsunuz?', 'Nasıl çalışıyorsunuz?', 'Fiyatınız ne kadar?', 'tamam']) {
      assert.ok(advanceCallnovaLead(conversation, text).reply.length > 0);
      assert.deepEqual(conversation.callnovaLead, { stage });
    }
  }
});

test('bütçe cevaplarını sorulardan ve telefon numarasından ayırır', () => {
  for (const text of ['25000', '25.000 TL', '20 bin', 'aylık 10k', 'yirmi bin', 'Henüz belirlemedim', 'Bütçem yok']) {
    assert.equal(isBudgetAnswer(text), true, text);
  }
  for (const text of ['tamam', 'aylık mı', '10 bin uygun mu', 'ne kadar önerirsiniz', '05321112233']) {
    assert.equal(isBudgetAnswer(text), false, text);
  }
  assert.equal(normalizeTurkishMobile('053211122334'), null);
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
