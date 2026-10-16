import { config } from './config.js';
import { sendLeadNotification } from './email.js';
import { queueLead } from './store.js';

export async function saveLead(lead) {
  await queueLead(lead);
  let destination = 'local-queue';
  if (config.crmWebhookUrl) {
    try {
      const response = await fetch(config.crmWebhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(config.crmWebhookBearerToken ? { authorization: `Bearer ${config.crmWebhookBearerToken}` } : {})
        },
        body: JSON.stringify(lead),
        signal: AbortSignal.timeout(8_000)
      });
      if (!response.ok) throw new Error(`CRM isteği başarısız: ${response.status}`);
      destination = 'crm';
    } catch (error) {
      console.error('CRM anlık aktarımı başarısız; lead yerel kuyrukta saklandı:', error.message);
    }
  }
  if (lead.status && lead.status !== 'lead_open') {
    try { await sendLeadNotification(lead); } catch (error) { console.error('E-posta bildirimi gönderilemedi:', error); }
  }
  return destination;
}
