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
    thumbnail?: string
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
                thumbnail // Should probably optimize this to not send huge base64
            })
        });

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error("Daily limit reached (50 free requests/day). Come back tomorrow!");
            }
            const error = await response.json();
            throw new Error(error.error || "Failed to analyze");
        }

        return await response.json();
    } catch (error: any) {
        console.error("Analysis Error:", error);

        let errorMessage = "Connection failed";
        if (error.message.includes("limit")) errorMessage = error.message;
        else if (error.message.includes("log in")) errorMessage = error.message;

        return {
            explanation: `Error: ${errorMessage}`,
            examInsight: "N/A",
            arabic: { explanation: "خطأ في الاتصال", examInsight: "N/A" },
            quiz: []
        };
    }
};