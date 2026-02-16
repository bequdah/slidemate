// Version: Parallel Optimization Stable (Commit 901a690)
import { useState, useEffect, useMemo } from 'react';
import { useVoicePlayer } from '../hooks/useVoicePlayer';
import { analyzeSlide, generateVoiceScript, type SlideExplanation, type ExplanationMode } from '../services/aiService';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import WaitingGame from './WaitingGame';
import NeuralSnake from './NeuralSnake';
import AstroJump from './AstroJump';

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
    const [lang] = useState<'en' | 'ar'>('ar');
    const [showIntro, setShowIntro] = useState(true);

    const currentContent = {
        explanation: data?.explanation,
        examInsight: data?.examInsight,
        voiceScript: data?.voiceScript,
        dir: 'rtl' as const
    };

    const {
        isPlaying, isPaused, currentSentence,
        play, pause, resume, stop
    } = useVoicePlayer(currentContent?.voiceScript, lang);

    const randomGame = useMemo(() => {
        if (!loading) return null;
        const games = [
            <WaitingGame key="bugs" />,
            <NeuralSnake key="snake" />,
            <AstroJump key="jump" />
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

    const handleModeSelect = (selectedMode: ExplanationMode) => {
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
        analysisPromise.then(res => {
            setData(prev => prev ? { ...prev, ...res } : res);
            setLoading(false);
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

    // Replaced by useVoicePlayer hook

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

    const StructuredRenderer = ({ data }: { data: StructuredExplanation }) => {
        const sections = Array.isArray(data.sections) ? data.sections : [];

        return (
            <div className="space-y-8">
                {/* Overview removed as per user request */}

                {sections.map((s, i) => (
                    <div key={i} className="space-y-3">

                        {s.heading && (
                            <h3 className="text-xl font-black text-red-400 uppercase tracking-widest mb-4 flex items-center gap-3">
                                <span className="w-1.5 h-6 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                    {cleanText(s.heading)}
                                </ReactMarkdown>
                            </h3>
                        )}

                        {'text' in s && s.text && (
                            <div className="text-slate-300 text-base md:text-lg font-medium leading-relaxed">
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                    {cleanText(s.text)}
                                </ReactMarkdown>
                            </div>
                        )}

                        {'bullets' in s && Array.isArray(s.bullets) && (
                            <ul className="list-disc pl-6 space-y-2 text-slate-300 text-base md:text-lg font-medium">
                                {s.bullets.map((b, idx) => (
                                    <li key={idx}>
                                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                            {cleanText(b)}
                                        </ReactMarkdown>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {'definitions' in s && Array.isArray(s.definitions) && (
                            <div className="space-y-4">
                                {s.definitions.map((d, idx) => (
                                    <div key={idx} className="text-slate-300 text-base md:text-lg font-medium">
                                        <strong className="text-white block mb-1">{cleanText(d.term)}:</strong>
                                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                            {cleanText(d.def)}
                                        </ReactMarkdown>
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
                    <div className="p-4 md:p-8 border-b border-white/5 bg-slate-900/40 backdrop-blur-2xl relative flex-shrink-0 min-h-[140px] md:min-h-[180px]">
                        <div className="flex flex-col md:grid md:grid-cols-[200px_1fr_200px] gap-6 items-center w-full">

                            {/* BRAND & INFO */}
                            <div className="flex justify-between items-center w-full md:w-auto md:flex-col md:items-start gap-4 relative z-[60]">
                                <div className="flex items-center md:flex-col gap-3">
                                    <div className="relative w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl overflow-hidden shadow-lg border border-white/10 flex-shrink-0">
                                        <img src="/logo_white_bg.jpg" alt="SlideMate AI" className="w-full h-full object-cover" />
                                        {showIntro && (
                                            <div className="absolute inset-0 bg-indigo-600/40 animate-pulse" />
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <h3 className="text-sm md:text-xl font-black tracking-tight text-white leading-tight uppercase italic flex items-center gap-1">
                                            <span>SLIDE</span>
                                            <span className="text-indigo-400">MΛTE</span>
                                        </h3>
                                    </div>
                                </div>

                                <div className="flex md:hidden items-center gap-2">
                                    {data && (
                                        <div className="flex items-center gap-2">
                                            {isPlaying && (
                                                <button
                                                    onClick={isPaused ? resume : pause}
                                                    className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-indigo-400 transition-all border border-white/10 active:scale-95"
                                                    title={isPaused ? 'Resume' : 'Pause'}
                                                >
                                                    {isPaused ? (
                                                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                                    ) : (
                                                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                                                    )}
                                                </button>
                                            )}
                                            <button
                                                onClick={isPlaying ? stop : play}
                                                disabled={loading || (voiceLoading && !isPlaying)}
                                                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 ${loading || (voiceLoading && !isPlaying) ? 'opacity-50 cursor-not-allowed' : ''} ${isPlaying ? 'bg-indigo-500 text-white shadow-lg border-none' : 'bg-white/5 text-slate-400 border border-white/10'}`}
                                                title={isPlaying ? 'Stop Teaching' : voiceLoading ? 'Preparing Voice...' : 'AI Teacher Voice'}
                                            >
                                                {isPlaying ? (
                                                    <div className="w-3 h-3 bg-white rounded-sm" />
                                                ) : voiceLoading ? (
                                                    <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {mode && (
                                        <button onClick={handleBack} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 text-lg">←</button>
                                    )}
                                    <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 text-lg">✕</button>
                                </div>
                            </div>

                            {/* TRANSCRIPTION / ANIMATION AREA */}
                            <div className="relative w-full h-20 md:h-full flex items-center justify-center z-[70]">
                                {isPlaying && currentSentence && (
                                    <div className="absolute inset-0 flex items-center justify-center px-4 animate-in fade-in zoom-in-95 duration-300">
                                        <div className="bg-indigo-600/10 border border-indigo-500/20 px-6 py-3 rounded-2xl backdrop-blur-md shadow-xl flex items-center gap-4 max-w-xl">
                                            <div className="flex-shrink-0 flex gap-1 items-center">
                                                <div className={`w-1 h-3 bg-indigo-400 ${!isPaused ? 'animate-bounce [animation-delay:-0.3s]' : 'opacity-50'}`} />
                                                <div className={`w-1 h-4 bg-indigo-400 ${!isPaused ? 'animate-bounce [animation-delay:-0.15s]' : 'opacity-50'}`} />
                                                <div className={`w-1 h-2 bg-indigo-400 ${!isPaused ? 'animate-bounce' : 'opacity-50'}`} />
                                            </div>
                                            <p className="text-white text-sm md:text-base font-bold italic leading-tight text-center">
                                                "{currentSentence}"
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {showIntro && !isPlaying && (
                                    <div className="relative flex items-center scale-75 md:scale-100 mt-4 md:mt-0">
                                        <h2 className="text-3xl md:text-5xl font-black tracking-[0.3em] italic text-white/30 uppercase select-none flex items-center gap-2">
                                            <span>{slideNumbers.length > 1 ? 'BATCH' : 'SLIDE'}</span>
                                            <span className="text-indigo-500/30">MΛTE</span>
                                        </h2>
                                        <div className="absolute inset-0 flex items-center gap-2 overflow-hidden animate-reveal-text">
                                            <h2 className="text-3xl md:text-5xl font-black tracking-[0.3em] italic text-white uppercase flex items-center gap-2 whitespace-nowrap">
                                                <span>{slideNumbers.length > 1 ? 'BATCH' : 'SLIDE'}</span>
                                                <span className="text-indigo-500">MΛTE</span>
                                            </h2>
                                        </div>
                                        <div className="absolute top-1/2 -translate-y-1/2 left-0 w-16 h-16 md:w-24 md:h-24 z-20 animate-robot-write">
                                            <div className="relative overflow-visible">
                                                <div className="absolute inset-0 bg-indigo-500/30 blur-3xl rounded-full" />
                                                <img src="/ai_robot_final.png" className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
                                                <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-indigo-400 rounded-full animate-ping" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ACTIONS & CLOSE */}
                            <div className="hidden md:flex flex-col items-end gap-4 relative z-[60]">
                                {/* Row 1: Navigation Tools */}
                                <div className="flex items-center gap-3">
                                    {mode && (
                                        <button
                                            onClick={handleBack}
                                            className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-95 text-xl"
                                            title="Back to Selection"
                                        >
                                            ←
                                        </button>
                                    )}
                                    <button
                                        onClick={onClose}
                                        className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-95 text-xl"
                                        title="Close"
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* Row 2: Content Tools */}
                                <div className="flex items-center gap-3 w-full justify-end">


                                    {data && (
                                        <div className="flex items-center gap-2">
                                            {isPlaying && (
                                                <button
                                                    onClick={isPaused ? resume : pause}
                                                    className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-indigo-400 hover:text-white transition-all active:scale-95"
                                                    title={isPaused ? 'Resume' : 'Pause'}
                                                >
                                                    {isPaused ? (
                                                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                                    ) : (
                                                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                                                    )}
                                                </button>
                                            )}

                                            <button
                                                onClick={isPlaying ? stop : play}
                                                disabled={loading || (voiceLoading && !isPlaying)}
                                                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all border active:scale-95 ${loading || (voiceLoading && !isPlaying) ? 'opacity-50 cursor-not-allowed' : ''} ${isPlaying ? 'bg-indigo-500 text-white border-none shadow-lg shadow-indigo-500/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border-white/5'}`}
                                                title={isPlaying ? 'Stop Teaching' : voiceLoading ? 'Preparing Voice...' : 'AI Teacher Voice'}
                                            >
                                                {isPlaying ? (
                                                    <div className="w-4 h-4 bg-white rounded-sm" />
                                                ) : voiceLoading ? (
                                                    <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6 md:space-y-10 custom-scrollbar relative" dir={currentContent.dir}>
                        {!mode ? (
                            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                                <h2 className="text-lg md:text-2xl font-black text-white uppercase tracking-[0.2em] md:tracking-widest text-center">Choose explanation style</h2>
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
                            </div>
                        ) : loading ? (
                            <div className="absolute inset-0 w-full h-full animate-in fade-in duration-700 overflow-hidden flex flex-col items-center justify-center">
                                {showGame ? (
                                    randomGame
                                ) : (
                                    <div className="flex flex-col items-center space-y-10 animate-in zoom-in duration-500 p-6 md:p-0">
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
                                    </div>
                                )}
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
                                        <div className="p-5 md:p-8 bg-white/[0.03] rounded-[1.5rem] md:rounded-[2.5rem] border border-white/5 shadow-inner">
                                            <div className="prose prose-invert prose-p:text-slate-300 prose-p:text-base md:prose-p:text-lg prose-p:font-medium prose-p:leading-relaxed prose-li:text-slate-300 prose-li:text-base md:prose-li:text-lg prose-li:font-medium prose-h1:!text-red-400 prose-h2:!text-red-400 prose-h3:!text-red-400 prose-h1:!uppercase prose-h2:!uppercase prose-h3:!uppercase prose-h3:!tracking-[0.1em] prose-h3:!font-black prose-h3:!mb-4 prose-h3:!mt-8 first:prose-h3:!mt-0 first:prose-h1:!mt-0 first:prose-h2:!mt-0 prose-hr:border-white/10 max-w-none">
                                                {(() => {
                                                    const structured = tryParseStructured(currentContent.explanation);
                                                    if (structured) return <StructuredRenderer data={structured} />;
                                                    return (
                                                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                            {renderMarkdown(currentContent.explanation)}
                                                        </ReactMarkdown>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </section>
                                ) : null}


                                {/* MCQs */}
                                {data.quiz && data.quiz.length > 0 && (
                                    <section className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-700 pb-10">
                                        <div className="text-center">
                                            <h4 className="text-white/40 font-black text-[11px] uppercase tracking-[0.4em] mb-2">Test Your Understanding</h4>
                                            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Active Recall Questions</p>
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
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 20px; }
                
                /* Force all headings (h1, h2, h3) in explanation to red */
                .prose h1, .prose h2, .prose h3 {
                    color: #f87171 !important;
                    text-transform: uppercase !important;
                    font-weight: 900 !important;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                }
                .prose h3 {
                    letter-spacing: 0.1em !important;
                    font-size: 1.25rem !important;
                    margin-top: 2.5rem !important;
                    margin-bottom: 1.25rem !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 0.75rem !important;
                }
                .prose h3::before {
                    content: '';
                    width: 4px;
                    height: 1.5rem;
                    background: #ef4444;
                    border-radius: 99px;
                    box-shadow: 0 0 15px rgba(239, 68, 68, 0.5);
                }
                .prose li {
                    color: #f8fafc !important; /* White-ish SLATE-50 */
                    font-weight: 600 !important; /* Bolder for clarity */
                    font-size: 1.1rem !important; /* Slightly larger */
                    line-height: 1.8 !important;
                    margin-bottom: 1.25rem !important;
                    text-align: right;
                    direction: rtl;
                }
                .prose li::marker {
                    color: #6366f1 !important; /* Indigo-500 */
                    font-size: 1.2rem;
                }
                .prose li strong {
                    color: #fbbf24 !important; /* Yellow-400 */
                    font-weight: 900 !important;
                    font-size: 1.15rem !important; /* Slightly larger than the normal text */
                    display: inline-block !important;
                    margin-left: 0.5rem; /* Space after calculations/colon in RTL */
                    text-shadow: 0 0 10px rgba(251, 191, 36, 0.1);
                }
                .prose h1:first-of-type, .prose h2:first-of-type, .prose h3:first-of-type {
                    margin-top: 0 !important;
                }

                /* Exam Insight Custom Styling - Perfect Sequential Coloring */
                .exam-insight-content ul {
                    list-style-type: none !important;
                    padding-left: 0 !important;
                    margin: 0 !important;
                }
                
                /* Base style for every point */
                .exam-insight-content > *, 
                .exam-insight-content li {
                    position: relative;
                    padding-left: 2rem;
                    margin-bottom: 0.75rem;
                    display: block;
                    font-weight: 700;
                    line-height: 1.5;
                }

                .exam-insight-content > *::before, 
                .exam-insight-content li::before {
                    content: '✦';
                    position: absolute;
                    left: 0;
                    top: 2px;
                    font-size: 1.2em;
                }

                /* Fixed Sequence: P (Point 1) -> LI:1 (Point 2) -> LI:2 (Point 3) -> LI:3 (Point 4) */
                
                /* Point 1: Usually the direct paragraph */
                .exam-insight-content > p:first-of-type { color: #fde68a !important; }
                .exam-insight-content > p:first-of-type::before { color: #f59e0b !important; }

                /* Point 2: First list item */
                .exam-insight-content li:nth-child(1) { color: #a5b4fc !important; }
                .exam-insight-content li:nth-child(1)::before { color: #6366f1 !important; }

                /* Point 3: Second list item */
                .exam-insight-content li:nth-child(2) { color: #6ee7b7 !important; }
                .exam-insight-content li:nth-child(2)::before { color: #10b981 !important; }

                /* Point 4: Third list item */
                .exam-insight-content li:nth-child(3) { color: #fca5a5 !important; }
                .exam-insight-content li:nth-child(3)::before { color: #ef4444 !important; }

                /* Catch-all for any other points in sequence */
                .exam-insight-content > *:nth-child(n+10) { color: #94a3b8 !important; }

                /* Prevent Red KaTeX Errors from showing as red */
                .katex-error {
                    color: inherit !important;
                    background: transparent !important;
                    border: none !important;
                }

                /* Enhanced Math & Numbers Rendering */
                .katex { 
                    font-size: 1.15em !important; 
                    color: #fbbf24;
                    direction: ltr !important;
                    unicode-bidi: isolate;
                }
                .katex-display {
                    margin: 1.5rem 0 !important;
                    padding: 1.25rem;
                    background: rgba(255,255,255,0.02);
                    border-radius: 1.5rem;
                    overflow-x: auto;
                    overflow-y: hidden;
                    border: 1px solid rgba(255,255,255,0.05);
                    min-height: 2em;
                    -webkit-overflow-scrolling: touch;
                    direction: ltr !important;
                    text-align: center !important;
                }
                .prose p, .prose li {
                    font-variant-numeric: tabular-nums;
                }

                /* Slide Point Styling: Main Headings (h3) = Red, Sub-Points (strong) = Yellow */
                .prose strong {
                    color: #fbbf24 !important; /* Yellow for English sub-points and examples */
                    font-weight: 900 !important;
                    display: block !important;
                    margin-bottom: 0.75rem !important;
                    font-size: 1.1em !important;
                    line-height: 1.4 !important;
                    direction: ltr !important; /* English: Left to Right */
                    text-align: left !important;
                    unicode-bidi: embed !important;
                }

                .prose p {
                    color: #e2e8f0 !important;
                    margin-bottom: 1.5rem !important;
                    line-height: 1.8 !important;
                }

                /* Ensure proper spacing between points */
                .prose p + p {
                    margin-top: 1.5rem !important;
                }
            `}</style>
        </div>
    );
};