# MockupMaker

Ürün, marka, pazar yeri ve renk seçip tasarımı mockup üzerine otomatik yerleştiren bir mockup üretim aracı. React + Vite + Tailwind CSS ile geliştirildi.

## Geliştirme

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Netlify'e deploy

Bu repo Netlify ile doğrudan uyumludur (`netlify.toml` dahil):

- Build command: `npm run build`
- Publish directory: `dist`

Netlify'de "Import from Git" ile bu repoyu bağlamanız yeterli, ayar otomatik algılanır.

Mockup görselleri harici bir R2 (Cloudflare) worker endpoint'inden çekiliyor; `src/App.jsx` içindeki `R2_BASE_URL` sabitini kendi worker adresinizle güncelleyin.
