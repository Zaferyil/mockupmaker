// ============================================================
// Service worker — installability, and a faster second load
// ============================================================
//
// A service worker with a fetch handler is what makes the browser offer to
// install the app at all. Beyond that it exists to make the second visit cheap:
// the bundle is large because TensorFlow ships with it.
//
// THE RULE THAT MATTERS MOST
// --------------------------
// Cross-origin requests are never intercepted. Not cached, not proxied — the
// handler returns without calling respondWith, so the browser fetches them
// exactly as it would with no worker installed.
//
// This is a correctness requirement, not an optimisation. The compositor reads
// pixels back out of the R2 mockup photographs with getImageData, which only
// works while those responses keep their original CORS headers. A worker that
// re-served them from a cache could taint the canvas and break every export
// with a SecurityError. The model weights fetched from the CDN are in the same
// position. So the worker stays entirely out of their way.

const VERSION = "v2";
const CACHE = `mockupmaker-${VERSION}`;

// The shell needed to start offline. Hashed assets are added as they are used
// rather than listed here, because their names change on every build.
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.png", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individual misses must not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // See the header comment: other origins are none of this worker's business.
  if (url.origin !== self.location.origin) return;

  // Navigations go to the network first, so a deploy is picked up on the next
  // load instead of being masked by a cached page. The cache is only a
  // fallback for being offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r ?? caches.match("/"))),
    );
    return;
  }

  // Everything Vite emits under /assets carries a content hash, so a given URL
  // can never change meaning. Those are safe to serve from cache immediately.
  const immutable = url.pathname.startsWith("/assets/");
  if (immutable) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Remaining same-origin files (icons, favicon, manifest): network first with
  // a cache fallback, so they stay current but still work offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
