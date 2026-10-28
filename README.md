# Seanime Arabic Marketplace

متجر إضافات عربية لتطبيق **[Seanime](https://seanime.app)** — يحتوي على مزوّدي بث مباشر (`onlinestream-provider`) مكتوبة بـ TypeScript وتعمل داخل مُحرّك الإضافات الخاص بـ Seanime (Goja).

> هذا متجر **مجتمعي** مستقل، منفصل عن المتجر الرسمي (`5rahim/seanime-extensions`) الذي لا يحتوي على مزوّدي البث.

---

## التثبيت داخل تطبيق Seanime

1. افتح التطبيق → تبويب **Extensions** (أيقونة البازل) → **Marketplace**.
2. اضغط زر **تغيير رابط المتجر** (URL) والصق الرابط التالي:

   ```
   https://raw.githubusercontent.com/VoltNR7/Seanime-Arabic-Marketplace/main/marketplace.json
   ```

3. ارجع إلى القائمة واضغط **تحديث** — سيظهر المزوّد في القائمة.
4. اضغط **Install** لتثبيته.
5. افتح أي أنمي → تبويب **الحلقات / Episodes** → **البث المباشر (Online Streaming)** → اختر المزوّد → اختر السيرفر → تشغيل.

**على الجوال (Seanime Denshi / الإصدار المنقول):** نفس الخطوات من تبويب الإضافات.

---

## المزوّدون المتاحون

| المزوّد | النوع | اللغة | المصدر |
|---|---|---|---|
| **WitAnime** | `onlinestream-provider` | ar | https://witanime.site |

---

## إضافة مزوّد جديد

كل مزوّد = مجلد داخل `providers/<name>/` يحتوي:

```
providers/<name>/manifest.json   # بيان الإضافة (المعرّف، النوع، رابط الكود)
providers/<name>/main.ts         # كود المزوّد (TypeScript)
```

ثم أضف مدخلاً جديداً في [`marketplace.json`](./marketplace.json):

```json
{
  "id": "my-provider",
  "name": "My Provider",
  "version": "1.0.0",
  "author": "YourName",
  "description": "وصف مختصر",
  "type": "onlinestream-provider",
  "language": "typescript",
  "lang": "ar",
  "icon": "https://example.com/icon.png",
  "manifestURI": "https://raw.githubusercontent.com/<owner>/<repo>/main/providers/my-provider/manifest.json",
  "payloadURI": "https://raw.githubusercontent.com/<owner>/<repo>/main/providers/my-provider/main.ts",
  "website": ""
}
```

### عقد المزوّد (مختصر)

الكود يجب أن يعرّف class عالمية باسم `Provider` وتنفّذ:

```ts
class Provider {
    getSettings(): { episodeServers: string[]; supportsDub: boolean }
    search(opts): Promise<{ id, title, url, subOrDub }[]>
    findEpisodes(id): Promise<{ id, number, url, title? }[]>
    findEpisodeServer(episode, server): Promise<{ server, headers, videoSources }>
}
```

المتاح داخل الكود: `fetch()`، `LoadDoc()` (محدّدات CSS على طراز jQuery)، `$sleep()`، `Buffer`، `crypto`.

---

## المصدر

مزوّد **WitAnime** منقول من مشروع Cloudstream:

- <https://github.com/Abodabodd/re-3arabi> — وحدة `Witanime` (Kotlin / Cloudstream3)
-所有权 / Original authors: Abodabodd وإحدى Contributors

تم تحديثه ليعمل ضمن بنية Seanime الحالية (تصميم الموقع الجديد + واجهة `onlinestream-provider`).

---

## ⚠️ ملاحظات

- المزوّدات تعتمد على مواقع خارجية قد تغيّر تصميمها أو تتوقف — عندها يتعطّل المزوّد مؤقتاً.
- بعض المواقع تفرض حدوداً على عدد الطلبات (rate limit)؛ التقطيع فقط عند أول تشغيل.
- هذا المشروع غير رسمي وغير تابع لـ Seanime.

---

## English

A community marketplace for [Seanime](https://seanime.app) with Arabic online-streaming providers.
Add it inside Seanime: **Extensions → Marketplace → change repository URL** and paste the
`marketplace.json` link above, then install the provider.
