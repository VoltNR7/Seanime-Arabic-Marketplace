# WitAnime — Seanime onlinestream provider

مزوّد بث مباشر من موقع [witanime.site](https://witanime.site) لتطبيق [Seanime](https://seanime.app).

- **النوع:** `onlinestream-provider`
- **اللغة:** عربية (ترجمة)
- **المصدر:** منقول من وحدة `Witanime` في [Abodabodd/re-3arabi](https://github.com/Abodabodd/re-3arabi) (Cloudstream3 / Kotlin)

## ما الذي يعمل

| الخطوة | الحالة |
|---|---|
| البحث عن أنمي في الموقع | ✅ |
| جلب قائمة الحلقات | ✅ (مثال: Naruto Shippuden — 500 حلقة) |
| جلب قائمة السيرفرات (مشاهدة/تنزيل) | ✅ (`POST /watch/{slug}/{ep}/sources`) |
| تحويل السيرفر إلى رابط فيديو | ⚠️ يعتمد على بوابة الموقع `stream-gate` التي قد ترفض الطلبات غير المتصفّح |

## التثبيت

من داخل Seanime: **Extensions → Marketplace** → أضف رابط المتجر:
`https://raw.githubusercontent.com/VoltNR7/Seanime-Arabic-Marketplace/main/marketplace.json`
ثم ثبّت **WitAnime**.

## English

Arabic streaming provider for Seanime, ported from the Cloudstream `Witanime` module.
Search and episode listing work against the live site; final stream resolution depends on
the site's `stream-gate` endpoint accepting the request.
