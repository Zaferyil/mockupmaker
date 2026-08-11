/**
 * Kullanıcı nesnesi üzerine ortak yardımcılar.
 *
 * Kayıtlar farklı dönemlerden geliyor: elle tanımlı kullanıcılarda
 * `role: "admin"`, Firestore döneminde `isadmin`. Tarayıcıda duran eski
 * oturumlar hâlâ eski şekliyle olabildiği için hepsini kabul ediyoruz.
 *
 * Bu yalnızca arayüzü göstermek/gizlemek için: yetkinin asıl kontrolü
 * sunucuda, netlify/functions/_lib/handlers.js içinde yapılıyor.
 */
export function isAdminUser(user) {
  if (!user) return false;
  if (user.isadmin === true || user.isAdmin === true) return true;
  return typeof user.role === "string" && user.role.toLowerCase() === "admin";
}
