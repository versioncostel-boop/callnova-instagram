const mobilePattern = /(?:\+?90\s?)?(?:0\s?)?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/;

export const callnovaReplies = {
  askSector: 'Merhaba, işletmeniz hangi sektördeydi?',
  askCity: 'Anladım, işletmeniz hangi şehirdeydi?',
  askInstagram: 'Harika, reklamları açacağımız Instagram hesabının adını söyler misiniz?',
  askBudget: 'Aylık reklam bütçeniz nedir?',
  askPhone: 'Tamamdır, telefon numaranızı iletebilir misiniz?',
  askValidPhone: 'Size ulaşabileceğimiz geçerli bir cep telefonu numarası iletebilir misiniz?',
  completed: 'Teşekkür ederim, kaydınızı oluşturdum. Ekip arkadaşımız Rüzgar Bey sizinle iletişime geçerek detayları aktaracak.'
};

export function normalizeTurkishMobile(text) {
  const match = String(text || '').match(mobilePattern)?.[0];
  if (!match) return null;
  let digits = match.replace(/\D/g, '');
  if (digits.startsWith('90')) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith('5')) digits = `0${digits}`;
  return /^05\d{9}$/.test(digits) ? digits : null;
}

export function advanceCallnovaLead(conversation, text) {
  const value = String(text || '').trim();
  const lead = conversation.callnovaLead ||= { stage: 'initial' };

  if (lead.stage === 'completed') return { reply: '', completedNow: false };
  if (lead.stage === 'initial') {
    lead.stage = 'sector';
    return { reply: callnovaReplies.askSector, completedNow: false };
  }
  if (lead.stage === 'sector') {
    lead.sector = value;
    lead.stage = 'city';
    return { reply: callnovaReplies.askCity, completedNow: false };
  }
  if (lead.stage === 'city') {
    lead.city = value;
    lead.stage = 'instagram';
    return { reply: callnovaReplies.askInstagram, completedNow: false };
  }
  if (lead.stage === 'instagram') {
    lead.instagramAccount = value.replace(/^@/, '');
    lead.stage = 'budget';
    return { reply: callnovaReplies.askBudget, completedNow: false };
  }
  if (lead.stage === 'budget') {
    lead.monthlyAdBudget = value;
    lead.stage = 'phone';
    return { reply: callnovaReplies.askPhone, completedNow: false };
  }

  const phone = normalizeTurkishMobile(value);
  if (!phone) return { reply: callnovaReplies.askValidPhone, completedNow: false };
  lead.phone = phone;
  lead.stage = 'completed';
  lead.completedAt = new Date().toISOString();
  return { reply: callnovaReplies.completed, completedNow: true };
}
