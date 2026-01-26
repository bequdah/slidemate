import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, googleProvider, db } from "../firebase";
import { signInWithPopup, signOut, onAuthStateChanged, type User } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            try {
                setUser(currentUser);

                if (currentUser) {
                    // Create user record if not exists
                    const userRef = doc(db, "users", currentUser.uid);
                    const userSnap = await getDoc(userRef);

                    if (!userSnap.exists()) {
                        await setDoc(userRef, {
                            email: currentUser.email,
                            name: currentUser.displayName,
                            photoURL: currentUser.photoURL,
                            createdAt: serverTimestamp(),
                            dailyUsage: { count: 0, date: new Date().toISOString().split('T')[0] }
                        });
                    }
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
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
