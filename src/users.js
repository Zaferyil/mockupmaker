import { db } from "./firebase";
import { collection, getDocs, doc, setDoc, deleteDoc, query, where } from "firebase/firestore";

/**
 * Get all users from Firestore
 */
export async function getAllUsers() {
  try {
    const usersCollection = collection(db, "users");
    const snapshot = await getDocs(usersCollection);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      email: doc.data().email,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
}

/**
 * Get user by email from Firestore
 */
export async function getUserByEmail(email) {
  try {
    const usersCollection = collection(db, "users");
    const q = query(usersCollection, where("email", "==", email));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      email: doc.data().email,
      ...doc.data()
    };
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

/**
 * Add user to Firestore
 * Note: User creation in Firebase requires server-side Admin SDK
 * This function assumes the user has been created in Firebase Auth first
 * You can use Firebase Admin SDK, Cloud Functions, or a custom backend to create users
 */
export async function addUser(email, name, metadata = {}) {
  try {
    // Check if user already exists
    const existing = await getUserByEmail(email);
    if (existing) {
      console.warn(`User ${email} already exists`);
      return null;
    }

    // Add user to Firestore
    // Note: The uid should be the Firebase Auth UID
    // For admin panel creation, you'll need to use Firebase Admin SDK or a backend endpoint
    const userRef = doc(db, "users", `temp_${Date.now()}`);

    await setDoc(userRef, {
      email,
      name,
      isadmin: metadata.isadmin || false,
      createdAt: new Date().toISOString(),
      ...metadata
    });

    console.log(`User ${email} added to Firestore`);
    return {
      id: userRef.id,
      email,
      name,
      isadmin: metadata.isadmin || false,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error adding user:", error);
    throw error;
  }
}

/**
 * Remove user from Firestore
 * Note: To fully delete a user, you need to also delete them from Firebase Auth using Admin SDK
 */
export async function removeUser(userId) {
  try {
    const userRef = doc(db, "users", userId);
    await deleteDoc(userRef);
    console.log(`User ${userId} removed from Firestore`);
  } catch (error) {
    console.error("Error removing user:", error);
    throw error;
  }
}
