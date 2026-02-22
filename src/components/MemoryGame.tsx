import { useState, useEffect, useCallback } from 'react';

const SYMBOLS = ['💻', '🧠', '⚛️', '🚀', '⚡', '🤖'];

interface Card {
    id: number;
    symbol: string;
    isFlipped: boolean;
    isMatched: boolean;
}

export default function MemoryGame() {
    const [cards, setCards] = useState<Card[]>([]);
    const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
    const [matches, setMatches] = useState(0);
    const [moves, setMoves] = useState(0);
    const [isGlimpsing, setIsGlimpsing] = useState(true);

    const initializeGame = useCallback(() => {
        setIsGlimpsing(true);
        const shuffled = [...SYMBOLS, ...SYMBOLS]
            .sort(() => Math.random() - 0.5)
            .map((symbol, index) => ({
                id: index,
                symbol,
                isFlipped: true,
                isMatched: false,
            }));
        setCards(shuffled);
        setFlippedIndices([]);
        setMatches(0);
        setMoves(0);

        // Preview for 1.2 seconds, then flip back
        setTimeout(() => {
            setCards(prev => prev.map(c => ({ ...c, isFlipped: false })));
            setIsGlimpsing(false);
        }, 1200);
    }, []);

    useEffect(() => {
        initializeGame();
    }, [initializeGame]);

    const handleCardClick = (index: number) => {
        if (isGlimpsing || flippedIndices.length === 2 || cards[index].isFlipped || cards[index].isMatched) {
            return;
        }

        const newFlippedIndices = [...flippedIndices, index];
        setFlippedIndices(newFlippedIndices);

        const newCards = [...cards];
        newCards[index].isFlipped = true;
        setCards(newCards);

        if (newFlippedIndices.length === 2) {
            setMoves(m => m + 1);
            const [firstIndex, secondIndex] = newFlippedIndices;

            if (cards[firstIndex].symbol === cards[secondIndex].symbol) {
                // Match found
                setTimeout(() => {
                    setCards(prev => {
                        const updated = [...prev];
                        updated[firstIndex].isMatched = true;
                        updated[secondIndex].isMatched = true;
                        return updated;
                    });
                    setMatches(m => m + 1);
                    setFlippedIndices([]);
                }, 400);
            } else {
                // No match
                setTimeout(() => {
                    setCards(prev => {
                        const updated = [...prev];
                        updated[firstIndex].isFlipped = false;
                        updated[secondIndex].isFlipped = false;
                        return updated;
                    });
                    setFlippedIndices([]);
                }, 800);
            }
        }
    };

    return (
        <div className="absolute inset-0 w-full h-full bg-[#0c111d] flex flex-col items-center justify-center p-6 select-none overflow-hidden touch-none">
            {/* Header / Stats */}
            <div className="flex items-center justify-between w-full max-w-2xl mb-12 px-4 animate-in slide-in-from-top duration-700">
                <div className="text-left">
                    <p className="text-xs uppercase font-black tracking-widest text-indigo-500/60 mb-1">Decrypted</p>
                    <p className="text-5xl font-black text-white italic tracking-tighter tabular-nums">{matches}<span className="text-indigo-500">/6</span></p>
                </div>
                <div className="text-right">
                    <p className="text-xs uppercase font-black tracking-widest text-slate-500 mb-1">Cycles</p>
                    <p className="text-5xl font-black text-white italic tracking-tighter tabular-nums">{moves}</p>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4 md:gap-6 w-full max-w-2xl px-4 perspective-1000">
                {cards.map((card, index) => (
                    <div
                        key={card.id}
                        onClick={() => handleCardClick(index)}
                        className={`aspect-square relative cursor-pointer transition-all duration-500 preserve-3d group ${card.isFlipped || card.isMatched ? 'rotate-y-180' : ''}`}
                    >
                        {/* Front (Icon/Symbol) */}
                        <div className={`absolute inset-0 rounded-[2rem] flex items-center justify-center text-5xl md:text-6xl backface-hidden rotate-y-180 border-2 transition-all duration-300 ${card.isMatched ? 'bg-indigo-500/10 border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.3)]' : 'bg-white/5 border-white/10'}`}>
                            {card.symbol}
                        </div>

                        {/* Back (Shield) */}
                        <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-slate-900 to-[#0c111d] border-2 border-white/10 flex items-center justify-center backface-hidden shadow-2xl group-hover:border-indigo-500/50 transition-all">
                            <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 flex items-center justify-center">
                                <span className="text-indigo-500/30 text-2xl font-black">?</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Complete UI */}
            {matches === 6 && (
                <div className="absolute inset-0 bg-[#0c111d]/90 backdrop-blur-xl flex flex-col items-center justify-center z-[100] animate-in fade-in zoom-in duration-500">
                    <div className="bg-indigo-500/5 border border-white/10 p-16 rounded-[4rem] shadow-2xl text-center">
                        <h3 className="text-7xl font-black text-white uppercase italic tracking-tighter mb-4 animate-pulse">
                            Neural <span className="text-indigo-400">Sync!</span>
                        </h3>
                        <p className="text-slate-400 font-bold uppercase tracking-widest mb-12">All data blocks harmonized in {moves} cycles</p>
                        <button
                            onClick={initializeGame}
                            className="px-16 py-5 bg-indigo-500 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-sm transition-all hover:scale-110 active:scale-95 shadow-[0_0_50px_rgba(99,102,241,0.6)] border border-white/20"
                        >
                            New Extraction
                        </button>
                    </div>
                </div>
            )}

            <div className="mt-12 opacity-50">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.4em]">Memory Protocol v2.5 - Full spectrum</p>
            </div>

            <style>{`
                .preserve-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
                .rotate-y-180 { transform: rotateY(180deg); }
                .perspective-1000 { perspective: 1000px; }
            `}</style>
        </div>
    );
}
