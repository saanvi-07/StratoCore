import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD8n9t6ogiunq7fPLcUsXwY4x65eOiZGLg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "stratocore.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "stratocore",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "stratocore.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "733081740668",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:733081740668:web:7a397f1f0d85e5d939b0f9",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-HS4TWNWD9X"
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
isSupported().then(yes => yes ? getAnalytics(app) : null).catch(() => {});

export const auth = getAuth(app);

let dbInstance;
try {
  dbInstance = getFirestore(app);
} catch (err) {
  dbInstance = null;
}

export const db = dbInstance;

export const googleProvider = new GoogleAuthProvider();

export const facebookProvider = new FacebookAuthProvider();


