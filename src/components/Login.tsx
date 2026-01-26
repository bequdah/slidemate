import { useAuth } from "../contexts/AuthContext";
import { useState } from "react";

export function Login() {
    const { login } = useAuth();
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async () => {
        try {
            setError(null);
            await login();
        } catch (err: any) {
            setError("Failed to sign in. Please try again.");
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full space-y-8 bg-slate-800/50 p-8 rounded-2xl border border-white/10 backdrop-blur-xl">
                <div className="text-center">
                    <div className="flex justify-center mb-6">
                        <div className="relative group cursor-pointer">
                            <div className="absolute inset-0 bg-indigo-500/20 rounded-xl blur-xl group-hover:bg-indigo-500/40 transition-all duration-700 animate-pulse" />
                            <img
                                src="/logo_white_bg.jpg" // Assuming this exists from previous App.tsx
                                alt="SlideMate Logo"
                                className="w-20 h-20 rounded-xl shadow-lg border border-indigo-500/30 relative z-10"
                            />
                        </div>
                    </div>
                    <h2 className="text-4xl font-black text-white tracking-tighter mb-2">
                        Welcome to <span className="text-indigo-500 italic">SlideMate</span>
                    </h2>
                    <p className="text-slate-400 font-medium">
                        Your AI-powered study companion.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-lg text-sm text-center font-bold">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleLogin}
                    className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-bold py-4 px-6 rounded-xl hover:bg-slate-100 transition-all transform hover:scale-[1.02] active:scale-95 shadow-xl"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            fill="#EA4335"
                            d="M24 12.276c0-.85-.076-1.68-.218-2.484H12.273v4.7h6.605c-.285 1.527-1.15 2.816-2.42 3.664v3.053h3.92c2.28-2.105 3.6-5.205 3.6-8.933z"
                        />
                        <path
                            fill="#34A853"
                            d="M12.273 24c3.3 0 6.06-1.092 8.085-2.962l-3.92-3.053c-1.09.733-2.484 1.168-4.165 1.168-3.185 0-5.885-2.15-6.85-5.04H1.366v3.178C3.418 21.364 7.55 24 12.273 24z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.423 14.113c-.244-.733-.385-1.523-.385-2.348 0-.825.14-1.615.385-2.348V6.24H1.366C.493 7.978 0 9.932 0 12c0 2.068.493 4.022 1.366 5.76l4.057-3.647z"
                        />
                        <path
                            fill="#4285F4"
                            d="M12.273 4.773c1.794 0 3.407.618 4.672 1.83l3.5-3.5C18.332 1.127 15.568 0 12.273 0 7.55 0 3.417 2.637 1.366 6.24l4.057 3.647c.965-2.89 3.665-5.04 6.85-5.04z"
                        />
                    </svg>
                    Continue with Google
                </button>

                <p className="text-center text-slate-500 text-xs mt-8">
                    By continuing, you simply log in. No hidden fees.
                </p>
            </div>
        </div>
    );
}
