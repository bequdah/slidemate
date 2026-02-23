
import { useState, useRef, useEffect } from 'react';
import { chatWithSlide } from '../services/aiService';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatBotProps {
    slideContext: string;
    currentExplanation: string;
}

export const ChatBot = ({ slideContext, currentExplanation }: ChatBotProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const sendMessage = async (content: string) => {
        if (!content.trim() || isLoading) return;

        const userMsg: Message = { role: 'user', content };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        try {
            const data = await chatWithSlide(newMessages, slideContext, currentExplanation);
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: "يا غالي صار عندي مشكلة، جرب كمان مرة." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = () => sendMessage(input);

    const handleQuickAction = (action: string) => {
        let prompt = "";
        switch (action) {
            case 'summary':
                prompt = "لخصلي الصافي بـ 3 نقاط سريعة ومهمة عن هاد السلايد.";
                break;
            case 'example':
                prompt = "اعطيني مثال عملي من واقعنا بالأردن عشان أفهم هالفكرة صح.";
                break;
            case 'exam':
                prompt = "شو بيجي بالامتحان على هاد السلايد؟ ركزلي على النقاط اللي بكررها الدكاترة.";
                break;
        }
        sendMessage(prompt);
    };

    return (
        <>
            {/* Floating Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-6 right-6 z-[120] w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-2xl active:scale-90 ${isOpen ? 'bg-red-500 rotate-90 scale-90' : 'bg-indigo-600 hover:bg-indigo-500 hover:-translate-y-1'
                    }`}
            >
                {isOpen ? (
                    <span className="text-white text-2xl">✕</span>
                ) : (
                    <div className="relative">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
                    </div>
                )}
            </button>

            {/* Chat Window */}
            <div className={`fixed bottom-24 right-6 z-[110] w-[calc(100vw-3rem)] md:w-96 h-[60vh] md:h-[500px] bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col transition-all duration-500 transform ${isOpen ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95 pointer-events-none'
                }`}>

                {/* Header */}
                <div className="p-5 border-b border-white/5 flex items-center gap-3 justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                            <img src="/ai_robot_pro.png" alt="Tutor" className="w-8 h-8 object-contain" />
                        </div>
                        <div>
                            <h4 className="text-white font-black text-sm tracking-widest uppercase">QUDAH BOT</h4>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider animate-pulse">Online & Thinking</span>
                            </div>
                        </div>
                    </div>

                    {messages.length > 0 && (
                        <button
                            onClick={() => setMessages([])}
                            className="p-2.5 rounded-xl bg-white/5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-95 group"
                            title="مسح المحادثة"
                        >
                            <svg className="w-4 h-4 transition-transform group-hover:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Messages Panel */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
                    dir="rtl"
                >
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-4">
                            <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center animate-bounce duration-[2000ms]">
                                <span className="text-3xl">👋</span>
                            </div>
                            <div className="space-y-1">
                                <p className="text-white font-black text-base">أهلاً فيك!</p>
                                <p className="text-slate-400 text-xs font-arabic font-medium leading-relaxed">
                                    أنا هون عشان أبسطلك السلايدات. اختار وحدة:
                                </p>
                            </div>

                            <div className="grid grid-cols-1 w-full gap-2">
                                <button
                                    onClick={() => handleQuickAction('summary')}
                                    className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-right hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all group active:scale-95"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg group-hover:scale-110 transition-transform">💡</span>
                                        <div className="text-right">
                                            <p className="text-white font-bold text-xs">لخصلي الصافي</p>
                                            <p className="text-slate-500 text-[9px]">أهم 3 نقاط بالسلايد</p>
                                        </div>
                                    </div>
                                </button>

                                <button
                                    onClick={() => handleQuickAction('example')}
                                    className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-right hover:bg-emerald-600/20 hover:border-emerald-500/50 transition-all group active:scale-95"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg group-hover:scale-110 transition-transform">🇯🇴</span>
                                        <div className="text-right">
                                            <p className="text-white font-bold text-xs">مثال من واقعنا</p>
                                            <p className="text-slate-500 text-[9px]">قصة أردنية تفهمك الفكرة</p>
                                        </div>
                                    </div>
                                </button>

                                <button
                                    onClick={() => handleQuickAction('exam')}
                                    className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-right hover:bg-amber-600/20 hover:border-amber-500/50 transition-all group active:scale-95"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg group-hover:scale-110 transition-transform">📝</span>
                                        <div className="text-right">
                                            <p className="text-white font-bold text-xs">شو بيجي بالامتحان؟</p>
                                            <p className="text-slate-500 text-[9px]">النقاط اللي بركز عليها الدكاترة</p>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[85%] p-4 rounded-2xl ${msg.role === 'user'
                                ? 'bg-indigo-600/20 border border-indigo-500/20 text-white rounded-tr-none'
                                : 'bg-white/5 border border-white/10 text-slate-200 rounded-tl-none font-medium'
                                }`}>
                                <div className="prose prose-invert prose-sm max-w-none font-arabic leading-relaxed">
                                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex justify-end">
                            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-none flex gap-1 items-center">
                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-duration:0.6s]" />
                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.2s]" />
                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-duration:0.6s] [animation-delay:0.4s]" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white/5 rounded-b-[2rem]">
                    <div className="relative flex items-center gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="ايش في سؤال ببالك؟..."
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-colors font-arabic"
                            dir="rtl"
                        />
                        <button
                            onClick={handleSend}
                            disabled={isLoading || !input.trim()}
                            className="w-10 h-10 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-slate-700 rounded-xl flex items-center justify-center text-white transition-all active:scale-90"
                        >
                            <svg className="w-5 h-5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};
