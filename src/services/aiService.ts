import { auth } from "../firebase";

export interface SlideExplanation {
    explanation: string;
    examInsight: string;
    voiceScript: string;
    quiz: {
        q: string;
        options: string[];
        a: number;
        reasoning: string;
    }[];
    arabic: {
        explanation: any;
        examInsight: any;
        voiceScript: string;
    };
}

export interface VisionAnalysisResult {
    imageAnalysis: string;
    timestamp: string;
    success: boolean;
}

export type ExplanationMode = 'simple' | 'deep' | 'exam';

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
        };
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

/**
 * Analyzes slide images using BLIP-2 vision model
 * Returns detailed understanding of visual content including:
 * - Text in the image
 * - Diagrams and charts
 * - Tables and their structure
 * - Visual elements and layouts
 */
export const analyzeSlideImage = async (
    imageData: string,
    customPrompt?: string,
    attempts: number = 2
): Promise<VisionAnalysisResult> => {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Please log in to use AI analysis.");

        const token = await user.getIdToken();

        const response = await fetch('/api/analyzeImage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                imageData,
                prompt: customPrompt || 'Describe this image in detail. Include any text, diagrams, tables, mathematical equations, and visual elements. For tables, format them as markdown. For diagrams, describe their structure and relationships.'
            })
        });

        if (!response.ok) {
            // Retry on server busy
            if (response.status === 503 && attempts > 1) {
                console.warn(`Vision API busy (503). Retrying... (${attempts - 1} left)`);
                await new Promise(r => setTimeout(r, 2000));
                return analyzeSlideImage(imageData, customPrompt, attempts - 1);
            }

            let errorMessage = "Failed to analyze image";
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
        console.error("Vision Analysis Error:", error);
        return {
            success: false,
            imageAnalysis: `Error analyzing image: ${error.message || 'Unknown error'}`,
            timestamp: new Date().toISOString()
        };
    }
};
