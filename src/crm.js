import { config } from './config.js';
import { sendLeadNotification } from './email.js';
import { queueLead } from './store.js';

export async function saveLead(lead) {
  let destination;
  if (config.crmWebhookUrl) {
    const response = await fetch(config.crmWebhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.crmWebhookBearerToken ? { authorization: `Bearer ${config.crmWebhookBearerToken}` } : {})
      },
      body: JSON.stringify(lead)
    });
    if (!response.ok) throw new Error(`CRM isteği başarısız: ${response.status}`);
    destination = 'crm';
  } else {
    await queueLead(lead);
    destination = 'local-queue';
  }
  if (lead.status && lead.status !== 'lead_open') {
    try { await sendLeadNotification(lead); } catch (error) { console.error('E-posta bildirimi gönderilemedi:', error); }
  }
  return destination;
}
