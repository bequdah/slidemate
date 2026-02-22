import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import type { UserTier } from '../contexts/AuthContext';

interface UserData {
    email: string;
    name: string;
    tier: UserTier;
    totalUsage: number;
    dailyUsage: {
        count: number;
        date: string;
    };
}

interface AdminDashboardProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AdminDashboard({ isOpen, onClose }: AdminDashboardProps) {
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchUsers();
        }
    }, [isOpen]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            console.log("Admin: Fetching users from collection 'users'...");
            const q = query(collection(db, "users"));
            const querySnapshot = await getDocs(q);

            console.log(`Admin: Found ${querySnapshot.size} documents.`);

            const usersData: UserData[] = [];
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                usersData.push({
                    ...data,
                    email: data.email || docSnap.id
                } as UserData);
            });

            usersData.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
            setUsers(usersData);
        } catch (error) {
            console.error("Admin Dashboard Error:", error);
            alert("Error loading users. Check console for details.");
        } finally {
            setLoading(false);
        }
    };

    const handleTierChange = async (email: string, newTier: UserTier) => {
        try {
            const userRef = doc(db, "users", email);
            await updateDoc(userRef, { tier: newTier });
            setUsers(prev => prev.map(u => u.email === email ? { ...u, tier: newTier } : u));
        } catch (error) {
            console.error("Error updating tier:", error);
            alert("Failed to update tier");
        }
    };

    const handleDeleteUser = async (email: string) => {
        if (!window.confirm(`Are you sure you want to delete user ${email}?`)) return;

        try {
            const userRef = doc(db, "users", email);
            await deleteDoc(userRef);
            setUsers(prev => prev.filter(u => u.email !== email));
        } catch (error) {
            console.error("Error deleting user:", error);
            alert("Failed to delete user");
        }
    };

    const deleteNoNameUsers = async () => {
        const noNameUsers = users.filter(u => !u.name || u.name === 'No Name');
        if (noNameUsers.length === 0) {
            alert("No 'No Name' users found.");
            return;
        }

        if (!window.confirm(`Delete all ${noNameUsers.length} 'No Name' users?`)) return;

        setLoading(true);
        try {
            for (const u of noNameUsers) {
                const userRef = doc(db, "users", u.email);
                await deleteDoc(userRef);
            }
            await fetchUsers();
            alert("Cleanup complete!");
        } catch (error) {
            console.error("Cleanup error:", error);
            alert("Error during cleanup");
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(u => {
        const search = searchTerm.toLowerCase();
        const userEmail = (u.email || '').toLowerCase();
        const userName = (u.name || '').toLowerCase();
        return userEmail.includes(search) || userName.includes(search);
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[250] p-4">
            <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose} />
            <div className="relative w-full max-w-6xl bg-slate-950 border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="p-8 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">
                            Admin <span className="text-indigo-400">Dashboard</span>
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Manage Users & Subscriptions</p>
                            <span className="w-1 h-1 bg-slate-700 rounded-full" />
                            <button
                                onClick={deleteNoNameUsers}
                                className="text-[10px] font-black text-red-400/60 hover:text-red-400 uppercase tracking-[0.2em] transition-colors"
                            >
                                [ Clean No-Names ]
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <button
                            onClick={fetchUsers}
                            disabled={loading}
                            className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-indigo-400 transition-all active:scale-95 disabled:opacity-50"
                            title="Refresh Data"
                        >
                            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                        <div className="relative flex-1 md:w-64">
                            <input
                                type="text"
                                placeholder="Search by email or name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                            />
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-400 transition-colors">✕</button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Processing...</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            <div className="hidden md:grid grid-cols-6 gap-4 px-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                                <div className="col-span-2">User / Email</div>
                                <div>Tier</div>
                                <div>Usage</div>
                                <div>Change Tier</div>
                                <div className="text-right text-red-500/50">Danger Zone</div>
                            </div>

                            {filteredUsers.map((u) => (
                                <div key={u.email} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 md:px-6 md:py-4 grid grid-cols-1 md:grid-cols-6 items-center gap-4 hover:bg-white/[0.04] transition-colors group">
                                    <div className="col-span-2">
                                        <div className={`font-bold text-sm truncate ${!u.name || u.name === 'No Name' ? 'text-red-400/50' : 'text-white'}`}>
                                            {u.name || 'No Name'}
                                        </div>
                                        <div className="text-xs text-slate-500 truncate">{u.email}</div>
                                    </div>

                                    <div>
                                        <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${u.tier === 'premium' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                            (u.tier === 'unlimited' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-500/10 text-slate-500 border border-white/5')
                                            }`}>
                                            {u.tier}
                                        </span>
                                    </div>

                                    <div className="text-sm font-mono text-slate-400">
                                        <span className="text-white font-bold">{u.dailyUsage?.count || 0}</span> <span className="text-[10px] opacity-30">/</span> <span className="text-xs">{u.totalUsage || 0}</span>
                                    </div>

                                    <div>
                                        <select
                                            value={u.tier}
                                            onChange={(e) => handleTierChange(u.email, e.target.value as UserTier)}
                                            className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all cursor-pointer hover:bg-slate-800 w-full"
                                        >
                                            <option value="free">Free</option>
                                            <option value="premium">Premium</option>
                                            <option value="unlimited">Unlimited</option>
                                        </select>
                                    </div>

                                    <div className="flex justify-end order-first md:order-last">
                                        <button
                                            onClick={() => handleDeleteUser(u.email)}
                                            className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-red-500/5 border border-red-500/10 flex items-center justify-center text-red-500/40 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20 transition-all active:scale-95"
                                            title="Delete User Record"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {filteredUsers.length === 0 && (
                                <div className="text-center py-20 text-slate-500 italic">No users found matching your search.</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-white/[0.01] text-center">
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Total Users Found: {filteredUsers.length}</p>
                </div>
            </div>
        </div>
    );
}
