import { auth } from "../firebase";

export interface SlideExplanation {
    explanation: string;
    examInsight: string;
    arabic: {
        explanation: string;
        examInsight: string;
    };
    quiz: {
        q: string;
        options: string[];
        a: number; // Index of the correct option
        reasoning: string;
    }[];
}

export type ExplanationMode = 'simple' | 'deep' | 'exam';

export const analyzeSlide = async (
    slideNumbers: number[],
    textContentArray?: string[],
    mode: ExplanationMode = 'simple',
    thumbnail?: string,
    language: 'en' | 'ar' = 'en',
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
                language
            })
        });

        if (!response.ok) {
            // If server is busy (503) and we have retries left, wait and try again
            if (response.status === 503 && attempts > 1) {
                console.warn(`Server busy (503). Retrying client-side... (${attempts - 1} left)`);
                await new Promise(r => setTimeout(r, 2000));
                return analyzeSlide(slideNumbers, textContentArray, mode, thumbnail, language, attempts - 1);
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
            arabic: { explanation: "خطأ في الاتصال", examInsight: "N/A" },
            quiz: []
        };
    }
};