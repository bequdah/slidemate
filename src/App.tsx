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
          if (i % 5 === 0) setSlides([...extractedSlides]);
        }
      } else if (file.type.startsWith('image/')) {
        // Handle Image Upload
        const reader = new FileReader();
        const imageData = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });

        extractedSlides.push({
          id: `img-${Date.now()}`,
          number: 1,
          topic: "Screenshot Analysis",
          isImportant: true,
          textContent: "[IMAGE_UPLOAD] analyze this slide visual content directly.",
          thumbnail: imageData
        });
        setUploadProgress(100);
      } else {
        throw new Error('Please upload a PDF or an Image.');
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

  const resetApp = () => {
    setSlides([]);
    setChapterTitle('');
    setUploadProgress(0);
    setUploadError(null);
    setIsUploading(false);
  };

  return (
    <div className="min-h-screen transition-all duration-700 bg-[#020617] text-white selection:bg-indigo-500/30">
      {/* Animated Background Element */}
      <div className="mesh-bg" />

      <nav className="border-b border-white/5 p-4 flex justify-between items-center sticky top-0 backdrop-blur-2xl z-50 bg-[#020617]/40">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500/20 rounded-xl blur-xl group-hover:bg-indigo-500/40 transition-all duration-700 animate-pulse" />
            <img
              src="/logo_white_bg.jpg"
              alt="SlideMate Logo"
              onClick={() => setIsLogoModalOpen(true)}
              className="w-10 h-10 rounded-xl shadow-2xl border border-white/10 relative z-10 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3"
            />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tighter uppercase italic text-white leading-none">
              SLIDE<span className="text-indigo-400">MΛTE</span>
            </h1>
            <span className="text-[8px] font-bold tracking-[0.3em] text-slate-500 uppercase">AI Study Hub</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end hidden md:flex">
                <span className="text-xs font-bold text-slate-300">
                  {user.displayName}
                </span>
                <span className="text-[10px] text-indigo-400/80 font-medium">Premium Member</span>
              </div>
              <button
                onClick={async () => await logout()}
                className="text-[10px] sm:text-xs glass hover:bg-white/10 px-3 sm:px-4 py-2 rounded-xl transition-all font-bold text-white uppercase tracking-wider"
              >
                Sign Out
              </button>
              {user.photoURL && <img src={user.photoURL} className="w-8 h-8 rounded-full border-2 border-indigo-500/30 shadow-lg shadow-indigo-500/20" />}
            </div>
          )}
        </div>
      </nav>


      <main className="max-w-7xl mx-auto p-4 sm:p-8 relative z-10">
        {uploadError && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-center font-bold animate-in fade-in slide-in-from-top-4 duration-300 glass">
            ⚠️ {uploadError}
          </div>
        )}

        {isUploading ? (
          <LoadingScreen progress={uploadProgress} chapterTitle={chapterTitle} />
        ) : slides.length === 0 ? (
          <div className="py-12 sm:py-24 animate-in fade-in zoom-in duration-1000">
            <div className="text-center mb-16 relative">
              {/* Decorative Blur */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 blur-[120px] rounded-full -z-10" />

              <h1 className="text-5xl sm:text-8xl font-black mb-6 tracking-tighter leading-[0.9] text-white uppercase">
                YOUR AI STUDY <br />
                <span className="text-gradient-indigo animate-float inline-block">PARTNER</span>
              </h1>
              <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto font-semibold leading-relaxed tracking-tight">
                Transform your lecture slides into <span className="text-amber-500 font-bold">interactive knowledge</span>.
                Smart analysis and exam prep, tailored <span className="text-amber-500 font-bold">for you</span>.
              </p>
            </div>

            <div className="max-w-xl mx-auto glass p-2 rounded-[2.5rem] shadow-2xl relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 blur opacity-20 rounded-[2.5rem] group-hover:opacity-40 transition-opacity" />
              <FileUpload onUpload={handleUpload} />
            </div>

            <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto opacity-50">
              {[
                { title: "Smart Extraction", desc: "No more copy-pasting." },
                { title: "Deep Analysis", desc: "Understand every detail." },
                { title: "Exam Prep", desc: "Predict what's coming." }
              ].map((f, i) => (
                <div key={i} className="text-center space-y-2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400">{f.title}</h3>
                  <p className="text-[10px] text-slate-500 font-bold">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="pt-10 space-y-4 pb-40 overflow-y-auto scroll-smooth">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
              <div>
                <button
                  onClick={resetApp}
                  className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-bold text-sm uppercase tracking-widest transition-all group"
                >
                  <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span>Back</span>
                </button>
              </div>
            </div>
            {slides.map(slide => (
              <div key={slide.id} className="snap-center">
                <SlideCard
                  slideNumber={slide.number}
                  isImportant={slide.isImportant}
                  thumbnail={slide.thumbnail}
                  onUnderstand={() => setSelectedSlide(slide)}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {selectedSlide && (
        <>
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[90]" onClick={() => setSelectedSlide(null)} />
          <ExplanationPane
            slideIds={[selectedSlide.id]}
            slideNumbers={[selectedSlide.number]}
            textContentArray={[selectedSlide.textContent || ""]}
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
