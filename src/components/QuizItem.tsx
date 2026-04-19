import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface QuizItemProps {
    qIndex: number;
    question: string;
    options: string[];
    correctIndex: number;
    reasoning: string;
    selectedOption?: number;
    onSelect: (qIndex: number, oIndex: number) => void;
    renderMarkdown: (content: any) => string;
}

export const QuizItem: React.FC<QuizItemProps> = ({
    qIndex,
    question,
    options,
    correctIndex,
    reasoning,
    selectedOption,
    onSelect,
    renderMarkdown
}) => {
    return (
        <div className="space-y-6">
            <div className="flex gap-3 md:gap-4">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-400 flex-shrink-0">
                    Q{qIndex + 1}
                </div>
                <div className="text-lg md:text-xl font-black text-slate-200 leading-tight">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {renderMarkdown(question)}
                    </ReactMarkdown>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 pl-0 md:pl-4">
                {options.map((option, oIndex) => {
                    const isSelected = selectedOption === oIndex;
                    const isCorrect = correctIndex === oIndex;
                    const hasAnswered = selectedOption !== undefined;

                    let buttonClass = 'bg-white/[0.03] border-white/5 hover:bg-white/10 hover:border-white/20';
                    if (hasAnswered) {
                        if (isCorrect) {
                            buttonClass = 'bg-green-500/20 border-green-500/40 text-green-400';
                        } else if (isSelected) {
                            buttonClass = 'bg-red-500/20 border-red-500/40 text-red-400';
                        } else {
                            buttonClass = 'bg-white/[0.01] border-white/5 opacity-30';
                        }
                    }

                    return (
                        <button
                            key={oIndex}
                            onClick={() => onSelect(qIndex, oIndex)}
                            disabled={hasAnswered}
                            className={`p-4 md:p-5 rounded-xl md:rounded-2xl border text-left text-sm md:text-base font-bold transition-all shadow-sm active:scale-98 ${buttonClass}`}
                        >
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {renderMarkdown(option)}
                            </ReactMarkdown>
                        </button>
                    );
                })}
            </div>
            {selectedOption !== undefined && (
                <div className="pl-4 animate-in zoom-in-95 duration-300">
                    <div className={`p-6 rounded-3xl border ${selectedOption === correctIndex ? 'bg-green-500/[0.03] border-green-500/20' : 'bg-red-500/[0.03] border-red-500/20'}`}>
                        <div className="text-sm text-slate-400 font-bold leading-relaxed">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {renderMarkdown(reasoning)}
                            </ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
