import test from 'node:test';
import assert from 'node:assert/strict';
import { toCrmLeadPayload } from '../src/crm.js';

test('CallNova leadini CRM webhook sözleşmesine dönüştürür', () => {
  const payload = toCrmLeadPayload({
    instagramUserId: 'instagram-user',
    instagramUsername: 'ornek',
    phone: '05321112233',
    sector: 'Ayakkabı',
    city: 'İstanbul',
    instagramAccount: 'ornekhesap',
    monthlyAdBudget: '25.000 TL',
    source: 'başka-kaynak',
    createdAt: '2026-10-17T00:00:00.000Z',
    status: 'callnova_lead_ready'
  });
  assert.deepEqual(payload, {
    instagramUserId: 'instagram-user',
    instagramUsername: 'ornek',
    phone: '05321112233',
    sector: 'Ayakkabı',
    city: 'İstanbul',
    instagramAccount: 'ornekhesap',
    monthlyAdBudget: '25.000 TL',
    source: 'callnova_instagram_dm',
    createdAt: '2026-10-17T00:00:00.000Z'
  });
});
