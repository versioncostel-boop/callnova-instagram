import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInstagramEvent } from '../src/instagram-event.js';

test('normal DM and quick reply retain customer text and unique message id', () => {
  assert.deepEqual(normalizeInstagramEvent({sender:{id:'customer'},message:{mid:'m1',text:' Merhaba ',quick_reply:{payload:'hello'}}}),
    {senderId:'customer',messageId:'m1',text:'Merhaba',isEcho:false,kind:'text'});
});
test('ad icebreaker postback title becomes a customer turn', () => {
  const result = normalizeInstagramEvent({sender:{id:'customer'},postback:{mid:'p1',title:'Sizinle nasıl çalışabiliriz?',payload:'START'}});
  assert.equal(result.text,'Sizinle nasıl çalışabiliriz?');
  assert.equal(result.messageId,'p1');
  assert.equal(result.kind,'postback');
});
test('changes envelope supports messages and postbacks', () => {
  assert.equal(normalizeInstagramEvent({value:{sender:{id:'customer'},postback:{title:'Bilgi al'}}}).text,'Bilgi al');
  assert.equal(normalizeInstagramEvent({value:{from:{id:'customer'},message:{text:'İzmir'}}}).senderId,'customer');
});
test('receipts, attachments and opaque payloads do not invent customer text', () => {
  assert.equal(normalizeInstagramEvent({sender:{id:'customer'},read:{mid:'m1'}}).text,'');
  assert.equal(normalizeInstagramEvent({message:{attachments:[{}]}}).text,'');
  assert.equal(normalizeInstagramEvent({postback:{payload:'OPAQUE_ID'}}).text,'');
});
test('outbound echo flag is preserved to avoid replying to ourselves', () => {
  assert.equal(normalizeInstagramEvent({message:{text:'hello',is_echo:true}}).isEcho,true);
});
