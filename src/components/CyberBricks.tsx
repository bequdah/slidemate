import { useEffect, useRef, useState } from 'react';

interface Brick {
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    active: boolean;
}

export default function CyberBricks() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [score, setScore] = useState(0);
    const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover' | 'win'>('start');

    // Constants (Relative)
    const PADDLE_HEIGHT = 12;
    const PADDLE_WIDTH_RATIO = 0.25; // 25% of width
    const BALL_RADIUS = 8;
    const BRICK_ROWS = 5;
    const BRICK_COLS = 6;
    const BRICK_PADDING = 6;
    const BRICK_OFFSET_TOP = 80;

    const gameData = useRef({
        paddleX: 0,
        ballX: 0,
        ballY: 0,
        dx: 4,
        dy: -4,
        bricks: [] as Brick[],
        paddleWidth: 80
    });

    const initBricks = (width: number) => {
        const bricks: Brick[] = [];
        const colors = ['#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3'];
        const padding = BRICK_PADDING;
        const offsetSides = 20;
        const availableWidth = width - (offsetSides * 2);
        const brickW = (availableWidth - (padding * (BRICK_COLS - 1))) / BRICK_COLS;
        const brickH = 20;

        for (let r = 0; r < BRICK_ROWS; r++) {
            for (let c = 0; c < BRICK_COLS; c++) {
                bricks.push({
                    x: offsetSides + c * (brickW + padding),
                    y: BRICK_OFFSET_TOP + r * (brickH + padding),
                    w: brickW,
                    h: brickH,
                    color: colors[r % colors.length],
                    active: true
                });
            }
        }
        return bricks;
    };

    const startGame = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setScore(0);
        const pWidth = canvas.width * PADDLE_WIDTH_RATIO;
        gameData.current = {
            paddleX: (canvas.width - pWidth) / 2,
            ballX: canvas.width / 2,
            ballY: canvas.height - 60,
            dx: (Math.random() - 0.5) * 6,
            dy: -5,
            bricks: initBricks(canvas.width),
            paddleWidth: pWidth
        };
        setGameState('playing');
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            if (gameState === 'start') {
                const pWidth = canvas.width * PADDLE_WIDTH_RATIO;
                gameData.current.paddleX = (canvas.width - pWidth) / 2;
                gameData.current.paddleWidth = pWidth;
            }
        };

        resize();
        window.addEventListener('resize', resize);

        let animationId: number;

        const draw = () => {
            if (gameState !== 'playing') return;

            // Clear canvas
            ctx.fillStyle = '#0c111d';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const data = gameData.current;

            // Draw Bricks
            let activeBricks = 0;
            data.bricks.forEach(brick => {
                if (brick.active) {
                    activeBricks++;
                    ctx.beginPath();
                    ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 4);
                    ctx.fillStyle = brick.color;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = brick.color;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.closePath();
                }
            });

            if (activeBricks === 0) {
                setGameState('win');
                return;
            }

            // Draw Paddle
            ctx.beginPath();
            ctx.roundRect(data.paddleX, canvas.height - PADDLE_HEIGHT - 30, data.paddleWidth, PADDLE_HEIGHT, 6);
            ctx.fillStyle = '#f87171';
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#f87171';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.closePath();

            // Draw Ball
            ctx.beginPath();
            ctx.arc(data.ballX, data.ballY, BALL_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 25;
            ctx.shadowColor = '#fff';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.closePath();

            // Movement
            // Wall Collision
            if (data.ballX + data.dx > canvas.width - BALL_RADIUS || data.ballX + data.dx < BALL_RADIUS) {
                data.dx = -data.dx;
            }
            if (data.ballY + data.dy < BALL_RADIUS) {
                data.dy = -data.dy;
            } else if (data.ballY + data.dy > canvas.height - BALL_RADIUS - 30) {
                // Paddle Collision
                if (data.ballX > data.paddleX && data.ballX < data.paddleX + data.paddleWidth) {
                    data.dy = -Math.abs(data.dy) * 1.02; // Slightly speed up
                    // Spin based on where it hit the paddle
                    const hitPoint = (data.ballX - (data.paddleX + data.paddleWidth / 2)) / (data.paddleWidth / 2);
                    data.dx = hitPoint * 7;
                } else if (data.ballY + data.dy > canvas.height) {
                    setGameState('gameover');
                    return;
                }
            }

            // Brick Collision
            data.bricks.forEach(brick => {
                if (brick.active) {
                    if (data.ballX + BALL_RADIUS > brick.x &&
                        data.ballX - BALL_RADIUS < brick.x + brick.w &&
                        data.ballY + BALL_RADIUS > brick.y &&
                        data.ballY - BALL_RADIUS < brick.y + brick.h) {

                        data.dy = -data.dy;
                        brick.active = false;
                        setScore(s => s + 25);
                    }
                }
            });

            data.ballX += data.dx;
            data.ballY += data.dy;

            animationId = requestAnimationFrame(draw);
        };

        if (gameState === 'playing') animationId = requestAnimationFrame(draw);

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, [gameState]);

    const handleInput = (clientX: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const data = gameData.current;
        let newX = x - data.paddleWidth / 2;
        if (newX < 0) newX = 0;
        if (newX > canvas.width - data.paddleWidth) newX = canvas.width - data.paddleWidth;
        data.paddleX = newX;
    };

    return (
        <div ref={containerRef} className="absolute inset-0 w-full h-full bg-[#0c111d] overflow-hidden select-none touch-none">
            <canvas
                ref={canvasRef}
                onMouseMove={(e) => handleInput(e.clientX)}
                onTouchMove={(e) => handleInput(e.touches[0].clientX)}
                className="w-full h-full block cursor-none"
            />

            {/* UI Layer */}
            <div className="absolute top-6 left-6 pointer-events-none">
                <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Score</p>
                <p className="text-4xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{score}</p>
            </div>

            {gameState !== 'playing' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0c111d]/90 backdrop-blur-xl z-[100] p-8 animate-in fade-in duration-500">
                    <div className="max-w-md w-full text-center">
                        {gameState === 'gameover' && (
                            <div className="mb-8">
                                <h2 className="text-6xl font-black text-red-500 uppercase italic tracking-tighter mb-2">Systems Failed</h2>
                                <p className="text-slate-400 font-bold uppercase tracking-widest">Final Data Points: {score}</p>
                            </div>
                        )}
                        {gameState === 'win' && (
                            <div className="mb-8">
                                <h2 className="text-6xl font-black text-indigo-400 uppercase italic tracking-tighter mb-2">Network Cleared</h2>
                                <p className="text-white font-bold uppercase tracking-widest">You destroyed the firewall!</p>
                            </div>
                        )}
                        {gameState === 'start' && (
                            <div className="mb-12">
                                <h1 className="text-7xl font-black text-white uppercase tracking-tighter mb-2 italic">Cyber<span className="text-indigo-500">Bricks</span></h1>
                                <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-xs">Security Protocol Bypass Active</p>
                            </div>
                        )}

                        <button
                            onClick={startGame}
                            className="px-16 py-5 bg-indigo-500 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-sm transition-all hover:scale-110 active:scale-95 shadow-[0_0_50px_rgba(99,102,241,0.6)] border border-white/20"
                        >
                            {gameState === 'start' ? 'Bypass Firewall' : 'Reboot System'}
                        </button>
                    </div>
                </div>
            )}

            <div className="absolute bottom-6 right-6 pointer-events-none opacity-30">
                <p className="text-[10px] font-bold text-white uppercase tracking-[0.3em]">Protocol v6.0 - Full Spectrum</p>
            </div>
        </div>
    );
}
