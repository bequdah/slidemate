import React, { useState, useEffect, useRef } from 'react';

const WaitingGame: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [score, setScore] = useState(0);
    const [gameState, setGameState] = useState<'playing' | 'gameover'>('playing');

    // Use refs for game objects to prevent re-initialization on state changes
    const shipRef = useRef({ x: 0, y: 0 });
    const bulletsRef = useRef<{ x: number, y: number }[]>([]);
    const enemiesRef = useRef<{ x: number, y: number, type: string }[]>([]);
    const scoreRef = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set initial size
        const resize = () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            shipRef.current = { x: canvas.width / 2, y: canvas.height - 100 };
        };
        resize();
        window.addEventListener('resize', resize);

        const SHIP_SIZE = 40;
        const BULLET_SPEED = 8;
        const ENEMY_SPEED = 2.8;
        const ENEMY_SPAWN_RATE = 0.04;
        const enemyTypes = ['👾', '🕷️', '🕸️', '🦂', '🛸'];

        let animationFrameId: number;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            shipRef.current.x = e.clientX - rect.left - SHIP_SIZE / 2;
        };

        const handleTouchMove = (e: TouchEvent) => {
            const rect = canvas.getBoundingClientRect();
            if (e.touches[0]) {
                shipRef.current.x = e.touches[0].clientX - rect.left - SHIP_SIZE / 2;
            }
        };

        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('touchmove', handleTouchMove);

        const update = () => {
            if (gameState !== 'playing') return;

            // Spawn enemies
            if (Math.random() < ENEMY_SPAWN_RATE) {
                enemiesRef.current.push({
                    x: Math.random() * (canvas.width - 40),
                    y: -40,
                    type: enemyTypes[Math.floor(Math.random() * enemyTypes.length)]
                });
            }

            // Auto-shoot frequency
            if (Date.now() % 150 < 20) {
                bulletsRef.current.push({ x: shipRef.current.x + SHIP_SIZE / 2, y: shipRef.current.y });
            }

            // Move bullets
            bulletsRef.current = bulletsRef.current.filter(b => b.y > -20);
            bulletsRef.current.forEach(b => b.y -= BULLET_SPEED);

            // Move enemies
            enemiesRef.current.forEach(e => e.y += ENEMY_SPEED);

            // Handle collisions
            const bulletsToKeep = new Array(bulletsRef.current.length).fill(true);
            const enemiesToKeep = new Array(enemiesRef.current.length).fill(true);

            enemiesRef.current.forEach((enemy, eIdx) => {
                const enemyCenterX = enemy.x + 16;
                const enemyCenterY = enemy.y - 12; // Adjust for emoji baseline

                bulletsRef.current.forEach((bullet, bIdx) => {
                    if (!bulletsToKeep[bIdx] || !enemiesToKeep[eIdx]) return;

                    const dist = Math.hypot(enemyCenterX - bullet.x, enemyCenterY - bullet.y);
                    if (dist < 30) {
                        enemiesToKeep[eIdx] = false;
                        bulletsToKeep[bIdx] = false;
                        scoreRef.current += 10;
                        setScore(scoreRef.current);
                    }
                });

                if (enemiesToKeep[eIdx]) {
                    const shipCenterX = shipRef.current.x + SHIP_SIZE / 2;
                    const shipCenterY = shipRef.current.y + SHIP_SIZE / 2;
                    const distToShip = Math.hypot(enemyCenterX - shipCenterX, enemyCenterY - shipCenterY);

                    if (distToShip < 35) {
                        setGameState('gameover');
                    }
                    if (enemy.y > canvas.height + 40) {
                        enemiesToKeep[eIdx] = false;
                    }
                }
            });

            bulletsRef.current = bulletsRef.current.filter((_, i) => bulletsToKeep[i]);
            enemiesRef.current = enemiesRef.current.filter((_, i) => enemiesToKeep[i]);
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#0c111d';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Stars
            ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
            for (let i = 0; i < 40; i++) {
                const x = (Math.sin(i * 123.4) * 0.5 + 0.5) * canvas.width;
                const y = (Date.now() / (20 + (i % 5) * 10) + i * 50) % canvas.height;
                ctx.beginPath();
                ctx.arc(x, y, i % 3 === 0 ? 1.5 : 0.8, 0, Math.PI * 2);
                ctx.fill();
            }

            // Ship
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#6366f1';
            ctx.fillStyle = '#6366f1';
            ctx.beginPath();
            ctx.moveTo(shipRef.current.x + SHIP_SIZE / 2, shipRef.current.y);
            ctx.lineTo(shipRef.current.x, shipRef.current.y + SHIP_SIZE);
            ctx.lineTo(shipRef.current.x + SHIP_SIZE, shipRef.current.y + SHIP_SIZE);
            ctx.closePath();
            ctx.fill();

            // Cockpit
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(shipRef.current.x + SHIP_SIZE / 2, shipRef.current.y + SHIP_SIZE * 0.7, 3, 0, Math.PI * 2);
            ctx.fill();

            // Bullets
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#818cf8';
            ctx.fillStyle = '#a5b4fc';
            bulletsRef.current.forEach(b => {
                ctx.fillRect(b.x - 1.5, b.y, 3, 15);
            });

            // Enemies
            ctx.shadowBlur = 0;
            ctx.font = '32px Arial';
            enemiesRef.current.forEach(e => {
                ctx.fillText(e.type, e.x, e.y);
            });

            // UI Label
            ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
            ctx.font = 'bold 11px Inter';
            ctx.fillText("SLIDE-MATE ARCADE V1.0 - NEUTRALIZE THE BUGS", 24, canvas.height - 24);
        };

        const loop = () => {
            update();
            draw();
            animationFrameId = requestAnimationFrame(loop);
        };

        loop();

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resize);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('touchmove', handleTouchMove);
        };
    }, [gameState]); // Only depend on gameState (start/gameover)

    const resetGame = () => {
        scoreRef.current = 0;
        setScore(0);
        bulletsRef.current = [];
        enemiesRef.current = [];
        setGameState('playing');
    };

    return (
        <div ref={containerRef} className="absolute inset-0 w-full h-full bg-[#0c111d] overflow-hidden">
            <canvas ref={canvasRef} className="w-full h-full cursor-none block" />

            <div className="absolute top-6 right-6 z-10">
                <p className="text-white font-black text-3xl tracking-tighter tabular-nums drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                    {score.toString().padStart(5, '0')}
                </p>
            </div>

            {gameState === 'gameover' && (
                <div className="absolute inset-0 bg-[#0c111d]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-[100] animate-in fade-in duration-500">
                    <div className="bg-indigo-500/5 border border-white/10 p-12 rounded-[3.5rem] shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
                        <h4 className="text-5xl font-black text-white mb-4 uppercase italic tracking-tighter relative z-10">Mission Failed</h4>
                        <p className="text-slate-400 text-lg mb-8 font-bold relative z-10">Bugs neutralized: <span className="text-indigo-400 font-black">{score / 10}</span></p>
                        <button
                            onClick={resetGame}
                            className="relative z-10 px-12 py-4 bg-indigo-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-400 hover:scale-110 active:scale-95 transition-all shadow-[0_0_40px_rgba(99,102,241,0.5)]"
                        >
                            Restart Mission
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WaitingGame;
