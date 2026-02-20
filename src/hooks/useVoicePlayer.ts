import { useState, useRef, useEffect, useCallback } from 'react';


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

    // Initial setup: split script into sentences
    useEffect(() => {
        if (!scriptText) {
            sentencesRef.current = [];
            return;
        }
        // Split strictly by major sentence enders
        const split = scriptText.split(/(?<=[.!?؟])\s*|\n+/).filter(s => s.trim().length > 0);
        sentencesRef.current = split;
    }, [scriptText]);

    const getGoogleTtsLang = useCallback(() => {
        if (lang === 'ar') return 'ar';
        return 'en-US';
    }, [lang]);

    const stop = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentSentence('');
        setCurrentIndex(-1);
        indexRef.current = -1;
        isPlayingRef.current = false;
        setIsLoadingAudio(false);
    }, []);

    const playSentence = useCallback(async (idx: number) => {
        if (!sentencesRef.current[idx] || !isPlayingRef.current) {
            if (idx >= sentencesRef.current.length) {
                stop(); // End of script
            }
            return;
        }

        const text = sentencesRef.current[idx].trim();
        indexRef.current = idx;
        setCurrentIndex(idx);
        setCurrentSentence(text);
        setIsLoadingAudio(true);

        try {
            // Fetch audio from our new API
            const ttsLang = getGoogleTtsLang();
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, lang: ttsLang })
            });

            if (!response.ok) throw new Error('TTS Failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            if (audioRef.current) {
                audioRef.current.src = url;
                audioRef.current.onended = () => {
                    URL.revokeObjectURL(url); // Cleanup memory
                    if (isPlayingRef.current) {
                        playSentence(idx + 1); // Next sentence
                    }
                };
                audioRef.current.onerror = () => {
                    console.error("Audio Error");
                    URL.revokeObjectURL(url);
                    if (isPlayingRef.current) playSentence(idx + 1); // Skip bad audio
                };

                await audioRef.current.play();
                setIsLoadingAudio(false);
                setIsPlaying(true);
                setIsPaused(false);
            }
        } catch (err) {
            console.error("Play Error:", err);
            setIsLoadingAudio(false);
            // Fallback: Skip to next sentence on error
            if (isPlayingRef.current) {
                playSentence(idx + 1);
            }
        }
    }, [lang, stop, getGoogleTtsLang]);

    const play = useCallback(() => {
        if (sentencesRef.current.length === 0) return;

        // If already playing, don't restart
        if (isPlayingRef.current && !isPaused) return;

        // Ensure we have an audio object
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }

        // If paused, just resume
        if (isPaused && audioRef.current) {
            setIsPaused(false);
            isPlayingRef.current = true;
            audioRef.current.play();
            return;
        }

        // Fresh start
        stop();
        // Re-initialize after stop cleared flags
        isPlayingRef.current = true;
        if (!audioRef.current) audioRef.current = new Audio();

        // Unlock for iOS/Safari: Play silent stub BEFORE async fetch
        audioRef.current.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        audioRef.current.play().finally(() => {
            playSentence(0);
        });
    }, [playSentence, stop, isPaused]);

    const pause = useCallback(() => {
        if (!isPlayingRef.current || isPaused) return;

        if (audioRef.current) {
            audioRef.current.pause();
        }
        setIsPaused(true);
        // We do NOT set isPlayingRef to false here, because we want to resume later
        // But we need to prevent 'onended' from triggering the next sentence instantly if it finished while pausing
        // actually, pausing audio prevents 'onended', so we are safe.
    }, [isPaused]);

    const resume = useCallback(() => {
        if (!isPaused || !audioRef.current) return;

        setIsPaused(false);
        isPlayingRef.current = true;
        audioRef.current.play();
    }, [isPaused]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const initAudio = useCallback(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }
        // Smallest possible silent WAV file to unlock iOS audio
        audioRef.current.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        audioRef.current.play().catch(e => console.log("Audio unlock skipped or failed", e));
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

