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

function extractChatCompletionText(payload) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((part) => part.text || '').join('\n').trim();
  return '';
}

function extractGeminiText(payload) {
  return (payload.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
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
    return 'Elbette efendim, hangi modeli incelemek istediğinizi yazarsanız detaylı fotoğraf konusunda yardımcı olalım. 📷';
  }
  if (/site|web|internet/.test(text)) {
    return 'Web sitemiz şu anda tadilatta, yarın sabah yeniden yayında olacaktır. 🌐';
  }
  if (/mağaza|magaza|showroom|adres|nerede|neredesiniz|işletme.*yer|isletme.*yer|işletme.*konum|isletme.*konum|fiziksel.*yer|fiziksel.*konum|ziyaret/.test(text)) {
    return 'Fiziksel mağazamız yoktur, üretim depo ve showroomumuz bulunur; satışlarımız yalnızca internet üzerindendir. 🛍️';
  }
  if (/kolye|küpe|kupe|yüzük|yuzuk|başka ürün|baska urun/.test(text)) {
    return 'Yalnızca sayfamızda yer alan bilezik modellerimiz mevcuttur efendim. ✨';
  }
  return 'Merhabalar, size bileziklerimiz hakkında nasıl yardımcı olabiliriz efendim? ✨';
}

function contextFor(photoRequested, contact, sizeSuggestion) {
  const customerContext = photoRequested
    ? `Müşteri görsel istedi. Kaydedilmiş iletişim: ad=${contact.name || 'yok'}, telefon=${contact.phone || 'yok'}.`
    : '';
  const sizeContext = sizeSuggestion
    ? `Müşteri ${sizeSuggestion.height} cm ve ${sizeSuggestion.weight} kg belirtti. Tabloya göre önerilen bileklik ölçüsü: ${sizeSuggestion.size}.`
    : '';
  return `${salesInstructions(config.bankIban, config.bankAccountName)}\n${customerContext}\n${sizeContext}`;
}

async function createNvidiaReply(messages, instructions) {
  const isLightning = config.nvidiaModel === 'nvidia/nemotron-3.5-lightning-30b-a3b';
  let response;
  try {
    response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.nvidiaApiKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model: config.nvidiaModel,
        temperature: 0.25,
        max_tokens: isLightning ? 110 : 140,
        ...(isLightning ? {
          reasoning_budget: 128,
          chat_template_kwargs: { enable_thinking: true }
        } : {}),
        messages: [
          { role: 'system', content: instructions },
          ...messages.map((message) => ({ role: message.role, content: message.text }))
        ]
      })
    });
  } catch (error) {
    console.error(`NVIDIA NIM isteği zaman aşımına uğradı veya bağlanamadı: ${error.message}`);
    return '';
  }
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error(`NVIDIA NIM isteği başarısız: ${response.status} ${errorBody.slice(0, 300)}`);
    return '';
  }
  return extractChatCompletionText(await response.json());
}

async function createGroqReply(messages, instructions) {
  let response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.groqApiKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        model: config.groqModel,
        temperature: 0.25,
        max_completion_tokens: 140,
        messages: [
          { role: 'system', content: instructions },
          ...messages.map((message) => ({ role: message.role, content: message.text }))
        ]
      })
    });
  } catch (error) {
    console.error(`Groq isteği zaman aşımına uğradı veya bağlanamadı: ${error.message}`);
    return '';
  }
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error(`Groq isteği başarısız: ${response.status} ${errorBody.slice(0, 300)}`);
    return '';
  }
  return extractChatCompletionText(await response.json());
}

async function createGeminiReply(messages, instructions, model = config.geminiModel) {
  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': config.geminiApiKey, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.text }]
        })),
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 140,
          thinkingConfig: { thinkingLevel: 'low' }
        }
      })
    });
  } catch (error) {
    console.error(`Gemini isteği zaman aşımına uğradı veya bağlanamadı: ${error.message}`);
    return '';
  }
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error(`Gemini isteği başarısız: ${response.status} ${errorBody.slice(0, 300)}`);
    return '';
  }
  return extractGeminiText(await response.json());
}

export async function createReply(messages, photoRequested, contact, sizeSuggestion) {
  const instructions = contextFor(photoRequested, contact, sizeSuggestion);
  if (config.geminiApiKey) {
    const geminiReply = await createGeminiReply(messages, instructions);
    if (geminiReply) return geminiReply;
    if (config.geminiModel !== 'gemini-2.5-flash-lite') {
      const liteReply = await createGeminiReply(messages, instructions, 'gemini-2.5-flash-lite');
      if (liteReply) return liteReply;
    }
    return fallbackReply(messages);
  }
  if (config.groqApiKey) {
    const groqReply = await createGroqReply(messages, instructions);
    return groqReply || fallbackReply(messages);
  }
  if (config.nvidiaApiKey) {
    const nvidiaReply = await createNvidiaReply(messages, instructions);
    return nvidiaReply || fallbackReply(messages);
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.openAiApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.openAiModel,
      store: false,
      reasoning: { effort: 'low' },
      instructions,
      tools: [{ type: 'web_search' }],
      input: messages.map((message) => ({ role: message.role, content: message.text }))
    })
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error(`OpenAI isteği başarısız: ${response.status} ${errorBody.slice(0, 300)}`);
    return fallbackReply(messages);
  }
  const payload = await response.json();
  return extractOutputText(payload) || fallbackReply(messages);
}
