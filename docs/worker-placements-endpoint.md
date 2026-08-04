# R2 Worker: `/placements` endpoint

MockupMaker artık her mockup fotoğrafı için kalibre edilen tasarım yerleşimini
(sürükle/bırak ile ayarlanan konum) kalıcı olarak saklamak istiyor. Bunun için
mevcut Cloudflare Worker'ına (`wispy-mountain-cee5...workers.dev`) iki yeni
route eklemen gerekiyor. Worker'ın kaynak kodu bu repoda değil, senin ayrı
Cloudflare projende olduğu için bu dosya sadece **referans** — aşağıdaki
mantığı kendi worker koduna (mevcut `/mockup/<key>` ve `/list` route'larının
yanına) eklemen gerekiyor.

## Ne yapması gerekiyor

- **`GET /placements`** → R2 bucket'ında `_placements.json` adlı (gizli,
  görsellerin arasına karışmayan) bir dosya varsa içeriğini JSON olarak
  döndürür. Yoksa `{}` döner.
- **`PUT /placements`** → İstek gövdesindeki JSON'ı olduğu gibi
  `_placements.json` anahtarıyla R2'ye yazar (üzerine yazar).
- Her iki route da mevcut `/mockup` ve `/list` route'larınla aynı CORS
  başlıklarını (`access-control-allow-origin: *`) döndürmeli. `PUT` bir
  "simple request" olmadığı için tarayıcı önce bir `OPTIONS` preflight isteği
  gönderir — worker'ın buna da doğru CORS başlıklarıyla cevap vermesi şart,
  yoksa kayıt sessizce başarısız olur.

## Örnek kod

Worker'ının R2 bucket binding adı ne ise (`env.<BINDING_ADI>`) onu kullan —
aşağıda `env.MOCKUPS_BUCKET` yazdım, kendi binding adınla değiştir.

```js
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
  "access-control-allow-headers": "Content-Type",
};

async function handlePlacements(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const PLACEMENTS_KEY = "_placements.json";

  if (request.method === "GET") {
    const obj = await env.MOCKUPS_BUCKET.get(PLACEMENTS_KEY);
    const body = obj ? await obj.text() : "{}";
    return new Response(body, {
      headers: { "content-type": "application/json", ...CORS_HEADERS },
    });
  }

  if (request.method === "PUT") {
    let data;
    try {
      data = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS });
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return new Response("Expected a JSON object", { status: 400, headers: CORS_HEADERS });
    }
    await env.MOCKUPS_BUCKET.put(PLACEMENTS_KEY, JSON.stringify(data), {
      httpMetadata: { contentType: "application/json" },
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", ...CORS_HEADERS },
    });
  }

  return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
}
```

Bunu mevcut worker'ının route dağıtım mantığına (muhtemelen bir
`if (url.pathname === "/list") {...}` bloğunun yanına) şöyle bağla:

```js
if (url.pathname === "/placements") {
  return handlePlacements(request, env);
}
```

## Test etmek için

Deploy ettikten sonra:

```bash
curl https://wispy-mountain-cee5.zafer-yildiz4101.workers.dev/placements
# → {}  (henüz hiç kayıt yoksa)

curl -X PUT https://wispy-mountain-cee5.zafer-yildiz4101.workers.dev/placements \
  -H "Content-Type: application/json" \
  -d '{"test.png": {"left": 30, "top": 30, "width": 30, "height": 30, "opacity": 100}}'
# → {"ok": true}

curl https://wispy-mountain-cee5.zafer-yildiz4101.workers.dev/placements
# → {"test.png": {...}}
```

Bu endpoint'i eklemeden önce (veya deploy tamamlanana kadar) uygulama
tarafında bir sorun olmaz — okuma/yazma başarısız olursa yerleşim sadece o
tarayıcı oturumunda geçerli olmaya devam eder, sayfa çalışmaya devam eder.
