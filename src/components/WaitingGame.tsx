import React, { useState, useEffect, useRef } from 'react';

const WaitingGame: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [score, setScore] = useState(0);
    const [gameState, setGameState] = useState<'playing' | 'gameover'>('playing');

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set initial size and handle resize
        const resize = () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // Game Constants
        const SHIP_SIZE = 40;
        const BULLET_SPEED = 8;
        const ENEMY_SPEED = 2.8;
        const ENEMY_SPAWN_RATE = 0.04;

        let animationFrameId: number;
        let ship = { x: canvas.width / 2, y: canvas.height - 100 };
        let bullets: { x: number, y: number }[] = [];
        let enemies: { x: number, y: number, type: string }[] = [];
        const enemyTypes = ['👾', '🕷️', '🕸️', '🦂', '🛸'];

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
                    x: Math.random() * (canvas.width - 40),
                    y: -40,
                    type: enemyTypes[Math.floor(Math.random() * enemyTypes.length)]
                });
            }

            // Auto-shoot frequency
            if (Date.now() % 150 < 20) {
                bullets.push({ x: ship.x + SHIP_SIZE / 2, y: ship.y });
            }

            // Move bullets
            bullets = bullets.filter(b => b.y > -20);
            bullets.forEach(b => b.y -= BULLET_SPEED);

            // Move enemies
            enemies.forEach(e => e.y += ENEMY_SPEED);

            // Track hits to remove after checking all collisions
            const bulletsToKeep: boolean[] = new Array(bullets.length).fill(true);
            const enemiesToKeep: boolean[] = new Array(enemies.length).fill(true);

            // Check collisions
            enemies.forEach((enemy, eIdx) => {
                bullets.forEach((bullet, bIdx) => {
                    if (!bulletsToKeep[bIdx] || !enemiesToKeep[eIdx]) return;

                    const dist = Math.hypot(enemy.x + 15 - bullet.x, enemy.y + 15 - bullet.y);
                    if (dist < 35) {
                        enemiesToKeep[eIdx] = false;
                        bulletsToKeep[bIdx] = false;
                        setScore(s => s + 10);
                    }
                });

                // Ship collision logic (more forgiving)
                if (enemiesToKeep[eIdx]) {
                    const shipCenterX = ship.x + SHIP_SIZE / 2;
                    const shipCenterY = ship.y + SHIP_SIZE / 2;
                    if (Math.hypot(enemy.x + 15 - shipCenterX, enemy.y + 15 - shipCenterY) < 35) {
                        setGameState('gameover');
                    }

                    // Reach bottom
                    if (enemy.y > canvas.height + 40) {
                        enemiesToKeep[eIdx] = false;
                    }
                }
            });

            // Apply removals
            bullets = bullets.filter((_, i) => bulletsToKeep[i]);
            enemies = enemies.filter((_, i) => enemiesToKeep[i]);
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Deep Space Background
            ctx.fillStyle = '#0c111d';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Stars field
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
            ctx.moveTo(ship.x + SHIP_SIZE / 2, ship.y);
            ctx.lineTo(ship.x, ship.y + SHIP_SIZE);
            ctx.lineTo(ship.x + SHIP_SIZE, ship.y + SHIP_SIZE);
            ctx.closePath();
            ctx.fill();

            // Cockpit
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(ship.x + SHIP_SIZE / 2, ship.y + SHIP_SIZE * 0.7, 3, 0, Math.PI * 2);
            ctx.fill();

            // Bullets
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#818cf8';
            ctx.fillStyle = '#a5b4fc';
            bullets.forEach(b => {
                ctx.fillRect(b.x - 1.5, b.y, 3, 15);
            });

            // Enemies
            ctx.shadowBlur = 0;
            ctx.font = '32px Arial';
            enemies.forEach(e => {
                ctx.fillText(e.type, e.x, e.y);
            });

            // UI Label
            ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
            ctx.font = 'bold 11px Inter';
            ctx.fillText("SLIDE-MATE ARCADE V1.0 - NEUTRALIZE THE BUGS", 24, canvas.height - 24);

            // Live Score
            ctx.fillStyle = '#fff';
            ctx.font = '900 24px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(score.toString().padStart(5, '0'), canvas.width - 24, 44);
            ctx.textAlign = 'left';
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
    }, [gameState, score]);

    const resetGame = () => {
        setScore(0);
        setGameState('playing');
    };

    return (
        <div ref={containerRef} className="absolute inset-0 w-full h-full bg-[#0c111d] overflow-hidden">
            <canvas
                ref={canvasRef}
                className="w-full h-full cursor-none block"
            />

            {gameState === 'gameover' && (
                <div className="absolute inset-0 bg-[#0c111d]/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500 z-[100]">
                    <div className="bg-indigo-500/5 border border-white/10 p-12 rounded-[3.5rem] shadow-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
                        <h4 className="text-4xl md:text-5xl font-black text-white mb-4 uppercase italic tracking-tighter relative z-10">Mission Failed</h4>
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
