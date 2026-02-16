import { useState, useRef, useEffect, useCallback } from 'react';

// Declare ResponsiveVoice global type
declare global {
    interface Window {
        responsiveVoice?: {
            speak: (text: string, voice: string, options?: {
                onstart?: () => void;
                onend?: () => void;
                onerror?: () => void;
                rate?: number;
                pitch?: number;
                volume?: number;
            }) => void;
            cancel: () => void;
            isPlaying: () => boolean;
            pause: () => void;
            resume: () => void;
        };
    }
}

export const useVoicePlayer = (scriptText: string | undefined, lang: 'en' | 'ar') => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [currentSentence, setCurrentSentence] = useState('');
    const [currentIndex, setCurrentIndex] = useState(-1);

    const sentencesRef = useRef<string[]>([]);
    const indexRef = useRef(-1);
    const isPlayingRef = useRef(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Initial setup: split script into sentences
    useEffect(() => {
        if (!scriptText) {
            sentencesRef.current = [];
            return;
        }
        // Split by sentence enders AND commas for better transcription sync
        const split = scriptText.split(/(?<=[.!?،؛؟])\s+|(?<=\s)و(?=\s)/).filter(s => s.trim().length > 2);
        sentencesRef.current = split;
    }, [scriptText]);

    const stop = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (window.responsiveVoice) {
            window.responsiveVoice.cancel();
        }
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentSentence('');
        setCurrentIndex(-1);
        indexRef.current = -1;
        isPlayingRef.current = false;
    }, []);

    const playSentence = useCallback((idx: number) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        if (!sentencesRef.current[idx]) {
            stop();
            return;
        }

        const text = sentencesRef.current[idx].trim();
        indexRef.current = idx;
        setCurrentIndex(idx);
        setCurrentSentence(text);

        const next = () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (isPlayingRef.current) {
                // Short break between segments for natural flow
                timeoutRef.current = setTimeout(() => playSentence(idx + 1), 50);
            }
        };

        // Check if ResponsiveVoice is available
        if (window.responsiveVoice) {
            const voiceName = lang === 'ar' ? 'UK English Female' : 'US English Female';

            // Tighten Safety Timeout: 450ms per word + 800ms buffer
            const wordCount = text.split(/\s+/).length;
            const estimatedDurationMs = (wordCount * 450) + 800;

            window.responsiveVoice.speak(text, voiceName, {
                rate: 1,
                pitch: 1,
                volume: 1,
                onstart: () => {
                    setIsPlaying(true);
                    setIsPaused(false);
                    isPlayingRef.current = true;

                    // Start tight safety timer
                    timeoutRef.current = setTimeout(() => {
                        console.warn("Sync skip: Moving to next segment.");
                        next();
                    }, estimatedDurationMs);
                },
                onend: next,
                onerror: () => {
                    console.error("Voice Error");
                    stop();
                }
            });
        } else {
            // Fallback to Web Speech API
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
            utterance.rate = 1;

            utterance.onstart = () => {
                setIsPlaying(true);
                setIsPaused(false);
                isPlayingRef.current = true;
            };

            utterance.onend = next;
            utterance.onerror = stop;

            window.speechSynthesis.speak(utterance);
        }
    }, [lang, stop]);

    const play = useCallback(() => {
        if (sentencesRef.current.length === 0) return;
        stop();
        playSentence(0);
    }, [playSentence, stop]);

    const pause = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        isPlayingRef.current = false;
        if (window.responsiveVoice) {
            window.responsiveVoice.cancel(); // ResponsiveVoice pause/resume is glitchy, better use cancel/restart
        } else {
            window.speechSynthesis.cancel();
        }
        setIsPaused(true);
    }, []);

    const resume = useCallback(() => {
        if (indexRef.current === -1) return;
        setIsPaused(false);
        playSentence(indexRef.current);
    }, [playSentence]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (window.responsiveVoice) {
                window.responsiveVoice.cancel();
            } else {
                window.speechSynthesis.cancel();
            }
        };
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
