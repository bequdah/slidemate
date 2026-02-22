// Version: Parallel Optimization Stable (Commit 901a690)
import { useState, useEffect, useMemo } from 'react';
import { useVoicePlayer } from '../hooks/useVoicePlayer';
import { analyzeSlide, generateVoiceScript, type SlideExplanation, type ExplanationMode } from '../services/aiService';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { AdSense } from './AdSense';
import { useAuth } from '../contexts/AuthContext';
import WaitingGame from './WaitingGame';
import NeuralSnake from './NeuralSnake';
import AstroJump from './AstroJump';
import MemoryGame from './MemoryGame';
import CyberBricks from './CyberBricks';

/* =======================
   Structured Types
======================= */

type StructuredDefinition = { term: string; def: string };

type StructuredSection =
    | { heading: string; bullets: string[] }
    | { heading: string; text: string }
    | { heading: string; definitions: StructuredDefinition[] };

type StructuredExplanation = {
    title?: string;
    overview?: string;
    sections?: StructuredSection[];
};

/* =======================
   Props
======================= */

interface ExplanationPaneProps {
    slideIds: string[];
    slideNumbers: number[];
    textContentArray?: string[];
    allSlidesTexts?: string[]; // Added: all document texts
    thumbnail?: string;
    onClose: () => void;
}

/* =======================
   Component
======================= */

