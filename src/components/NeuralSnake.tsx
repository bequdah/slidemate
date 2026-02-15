import React, { useState, useEffect, useRef } from 'react';

const NeuralSnake: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [score, setScore] = useState(0);
    const [gameState, setGameState] = useState<'playing' | 'gameover'>('playing');

    const snakeRef = useRef<{ x: number, y: number }[]>([
        { x: 10, y: 10 },
        { x: 10, y: 11 },
        { x: 10, y: 12 }
    ]);
    const directionRef = useRef({ x: 0, y: -1 });
    const foodRef = useRef({ x: 15, y: 15 });
    const gridCountRef = useRef({ x: 20, y: 20 });
    const lastUpdateRef = useRef(0);
    const scoreRef = useRef(0);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowUp': if (directionRef.current.y !== 1) directionRef.current = { x: 0, y: -1 }; break;
                case 'ArrowDown': if (directionRef.current.y !== -1) directionRef.current = { x: 0, y: 1 }; break;
                case 'ArrowLeft': if (directionRef.current.x !== 1) directionRef.current = { x: -1, y: 0 }; break;
                case 'ArrowRight': if (directionRef.current.x !== -1) directionRef.current = { x: 1, y: 0 }; break;
            }
        };

        let touchStartX = 0;
        let touchStartY = 0;

        const handleTouchStart = (e: TouchEvent) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        };

        const handleTouchEnd = (e: TouchEvent) => {
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;

            const dx = touchEndX - touchStartX;
            const dy = touchEndY - touchStartY;

            if (Math.abs(dx) > Math.abs(dy)) {
                // Horizontal swipe
                if (Math.abs(dx) > 30) {
                    if (dx > 0 && directionRef.current.x !== -1) directionRef.current = { x: 1, y: 0 };
                    else if (dx < 0 && directionRef.current.x !== 1) directionRef.current = { x: -1, y: 0 };
                }
            } else {
                // Vertical swipe
                if (Math.abs(dy) > 30) {
                    if (dy > 0 && directionRef.current.y !== -1) directionRef.current = { x: 0, y: 1 };
                    else if (dy < 0 && directionRef.current.y !== 1) directionRef.current = { x: 0, y: -1 };
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('touchstart', handleTouchStart);
        window.addEventListener('touchend', handleTouchEnd);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            gridCountRef.current = {
                x: Math.floor(canvas.width / 20),
                y: Math.floor(canvas.height / 20)
            };
        };
        resize();
        window.addEventListener('resize', resize);

        let animationFrameId: number;

        const update = (timestamp: number) => {
            if (gameState !== 'playing') return;

            // Control speed
            const speed = Math.max(50, 100 - Math.floor(scoreRef.current / 50) * 5);
            if (timestamp - lastUpdateRef.current < speed) return;
            lastUpdateRef.current = timestamp;

            const head = { ...snakeRef.current[0] };
            head.x += directionRef.current.x;
            head.y += directionRef.current.y;

            // Wall collision (wrap around)
            if (head.x < 0) head.x = gridCountRef.current.x - 1;
            if (head.x >= gridCountRef.current.x) head.x = 0;
            if (head.y < 0) head.y = gridCountRef.current.y - 1;
            if (head.y >= gridCountRef.current.y) head.y = 0;

            // Self collision
            if (snakeRef.current.some(segment => segment.x === head.x && segment.y === head.y)) {
                setGameState('gameover');
                return;
            }

            snakeRef.current.unshift(head);

            // Food collision
            if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
                scoreRef.current += 10;
                setScore(scoreRef.current);
                foodRef.current = {
                    x: Math.floor(Math.random() * gridCountRef.current.x),
                    y: Math.floor(Math.random() * gridCountRef.current.y)
                };
            } else {
                snakeRef.current.pop();
            }
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#0c111d';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const cellSize = 20;

            // Draw Food (Data Node)
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#fbbf24';
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(
                foodRef.current.x * cellSize + cellSize / 2,
                foodRef.current.y * cellSize + cellSize / 2,
                cellSize / 3,
                0,
                Math.PI * 2
            );
            ctx.fill();

            // Draw Snake (Neural Chain)
            snakeRef.current.forEach((segment, i) => {
                const isHead = i === 0;
                ctx.shadowBlur = isHead ? 20 : 10;
                ctx.shadowColor = '#6366f1';
                ctx.fillStyle = isHead ? '#818cf8' : 'rgba(99, 102, 241, ' + (1 - i / snakeRef.current.length * 0.8) + ')';

                const padding = isHead ? 2 : 4;
                ctx.fillRect(
                    segment.x * cellSize + padding,
                    segment.y * cellSize + padding,
                    cellSize - padding * 2,
                    cellSize - padding * 2
                );

                if (isHead) {
                    ctx.fillStyle = 'white';
                    ctx.fillRect(segment.x * cellSize + 6, segment.y * cellSize + 6, 3, 3);
                    ctx.fillRect(segment.x * cellSize + 12, segment.y * cellSize + 6, 3, 3);
                }
            });

            // UI
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
            ctx.font = 'bold 11px Inter';
            ctx.fillText("NEURAL SNAKE V1.0 - COLLECT KNOWLEDGE NODES", 24, canvas.height - 24);
        };

        const loop = (timestamp: number) => {
            update(timestamp);
            draw();
            animationFrameId = requestAnimationFrame(loop);
        };

        animationFrameId = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resize);
        };
    }, [gameState]);

    const resetGame = () => {
        scoreRef.current = 0;
        setScore(0);
        snakeRef.current = [
            { x: 10, y: 10 },
            { x: 10, y: 11 },
            { x: 10, y: 12 }
        ];
        directionRef.current = { x: 0, y: -1 };
        setGameState('playing');
    };

    return (
        <div ref={containerRef} className="absolute inset-0 w-full h-full bg-[#0c111d] overflow-hidden">
            <canvas ref={canvasRef} className="w-full h-full block" />

            <div className="absolute top-6 right-6 z-10">
                <p className="text-white font-black text-3xl tracking-tighter tabular-nums drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                    {score.toString().padStart(5, '0')}
                </p>
            </div>

            {gameState === 'gameover' && (
                <div className="absolute inset-0 bg-[#0c111d]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-[100] animate-in fade-in duration-500">
                    <div className="bg-indigo-500/5 border border-white/10 p-12 rounded-[3.5rem] shadow-2xl">
                        <h4 className="text-5xl font-black text-white mb-4 uppercase italic tracking-tighter">Chain Interrupted</h4>
                        <p className="text-slate-400 text-lg mb-8 font-bold">Nodes collected: <span className="text-indigo-400 font-black">{score / 10}</span></p>
                        <button
                            onClick={resetGame}
                            className="px-12 py-4 bg-indigo-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-400 hover:scale-110 active:scale-95 transition-all shadow-[0_0_40px_rgba(99,102,241,0.5)]"
                        >
                            Reconnect Neural Path
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NeuralSnake;
