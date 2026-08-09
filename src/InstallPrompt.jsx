// ============================================================
// Install prompt — offer to add the app to a phone or desktop
// ============================================================
//
// Chromium fires `beforeinstallprompt` when the app qualifies (manifest, a
// service worker with a fetch handler, HTTPS). Calling preventDefault on it
// suppresses the browser's own bar and hands us the event, which can be
// replayed later from a button of our own.
//
// iOS Safari never fires it and has no programmatic install at all, so there
// the same card explains the Share → Add to Home Screen route instead of
// showing a button that could not work.

import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";

/** Set once the app is installed or the offer is declined. */
const SEEN_KEY = "mockupmaker.install.seen";

const T = {
  en: {
    title: "Install MockUP Maker",
    body: "Add it to your device and open it like a normal app — full screen, its own icon, no browser bar.",
    install: "Install",
    later: "Not now",
    iosBody: "Open the Share menu, then choose “Add to Home Screen”.",
    iosStep: "Share → Add to Home Screen",
    close: "Close",
  },
  tr: {
    title: "MockUP Maker'ı yükle",
    body: "Cihazına ekle, normal bir uygulama gibi aç — tam ekran, kendi simgesiyle, tarayıcı çubuğu olmadan.",
    install: "Yükle",
    later: "Şimdi değil",
    iosBody: "Paylaş menüsünü aç ve “Ana Ekrana Ekle”yi seç.",
    iosStep: "Paylaş → Ana Ekrana Ekle",
    close: "Kapat",
  },
  de: {
    title: "MockUP Maker installieren",
    body: "Füge die App deinem Gerät hinzu und öffne sie wie eine normale App — Vollbild, eigenes Symbol, ohne Browserleiste.",
    install: "Installieren",
    later: "Später",
    iosBody: "Öffne das Teilen-Menü und wähle „Zum Home-Bildschirm“.",
    iosStep: "Teilen → Zum Home-Bildschirm",
    close: "Schließen",
  },
};

/** Already running as an installed app — there is nothing to offer. */
function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/** iPadOS 13+ reports itself as a Mac, so touch points are the giveaway. */
function isIOS() {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

export function InstallPrompt({ lang = "en" }) {
  const t = T[lang] ?? T.en;
  const [deferred, setDeferred] = useState(null);
  const [mode, setMode] = useState(null); // null | 'button' | 'ios'

  useEffect(() => {
    if (isStandalone()) return;
    let seen = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      // Private mode with storage blocked: the offer simply shows each visit.
    }
    if (seen) return;

    const remember = (value) => {
      try {
        localStorage.setItem(SEEN_KEY, value);
      } catch {
        /* nothing to do */
      }
    };

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setMode("button");
    };
    const onInstalled = () => {
      remember("installed");
      setMode(null);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Safari has no event to wait for, so the iOS card is shown on a short
    // delay instead — long enough not to land on top of the first paint.
    let timer = null;
    if (isIOS()) timer = setTimeout(() => setMode((m) => m ?? "ios"), 2500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const remember = (value) => {
    try {
      localStorage.setItem(SEEN_KEY, value);
    } catch {
      /* nothing to do */
    }
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      const { outcome } = await deferred.userChoice;
      // A decline is still an answer; asking again on every load is nagging.
      remember(outcome === "accepted" ? "installed" : "dismissed");
    } catch {
      remember("dismissed");
    }
    setDeferred(null);
    setMode(null);
  };

  const dismiss = () => {
    remember("dismissed");
    setDeferred(null);
    setMode(null);
  };

  if (!mode) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 sm:p-5 pointer-events-none"
      role="dialog"
      aria-label={t.title}
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-4 flex gap-3 items-start">
        <img
          src="/icon-192.png"
          alt=""
          width="44"
          height="44"
          className="w-11 h-11 rounded-xl shrink-0 border border-gray-100"
        />
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-sm text-gray-900">{t.title}</p>
          <p className="font-body text-xs text-gray-500 mt-0.5">
            {mode === "ios" ? t.iosBody : t.body}
          </p>

          {mode === "ios" ? (
            <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5 font-mono2 text-[11px] text-gray-700">
              <Share className="w-3.5 h-3.5" />
              {t.iosStep}
            </p>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={install}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-display font-bold text-white transition"
                style={{ backgroundColor: "#7B61FF" }}
              >
                <Download className="w-3.5 h-3.5" />
                {t.install}
              </button>
              <button
                onClick={dismiss}
                className="rounded-lg px-3 py-2 text-xs font-body font-semibold text-gray-500 hover:bg-gray-100 transition"
              >
                {t.later}
              </button>
            </div>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label={t.close}
          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
}
