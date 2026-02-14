import { useState, useCallback, useRef } from 'react';

interface FileUploadProps {
    onUpload: (file: File) => void;
}

export const FileUpload = ({ onUpload }: FileUploadProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const pdfInputRef = useRef<HTMLInputElement>(null);
    const imgInputRef = useRef<HTMLInputElement>(null);

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
                relative w-full p-8 sm:p-14 rounded-[2rem] transition-all duration-500
                ${isDragging
                    ? 'bg-indigo-500/10 scale-[0.98] border-indigo-500/50 shadow-[0_0_40px_rgba(99,102,241,0.2)]'
                    : 'bg-transparent border-transparent'}
                group overflow-hidden
            `}
        >
            {/* Hidden Inputs */}
            <input
                type="file"
                ref={pdfInputRef}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                accept="application/pdf"
            />
            <input
                type="file"
                ref={imgInputRef}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                accept="image/*"
            />

            {/* Animated Border/Ring */}
            <div className={`
                absolute inset-0 border-2 border-dashed rounded-[2rem] transition-all duration-700 pointer-events-none
                ${isDragging ? 'border-indigo-400 opacity-100 scale-100' : 'border-white/10 opacity-40 scale-95'}
            `} />

            <div className="text-center relative z-10">
                <div className="relative inline-block mb-4">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full group-hover:bg-indigo-500/40 transition-all duration-500" />
                    <div className="w-16 h-16 sm:w-20 sm:h-20 glass rounded-3xl flex items-center justify-center relative border border-white/10 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-xl">
                        <svg className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                </div>

                <h3 className="text-xl sm:text-3xl font-black mb-2 tracking-tight text-white uppercase italic">
                    Ready to <span className="text-indigo-400">Analyze</span>?
                </h3>
                <p className="text-slate-400 font-medium mb-8 text-xs sm:text-base">
                    Choose your file type to begin
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4">
                    <button
                        onClick={() => pdfInputRef.current?.click()}
                        className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-white text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all shadow-lg active:scale-95 transition-all group/btn"
                    >
                        <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z" />
                        </svg>
                        Upload PDF
                    </button>

                    <button
                        onClick={() => imgInputRef.current?.click()}
                        className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all border border-white/10 shadow-lg active:scale-95 transition-all"
                    >
                        <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Upload Image
                    </button>
                </div>

                <div className="mt-10 flex items-center justify-center gap-2 opacity-60">
                    <span className="w-1 h-1 rounded-full bg-indigo-500" />
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Drag and drop supported for desktop</p>
                    <span className="w-1 h-1 rounded-full bg-indigo-500" />
                </div>
            </div>
        </div>
    );
};
