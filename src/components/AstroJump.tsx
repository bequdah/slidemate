import React, { useState, useEffect, useRef } from 'react';

const AstroJump: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [score, setScore] = useState(0);
    const [gameState, setGameState] = useState<'playing' | 'gameover'>('playing');

    // Game Refs
    const birdRef = useRef({ y: 0, velocity: 0 });
    const pipesRef = useRef<{ x: number, topHeight: number }[]>([]);
    const scoreRef = useRef(0);
    const frameCountRef = useRef(0);

    const GRAVITY = 0.45;
    const JUMP_STRENGTH = -7;
    const PIPE_SPEED = 4.2;
    const PIPE_SPAWN_INTERVAL = 90;
    const PIPE_GAP = 145;

    useEffect(() => {
        const handleJump = (e: any) => {
            if (e.cancelable) e.preventDefault();
            if (gameState === 'playing') {
                birdRef.current.velocity = JUMP_STRENGTH;
            } else if (gameState === 'gameover') {
                resetGame();
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                handleJump(e);
            }
        };

        window.addEventListener('mousedown', handleJump);
        window.addEventListener('touchstart', handleJump, { passive: false });
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('mousedown', handleJump);
            window.removeEventListener('touchstart', handleJump);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [gameState]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            birdRef.current.y = canvas.height / 2;
        };
        resize();
        window.addEventListener('resize', resize);

        let animationFrameId: number;

        const update = () => {
            if (gameState !== 'playing') return;

            frameCountRef.current++;

            // Bird physics
            birdRef.current.velocity += GRAVITY;
            birdRef.current.y += birdRef.current.velocity;

            // Spawn pipes
            if (frameCountRef.current === 1 || frameCountRef.current % PIPE_SPAWN_INTERVAL === 0) {
                const minHeight = 50;
                const maxHeight = canvas.height - PIPE_GAP - 50;
                const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
                // Move the very first pipe further away (120% of width) to give more breathing room
                const spawnX = frameCountRef.current === 1 ? canvas.width * 1.2 : canvas.width;
                pipesRef.current.push({ x: spawnX, topHeight });
            }

            // Move pipes
            pipesRef.current.forEach(pipe => pipe.x -= PIPE_SPEED);

            // Remove off-screen pipes
            if (pipesRef.current.length > 0 && pipesRef.current[0].x < -60) {
                pipesRef.current.shift();
                scoreRef.current += 1;
                setScore(scoreRef.current);
            }

            // Collision Detection
            const birdX = 100;
            const birdY = birdRef.current.y;
            const birdSize = 25;

            // Hit floor or ceiling
            if (birdY < 0 || birdY > canvas.height) {
                setGameState('gameover');
            }

            // Hit pipes
            pipesRef.current.forEach(pipe => {
                if (birdX + birdSize > pipe.x && birdX < pipe.x + 60) {
                    if (birdY < pipe.topHeight || birdY + birdSize > pipe.topHeight + PIPE_GAP) {
                        setGameState('gameover');
                    }
                }
            });
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Background
            ctx.fillStyle = '#0c111d';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Stars
            ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
            for (let i = 0; i < 30; i++) {
                const x = (i * 137.5) % canvas.width;
                const y = (Date.now() / 50 + i * 100) % canvas.height;
                ctx.fillRect(x, y, 2, 2);
            }

            // Draw Pipes (Data Gates)
            pipesRef.current.forEach(pipe => {
                const gradient = ctx.createLinearGradient(pipe.x, 0, pipe.x + 60, 0);
                gradient.addColorStop(0, '#4f46e5');
                gradient.addColorStop(1, '#818cf8');

                ctx.fillStyle = gradient;
                ctx.shadowBlur = 15;
                ctx.shadowColor = 'rgba(79, 70, 229, 0.4)';

                // Top pipe
                ctx.fillRect(pipe.x, 0, 60, pipe.topHeight);
                // Bottom pipe
                ctx.fillRect(pipe.x, pipe.topHeight + PIPE_GAP, 60, canvas.height - (pipe.topHeight + PIPE_GAP));

                // Cap details
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = 0.3;
                ctx.fillRect(pipe.x, pipe.topHeight - 10, 60, 10);
                ctx.fillRect(pipe.x, pipe.topHeight + PIPE_GAP, 60, 10);
                ctx.globalAlpha = 1.0;
            });

            // Draw Bird (Astro-Bot)
            ctx.shadowBlur = 25;
            ctx.shadowColor = '#6366f1';
            ctx.fillStyle = '#6366f1';

            ctx.beginPath();
            ctx.arc(100 + 12.5, birdRef.current.y + 12.5, 12, 0, Math.PI * 2);
            ctx.fill();

            // Bot eye
            ctx.fillStyle = 'white';
            ctx.fillRect(110, birdRef.current.y + 8, 4, 4);

            // UI
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
            ctx.font = 'bold 11px Inter';
            ctx.fillText("ASTRO JUMP V1.1 - TAP TO DEFY GRAVITY", 24, canvas.height - 24);
        };

        const loop = () => {
            update();
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
        birdRef.current = { y: canvasRef.current!.height / 2, velocity: 0 };
        pipesRef.current = [];
        frameCountRef.current = 0;
        setGameState('playing');
    };

    return (
        <div ref={containerRef} className="absolute inset-0 w-full h-full bg-[#0c111d] overflow-hidden">
            <canvas ref={canvasRef} className="w-full h-full block cursor-none" />

            <div className="absolute top-6 right-6 z-10">
                <p className="text-white font-black text-3XL tracking-tighter tabular-nums drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                    {score.toString().padStart(3, '0')}
                </p>
            </div>

            {gameState === 'gameover' && (
                <div className="absolute inset-0 bg-[#0c111d]/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-[100] animate-in fade-in duration-500">
                    <div className="bg-indigo-500/5 border border-white/10 p-12 rounded-[3.5rem] shadow-2xl">
                        <h4 className="text-5xl font-black text-white mb-4 uppercase italic tracking-tighter">Signal Lost</h4>
                        <p className="text-slate-400 text-lg mb-8 font-bold">Gates passed: <span className="text-indigo-400 font-black">{score}</span></p>
                        <button
                            onClick={resetGame}
                            className="px-12 py-4 bg-indigo-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-400 hover:scale-110 active:scale-95 transition-all shadow-[0_0_40px_rgba(99,102,241,0.5)]"
                        >
                            Relink Connection
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AstroJump;
