import { useState, useEffect, useCallback } from 'react';

const SYMBOLS = ['💻', '🧠', '⚛️', '🚀', '⚡', '🤖', '🎓', '📚'];

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
        <div className="flex flex-col items-center justify-center h-full w-full p-2 bg-[#0c111d] select-none overflow-hidden">
            <div className="mb-4 flex items-center justify-between w-full max-w-[280px] px-2">
                <div className="text-center">
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Matches</p>
                    <p className="text-lg font-black text-indigo-400">{matches}/8</p>
                </div>
                <div className="text-center">
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Moves</p>
                    <p className="text-lg font-black text-white">{moves}</p>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-2 md:gap-3 max-w-[280px] md:max-w-[340px] w-full perspective-1000">
                {cards.map((card, index) => (
                    <div
                        key={card.id}
                        onClick={() => handleCardClick(index)}
                        className={`aspect-square relative cursor-pointer transition-all duration-500 preserve-3d ${card.isFlipped || card.isMatched ? 'rotate-y-180' : ''}`}
                    >
                        {/* Front (Icon) */}
                        <div className={`absolute inset-0 rounded-xl md:rounded-2xl flex items-center justify-center text-2xl md:text-3xl backface-hidden rotate-y-180 border-2 transition-all duration-300 ${card.isMatched ? 'bg-indigo-500/20 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'bg-white/10 border-white/20'}`}>
                            {card.symbol}
                        </div>

                        {/* Back (Cover) */}
                        <div className="absolute inset-0 rounded-xl md:rounded-2xl bg-gradient-to-br from-indigo-900/40 to-slate-900 border-2 border-white/10 flex items-center justify-center backface-hidden shadow-lg group hover:border-indigo-500/50 transition-colors">
                            <span className="text-indigo-500/30 text-xl font-black">?</span>
                        </div>
                    </div>
                ))}
            </div>

            {matches === 8 && (
                <div className="mt-6 animate-in zoom-in duration-500 text-center">
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-3 animate-bounce">
                        Perfect <span className="text-indigo-400">Memory!</span>
                    </h3>
                    <button
                        onClick={initializeGame}
                        className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                    >
                        Play Again
                    </button>
                </div>
            )}

            <p className="mt-6 text-[9px] font-bold text-slate-700 uppercase tracking-widest">Code Memory v1.1</p>

            <style>{`
                .preserve-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
                .rotate-y-180 { transform: rotateY(180deg); }
                .perspective-1000 { perspective: 1000px; }
            `}</style>
        </div>
    );
}