export const ExplanationPane = ({ slideNumbers, textContentArray, allSlidesTexts, thumbnail, onClose }: ExplanationPaneProps) => {
    const [data, setData] = useState<SlideExplanation | null>(null);
    const [loading, setLoading] = useState(false);
    const [showGame, setShowGame] = useState(false);
    const [voiceLoading, setVoiceLoading] = useState(false);
    const [mode, setMode] = useState<ExplanationMode | null>(null);
    const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({});
    const [lang] = useState<'en' | 'ar'>('en');
    const [showIntro, setShowIntro] = useState(true);

    // Flashcard States
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [knownCards, setKnownCards] = useState<Set<number>>(new Set());
    const [examView, setExamView] = useState<'quiz' | 'flashcards'>('quiz');
    const [limitReached, setLimitReached] = useState(false);

    const { usageLeft, incrementUsage, tier } = useAuth();

    const currentContent = {
        explanation: data?.explanation,
        examInsight: data?.examInsight,
        voiceScript: data?.voiceScript,
        dir: 'rtl' as const
    };

    const {
        isPlaying, isPaused, currentSentence, isLoadingAudio,
        play, pause, resume, stop
    } = useVoicePlayer(currentContent?.voiceScript, lang);

    const randomGame = useMemo(() => {
        if (!loading) return null;
        const games = [
            <WaitingGame key="bugs" />,
            <NeuralSnake key="snake" />,
            <AstroJump key="jump" />,
            <MemoryGame key="memory" />,
            <CyberBricks key="bricks" />
        ];
        return games[Math.floor(Math.random() * games.length)];
    }, [loading]);

    useEffect(() => {
        // Lock body scroll when explanation is open
        document.body.style.overflow = 'hidden';

        const timer = setTimeout(() => setShowIntro(false), 4500);

        return () => {
            // Restore body scroll when closed
            document.body.style.overflow = 'unset';
            clearTimeout(timer);
            window.speechSynthesis.cancel();
        };
    }, []);

    const handleModeSelect = async (selectedMode: ExplanationMode) => {
        // Check Usage Limit First
        if (usageLeft <= 0) {
            setLimitReached(true);
            return;
        }

        setMode(selectedMode);
        setLoading(true);
        setShowGame(false);
        setData(null);
        setVoiceLoading(false);
        setSelectedOptions({});

        // Calculate Context: Get topics of all slides BEFORE the current selection
        let previousTopics: string[] = [];
        if (allSlidesTexts && slideNumbers.length > 0) {
            const minSlideNum = Math.min(...slideNumbers);
            // Grab the first ~60 chars of each slide before the current one
            previousTopics = allSlidesTexts
                .slice(0, minSlideNum - 1)
                .map(text => {
                    const clean = (text || "").replace(/\s+/g, ' ').trim();
                    return clean.substring(0, 60) + (clean.length > 60 ? '...' : '');
                })
                .filter(t => t.length > 5); // Filter out empty or too short slides
        }

        // 1. Parallel Execution: Start BOTH requests immediately
        const analysisPromise = analyzeSlide(slideNumbers, textContentArray, selectedMode, thumbnail, previousTopics);

        // Only run voice if not in exam mode
        let voicePromise = null;
        if (selectedMode !== 'exam') {
            setVoiceLoading(true);
            voicePromise = generateVoiceScript(slideNumbers, textContentArray);
        }

        // Handle Analysis Result
        analysisPromise.then(async res => {
            setData(prev => prev ? { ...prev, ...res } : res);
            setLoading(false);
            // Deduct only AFTER success AND if not from cache
            if (!res.isCached) {
                await incrementUsage();
            }
        }).catch(err => {
            console.error("Analysis Error:", err);
            setLoading(false);
        });

        // Handle Voice Result
        if (voicePromise) {
            voicePromise.then(voiceRes => {
                setData(prev => {
                    // If analysis hasn't finished yet, create a partial object
                    if (!prev) {
                        return {
                            voiceScript: voiceRes.voiceScript,
                            explanation: undefined, // Will be filled by analysis
                            quiz: []
                        } as any;
                    }
                    return { ...prev, voiceScript: voiceRes.voiceScript };
                });
                setVoiceLoading(false);
            }).catch(() => setVoiceLoading(false));
        }
    };


    const handleBack = () => {
        stop();
        setMode(null);
        setData(null);
        setLoading(false);
    };

    const handleOptionSelect = (qIndex: number, oIndex: number) => {
        if (selectedOptions[qIndex] !== undefined) return;
        setSelectedOptions((prev: Record<number, number>) => ({ ...prev, [qIndex]: oIndex }));
    };

    /* =======================
       Structured Parsing
    ======================= */

    const tryParseStructured = (content: any): StructuredExplanation | null => {
        if (!content) return null;

        if (typeof content === 'object' && !Array.isArray(content)) {
            if (Array.isArray((content as any).sections) || (content as any).title || (content as any).overview) {
                return content as StructuredExplanation;
            }
            return null;
        }

        if (typeof content === 'string') {
            const t = content.trim();
            if (!(t.startsWith('{') && t.endsWith('}'))) return null;
            try {
                const obj = JSON.parse(t);
                if (Array.isArray(obj?.sections) || obj?.title || obj?.overview) {
                    return obj as StructuredExplanation;
                }
            } catch {
                return null;
            }
        }

        return null;
    };

    /* =======================
       Linguistic Guard
    ======================= */

    const cleanText = (text: string | undefined): string => {
        if (!text) return "";
        return text
            .replace(/هاد/g, 'هاض')
            .replace(/منيح/g, 'مليح')
            .replace(/كتير/g, 'كثير')
            .replace(/تانية/g, 'ثانية')
            .replace(/متل/g, 'مثل');
    };

    const renderMarkdown = (content: any) => {
        if (!content) return "";
        let text = "";
        if (typeof content === 'string') {
            if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
                return "Analysis formatting error. Please try again.";
            }
            text = content;
        } else if (typeof content === 'object') {
            text = content.text || content.content || content.insight || "";
        } else {
            text = String(content);
        }
        return cleanText(text);
    };

    const isArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

    const MarkdownSection = ({ content, className = "" }: { content: any, className?: string }) => {
        const textValue = renderMarkdown(content);
        const rtl = isArabic(textValue);
        return (
            <div className={`${className} ${rtl ? 'text-right' : 'text-left'}`} dir={rtl ? 'rtl' : 'ltr'}>
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {textValue}
                </ReactMarkdown>
            </div>
        );
    };

    const StructuredRenderer = ({ data }: { data: StructuredExplanation }) => {
        const sections = Array.isArray(data.sections) ? data.sections : [];

        return (
            <div className="space-y-10">
                {sections.map((s, i) => (
                    <div key={i} className="space-y-5">
                        {s.heading && (
                            <div dir={isArabic(s.heading) ? 'rtl' : 'ltr'} className="flex items-center gap-3 mb-2">
                                <span className="w-1.5 h-7 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] rounded-full flex-shrink-0" />
                                <h3 className="text-xl md:text-2xl font-black text-red-400 uppercase tracking-widest">
                                    {cleanText(s.heading)}
                                </h3>
                            </div>
                        )}

                        {'text' in s && s.text && (
                            <div className="p-6 bg-white/[0.03] rounded-[2rem] border border-white/5 shadow-inner">
                                <MarkdownSection content={s.text} className="text-white text-base md:text-lg leading-relaxed font-medium" />
                            </div>
                        )}

                        {'bullets' in s && Array.isArray(s.bullets) && (
                            <ul className="space-y-4 pl-2 md:pl-4">
                                {s.bullets.map((b, idx) => (
                                    <li key={idx} className="flex gap-4 group">
                                        <span className="text-red-400 font-bold mt-1 shadow-sm group-hover:scale-125 transition-transform">●</span>
                                        <MarkdownSection content={b} className="text-white text-base md:text-lg font-medium" />
                                    </li>
                                ))}
                            </ul>
                        )}

                        {'definitions' in s && Array.isArray(s.definitions) && (
                            <div className="grid gap-5">
                                {s.definitions.map((d, idx) => (
                                    <div key={idx} className="p-6 bg-white/[0.02] rounded-[1.5rem] border border-white/5 hover:border-indigo-500/30 transition-colors group">
                                        <strong className="text-white text-lg block mb-2 group-hover:text-indigo-400 transition-colors underline underline-offset-4 decoration-indigo-500/30">{cleanText(d.term)}</strong>
                                        <MarkdownSection content={d.def} className="text-white/90 text-sm md:text-base font-medium" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };


    return (
        <div className="fixed inset-0 flex items-center justify-center z-[100] animate-in fade-in duration-500">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />

            {/* Modal Content */}
            <div className={`relative w-full max-w-4xl h-[95vh] md:h-[85vh] bg-[#0c111d] rounded-t-3xl md:rounded-3xl shadow-2xl border border-white/10 animate-in zoom-in-95 duration-500 flex flex-col ${lang === 'ar' ? 'font-arabic' : ''}`}>
                <div className="flex flex-col h-full overflow-hidden">
                    {/* Header */}
                    <div className="p-4 md:p-8 border-b border-white/5 bg-slate-900/40 backdrop-blur-2xl relative flex-shrink-0">
                        <div className="flex items-center justify-between w-full relative z-[70]">
                            {/* Left: Brand */}
                            <div className={`flex items-center gap-3 transition-opacity duration-300 ${isPlaying ? 'opacity-0 md:opacity-100 pointer-events-none' : 'opacity-100'}`}>
                                <div className="w-8 h-8 md:w-16 md:h-16 rounded-xl md:rounded-2xl overflow-hidden shadow-lg border border-white/10 relative">
                                    <img src="/logo_white_bg.jpg" alt="SlideMate AI" className="w-full h-full object-cover" />
                                    {showIntro && (
                                        <div className="absolute inset-0 bg-indigo-600/40 animate-pulse" />
                                    )}
                                </div>
                                <h3 className="text-sm md:text-xl font-black text-white italic tracking-tight uppercase">
                                    SLIDE <span className="text-indigo-400">MΛTE</span>
                                </h3>
                            </div>

                            {/* RIGHT: The Master Control Bar */}
                            <div className="flex items-center gap-2 p-1.5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl scale-95 md:scale-110 whitespace-nowrap">
                                {mode && (
                                    <button onClick={handleBack} className="w-9 h-9 rounded-xl hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-95" title="Back">
                                        ←
                                    </button>
                                )}

                                {data && (
                                    <div className="relative">
                                        {isPlaying ? (
                                            <button
                                                onClick={stop}
                                                className="h-9 px-4 md:px-5 rounded-xl flex items-center gap-3 transition-all active:scale-95 font-black text-[10px] md:text-xs uppercase tracking-widest bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-600"
                                            >
                                                {isLoadingAudio ? (
                                                    <>
                                                        <div className="w-2.5 h-2.5 bg-white rounded-full animate-ping" />
                                                        <span>Load</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="w-2.5 h-2.5 bg-white rounded-sm animate-pulse" />
                                                        <span>Stop</span>
                                                    </>
                                                )}
                                            </button>
                                        ) : (
                                            <div className="group relative">
                                                <button
                                                    onClick={play}
                                                    disabled={loading || voiceLoading}
                                                    className="h-9 px-4 md:px-5 rounded-xl flex items-center gap-2 transition-all active:scale-95 font-black text-[10px] md:text-xs uppercase tracking-widest bg-white/5 text-slate-300 hover:text-white border border-white/5 hover:bg-white/10"
                                                >
                                                    {voiceLoading ? (
                                                        <>
                                                            <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                                            <span>Loading...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                                                            </svg>
                                                            <span className="hidden xs:inline">AI Voice</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isPlaying && (
                                    <button
                                        onClick={isPaused ? resume : pause}
                                        className="w-9 h-9 rounded-xl hover:bg-white/5 flex items-center justify-center text-indigo-400 transition-all active:scale-95"
                                    >
                                        {isPaused ? (
                                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                        ) : (
                                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                                        )}
                                    </button>
                                )}

                                <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-red-500/10 flex items-center justify-center text-slate-400 hover:text-red-400 transition-all active:scale-95" title="Close">
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Transcription Bubble */}
                        <div className="relative w-full min-h-[2.5rem] mt-3 flex items-center justify-center z-[60]">
                            {isPlaying && currentSentence && (
                                <div className="bg-indigo-600/10 border border-indigo-500/20 px-4 md:px-6 py-1.5 rounded-2xl backdrop-blur-md shadow-xl flex items-center gap-3 animate-in fade-in zoom-in-95">
                                    <div className="flex gap-0.5 items-center">
                                        <div className="w-0.5 h-3 bg-indigo-400 animate-bounce" />
                                        <div className="w-0.5 h-4 bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
                                    </div>
                                    <p className="text-white text-[10px] md:text-sm font-bold italic text-center max-w-[80vw]">
                                        "{currentSentence}"
                                    </p>
                                </div>
                            )}

                            {showIntro && !isPlaying && (
                                <div className="relative flex items-center scale-75 md:scale-100">
                                    <h2 className="text-xl md:text-3xl font-black tracking-[0.3em] italic text-white/30 uppercase select-none flex items-center gap-2">
                                        <span>SLIDE</span>
                                        <span className="text-indigo-500/30">MΛTE</span>
                                    </h2>
                                    <div className="absolute inset-0 flex items-center gap-2 overflow-hidden animate-reveal-text">
                                        <h2 className="text-xl md:text-3xl font-black tracking-[0.3em] italic text-white uppercase flex items-center gap-2 whitespace-nowrap">
                                            <span>SLIDE</span>
                                            <span className="text-indigo-500">MΛTE</span>
                                        </h2>
                                    </div>
                                    <div className="absolute top-1/2 -translate-y-1/2 left-0 w-12 h-12 md:w-16 md:h-16 z-20 animate-robot-write">
                                        <div className="relative overflow-visible">
                                            <div className="absolute inset-0 bg-indigo-500/30 blur-3xl rounded-full" />
                                            <img src="/ai_robot_final.png" className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-indigo-400 rounded-full animate-ping" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Content Area - Smart separation between Games and Text */}
                    <div className="flex-1 min-h-0 relative overflow-hidden" dir="ltr">
                        {/* THE GAME LAYER - Highest Priority when showGame is true */}
                        {showGame && (
                            <div className="absolute inset-0 z-[80] bg-[#0c111d] flex flex-col">
                                <div className="flex-1 relative">
                                    {randomGame}
                                </div>
                                {/* Result Ready Overlay (When analysis finishes while playing) */}
                                {!loading && data && (
                                    <div className="absolute inset-0 z-[100] bg-black/30 backdrop-blur-[3px] flex items-center justify-center p-6 animate-in fade-in duration-500">
                                        <button
                                            onClick={() => setShowGame(false)}
                                            className="group relative px-10 py-8 md:px-16 md:py-10 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[3.5rem] shadow-[0_0_100px_rgba(79,70,229,0.6)] transition-all hover:scale-105 active:scale-95 flex flex-col items-center border border-white/20 overflow-hidden"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
                                            <span className="text-[10px] md:text-xs uppercase tracking-[0.4em] font-black text-indigo-100/40 mb-3">AI Synthesis Complete</span>
                                            <span className="text-3xl md:text-5xl font-arabic font-black leading-tight drop-shadow-2xl text-center">
                                                الشرح صار جاهز، يلا؟ ✨
                                            </span>
                                            <div className="mt-6 flex gap-2 opacity-60">
                                                <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-duration:0.6s]" />
                                                <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.2s]" />
                                                <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.4s]" />
                                            </div>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* THE TEXT/EXPLANATION LAYER */}
                        <div className={`h-full overflow-y-auto custom-scrollbar ${showGame ? 'hidden' : 'p-4 md:p-10'}`}>
                            <div className="space-y-6 md:space-y-12 pb-24">
                                {!mode ? (
                                    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                                        {/* Style Choice UI */}
                                        <div className="text-center space-y-2">
                                            <h2 className="text-lg md:text-2xl font-black text-white uppercase tracking-[0.2em] md:tracking-widest text-center">Choose explanation style</h2>
                                            <div className="flex items-center justify-center gap-2">
                                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                    {tier === 'unlimited' ? '∞ Unlimited Mode' : `${usageLeft} Trials Left Today`}
                                                </p>
                                            </div>
                                        </div>

                                        {limitReached ? (
                                            <div className="bg-red-500/10 border-2 border-red-500/20 p-8 rounded-[2rem] max-w-md text-center space-y-6 animate-in zoom-in duration-500">
                                                <div className="text-5xl">🛑</div>
                                                <div className="space-y-2">
                                                    <h3 className="text-xl font-black text-white">خلصت محاولاتك لليوم!</h3>
                                                    <p className="text-sm text-slate-400 leading-relaxed font-arabic">
                                                        {tier === 'free'
                                                            ? 'الحساب المجاني إله 10 محاولات بس. اشترك بالبريميوم عشان تاخد 50 محاولة وتخلص من الإعلانات!'
                                                            : 'خلصت الـ 50 محاولة تبعتك لليوم! ارجع بكرة أو تواصل معنا لترقية حسابك لنظام الـ Unlimited.'}
                                                    </p>
                                                </div>
                                                <a
                                                    href={`https://wa.me/962792118641?text=${encodeURIComponent("مرحبا، خلصت محاولاتي وبدي أشترك بالباقة المدفوعة")}`}
                                                    target="_blank"
                                                    className="block w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all active:scale-95 shadow-xl shadow-indigo-600/20"
                                                >
                                                    تفعيل البريميوم (1 دينار/شهر)
                                                </a>
                                                <button onClick={onClose} className="text-xs font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest">
                                                    إغلاق
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full max-w-4xl" dir="ltr">
                                                {[
                                                    { id: 'simple' as const, icon: '💡', title: 'Simple', desc: 'Easy language, intuitive examples.', bg: 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20', text: 'text-indigo-400' },
                                                    { id: 'visual' as const, icon: '📊', title: 'شرح مع جداول ورسوم', desc: 'للصور التي تحتوي على جداول ورسومات ومخططات وأشياء مشابهة.', bg: 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20', text: 'text-emerald-400' },
                                                    { id: 'exam' as const, icon: '📝', title: 'Exam', desc: 'Strict definitions and exam focus.', bg: 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20', text: 'text-amber-400' }
                                                ].map(({ id, icon, title, desc, bg, text }) => (
                                                    <button
                                                        key={id}
                                                        onClick={() => handleModeSelect(id)}
                                                        className={`group p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] border ${bg} hover:scale-[1.02] transition-all duration-300 text-left relative overflow-hidden active:scale-95`}
                                                    >
                                                        <div className="text-4xl mb-4 bg-white/5 w-16 h-16 rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform">
                                                            {icon}
                                                        </div>
                                                        <h3 className={`text-xl font-black ${text} mb-2`}>{title}</h3>
                                                        <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : loading ? (
                                    <div className="flex flex-col items-center justify-center py-12 space-y-10 animate-in fade-in duration-700">
                                        <div className="relative">
                                            <div className="w-24 h-24 border-4 border-white/5 rounded-full animate-[spin_3s_linear_infinite]" />
                                            <div className="absolute inset-0 w-24 h-24 border-4 border-t-indigo-500 rounded-full animate-spin" />
                                            <div className="absolute inset-4 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 rounded-full blur-xl animate-pulse" />
                                        </div>

                                        <div className="text-center space-y-3">
                                            <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-[0.2em]">Analyzing slides...</h3>
                                            <p className="text-slate-500 font-medium max-w-xs mx-auto text-sm md:text-base">
                                                {lang === 'ar' ? 'الشرح قاعد بجهز بس شوي' : 'AI is tailoring the explanation to your chosen style.'}
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => setShowGame(true)}
                                            className="group relative flex flex-col items-center gap-2 transition-all duration-500 animate-in zoom-in slide-in-from-bottom-4 duration-1000"
                                        >
                                            <div className="bg-indigo-600/10 hover:bg-indigo-600/20 border-2 border-indigo-500/20 px-8 py-4 rounded-[2rem] shadow-[0_0_30px_rgba(79,70,229,0.1)] group-hover:shadow-[0_0_50px_rgba(79,70,229,0.3)] group-hover:scale-105 group-active:scale-95 transition-all duration-500 text-center relative overflow-hidden group-hover:border-indigo-400">
                                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent pointer-events-none" />
                                                <div className="relative z-10 space-y-0.5">
                                                    <p className="text-xl font-black text-white italic tracking-tight drop-shadow-md">
                                                        زهقان تستنى؟
                                                    </p>
                                                    <p className="text-sm font-bold text-indigo-300">
                                                        اكبس علي <span className="text-white underline underline-offset-2 decoration-indigo-500">واتسلى</span> 🎮
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex gap-1 opacity-40">
                                                <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" />
                                                <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.2s]" />
                                                <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.4s]" />
                                            </div>
                                        </button>

                                        <div className="w-full max-w-sm flex justify-center">
                                            <div className="w-full bg-white/5 rounded-2xl overflow-hidden border border-white/10 relative">
                                                <AdSense slot="3890890228" format="fluid" className="w-full" style={{ height: '90px', minHeight: '90px' }} />
                                            </div>
                                        </div>
                                    </div>
                                ) : data ? (
                                    <>
                                        {/* Detailed Explanation - Hidden in Exam Mode */}
                                        {mode !== 'exam' && currentContent.explanation ? (
                                            <section className="animate-in fade-in slide-in-from-bottom-6 duration-700">
                                                <h4 className="flex items-center gap-3 text-white font-black mb-6 uppercase text-xs tracking-[0.2em] opacity-80">
                                                    <span className="w-1.5 h-6 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] rounded-full" />
                                                    {lang === 'en' ? 'Explanation' : 'الشرح التفصيلي'}
                                                </h4>
                                                <div className="p-6 md:p-10 bg-white/[0.03] rounded-[2rem] border border-white/5 shadow-inner">
                                                    <div className="prose prose-invert max-w-none">
                                                        {(() => {
                                                            const structured = tryParseStructured(currentContent.explanation);
                                                            if (structured) return <StructuredRenderer data={structured} />;
                                                            return (
                                                                <MarkdownSection content={currentContent.explanation} className="text-white text-lg md:text-xl font-medium leading-relaxed" />
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </section>
                                        ) : null}

                                        {/* AdSense: After Explanation */}
                                        <div className="my-10 flex justify-center">
                                            <div className="w-full max-w-xl bg-white/5 rounded-3xl overflow-hidden border border-white/10 relative shadow-2xl">
                                                <AdSense slot="3890890228" format="fluid" className="w-full" style={{ height: '100px', minHeight: '100px' }} />
                                            </div>
                                        </div>

                                        {/* MCQs / Flashcards */}
                                        {data.quiz && data.quiz.length > 0 && (
                                            <section className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-700 pb-10">
                                                {mode === 'exam' && (
                                                    <div className="flex flex-col items-center space-y-6">
                                                        {/* Sleek View Toggle */}
                                                        <div className="inline-flex p-1 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl">
                                                            <button
                                                                onClick={() => setExamView('quiz')}
                                                                className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${examView === 'quiz' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                                            >
                                                                Normal Quiz
                                                            </button>
                                                            <button
                                                                onClick={() => setExamView('flashcards')}
                                                                className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${examView === 'flashcards' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                                                            >
                                                                Flashcards 🃏
                                                            </button>
                                                        </div>

                                                        {examView === 'flashcards' ? (
                                                            /* Flashcard Interface */
                                                            <div className="flex flex-col items-center space-y-10 w-full pt-8 pb-4" dir="ltr">
                                                                <div className="text-center space-y-3">
                                                                    <div className="px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 inline-block">
                                                                        <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.2em]">
                                                                            Card {currentCardIndex + 1} of {data.quiz.length}
                                                                        </p>
                                                                    </div>
                                                                    <h4 className="text-white/20 font-black text-[9px] uppercase tracking-[0.5em]">Active Recall Mode</h4>
                                                                </div>

                                                                <div
                                                                    className="perspective-1000 w-full max-w-lg h-[340px] md:h-[380px] cursor-pointer group"
                                                                    onClick={() => setIsFlipped(!isFlipped)}
                                                                >
                                                                    <div className={`relative w-full h-full transition-all duration-700 preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
                                                                        <div className="absolute inset-0 w-full h-full backface-hidden flex flex-col items-center justify-center p-8 md:p-12 bg-white/[0.03] border border-white/10 rounded-[3rem] shadow-2xl backdrop-blur-2xl">
                                                                            <div className="absolute top-8 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">
                                                                                Question
                                                                            </div>
                                                                            <div className="text-lg md:text-2xl font-black text-white text-center leading-tight">
                                                                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                                                    {renderMarkdown(data.quiz[currentCardIndex].q)}
                                                                                </ReactMarkdown>
                                                                            </div>
                                                                            <div className="absolute bottom-10 flex flex-col items-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                                                                                <div className="w-1 h-1 bg-white rounded-full animate-bounce" />
                                                                                <span className="text-[8px] font-bold uppercase tracking-widest">Tap to flip</span>
                                                                            </div>
                                                                        </div>

                                                                        <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 flex flex-col items-center justify-center p-8 md:p-12 bg-indigo-500/10 border border-indigo-500/30 rounded-[3rem] shadow-2xl shadow-indigo-500/20 backdrop-blur-2xl">
                                                                            <div className="absolute top-8 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-[0.3em] text-indigo-400/60">
                                                                                Explanation
                                                                            </div>
                                                                            <div className="w-full text-center space-y-6 overflow-y-auto custom-scrollbar pr-2 max-h-[75%]">
                                                                                <div className="inline-block px-3 py-1 rounded-lg bg-indigo-500/20 text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">
                                                                                    Correct Option: {String.fromCharCode(65 + data.quiz[currentCardIndex].a)}
                                                                                </div>
                                                                                <div className="text-sm md:text-lg font-bold text-white leading-relaxed">
                                                                                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                                                        {renderMarkdown(data.quiz[currentCardIndex].reasoning)}
                                                                                    </ReactMarkdown>
                                                                                </div>
                                                                            </div>
                                                                            <div className="absolute bottom-10 text-[8px] font-bold uppercase tracking-widest text-indigo-400 opacity-30">
                                                                                Tap to flip back
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-4 md:gap-6 scale-90 md:scale-110">
                                                                    <button
                                                                        disabled={currentCardIndex === 0}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setIsFlipped(false);
                                                                            setTimeout(() => setCurrentCardIndex(prev => prev - 1), 100);
                                                                        }}
                                                                        className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white disabled:opacity-20 hover:bg-white/10 transition-all active:scale-95 shadow-xl"
                                                                    >
                                                                        ←
                                                                    </button>

                                                                    <div className="flex gap-2 md:gap-4">
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                const newKnown = new Set(knownCards);
                                                                                newKnown.add(currentCardIndex);
                                                                                setKnownCards(newKnown);
                                                                                if (currentCardIndex < data.quiz.length - 1) {
                                                                                    setIsFlipped(false);
                                                                                    setTimeout(() => setCurrentCardIndex(prev => prev + 1), 100);
                                                                                }
                                                                            }}
                                                                            className="px-4 md:px-6 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[10px] md:text-xs uppercase tracking-widest hover:bg-emerald-500/20 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                                                                        >
                                                                            I Know This ✅
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                const newKnown = new Set(knownCards);
                                                                                newKnown.delete(currentCardIndex);
                                                                                setKnownCards(newKnown);
                                                                                if (currentCardIndex < data.quiz.length - 1) {
                                                                                    setIsFlipped(false);
                                                                                    setTimeout(() => setCurrentCardIndex(prev => prev + 1), 100);
                                                                                }
                                                                            }}
                                                                            className="px-4 md:px-6 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-[10px] md:text-xs uppercase tracking-widest hover:bg-amber-500/20 transition-all active:scale-95 shadow-lg shadow-amber-500/20"
                                                                        >
                                                                            Still Learning ❌
                                                                        </button>
                                                                    </div>

                                                                    <button
                                                                        disabled={currentCardIndex === data.quiz.length - 1}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setIsFlipped(false);
                                                                            setTimeout(() => setCurrentCardIndex(prev => prev + 1), 100);
                                                                        }}
                                                                        className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white disabled:opacity-20 hover:bg-white/10 transition-all active:scale-95 shadow-xl"
                                                                    >
                                                                        →
                                                                    </button>
                                                                </div>

                                                                <div className="w-full max-w-xs h-1 bg-white/5 rounded-full overflow-hidden flex">
                                                                    <div
                                                                        className="h-full bg-emerald-500 transition-all duration-500"
                                                                        style={{ width: `${(knownCards.size / data.quiz.length) * 100}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="w-full space-y-10 py-4">
                                                                <div className="text-center">
                                                                    <h4 className="text-white/40 font-black text-[11px] uppercase tracking-[0.4em] mb-2">Quiz Mode</h4>
                                                                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Classic MCQ Selection</p>
                                                                </div>
                                                                {data.quiz.map((item: any, qIndex: number) => (
                                                                    <div key={qIndex} className="space-y-6">
                                                                        <div className="flex gap-3 md:gap-4">
                                                                            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-400 flex-shrink-0">Q{qIndex + 1}</div>
                                                                            <div className="text-lg md:text-xl font-black text-slate-200 leading-tight">
                                                                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                                                    {renderMarkdown(item.q)}
                                                                                </ReactMarkdown>
                                                                            </div>
                                                                        </div>
                                                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 pl-0 md:pl-4">
                                                                            {item.options.map((option: string, oIndex: number) => (
                                                                                <button key={oIndex} onClick={() => handleOptionSelect(qIndex, oIndex)} disabled={selectedOptions[qIndex] !== undefined} className={`p-4 md:p-5 rounded-xl md:rounded-2xl border text-left text-sm md:text-base font-bold transition-all shadow-sm active:scale-98 ${selectedOptions[qIndex] !== undefined ? (item.a === oIndex ? 'bg-green-500/20 border-green-500/40 text-green-400' : selectedOptions[qIndex] === oIndex ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-white/[0.01] border-white/5 opacity-30') : 'bg-white/[0.03] border-white/5 hover:bg-white/10 hover:border-white/20'}`}>
                                                                                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                                                        {renderMarkdown(option)}
                                                                                    </ReactMarkdown>
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                        {selectedOptions[qIndex] !== undefined && (
                                                                            <div className="pl-4 animate-in zoom-in-95 duration-300">
                                                                                <div className={`p-6 rounded-3xl border ${selectedOptions[qIndex] === item.a ? 'bg-green-500/[0.03] border-green-500/20' : 'bg-red-500/[0.03] border-red-500/20'}`}>
                                                                                    <div className="text-sm text-slate-400 font-bold leading-relaxed">
                                                                                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{renderMarkdown(item.reasoning)}</ReactMarkdown>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {mode !== 'exam' && (
                                                    <>
                                                        <div className="text-center">
                                                            <h4 className="text-white/40 font-black text-[11px] uppercase tracking-[0.4em] mb-2">Test Your Understanding</h4>
                                                            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Quick Review Questions</p>
                                                        </div>
                                                        {data.quiz.map((item: any, qIndex: number) => (
                                                            <div key={qIndex} className="space-y-6">
                                                                <div className="flex gap-3 md:gap-4">
                                                                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-400 flex-shrink-0">Q{qIndex + 1}</div>
                                                                    <div className="text-lg md:text-xl font-black text-slate-200 leading-tight">
                                                                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                                            {renderMarkdown(item.q)}
                                                                        </ReactMarkdown>
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 pl-0 md:pl-4">
                                                                    {item.options.map((option: string, oIndex: number) => (
                                                                        <button key={oIndex} onClick={() => handleOptionSelect(qIndex, oIndex)} disabled={selectedOptions[qIndex] !== undefined} className={`p-4 md:p-5 rounded-xl md:rounded-2xl border text-left text-sm md:text-base font-bold transition-all shadow-sm active:scale-98 ${selectedOptions[qIndex] !== undefined ? (item.a === oIndex ? 'bg-green-500/20 border-green-500/40 text-green-400' : selectedOptions[qIndex] === oIndex ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-white/[0.01] border-white/5 opacity-30') : 'bg-white/[0.03] border-white/5 hover:bg-white/10 hover:border-white/20'}`}>
                                                                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                                                {renderMarkdown(option)}
                                                                            </ReactMarkdown>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                                {selectedOptions[qIndex] !== undefined && (
                                                                    <div className="pl-4 animate-in zoom-in-95 duration-300">
                                                                        <div className={`p-6 rounded-3xl border ${selectedOptions[qIndex] === item.a ? 'bg-green-500/[0.03] border-green-500/20' : 'bg-red-500/[0.03] border-red-500/20'}`}>
                                                                            <div className="text-sm text-slate-400 font-bold leading-relaxed">
                                                                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{renderMarkdown(item.reasoning)}</ReactMarkdown>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                            </section>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                                        <div className="text-4xl">❌</div>
                                        <h3 className="text-xl font-black text-white uppercase tracking-widest">Analysis Failed</h3>
                                        <button onClick={() => setMode(null)} className="px-8 py-3 bg-indigo-600 rounded-xl font-black uppercase text-xs tracking-widest">Try Again</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes robot-write {
                    0% { transform: translate(-100px, -50%) scale(0.6) rotate(-10deg); opacity: 0; }
                    15% { transform: translate(-60px, -50%) scale(1.2) rotate(5deg); opacity: 1; }
                    85% { transform: translate(60px, -50%) scale(1.2) rotate(-5deg); opacity: 1; }
                    100% { transform: translate(100px, -50%) scale(0.8) rotate(10deg); opacity: 0; }
                }
                @media (min-width: 768px) {
                    @keyframes robot-write {
                        0% { transform: translate(-300px, -50%) scale(0.5) rotate(-10deg); opacity: 0; }
                        15% { transform: translate(-200px, -50%) scale(1.3) rotate(5deg); opacity: 1; }
                        85% { transform: translate(250px, -50%) scale(1.3) rotate(-5deg); opacity: 1; }
                        100% { transform: translate(350px, -50%) scale(0.8) rotate(10deg); opacity: 0; }
                    }
                }
                @keyframes reveal-text {
                    0%, 15% { width: 0; opacity: 0; }
                    20% { opacity: 1; }
                    85%, 100% { width: 100%; opacity: 1; }
                }
                .animate-robot-write { animation: robot-write 3s cubic-bezier(0.45, 0, 0.55, 1) forwards; }
                .animate-reveal-text { 
                    animation: reveal-text 3s cubic-bezier(0.45, 0, 0.55, 1) forwards; 
                    mask-image: linear-gradient(to right, black 85%, transparent 100%);
                    -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
                    overflow: hidden;
                }
                .font-arabic { font-family: 'IBM Plex Sans Arabic', sans-serif; }
                .custom-scrollbar::-webkit-scrollbar { width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 20px; border: 2px solid #0c111d; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                
                /* Force headings red */
                .prose h3 {
                    color: #f87171 !important;
                    text-transform: uppercase !important;
                    font-weight: 900 !important;
                    letter-spacing: 0.1em !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 0.75rem !important;
                }
                
                /* Golden Yellow for English Terms & Bold Text */
                .prose strong {
                    color: #fbbf24 !important;
                    font-weight: 900 !important;
                }

                .katex { 
                    font-size: 1.15em !important; 
                    color: #fbbf24;
                }
                
                .perspective-1000 { perspective: 1000px; }
                .preserve-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
                .rotate-y-180 { transform: rotateY(180deg); }
                .custom-scrollbar { scroll-behavior: smooth; }
            `}</style>
        </div>
    );
};