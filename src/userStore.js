/**
 * Kullanıcı deposu — tarayıcının localStorage'ı üzerinde çalışır.
 *
 * Hem auth.js hem users.js buraya bağlanır. İkisi birbirini import etseydi
 * döngü oluşurdu; ortak katmanı ayrı tutmamızın sebebi bu.
 */
const USERS_KEY = "mockupmaker_users";

// İlk açılışta depo boş olur. Uygulamanın sahibi hiçbir zaman kilitli
// kalmasın diye kurucu admin buraya gömülü; panelden eklenen kullanıcılar
// bunun yanına yazılır.
const FOUNDING_ADMIN = {
  id: "user_zafer",
  name: "zyildiz (Admin)",
  email: "zaferyildiz.tr@hotmail.com",
  password: "Seza02643637218",
  isadmin: true,
  createdAt: "2026-08-05",
};

// Admin e-postaları ortam değişkeninden de genişletilebilir; böylece yeni bir
// admin için kod değişikliği ve deploy gerekmez.
const ADMIN_EMAILS = String(
  import.meta.env?.VITE_ADMIN_EMAILS ?? FOUNDING_ADMIN.email,
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Kullanıcı nesnesi backend değiştikçe farklı şekiller aldı: elle tanımlı
 * kayıtlarda `role: "admin"`, Firestore'dan gelenlerde `isadmin` vardı. Eski
 * oturumlar hâlâ localStorage'da eski şekliyle durduğu için hepsini kabul
 * ediyoruz — yoksa admin, tarayıcısında kendi panelini göremiyor.
 */
export function isAdminUser(user) {
  if (!user) return false;
  if (user.isadmin === true || user.isAdmin === true) return true;
  if (typeof user.role === "string" && user.role.toLowerCase() === "admin") {
    return true;
  }
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  return email !== "" && ADMIN_EMAILS.includes(email);
}

/** Depodaki ham kayıtlar; bozuk/eksik veri boş listeye düşer. */
function readRaw() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/**
 * Tüm kullanıcılar, `isadmin` alanı tekilleştirilmiş hâlde. Kurucu admin
 * depoda yoksa eklenir, böylece uygulama hiçbir zaman girişsiz kalmaz.
 */
export function readUsers() {
  const stored = readRaw();
  const hasFounder = stored.some(
    (u) => String(u.email).toLowerCase() === FOUNDING_ADMIN.email,
  );
  const users = hasFounder ? stored : [FOUNDING_ADMIN, ...stored];

  if (!hasFounder) writeUsers(users);

  return users.map((u) => ({ ...u, isadmin: isAdminUser(u) }));
}

export function findUserByEmail(email) {
  const needle = String(email).trim().toLowerCase();
  return readUsers().find((u) => String(u.email).toLowerCase() === needle) ?? null;
}
