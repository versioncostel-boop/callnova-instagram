import process from 'node:process';

export const config = {
  port: Number(process.env.PORT || 3000),
  openAiApiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL || 'gpt-5.6',
  nvidiaApiKey: process.env.NVIDIA_API_KEY,
  nvidiaModel: process.env.NVIDIA_MODEL || 'meta/llama-3.1-8b-instruct',
  metaVerifyToken: process.env.META_VERIFY_TOKEN,
  metaAppSecret: process.env.META_APP_SECRET,
  instagramAccessToken: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN,
  instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID,
  instagramApiVersion: process.env.INSTAGRAM_API_VERSION || 'v24.0',
  crmWebhookUrl: process.env.CRM_WEBHOOK_URL,
  crmWebhookBearerToken: process.env.CRM_WEBHOOK_BEARER_TOKEN,
  emailNotificationTo: (process.env.EMAIL_NOTIFICATION_TO || '').split(',').map((value) => value.trim()).filter(Boolean),
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpSecure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER,
  smtpAppPassword: process.env.SMTP_APP_PASSWORD,
  bankIban: process.env.BANK_IBAN,
  bankAccountName: process.env.BANK_ACCOUNT_NAME
};

export function assertRuntimeConfig() {
  const required = [
    ['OPENAI_API_KEY veya NVIDIA_API_KEY', config.openAiApiKey || config.nvidiaApiKey],
    ['META_VERIFY_TOKEN', config.metaVerifyToken],
    ['META_APP_SECRET', config.metaAppSecret],
    ['INSTAGRAM_PAGE_ACCESS_TOKEN', config.instagramAccessToken]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (required.length) throw new Error(`Eksik ortam değişkenleri: ${required.join(', ')}`);
}
