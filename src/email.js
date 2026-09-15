import nodemailer from 'nodemailer';
import { config } from './config.js';

export async function sendDailyReport(report, reportDate) {
  if (!emailNotificationsEnabled()) return 'disabled';
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpAppPassword }
  });
  await transporter.sendMail({
    from: `CallNova Bot <${config.smtpUser}>`,
    to: config.emailNotificationTo.join(', '),
    subject: `CallNova günlük rapor - ${reportDate}`,
    text: [
      `Tarih: ${reportDate}`,
      `Konuşulan kişi: ${report.spokenTo}`,
      `Sıcak müşteri: ${report.hot}`,
      `Soğuk müşteri: ${report.cold}`,
      `Satın alan: ${report.purchased}`,
      `Toplam müşteri mesajı: ${report.messages}`
    ].join('\n')
  });
  return 'sent';
}

export function leadEmailContent(lead) {
  const statusLabels = {
    order_intent: 'Sipariş niyeti',
    payment_pending: 'Ödeme / IBAN talebi',
    receipt_reported: 'Dekont bildirildi'
  };
  return {
    subject: `CallNova satış bildirimi: ${statusLabels[lead.status] || 'Yeni müşteri'}`,
    text: [
      `Durum: ${statusLabels[lead.status] || lead.status || 'Yeni müşteri'}`,
      `Ad soyad: ${lead.name || 'Belirtilmedi'}`,
      `Telefon: ${lead.phone || 'Belirtilmedi'}`,
      `Instagram kullanıcı kimliği: ${lead.instagramUserId}`,
      lead.issue ? `Teyit gereken konu: ${lead.issue}` : '',
      `Kaynak: ${lead.source || 'instagram_dm'}`,
      `Kayıt zamanı: ${lead.createdAt || new Date().toISOString()}`
    ].join('\n')
  };
}

export function emailNotificationsEnabled() {
  return Boolean(config.emailNotificationTo.length && config.smtpHost && config.smtpUser && config.smtpAppPassword);
}

export async function sendLeadNotification(lead) {
  if (!emailNotificationsEnabled()) return 'disabled';
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpAppPassword }
  });
  const content = leadEmailContent(lead);
  await transporter.sendMail({
    from: `CallNova Bot <${config.smtpUser}>`,
    to: config.emailNotificationTo.join(', '),
    ...content
  });
  return 'sent';
}
