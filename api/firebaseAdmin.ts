import admin from 'firebase-admin';

if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (error) {
            console.error('Firebase Admin Init Error: Invalid JSON config', error);
        }
    } else {
        console.error('Firebase Admin Init Error: FIREBASE_SERVICE_ACCOUNT env var missing');
    }
}

export const db = admin.firestore();
export const auth = admin.auth();
