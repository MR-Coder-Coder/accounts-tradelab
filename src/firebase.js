// firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth'; // Import Firebase Authentication
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBiEih78It74UWB5irXkx5GfdP4fuwLpkg",
  authDomain: "accounts-tradelab001.firebaseapp.com",
  projectId: "accounts-tradelab001",
  storageBucket: "accounts-tradelab001.appspot.com",
  messagingSenderId: "634814608312",
  appId: "1:634814608312:web:6fdb4bddf3825c2d47d54d",
  measurementId: "G-V5Z7PH59BD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Firebase Authentication
const auth = getAuth(app);

// Initialize Cloud Functions
const functions = getFunctions(app);

// Export the necessary Firebase services
export const getSheetData = httpsCallable(functions, 'getSheetData');
export { db, auth };
