import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBDV3CycXvto40GU74jJKUcck7yI4wsnLY",
  authDomain: "mockupmaker-77cf4.firebaseapp.com",
  projectId: "mockupmaker-77cf4",
  storageBucket: "mockupmaker-77cf4.firebasestorage.app",
  messagingSenderId: "1055816131454",
  appId: "1:1055816131454:web:a6d15e58daf556dbccc92f",
  measurementId: "G-8N5WDRNJBE",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export default app;
