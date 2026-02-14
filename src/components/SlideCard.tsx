interface SlideCardProps {
    slideNumber: number;
    thumbnail?: string;
    isImportant?: boolean;
    onUnderstand: () => void;
}

export const SlideCard = ({ slideNumber, isImportant, thumbnail, onUnderstand }: SlideCardProps) => {
    return (
        <div className="relative w-full max-w-5xl mx-auto mb-4 group">
            {/* Main Card Container */}
            <div
                className="relative aspect-[16/9] bg-slate-900 rounded-[2rem] border border-white/5 group-hover:border-indigo-500/30 transition-all duration-500 overflow-hidden shadow-2xl"
            >
                {thumbnail ? (
                    <img
                        src={thumbnail}
                        alt={`Slide ${slideNumber}`}
                        className="w-full h-full object-contain transition-transform duration-700"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full space-y-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                        <div className="relative">
                            <div className="absolute inset-0 bg-orange-500/20 blur-3xl rounded-full" />
                            <div className="relative w-24 h-24 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-2xl">
                                <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M21 3H3v18h18V3zm-2 16H5V5h14v14zM8 8h8v2H8V8zm0 4h8v2H8v-2zm0 4h5v2H8v-2z" />
                                </svg>
                            </div>
                        </div>
                        <div className="text-center space-y-2">
                            <div className="text-slate-400 font-black text-3xl tracking-tight">Slide {slideNumber}</div>
                            <div className="text-slate-600 text-sm font-bold uppercase tracking-widest">PowerPoint</div>
                        </div>
                    </div>
                )}

                {/* Overlays & Buttons */}
                <div className="absolute top-4 right-4 md:top-6 md:right-6 flex gap-3 z-30">
                    <button
                        onClick={onUnderstand}
                        className={`w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-[1.25rem] flex items-center justify-center overflow-hidden transition-all duration-300 group/ai border border-white/10 ${isImportant
                            ? 'bg-amber-600/90 hover:bg-amber-500 shadow-lg shadow-amber-900/50'
                            : 'bg-indigo-600/90 hover:bg-indigo-500 shadow-lg shadow-indigo-900/50'
                            }`}
                        title="Analyze with AI"
                    >
                        <img src="/logo_white_bg.jpg" alt="AI" className="w-full h-full object-cover group-hover/ai:scale-110 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
};
