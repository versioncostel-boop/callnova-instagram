import test from 'node:test';
import assert from 'node:assert/strict';
import { createCallnovaTurn, interpretCallnovaMessage, parseDialogue } from '../src/callnova-dialogue.js';
import { callnovaReplies } from '../src/callnova.js';

test('her aşamada gerçek soruyu cevaplayıp aynı eksik bilgiye döner', async () => {
  for (const stage of ['sector', 'city', 'instagram', 'budget', 'phone', 'completed']) {
    const conversation = { callnovaLead:{ stage } };
    const result = await createCallnovaTurn(conversation, 'İçeriklerimi kendim hazırlasam olur mu', {
      interpret:async () => ({ kind:'question', answer:'İçerik hazırlama sorumluluğu hizmet kapsamına göre görüşmede netleştirilir.', answerValue:null })
    });
    assert.match(result.reply, /^İçerik hazırlama/);
    assert.deepEqual(conversation.callnovaLead, { stage });
    assert.equal(result.completedNow, false);
    if (stage === 'budget') assert.match(result.reply, /Aylık reklam bütçeniz nedir/);
  }
});

test('cevap ve soruyu ayrı cümlelerde okuyup doğru adımı korur', async () => {
  const conversation = { callnovaLead:{ stage:'budget' } };
  const interpret = async () => ({ kind:'question', answer:'Sözleşme koşulları görüşmede netleşir.', answerValue:'Bütçem 20 bin' });
  const result = await createCallnovaTurn(conversation, 'Bütçem 20 bin. Sözleşme var mı?', { interpret });
  assert.equal(conversation.callnovaLead.monthlyAdBudget, 'Bütçem 20 bin');
  assert.equal(conversation.callnovaLead.stage, 'phone');
  assert.match(result.reply, /Sözleşme.*telefon/s);
});

test('model bütçe önerisi sorusundan tutar çıkarsa bile form ilerlemez', async () => {
  const conversation = { callnovaLead:{ stage:'budget' } };
  const result = await createCallnovaTurn(conversation, '20 bin yeter mi?', {
    interpret:async () => ({ kind:'question', answer:'Uygun bütçe hedeflerinize göre belirlenir.', answerValue:'20 bin' })
  });
  assert.equal(conversation.callnovaLead.stage, 'budget');
  assert.equal(conversation.callnovaLead.monthlyAdBudget, undefined);
  assert.match(result.reply, /Uygun bütçe.*Aylık/s);
});

test('model hatasında müşteriye yanıt verir ve açıklamayı veri kaydetmez', async () => {
  const conversation = { callnovaLead:{ stage:'budget' } };
  const result = await createCallnovaTurn(conversation, 'aylık mı yani nasıl yani', { interpret:async () => { throw new Error('timeout'); } });
  assert.match(result.reply, /bir ayda/);
  assert.deepEqual(conversation.callnovaLead, { stage:'budget' });
});

test('telefon doğrudan doğrulanır ve modele gönderilmez', async () => {
  const conversation = { callnovaLead:{ stage:'phone' } };
  const result = await createCallnovaTurn(conversation, '05321112233', { interpret:async () => { assert.fail('Phone sent to model'); } });
  assert.equal(result.reply, callnovaReplies.completed);
  assert.equal(result.completedNow, true);
});

test('telefon paylaşmak istemeyen müşteriye tekrar numara dayatmaz', async () => {
  const conversation = { callnovaLead:{ stage:'phone' } };
  const result = await createCallnovaTurn(conversation, 'Telefon vermeden buradan konuşsak', {
    interpret:async () => ({kind:'question', answer:'Dilerseniz buradan da bilgi alabilirsiniz.', answerValue:null})
  });
  assert.doesNotMatch(result.reply, /telefon numaranızı/);
  assert.equal(conversation.callnovaLead.stage, 'phone');
  assert.equal(conversation.callnovaLead.contactPreference, 'text');
  const later = await createCallnovaTurn(conversation, 'Sözleşmeniz var mı?', {
    interpret:async () => ({kind:'question', answer:'Sözleşme koşulları görüşmede netleşir.', answerValue:null})
  });
  assert.doesNotMatch(later.reply, /telefon numaranızı/);
});

test('model taşıması bağlamı kullanır, telefonları gizler ve store false gönderir', async () => {
  const conversation = { callnovaLead:{ stage:'phone' }, messages:[{role:'user',text:'05321112233'}] };
  const result = await interpretCallnovaMessage(conversation, 'Neden telefon gerekiyor?', {
    settings:{geminiApiKey:'test-secret',geminiModel:'configured-model'},
    fetchImpl:async (url, request) => {
      const body = JSON.parse(request.body);
      assert.equal(body.store, false);
      assert.equal(body.model, 'configured-model');
      assert.doesNotMatch(body.input, /05321112233/);
      assert.match(body.input, /\[telefon\]/);
      return { ok:true, json:async () => ({ steps:[{type:'model_output',content:[{text:JSON.stringify({kind:'question',answer:'Görüşme için size ulaşabilmek amacıyla isteniyor.',answerValue:null})}]}] }) };
    }
  });
  assert.match(result.answer, /Görüşme/);
});

test('bozuk veya ilgisiz model cevabı kabul edilmez', () => {
  assert.equal(parseDialogue('not json', 'soru'), null);
  assert.equal(parseDialogue(JSON.stringify({kind:'question',answer:'Shopier mağazamızdan alın.'}), 'soru'), null);
  assert.equal(parseDialogue(JSON.stringify({kind:'question',answer:'Bütçeniz nedir?'}), 'soru'), null);
  assert.equal(parseDialogue(JSON.stringify({kind:'question',answer:'Detaylar görüşmede netleşir.',answerValue:'uydurulan değer'}), 'soru').answerValue, null);
});
