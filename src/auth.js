import { auth, db } from "./firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { getDoc, doc } from "firebase/firestore";

const CURRENT_USER_KEY = "mockupmaker_currentUser";

let currentUser = null;
let authInitialized = false;

// Subscribe to auth state changes
onAuthStateChanged(auth, async (firebaseUser) => {
  authInitialized = true;

  if (firebaseUser) {
    // User is logged in - fetch their data from Firestore
    try {
      const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
      if (userDoc.exists()) {
        currentUser = {
          id: firebaseUser.uid,
          email: firebaseUser.email,
          ...userDoc.data(),
        };
      } else {
        // User exists in Auth but not in Firestore, create basic user object
        currentUser = {
          id: firebaseUser.uid,
          email: firebaseUser.email,
        };
      }
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
    } catch (error) {
      console.error("Error fetching user data:", error);
      currentUser = {
        id: firebaseUser.uid,
        email: firebaseUser.email,
      };
    }
  } else {
    // User is logged out
    currentUser = null;
    localStorage.removeItem(CURRENT_USER_KEY);
  }
});

export async function login(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    // Fetch user data from Firestore
    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
    if (userDoc.exists()) {
      currentUser = {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        ...userDoc.data(),
      };
    } else {
      currentUser = {
        id: firebaseUser.uid,
        email: firebaseUser.email,
      };
    }

    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
    return currentUser;
  } catch (error) {
    throw new Error(error.message || "Invalid email or password");
  }
}

export async function logout() {
  try {
    await signOut(auth);
    currentUser = null;
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch (error) {
    console.error("Logout error:", error);
    throw new Error(error.message || "Logout failed");
  }
}

export function getCurrentUser() {
  // Return in-memory cache if available
  if (currentUser) {
    return currentUser;
  }

  // Fallback to localStorage if in-memory cache is empty
  const stored = localStorage.getItem(CURRENT_USER_KEY);
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      return currentUser;
    } catch {
      return null;
    }
  }

  return null;
}

export function isLoggedIn() {
  return !!getCurrentUser();
}

export function isAdmin() {
  const user = getCurrentUser();
  return user?.isadmin === true;
}

export async function getToken() {
  if (auth.currentUser) {
    return await auth.currentUser.getIdToken();
  }
  return null;
}

// Generate user-specific R2 path
export function getUserR2Path(user) {
  return user ? user.id : "anonymous";
}
