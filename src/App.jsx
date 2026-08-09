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
  ZoomIn,
} from "lucide-react";
import { LoginPage } from "./LoginPage";
import { AdminPanel } from "./AdminPanel";
import { getCurrentUser, logout, getUserR2Path } from "./auth";
import {
  createLockStore,
  importPlacements,
  fromLegacy,
  resolvePlacement,
  forgetTemplateMeasurement,
  loadImage,
  toBox,
  fromBox,
  deriveHeight,
} from "./placement/index.js";
import { renderMockup } from "./placement/compositor.js";

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

// Labels for the authenticated shell around the studio (header + admin
// entry point). Separate from the studio dictionary because App renders them.
const SHELL_T = {
  en: { adminPanel: "Admin Panel", logout: "Logout" },
  tr: { adminPanel: "Admin Paneli", logout: "Çıkış" },
  de: { adminPanel: "Admin-Panel", logout: "Abmelden" },
};

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
    enlarge: "Büyüt",
    generatePending: "Yeni mockupları üret",
    autoPlaceOne: "Bunu yeniden yerleştir",
    keepsExisting: "Üretilmiş mockuplar olduğu gibi kalır",
    generateOne: "Sadece bunu üret",
    regenerateOne: "Bunu yeniden üret",
    zoomHint: "Detay için imleci görselin üzerinde gezdir · ← → ile gez · ESC kapatır",
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
    enlarge: "Vergrößern",
    generatePending: "Neue Mockups erzeugen",
    autoPlaceOne: "Dieses neu platzieren",
    keepsExisting: "Fertige Mockups bleiben unverändert",
    generateOne: "Nur dieses erzeugen",
    regenerateOne: "Dieses neu erzeugen",
    zoomHint: "Zum Vergrößern über das Bild fahren · ← → blättern · ESC schließt",
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
    enlarge: "Enlarge",
    generatePending: "Generate new",
    autoPlaceOne: "Auto-place this one again",
    keepsExisting: "Already-generated mockups stay as they are",
    generateOne: "Generate just this one",
    regenerateOne: "Regenerate this one",
    zoomHint: "Hover the image to magnify · ← → to browse · ESC to close",
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

