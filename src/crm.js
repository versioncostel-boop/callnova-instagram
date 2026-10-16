import { config } from './config.js';
import { sendLeadNotification } from './email.js';
import { queueLead } from './store.js';

export function toCrmLeadPayload(lead) {
  return {
    instagramUserId: lead.instagramUserId,
    instagramUsername: lead.instagramUsername || '',
    phone: lead.phone,
    sector: lead.sector,
    city: lead.city,
    instagramAccount: lead.instagramAccount,
    monthlyAdBudget: lead.monthlyAdBudget,
    source: 'callnova_instagram_dm',
    createdAt: lead.createdAt
  };
}

export async function saveLead(lead) {
  await queueLead(lead);
  console.log(`CRM kaydı anında yerel kuyruğa düştü: ${lead.instagramUserId}`);
  let destination = 'local-queue';
  if (config.crmWebhookUrl) {
    try {
      const response = await fetch(config.crmWebhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(config.crmWebhookSecret ? { 'x-crm-webhook-secret': config.crmWebhookSecret } : {})
        },
        body: JSON.stringify(toCrmLeadPayload(lead)),
        signal: AbortSignal.timeout(8_000)
      });
      if (!response.ok) throw new Error(`CRM isteği başarısız: ${response.status}`);
      const result = await response.json();
      if (result.ok !== true || !result.leadId) throw new Error('CRM kayıt onayı geçersiz');
      destination = 'crm';
      console.log(`CRM kaydı harici sisteme aktarıldı: ${lead.instagramUserId}`);
    } catch (error) {
      console.error('CRM anlık aktarımı başarısız; lead yerel kuyrukta saklandı:', error.message);
    }
  }
  if (lead.status && lead.status !== 'lead_open') {
    try { await sendLeadNotification(lead); } catch (error) { console.error('E-posta bildirimi gönderilemedi:', error); }
  }
  return destination;
}
