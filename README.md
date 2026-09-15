# Instagram satış botu

CallNova için Instagram DM webhook servisi. Node.js 20+ ile ek bağımlılık gerektirmeden çalışır.

## Davranış

- İlk mesajda karşılama metnini gönderir.
- Bilezik fiyatı, adet indirimi, ödeme, ürün materyali ve site durumu hakkında net cevap verir.
- Bileklik numarasını bilmeyenlerden boy ve kilo alır, ölçü tablosundan tahmini numara önerir ve siparişe yönlendirir.
- Mesajları 10 saniye boyunca biriktirerek tek bir yanıt gönderir; hızlı yazışmalarda spam oluşturmaz.
- Fotoğraf isteyen kişiden ad-soyad ve telefon ister; ikisi tamamlanınca CRM web kancasına gönderir. CRM ayarlı değilse `data/leads.json` içinde güvenli yedek kuyruğa alır.
- Doğrulanmamış işletme bilgisini uydurmaz. Genel konularda OpenAI web aramasıyla araştırır; işletmeye özgü belirsiz konularda ekip dönüşü gerektiğini açıklar.

## Kurulum

1. `.env.example` dosyasını `.env` olarak kopyalayın ve değerleri ekleyin.
2. `npm start` komutunu çalıştırın.
3. Sunucuyu HTTPS ile yayınlayın (ör. alan adınız veya geçici olarak ngrok).
4. Meta Developers panelinde Instagram Messaging webhook callback adresini `https://ALAN_ADINIZ/webhook` yapın; doğrulama anahtarı olarak `META_VERIFY_TOKEN` değerini girin ve `messages` aboneliğini açın.

## Gerekli anahtarlar

- `OPENAI_API_KEY`
- `META_VERIFY_TOKEN` (sizin belirleyeceğiniz uzun rastgele bir metin)
- `META_APP_SECRET`
- Instagram mesajlaşma yetkili `INSTAGRAM_PAGE_ACCESS_TOKEN`
- Instagram Login akışı kullanılıyorsa `INSTAGRAM_ACCOUNT_ID` (profesyonel hesap ID'si)

CRM için hangi sistemi kullanacağınızı söylediğinizde `CRM_WEBHOOK_URL` yerine doğrudan entegrasyon eklenebilir.

Instagram Messaging API, müşterinin önce hesaba mesaj atmış olmasını gerektirir; bot yeni kişilere kendiliğinden ilk DM göndermez.
