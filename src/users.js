// Hardcoded users - production'da database'e taşıyabilir
export const USERS = {
  "zafer@example.com": {
    id: "user_zafer",
    name: "Zafer (Admin)",
    email: "zafer@example.com",
    role: "admin",
    password: "admin123", // Demo için - production'da hashing
    createdAt: "2026-08-05"
  },
  "customer1@example.com": {
    id: "user_1",
    name: "Customer 1",
    email: "customer1@example.com",
    role: "user",
    password: "password123",
    createdAt: "2026-08-05"
  },
  "customer2@example.com": {
    id: "user_2",
    name: "Customer 2",
    email: "customer2@example.com",
    role: "user",
    password: "password123",
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
