import { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import JSZip from "jszip";
import {
  Check,
  Shirt,
  Globe,
  ChevronUp,
  ChevronDown,
  X,
  Upload,
  Download,
  ImageOff,
  Sparkles,
  Move,
  Folder,
  LogOut,
} from "lucide-react";
import { LoginPage } from "./LoginPage";
import { AdminPanel } from "./AdminPanel";
import { getCurrentUser, logout, getUserR2Path } from "./auth";

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
const R2_ORIGIN = R2_BASE_URL ? new URL(R2_BASE_URL).origin : null;
// Worker'ın bucket'taki tüm dosya adlarını JSON dizi olarak döndüren endpoint'i.
const R2_LIST_URL = R2_ORIGIN ? `${R2_ORIGIN}/list` : null;
// Her mockup dosyası için kalibre edilmiş baskı alanı koordinatlarını okuyup yazan endpoint.
const R2_PLACEMENTS_URL = R2_ORIGIN ? `${R2_ORIGIN}/placements` : null;

function mockupSrcFor(key) {
  if (!R2_BASE_URL) return null;
  // Klasörlü anahtarlarda "/" korunmalı, sadece segmentler encode edilmeli
  return `${R2_BASE_URL}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

// İndirme/zip için güvenli dosya adı: "GM013/Pepper.png" -> "GM013_Pepper.png"
function safeFileName(key) {
  return key.replace(/\//g, "_");
}

// R2 anahtarını klasör + dosyaya ayırır. Kullanıcı R2'de istediği isimde klasörler açar,
// mockupları içine atar — dosya adında hiçbir kalıp zorunluluğu yoktur.
// SADECE klasör içindeki görseller mockup sayılır: kökteki dosyalar kasıtlı olarak yok
// sayılır (bucket'ın köküne uygulamayla ilgisiz görseller de yükleniyor).
// "_" ile başlayan dosya/klasörler (örn. _placements.json) sistem dosyasıdır, atlanır.
function classifyKey(key) {
  const parts = key.split("/");
  if (parts.length < 2) return null; // kök dosya → mockup değil
  const file = parts[parts.length - 1];
  const folder = parts.slice(0, -1).join("/");
  if (file.startsWith("_") || parts[0].startsWith("_")) return null;
  if (!/\.(png|webp|jpe?g)$/i.test(file)) return null;
  return {
    key,
    folder,
    label: file.replace(/\.(png|webp|jpe?g)$/i, ""),
  };
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
    brand: "MockUP Maker",
    title: "Etsy, Amazon & Shopify için POD Mockuplar",
    subtitle: "Klasörünü seç, mockupları işaretle, tasarımını yerleştir — indir",
    stepFolder: "Mockup Klasörü",
    stepMockups: "Mockuplar",
    stepDesign: "Tasarım & Yerleşim",
    results: "Sonuçlar",
    folderPlaceholder: "Bir klasör seç…",
    folderHint: "R2'de açtığın her klasör burada otomatik listelenir — yeni mockuplar yüklemek için yeterli",
    folderEmpty: "Bu klasörde henüz mockup yok",
    noFoldersYet: "R2'de henüz hiç mockup yok — bir klasör açıp içine görselleri yükle",
    selectMockupsHint: "Tasarım eklemek istediğin mockuplara tıkla (birden fazla seçebilirsin)",
    selectAll: "Tümünü Seç",
    clearSelection: "Temizle",
    selectedWord: "seçili",
    mockupsWord: "mockup",
    chooseFolderFirst: "Önce yukarıdan bir klasör seç",
    selectMockupFirst: "Önce en az bir mockup seç",
    r2Loading: "R2'deki mockuplar taranıyor…",
    r2ListError: "R2 mockup listesi alınamadı — sayfayı yenilemeyi dene.",
    dockLabel: "Seçilen Mockuplar",
    dockEmpty: "Mockup seçtikçe dosya adları burada listelenir",
    ready: "seçili",
    uploadDesign: "Tasarımı Yükle",
    changeDesign: "Tasarımı Değiştir",
    uploadDesignHint: "Şeffaf arka planlı PNG önerilir",
    dragHint: "Tasarımı sürükleyerek konumlandır, köşelerden tutup boyutlandır",
    editingLabel: "Düzenlenen mockup",
    placementSaving: "Konum kaydediliyor…",
    placementSaved: "Konum kaydedildi — bu mockup bir daha hep burada çıkacak",
    placementSaveError: "Konum kaydedilemedi, sadece bu oturumda geçerli olacak",
    opacity: "Opaklık",
    download: "İndir",
    downloadAll: "Tümünü İndir (ZIP)",
    zippingAll: "ZIP hazırlanıyor…",
    zipError: "ZIP oluşturulamadı, tek tek indirmeyi dene",
    mockupMissing: "Görsel yüklenemedi",
    r2NotConfigured: "R2 bağlantısı henüz kurulmadı — Worker adresini R2_BASE_URL'e girince mockuplar otomatik gelecek.",
    generateMockups: "Mockupları Oluştur",
    missingCount: "eksik mockup",
  },
  de: {
    brand: "MockUP Maker",
    title: "POD Mockups für Etsy, Amazon & Shopify",
    subtitle: "Ordner wählen, Mockups markieren, Design platzieren — herunterladen",
    stepFolder: "Mockup-Ordner",
    stepMockups: "Mockups",
    stepDesign: "Design & Platzierung",
    results: "Ergebnisse",
    folderPlaceholder: "Ordner wählen…",
    folderHint: "Jeder in R2 angelegte Ordner erscheint hier automatisch — einfach neue Mockups hochladen",
    folderEmpty: "In diesem Ordner sind noch keine Mockups",
    noFoldersYet: "Noch keine Mockups in R2 — einen Ordner anlegen und Bilder hochladen",
    selectMockupsHint: "Mockups anklicken, die das Design bekommen sollen (Mehrfachauswahl möglich)",
    selectAll: "Alle auswählen",
    clearSelection: "Leeren",
    selectedWord: "ausgewählt",
    mockupsWord: "Mockups",
    chooseFolderFirst: "Zuerst oben einen Ordner wählen",
    selectMockupFirst: "Zuerst mindestens ein Mockup auswählen",
    r2Loading: "Mockups in R2 werden durchsucht…",
    r2ListError: "R2-Mockup-Liste konnte nicht geladen werden — Seite neu laden.",
    dockLabel: "Ausgewählte Mockups",
    dockEmpty: "Ausgewählte Dateinamen erscheinen hier",
    ready: "ausgewählt",
    uploadDesign: "Design hochladen",
    changeDesign: "Design ändern",
    uploadDesignHint: "PNG mit transparentem Hintergrund empfohlen",
    dragHint: "Design per Ziehen positionieren, an den Ecken skalieren",
    editingLabel: "Bearbeitetes Mockup",
    placementSaving: "Position wird gespeichert…",
    placementSaved: "Position gespeichert — dieses Mockup erscheint ab jetzt immer hier",
    placementSaveError: "Position konnte nicht gespeichert werden, gilt nur für diese Sitzung",
    opacity: "Deckkraft",
    download: "Herunterladen",
    downloadAll: "Alle herunterladen (ZIP)",
    zippingAll: "ZIP wird erstellt…",
    zipError: "ZIP konnte nicht erstellt werden, einzeln herunterladen",
    mockupMissing: "Bild konnte nicht geladen werden",
    r2NotConfigured: "R2-Verbindung ist noch nicht eingerichtet — Worker-Adresse in R2_BASE_URL eintragen.",
    generateMockups: "Mockups erstellen",
    missingCount: "fehlende Mockups",
  },
  en: {
    brand: "MockUP Maker",
    title: "POD Mockups for Etsy, Amazon & Shopify",
    subtitle: "Pick a folder, tick your mockups, place the design — download",
    stepFolder: "Mockup Folder",
    stepMockups: "Mockups",
    stepDesign: "Design & Placement",
    results: "Results",
    folderPlaceholder: "Choose a folder…",
    folderHint: "Every folder you create in R2 shows up here automatically — just upload new mockups",
    folderEmpty: "No mockups in this folder yet",
    noFoldersYet: "No mockups in R2 yet — create a folder and upload images into it",
    selectMockupsHint: "Click the mockups you want the design on (multi-select)",
    selectAll: "Select All",
    clearSelection: "Clear",
    selectedWord: "selected",
    mockupsWord: "mockups",
    chooseFolderFirst: "Choose a folder above first",
    selectMockupFirst: "Select at least one mockup first",
    r2Loading: "Scanning R2 for mockups…",
    r2ListError: "Couldn't fetch the R2 mockup list — try reloading.",
    dockLabel: "Selected Mockups",
    dockEmpty: "Selected filenames will be listed here",
    ready: "selected",
    uploadDesign: "Upload design",
    changeDesign: "Change design",
    uploadDesignHint: "Transparent-background PNG recommended",
    dragHint: "Drag to position the design, resize from the corners",
    editingLabel: "Editing mockup",
    placementSaving: "Saving position…",
    placementSaved: "Position saved — this mockup will always open here from now on",
    placementSaveError: "Couldn't save position, only applies to this session",
    opacity: "Opacity",
    download: "Download",
    downloadAll: "Download All (ZIP)",
    zippingAll: "Zipping…",
    zipError: "Couldn't build the ZIP, try downloading individually",
    mockupMissing: "Image failed to load",
    r2NotConfigured: "R2 isn't connected yet — set the Worker address in R2_BASE_URL.",
    generateMockups: "Generate Mockups",
    missingCount: "mockups missing",
  },
};

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function MockupStudio() {
  const [lang, setLang] = useState("en");
  const [langOpen, setLangOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Klasör-bazlı akış: R2'deki klasörler set'tir, içindeki her görsel bir mockup'tır.
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);

  const [designImg, setDesignImg] = useState(null);
  // Gerçek fotoğraflar birbirinden farklı kadrajlanmış olabilir; bu yüzden yerleşim tek bir
  // global değer değil, düzenlenmekte olan mockup dosyasının anahtarına göre ayrı ayrı tutulur.
  // Kalibre edilen koordinatlar R2 worker'ında kalıcı olarak saklanır.
  const [placements, setPlacements] = useState({});
  const [activeEntryKey, setActiveEntryKey] = useState(null);
  const [placementsSaveStatus, setPlacementsSaveStatus] = useState("idle"); // idle | saving | saved | error
  const placementsLoadedRef = useRef(false);
  const skipNextSaveRef = useRef(false);
  const [generated, setGenerated] = useState(false);
  const [zipStatus, setZipStatus] = useState("idle"); // idle | zipping | error

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

  // Sayfa açılışında daha önce kalibre edilmiş yerleşimleri worker'dan çek
  useEffect(() => {
    if (!R2_PLACEMENTS_URL) {
      placementsLoadedRef.current = true;
      return;
    }
    let cancelled = false;
    fetch(R2_PLACEMENTS_URL)
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === "object") {
          // Eski sürümlerin bıraktığı "__colors__" gibi ayrılmış anahtarları yok say
          const clean = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith("__")));
          // Yüklemenin tetiklediği state değişimi geri-kaydetme döngüsüne girmesin
          skipNextSaveRef.current = true;
          setPlacements(clean);
        }
      })
      .catch(() => {
        // Okuma başarısız olursa boş haritayla devam edilir — sürükleme yine çalışır,
        // sadece o oturumda kalıcı hale gelmez.
      })
      .finally(() => {
        if (!cancelled) placementsLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Kullanıcı bir mockup'ı sürükleyip bıraktıkça, kısa bir bekleme sonrası otomatik kaydet
  useEffect(() => {
    if (!R2_PLACEMENTS_URL || !placementsLoadedRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    setPlacementsSaveStatus("saving");
    const timeout = setTimeout(() => {
      fetch(R2_PLACEMENTS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(placements),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`save failed: ${res.status}`);
          setPlacementsSaveStatus("saved");
        })
        .catch(() => setPlacementsSaveStatus("error"));
    }, 900);
    return () => clearTimeout(timeout);
  }, [placements]);

  // R2 anahtarlarını klasörlere ayır
  const folders = useMemo(() => {
    const map = new Map();
    for (const key of r2Keys) {
      const item = classifyKey(key);
      if (!item) continue;
      if (!map.has(item.folder)) map.set(item.folder, []);
      map.get(item.folder).push(item);
    }
    // Her klasörün içi de klasör listesi de alfabetik
    const list = Array.from(map.entries()).map(([folder, items]) => ({
      folder,
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
      thumbSrc: mockupSrcFor(items[0].key),
    }));
    list.sort((a, b) => a.folder.localeCompare(b.folder));
    return list;
  }, [r2Keys]);

  const currentFolder = folders.find((f) => f.folder === selectedFolder) ?? null;

  // Tek klasör varsa otomatik seç — kullanıcıyı bir tık'tan kurtar
  useEffect(() => {
    if (selectedFolder === null && folders.length === 1) {
      setSelectedFolder(folders[0].folder);
    }
  }, [folders, selectedFolder]);

  function folderDisplayName(folder) {
    return folder;
  }

  function toggleKey(key) {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    setGenerated(false);
  }
  function selectAllInFolder() {
    if (!currentFolder) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const item of currentFolder.items) next.add(item.key);
      return Array.from(next);
    });
    setGenerated(false);
  }
  function clearSelection() {
    setSelectedKeys([]);
    setGenerated(false);
  }

  // Seçilen mockuplar (klasörler arası seçim korunur)
  const entries = useMemo(() => {
    const byKey = new Map();
    for (const f of folders) for (const item of f.items) byKey.set(item.key, item);
    return selectedKeys
      .filter((k) => byKey.has(k))
      .map((k) => ({ ...byKey.get(k), src: mockupSrcFor(k) }));
  }, [selectedKeys, folders]);

  const dockKeys = entries.map((e) => e.key);
  const matchedEntries = entries.filter((e) => e.src);
  const missingCount = entries.length - matchedEntries.length;

  // Hangi mockup fotoğrafının şu an düzenlendiğini, seçim değiştikçe geçerli tutar
  useEffect(() => {
    setActiveEntryKey((prev) => {
      if (entries.length === 0) return null;
      if (prev && entries.some((e) => e.key === prev)) return prev;
      return entries[0].key;
    });
  }, [entries]);

  const activeSrc = entries.find((e) => e.key === activeEntryKey)?.src ?? null;

  function getPlacement(key) {
    const k = key ?? "__default__";
    return placements[k] ?? DEFAULT_PLACEMENT;
  }
  function setPlacementFor(key, next) {
    const k = key ?? "__default__";
    setPlacements((prev) => ({ ...prev, [k]: next }));
  }

  async function handleDesignUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    setDesignImg(dataUrl);
    setGenerated(false);
  }

  async function handleDesignDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    setDesignImg(dataUrl);
    setGenerated(false);
  }

  async function handleDownloadAll() {
    if (zipStatus === "zipping") return;
    setZipStatus("zipping");
    try {
      const zip = new JSZip();
      const usedNames = new Set();
      for (const e of matchedEntries) {
        const blob = await previewRefs.current.get(e.key)?.getBlob();
        if (!blob) continue;
        let name = safeFileName(e.key);
        let n = 2;
        while (usedNames.has(name)) {
          name = safeFileName(e.key).replace(/(\.\w+)$/i, `_${n}$1`);
          n++;
        }
        usedNames.add(name);
        zip.file(name, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `mockups_${stamp}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setZipStatus("idle");
    } catch {
      setZipStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-white pb-20 sm:pb-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }
        .font-mono2 { font-family: 'JetBrains Mono', monospace; }
      `}</style>

      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-gray-100 rounded-lg">
              <span className="text-xl">☰</span>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: ACCENT.violet }}>
                <Shirt className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              <div>
                <div className="font-display font-bold text-sm text-gray-900">MockUP Maker</div>
                <div className="font-body text-xs text-gray-500">POD Mockups for Etsy, Amazon & Shopify</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="p-2 hover:bg-gray-100 rounded-lg flex items-center gap-1"
              >
                <Globe className="w-4 h-4 text-gray-600" />
                <span className="text-xs font-semibold text-gray-600">{lang.toUpperCase()}</span>
              </button>
              {langOpen && (
                <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-md z-50">
                  {[
                    { id: "de", label: "DE" },
                    { id: "en", label: "EN" },
                    { id: "tr", label: "TR" },
                  ].map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        setLang(l.id);
                        setLangOpen(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm font-body hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                        lang === l.id ? "bg-gray-100 font-semibold text-gray-900" : "text-gray-700"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="p-2 hover:bg-gray-100 rounded-lg">
              <span className="text-xl">👤</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hero Banner */}
      <div
        className="relative overflow-hidden px-4 sm:px-6 py-8 sm:py-12"
        style={{ background: `linear-gradient(135deg, ${ACCENT.violet} 0%, ${ACCENT.coral} 100%)` }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-8">
            <div className="flex-1">
              <h1 className="font-display font-bold text-3xl sm:text-4xl text-white leading-tight mb-3">
                Create stunning mockups in seconds ✨
              </h1>
              <p className="font-body text-white/90 text-base leading-relaxed">
                Choose mockups, upload your design and we'll do the magic.
              </p>
            </div>
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <Shirt className="w-16 h-16 sm:w-20 sm:h-20 text-white opacity-80" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Step 1: Choose Folder */}
        <div className="mb-8 sm:mb-12">
          <div className="flex items-start gap-4 mb-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full font-display font-bold text-white" style={{ backgroundColor: ACCENT.violet }}>
              1
            </div>
            <div className="flex-1">
              <h2 className="font-display font-semibold text-lg sm:text-xl text-gray-900 mb-1">{t.stepFolder}</h2>
              <p className="font-body text-sm text-gray-500">Choose the folder containing your mockups</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
            {r2Status === "unconfigured" ? (
              <p className="text-sm font-body text-gray-600 italic">{t.r2NotConfigured}</p>
            ) : r2Status === "loading" ? (
              <p className="text-sm font-body text-gray-400 italic">{t.r2Loading}</p>
            ) : r2Status === "error" ? (
              <p className="text-sm font-body text-coral italic">{t.r2ListError}</p>
            ) : folders.length === 0 ? (
              <p className="text-sm font-body text-gray-400 italic">{t.noFoldersYet}</p>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setFolderOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-left hover:bg-gray-100 transition font-body"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Folder className="w-4 h-4 shrink-0" style={{ color: ACCENT.yellow }} />
                    {currentFolder ? (
                      <>
                        <span className="font-display font-semibold text-sm text-gray-900 truncate">{folderDisplayName(currentFolder.folder)}</span>
                        <span className="font-mono2 text-[10px] text-gray-400 shrink-0">{currentFolder.items.length} {t.mockupsWord}</span>
                      </>
                    ) : (
                      <span className="font-body text-sm text-gray-400">{t.folderPlaceholder}</span>
                    )}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${folderOpen ? "rotate-180" : ""}`} />
                </button>

                {folderOpen && (
                  <>
                    {/* Dışarı tıklayınca kapansın */}
                    <div className="fixed inset-0 z-10" onClick={() => setFolderOpen(false)} />
                    <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-20 max-h-80 overflow-y-auto">
                      {folders.map((f) => (
                        <button
                          key={f.folder || "__root__"}
                          onClick={() => {
                            setSelectedFolder(f.folder);
                            setFolderOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition ${
                            selectedFolder === f.folder ? "bg-gray-50" : ""
                          }`}
                        >
                          <span className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                            {f.thumbSrc ? (
                              <img src={f.thumbSrc} alt="" loading="lazy" className="w-full h-full object-cover" />
                            ) : (
                              <ImageOff className="w-4 h-4 text-gray-300" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="font-display font-semibold text-sm text-gray-900 block truncate">{folderDisplayName(f.folder)}</span>
                            <span className="font-mono2 text-[10px] text-gray-400">{f.items.length} {t.mockupsWord}</span>
                          </span>
                          {selectedFolder === f.folder && <Check className="w-4 h-4 shrink-0" style={{ color: ACCENT.violet }} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}

              </div>
            )}
          </div>
        </div>

        {/* Step 2: Select Mockups */}
        <div className="mb-6">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full font-display font-bold text-sm text-white" style={{ backgroundColor: ACCENT.violet }}>
              2
            </div>
            <div className="flex-1">
              <h2 className="font-display font-semibold text-base sm:text-lg text-gray-900 mb-0">{t.stepMockups} ({selectedKeys.length})</h2>
              <p className="font-body text-xs text-gray-500">Multi-select the mockups you want to use</p>
            </div>
            {selectedKeys.length > 0 && (
              <button
                onClick={clearSelection}
                className="text-xs font-body font-semibold text-gray-600 hover:text-gray-900 transition"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            {r2Status !== "ready" ? (
              <p className="text-sm font-body text-gray-400 italic">{r2Status === "loading" ? t.r2Loading : t.chooseFolderFirst}</p>
            ) : !currentFolder ? (
              <p className="text-sm font-body text-gray-400 italic">{t.chooseFolderFirst}</p>
            ) : currentFolder.items.length === 0 ? (
              <p className="text-sm font-body text-gray-400 italic">{t.folderEmpty}</p>
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-body text-gray-600">{t.selectMockupsHint}</p>
                  <button
                    onClick={selectAllInFolder}
                    className="text-xs font-body font-semibold text-gray-700 px-2 py-1 hover:bg-gray-100 rounded text-size transition"
                  >
                    Select all
                  </button>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {currentFolder.items.map((item) => (
                    <MockupTile
                      key={item.key}
                      item={item}
                      selected={selectedKeys.includes(item.key)}
                      onClick={() => toggleKey(item.key)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step 3: Upload Design */}
        <div className="mb-6">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full font-display font-bold text-sm text-white" style={{ backgroundColor: ACCENT.violet }}>
              3
            </div>
            <div className="flex-1">
              <h2 className="font-display font-semibold text-base sm:text-lg text-gray-900 mb-0">{t.stepDesign}</h2>
              <p className="font-body text-xs text-gray-500">Upload your design and adjust placement</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            {entries.length === 0 ? (
              <p className="text-sm font-body text-gray-400 italic">{t.selectMockupFirst}</p>
            ) : (
              <div className="space-y-4">
                {/* Upload Area */}
                <div>
                  <label className="block cursor-pointer">
                    <div
                      className="w-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center py-6 sm:py-8 transition hover:bg-gray-50"
                      style={{ borderColor: designImg ? ACCENT.teal : "#d1d5db", backgroundColor: designImg ? "rgba(0, 194, 168, 0.02)" : "transparent" }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.style.borderColor = ACCENT.violet;
                        e.currentTarget.style.backgroundColor = "rgba(123, 97, 255, 0.05)";
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.style.borderColor = designImg ? ACCENT.teal : "#d1d5db";
                        e.currentTarget.style.backgroundColor = designImg ? "rgba(0, 194, 168, 0.02)" : "transparent";
                      }}
                      onDrop={handleDesignDrop}
                    >
                      {designImg ? (
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-gray-100 flex items-center justify-center mb-1 overflow-hidden border" style={{ borderColor: ACCENT.teal }}>
                            <img src={designImg} alt="design" className="w-full h-full object-contain" />
                          </div>
                          <span className="font-body font-medium text-xs text-gray-900">{t.changeDesign}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <Upload className="w-6 h-6 mb-2" style={{ color: ACCENT.violet }} />
                          <span className="font-body font-medium text-xs text-gray-900 mb-0.5">Drag & drop PNG</span>
                          <span className="font-body text-xs text-gray-500">or Choose File</span>
                        </div>
                      )}
                    </div>
                    <input type="file" accept="image/png,image/webp" className="hidden" onChange={handleDesignUpload} />
                  </label>
                  <p className="text-xs font-body text-gray-500 mt-1">PNG recommended</p>
                </div>

                {/* Selected Mockups Section */}
                {entries.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                      {entries.map((e) => (
                        <button
                          key={e.key}
                          onClick={() => setActiveEntryKey(e.key)}
                          className="px-2 py-1 rounded text-xs font-body font-medium border transition"
                          style={{
                            borderColor: activeEntryKey === e.key ? ACCENT.violet : "#e5e7eb",
                            backgroundColor: activeEntryKey === e.key ? ACCENT.violet : "white",
                            color: activeEntryKey === e.key ? "white" : "#374151",
                          }}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                )}

                {designImg && (
                  <div className="space-y-3">
                    {/* Design Placer */}
                    <div className="flex justify-center">
                      <DesignPlacer
                        designSrc={designImg}
                        referenceSrc={activeSrc}
                        tshirtColor="#d4d4d8"
                        placement={getPlacement(activeEntryKey)}
                        onChange={(next) => setPlacementFor(activeEntryKey, next)}
                      />
                      <p className="text-xs font-body text-gray-500 mt-2 flex items-center gap-1">
                        <Move className="w-3 h-3" /> Drag to adjust
                      </p>
                      {R2_PLACEMENTS_URL && placementsSaveStatus !== "idle" && (
                        <p
                          className="text-xs font-body mt-1 flex items-center gap-1"
                          style={{ color: placementsSaveStatus === "error" ? ACCENT.coral : ACCENT.teal }}
                        >
                          {placementsSaveStatus === "saving" && "💾 Saving..."}
                          {placementsSaveStatus === "saved" && `✓ Saved`}
                          {placementsSaveStatus === "error" && "⚠️ Error"}
                        </p>
                      )}
                    </div>

                    {/* Design Settings */}
                    <div className="border-t border-gray-200 pt-3">
                      <h3 className="text-xs font-display font-semibold text-gray-900 mb-2">Settings</h3>
                      <div className="mb-3">
                        <SliderControl
                          label="Transparency"
                          value={getPlacement(activeEntryKey).opacity}
                          onChange={(v) => setPlacementFor(activeEntryKey, { ...getPlacement(activeEntryKey), opacity: v })}
                          accent={ACCENT.violet}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {dockKeys.length > 0 && (
                  <div className="bg-gray-50 rounded p-2">
                    <DockContent t={t} dockKeys={dockKeys} />
                  </div>
                )}

                <button
                  onClick={() => setGenerated(true)}
                  disabled={!designImg || entries.length === 0}
                  className="w-full font-display font-bold text-white rounded-lg py-3 px-4 flex items-center justify-center gap-2 transition disabled:opacity-50 text-base"
                  style={{ backgroundColor: ACCENT.violet }}
                >
                  <Sparkles className="w-4 h-4" />
                  Generate ({entries.length})
                </button>
                <p className="text-xs font-body text-gray-500 mt-1">~30-60 sec</p>
              </div>
            )}
          </div>
        </div>

        {/* Step 4: Results & Download */}
        {generated && entries.length > 0 && (
          <div className="mb-8 sm:mb-12">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full font-display font-bold text-white" style={{ backgroundColor: ACCENT.violet }}>
                ✓
              </div>
              <div className="flex-1">
                <h2 className="font-display font-semibold text-lg sm:text-xl text-gray-900 mb-1">{t.results}</h2>
                <p className="font-body text-sm text-gray-500">Your mockups are ready to download</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
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
                  disabled={matchedEntries.length === 0 || zipStatus === "zipping"}
                  className="flex items-center gap-1.5 text-xs font-body font-semibold rounded-full px-3 py-1.5 text-white disabled:opacity-40"
                  style={{ backgroundColor: "#1a1a1a" }}
                >
                  <Download className="w-3 h-3" />
                  {zipStatus === "zipping" ? t.zippingAll : t.downloadAll}
                </button>
              </div>
              {zipStatus === "error" && (
                <p className="text-xs font-body rounded-lg px-2.5 py-1.5 mb-2 inline-block" style={{ backgroundColor: "#FFF4EE", color: ACCENT.coral }}>
                  {t.zipError}
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {entries.map((e) => (
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
                    placement={getPlacement(e.key)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation - Mobile Only */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200">
        <div className="flex items-center justify-around py-3">
          <button className="flex flex-col items-center gap-1.5 py-2 px-4 rounded-lg hover:bg-gray-100 transition">
            <span className="text-xl">🏠</span>
            <span className="text-xs font-body text-gray-600">Home</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 py-2 px-4 rounded-lg hover:bg-gray-100 transition" style={{ color: ACCENT.violet }}>
            <Shirt className="w-6 h-6" strokeWidth={2} />
            <span className="text-xs font-body font-semibold" style={{ color: ACCENT.violet }}>Mockups</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 py-2 px-4 rounded-lg hover:bg-gray-100 transition">
            <span className="text-xl">📤</span>
            <span className="text-xs font-body text-gray-600">Uploads</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 py-2 px-4 rounded-lg hover:bg-gray-100 transition">
            <span className="text-xl">❤️</span>
            <span className="text-xs font-body text-gray-600">Favorites</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 py-2 px-4 rounded-lg hover:bg-gray-100 transition">
            <span className="text-xl">⚙️</span>
            <span className="text-xs font-body text-gray-600">Settings</span>
          </button>
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

// Klasör içindeki tek bir mockup görseli — tıklayınca seçime girer/çıkar
function MockupTile({ item, selected, onClick }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      onClick={onClick}
      className="relative text-left rounded-lg border overflow-hidden transition group"
      style={{
        borderColor: selected ? ACCENT.violet : "#e5e7eb",
        boxShadow: selected ? `0 0 0 2px ${ACCENT.violet}` : "none",
      }}
    >
      <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
        {!imgFailed ? (
          <img
            src={mockupSrcFor(item.key)}
            alt={item.label}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <ImageOff className="w-4 h-4 text-gray-300" />
        )}
      </div>
      {selected && (
        <span
          className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: ACCENT.violet }}
        >
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </span>
      )}
      <div className="px-1.5 py-1">
        <p className="font-body text-[10px] text-gray-700 font-medium truncate">{item.label}</p>
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

// Basit düz-vektör tişört silüeti — mockup görseli yüklenemezse yedek olarak gösterilir
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
const PRINT_AREA = { left: 12, top: 20, width: 76, height: 60 };
// Yeni bir mockup ilk kez düzenlenirken tasarımın başlayacağı standart göğüs konumu
const DEFAULT_PLACEMENT = { left: PRINT_AREA.left, top: PRINT_AREA.top, width: PRINT_AREA.width, height: PRINT_AREA.height, opacity: 100 };
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
function DesignPlacer({ designSrc, referenceSrc, tshirtColor, placement, onChange }) {
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
      className="relative w-full max-w-lg aspect-square rounded-lg overflow-hidden bg-gray-100 select-none mx-auto"
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

      {/* Print Area reference — visual guide for design placement */}
      <div
        className="absolute border border-dashed pointer-events-none"
        style={{
          left: `${PRINT_AREA.left}%`,
          top: `${PRINT_AREA.top}%`,
          width: `${PRINT_AREA.width}%`,
          height: `${PRINT_AREA.height}%`,
          borderColor: "rgba(0,0,0,0.35)",
        }}
      />

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
      // Canvas her zaman orijinal mockup çözünürlüğünde oluşturulur — küçük gösterim
      // sadece CSS ile yapılır (w-full h-auto), böylece indirilen dosya kalite kaybetmez.
      canvas.width = mockupImg.width;
      canvas.height = mockupImg.height;
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
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safeFileName(fileKey);
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  // "Tümünü İndir" (zip) için — canvas'ı olduğu tam çözünürlükte bir Blob olarak döner
  function getBlob() {
    const canvas = canvasRef.current;
    if (!canvas || !hasImage) return Promise.resolve(null);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  }

  useImperativeHandle(ref, () => ({ download, getBlob }));

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

// ============================================================
// Main App Component with Auth
// ============================================================
export default function App() {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={(user) => {
          setCurrentUser(user);
        }}
      />
    );
  }

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
  };

  return (
    <div>
      {/* User Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          padding: "12px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "14px",
          borderBottom: "1px solid rgba(0,0,0,0.1)",
        }}
      >
        <div>
          <span style={{ fontWeight: "600" }}>👤 {currentUser.name}</span>
          {currentUser.role === "admin" && (
            <span
              style={{
                marginLeft: "8px",
                padding: "2px 8px",
                background: "rgba(255,255,255,0.2)",
                borderRadius: "4px",
                fontSize: "12px",
              }}
            >
              Admin
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {currentUser.role === "admin" && (
            <button
              onClick={() => setAdminPanelOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                background: "rgba(255,255,255,0.15)",
                border: "none",
                color: "white",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "500",
                transition: "all 200ms",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(255,255,255,0.25)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "rgba(255,255,255,0.15)";
              }}
            >
              ⚙️ Admin Panel
            </button>
          )}
          <button
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "white",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: "500",
              transition: "all 200ms",
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(255,255,255,0.25)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "rgba(255,255,255,0.15)";
            }}
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>

      {/* Admin Panel Modal */}
      {adminPanelOpen && <AdminPanel onClose={() => setAdminPanelOpen(false)} />}

      {/* Main App */}
      <MockupStudio />
    </div>
  );
}
