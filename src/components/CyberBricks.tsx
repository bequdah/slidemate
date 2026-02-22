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
    const [score, setScore] = useState(0);
    const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover' | 'win'>('start');

    // Constants
    const PADDLE_HEIGHT = 10;
    const PADDLE_WIDTH = 75;
    const BALL_RADIUS = 6;
    const BRICK_ROWS = 4;
    const BRICK_COLS = 6;
    const BRICK_PADDING = 8;
    const BRICK_OFFSET_TOP = 40;
    const BRICK_OFFSET_LEFT = 20;

    const gameData = useRef({
        paddleX: 0,
        ballX: 0,
        ballY: 0,
        dx: 4,
        dy: -4,
        bricks: [] as Brick[],
        paddleSpeed: 7
    });

    const initBricks = () => {
        const bricks: Brick[] = [];
        const colors = ['#818cf8', '#6366f1', '#4f46e5', '#4338ca'];
        const containerWidth = 360; // Standard mobile-friendly width
        const brickW = (containerWidth - (BRICK_OFFSET_LEFT * 2) - (BRICK_PADDING * (BRICK_COLS - 1))) / BRICK_COLS;
        const brickH = 15;

        for (let r = 0; r < BRICK_ROWS; r++) {
            for (let c = 0; c < BRICK_COLS; c++) {
                bricks.push({
                    x: c * (brickW + BRICK_PADDING) + BRICK_OFFSET_LEFT,
                    y: r * (brickH + BRICK_PADDING) + BRICK_OFFSET_TOP,
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
        setGameState('playing');
        gameData.current = {
            paddleX: (canvas.width - PADDLE_WIDTH) / 2,
            ballX: canvas.width / 2,
            ballY: canvas.height - 30,
            dx: 3 + Math.random() * 2,
            dy: -4,
            bricks: initBricks(),
            paddleSpeed: 7
        };
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationId: number;

        const draw = () => {
            if (gameState !== 'playing') return;

            // Clear canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const data = gameData.current;

            // Draw Bricks
            let bricksLeft = 0;
            data.bricks.forEach(brick => {
                if (brick.active) {
                    bricksLeft++;
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

            if (bricksLeft === 0) {
                setGameState('win');
                return;
            }

            // Draw Paddle
            ctx.beginPath();
            ctx.roundRect(data.paddleX, canvas.height - PADDLE_HEIGHT - 10, PADDLE_WIDTH, PADDLE_HEIGHT, 5);
            ctx.fillStyle = '#f87171'; // Red highlight
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#f87171';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.closePath();

            // Draw Ball
            ctx.beginPath();
            ctx.arc(data.ballX, data.ballY, BALL_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#fff';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.closePath();

            // Collision: Walls
            if (data.ballX + data.dx > canvas.width - BALL_RADIUS || data.ballX + data.dx < BALL_RADIUS) {
                data.dx = -data.dx;
            }
            if (data.ballY + data.dy < BALL_RADIUS) {
                data.dy = -data.dy;
            } else if (data.ballY + data.dy > canvas.height - BALL_RADIUS - 10) {
                // Paddle check
                if (data.ballX > data.paddleX && data.ballX < data.paddleX + PADDLE_WIDTH) {
                    data.dy = -Math.abs(data.dy);
                    // Add some Spin
                    const diff = data.ballX - (data.paddleX + PADDLE_WIDTH / 2);
                    data.dx = diff * 0.15;
                } else if (data.ballY + data.dy > canvas.height) {
                    setGameState('gameover');
                    return;
                }
            }

            // Collision: Bricks
            data.bricks.forEach(brick => {
                if (brick.active) {
                    if (data.ballX > brick.x && data.ballX < brick.x + brick.w && data.ballY > brick.y && data.ballY < brick.y + brick.h) {
                        data.dy = -data.dy;
                        brick.active = false;
                        setScore(s => s + 10);
                    }
                }
            });

            data.ballX += data.dx;
            data.ballY += data.dy;

            animationId = requestAnimationFrame(draw);
        };

        if (gameState === 'playing') {
            animationId = requestAnimationFrame(draw);
        }

        return () => cancelAnimationFrame(animationId);
    }, [gameState]);

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const root = document.documentElement;
        const mouseX = e.clientX - rect.left - root.scrollLeft;

        let newX = mouseX - PADDLE_WIDTH / 2;
        if (newX < 0) newX = 0;
        if (newX > canvas.width - PADDLE_WIDTH) newX = canvas.width - PADDLE_WIDTH;

        gameData.current.paddleX = newX;
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const touchX = touch.clientX - rect.left;

        let newX = touchX - PADDLE_WIDTH / 2;
        if (newX < 0) newX = 0;
        if (newX > canvas.width - PADDLE_WIDTH) newX = canvas.width - PADDLE_WIDTH;

        gameData.current.paddleX = newX;
    };

    return (
        <div className="flex flex-col items-center justify-center h-full w-full p-2 bg-[#0c111d] select-none overflow-hidden touch-none">
            <div className="mb-2 flex items-center justify-between w-full max-w-[320px] px-4">
                <div className="text-center">
                    <p className="text-[9px] uppercase font-black tracking-widest text-slate-500">Score</p>
                    <p className="text-lg font-black text-indigo-400">{score}</p>
                </div>
                <div className="text-center">
                    <p className="text-[9px] uppercase font-black tracking-widest text-slate-500">Status</p>
                    <p className="text-[10px] font-black text-white uppercase">{gameState === 'playing' ? 'Active' : 'Standby'}</p>
                </div>
            </div>

            <div className="relative border-2 border-white/5 rounded-2xl overflow-hidden bg-white/[0.02] shadow-2xl backdrop-blur-sm max-h-[70vh] aspect-[3/4]">
                <canvas
                    ref={canvasRef}
                    width={360}
                    height={480}
                    onMouseMove={handleMouseMove}
                    onTouchMove={handleTouchMove}
                    className="w-full h-full cursor-none touch-none"
                />

                {gameState !== 'playing' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0c111d]/90 backdrop-blur-md p-4">
                        {gameState === 'gameover' && (
                            <h2 className="text-2xl font-black text-red-500 uppercase italic mb-2 tracking-tighter">Mission Failed</h2>
                        )}
                        {gameState === 'win' && (
                            <h2 className="text-2xl font-black text-indigo-400 uppercase italic mb-2 tracking-tighter">Bricks Cleared!</h2>
                        )}
                        {gameState === 'start' && (
                            <div className="text-center mb-4">
                                <h1 className="text-xl font-black text-white uppercase tracking-tighter mb-1">Cyber <span className="text-indigo-400">Bricks</span></h1>
                                <p className="text-[8px] text-slate-400 uppercase tracking-widest">Destroy the Data Blocks</p>
                            </div>
                        )}
                        <button
                            onClick={startGame}
                            className="group relative px-6 py-2.5 bg-indigo-500 text-white rounded-xl font-black uppercase tracking-[0.2em] text-[10px] transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(99,102,241,0.5)]"
                        >
                            {gameState === 'start' ? 'Initialize' : 'Retry System'}
                        </button>
                    </div>
                )}
            </div>

            <p className="mt-4 text-[8px] font-bold text-slate-700 uppercase tracking-widest">Protocol v5.1</p>
        </div>
    );
}
