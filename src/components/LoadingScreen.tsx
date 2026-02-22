import { useState, useEffect } from 'react';
import { AdSense } from './AdSense';

interface LoadingScreenProps {
    progress: number;
    chapterTitle: string;
}

const statusMessages = [
    "Scanning pages for key concepts...",
    "Extracting semantic layers...",
    "Identifying formulas and equations...",
    "Predicting exam-relevant topics...",
    "Synthesizing knowledge nodes...",
    "Optimizing presentation layers...",
    "Cross-referencing slide content...",
    "Building your personalized tutor..."
];

export function LoadingScreen({ progress, chapterTitle }: LoadingScreenProps) {
    const [messageIndex, setMessageIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setMessageIndex((prev) => (prev + 1) % statusMessages.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] relative overflow-hidden">
            {/* Background Glows */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-purple-600/10 rounded-full blur-[80px] animate-pulse delay-700" />

            {/* Main Spinner Container */}
            <div className="relative w-64 h-64 mb-16 perspective-1000">
                {/* Outer Ring */}
                <div className="absolute inset-0 border-[3px] border-transparent border-t-indigo-500 rounded-full animate-[spin_3s_linear_infinite]" />

                {/* Middle Ring */}
                <div className="absolute inset-4 border-[3px] border-transparent border-t-purple-500 rounded-full animate-[spin_2s_linear_infinite_reverse]" />

                {/* Inner Ring */}
                <div className="absolute inset-8 border-[3px] border-transparent border-t-cyan-400 rounded-full animate-[spin_1.5s_linear_infinite]" />

                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-5xl font-black text-white dropshadow-glow tracking-tighter animate-pulse">
                        {Math.round(progress)}%
                    </div>
                </div>
            </div>

            {/* Text Content */}
            <div className="text-center relative z-10 max-w-md px-6">
                <div className="mb-6">
                    <span className="text-xs font-bold text-indigo-500/80 uppercase tracking-[0.4em] mb-2 block">AI Engine Active</span>
                    <h2 className="text-3xl font-black text-white tracking-tight uppercase leading-none truncate max-w-[300px] mx-auto">
                        {chapterTitle || "Analyzing Document"}
                    </h2>
                </div>

                <div className="h-8 flex items-center justify-center">
                    <p className="text-slate-400 text-sm font-mono tracking-widest uppercase animate-pulse">
                        {statusMessages[messageIndex]}
                    </p>
                </div>

                {/* Progress Bar Container */}
                <div className="mt-12 space-y-2">
                    <div className="flex justify-end text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800/50 rounded-full overflow-hidden border border-white/5 backdrop-blur-sm relative">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-600 via-purple-500 to-cyan-400 transition-all duration-700 ease-out relative"
                            style={{ width: `${progress}%` }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite] translate-x-[-100%]" />
                        </div>
                    </div>
                </div>

                {/* Add AdSense here */}
                <div className="mt-8 flex justify-center w-full">
                    <AdSense slot="3890890228" className="w-[300px] h-[100px] md:w-[468px] md:h-[60px]" format="rectangle" />
                </div>
            </div>

            <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        .perspective-1000 {
          perspective: 1000px;
        }
        .dropshadow-glow {
          filter: drop-shadow(0 0 15px rgba(99, 102, 241, 0.6));
        }
      `}</style>
        </div>
    );
}
