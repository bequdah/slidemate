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
        relative w-full max-w-2xl mx-auto p-12 mt-12
        border-2 border-dashed rounded-3xl transition-all duration-300
        ${isDragging
                    ? 'border-indigo-500 bg-indigo-500/10 scale-105'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}
        group cursor-pointer
      `}
        >
            <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                accept=".pdf,.pptx"
            />
            <div className="text-center">
                <div className="w-16 h-16 bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <span className="text-3xl text-indigo-400">📄</span>
                </div>
                <h3 className="text-xl font-bold mb-2">Upload Lecture Slides</h3>
                <p className="text-slate-400 mb-6">Drag and drop PDF or PPTX files here</p>
                <div className="inline-block px-6 py-2 bg-indigo-600 rounded-full text-sm font-bold group-hover:bg-indigo-500 transition-colors">
                    Browse Files
                </div>
                <p className="text-xs text-slate-500 mt-6 uppercase tracking-widest">Supports university portals & manual exports</p>
            </div>
        </div>
    );
};
