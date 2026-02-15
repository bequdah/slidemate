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
            }) => void;
            cancel: () => void;
            isPlaying: () => boolean;
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
        if (!sentencesRef.current[idx]) {
            stop();
            return;
        }

        const text = sentencesRef.current[idx];
        indexRef.current = idx;
        setCurrentIndex(idx);
        setCurrentSentence(text);

        // Check if ResponsiveVoice is available
        if (window.responsiveVoice) {
            // Select voice based on language
            const voiceName = lang === 'ar' ? 'Arabic Male' : 'US English Male';

            window.responsiveVoice.speak(text, voiceName, {
                rate: 1,
                pitch: 1,
                onstart: () => {
                    setIsPlaying(true);
                    setIsPaused(false);
                    isPlayingRef.current = true;
                },
                onend: () => {
                    if (isPlayingRef.current) {
                        playSentence(idx + 1);
                    }
                },
                onerror: () => {
                    console.error("ResponsiveVoice Error at sentence index", idx);
                    stop();
                }
            });
        } else {
            // Fallback to Web Speech API
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US';

            const voices = window.speechSynthesis.getVoices();
            const langCode = lang === 'ar' ? 'ar' : 'en';
            const preferredVoice = voices.find(v =>
                v.lang.startsWith(langCode) &&
                (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium'))
            ) || voices.find(v => v.lang.startsWith(langCode));

            if (preferredVoice) utterance.voice = preferredVoice;
            utterance.rate = 1;
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
                if (e.error === 'interrupted' || e.error === 'canceled') {
                    return;
                }
                console.error("TTS Error at sentence index", idx, e);
                stop();
            };

            window.speechSynthesis.speak(utterance);
        }
    }, [lang, stop]);

    const play = useCallback(() => {
        if (sentencesRef.current.length === 0) return;
        stop();
        playSentence(0);
    }, [playSentence, stop]);

    const pause = useCallback(() => {
        isPlayingRef.current = false;
        if (window.responsiveVoice) {
            window.responsiveVoice.cancel();
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
