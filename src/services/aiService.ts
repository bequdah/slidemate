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

/**
 * Optimizes a base64 image string by resizing it to a maximum dimension
 * and reducing its quality. This helps avoid Vercel payload limits and timeouts.
 */
const optimizeImage = (base64: string, maxDim: number = 800): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDim) {
                    height *= maxDim / width;
                    width = maxDim;
                }
            } else {
                if (height > maxDim) {
                    width *= maxDim / height;
                    height = maxDim;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compress to JPEG with 70% quality
        };
        img.onerror = () => resolve(base64); // Fallback to original if error
        img.src = base64;
    });
};

export const analyzeSlide = async (
    slideNumbers: number[],
    textContentArray?: string[],
    mode: ExplanationMode = 'simple',
    thumbnail?: string,
    attempts: number = 2 // Client-side retries
): Promise<SlideExplanation> => {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Please log in to use AI analysis.");

        const token = await user.getIdToken();

        // Optimize thumbnail if present
        let optimizedThumbnail = thumbnail;
        if (thumbnail && thumbnail.startsWith('data:image')) {
            optimizedThumbnail = await optimizeImage(thumbnail);
        }

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
                thumbnail: optimizedThumbnail
            })
        });

        if (!response.ok) {
            // If server is busy (503) and we have retries left, wait and try again
            if (response.status === 503 && attempts > 1) {
                console.warn(`Server busy (503). Retrying client-side... (${attempts - 1} left)`);
                await new Promise(r => setTimeout(r, 2000));
                return analyzeSlide(slideNumbers, textContentArray, mode, thumbnail, attempts - 1);
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