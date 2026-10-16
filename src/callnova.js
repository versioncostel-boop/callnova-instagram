const mobilePattern = /(?<!\d)(?:\+?90\s?)?(?:0\s?)?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/;

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

  if (lead.stage === 'completed') return { reply: callnovaFollowUp(value), completedNow: false };
  if (lead.stage === 'initial') {
    lead.stage = 'sector';
    return { reply: callnovaReplies.askSector, completedNow: false };
  }
  const clarification = intakeClarification(lead.stage, value);
  if (clarification) return { reply: clarification, completedNow: false };
  if (/^(tamam|ok|peki|evet|hayır|hayir|merhaba|selam|sağol|sagol|teşekkürler|tesekkurler)[.!\s]*$/iu.test(value)) {
    return { reply: stagePrompt(lead.stage), completedNow: false };
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
    const account = value.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{1,30})(?:[/?#]|$)/)?.[1]
      || value.match(/(?:^|\s)@([a-zA-Z0-9_.]{1,30})(?=\s|$)/)?.[1]
      || (/^[a-zA-Z0-9_.]{1,30}$/.test(value) ? value : null);
    if (!account) return { reply: 'İşletmenizin Instagram kullanıcı adını @hesapadi şeklinde paylaşabilir misiniz?', completedNow: false };
    lead.instagramAccount = account;
    lead.stage = 'budget';
    return { reply: callnovaReplies.askBudget, completedNow: false };
  }
  if (lead.stage === 'budget') {
    if (!isBudgetAnswer(value)) return { reply: 'Reklamlara ayda ayırmayı düşündüğünüz yaklaşık tutar nedir? Henüz belirlemediyseniz bunu da söyleyebilirsiniz.', completedNow: false };
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

function normalized(text) {
  return text.toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, char => ({ ç:'c', ğ:'g', ı:'i', ö:'o', ş:'s', ü:'u' })[char]);
}

function stagePrompt(stage) {
  return ({ sector:callnovaReplies.askSector, city:callnovaReplies.askCity,
    instagram:callnovaReplies.askInstagram, budget:callnovaReplies.askBudget, phone:callnovaReplies.askPhone })[stage];
}

function isQuestion(text) {
  const value = normalized(text);
  return /\?|\b(nasil|neden|niye|nedir|neydi|neyi|nere|hangi|kac|ne zaman|ne kadar|ne demek|ne icin|ne ise|anlamadim|anlayamadim|aciklar|anlatir|yani nasil)\b/.test(value)
    || /\b(mi|mu|midir|mudur|misiniz|musunuz|miyiz|muyuz)\b/.test(value);
}

export function isBudgetAnswer(text) {
  if (isQuestion(text) || normalizeTurkishMobile(text)) return false;
  const value = normalized(text).trim();
  if (/^(henuz\s+)?(belirlemedim|belirlemedik|belli degil|karar vermedim|bilmiyorum|butcem yok|butce yok|sifir)([.!\s]*)$/.test(value)) return true;
  if (/^\d+(?:[.,]\d+)*(?:\s*[-–]\s*\d+(?:[.,]\d+)*)?$/.test(value)) return value.replace(/\D/g, '').length <= 9;
  return /\b\d+(?:[.,]\d+)*\s*(bin|milyon|k|tl|lira|₺|dolar|euro|usd|eur)\b/.test(value)
    || /\b(on|yirmi|otuz|kirk|elli|altmis|yetmis|seksen|doksan|yuz|iki yuz|uc yuz)\s+(bin|milyon)\b/.test(value);
}

function intakeClarification(stage, text) {
  if (!isQuestion(text)) return '';
  const value = normalized(text);
  if (stage === 'budget' && /aylik|gunluk|butce|nasil|anlama|ne demek|neyi|ne kadar|mi\b/.test(value)) {
    return 'Evet, reklamlar için bir ayda ayırmayı düşündüğünüz yaklaşık tutarı soruyorum. Aylık ne kadar düşünüyorsunuz?';
  }
  if (/bot|yapay zek|robot/.test(value)) return `Ben CallNova’nın otomatik asistanıyım. ${stagePrompt(stage)}`;
  if (/fiyat|ucret|paket/.test(value)) return `Hizmet ücretini Rüzgar Bey ihtiyacınıza göre netleştirecek. ${stagePrompt(stage)}`;
  if (/ne zaman|kacta|ulas|donus/.test(value)) return `Görüşme için kesin saat paylaşamıyorum; bilgileriniz tamamlanınca Rüzgar Bey iletişime geçecek. ${stagePrompt(stage)}`;
  if (/nasil calis|nasil hizmet|ne yapi|ne hizmet|calisma sekli/.test(value)) return `İşletmenizin reklam ihtiyacını öğrenip görüşme için bilgilerinizi alıyoruz. ${stagePrompt(stage)}`;
  const explanations = {
    sector: 'İşletmenizin ne iş yaptığını soruyorum; örneğin restoran veya giyim. Sektörünüz nedir?',
    city: 'İşletmenizin bulunduğu şehri soruyorum. Hangi şehirdesiniz?',
    instagram: 'Reklam hizmeti almak istediğiniz işletmenin Instagram kullanıcı adını soruyorum. Hesap adı nedir?',
    budget: 'Reklamlara ayda ayırmayı düşündüğünüz yaklaşık tutarı soruyorum. Aylık bütçeniz nedir?',
    phone: 'Rüzgar Bey’in size ulaşabilmesi için telefonunuzu istiyorum. Numaranızı paylaşabilir misiniz?'
  };
  if (/nasil|neden|niye|nedir|neyi|anlamadim|anlayamadim|aciklar|anlatir|hangi|ne demek|ne icin/.test(value)) return explanations[stage];
  return `Bu detayları Rüzgar Bey görüşmede netleştirebilir. ${stagePrompt(stage)}`;
}

export function callnovaFollowUp(text) {
  const value = text.toLocaleLowerCase('tr-TR');
  if (/ne zaman|kaçta|kacta|ne kadar sür|bugün|bugun|yarın|yarin|ulaş|ulas|ara(?:r|yacak|ma)|dönüş|donus/.test(value)) {
    return 'Rüzgar Bey müsait olduğunda sizinle iletişime geçecek. Şu an kesin bir saat paylaşamıyorum.';
  }
  if (/fiyat|ücret|ucret|paket|ne kadar|kaç tl|kac tl/.test(value)) {
    return 'Ücret ve hizmet detaylarını Rüzgar Bey görüşmede işletmenizin ihtiyacına göre paylaşacak.';
  }
  if (/bot|yapay zek|robot/.test(value)) {
    return 'Ben CallNova’nın otomatik asistanıyım. Rüzgar Bey görüşmede size yardımcı olacak.';
  }
  if (/teşekkür|tesekkur|sağ\s*ol|sag\s*ol|kolay gelsin/.test(value) && !/[?]|nasıl|nasil|neden|hangi/.test(value)) {
    return 'Rica ederim, iyi günler dilerim 😊';
  }
  return 'Bu konunun detayını Rüzgar Bey görüşmede netleştirebilir. Eklemek istediğiniz bilgiyi buradan yazabilirsiniz.';
}
