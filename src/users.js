// Hardcoded users - production'da database'e taşıyabilir
export const USERS = {
  "zaferyildiz.tr@hotmail.com": {
    id: "user_zafer",
    name: "zyildiz (Admin)",
    email: "zaferyildiz.tr@hotmail.com",
    role: "admin",
    password: "Seza02643637218", // Demo için - production'da hashing
    createdAt: "2026-08-05"
  },
};

// Demo users listesi
export function getAllUsers() {
  return Object.entries(USERS).map(([email, user]) => ({
    ...user,
    email
  }));
}

export function getUserByEmail(email) {
  return USERS[email] ? { ...USERS[email], email } : null;
}

export function addUser(email, name, password = "password123") {
  if (USERS[email]) return null; // Already exists

  const userId = `user_${Date.now()}`;
  USERS[email] = {
    id: userId,
    name,
    email,
    role: "user",
    password,
    createdAt: new Date().toISOString()
  };

  return USERS[email];
}

export function removeUser(email) {
  delete USERS[email];
}
