import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
    apiKey: "AIzaSyBm_zgULbjqZNKvbve1DDelgemcVpbwiRc",
    authDomain: "slidemate-f28ed.firebaseapp.com",
    projectId: "slidemate-f28ed",
    storageBucket: "slidemate-f28ed.firebasestorage.app",
    messagingSenderId: "629721651192",
    appId: "1:629721651192:web:f85704dbefbeb9d2b3e80d"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

export default app;
