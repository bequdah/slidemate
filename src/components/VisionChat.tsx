import { useState, useRef } from 'react';
import { analyzeSlide, type SlideExplanation } from '../services/aiService';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export const VisionChat = () => {
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string, image?: string }[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSelectedImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSend = async () => {
        if (!input.trim() && !selectedImage) return;

        const userMessage = { role: 'user' as const, content: input, image: selectedImage || undefined };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setSelectedImage(null);
        setLoading(true);

        try {
            // Reusing analyzeSlide service but passing manual image
            const res: SlideExplanation = await analyzeSlide([0], [input], 'simple', userMessage.image);

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: res.explanation || "Analysis complete."
            }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error analyzing that." }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-[100] w-full max-w-sm md:max-w-md pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl flex flex-col h-[500px] pointer-events-auto overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
                {/* Header */}
                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-indigo-600/10">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-lg">👁️</div>
                        <h3 className="font-black uppercase text-xs tracking-widest text-white">Vision Assistant</h3>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-40 space-y-4">
                            <div className="text-4xl">🖼️</div>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Upload a diagram or chart to start</p>
                        </div>
                    )}
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] p-4 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white/5 border border-white/10 text-slate-200'}`}>
                                {msg.image && (
                                    <img src={msg.image} className="w-full rounded-lg mb-2 shadow-lg border border-white/10" alt="Uploaded" />
                                )}
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex justify-start">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Analyzing...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-white/5 space-y-4">
                    {selectedImage && (
                        <div className="relative w-20 h-20 group">
                            <img src={selectedImage} className="w-full h-full object-cover rounded-xl border border-indigo-500/50" alt="Preview" />
                            <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs shadow-lg">✕</button>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-xl transition-all active:scale-95 border border-white/10 text-slate-400">
                            📷
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                        <div className="flex-1 relative">
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Ask about an image..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-xs font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                            />
                        </div>
                        <button onClick={handleSend} className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white transition-all active:scale-95 shadow-lg shadow-indigo-600/20">
                            →
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
