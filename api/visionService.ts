// Using global fetch (available in Node 18+)

export interface VisionAnalysis {
    explanation: string;
    examInsight: string;
    label: string;
}

export const analyzeWithLLaVA = async (
    imageBuffer: Buffer,
    prompt: string,
    mode: string = 'simple'
): Promise<any> => {
    const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';

    const base64Image = imageBuffer.toString('base64');

    const systemPrompt = `You are a visual assistant for students. 
Explain the provided image/diagram in the context of: ${mode.toUpperCase()} mode.
If it's a diagram, describe its flow and key components.
If it's a chart, summarize the trends.
Return the response in a structured markdown format with headings.`;

    try {
        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llava',
                prompt: `${systemPrompt}\n\nUser Question: ${prompt}`,
                images: [base64Image],
                stream: false,
                format: 'json'
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.statusText}`);
        }

        const data: any = await response.json();
        // LLaVA might not return a perfect JSON if not forced, but 'format: json' helps in newer Ollama versions
        return JSON.parse(data.response);
    } catch (error) {
        console.error("LLaVA Inference Error:", error);
        // Fallback to text summary if JSON parsing fails
        const rawResponse = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llava',
                prompt: `${systemPrompt}\n\nUser Question: ${prompt}`,
                images: [base64Image],
                stream: false
            })
        });
        const rawData: any = await rawResponse.json();
        return {
            explanation: rawData.response,
            examInsight: "Visual analysis complete.",
            arabic: {
                explanation: "تم تحليل الصورة بنجاح.",
                examInsight: "رؤية بصرية"
            },
            quiz: []
        };
    }
};
