/**
 * Oturum yönetimi — localStorage üzerinde çalışır, harici bir servise
 * bağlı değildir.
 *
 * Daha önce Firebase Authentication kullanılıyordu; API anahtarı doğrulaması
 * sürekli "auth/api-key-not-valid" veriyordu ve `firebase` paketi lockfile'da
 * olmadığı için Netlify build'i de kırılıyordu. Uygulamanın kullanıcı sayısı
 * elle yönetilecek kadar az olduğundan giriş tekrar yerel depoya alındı.
 */
import { findUserByEmail, isAdminUser } from "./userStore";

const CURRENT_USER_KEY = "mockupmaker_currentUser";
const TOKEN_KEY = "mockupmaker_token";

export { isAdminUser };

export async function login(email, password) {
  const user = findUserByEmail(email);

  if (!user || user.password !== password) {
    throw new Error("Invalid email or password");
  }

  // Şifre oturum nesnesine sızmasın: localStorage'ı herkes okuyabilir.
  const { password: _password, ...session } = user;

  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(session));
  localStorage.setItem(TOKEN_KEY, btoa(`${session.email}:${Date.now()}`));

  return session;
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

export async function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Generate user-specific R2 path
export function getUserR2Path(user) {
  return user ? user.id : "anonymous";
}
