import { useState, useRef, useEffect, useCallback } from 'react';

export const useVoicePlayer = (scriptText: string | undefined, lang: 'en' | 'ar') => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [currentSentence, setCurrentSentence] = useState('');
    const [currentIndex, setCurrentIndex] = useState(-1);

    const sentencesRef = useRef<string[]>([]);
    const indexRef = useRef(-1);
    const isPlayingRef = useRef(false);

    // Initial setup: split script into sentences
    useEffect(() => {
        if (!scriptText) {
            sentencesRef.current = [];
            return;
        }
        // Robust split by common sentence enders
        const split = scriptText.split(/(?<=[.!?])\s+|(?<=[،؛؟])\s+/).filter(s => s.trim().length > 0);
        sentencesRef.current = split;
    }, [scriptText]);

    const stop = useCallback(() => {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentSentence('');
        setCurrentIndex(-1);
        indexRef.current = -1;
        isPlayingRef.current = false;
    }, []);

    const playSentence = useCallback((idx: number) => {
        if (!sentencesRef.current[idx]) {
            stop();
            return;
        }

        const text = sentencesRef.current[idx];
        indexRef.current = idx;
        setCurrentIndex(idx);
        setCurrentSentence(text);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US';

        // Voice selection
        const voices = window.speechSynthesis.getVoices();
        const langCode = lang === 'ar' ? 'ar' : 'en';
        const preferredVoice = voices.find(v =>
            v.lang.startsWith(langCode) &&
            (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium'))
        ) || voices.find(v => v.lang.startsWith(langCode));

        if (preferredVoice) utterance.voice = preferredVoice;
        utterance.rate = 0.95;
        utterance.pitch = 1;

        utterance.onstart = () => {
            setIsPlaying(true);
            setIsPaused(false);
            isPlayingRef.current = true;
        };

        utterance.onend = () => {
            if (isPlayingRef.current) {
                playSentence(idx + 1);
            }
        };

        utterance.onerror = (e) => {
            console.error("TTS Error at sentence index", idx, e);
            stop();
        };

        window.speechSynthesis.speak(utterance);
    }, [lang, stop]);

    const play = useCallback(() => {
        if (sentencesRef.current.length === 0) return;
        stop(); // Always start fresh for a clean queue
        playSentence(0);
    }, [playSentence, stop]);

    const pause = useCallback(() => {
        isPlayingRef.current = false; // Prevent onend from triggering next sentence
        window.speechSynthesis.cancel();
        setIsPaused(true);
    }, []);

    const resume = useCallback(() => {
        if (indexRef.current === -1) return;
        setIsPaused(false);
        playSentence(indexRef.current);
    }, [playSentence]);


    // Cleanup on unmount
    useEffect(() => {
        return () => window.speechSynthesis.cancel();
    }, []);

    return {
        isPlaying,
        isPaused,
        currentSentence,
        currentIndex,
        play,
        pause,
        resume,
        stop,
        totalSentences: sentencesRef.current.length
    };
};
