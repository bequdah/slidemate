import type { FC } from 'react';

interface LogoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LogoModal: FC<LogoModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl" />

            <div
                className="relative bg-white p-2 rounded-[2.5rem] shadow-2xl max-w-sm w-full transform animate-in zoom-in-95 duration-500 overflow-hidden group"
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <img
                    src="/logo_white_bg.jpg"
                    alt="SlideMate Premium Logo"
                    className="w-full h-auto rounded-[2rem] shadow-inner"
                />

                <div className="p-6 text-center space-y-2">
                    <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic">
                        SLIDE<span className="text-indigo-600">MΛTE</span>
                    </h3>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Premium AI Learning Identity</p>
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-10 h-10 bg-slate-100/80 hover:bg-white rounded-full flex items-center justify-center text-slate-800 transition-all hover:scale-110 active:scale-95 shadow-lg border border-white"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};
