import { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { SlideCard } from './components/SlideCard';
import { ExplanationPane } from './components/ExplanationPane';
import { LoadingScreen } from './components/LoadingScreen';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './components/Login';
import { LogoModal } from './components/LogoModal';
import * as pdfjsLib from 'pdfjs-dist';

// Use a more reliable worker source from unpkg
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface Slide {
  id: string;
  number: number;
  isImportant: boolean;
  topic?: string;
  textContent?: string;
  thumbnail?: string;
  analysis?: any; // To store analysis results
}

function MainApp() {
  const { user, logout } = useAuth();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [chapterTitle, setChapterTitle] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState<Slide | null>(null);
  const [selectedSlideIds, setSelectedSlideIds] = useState<string[]>([]);
  // Removed isBatchMode as it was unused and defaulting to true is fine if logic doesn't need state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    const fileName = file.name.split('.')[0];
    setChapterTitle(fileName);

    try {
      let pageCount = 0;
      const extractedSlides: Slide[] = [];

      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

        const pdf = await loadingTask.promise;
        pageCount = pdf.numPages;

        const importantCount = Math.max(1, Math.round(pageCount * 0.2));
        const importantIndices = new Set<number>();
        while (importantIndices.size < importantCount) {
          importantIndices.add(Math.floor(Math.random() * pageCount) + 1);
        }

        for (let i = 1; i <= pageCount; i++) {
          const page = await pdf.getPage(i);

          const viewport = page.getViewport({ scale: 1.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({
            canvasContext: context as any,
            viewport,
            canvas: canvas as any
          }).promise;
          const thumbnailData = canvas.toDataURL('image/webp', 0.5);

          const textContent = await page.getTextContent();

          const fullText = textContent.items
            .map((item: any) => item.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

          const firstLine = fullText.split('.').filter(line => line.length > 5)[0] || "Lecture Analysis";

          extractedSlides.push({
            id: `slide-${Math.random().toString(36).substr(2, 9)}`,
            number: i,
            topic: firstLine.substring(0, 40) + (firstLine.length > 40 ? '...' : ''),
            isImportant: importantIndices.has(i),
            textContent: fullText,
            thumbnail: thumbnailData
          });

          const currentProgress = (i / pageCount) * 100;
          setUploadProgress(currentProgress);
          // Optimize rendering: batch updates or use proper buffering if needed
          // For now, minimal updates to prevent UI lag
          if (i % 5 === 0) setSlides([...extractedSlides]);
        }
      } else {
        throw new Error('Please upload a PDF file for analysis.');
      }

      setSlides(extractedSlides);
    } catch (error: any) {
      console.error('Error processing document:', error);
      setUploadError(error.message || 'Error processing file. Try again or check the file format.');
      setSlides([]);
    } finally {
      setIsUploading(false);
    }
  };

  const toggleSlideSelection = (id: string) => {
    setSelectedSlideIds(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  const handleBatchAnalyze = () => {
    if (selectedSlideIds.length === 0) return;
    const batchSlides = slides.filter(s => selectedSlideIds.includes(s.id));
    setSelectedSlide({
      id: 'batch-mode',
      number: 0,
      isImportant: false,
      textContent: batchSlides.map(s => s.textContent).join('\n\n'),
      thumbnail: batchSlides[0]?.thumbnail
    } as any);
  };

  return (
    <div className="min-h-screen transition-all duration-700 bg-slate-900 text-white">
      <nav className="border-b transition-colors duration-500 p-4 flex justify-between items-center sticky top-0 backdrop-blur-xl z-50 border-slate-800 bg-slate-900/80">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500/20 rounded-xl blur-xl group-hover:bg-indigo-500/40 transition-all duration-700 animate-pulse" />
            <img
              src="/logo_white_bg.jpg"
              alt="SlideMate Logo"
              onClick={() => setIsLogoModalOpen(true)}
              className="w-10 h-10 rounded-xl shadow-lg border border-indigo-500/30 relative z-10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 cursor-pointer"
            />
          </div>
          <h1 className="text-lg sm:text-2xl font-black tracking-tighter uppercase italic text-white flex items-center gap-1">
            <span>SLIDE</span>
            <span className="text-indigo-400">MΛTE</span>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400 hidden md:block">
                {user.displayName}
              </span>
              <button
                onClick={async () => await logout()}
                className="text-[10px] sm:text-xs bg-white/5 hover:bg-white/10 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors border border-white/5 text-white whitespace-nowrap"
              >
                Sign Out
              </button>
              {user.photoURL && <img src={user.photoURL} className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border border-indigo-500/50" />}
            </div>
          )}
        </div>
      </nav>


      <main className="max-w-7xl mx-auto p-4 sm:p-8 relative z-10">
        {uploadError && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-500 text-center font-bold animate-in fade-in slide-in-from-top-4 duration-300">
            ⚠️ {uploadError}
          </div>
        )}

        {isUploading ? (
          <LoadingScreen progress={uploadProgress} chapterTitle={chapterTitle} />
        ) : slides.length === 0 ? (
          <div className="py-10 sm:py-20 animate-in fade-in zoom-in duration-1000">
            <div className="text-center mb-16">
              <h2 className="text-5xl sm:text-7xl font-black mb-6 tracking-tighter leading-none text-white uppercase">
                Master the <span className="text-indigo-500">Node</span>.
              </h2>
              <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto font-medium leading-relaxed">
                Upload your lecture PDF for real-time semantic extraction and exam prediction.
              </p>
            </div>
            <FileUpload onUpload={handleUpload} />
          </div>
        ) : (
          <div className="pt-10 space-y-4 pb-40 overflow-y-auto scroll-smooth">
            {slides.map(slide => (
              <div key={slide.id} className="snap-center">
                <SlideCard
                  slideNumber={slide.number}
                  isImportant={slide.isImportant}
                  thumbnail={slide.thumbnail}
                  onUnderstand={() => setSelectedSlide(slide)}
                  selected={selectedSlideIds.includes(slide.id)}
                  onToggleSelect={() => toggleSlideSelection(slide.id)}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {selectedSlideIds.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[80] animate-in slide-in-from-bottom-10 duration-500">
          <button
            onClick={handleBatchAnalyze}
            className="flex items-center gap-4 px-10 py-5 bg-indigo-600 rounded-full shadow-[0_0_50px_rgba(99,102,241,0.4)] border border-white/20 hover:bg-indigo-500 hover:scale-105 transition-all group"
          >
            <div className="flex -space-x-3">
              {slides.filter(s => selectedSlideIds.includes(s.id)).map((s) => (
                <div key={s.id} className="w-8 h-8 rounded-full bg-slate-800 border-2 border-indigo-600 overflow-hidden flex items-center justify-center text-[10px] font-black z-[10]">
                  {s.thumbnail ? <img src={s.thumbnail} className="w-full h-full object-cover" /> : s.number}
                </div>
              ))}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-white font-black text-lg leading-none uppercase tracking-tighter">Analyze {selectedSlideIds.length} Slides</span>
              <span className="text-indigo-200 text-[10px] font-bold uppercase tracking-[0.2em]">Cross-Slide Synthesis</span>
            </div>
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-white/20 transition-colors">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </button>
        </div>
      )}

      {selectedSlide && (
        <>
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[90]" onClick={() => setSelectedSlide(null)} />
          <ExplanationPane
            slideIds={selectedSlide.id === 'batch-mode'
              ? selectedSlideIds
              : [selectedSlide.id]}
            slideNumbers={selectedSlide.id === 'batch-mode'
              ? slides.filter(s => selectedSlideIds.includes(s.id)).map(s => s.number)
              : [selectedSlide.number]}
            textContentArray={selectedSlide.id === 'batch-mode'
              ? slides.filter(s => selectedSlideIds.includes(s.id)).map(s => s.textContent || "")
              : [selectedSlide.textContent || ""]}
            allSlidesTexts={slides.map(s => s.textContent || "")}
            thumbnail={selectedSlide.thumbnail}
            onClose={() => setSelectedSlide(null)}
          />
        </>
      )}

      <LogoModal isOpen={isLogoModalOpen} onClose={() => setIsLogoModalOpen(false)} />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthWrapper />
    </AuthProvider>
  )
}

function AuthWrapper() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
  return user ? <MainApp /> : <Login />;
}

export default App;
