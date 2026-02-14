import { useState, useCallback } from 'react';

interface FileUploadProps {
    onUpload: (file: File) => void;
}

export const FileUpload = ({ onUpload }: FileUploadProps) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setIsDragging(true);
        } else if (e.type === 'dragleave') {
            setIsDragging(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            onUpload(e.dataTransfer.files[0]);
        }
    }, [onUpload]);

    return (
        <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
                relative w-full p-10 sm:p-16 rounded-[2rem] transition-all duration-500
                ${isDragging
                    ? 'bg-indigo-500/10 scale-[0.98] border-indigo-500/50 shadow-[0_0_40px_rgba(99,102,241,0.2)]'
                    : 'bg-transparent border-transparent'}
                group cursor-pointer overflow-hidden
            `}
        >
            <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                accept=".pdf,image/*"
            />

            {/* Animated Border/Ring */}
            <div className={`
                absolute inset-0 border-2 border-dashed rounded-[2rem] transition-all duration-700 pointer-events-none
                ${isDragging ? 'border-indigo-400 opacity-100 scale-100' : 'border-white/10 opacity-40 scale-95'}
            `} />

            <div className="text-center relative z-10">
                <div className="relative inline-block mb-6">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full group-hover:bg-indigo-500/40 transition-all duration-500" />
                    <div className="w-20 h-20 glass rounded-3xl flex items-center justify-center relative border border-white/10 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-xl">
                        <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                </div>

                <h3 className="text-2xl sm:text-3xl font-black mb-3 tracking-tight text-white uppercase italic">
                    Upload <span className="text-indigo-400">Lecture</span> Slides
                </h3>
                <p className="text-slate-300 font-medium mb-8 text-sm sm:text-base">
                    Drag and drop <span className="text-white font-bold">PDF</span> or <span className="text-white font-bold">Images</span> here to begin analysis
                </p>

                <div className="inline-flex items-center gap-3 px-8 py-3 bg-white text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all shadow-[0_10px_30px_rgba(255,255,255,0.1)] group-hover:scale-105 active:scale-95">
                    Browse Files
                </div>

                <div className="mt-10 flex items-center justify-center gap-2 opacity-80">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <p className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.2em]">Supports PDF • All Image Formats</p>
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                </div>
            </div>
        </div>
    );
};
