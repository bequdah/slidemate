import { useState, useEffect } from 'react';
import { analyzeSlide, type SlideExplanation, type ExplanationMode } from '../services/aiService';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

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
    thumbnail?: string;
    onClose: () => void;
}

/* =======================
   Component
======================= */

export const ExplanationPane = ({ slideNumbers, textContentArray, thumbnail, onClose }: ExplanationPaneProps) => {
    const [data, setData] = useState<SlideExplanation | null>(null);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<ExplanationMode | null>(null);
    const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({});
    const [lang, setLang] = useState<'en' | 'ar'>('en');
    const [showIntro, setShowIntro] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => setShowIntro(false), 4500);
        return () => clearTimeout(timer);
    }, []);

    const handleModeSelect = (selectedMode: ExplanationMode) => {
        setMode(selectedMode);
        setLoading(true);
        setData(null);
        setSelectedOptions({});

        // Use the current language state
        analyzeSlide(slideNumbers, textContentArray, selectedMode, thumbnail, lang).then(res => {
            setData(res);
            setLoading(false);
        }).catch(err => {
            console.error("Analysis Error:", err);
            setLoading(false);
        });
    };

    const handleLanguageToggle = () => {
        const nextLang = lang === 'en' ? 'ar' : 'en';
        setLang(nextLang);

        // If we are already in a mode and have data, re-fetch for the new language
        if (mode) {
            setLoading(true);
            setData(null);
            setSelectedOptions({});

            analyzeSlide(slideNumbers, textContentArray, mode, thumbnail, nextLang).then(res => {
                setData(res);
                setLoading(false);
            }).catch(err => {
                console.error("Analysis Error:", err);
                setLoading(false);
            });
        }
    };

    const handleBack = () => {
        setMode(null);
        setData(null);
        setLoading(false);
    };

    const handleOptionSelect = (qIndex: number, oIndex: number) => {
        if (selectedOptions[qIndex] !== undefined) return;
        setSelectedOptions(prev => ({ ...prev, [qIndex]: oIndex }));
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
       Renderers
    ======================= */

    const renderMarkdown = (content: any) => {
        if (!content) return "";
        if (typeof content === 'string') {
            if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
                return "Analysis formatting error. Please try again.";
            }
            return content;
        }
        if (typeof content === 'object') {
            return content.text || content.content || content.insight || "";
        }
        return String(content);
    };

    const StructuredRenderer = ({ data }: { data: StructuredExplanation }) => {
        const sections = Array.isArray(data.sections) ? data.sections : [];

        return (
            <div className="space-y-8">
                {(data.title || data.overview) && (
                    <div className="space-y-3">
                        {data.title && (
                            <h3 className="text-indigo-400 uppercase tracking-[0.1em] font-black flex items-center gap-3">
                                <span className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                                {data.title}
                            </h3>
                        )}
                        {data.overview && (
                            <p className="text-slate-300 text-base md:text-lg font-medium leading-relaxed">
                                {data.overview}
                            </p>
                        )}
                    </div>
                )}

                {sections.map((s, i) => (
                    <div key={i} className="space-y-3">
                        {'heading' in s && s.heading && (
                            <h3 className="text-indigo-400 uppercase tracking-[0.1em] font-black flex items-center gap-3">
                                <span className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                                {s.heading}
                            </h3>
                        )}

                        {'text' in s && s.text && (
                            <p className="text-slate-300 text-base md:text-lg font-medium leading-relaxed">
                                {s.text}
                            </p>
                        )}

                        {'bullets' in s && Array.isArray(s.bullets) && (
                            <ul className="list-disc pl-6 space-y-2 text-slate-300 text-base md:text-lg font-medium">
                                {s.bullets.map((b, idx) => (
                                    <li key={idx}>{b}</li>
                                ))}
                            </ul>
                        )}

                        {'definitions' in s && Array.isArray(s.definitions) && (
                            <div className="space-y-2">
                                {s.definitions.map((d, idx) => (
                                    <p key={idx} className="text-slate-300 text-base md:text-lg font-medium">
                                        <strong className="text-white">{d.term}:</strong> {d.def}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    const currentContent = {
        explanation: data?.explanation,
        examInsight: data?.examInsight,
        dir: lang === 'ar' ? 'rtl' as const : 'ltr' as const
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[100] animate-in fade-in duration-500">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />

            {/* Modal Content */}
            <div className={`relative w-full max-w-4xl h-[95vh] md:h-[85vh] bg-[#0c111d] rounded-t-3xl md:rounded-3xl shadow-2xl border border-white/10 animate-in zoom-in-95 duration-500 flex flex-col ${currentContent.dir === 'rtl' ? 'font-arabic' : ''}`} dir={currentContent.dir}>
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
                                        <h4 className="text-indigo-400/80 font-bold text-[9px] md:text-xs tracking-widest uppercase">
                                            {slideNumbers.length > 1 ? (lang === 'en' ? 'Batch Analysis' : 'تحليل مجمع') : (lang === 'en' ? 'Insights' : 'رؤى')}
                                        </h4>
                                    </div>
                                </div>

                                <div className="flex md:hidden items-center gap-2">

                                    {mode && (
                                        <button onClick={handleBack} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 text-lg">←</button>
                                    )}
                                    <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 text-lg">✕</button>
                                </div>
                            </div>

                            {/* ANIMATION AREA */}
                            <div className="relative w-full h-20 md:h-full flex items-center justify-center pointer-events-none">
                                {showIntro && (
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
                            <div className="hidden md:flex items-center justify-end gap-4 relative z-[60]">
                                <button
                                    onClick={handleLanguageToggle}
                                    className="flex bg-white/5 p-1 rounded-xl border border-white/10 hover:bg-white/10 transition-all active:scale-95"
                                >
                                    <span className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${lang === 'en' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>EN</span>
                                    <span className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${lang === 'ar' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>AR</span>
                                </button>
                                {mode && (
                                    <button onClick={handleBack} className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-95 text-2xl">←</button>
                                )}
                                <button onClick={onClose} className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-95 text-2xl">✕</button>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6 md:space-y-10 custom-scrollbar relative">
                        {!mode ? (
                            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                                <h2 className="text-lg md:text-2xl font-black text-white uppercase tracking-[0.2em] md:tracking-widest text-center">Choose explanation style</h2>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full max-w-4xl">
                                    {['simple', 'deep', 'exam'].map((m) => {
                                        const bgClass = m === 'simple' ? 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20' :
                                            m === 'deep' ? 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20' :
                                                'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20';

                                        const textClass = m === 'simple' ? 'text-indigo-400' :
                                            m === 'deep' ? 'text-purple-400' :
                                                'text-amber-400';

                                        const icon = m === 'simple' ? '💡' : m === 'deep' ? '🧠' : '📝';

                                        return (
                                            <button
                                                key={m}
                                                onClick={() => handleModeSelect(m as ExplanationMode)}
                                                className={`group p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] border ${bgClass} hover:scale-[1.02] transition-all duration-300 text-left relative overflow-hidden active:scale-95`}
                                            >
                                                <div className="text-4xl mb-4 bg-white/5 w-16 h-16 rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform">
                                                    {icon}
                                                </div>
                                                <h3 className={`text-xl font-black ${textClass} mb-2 capitalize`}>{m}</h3>
                                                <p className="text-sm text-slate-400 leading-relaxed">
                                                    {m === 'simple' ? 'Easy language, intuitive examples.' : m === 'deep' ? 'Detailed reasoning and connections.' : 'Strict definitions and exam focus.'}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : loading ? (
                            <div className="flex flex-col items-center justify-center h-full space-y-6">
                                <div className="relative w-16 h-16">
                                    <div className="absolute inset-0 border-4 border-indigo-500/10 rounded-full" />
                                    <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                                <div className="text-center">
                                    <p className="text-[11px] text-indigo-400 font-black tracking-[0.5em] uppercase mb-2">Generating {mode} Analysis</p>
                                    <p className="text-[10px] text-slate-500 font-medium">Consulting Expert AI...</p>
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
                                        <div className="p-5 md:p-8 bg-white/[0.03] rounded-[1.5rem] md:rounded-[2.5rem] border border-white/5 shadow-inner">
                                            <div className="prose prose-invert prose-p:text-slate-300 prose-p:text-base md:prose-p:text-lg prose-p:font-medium prose-p:leading-relaxed prose-li:text-slate-300 prose-li:text-base md:prose-li:text-lg prose-li:font-medium prose-h3:!text-indigo-400 prose-h3:!uppercase prose-h3:!tracking-[0.1em] prose-h3:!font-black prose-h3:!mb-4 prose-h3:!mt-8 first:prose-h3:!mt-0 prose-hr:border-white/10 max-w-none">
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

                                {/* Exam Insight - Hidden in Exam Mode */}
                                {mode !== 'exam' && currentContent.examInsight ? (
                                    <section className="bg-indigo-500/[0.04] border border-indigo-500/20 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] animate-in fade-in slide-in-from-bottom-8 duration-700 relative overflow-hidden group">
                                        <h4 className="flex items-center gap-3 text-indigo-400 font-black mb-4 text-xs md:text-sm uppercase tracking-[0.3em] shadow-indigo-500/20 drop-shadow-md">🎯 {lang === 'en' ? 'Exam Insight' : 'نصيحة الامتحان'}</h4>
                                        <div className="text-base md:text-lg text-slate-200 leading-relaxed font-bold relative z-10 exam-insight-content pl-2">
                                            {(() => {
                                                const structured = tryParseStructured(currentContent.examInsight);
                                                if (structured) return <StructuredRenderer data={structured} />;
                                                return (
                                                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                                        {renderMarkdown(currentContent.examInsight)}
                                                    </ReactMarkdown>
                                                );
                                            })()}
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
                                        {data.quiz.map((item, qIndex) => (
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
                                                    {item.options.map((option, oIndex) => (
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
                
                /* Force h3 styling to match INSIGHTS label */
                .prose h3 {
                    color: #818cf8 !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.1em !important;
                    font-size: 1.25rem !important;
                    font-weight: 900 !important;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                    margin-top: 2.5rem !important;
                    margin-bottom: 1.25rem !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 0.75rem !important;
                }
                .prose h3::before {
                    content: '';
                    width: 4px;
                    height: 1.2em;
                    background: #6366f1;
                    border-radius: 99px;
                    display: inline-block;
                }
                .prose h3:first-of-type {
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
                    color: #e2e8f0;
                }
                .katex-display {
                    margin: 1.5rem 0 !important;
                    padding: 1.25rem;
                    background: rgba(255,255,255,0.02);
                    border-radius: 1.5rem;
                    overflow-x: auto;
                    overflow-y: hidden;
                    border: 1px solid rgba(255,255,255,0.05);
                }
                .prose p, .prose li {
                    font-variant-numeric: tabular-nums;
                }
            `}</style>
        </div>
    );
};
