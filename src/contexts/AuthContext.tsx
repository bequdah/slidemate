import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth, googleProvider, db } from "../firebase";
import { signInWithPopup, signOut, onAuthStateChanged, type User } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";

export type UserTier = 'free' | 'premium' | 'unlimited';

interface AuthContextType {
    user: User | null;
    adsEnabled: boolean;
    tier: UserTier;
    loading: boolean;
    usageLeft: number;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    incrementUsage: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const FREE_LIMIT = 10;
const PREMIUM_LIMIT = 50;

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [adsEnabled, setAdsEnabled] = useState(true);
    const [tier, setTier] = useState<UserTier>('free');
    const [usageCount, setUsageCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            try {
                setUser(currentUser);

                if (currentUser && currentUser.email) {
                    const userRef = doc(db, "users", currentUser.email);
                    const userSnap = await getDoc(userRef);

                    if (!userSnap.exists()) {
                        // New user: always starts as FREE
                        await setDoc(userRef, {
                            uid: currentUser.uid,
                            email: currentUser.email,
                            name: currentUser.displayName,
                            photoURL: currentUser.photoURL,
                            createdAt: serverTimestamp(),
                            adsEnabled: true,
                            tier: 'free',
                            totalUsage: 0,
                            dailyUsage: {
                                count: 0,
                                date: new Date().toISOString().split('T')[0]
                            }
                        });
                        setAdsEnabled(true);
                        setTier('free');
                        setUsageCount(0);
                    } else {
                        const userData = userSnap.data();
                        const today = new Date().toISOString().split('T')[0];

                        // Handle tier and ads - COMPLETELY DRIVEN BY FIREBASE
                        let userTier = userData.tier;

                        // Master Admin Force Unlimited
                        if (user?.email === 'qudahmohammad36@gmail.com') {
                            userTier = 'unlimited';
                            if (userData.tier !== 'unlimited') {
                                await updateDoc(userRef, { tier: 'unlimited' });
                            }
                        } else if (!userTier) {
                            userTier = 'free';
                            await updateDoc(userRef, { tier: 'free' });
                        }

                        setTier(userTier as UserTier);

                        // Disable ads ONLY if Tier is NOT 'free'
                        // (Premium and Unlimited don't see ads)
                        setAdsEnabled(userTier === 'free');

                        // Reset daily usage if it's a new day
                        if (userData.dailyUsage?.date !== today) {
                            setUsageCount(0);
                            await updateDoc(userRef, {
                                "dailyUsage.count": 0,
                                "dailyUsage.date": today
                            });
                        } else {
                            setUsageCount(userData.dailyUsage.count || 0);
                        }
                    }
                } else {
                    setAdsEnabled(true);
                    setTier('free');
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

    const incrementUsage = async () => {
        if (!user || !user.email) return false;

        const limit = tier === 'premium' ? PREMIUM_LIMIT : (tier === 'unlimited' ? Infinity : FREE_LIMIT);

        // Final check before incrementing
        if (usageCount >= limit) return false;

        const userRef = doc(db, "users", user.email);
        const newCount = usageCount + 1;

        try {
            await updateDoc(userRef, {
                "dailyUsage.count": newCount,
                totalUsage: (usageCount || 0) + 1
            });
            setUsageCount(newCount);
            return true;
        } catch (e) {
            console.error("Failed to increment usage:", e);
            return false;
        }
    };

    const limit = tier === 'premium' ? PREMIUM_LIMIT : (tier === 'unlimited' ? Infinity : FREE_LIMIT);
    const usageLeft = Math.max(0, limit - usageCount);

    return (
        <AuthContext.Provider value={{ user, adsEnabled, tier, loading, usageLeft, login, logout, incrementUsage }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
