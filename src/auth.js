/**
 * Oturum yönetimi.
 *
 * Doğrulama sunucuda yapılıyor (netlify/functions/login.js); burada yalnızca
 * dönen oturum ve jeton saklanıyor. Kullanıcı listesi Netlify Blobs'ta
 * durduğu için aynı hesapla her cihazdan giriş yapılabiliyor.
 */
import { isAdminUser } from "./userStore";

const CURRENT_USER_KEY = "mockupmaker_currentUser";
const TOKEN_KEY = "mockupmaker_token";

export { isAdminUser };

export async function login(email, password) {
  let response;
  try {
    response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Sunucuya ulaşılamadı — internet bağlantını kontrol et");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Invalid email or password");
  }

  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(payload.user));
  localStorage.setItem(TOKEN_KEY, payload.token);
  return payload.user;
}

export async function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function getCurrentUser() {
  try {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return !!getCurrentUser();
}

export function isAdmin() {
  return isAdminUser(getCurrentUser());
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Generate user-specific R2 path
export function getUserR2Path(user) {
  return user ? user.id : "anonymous";
}
