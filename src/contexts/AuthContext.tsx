import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, googleProvider, db } from "../firebase";
import { signInWithPopup, signOut, onAuthStateChanged, type User } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

interface AuthContextType {
    user: User | null;
    adsEnabled: boolean;
    loading: boolean;
    login: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [adsEnabled, setAdsEnabled] = useState(true);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            try {
                setUser(currentUser);

                if (currentUser && currentUser.email) {
                    // Use EMAIL as document ID (easier to manage manually in Firebase console)
                    const userRef = doc(db, "users", currentUser.email);
                    const userSnap = await getDoc(userRef);

                    if (!userSnap.exists()) {
                        // New user: create record with adsEnabled = true by default
                        await setDoc(userRef, {
                            uid: currentUser.uid,
                            email: currentUser.email,
                            name: currentUser.displayName,
                            photoURL: currentUser.photoURL,
                            createdAt: serverTimestamp(),
                            adsEnabled: true,
                            dailyUsage: { count: 0, date: new Date().toISOString().split('T')[0] }
                        });
                        setAdsEnabled(true);
                    } else {
                        // Existing user: read adsEnabled field (default true if not set)
                        const userData = userSnap.data();
                        setAdsEnabled(userData.adsEnabled !== false);
                    }
                } else {
                    setAdsEnabled(true);
                }
            } catch (error) {
                console.error("Auth initialization error:", error);
            } finally {
                setLoading(false);
            }
        });

        return unsubscribe;
    }, []);

    const login = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error("Login failed:", error);
            throw error;
        }
    };

    const logout = () => signOut(auth);

    return (
        <AuthContext.Provider value={{ user, adsEnabled, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
