/**
 * Admin panelinin kullandığı kullanıcı CRUD'u — Netlify Blobs'a bağlanan
 * /api/users ucunu çağırır.
 *
 * Yetki kontrolü sunucuda; buradaki jeton olmadan uç 401 döner.
 */
import { getToken, logout } from "./auth";

async function call(path, options = {}) {
  const token = getToken();

  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Sunucuya ulaşılamadı — internet bağlantını kontrol et");
  }

  // Jetonun ömrü bir hafta; dolduğunda kullanıcıyı giriş ekranına geri
  // göndermek, panelde sessizce boş liste göstermekten iyi.
  if (response.status === 401) {
    await logout();
    throw new Error("Oturumun sona erdi — tekrar giriş yap");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "İşlem başarısız");
  }

  return payload;
}

/**
 * Kayıtlı tüm kullanıcılar.
 */
export async function getAllUsers() {
  return call("/api/users");
}

/**
 * Yeni kullanıcı ekle. Aynı e-posta ikinci kez eklenemez.
 */
export async function addUser(email, name, metadata = {}) {
  return call("/api/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      name,
      password: metadata.password,
      isadmin: metadata.isadmin === true,
    }),
  });
}

/**
 * Kullanıcı sil. Sunucu admin kayıtlarını reddeder.
 */
export async function removeUser(userId) {
  return call(`/api/users?id=${encodeURIComponent(userId)}`, { method: "DELETE" });
}
