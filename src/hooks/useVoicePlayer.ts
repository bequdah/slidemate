import { useState, useRef, useEffect, useCallback } from 'react';

// Tiny silent WAV for iOS unlock (must be valid audio)
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

export const useVoicePlayer = (scriptText: string | undefined, lang: 'en' | 'ar') => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [currentSentence, setCurrentSentence] = useState('');
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [isLoadingAudio, setIsLoadingAudio] = useState(false);

    const sentencesRef = useRef<string[]>([]);
    const indexRef = useRef(-1);
    const isPlayingRef = useRef(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const blobUrlRef = useRef<string | null>(null);

    // Split script into sentences
    useEffect(() => {
        if (!scriptText) {
            sentencesRef.current = [];
            return;
        }
        const split = scriptText.split(/(?<=[.!?؟])\s*|\n+/).filter(s => s.trim().length > 0);
        sentencesRef.current = split;
    }, [scriptText]);

    const getTtsLang = useCallback(() => {
        return lang === 'ar' ? 'ar' : 'en-US';
    }, [lang]);

    // Cleanup blob URL to prevent memory leaks
    const revokeBlobUrl = useCallback(() => {
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
    }, []);

    const stop = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.removeAttribute('src');
            audioRef.current.load(); // Reset the element fully
        }
        revokeBlobUrl();
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentSentence('');
        setCurrentIndex(-1);
        indexRef.current = -1;
        isPlayingRef.current = false;
        setIsLoadingAudio(false);
    }, [revokeBlobUrl]);

    // Fetch TTS audio as a blob URL
    const fetchTtsBlob = useCallback(async (text: string): Promise<string> => {
        const ttsLang = getTtsLang();
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, lang: ttsLang })
        });
        if (!response.ok) throw new Error('TTS fetch failed');
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    }, [getTtsLang]);

    const playSentence = useCallback(async (idx: number) => {
        if (!isPlayingRef.current) return;

        // End of script
        if (idx >= sentencesRef.current.length) {
            stop();
            return;
        }

        const text = sentencesRef.current[idx]?.trim();
        if (!text) {
            // Skip empty, go next
            playSentence(idx + 1);
            return;
        }

        indexRef.current = idx;
        setCurrentIndex(idx);
        setCurrentSentence(text);
        setIsLoadingAudio(true);

        try {
            // Cleanup previous blob
            revokeBlobUrl();

            const url = await fetchTtsBlob(text);
            blobUrlRef.current = url;

            // Check again if still playing (user may have stopped during fetch)
            if (!isPlayingRef.current) {
                URL.revokeObjectURL(url);
                blobUrlRef.current = null;
                return;
            }

            const audio = audioRef.current;
            if (!audio) return;

            audio.src = url;
            audio.playbackRate = 1.0;

            audio.onended = () => {
                revokeBlobUrl();
                if (isPlayingRef.current) {
                    playSentence(idx + 1);
                }
            };

            audio.onerror = () => {
                console.error("Audio playback error at sentence", idx);
                revokeBlobUrl();
                if (isPlayingRef.current) playSentence(idx + 1);
            };

            await audio.play();
            setIsLoadingAudio(false);
            setIsPlaying(true);
            setIsPaused(false);
        } catch (err) {
            console.error("Play Error:", err);
            revokeBlobUrl();
            setIsLoadingAudio(false);
            if (isPlayingRef.current) {
                playSentence(idx + 1);
            }
        }
    }, [stop, fetchTtsBlob, revokeBlobUrl]);

    /**
     * iOS FIX: The entire trick is that we call audio.play() on the SAME
     * HTMLAudioElement synchronously inside the click handler. Once iOS
     * sees a successful .play() from a user gesture, that specific Audio
     * element is "unlocked" for the rest of the session — even if we
     * later swap src to a blob URL.
     *
     * Flow:
     * 1. User taps "AI Voice"  →  we immediately do audio.play() on a
     *    tiny silent WAV  →  iOS marks this Audio element as trusted.
     * 2. When the silent WAV ends (< 50 ms), we fetch the real TTS and
     *    swap src on the SAME element  →  iOS allows it because the
     *    element was already unlocked.
     */
    const play = useCallback(() => {
        if (sentencesRef.current.length === 0) return;
        if (isPlayingRef.current && !isPaused) return;

        // Ensure we have an Audio element
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }

        // RESUME from pause
        if (isPaused && audioRef.current) {
            setIsPaused(false);
            isPlayingRef.current = true;
            audioRef.current.play().catch(() => { });
            return;
        }

        // FRESH START
        stop();
        isPlayingRef.current = true;

        if (!audioRef.current) {
            audioRef.current = new Audio();
        }

        const audio = audioRef.current;

        // Step 1: Play silent WAV immediately in the user gesture context
        audio.src = SILENT_WAV;
        audio.volume = 0.01; // Nearly silent

        const startPlayback = () => {
            audio.volume = 1.0;
            audio.onended = null;
            playSentence(0);
        };

        // When the silent clip ends, start the real playback
        audio.onended = startPlayback;

        // Also set a timeout as fallback in case onended doesn't fire
        const fallbackTimer = setTimeout(() => {
            if (isPlayingRef.current && indexRef.current === -1) {
                startPlayback();
            }
        }, 300);

        audio.play().catch((e) => {
            console.warn("iOS audio unlock failed:", e);
            clearTimeout(fallbackTimer);
            // Last resort: try starting anyway (works on non-iOS)
            audio.volume = 1.0;
            playSentence(0);
        });
    }, [playSentence, stop, isPaused]);

    const pause = useCallback(() => {
        if (!isPlayingRef.current || isPaused) return;
        if (audioRef.current) {
            audioRef.current.pause();
        }
        setIsPaused(true);
    }, [isPaused]);

    const resume = useCallback(() => {
        if (!isPaused || !audioRef.current) return;
        setIsPaused(false);
        isPlayingRef.current = true;
        audioRef.current.play().catch(() => { });
    }, [isPaused]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            revokeBlobUrl();
        };
    }, [revokeBlobUrl]);

    const initAudio = useCallback(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }
        audioRef.current.src = SILENT_WAV;
        audioRef.current.play().catch(e => console.log("Audio pre-unlock skipped", e));
    }, []);

    return {
        isPlaying,
        isPaused,
        isLoadingAudio,
        currentSentence,
        currentIndex,
        play,
        pause,
        resume,
        stop,
        initAudio,
        totalSentences: sentencesRef.current.length
    };
};
