import React, { useState, useEffect, useRef } from 'react';

const WaitingGame: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [score, setScore] = useState(0);
    const [gameState, setGameState] = useState<'playing' | 'gameover'>('playing');

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Game Constants
        const SHIP_SIZE = 40;
        const BULLET_SPEED = 7;
        const ENEMY_SPEED = 2.5;
        const ENEMY_SPAWN_RATE = 0.02;

        let animationFrameId: number;
        let ship = { x: canvas.width / 2, y: canvas.height - 60 };
        let bullets: { x: number, y: number }[] = [];
        let enemies: { x: number, y: number, type: string }[] = [];
        const enemyTypes = ['👾', '🕷️', 'شرات', '🕸️'];

        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            ship.x = e.clientX - rect.left - SHIP_SIZE / 2;
        };

        const handleTouchMove = (e: TouchEvent) => {
            const rect = canvas.getBoundingClientRect();
            if (e.touches[0]) {
                ship.x = e.touches[0].clientX - rect.left - SHIP_SIZE / 2;
            }
        };

        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('touchmove', handleTouchMove);

        const update = () => {
            if (gameState !== 'playing') return;

            // Spawn enemies
            if (Math.random() < ENEMY_SPAWN_RATE) {
                enemies.push({
                    x: Math.random() * (canvas.width - 30),
                    y: -30,
                    type: enemyTypes[Math.floor(Math.random() * enemyTypes.length)]
                });
            }

            // Auto-shoot
            if (Date.now() % 200 < 20) {
                bullets.push({ x: ship.x + SHIP_SIZE / 2, y: ship.y });
            }

            // Move bullets
            bullets = bullets.filter(b => b.y > 0);
            bullets.forEach(b => b.y -= BULLET_SPEED);

            // Move enemies
            enemies.forEach(e => e.y += ENEMY_SPEED);

            // Check collisions
            enemies.forEach((enemy, eIdx) => {
                bullets.forEach((bullet, bIdx) => {
                    const dist = Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y);
                    if (dist < 25) {
                        enemies.splice(eIdx, 1);
                        bullets.splice(bIdx, 1);
                        setScore(s => s + 10);
                    }
                });

                // Ship collision
                if (Math.hypot(enemy.x - ship.x, enemy.y - ship.y) < 30) {
                    setGameState('gameover');
                }

                // Reach bottom
                if (enemy.y > canvas.height) {
                    enemies.splice(eIdx, 1);
                }
            });
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Stars Background
            ctx.fillStyle = '#1e293b';
            for (let i = 0; i < 20; i++) {
                ctx.beginPath();
                ctx.arc(Math.random() * canvas.width, (Date.now() / 50 + i * 50) % canvas.height, 1, 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw Ship (Simple Neon Triangle)
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#6366f1';
            ctx.fillStyle = '#6366f1';
            ctx.beginPath();
            ctx.moveTo(ship.x + SHIP_SIZE / 2, ship.y);
            ctx.lineTo(ship.x, ship.y + SHIP_SIZE);
            ctx.lineTo(ship.x + SHIP_SIZE, ship.y + SHIP_SIZE);
            ctx.closePath();
            ctx.fill();

            // Draw Bullets
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#818cf8';
            ctx.fillStyle = '#818cf8';
            bullets.forEach(b => {
                ctx.fillRect(b.x - 1, b.y, 2, 10);
            });

            // Draw Enemies
            ctx.shadowBlur = 0;
            ctx.font = '24px Arial';
            enemies.forEach(e => {
                ctx.fillText(e.type, e.x, e.y);
            });

            // Score
            ctx.fillStyle = '#fff';
            ctx.font = 'black 14px Inter';
            ctx.fillText(`SCORE: ${score}`, 20, 30);
        };

        const loop = () => {
            update();
            draw();
            animationFrameId = requestAnimationFrame(loop);
        };

        loop();

        return () => {
            cancelAnimationFrame(animationFrameId);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('touchmove', handleTouchMove);
        };
    }, [gameState, score]);

    const resetGame = () => {
        setScore(0);
        setGameState('playing');
    };

    return (
        <div className="flex flex-col items-center justify-center p-4 bg-indigo-500/5 rounded-3xl border border-indigo-500/10 shadow-2xl overflow-hidden relative group">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none">
                <p className="text-[10px] text-indigo-400 font-black tracking-[0.3em] uppercase mb-1">Slide-Mate Arcade</p>
                <p className="text-[9px] text-slate-500 font-medium">Kill the bugs while we analyze!</p>
            </div>

            <canvas
                ref={canvasRef}
                width={350}
                height={400}
                className="cursor-none rounded-2xl md:w-[450px] md:h-[300px]"
            />

            {gameState === 'gameover' && (
                <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                    <h4 className="text-2xl font-black text-white mb-2 uppercase italic">Game Over</h4>
                    <p className="text-slate-400 text-sm mb-6 font-bold">Your score: <span className="text-indigo-400">{score}</span></p>
                    <button
                        onClick={resetGame}
                        className="px-6 py-2 bg-indigo-500 text-white rounded-full font-black text-xs uppercase tracking-widest hover:bg-indigo-400 transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
                    >
                        Try Again
                    </button>
                </div>
            )}
        </div>
    );
};

export default WaitingGame;
