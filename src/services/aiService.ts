import { auth } from "../firebase";

/** Matches API response: explanation is an object (simple/exam), not a string. */
export type ExplanationContent =
    | { title?: string; overview?: string; sections?: Array<{ heading: string; bullets?: string[]; text?: string }> }
    | string;

export interface SlideExplanation {
    /** From /api/analyze: object with title, overview, sections (or string on error). */
    explanation: ExplanationContent;
    /** Optional; not returned by analyze API, reserved for future use. */
    examInsight?: string;
    /** Filled by generateVoiceScript and merged into data after analyze. */
    voiceScript?: string;
    quiz: {
        q: string;
        options: string[];
        a: number;
        reasoning: string;
    }[];
    /** Only present in error fallback. */
    arabic?: {
        explanation: string;
        examInsight?: string;
        voiceScript?: string;
    };
}

/** Must match API Mode: only 'simple' and 'exam' are supported. */
export type ExplanationMode = 'simple' | 'exam';

export const analyzeSlide = async (
    slideNumbers: number[],
    textContentArray?: string[],
    mode: ExplanationMode = 'simple',
    thumbnail?: string,
    previousTopics?: string[],
    attempts: number = 2 // Client-side retries
): Promise<SlideExplanation> => {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Please log in to use AI analysis.");

        const token = await user.getIdToken();

        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                slideNumbers,
                textContentArray,
                mode,
                thumbnail,
                previousTopics
            })
        });

        if (!response.ok) {
            // If server is busy (503) and we have retries left, wait and try again
            if (response.status === 503 && attempts > 1) {
                console.warn(`Server busy (503). Retrying client-side... (${attempts - 1} left)`);
                await new Promise(r => setTimeout(r, 2000));
                return analyzeSlide(slideNumbers, textContentArray, mode, thumbnail, previousTopics, attempts - 1);
            }

            if (response.status === 429) {
                throw new Error("Daily limit reached. Come back tomorrow!");
            }

            let errorMessage = "Failed to analyze";
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                errorMessage = `Server Error (${response.status})`;
            }
            throw new Error(errorMessage);
        }

        return await response.json();
    } catch (error: any) {
        console.error("Analysis Error:", error);

        // Don't wrap if it's already a retry call failing
        let errorMessage = error.message || "Connection failed";

        return {
            explanation: `Error: ${errorMessage}`,
            examInsight: "N/A",
            voiceScript: "",
            arabic: { explanation: "خطأ في الاتصال", examInsight: "N/A", voiceScript: "حدث خطأ، يرجى المحاولة مرة أخرى." },
            quiz: []
        } as SlideExplanation;
    }
};

export const generateVoiceScript = async (
    slideNumbers: number[],
    textContentArray?: string[]
): Promise<{ voiceScript: string }> => {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Not logged in");

        const token = await user.getIdToken();

        const response = await fetch('/api/generateVoice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                slideNumbers,
                textContentArray
            })
        });

        if (!response.ok) throw new Error("Failed to generate voice");

        return await response.json();
    } catch (error) {
        console.error("Voice Generation Error:", error);
        return { voiceScript: "Sorry, I couldn't generate the voice explanation at this time." };
    }
};

