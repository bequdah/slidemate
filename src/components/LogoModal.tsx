import type { FC } from 'react';

interface LogoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LogoModal: FC<LogoModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-500"
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-3xl" />

            <div
                className="relative bg-slate-900 p-3 rounded-[3rem] shadow-2xl max-w-sm w-full transform animate-in zoom-in-95 duration-500 overflow-hidden group border border-white/10"
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="relative aspect-square rounded-[2.5rem] overflow-hidden bg-white shadow-2xl">
                    <img
                        src="/logo_white_bg.jpg"
                        alt="SlideMate Premium Logo"
                        className="w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-110"
                    />
                </div>

                <div className="p-8 text-center space-y-3">
                    <h3 className="text-3xl font-black text-white tracking-tighter uppercase italic">
                        SLIDE<span className="text-indigo-400">MΛTE</span>
                    </h3>
                    <div className="flex justify-center">
                        <span className="px-4 py-1.5 bg-indigo-500/10 rounded-full text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] border border-indigo-500/20">
                            The Future of Learning
                        </span>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 w-12 h-12 bg-slate-950/50 hover:bg-indigo-600 rounded-2xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95 shadow-2xl border border-white/10 backdrop-blur-xl z-50 text-2xl"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};
