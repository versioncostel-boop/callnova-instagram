import { salesInstructions } from './knowledge.js';
import { config } from './config.js';

function extractOutputText(payload) {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function fallbackReply(messages) {
  const text = messages.at(-1)?.text?.trim().toLocaleLowerCase('tr-TR') || '';
  if (/^(selam|slm|merhaba|sa|selamlar|hey)[!?. ]*$/.test(text)) {
    return 'Merhabalar, bileziklerimizde tek adet fiyatı 450 TL’dir efendim. ✨';
  }
  if (/teşekkür|tesekkur|sağ ol|sag ol/.test(text)) {
    return 'Rica ederiz, başka bir sorunuz olursa yardımcı olmaktan memnuniyet duyarız. ✨';
  }
  if (/fiyat|kaç tl|ne kadar|ücret/.test(text)) {
    return 'Tek adet fiyatımız 450 TL’dir efendim. ✨';
  }
  if (/kargo|teslimat|gönderim|gonderim/.test(text)) {
    return '1.500 TL üzeri alışverişlerde kargo ücretsizdir, altındaki siparişlerde kargo bedeli 135 TL’dir. 📦';
  }
  if (/adet|tane|5 li|10 lu|indirim/.test(text)) {
    return 'Her bileziğimiz 450 TL’dir, 5 adet ve üzeri siparişlerde %10, 10 adet ve üzeri siparişlerde %15 indirim uygulanır. ✨';
  }
  if (/sol|karar|renk|paslan|çelik|celik|kalite/.test(text)) {
    return 'Efendim ürünlerimiz kendi üretimimizdir; 22 ayar altın kaplama ve paslanmaz çelik altyapı kullanıyoruz. ✨ Günlük kullanıma dayanıklıdır, kararma, solma veya boya atması yapmaz. ✨ Görünüm olarak gerçek altından gözle ayırt edilmesi çok zordur; net ayrım profesyonel testle yapılır, ürünümüzün altın kaplama olduğunu şeffafça belirtiyoruz. ✨';
  }
  if (/ödeme|odeme|kapıda|kapida|kart|nakit|iban|havale|eft/.test(text)) {
    return 'Kapıda kart, kapıda nakit ve havale/EFT ile ödeme seçeneklerimiz mevcuttur. 💳';
  }
  if (/ölçü|olcu|beden|numara/.test(text)) {
    return 'Her ölçümüz mevcuttur efendim, en uygun seçim için boyunuzu ve kilonuzu yazarsanız tahmini yönlendirme yapabiliriz. 📏';
  }
  if (/fotoğraf|fotograf|görsel|gorsel|resim/.test(text)) {
    return 'Görselleri WhatsApp üzerinden iletebilmemiz için ad soyad ve telefon numaranızı paylaşabilir misiniz? 📷';
  }
  if (/site|web|internet/.test(text)) {
    return 'Web sitemiz şu anda tadilatta, yarın sabah yeniden yayında olacaktır. 🌐';
  }
  if (/mağaza|magaza|showroom|adres|nerede/.test(text)) {
    return 'Fiziksel mağazamız yoktur, üretim depo ve showroomumuz bulunur; satışlarımız yalnızca internet üzerindendir. 🛍️';
  }
  if (/kolye|küpe|kupe|yüzük|yuzuk|başka ürün|baska urun/.test(text)) {
    return 'Yalnızca sayfamızda yer alan bilezik modellerimiz mevcuttur efendim. ✨';
  }
  return 'Merhabalar, size bileziklerimiz hakkında nasıl yardımcı olabiliriz efendim? ✨';
}

export async function createReply(messages, photoRequested, contact, sizeSuggestion) {
  const customerContext = photoRequested
    ? `Müşteri görsel istedi. Kaydedilmiş iletişim: ad=${contact.name || 'yok'}, telefon=${contact.phone || 'yok'}.`
    : '';
  const sizeContext = sizeSuggestion
    ? `Müşteri ${sizeSuggestion.height} cm ve ${sizeSuggestion.weight} kg belirtti. Tabloya göre önerilen bileklik ölçüsü: ${sizeSuggestion.size}.`
    : '';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openAiApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.openAiModel,
      store: false,
      reasoning: { effort: 'low' },
      instructions: `${salesInstructions(config.bankIban, config.bankAccountName)}\n${customerContext}\n${sizeContext}`,
      tools: [{ type: 'web_search' }],
      input: messages.map((message) => ({ role: message.role, content: message.text }))
    })
  });
  if (!response.ok) throw new Error(`OpenAI isteği başarısız: ${response.status}`);
  const payload = await response.json();
  return extractOutputText(payload) || fallbackReply(messages);
}