// The language is owned by App rather than by the studio, because the admin
// panel lives outside the studio and has to follow the same switch.
function MockupStudio({ lang, setLang }) {
  const [langOpen, setLangOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Klasör-bazlı akış: R2'deki klasörler set'tir, içindeki her görsel bir mockup'tır.
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);

  const [designImg, setDesignImg] = useState(null);
  // Placement geometry lives in a Template Lock store, not in component state.
  // A lock is per-mockup and artwork-independent, so it is measured once and
  // then reused for every design that is ever uploaded onto that template.
  const locksRef = useRef(createLockStore());
  // key -> { placement, artwork, imageAspect, report } produced by the pipeline
  const [resolved, setResolved] = useState({});
  const [activeEntryKey, setActiveEntryKey] = useState(null);
  const [placementsSaveStatus, setPlacementsSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [placementStatus, setPlacementStatus] = useState("idle"); // idle | analyzing | ready
  const placementsLoadedRef = useRef(false);
  const saveTimerRef = useRef(null);
  // Templates this tab changed. Only these are written back, so a record
  // deleted remotely is not resurrected by a stale in-memory store.
  const dirtyKeysRef = useRef(new Set());
  // Which mockups have been composited, as file key → generation stamp.
  //
  // This was a single boolean plus one global counter, which meant every press
  // of Generate re-composited every tile. Working across two or three folders
  // made the cost obvious: adding a second folder's mockups hid the finished
  // results and redrew all of them, including the ones that were already
  // right. A stamp per mockup lets a press touch only what has not been
  // rendered yet, and lets one mockup be rendered on its own.
  //
  // A tile re-renders when its own stamp changes, so bumping one key leaves
  // every other tile's canvas untouched.
  const [stamps, setStamps] = useState({});
  const stampRef = useRef(0);
  const nextStamp = () => ++stampRef.current;
  // Bumped to force the resolver to run again after locks are cleared.
  const [resolveNonce, setResolveNonce] = useState(0);
  const [zipStatus, setZipStatus] = useState("idle"); // idle | zipping | error
  // Which result is open in the full-size viewer, by file key. Stored as a key
  // rather than an index so re-ordering or re-generating the grid cannot leave
  // the viewer pointing at a different mockup than the one that was clicked.
  const [lightboxKey, setLightboxKey] = useState(null);
  // Which single mockup is being re-detected right now, so its tile can show
  // the work and a second click cannot start an overlapping run.
  const [autoPlacingKey, setAutoPlacingKey] = useState(null);

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

  // Load saved template locks. Records written by older builds are in the
  // percent-box format; importPlacements migrates them and marks every one as
  // a *pinned* lock, because the only reason such a record exists is that a
  // human dragged the design there. Those hand-calibrations outrank anything
  // the solver produces and are never overwritten.
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
        const imported = importPlacements(data, fromLegacy);
        locksRef.current = createLockStore(imported);
        console.log(`[placement] imported ${Object.keys(imported).length} template lock(s)`);
      })
      .catch(() => {
        // Read failed — drag/drop still works, it just won't persist.
      })
      .finally(() => {
        if (!cancelled) placementsLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced persistence, called explicitly whenever a lock changes rather
  // than by watching a state object. Locks live in a ref, so an effect on
  // state would miss solver-written locks entirely.
  //
  // Writes are a MERGE of the current remote file with only the templates this
  // tab actually touched. Blindly PUTting the whole in-memory store meant a
  // long-open tab resurrected records that had been deleted elsewhere — and
  // silently clobbered calibration done in another tab. Tracking a dirty set
  // makes a remote delete stick, and makes two tabs additive instead of
  // last-writer-wins.
  function persistLocks() {
    if (!R2_PLACEMENTS_URL || !placementsLoadedRef.current) return;
    if (dirtyKeysRef.current.size === 0) return;
    setPlacementsSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const dirty = Array.from(dirtyKeysRef.current);
      try {
        // Re-read immediately before writing so we merge onto current truth.
        let remote = {};
        try {
          const res = await fetch(R2_PLACEMENTS_URL);
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data === "object") remote = data;
          }
        } catch {
          // Unreadable remote — fall through and write just our own changes.
        }

        const store = locksRef.current;
        const merged = { ...remote };
        for (const key of dirty) {
          const lock = store.get(key);
          if (lock) merged[key] = lock;
        }

        const res = await fetch(R2_PLACEMENTS_URL, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(merged),
        });
        if (!res.ok) throw new Error(`save failed: ${res.status}`);
        dirtyKeysRef.current.clear();
        setPlacementsSaveStatus("saved");
      } catch {
        setPlacementsSaveStatus("error");
      }
    }, 900);
  }

  /** Mark a template as changed by this tab so persistLocks will write it. */
  function markDirty(key) {
    dirtyKeysRef.current.add(key);
  }

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

  // Selecting more mockups no longer discards the results already on screen.
  // A mockup's stamp is kept even while it is deselected, so unticking and
  // reticking one brings its finished render straight back.
  function toggleKey(key) {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }
  function selectAllInFolder() {
    if (!currentFolder) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const item of currentFolder.items) next.add(item.key);
      return Array.from(next);
    });
  }
  function clearSelection() {
    setSelectedKeys([]);
    setStamps({});
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

  // Selection order is preserved, so mockups added from a second folder land
  // after the ones already on screen rather than reshuffling them.
  const generatedEntries = entries.filter((e) => stamps[e.key]);
  const pendingEntries = matchedEntries.filter((e) => !stamps[e.key]);
  const generated = generatedEntries.length > 0;
  // Two folders can both hold a "White.png". Once results span more than one,
  // the file name alone stops identifying a tile.
  const showFolder = new Set(generatedEntries.map((e) => e.folder)).size > 1;

  // Hangi mockup fotoğrafının şu an düzenlendiğini, seçim değiştikçe geçerli tutar
  useEffect(() => {
    setActiveEntryKey((prev) => {
      if (entries.length === 0) return null;
      if (prev && entries.some((e) => e.key === prev)) return prev;
      return entries[0].key;
    });
  }, [entries]);

  const activeSrc = entries.find((e) => e.key === activeEntryKey)?.src ?? null;

  // ---- placement resolution -------------------------------------------
  // Runs the pipeline once per (template, artwork) pair. A template that
  // already has a lock skips detection entirely; one that does not is measured
  // and then locked, so it never gets measured again.
  const entriesSignature = entries.map((e) => e.key).join("|");

  // Which templates have been resolved against the design currently loaded.
  // Reset when the design changes or a re-measure is forced; otherwise it is
  // what keeps a second folder's arrival from re-analysing the first folder.
  const analysedRef = useRef({ design: null, nonce: -1, keys: new Set() });

  useEffect(() => {
    if (!designImg || entries.length === 0) return;
    let cancelled = false;

    // A new artwork or a forced re-measure invalidates everything; adding
    // mockups to the selection invalidates nothing that was already done.
    const memo = analysedRef.current;
    if (memo.design !== designImg || memo.nonce !== resolveNonce) {
      analysedRef.current = { design: designImg, nonce: resolveNonce, keys: new Set() };
    }
    const analysed = analysedRef.current.keys;
    const todo = entries.filter((e) => e.src && !analysed.has(e.key));
    if (todo.length === 0) return;

    (async () => {
      setPlacementStatus("analyzing");
      let solvedAny = false;

      for (const entry of todo) {
        if (cancelled) return;
        try {
          const result = await resolvePlacement({
            templateId: entry.key,
            mockupSrc: entry.src,
            artworkSrc: designImg,
            locks: locksRef.current,
            opacity: 100,
            log: (msg) => console.log(msg),
          });
          if (cancelled) return;
          if (result.report.tier === "solved") {
            solvedAny = true;
            markDirty(entry.key);
          }
          analysed.add(entry.key);
          setResolved((prev) => ({ ...prev, [entry.key]: result }));
        } catch (err) {
          console.error(`[placement] ${entry.key} failed:`, err.message);
        }
      }

      if (!cancelled) {
        setPlacementStatus("ready");
        // Newly measured templates produced new locks worth persisting.
        if (solvedAny) persistLocks();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designImg, entriesSignature, resolveNonce]);

  const activeResolved = activeEntryKey ? resolved[activeEntryKey] : null;

  /**
   * A human moved or resized the design. That is ground truth: pin it, so the
   * solver never touches this template again and every future artwork lands in
   * the same place.
   */
  function handleManualPlacement(key, box) {
    const current = resolved[key];
    if (!current) return;

    // Rotation now comes from the box, because the rotate handle writes it
    // there. Taking it from the previous placement would silently discard
    // every rotation the user just made.
    const placement = fromBox(
      { ...box, rotation: box.rotation ?? current.placement.rotation, opacity: current.placement.opacity },
      "manual",
    );
    placement.perspective = current.placement.perspective;

    const height = deriveHeight(placement.width, current.artwork.visibleAspect, current.imageAspect);
    locksRef.current.setPinned(key, placement, height);
    markDirty(key);

    setResolved((prev) => ({ ...prev, [key]: { ...prev[key], placement } }));
    persistLocks();
  }

  /**
   * Opacity applies to every selected mockup at once.
   *
   * It is a property of how the artwork is printed, not of any one photograph,
   * so a POD listing wants it uniform across the whole colour range — setting
   * it twelve times to keep a set consistent was busywork. It is also a render
   * property rather than geometry, so it never touches the template locks.
   */
  function setOpacityForAll(opacity) {
    setResolved((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], placement: { ...next[key].placement, opacity } };
      }
      return next;
    });
  }

  /** Render whatever has not been rendered yet, leaving finished tiles alone. */
  function runGenerate() {
    const stamp = nextStamp();
    setStamps((prev) => {
      const next = { ...prev };
      for (const e of matchedEntries) if (!next[e.key]) next[e.key] = stamp;
      return next;
    });
  }

  /** Render every selected mockup again, including ones already done. */
  function regenerateAll() {
    const stamp = nextStamp();
    setStamps((prev) => {
      const next = { ...prev };
      for (const e of matchedEntries) next[e.key] = stamp;
      return next;
    });
  }

  /** Render a single mockup, without touching any other tile. */
  function generateOne(key) {
    if (!key) return;
    setStamps((prev) => ({ ...prev, [key]: nextStamp() }));
  }

  /**
   * Throw away what we know about the selected mockups and measure them again.
   *
   * Pressing Generate a second time only ever repainted, which looked like a
   * dead button: the results are already live, so redrawing produced pixel-
   * identical output. The only thing that can visibly change a finished mockup
   * is re-running detection, so that is what this does — it clears the locks
   * and the cached geometry for the selected templates and lets the pipeline
   * measure from scratch.
   *
   * Hand calibration is discarded for those templates, which is the point:
   * this is the escape hatch back to automatic placement.
   */
  function reAutoPlace() {
    for (const key of selectedKeys) {
      locksRef.current.clear(key);
      forgetTemplateMeasurement(key);
      markDirty(key);
    }
    setResolved((prev) => {
      const next = { ...prev };
      for (const key of selectedKeys) delete next[key];
      return next;
    });
    setResolveNonce((n) => n + 1);
  }

  /**
   * Re-detect the placement for one mockup, leaving every other one alone.
   *
   * Spotting a single bad placement in a grid of twelve used to mean discarding
   * the whole set's geometry to fix it — including the ones that were hand
   * calibrated. Because a lock is per-template, forgetting exactly one is well
   * defined: this template is measured again from its own photograph, and
   * nothing else in the set is touched.
   *
   * The tile repaints on its own, without a stamp bump, because its render
   * effect already depends on its resolved placement.
   */
  async function autoPlaceOne(key) {
    const entry = entries.find((e) => e.key === key);
    if (!entry?.src || !designImg || autoPlacingKey) return;

    setAutoPlacingKey(key);
    locksRef.current.clear(key);
    forgetTemplateMeasurement(key);
    markDirty(key);
    // Drop it from the resolver's memo too, or the incremental pass would
    // consider this template already done and skip it.
    analysedRef.current.keys.delete(key);

    try {
      const result = await resolvePlacement({
        templateId: key,
        mockupSrc: entry.src,
        artworkSrc: designImg,
        locks: locksRef.current,
        opacity: resolved[key]?.placement.opacity ?? 100,
        log: (msg) => console.log(msg),
      });
      analysedRef.current.keys.add(key);
      setResolved((prev) => ({ ...prev, [key]: result }));
      if (result.report.tier === "solved") persistLocks();
    } catch (err) {
      console.error(`[placement] ${key} re-place failed:`, err.message);
    } finally {
      setAutoPlacingKey(null);
    }
  }

  /**
   * Copy the active template's calibrated geometry to every selected mockup.
   * Because placements are normalized, the same centre and width transfer
   * correctly across mockups of different pixel dimensions.
   */
  function applyPlacementToAll() {
    const source = resolved[activeEntryKey];
    if (!source) return;

    setResolved((prev) => {
      const next = { ...prev };
      for (const key of selectedKeys) {
        const target = next[key];
        if (!target) continue;
        // Reuse centre, width and rotation; height re-derives from this
        // template's own aspect ratio so nothing is stretched.
        const placement = {
          ...target.placement,
          centerX: source.placement.centerX,
          centerY: source.placement.centerY,
          width: source.placement.width,
          rotation: source.placement.rotation,
          source: "manual",
          confidence: 1,
        };
        const height = deriveHeight(placement.width, target.artwork.visibleAspect, target.imageAspect);
        locksRef.current.setPinned(key, placement, height);
        markDirty(key);
        next[key] = { ...target, placement };
      }
      return next;
    });
    persistLocks();
  }

  async function handleDesignUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    setDesignImg(dataUrl);
    // A different design invalidates every rendered tile.
    setStamps({});
  }

  async function handleDesignDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataURL(file);
    setDesignImg(dataUrl);
    // A different design invalidates every rendered tile.
    setStamps({});
  }

  async function handleDownloadAll() {
    if (zipStatus === "zipping") return;
    setZipStatus("zipping");
    try {
      const zip = new JSZip();
      const usedNames = new Set();
      for (const e of generatedEntries) {
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
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-body { font-family: 'Inter', sans-serif; }
        .font-mono2 { font-family: 'JetBrains Mono', monospace; }
        /* list-none covers Firefox; WebKit needs its own marker suppressed. */
        summary::-webkit-details-marker { display: none; }
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
                          resolved={activeResolved}
                          status={placementStatus}
                          onChange={(box) => handleManualPlacement(activeEntryKey, box)}
                        />
                        <div className="mt-3 flex flex-col gap-2">
                          <p className="text-xs font-body text-gray-500 flex items-center gap-1">
                            <Move className="w-3 h-3" /> Drag to adjust
                          </p>
                          {activeResolved && (
                            <PlacementReport resolved={activeResolved} />
                          )}
                          {/* Render just the mockup being looked at. Useful
                              after nudging one placement, and for checking a
                              single shot without waiting on the whole set. */}
                          {activeEntryKey && activeResolved && (
                            <button
                              onClick={() => generateOne(activeEntryKey)}
                              className="px-3 py-2 rounded-lg text-xs font-semibold text-white transition flex items-center justify-center gap-1.5"
                              style={{ backgroundColor: ACCENT.violet }}
                              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                            >
                              <Sparkles className="w-3 h-3" />
                              {stamps[activeEntryKey] ? t.regenerateOne : t.generateOne}
                            </button>
                          )}
                          {selectedKeys.length > 1 && (
                            <button
                              onClick={applyPlacementToAll}
                              className="px-3 py-2 rounded-lg text-xs font-semibold text-white transition"
                              style={{ backgroundColor: ACCENT.teal }}
                              onMouseEnter={(e) => (e.target.style.opacity = "0.9")}
                              onMouseLeave={(e) => (e.target.style.opacity = "1")}
                            >
                              ✓ Apply to all {selectedKeys.length} mockups
                            </button>
                          )}
                        </div>
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
                          label={
                            entries.length > 1
                              ? `Transparency · all ${entries.length} mockups`
                              : "Transparency"
                          }
                          value={activeResolved?.placement.opacity ?? 100}
                          onChange={setOpacityForAll}
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

                {/* With nothing pending the button falls back to redoing the
                    whole set, which is what it always did. */}
                <button
                  onClick={pendingEntries.length > 0 ? runGenerate : regenerateAll}
                  disabled={!designImg || matchedEntries.length === 0}
                  className="w-full font-display font-bold text-white rounded-lg py-3 px-4 flex items-center justify-center gap-2 transition disabled:opacity-50 text-base"
                  style={{ backgroundColor: ACCENT.violet }}
                >
                  <Sparkles className="w-4 h-4" />
                  {pendingEntries.length === 0
                    ? `Regenerate (${matchedEntries.length})`
                    : generated
                      ? `${t.generatePending} (${pendingEntries.length})`
                      : `Generate (${pendingEntries.length})`}
                </button>
                <p className="text-xs font-body text-gray-500 mt-1">
                  {pendingEntries.length === 0
                    ? "Adjust a placement above, then regenerate"
                    : generated
                      ? t.keepsExisting
                      : "~30-60 sec"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Step 4: Results & Download */}
        {generatedEntries.length > 0 && (
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
                <div className="flex items-center gap-2">
                  {/* Reachable from the results themselves — spotting a bad
                      placement here shouldn't mean scrolling back up. */}
                  <button
                    onClick={reAutoPlace}
                    title="Discard manual adjustments on the selected mockups and detect placement again"
                    className="flex items-center gap-1.5 text-xs font-body font-semibold rounded-full px-3 py-1.5 border transition hover:bg-gray-50"
                    style={{ borderColor: ACCENT.violet, color: ACCENT.violet }}
                  >
                    <Sparkles className="w-3 h-3" />
                    Auto-place again
                  </button>
                <button
                  onClick={handleDownloadAll}
                  disabled={generatedEntries.length === 0 || zipStatus === "zipping"}
                  className="flex items-center gap-1.5 text-xs font-body font-semibold rounded-full px-3 py-1.5 text-white disabled:opacity-40"
                  style={{ backgroundColor: "#1a1a1a" }}
                >
                  <Download className="w-3 h-3" />
                  {zipStatus === "zipping" ? t.zippingAll : t.downloadAll}
                </button>
                </div>
              </div>
              {zipStatus === "error" && (
                <p className="text-xs font-body rounded-lg px-2.5 py-1.5 mb-2 inline-block" style={{ backgroundColor: "#FFF4EE", color: ACCENT.coral }}>
                  {t.zipError}
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {generatedEntries.map((e) => (
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
                    resolved={resolved[e.key]}
                    folder={showFolder ? e.folder : null}
                    stamp={stamps[e.key]}
                    onOpen={() => setLightboxKey(e.key)}
                    onAutoPlace={() => autoPlaceOne(e.key)}
                    autoPlacing={autoPlacingKey === e.key}
                    t={t}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {lightboxKey && (
        <ResultLightbox
          entries={entries}
          activeKey={lightboxKey}
          onNavigate={setLightboxKey}
          onClose={() => setLightboxKey(null)}
          previewRefs={previewRefs}
          t={t}
        />
      )}

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

/**
 * The selected-file list, collapsed by default.
 *
 * It is reference information rather than a control, and at a dozen-plus
 * mockups the full list pushed the actual controls off screen. A native
 * <details> keeps it one click away — and keeps it in the DOM, so nothing that
 * reads from it changes behaviour.
 */
function DockContent({ t, dockKeys }) {
  return (
    <details className="group">
      <summary className="flex items-center gap-1.5 cursor-pointer list-none select-none">
        <ChevronDown className="w-3 h-3 text-gray-400 transition-transform group-open:rotate-180" />
        <span className="text-[11px] tracking-[0.15em] uppercase text-gray-400 font-mono2">
          {t.dockLabel}
          {dockKeys.length > 0 && ` (${dockKeys.length})`}
        </span>
      </summary>
      <div className="mt-2">
        {dockKeys.length > 0 ? (
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {dockKeys.map((k) => (
              <li
                key={k}
                className="font-mono2 text-[11px] break-all bg-white rounded px-2 py-1 text-gray-600"
              >
                {k}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-body text-gray-400 italic">{t.dockEmpty}</p>
        )}
      </div>
    </details>
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
        {/* Weight is set inline rather than through a utility class.
            Tailwind's font-bold resolves through --font-weight-bold, and a
            monospace face at 10-11px makes even a correct 400→700 step hard to
            perceive — two rounds of "it didn't change". A direct declaration
            removes the indirection, and 800 with a darker colour is a step
            nobody has to squint at. */}
        <span
          className="font-mono2 uppercase tracking-wide"
          style={{ fontSize: "12px", fontWeight: 800, color: "#111827" }}
        >
          {label}
        </span>
        <span
          className="font-mono2"
          style={{ fontSize: "12px", fontWeight: 800, color: "#374151" }}
        >
          {value}%
        </span>
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

/**
 * Rotation grips, sitting just outside each corner.
 *
 * Placing them diagonally outward keeps them clear of the resize squares they
 * share a corner with, which is the convention every design tool uses — so the
 * gesture is discoverable without a mode switch or a modifier key.
 */
const ROTATE_HANDLES = [
  { id: "rot-nw", left: "0%", top: "0%", dx: -15, dy: -15 },
  { id: "rot-ne", left: "100%", top: "0%", dx: 15, dy: -15 },
  { id: "rot-se", left: "100%", top: "100%", dx: 15, dy: 15 },
  { id: "rot-sw", left: "0%", top: "100%", dx: -15, dy: 15 },
];

/** Wrap to (-180, 180] so a full turn reads as 0 rather than 360. */
function normalizeAngle(deg) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * Resize preserving aspect ratio.
 *
 * Only the width is ever solved for; the height follows from the artwork's own
 * ratio. That is why dragging a corner can no longer stretch a design — there
 * is no code path that sets height independently. The opposite corner or edge
 * stays pinned so the box grows from where the user grabbed it.
 */
function resizeBox(start, mode, dxPct, dyPct) {
  const ratio = start.width / start.height;
  if (!(ratio > 0)) return start;

  const fromHoriz = mode.includes("e")
    ? start.width + dxPct
    : mode.includes("w")
      ? start.width - dxPct
      : null;
  const fromVert = mode.includes("n")
    ? (start.height - dyPct) * ratio
    : mode.includes("s")
      ? (start.height + dyPct) * ratio
      : null;

  let width;
  if (fromHoriz !== null && fromVert !== null) width = (fromHoriz + fromVert) / 2;
  else if (fromHoriz !== null) width = fromHoriz;
  else if (fromVert !== null) width = fromVert;
  else return start;

  width = clamp(width, 4, 160);
  const height = width / ratio;

  let left = start.left;
  let top = start.top;
  if (mode.includes("w")) left = start.left + start.width - width;
  else if (!mode.includes("e")) left = start.left + (start.width - width) / 2;
  if (mode.includes("n")) top = start.top + start.height - height;
  else if (!mode.includes("s")) top = start.top + (start.height - height) / 2;

  return { ...start, left, top, width, height };
}

/**
 * Live preview with drag/resize.
 *
 * This component no longer computes placement. It receives a resolved result
 * from the pipeline and reports user edits back up. Removing the detection
 * effect that used to live here is what stopped placement from changing on its
 * own between renders.
 */
function DesignPlacer({ designSrc, referenceSrc, tshirtColor, resolved, status, onChange }) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const [refFailed, setRefFailed] = useState(false);
  const [liveBox, setLiveBox] = useState(null);

  useEffect(() => {
    setRefFailed(false);
  }, [referenceSrc]);

  // Drop the local drag box whenever the pipeline hands us new geometry.
  useEffect(() => {
    setLiveBox(null);
  }, [resolved?.placement]);

  // Paint the preview through the export compositor.
  //
  // Dragging updates `liveBox` many times a second, so the placement fed to the
  // renderer is rebuilt from that rather than from `resolved` — otherwise the
  // photograph would lag a drag by a whole commit.
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !referenceSrc || !resolved) return;
    let cancelled = false;

    (async () => {
      try {
        const mockupImage = await loadImage(referenceSrc);
        if (cancelled) return;

        // Preview resolution: enough to judge placement, small enough that a
        // drag stays responsive. The export still renders at full size.
        const long = 1000;
        const aspect = resolved.imageAspect;
        canvas.width = aspect >= 1 ? long : Math.round(long * aspect);
        canvas.height = aspect >= 1 ? Math.round(long / aspect) : long;
        const ctx = canvas.getContext("2d");

        const placement = liveBox
          ? { ...fromBox(liveBox, "manual"), perspective: resolved.placement.perspective }
          : resolved.placement;

        if (!designSrc) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(mockupImage, 0, 0, canvas.width, canvas.height);
          return;
        }

        const artworkImage = await loadImage(designSrc, false);
        if (cancelled) return;
        renderMockup(ctx, mockupImage, artworkImage, resolved.artwork, placement);
      } catch {
        if (!cancelled) setRefFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [referenceSrc, designSrc, resolved, liveBox]);

  const box = useMemo(() => {
    if (liveBox) return liveBox;
    if (!resolved) return null;
    return toBox(resolved.placement, resolved.artwork.visibleAspect, resolved.imageAspect);
  }, [liveBox, resolved]);

  useEffect(() => {
    function onMove(e) {
      const drag = dragRef.current;
      if (!drag || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      let next;
      if (drag.mode === "rotate") {
        // Angle swept around the box centre since the grip was grabbed.
        const angle =
          (Math.atan2(e.clientY - drag.center.y, e.clientX - drag.center.x) * 180) / Math.PI;
        let rotation = normalizeAngle(drag.startRotation + (angle - drag.startAngle));

        // Shift snaps to 15° steps; otherwise a small dead zone around 0 makes
        // it easy to get back to perfectly straight, which is where a chest
        // print almost always belongs.
        if (e.shiftKey) rotation = Math.round(rotation / 15) * 15;
        else if (Math.abs(rotation) < 2) rotation = 0;

        next = { ...drag.start, rotation };
      } else {
        const dxRaw = e.clientX - drag.startX;
        const dyRaw = e.clientY - drag.startY;

        if (drag.mode === "move") {
          next = {
            ...drag.start,
            left: drag.start.left + (dxRaw / rect.width) * 100,
            top: drag.start.top + (dyRaw / rect.height) * 100,
          };
        } else {
          // Resize is defined in the box's own frame. On a rotated box the
          // pointer delta has to be rotated back by the same angle first, or
          // dragging a corner pulls in a direction the user did not point.
          const rad = (-(drag.start.rotation ?? 0) * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const localX = dxRaw * cos - dyRaw * sin;
          const localY = dxRaw * sin + dyRaw * cos;
          next = resizeBox(
            drag.start,
            drag.mode,
            (localX / rect.width) * 100,
            (localY / rect.height) * 100,
          );
        }
      }

      setLiveBox(next);
      drag.latest = next;
    }
    function onUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      // Commit once on release rather than on every pointer move, so a single
      // drag writes a single lock and a single save.
      if (drag?.latest) onChange(drag.latest);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onChange]);

  function startDrag(mode, e) {
    if (!box) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, start: { ...box }, latest: null };
  }

  function startRotate(e) {
    if (!box || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    // Rotation pivots on the box centre — the same origin the CSS transform and
    // the canvas compositor both use, so preview and export stay identical.
    const center = {
      x: rect.left + ((box.left + box.width / 2) / 100) * rect.width,
      y: rect.top + ((box.top + box.height / 2) / 100) * rect.height,
    };
    dragRef.current = {
      mode: "rotate",
      center,
      startAngle: (Math.atan2(e.clientY - center.y, e.clientX - center.x) * 180) / Math.PI,
      startRotation: box.rotation ?? 0,
      start: { ...box },
      latest: null,
    };
  }

  /** Double-click any rotation grip to snap back to straight. */
  function resetRotation(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!box) return;
    const next = { ...box, rotation: 0 };
    setLiveBox(next);
    onChange(next);
  }

  const chest = resolved?.chest;

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-lg rounded-lg overflow-hidden bg-gray-100 select-none mx-auto"
      style={{
        touchAction: "none",
        // The container must match the mockup's own aspect ratio.
        //
        // It used to be forced square while the photo was drawn with
        // object-contain, which letterboxed anything non-square. Placement
        // percentages are relative to this container, but the exported canvas
        // treats them as fractions of the *image* — so every letterboxed
        // mockup exported at a different position than the editor showed.
        // Matching the ratio makes the image fill the box exactly, and the two
        // coordinate systems become the same one.
        aspectRatio: resolved ? String(resolved.imageAspect) : "1",
      }}
    >
      {/*
        The preview is drawn by the same compositor the export uses.

        It used to be CSS: an <img> for the photograph and another for the
        design, positioned by trim ratios that mirrored the canvas arithmetic.
        Mirrored logic drifts — percentage lengths resolve against padding
        boxes, borders participate in box sizing, object-fit has its own
        rules — and every drift showed up as "the preview looks wrong but the
        export is fine". Rendering both through renderMockup makes them the
        same pixels by construction rather than by agreement, and it is what
        will let the perspective warp be shown at all.
      */}
      {referenceSrc && !refFailed ? (
        <canvas
          ref={previewCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      ) : (
        <TShirtSilhouette color={tshirtColor} />
      )}

      {/* The print area. Every design is fitted inside this rectangle keeping
          its own proportions, so it — not the artwork's aspect ratio — decides
          how large a print comes out. Labelled because the distinction between
          this and the design box below drives the whole mental model. */}
      {chest && (
        <div
          className="absolute border border-dashed pointer-events-none"
          style={{
            left: `${(chest.centerX - chest.width / 2) * 100}%`,
            top: `${(chest.centerY - chest.height / 2) * 100}%`,
            width: `${chest.width * 100}%`,
            height: `${chest.height * 100}%`,
            borderColor: "rgba(0,194,168,0.7)",
          }}
        >
          <span
            className="absolute font-mono2 uppercase whitespace-nowrap px-1 rounded-sm"
            style={{
              left: 0, top: 0, transform: "translateY(-115%)",
              fontSize: "9px", letterSpacing: "0.08em",
              color: "#fff", backgroundColor: ACCENT.teal,
            }}
          >
            Print area
          </span>
        </div>
      )}

      {status === "analyzing" && !resolved && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
          <span className="font-body text-xs text-gray-600">Analyzing shirt…</span>
        </div>
      )}

      {designSrc && box && (
        <div
          onPointerDown={(e) => startDrag("move", e)}
          className="absolute cursor-move border-2 border-dashed"
          style={{
            left: `${box.left}%`,
            top: `${box.top}%`,
            width: `${box.width}%`,
            height: `${box.height}%`,
            borderColor: ACCENT.violet,
            transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
          }}
        >
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

          {/* Rotation grips, just outside the corners. Round, teal and
              offset so they never get confused with the square resize
              handles they sit beside. */}
          {ROTATE_HANDLES.map((h) => (
            <div
              key={h.id}
              onPointerDown={startRotate}
              onDoubleClick={resetRotation}
              title="Drag to rotate · Shift for 15° steps · double-click to straighten"
              className="absolute w-4 h-4 rounded-full bg-white border-2 flex items-center justify-center"
              style={{
                left: h.left,
                top: h.top,
                borderColor: ACCENT.teal,
                cursor: "grab",
                transform: `translate(calc(-50% + ${h.dx}px), calc(-50% + ${h.dy}px))`,
              }}
            >
              <span
                className="block rounded-full"
                style={{ width: 4, height: 4, backgroundColor: ACCENT.teal }}
              />
            </div>
          ))}

          {/* Live angle readout while rotating. */}
          {box.rotation ? (
            <span
              className="absolute font-mono2 text-[10px] px-1.5 py-0.5 rounded text-white pointer-events-none whitespace-nowrap"
              style={{
                left: "50%",
                top: "100%",
                transform: "translate(-50%, 10px)",
                backgroundColor: ACCENT.teal,
              }}
            >
              {box.rotation.toFixed(1)}°
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Compact readout of what the pipeline measured and decided. */
function PlacementReport({ resolved }) {
  const { report, artwork, placement } = resolved;
  const tierLabel =
    report.tier === "locked"
      ? report.lockKind === "pinned"
        ? "Locked (calibrated)"
        : "Locked (measured)"
      : report.tier === "solved"
        ? "Measured"
        : "Fallback";
  const tierColor =
    report.tier === "fallback" ? ACCENT.coral : report.tier === "locked" ? ACCENT.teal : ACCENT.violet;

  const failures = report.validation?.failures ?? [];

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tierColor }} />
        <span className="font-body text-[11px] font-semibold text-gray-800">{tierLabel}</span>
      </div>
      <p className="font-mono2 text-[10px] text-gray-500 leading-relaxed">
        {artwork.orientation} · ratio {artwork.visibleAspect.toFixed(2)}
        {artwork.paddingRatio > 0.02 && ` · trimmed ${(artwork.paddingRatio * 100).toFixed(0)}% padding`}
      </p>
      {report.analysis && (
        <p className="font-mono2 text-[10px] text-gray-500 leading-relaxed">
          {report.analysis.pose} · {report.analysis.cameraAngle}
          {report.analysis.occluded && " · chest partly covered"}
        </p>
      )}
      {resolved.chest && (
        <p className="font-mono2 text-[10px] text-gray-500">
          print area {(resolved.chest.width * 100).toFixed(1)}% ×{" "}
          {(resolved.chest.height * 100).toFixed(1)}%
        </p>
      )}
      <p className="font-mono2 text-[10px] text-gray-400">
        design w {(placement.width * 100).toFixed(1)}%
        {placement.rotation ? ` · ${placement.rotation.toFixed(1)}°` : ""}
        {placement.perspective ? " · warped" : ""}
      </p>
      {failures.length > 0 && (
        <p className="font-mono2 text-[10px]" style={{ color: ACCENT.coral }}>
          corrected: {failures.join(", ")}
        </p>
      )}
    </div>
  );
}

/**
 * How far the viewer's magnifier goes past fit-to-screen.
 *
 * The canvas is composited at the mockup's full resolution and only scaled down
 * for display, so magnifying reveals real pixels rather than an upscale. Fitted
 * to the viewport a 4000px mockup already shows at roughly 20%, so 3x lands
 * near 60% of native — a close look at the print edge with detail to spare.
 */
const ZOOM_FACTOR = 3;

/**
 * Full-size viewer for one generated mockup.
 *
 * The pixels come from the tile's own canvas rather than being re-composited,
 * so what is inspected is provably the same image that downloads — the viewer
 * cannot drift from the export the way a second render path would.
 */
function ResultLightbox({ entries, activeKey, onNavigate, onClose, previewRefs, t }) {
  const index = entries.findIndex((e) => e.key === activeKey);
  const entry = index >= 0 ? entries[index] : null;
  const [src, setSrc] = useState(null);
  const [zoomAt, setZoomAt] = useState(null);

  const step = (delta) => {
    if (entries.length < 2) return;
    onNavigate(entries[(index + delta + entries.length) % entries.length].key);
  };

  // Pull the rendered bitmap out of the tile that is already holding it.
  useEffect(() => {
    if (!entry) return;
    let url = null;
    let cancelled = false;
    setSrc(null);
    setZoomAt(null);
    const handle = previewRefs.current.get(entry.key);
    if (!handle) return;
    handle.getBlob().then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setSrc(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [entry, previewRefs]);

  // No dependency list: the handler closes over the current index, and
  // re-binding a single listener per render is cheaper than the bookkeeping
  // needed to avoid it.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The page behind must not scroll away under the overlay. Kept in its own
  // effect so the original value is captured once, on open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!entry) return null;

  const track = (clientX, clientY, el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    setZoomAt({
      x: Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100)),
    });
  };

  const navBtn = "absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-white text-2xl font-body transition";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-3 sm:p-6"
      style={{ backgroundColor: "rgba(9,10,16,0.92)" }}
      onClick={onClose}
    >
      <div className="w-full flex items-center justify-between gap-3 mb-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="font-display font-semibold text-sm sm:text-base text-white truncate">{entry.label}</p>
          <p className="font-mono2 text-[10px] text-white/50 truncate">
            {index + 1} / {entries.length}
            {entry.folder ? ` · ${entry.folder}` : ""} · {t.zoomHint}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => previewRefs.current.get(entry.key)?.download()}
            className="h-8 px-3 rounded-full flex items-center gap-1.5 text-white font-body text-xs font-semibold"
            style={{ backgroundColor: ACCENT.teal }}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.download}</span>
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 transition"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 min-h-0 w-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {src ? (
          <div
            className="relative overflow-hidden rounded-lg max-w-full max-h-full"
            style={{ cursor: zoomAt ? "zoom-out" : "zoom-in" }}
            onMouseMove={(e) => track(e.clientX, e.clientY, e.currentTarget)}
            onMouseLeave={() => setZoomAt(null)}
            // Touch pans the magnified view; lifting drops back to fitted.
            onTouchStart={(e) => track(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget)}
            onTouchMove={(e) => track(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget)}
            onTouchEnd={() => setZoomAt(null)}
          >
            <img
              src={src}
              alt={entry.label}
              className="block max-w-full object-contain"
              style={{
                maxHeight: "78vh",
                transform: zoomAt ? `scale(${ZOOM_FACTOR})` : "none",
                transformOrigin: zoomAt ? `${zoomAt.x}% ${zoomAt.y}%` : "center",
                transition: "transform 140ms ease-out",
              }}
            />
          </div>
        ) : (
          <p className="font-body text-sm text-white/60">…</p>
        )}

        {entries.length > 1 && (
          <>
            <button
              onClick={() => step(-1)}
              aria-label="Previous"
              className={`${navBtn} left-0 sm:-left-2 bg-white/10 hover:bg-white/25`}
            >
              ‹
            </button>
            <button
              onClick={() => step(1)}
              aria-label="Next"
              className={`${navBtn} right-0 sm:-right-2 bg-white/10 hover:bg-white/25`}
            >
              ›
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const MockupPreview = forwardRef(function MockupPreview({ fileKey, label, folder, mockupSrc, designSrc, resolved, stamp, onOpen, onAutoPlace, autoPlacing, t }, ref) {
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

    let cancelled = false;

    (async () => {
      try {
        // Shared cache, so the export reuses the exact bitmap the pipeline
        // measured — no chance of measuring one decode and rendering another.
        const mockupImg = await loadImage(mockupSrc);
        if (cancelled) return;

        // Always composite at full mockup resolution; the on-screen thumbnail
        // is CSS-scaled, so downloads keep their original quality.
        canvas.width = mockupImg.naturalWidth || mockupImg.width;
        canvas.height = mockupImg.naturalHeight || mockupImg.height;
        const ctx = canvas.getContext("2d");

        if (!designSrc || !resolved) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(mockupImg, 0, 0, canvas.width, canvas.height);
          setHasImage(true);
          return;
        }

        const artworkImg = await loadImage(designSrc, false);
        if (cancelled) return;

        // Render order enforced by the compositor: photo → artwork → fabric
        // shading over the top.
        renderMockup(ctx, mockupImg, artworkImg, resolved.artwork, resolved.placement);
        setHasImage(true);
      } catch {
        if (cancelled) return;
        setHasImage(false);
        setLoadFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // The stamp is in the deps so a Generate that targets this mockup always
    // repaints it, even when nothing else changed — and so a Generate that
    // targets only other mockups leaves this canvas alone.
  }, [mockupSrc, designSrc, resolved, stamp]);

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

  // The tile itself is a button into the full-size viewer.
  //
  // Magnifying in place was the obvious first move and the wrong one: three
  // times a 250px thumbnail is still a small picture, and the image sliding
  // around under the pointer fights the click. Inspecting detail belongs at
  // full size, so the tile's only job is to open — the magnifier lives in the
  // viewer, where there is room for it to be useful.
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
      <button
        type="button"
        onClick={() => hasImage && onOpen?.()}
        disabled={!hasImage}
        aria-label={`${label} — ${t.enlarge}`}
        className="relative block w-full overflow-hidden bg-gray-100 group cursor-zoom-in disabled:cursor-default"
      >
        <canvas ref={canvasRef} className="w-full h-auto block" />
        {hasImage && (
          <>
            {/* Hover affordance: the tile is clickable, and says so. */}
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
            <span
              className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full pl-1.5 pr-2 py-1 opacity-90 group-hover:opacity-100 transition"
              style={{ backgroundColor: "rgba(17,24,39,0.62)" }}
            >
              <ZoomIn className="w-3 h-3 text-white" strokeWidth={2.5} />
              <span className="font-body text-[10px] text-white font-semibold">{t.enlarge}</span>
            </span>
          </>
        )}
      </button>
      <div className="p-2 flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="font-body text-[11px] text-gray-700 font-medium truncate block">{label}</span>
          {folder && (
            <span className="font-mono2 text-[9px] text-gray-400 truncate block">{folder}</span>
          )}
        </span>
        <span className="shrink-0 flex items-center gap-1.5">
          {/* Re-detect this one mockup. Sits next to its own download so a bad
              placement is fixed where it is noticed. */}
          {onAutoPlace && (
            <button
              onClick={onAutoPlace}
              disabled={!hasImage || autoPlacing}
              title={t.autoPlaceOne}
              aria-label={`${label} — ${t.autoPlaceOne}`}
              className="w-6 h-6 rounded-full flex items-center justify-center transition disabled:opacity-60"
              style={{ backgroundColor: ACCENT.violet }}
            >
              <Sparkles className={`w-3 h-3 text-white ${autoPlacing ? "animate-pulse" : ""}`} />
            </button>
          )}
          <button
            onClick={download}
            disabled={!hasImage}
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ backgroundColor: ACCENT.teal }}
          >
            <Download className="w-3 h-3 text-white" />
          </button>
        </span>
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
  // English by default; the picker in the studio header changes it for the
  // whole application, admin panel included.
  const [lang, setLang] = useState("en");
  const shell = SHELL_T[lang] ?? SHELL_T.en;

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
              {`⚙️ ${shell.adminPanel}`}
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
            {shell.logout}
          </button>
        </div>
      </div>

      {/* Admin Panel Modal */}
      {adminPanelOpen && (
        <AdminPanel lang={lang} onClose={() => setAdminPanelOpen(false)} />
      )}

      {/* Main App */}
      <MockupStudio lang={lang} setLang={setLang} />
    </div>
  );
}
