/**
 * Netlify Blobs üzerindeki kalıcı depo.
 *
 * Blobs siteyle birlikte geliyor: harici servis, API anahtarı veya ayar
 * gerektirmiyor — Firebase'de tökezlediğimiz yer tam olarak orasıydı.
 */
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { makeUser } from "./core.js";

const STORE_NAME = "mockupmaker-auth";
const USERS_KEY = "users";
const SECRET_KEY = "token-secret";

// İlk açılışta depo boş olur; kurucu admin olmadan panele kimse giremez.
// Değerler ortam değişkeniyle ezilebilir.
const FOUNDING_EMAIL = process.env.ADMIN_EMAIL || "zaferyildiz.tr@hotmail.com";
const FOUNDING_PASSWORD = process.env.ADMIN_PASSWORD || "Seza02643637218";
const FOUNDING_NAME = process.env.ADMIN_NAME || "zyildiz (Admin)";

// getStore'u modül seviyesinde çağırmıyoruz: Netlify dışında hata verir ve
// fonksiyon hiç yüklenemez.
const store = () => getStore(STORE_NAME);

export const db = {
  async loadUsers() {
    const stored = await store().get(USERS_KEY, { type: "json" });
    if (Array.isArray(stored) && stored.length > 0) return stored;

    const seeded = [
      makeUser({
        email: FOUNDING_EMAIL,
        name: FOUNDING_NAME,
        password: FOUNDING_PASSWORD,
        isadmin: true,
      }),
    ];
    await store().setJSON(USERS_KEY, seeded);
    return seeded;
  },

  async saveUsers(users) {
    await store().setJSON(USERS_KEY, users);
  },

  async loadSecret() {
    // Ortam değişkeni varsa o kullanılır; yoksa bir kere üretilip saklanır,
    // böylece hiçbir ayar yapılmadan da jetonlar imzalanabilir.
    if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;

    const stored = await store().get(SECRET_KEY, { type: "text" });
    if (stored) return stored;

    const secret = randomBytes(32).toString("hex");
    await store().set(SECRET_KEY, secret);
    return secret;
  },
};
