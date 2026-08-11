/**
 * Simple localStorage-based user management
 */
const USERS_KEY = "mockupmaker_users";

function getStoredUsers() {
  try {
    const stored = localStorage.getItem(USERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/**
 * Get all users
 */
export async function getAllUsers() {
  return getStoredUsers();
}

/**
 * Get user by email
 */
export async function getUserByEmail(email) {
  const users = getStoredUsers();
  return users.find(u => u.email === email) || null;
}

/**
 * Add new user
 */
export async function addUser(email, name, metadata = {}) {
  try {
    const users = getStoredUsers();

    // Check if user already exists
    if (users.find(u => u.email === email)) {
      throw new Error("User already exists");
    }

    const newUser = {
      id: `user_${Date.now()}`,
      email,
      name,
      isadmin: metadata.isadmin || false,
      password: metadata.password || "password123",
      createdAt: new Date().toISOString(),
      ...metadata
    };

    users.push(newUser);
    saveUsers(users);

    return newUser;
  } catch (error) {
    console.error("Error adding user:", error);
    throw error;
  }
}

/**
 * Remove user
 */
export async function removeUser(userId) {
  try {
    const users = getStoredUsers();
    const filtered = users.filter(u => u.id !== userId);
    saveUsers(filtered);
    console.log(`User ${userId} removed`);
  } catch (error) {
    console.error("Error removing user:", error);
    throw error;
  }
}
