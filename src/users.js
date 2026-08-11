/**
 * Admin panelinin kullandığı kullanıcı CRUD'u.
 *
 * Depolama katmanı userStore.js'te; burada sadece panelin beklediği asenkron
 * arayüz var (panel Firestore döneminde `await` ile yazılmıştı, imzayı
 * koruyoruz).
 */
import { readUsers, writeUsers, findUserByEmail } from "./userStore";

/**
 * Kayıtlı tüm kullanıcılar.
 */
export async function getAllUsers() {
  return readUsers();
}

/**
 * E-postaya göre kullanıcı bul.
 */
export async function getUserByEmail(email) {
  return findUserByEmail(email);
}

/**
 * Yeni kullanıcı ekle. Aynı e-posta ikinci kez eklenemez.
 */
export async function addUser(email, name, metadata = {}) {
  const users = readUsers();
  const needle = String(email).trim().toLowerCase();

  if (users.some((u) => String(u.email).toLowerCase() === needle)) {
    throw new Error("Bu email zaten kayıtlı");
  }

  const newUser = {
    id: `user_${Date.now()}`,
    email: String(email).trim(),
    name,
    password: metadata.password || "password123",
    isadmin: metadata.isadmin === true,
    createdAt: new Date().toISOString(),
  };

  writeUsers([...users, newUser]);
  return newUser;
}

/**
 * Kullanıcı sil. Panel admin kayıtlarını zaten engelliyor.
 */
export async function removeUser(userId) {
  const users = readUsers();
  writeUsers(users.filter((u) => u.id !== userId));
}
