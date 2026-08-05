import { USERS, getUserByEmail } from "./users";

const CURRENT_USER_KEY = "mockupmaker_currentUser";
const TOKEN_KEY = "mockupmaker_token";

export function login(email, password) {
  const user = getUserByEmail(email);

  if (!user || user.password !== password) {
    throw new Error("Invalid email or password");
  }

  // Store in localStorage
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  localStorage.setItem(TOKEN_KEY, btoa(`${email}:${Date.now()}`));

  return user;
}

export function logout() {
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function getCurrentUser() {
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function isLoggedIn() {
  return !!getCurrentUser();
}

export function isAdmin() {
  const user = getCurrentUser();
  return user?.role === "admin";
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Generate user-specific R2 path
export function getUserR2Path(user) {
  return user ? user.id : "anonymous";
}
