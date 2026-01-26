interface SlideCardProps {
    slideNumber: number;
    thumbnail?: string;
    isImportant?: boolean;
    onUnderstand: () => void;
    selected?: boolean;
    onToggleSelect?: () => void;
}

export const SlideCard = ({ slideNumber, isImportant, thumbnail, onUnderstand, selected, onToggleSelect }: SlideCardProps) => {
    return (
        <div className="relative w-full max-w-5xl mx-auto mb-4 group">
            {/* Main Card Container */}
            <div
                onClick={onToggleSelect}
                className={`relative aspect-[16/9] bg-slate-900 rounded-[2rem] border transition-all duration-500 cursor-pointer overflow-hidden shadow-2xl ${selected
                    ? 'border-indigo-500 ring-4 ring-indigo-500/20 shadow-indigo-500/20'
                    : 'border-white/5 group-hover:border-indigo-500/30'
                    }`}
            >
                {thumbnail ? (
                    <img
                        src={thumbnail}
                        alt={`Slide ${slideNumber}`}
                        className={`w-full h-full object-contain transition-transform duration-700 ${selected ? 'scale-95' : ''}`}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-40">
                        <div className="text-slate-600 font-black text-6xl tracking-tighter uppercase italic">Slide {slideNumber}</div>
                        <div className="w-64 h-1 bg-slate-800 rounded-full" />
                    </div>
                )}

                {/* Selection Pulse Overlay */}
                {selected && (
                    <div className="absolute inset-0 bg-indigo-600/10 animate-pulse pointer-events-none" />
                )}

                {/* Overlays & Buttons */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                {/* Selection Checkbox (Professional Style) */}
                <div className="absolute top-6 left-6 z-20">
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${selected
                        ? 'bg-indigo-500 border-indigo-500 scale-110'
                        : 'bg-slate-950/50 border-white/20 opacity-0 group-hover:opacity-100'
                        }`}>
                        {selected && (
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="absolute top-6 right-6 flex gap-3 z-10" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={onUnderstand}
                        className={`w-16 h-16 rounded-[1.25rem] flex items-center justify-center overflow-hidden transition-all duration-300 group/ai border border-white/5 ${isImportant
                            ? 'bg-amber-600/90 hover:bg-amber-500 shadow-lg shadow-amber-900/50'
                            : 'bg-indigo-600/90 hover:bg-indigo-500 shadow-lg shadow-indigo-900/50'
                            }`}
                        title="Analyze with AI"
                    >
                        <img src="/logo_white_bg.jpg" alt="AI" className="w-full h-full object-cover group-hover/ai:scale-110 transition-transform" />
                    </button>
                </div>

                {/* Info Badge */}
                <div className="absolute bottom-6 left-6 flex items-center gap-3">
                    <div className="bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
                        <span className="text-slate-400 font-mono text-[10px] block uppercase tracking-widest">Slide #{slideNumber}</span>
                    </div>
                    {isImportant && (
                        <div className="bg-amber-600/20 text-amber-500 px-3 py-1 rounded-lg border border-amber-600/30 text-[10px] font-black uppercase tracking-widest">
                            Important
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};
