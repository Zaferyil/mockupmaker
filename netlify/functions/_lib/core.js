/**
 * Kullanıcı yönetiminin saf mantığı — şifre özetleme, oturum jetonu ve
 * kayıt işlemleri.
 *
 * Depolama buraya `db` olarak dışarıdan verilir; böylece bu dosya Netlify
 * Blobs'a bağlı kalmadan test edilebilir.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- şifreler

/** Şifreyi rastgele tuzla scrypt'ten geçirir. Düz metin hiçbir yere yazılmaz. */
export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(String(password), salt, 64).toString("hex") };
}

/** Sabit süreli karşılaştırma: yanlış şifrenin ne kadar yanlış olduğu sızmasın. */
export function verifyPassword(password, salt, hash) {
  if (typeof salt !== "string" || typeof hash !== "string") return false;
  const candidate = Buffer.from(hashPassword(password, salt).hash, "hex");
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ----------------------------------------------------------------- jetonlar

export function signToken(payload, secret, ttlMs = TOKEN_TTL_MS) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + ttlMs }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Geçersiz, kurcalanmış veya süresi dolmuş jetonlarda null döner. */
export function verifyToken(token, secret) {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const given = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- kayıtlar

export const normalizeEmail = (email) => String(email ?? "").trim().toLowerCase();

/** İstemciye giden hâli: tuz ve özet asla dışarı çıkmaz. */
export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isadmin: user.isadmin === true,
    createdAt: user.createdAt,
  };
}

export function makeUser({ email, name, password, isadmin = false }) {
  const { salt, hash } = hashPassword(password);
  return {
    id: `user_${Date.now()}_${randomBytes(4).toString("hex")}`,
    email: normalizeEmail(email),
    name: String(name).trim(),
    isadmin: isadmin === true,
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
}

export function findByEmail(users, email) {
  const needle = normalizeEmail(email);
  return users.find((u) => normalizeEmail(u.email) === needle) ?? null;
}
