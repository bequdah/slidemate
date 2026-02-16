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
        // Split strictly by major sentence enders as requested
        const split = scriptText.split(/(?<=[.!?؟])\s*|\n+/).filter(s => s.trim().length > 0);
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
                playSentence(idx + 1);
            }
        };

        // Check if ResponsiveVoice is available
        if (window.responsiveVoice) {
            const voiceName = lang === 'ar' ? 'UK English Female' : 'US English Female';

            // Very Tight Safety Margin: 400ms per word + 500ms total buffer
            // This prevents the 5-second "dead air" issue.
            const wordCount = text.split(/\s+/).length;
            const estimatedDurationMs = (wordCount * 400) + 500;

            window.responsiveVoice.speak(text, voiceName, {
                rate: 1,
                pitch: 1,
                volume: 1,
                onstart: () => {
                    setIsPlaying(true);
                    setIsPaused(false);
                    isPlayingRef.current = true;

                    // Start tight trigger to move to next if voice engine hangs
                    timeoutRef.current = setTimeout(() => {
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
        // Set this to false so 'next' doesn't advance to the next sentence
        isPlayingRef.current = false;

        if (window.responsiveVoice) {
            window.responsiveVoice.cancel();
        } else {
            window.speechSynthesis.cancel();
        }
        setIsPaused(true);
        // IMPORTANT: We do NOT call setIsPlaying(false) here because we want 
        // the transcription bubble to stay visible while paused.
    }, []);

    const resume = useCallback(() => {
        if (indexRef.current === -1) return;
        setIsPaused(false);
        // Restart the current sentence from the beginning as requested
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
