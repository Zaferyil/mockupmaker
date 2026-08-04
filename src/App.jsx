import { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import {
  Check,
  Shirt,
  Globe,
  ChevronUp,
  X,
  Upload,
  Download,
  ImageOff,
  Sparkles,
  Move,
} from "lucide-react";

// ============================================================
// Design tokens: coral / teal / violet / yellow
// ============================================================
const ACCENT = {
  coral: "#FF5A36",
  teal: "#00C2A8",
  violet: "#7B61FF",
  yellow: "#FFC93C",
};

// R2 Worker'ın "mockup" endpoint tabanı buraya girilecek, örn:
// "https://sezalab-mockup-upload.<hesap>.workers.dev/mockup"
// Mockuplar bu adresten anahtar (dosya adı) ile otomatik çekilir.
const R2_BASE_URL = "https://wispy-mountain-cee5.zafer-yildiz4101.workers.dev/mockup";
// Worker'ın bucket'taki tüm dosya adlarını JSON dizi olarak döndüren endpoint'i.
const R2_LIST_URL = R2_BASE_URL ? `${new URL(R2_BASE_URL).origin}/list` : null;

function mockupSrcFor(key) {
  if (!R2_BASE_URL) return null;
  return `${R2_BASE_URL}/${encodeURIComponent(key)}`;
}

// Dosya adını "{Brand-Slug}_{Renk}_{Ürün}[_White-BG].png" kalıbından geri çözer.
function parseMockupKey(key) {
  const parts = key.replace(/\.png$/i, "").split("_");
  let isAmazon = false;
  if (parts[parts.length - 1] === "White-BG") {
    isAmazon = true;
    parts.pop();
  }
  if (parts.length !== 3) return null;
  const [brandSlug, color, productLabel] = parts;
  const brand = BRANDS.find((b) => b.label.replace(/\s+/g, "-") === brandSlug);
  const productId = Object.keys(PRODUCT_FILE_LABELS).find((id) => PRODUCT_FILE_LABELS[id] === productLabel);
  if (!brand || !productId) return null;
  return { key, brandId: brand.id, color, productId, marketplace: isAmazon ? "amazon" : "etsy" };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- i18n ----
const LANGS = [
  { id: "tr", label: "TR" },
  { id: "de", label: "DE" },
  { id: "en", label: "EN" },
];

const T = {
  tr: {
    brand: "SeZaLab",
    title: "Mockup Seçim Fişi",
    subtitle: "Ürün, marka, pazar yeri ve rengi seç — mockup dosya adı otomatik oluşsun",
    step1: "Ürün Tipi",
    step2: "Blank Marka",
    step3: "Pazar Yeri",
    step4: "Renk",
    step5: "Tasarım & Yerleşim",
    amazonWarning: "Amazon seçildi → sadece beyaz arka planlı mockuplar kullanılır",
    chooseBrandFirst: "Önce blank marka ve ürün tipi seç",
    noColorsYet: "Bu kombinasyon için R2'de henüz mockup yok",
    r2Loading: "R2'deki mockuplar taranıyor…",
    r2ListError: "R2 mockup listesi alınamadı — tüm renkler gösteriliyor, bazıları mevcut olmayabilir.",
    chooseTemplate: "Şablon Seç",
    chooseTemplateHint: "R2'deki hazır mockuplardan göz atarak hızlıca başla (opsiyonel)",
    colorsAvailable: "renk mevcut",
    templatesEmpty: "R2'de henüz hiç mockup yok",
    dockLabel: "Aranacak Mockup",
    dockEmpty: "Tüm alanları doldurunca dosya adları burada oluşur",
    ready: "hazır",
    finishSelectionFirst: "Önce ürün, marka, pazar yeri ve en az bir renk seç",
    uploadDesign: "Tasarımı Yükle",
    changeDesign: "Tasarımı Değiştir",
    uploadDesignHint: "Şeffaf arka planlı PNG önerilir",
    dragHint: "Tasarımı sürükleyerek konumlandır, alt-sağ köşeden tutup boyutlandır",
    printArea: "Baskı Alanı",
    opacity: "Opaklık",
    download: "İndir",
    downloadAll: "Tümünü İndir",
    mockupMissing: "R2'de bulunamadı",
    r2NotConfigured: "R2 bağlantısı henüz kurulmadı — mockuplar depodan otomatik gelemiyor. Worker adresini R2_BASE_URL'e girince, seçtiğin her renk için mockup otomatik yüklenecek.",
    generateMockups: "Mockupları Oluştur",
    results: "Sonuçlar",
    missingCount: "eksik mockup",
    referencePlaceholder: "Önizleme — gerçek mockup R2 bağlanınca burada görünecek",
    products: { tshirt: "Tişört", sweatshirt: "Sweatshirt", hoody: "Hoody" },
    marketplaces: { amazon: "Amazon", etsy: "Etsy" },
  },
  de: {
    brand: "SeZaLab",
    title: "Mockup Auswahlbeleg",
    subtitle: "Produkt, Marke, Marktplatz und Farbe wählen — der Dateiname entsteht automatisch",
    step1: "Produkttyp",
    step2: "Blank-Marke",
    step3: "Marktplatz",
    step4: "Farbe",
    step5: "Design & Platzierung",
    amazonWarning: "Amazon gewählt → es werden nur Mockups mit weißem Hintergrund verwendet",
    chooseBrandFirst: "Zuerst Blank-Marke und Produkttyp wählen",
    noColorsYet: "Für diese Kombination gibt es noch keine Mockups in R2",
    r2Loading: "Mockups in R2 werden durchsucht…",
    r2ListError: "R2-Mockup-Liste konnte nicht geladen werden — alle Farben werden angezeigt, einige sind evtl. nicht verfügbar.",
    chooseTemplate: "Vorlage wählen",
    chooseTemplateHint: "Schnellstart durch Stöbern in vorhandenen R2-Mockups (optional)",
    colorsAvailable: "Farben verfügbar",
    templatesEmpty: "Noch keine Mockups in R2",
    dockLabel: "Gesuchtes Mockup",
    dockEmpty: "Sobald alle Felder ausgefüllt sind, erscheinen hier die Dateinamen",
    ready: "bereit",
    finishSelectionFirst: "Zuerst Produkt, Marke, Marktplatz und mindestens eine Farbe wählen",
    uploadDesign: "Design hochladen",
    changeDesign: "Design ändern",
    uploadDesignHint: "PNG mit transparentem Hintergrund empfohlen",
    dragHint: "Design per Ziehen positionieren, an der unteren rechten Ecke skalieren",
    printArea: "Druckbereich",
    opacity: "Deckkraft",
    download: "Herunterladen",
    downloadAll: "Alle herunterladen",
    mockupMissing: "In R2 nicht gefunden",
    r2NotConfigured: "R2-Verbindung ist noch nicht eingerichtet — Mockups können nicht automatisch geladen werden. Sobald die Worker-Adresse in R2_BASE_URL eingetragen ist, lädt jede gewählte Farbe automatisch ihr Mockup.",
    generateMockups: "Mockups erstellen",
    results: "Ergebnisse",
    missingCount: "fehlende Mockups",
    referencePlaceholder: "Vorschau — das echte Mockup erscheint hier, sobald R2 verbunden ist",
    products: { tshirt: "T-Shirt", sweatshirt: "Sweatshirt", hoody: "Hoody" },
    marketplaces: { amazon: "Amazon", etsy: "Etsy" },
  },
  en: {
    brand: "SeZaLab",
    title: "Mockup Selection Slip",
    subtitle: "Pick product, brand, marketplace and color — the filename builds itself",
    step1: "Product Type",
    step2: "Blank Brand",
    step3: "Marketplace",
    step4: "Color",
    step5: "Design & Placement",
    amazonWarning: "Amazon selected → only white-background mockups will be used",
    chooseBrandFirst: "Select blank brand and product type first",
    noColorsYet: "No mockups in R2 yet for this combination",
    r2Loading: "Scanning R2 for mockups…",
    r2ListError: "Couldn't fetch the R2 mockup list — showing all colors, some may not be available.",
    chooseTemplate: "Choose a Template",
    chooseTemplateHint: "Jump-start by browsing what's already in R2 (optional)",
    colorsAvailable: "colors available",
    templatesEmpty: "No mockups in R2 yet",
    dockLabel: "Mockup to look up",
    dockEmpty: "Once every field is filled, filenames appear here",
    ready: "ready",
    finishSelectionFirst: "Pick product, brand, marketplace and at least one color first",
    uploadDesign: "Upload design",
    changeDesign: "Change design",
    uploadDesignHint: "Transparent-background PNG recommended",
    dragHint: "Drag to position the design, resize from the bottom-right corner",
    printArea: "Print Area",
    opacity: "Opacity",
    download: "Download",
    downloadAll: "Download All",
    mockupMissing: "Not found in R2",
    r2NotConfigured: "R2 isn't connected yet — mockups can't load automatically. Once the Worker address is set in R2_BASE_URL, every color you pick will fetch its mockup on its own.",
    generateMockups: "Generate Mockups",
    results: "Results",
    missingCount: "mockups missing",
    referencePlaceholder: "Preview — the real mockup will appear here once R2 is connected",
    products: { tshirt: "T-Shirt", sweatshirt: "Sweatshirt", hoody: "Hoody" },
    marketplaces: { amazon: "Amazon", etsy: "Etsy" },
  },
};

// ---- Referans veri ----
const PRODUCT_IDS = ["tshirt", "sweatshirt", "hoody"];

// R2 dosya adlarında kullanılan sabit ürün etiketleri (arayüz dilinden bağımsız)
const PRODUCT_FILE_LABELS = { tshirt: "T-Shirt", sweatshirt: "Sweatshirt", hoody: "Hoody" };

const BRANDS = [
  { id: "cc1717", label: "Comfort Colors", code: "1717" },
  { id: "gildan64000", label: "Gildan 64000", code: "64000" },
];

const MARKETPLACE_IDS = ["amazon", "etsy"];

const COLOR_CATALOG = {
  cc1717__tshirt: [
    { name: "Bay", hex: "#a8b79c" }, { name: "Berry", hex: "#6b4459" },
    { name: "Black", hex: "#1a1a1a" }, { name: "Blossom", hex: "#f0c4cb" },
    { name: "Blue Jean", hex: "#6e7f9e" }, { name: "Blue Spruce", hex: "#2f5c52" },
    { name: "Brick", hex: "#6b2530" }, { name: "Bright Salmon", hex: "#f0603d" },
    { name: "Burnt Orange", hex: "#e5721e" }, { name: "Butter", hex: "#f5d77a" },
    { name: "Chalky Mint", hex: "#7fd6be" }, { name: "Chambray", hex: "#b9cdd1" },
    { name: "Chili", hex: "#7a2536" }, { name: "China Blue", hex: "#3a4a82" },
    { name: "Crimson", hex: "#7a2436" }, { name: "Crunchberry", hex: "#c13a6b" },
    { name: "Emerald", hex: "#2e7f72" }, { name: "Espresso", hex: "#5c4033" },
    { name: "Flo Blue", hex: "#5566b0" }, { name: "Granite", hex: "#9c9c9c" },
    { name: "Graphite", hex: "#2b2b30" }, { name: "Gray", hex: "#6e6e6e" },
    { name: "Hemp", hex: "#52562e" }, { name: "Ice Blue", hex: "#4a7791" },
    { name: "Island Green", hex: "#00a67a" }, { name: "Island Reef", hex: "#8fd9b8" },
    { name: "Ivory", hex: "#ede3d0" }, { name: "Lagoon", hex: "#1b8299" },
    { name: "Light Green", hex: "#4e7a5d" }, { name: "Melon", hex: "#ef7d28" },
    { name: "Midnight", hex: "#17233f" }, { name: "Moss", hex: "#5e6e45" },
    { name: "Mustard", hex: "#dea738" }, { name: "Navy", hex: "#131c33" },
    { name: "Neon Pink", hex: "#f13b79" }, { name: "Neon Red Orange", hex: "#f2481d" },
    { name: "Orchid", hex: "#d7c8dc" }, { name: "Peachy", hex: "#f0be9c" },
    { name: "Pepper", hex: "#38393a" }, { name: "Red", hex: "#c41e32" },
    { name: "Royal Caribe", hex: "#14588c" }, { name: "Sage", hex: "#4c5342" },
    { name: "Sandstone", hex: "#b3a78e" }, { name: "Sapphire", hex: "#0c7cb4" },
    { name: "Seafoam", hex: "#2e9e7e" }, { name: "Terracotta", hex: "#e58a6e" },
    { name: "Violet", hex: "#8983c0" }, { name: "Washed Denim", hex: "#7089aa" },
    { name: "Watermelon", hex: "#c22b48" }, { name: "White", hex: "#fafaf7" },
    { name: "Wine", hex: "#6e4a5a" }, { name: "Yam", hex: "#c1651f" },
  ],
  gildan64000__tshirt: [
    { name: "Antique", hex: "#c7c7c7" }, { name: "Black", hex: "#1a1a1a" },
    { name: "Cardinal Red", hex: "#9e1b32" }, { name: "Carolina Blue", hex: "#7ba7d9" },
    { name: "Charcoal", hex: "#4a4a4a" }, { name: "Dark Chocolate", hex: "#3b2a20" },
    { name: "Dark Heather", hex: "#5a5a60" }, { name: "Forest", hex: "#17472a" },
    { name: "Gold", hex: "#f2b705" }, { name: "Heather Navy", hex: "#454b5e" },
    { name: "Kelly Green", hex: "#00805e" }, { name: "Light Blue", hex: "#a8ccee" },
    { name: "Light Pink", hex: "#f3c4ce" }, { name: "Maroon", hex: "#6c1f35" },
    { name: "Military Green", hex: "#5d5d3f" }, { name: "Natural", hex: "#e8dfc8" },
    { name: "Navy", hex: "#1b1f30" }, { name: "Orange", hex: "#f0602e" },
    { name: "Purple", hex: "#4b2e83" }, { name: "Red", hex: "#c8102e" },
    { name: "Royal", hex: "#1a56c4" }, { name: "Sand", hex: "#c6ad8b" },
    { name: "Sapphire", hex: "#0e8ab5" }, { name: "Sport Gray", hex: "#a0a0a0" },
    { name: "White", hex: "#fafaf7" },
  ],
};

// Seçilen marka/ürün/pazar yeri/renklerle eşleşen GERÇEK R2 dosyalarını döndürür.
// Dosya adı asla tahmin edilmez — sadece /list'in döndürdüğü gerçek anahtarlar kullanılır,
// bu yüzden aynı renk için birden fazla mockup varsa hepsi üretilir.
function entriesFromR2({ r2Entries, brand, product, marketplace, selectedColors }) {
  if (!brand || !product || !marketplace || !selectedColors.length) return [];
  const matches = r2Entries.filter(
    (e) => e.brandId === brand && e.productId === product && e.marketplace === marketplace && selectedColors.includes(e.color)
  );
  const seen = new Map();
  return matches.map((e) => {
    const totalForColor = matches.filter((m) => m.color === e.color).length;
    const n = (seen.get(e.color) || 0) + 1;
    seen.set(e.color, n);
    return { ...e, color: e.color, label: totalForColor > 1 ? `${e.color} #${n}` : e.color };
  });
}

function isLight(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MockupSelectionScreen() {
  const [lang, setLang] = useState("en");
  const [langOpen, setLangOpen] = useState(false);
  const [product, setProduct] = useState(null);
  const [brand, setBrand] = useState(null);
  const [marketplace, setMarketplace] = useState(null);
  const [selectedColors, setSelectedColors] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [designImg, setDesignImg] = useState(null);
  const [placement, setPlacement] = useState({ left: PRINT_AREA.left, top: PRINT_AREA.top, width: PRINT_AREA.width, height: PRINT_AREA.height, opacity: 100 });
  const [hoveredColor, setHoveredColor] = useState(null);
  const [generated, setGenerated] = useState(false);

  // R2 bucket'ındaki gerçek mockup dosyalarının canlı listesi
  const [r2Status, setR2Status] = useState(R2_LIST_URL ? "loading" : "unconfigured");
  const [r2Keys, setR2Keys] = useState([]);

  const previewRefs = useRef(new Map());

  const t = T[lang];

  useEffect(() => {
    if (!R2_LIST_URL) return;
    let cancelled = false;
    fetch(R2_LIST_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`list failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setR2Keys(Array.isArray(data) ? data : []);
        setR2Status("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setR2Status("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const r2Entries = useMemo(() => r2Keys.map(parseMockupKey).filter(Boolean), [r2Keys]);

  const colorKey = brand && product ? `${brand}__${product}` : null;
  const colors = useMemo(() => (colorKey ? COLOR_CATALOG[colorKey] ?? [] : []), [colorKey]);

  // R2'de gerçekten karşılığı olan renkler — statik katalog yerine bunlar seçilebilir
  const availableColorNames = useMemo(() => {
    if (!brand || !product || !marketplace) return new Set();
    return new Set(
      r2Entries
        .filter((e) => e.brandId === brand && e.productId === product && e.marketplace === marketplace)
        .map((e) => e.color)
    );
  }, [r2Entries, brand, product, marketplace]);

  const selectableColors = r2Status === "error" ? colors : colors.filter((c) => availableColorNames.has(c.name));

  // R2'deki gerçek dosyaları marka+ürün+pazar yerine göre gruplayıp göz atılabilir şablonlara çevirir
  const templates = useMemo(() => {
    const map = new Map();
    for (const e of r2Entries) {
      const id = `${e.brandId}__${e.productId}__${e.marketplace}`;
      if (!map.has(id)) {
        map.set(id, { id, brandId: e.brandId, productId: e.productId, marketplace: e.marketplace, colorNames: [], thumbKey: e.key });
      }
      map.get(id).colorNames.push(e.color);
    }
    return Array.from(map.values()).map((tpl) => ({
      ...tpl,
      colorCount: tpl.colorNames.length,
      thumbSrc: mockupSrcFor(tpl.thumbKey),
      brandLabel: BRANDS.find((b) => b.id === tpl.brandId)?.label ?? tpl.brandId,
      productLabel: t.products[tpl.productId] ?? tpl.productId,
    }));
  }, [r2Entries, t]);

  function handleSelectTemplate(tpl) {
    setBrand(tpl.brandId);
    setProduct(tpl.productId);
    setMarketplace(tpl.marketplace);
    setSelectedColors([]);
    setGenerated(false);
  }

  function handleBrandChange(id) {
    setBrand(id);
    setSelectedColors([]);
    setGenerated(false);
  }
  function handleProductChange(id) {
    setProduct(id);
    setSelectedColors([]);
    setGenerated(false);
  }
  function handleMarketplaceChange(id) {
    setMarketplace(id);
    setSelectedColors([]);
    setGenerated(false);
  }
  function toggleColor(name) {
    setSelectedColors((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
    setGenerated(false);
  }

  const entries = entriesFromR2({ r2Entries, brand, product, marketplace, selectedColors });
  const dockKeys = entries.map((e) => e.key);
  const isAmazon = marketplace === "amazon";

  // entries zaten R2'de doğrulanmış gerçek dosyalar olduğundan src her zaman geçerlidir;
  // filtre yalnızca güvenlik amaçlı (ör. üretim sırasında dosya R2'den silinmişse) tutulur.
  const entriesWithSrc = entries.map((e) => ({ ...e, src: mockupSrcFor(e.key) }));
  const matchedEntries = entriesWithSrc.filter((e) => e.src);
  const missingCount = entries.length - matchedEntries.length;
  const referenceSrc = entriesWithSrc[0]?.src ?? null;
  const lastSelectedHex = selectedColors.length
    ? colors.find((c) => c.name === selectedColors[selectedColors.length - 1])?.hex
    : null;
  const previewHex = hoveredColor ?? lastSelectedHex ?? "#d4d4d8";

  async function handleDesignUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    setDesignImg(dataUrl);
    setGenerated(false);
  }

  function handleDownloadAll() {
    matchedEntries.forEach((e, i) => {
      setTimeout(() => {
        previewRefs.current.get(e.key)?.download();
      }, i * 250);
    });
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 sm:pb-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }
        .font-mono2 { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      {/* Hero */}
      <div
        className="relative overflow-hidden px-4 pt-5 pb-8 sm:px-10 sm:pt-12 sm:pb-14"
        style={{ background: `linear-gradient(120deg, ${ACCENT.violet} 0%, ${ACCENT.coral} 100%)` }}
      >
        <div className="max-w-3xl mx-auto flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5 sm:mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                <Shirt className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              <span className="font-display font-semibold text-white/90 tracking-wide text-sm uppercase">{t.brand}</span>
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-4xl text-white leading-tight">{t.title}</h1>
            <p className="hidden sm:block font-body text-white/80 text-base mt-2 max-w-md">{t.subtitle}</p>
          </div>

          <div className="relative shrink-0">
            <button
              onClick={() => setLangOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 font-mono2 text-xs font-medium text-white"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
            >
              <Globe className="w-3.5 h-3.5" />
              {lang.toUpperCase()}
            </button>
            {langOpen && (
              <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-lg overflow-hidden z-20 w-24">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => { setLang(l.id); setLangOpen(false); }}
                    className={`block w-full text-left px-3 py-2 text-sm font-mono2 hover:bg-gray-100 ${
                      lang === l.id ? "font-semibold text-gray-900" : "text-gray-500"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="absolute -bottom-6 right-6 flex gap-2 opacity-70">
          {Object.values(ACCENT).map((c, i) => (
            <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>

      {/* İçerik */}
      <div className="relative z-10 max-w-3xl mx-auto px-3 sm:px-10 -mt-5">
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
          <SectionCard accent={ACCENT.coral} label={t.step1}>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_IDS.map((id) => (
                <Chip key={id} active={product === id} accent={ACCENT.coral} onClick={() => handleProductChange(id)}>
                  {t.products[id]}
                </Chip>
              ))}
            </div>
          </SectionCard>

          <SectionCard accent={ACCENT.teal} label={t.step2}>
            <div className="flex flex-wrap gap-2">
              {BRANDS.map((b) => (
                <Chip key={b.id} active={brand === b.id} accent={ACCENT.teal} onClick={() => handleBrandChange(b.id)}>
                  {b.label}
                  <span className="ml-1 opacity-60 font-mono2 text-[10px]">{b.code}</span>
                </Chip>
              ))}
            </div>
          </SectionCard>

          <SectionCard accent={ACCENT.violet} label={t.step3}>
            <div className="flex flex-wrap gap-2">
              {MARKETPLACE_IDS.map((id) => (
                <Chip key={id} active={marketplace === id} accent={ACCENT.violet} onClick={() => handleMarketplaceChange(id)}>
                  {t.marketplaces[id]}
                </Chip>
              ))}
            </div>
            {isAmazon && (
              <p className="text-xs font-body mt-2.5 rounded-lg px-2.5 py-1.5 inline-block" style={{ backgroundColor: "#FFF4EE", color: ACCENT.coral }}>
                ⚠ {t.amazonWarning}
              </p>
            )}
          </SectionCard>
        </div>

        {r2Status !== "unconfigured" && (
          <div className="mb-4">
            <SectionCard accent={ACCENT.yellow} label={t.chooseTemplate}>
              <p className="text-xs font-body text-gray-400 mb-3">{t.chooseTemplateHint}</p>
              {r2Status === "loading" ? (
                <p className="text-sm font-body text-gray-400 italic">{t.r2Loading}</p>
              ) : r2Status === "error" ? (
                <p className="text-xs font-body rounded-lg px-2.5 py-1.5 inline-block" style={{ backgroundColor: "#FFF4EE", color: ACCENT.coral }}>
                  {t.r2ListError}
                </p>
              ) : templates.length === 0 ? (
                <p className="text-sm font-body text-gray-400 italic">{t.templatesEmpty}</p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                  {templates.map((tpl) => {
                    const active = brand === tpl.brandId && product === tpl.productId && marketplace === tpl.marketplace;
                    return (
                      <TemplateCard
                        key={tpl.id}
                        tpl={tpl}
                        active={active}
                        onClick={() => handleSelectTemplate(tpl)}
                        t={t}
                      />
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* Adım 5: Tasarım & Yerleşim */}
        <div className="mb-4">
          <SectionCard accent="#1a1a1a" label={t.step5}>
            {!product || !brand || !marketplace ? (
              <p className="text-sm font-body text-gray-400 italic">{t.finishSelectionFirst}</p>
            ) : (
              <div className="space-y-4">
                {!R2_BASE_URL && (
                  <p className="text-xs font-body rounded-lg px-3 py-2" style={{ backgroundColor: "#F3F0FF", color: ACCENT.violet }}>
                    {t.r2NotConfigured}
                  </p>
                )}

                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl border-2 border-dashed flex items-center justify-center shrink-0 overflow-hidden bg-gray-50"
                      style={{ borderColor: designImg ? ACCENT.teal : "#d1d5db" }}
                    >
                      {designImg ? (
                        <img src={designImg} alt="design" className="w-full h-full object-contain" />
                      ) : (
                        <Upload className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <span className="font-display font-semibold text-sm text-gray-900 block">
                        {designImg ? t.changeDesign : t.uploadDesign}
                      </span>
                      <span className="font-body text-xs text-gray-400">{t.uploadDesignHint}</span>
                    </div>
                    <input type="file" accept="image/png,image/webp" className="hidden" onChange={handleDesignUpload} />
                  </label>
                </div>

                {designImg && (
                  <div>
                    <DesignPlacer
                      designSrc={designImg}
                      referenceSrc={referenceSrc}
                      tshirtColor={previewHex}
                      placement={placement}
                      onChange={setPlacement}
                      t={t}
                    />
                    <p className="text-[11px] font-body text-gray-400 mt-2 flex items-center gap-1">
                      <Move className="w-3 h-3" /> {t.dragHint}
                    </p>
                    <div className="mt-3 max-w-xs">
                      <SliderControl
                        label={t.opacity}
                        value={placement.opacity}
                        onChange={(v) => setPlacement((p) => ({ ...p, opacity: v }))}
                        accent={ACCENT.teal}
                      />
                    </div>
                  </div>
                )}

                {/* Renk seçimi — önizlemenin hemen altında. Sadece R2'de gerçekten mockup'ı olan renkler seçilebilir. */}
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-mono2 mb-2.5">{t.step4}</p>
                  {!brand || !product ? (
                    <p className="text-sm font-body text-gray-400 italic">{t.chooseBrandFirst}</p>
                  ) : r2Status === "loading" ? (
                    <p className="text-sm font-body text-gray-400 italic">{t.r2Loading}</p>
                  ) : selectableColors.length === 0 ? (
                    <p className="text-sm font-body text-gray-400 italic">{t.noColorsYet}</p>
                  ) : (
                    <>
                      {r2Status === "error" && (
                        <p className="text-xs font-body rounded-lg px-2.5 py-1.5 mb-2 inline-block" style={{ backgroundColor: "#FFF4EE", color: ACCENT.coral }}>
                          {t.r2ListError}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {selectableColors.map((c) => {
                          const active = selectedColors.includes(c.name);
                          return (
                            <button
                              key={c.name}
                              onClick={() => toggleColor(c.name)}
                              onMouseEnter={() => setHoveredColor(c.hex)}
                              onMouseLeave={() => setHoveredColor(null)}
                              className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full border text-xs font-body font-medium transition text-left"
                              style={{
                                borderColor: active ? "#1a1a1a" : "#e5e7eb",
                                backgroundColor: active ? "#1a1a1a" : "white",
                                color: active ? "white" : "#374151",
                              }}
                            >
                              <span className="w-4 h-4 rounded-full border border-black/10 flex items-center justify-center shrink-0" style={{ backgroundColor: c.hex }}>
                                {active && <Check className="w-2.5 h-2.5" color={isLight(c.hex) ? "#000000" : "#ffffff"} strokeWidth={3.5} />}
                              </span>
                              <span>{c.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {dockKeys.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <DockContent t={t} dockKeys={dockKeys} />
                  </div>
                )}

                <button
                  onClick={() => setGenerated(true)}
                  disabled={!designImg || entries.length === 0}
                  className="w-full font-display font-semibold text-white rounded-xl py-3.5 flex items-center justify-center gap-2 transition disabled:opacity-40"
                  style={{ backgroundColor: ACCENT.violet }}
                >
                  <Sparkles className="w-4 h-4" />
                  {t.generateMockups} ({entries.length})
                </button>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Results */}
        {generated && entries.length > 0 && (
          <div className="mb-8">
            <SectionCard accent={ACCENT.teal} label={t.results}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  {missingCount > 0 && (
                    <span className="text-[11px] font-body font-medium rounded-full px-2.5 py-1" style={{ backgroundColor: "#FFF4EE", color: ACCENT.coral }}>
                      {missingCount} {t.missingCount}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleDownloadAll}
                  disabled={matchedEntries.length === 0}
                  className="flex items-center gap-1.5 text-xs font-body font-semibold rounded-full px-3 py-1.5 text-white disabled:opacity-40"
                  style={{ backgroundColor: "#1a1a1a" }}
                >
                  <Download className="w-3 h-3" />
                  {t.downloadAll}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {entriesWithSrc.map((e) => (
                  <MockupPreview
                    key={e.key}
                    ref={(el) => {
                      if (el) previewRefs.current.set(e.key, el);
                      else previewRefs.current.delete(e.key);
                    }}
                    fileKey={e.key}
                    label={e.label}
                    mockupSrc={e.src}
                    designSrc={designImg}
                    placement={placement}
                    t={t}
                  />
                ))}
              </div>
            </SectionCard>
          </div>
        )}
      </div>

      {/* Mobil sabit alt fiş */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30">
        {sheetOpen && <div className="fixed inset-0 bg-black/30" onClick={() => setSheetOpen(false)} />}
        <div className={`relative bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)] transition-all ${sheetOpen ? "max-h-[70vh]" : "max-h-24"} overflow-hidden`}>
          <div className="flex items-center">
          <button onClick={() => setSheetOpen((o) => !o)} className="flex-1 flex items-center justify-between pl-4 pr-2 py-3.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dockKeys.length ? ACCENT.teal : "#d1d5db" }} />
              <span className="font-display font-semibold text-sm text-gray-900">{dockKeys.length} {t.ready}</span>
            </div>
            {sheetOpen ? <X className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
          </button>
          {!sheetOpen && designImg && entries.length > 0 && (
            <button
              onClick={() => {
                setGenerated(true);
                setSheetOpen(false);
              }}
              className="shrink-0 mr-3 my-2 px-4 py-2 rounded-full font-display font-semibold text-xs text-white flex items-center gap-1.5"
              style={{ backgroundColor: ACCENT.violet }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t.generateMockups}
            </button>
          )}
          </div>
          <div className="px-5 pb-5 overflow-y-auto max-h-[55vh]">
            <DockContent t={t} dockKeys={dockKeys} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DockContent({ t, dockKeys }) {
  return (
    <>
      <p className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-mono2 mb-2">{t.dockLabel}</p>
      {dockKeys.length > 0 ? (
        <ul className="space-y-1.5">
          {dockKeys.map((k) => (
            <li key={k} className="font-mono2 text-xs sm:text-sm break-all bg-gray-50 rounded-lg px-2.5 py-1.5 text-gray-700">{k}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm font-body text-gray-400 italic">{t.dockEmpty}</p>
      )}
    </>
  );
}

function SectionCard({ accent, label, children }) {
  return (
    <div className="bg-white rounded-2xl p-3 sm:p-5 shadow-sm border-l-4" style={{ borderLeftColor: accent }}>
      <p className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-mono2 mb-2.5">{label}</p>
      {children}
    </div>
  );
}

function Chip({ active, accent, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm font-body font-medium border transition whitespace-nowrap"
      style={{
        borderColor: active ? accent : "#e5e7eb",
        backgroundColor: active ? accent : "white",
        color: active ? "white" : "#374151",
      }}
    >
      {children}
    </button>
  );
}

// R2'de gerçekten var olan bir marka+ürün+pazar yeri kombinasyonunu önizleyip tek tıkla seçtiren kart
function TemplateCard({ tpl, active, onClick, t }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      onClick={onClick}
      className="shrink-0 w-32 text-left rounded-xl border overflow-hidden transition"
      style={{ borderColor: active ? ACCENT.violet : "#e5e7eb", boxShadow: active ? `0 0 0 2px ${ACCENT.violet}` : "none" }}
    >
      <div className="w-32 h-32 bg-gray-100 flex items-center justify-center overflow-hidden">
        {tpl.thumbSrc && !imgFailed ? (
          <img
            src={tpl.thumbSrc}
            alt={tpl.brandLabel}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <ImageOff className="w-5 h-5 text-gray-300" />
        )}
      </div>
      <div className="p-2">
        <p className="font-display font-semibold text-xs text-gray-900 truncate">{tpl.brandLabel}</p>
        <p className="font-body text-[11px] text-gray-500 truncate">{tpl.productLabel}</p>
        <div className="flex items-center justify-between mt-1">
          <span className="font-mono2 text-[10px] text-gray-400">{tpl.colorCount} {t.colorsAvailable}</span>
          <span
            className="font-mono2 text-[9px] uppercase px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: "#F3F0FF", color: ACCENT.violet }}
          >
            {t.marketplaces[tpl.marketplace]}
          </span>
        </div>
      </div>
    </button>
  );
}

function SliderControl({ label, value, onChange, accent, min = 0, max = 100 }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono2 uppercase tracking-wide text-gray-500">{label}</span>
        <span className="text-[10px] font-mono2 text-gray-400">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-current"
        style={{ color: accent }}
      />
    </div>
  );
}

// Basit düz-vektör tişört silüeti — seçilen/hover edilen renge göre boyanır
function TShirtSilhouette({ color }) {
  return (
    <svg viewBox="0 0 300 250" className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="xMidYMid meet">
      <path
        d="M110,20 Q150,50 190,20 L230,30 L280,90 L245,120 L215,95 L215,230 L85,230 L85,95 L55,120 L20,90 L70,30 Z"
        fill={color}
        stroke="rgba(0,0,0,0.4)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* Yaka dikişi (çift çizgi) */}
      <path d="M118,22 Q150,46 182,22" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
      <path d="M122,28 Q150,50 178,28" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1.5" />

      {/* Sağ kol ağzı dikişi (çift çizgi) */}
      <line x1="240" y1="102" x2="270" y2="90" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
      <line x1="236" y1="111" x2="266" y2="99" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />

      {/* Sol kol ağzı dikişi (çift çizgi) */}
      <line x1="60" y1="102" x2="30" y2="90" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
      <line x1="64" y1="111" x2="34" y2="99" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />

      {/* Etek dikişi (çift çizgi) */}
      <line x1="85" y1="221" x2="215" y2="221" stroke="rgba(0,0,0,0.24)" strokeWidth="2" />
    </svg>
  );
}

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
// Standart göğüs baskı alanı — kullanıcı tasarımı bu alana hizalayarak başlar
const PRINT_AREA = { left: 33, top: 38, width: 34, height: 34 };
const HANDLE_CURSOR = {
  nw: "nwse-resize", se: "nwse-resize",
  ne: "nesw-resize", sw: "nesw-resize",
  n: "ns-resize", s: "ns-resize",
  e: "ew-resize", w: "ew-resize",
};
const HANDLE_POS = {
  nw: { left: "0%", top: "0%" }, n: { left: "50%", top: "0%" }, ne: { left: "100%", top: "0%" },
  e: { left: "100%", top: "50%" }, se: { left: "100%", top: "100%" }, s: { left: "50%", top: "100%" },
  sw: { left: "0%", top: "100%" }, w: { left: "0%", top: "50%" },
};

// Fare ile sürükle/boyutlandır — Design & Yerleşim adımındaki canlı önizleme
function DesignPlacer({ designSrc, referenceSrc, tshirtColor, placement, onChange, t }) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const [refFailed, setRefFailed] = useState(false);

  useEffect(() => {
    setRefFailed(false);
  }, [referenceSrc]);

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dxPct = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
      const s = dragRef.current.start;
      const mode = dragRef.current.mode;

      if (mode === "move") {
        onChange({ ...s, left: s.left + dxPct, top: s.top + dyPct });
        return;
      }

      let next = { ...s };
      if (mode.includes("e")) next.width = clamp(s.width + dxPct, 6, 150);
      if (mode.includes("s")) next.height = clamp(s.height + dyPct, 6, 150);
      if (mode.includes("w")) {
        next.width = clamp(s.width - dxPct, 6, 150);
        next.left = s.left + (s.width - next.width);
      }
      if (mode.includes("n")) {
        next.height = clamp(s.height - dyPct, 6, 150);
        next.top = s.top + (s.height - next.height);
      }
      onChange(next);
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onChange]);

  function startDrag(mode, e) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, start: { ...placement } };
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-square rounded-xl overflow-hidden bg-gray-100 select-none"
      style={{ touchAction: "none" }}
    >
      {referenceSrc && !refFailed ? (
        <img
          src={referenceSrc}
          alt="mockup"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          onError={() => setRefFailed(true)}
        />
      ) : (
        <TShirtSilhouette color={tshirtColor} />
      )}

      {/* Sabit baskı alanı kılavuzu — tasarım kutusundan bağımsız, her zaman görünür */}
      <div
        className="absolute border border-dashed pointer-events-none"
        style={{
          left: `${PRINT_AREA.left}%`,
          top: `${PRINT_AREA.top}%`,
          width: `${PRINT_AREA.width}%`,
          height: `${PRINT_AREA.height}%`,
          borderColor: "rgba(0,0,0,0.35)",
        }}
      >
        <span
          className="absolute -top-5 left-0 text-[9px] font-mono2 uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", color: "white" }}
        >
          {t.printArea}
        </span>
      </div>

      {designSrc && (
        <div
          onPointerDown={(e) => startDrag("move", e)}
          className="absolute cursor-move border-2 border-dashed"
          style={{
            left: `${placement.left}%`,
            top: `${placement.top}%`,
            width: `${placement.width}%`,
            height: `${placement.height}%`,
            borderColor: ACCENT.violet,
          }}
        >
          <img
            src={designSrc}
            alt="design"
            className="w-full h-full object-contain pointer-events-none"
            style={{ opacity: placement.opacity / 100 }}
          />
          {HANDLES.map((h) => (
            <div
              key={h}
              onPointerDown={(e) => startDrag(h, e)}
              className="absolute w-4 h-4 sm:w-3 sm:h-3 bg-white border-2 rounded-sm"
              style={{
                ...HANDLE_POS[h],
                borderColor: ACCENT.violet,
                cursor: HANDLE_CURSOR[h],
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const MockupPreview = forwardRef(function MockupPreview({ fileKey, label, mockupSrc, designSrc, placement, t }, ref) {
  const canvasRef = useRef(null);
  const [hasImage, setHasImage] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
    if (!mockupSrc) {
      setHasImage(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const mockupImg = new Image();
    mockupImg.crossOrigin = "anonymous";
    mockupImg.onload = () => {
      const maxW = 480;
      const ratio = Math.min(1, maxW / mockupImg.width);
      canvas.width = mockupImg.width * ratio;
      canvas.height = mockupImg.height * ratio;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(mockupImg, 0, 0, canvas.width, canvas.height);

      if (designSrc) {
        const designEl = new Image();
        designEl.onload = () => {
          const boxX = canvas.width * (placement.left / 100);
          const boxY = canvas.height * (placement.top / 100);
          const boxW = canvas.width * (placement.width / 100);
          const boxH = canvas.height * (placement.height / 100);

          // object-contain: kutu içine tasarımın oranını bozmadan sığdır
          const imgRatio = designEl.width / designEl.height;
          const boxRatio = boxW / boxH;
          let dW, dH;
          if (imgRatio > boxRatio) {
            dW = boxW;
            dH = dW / imgRatio;
          } else {
            dH = boxH;
            dW = dH * imgRatio;
          }
          const dX = boxX + (boxW - dW) / 2;
          const dY = boxY + (boxH - dH) / 2;

          ctx.globalAlpha = placement.opacity / 100;
          ctx.drawImage(designEl, dX, dY, dW, dH);
          ctx.globalAlpha = 1;
          setHasImage(true);
        };
        designEl.src = designSrc;
      } else {
        setHasImage(true);
      }
    };
    mockupImg.onerror = () => {
      setHasImage(false);
      setLoadFailed(true);
    };
    mockupImg.src = mockupSrc;
  }, [mockupSrc, designSrc, placement]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = fileKey;
    a.click();
  }

  useImperativeHandle(ref, () => ({ download }));

  if (!mockupSrc || loadFailed) {
    return (
      <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-4 aspect-square text-center">
        <ImageOff className="w-5 h-5 text-gray-300 mb-2" />
        <span className="font-body text-[11px] text-gray-500 font-medium mb-1">{label}</span>
        <p className="text-[10px] font-body text-gray-400">{t.mockupMissing}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
      <canvas ref={canvasRef} className="w-full h-auto block bg-gray-100" />
      <div className="p-2 flex items-center justify-between gap-2">
        <span className="font-body text-[11px] text-gray-700 font-medium truncate">{label}</span>
        <button
          onClick={download}
          disabled={!hasImage}
          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ backgroundColor: ACCENT.teal }}
        >
          <Download className="w-3 h-3 text-white" />
        </button>
      </div>
    </div>
  );
});
