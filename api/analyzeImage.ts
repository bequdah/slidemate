import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';

type Mode = 'simple' | 'deep' | 'exam';

interface HuggingFaceResponse {
    generated_text?: string;
}

/**
 * Analyzes slide images using BLIP-2 from Hugging Face Spaces
 * Returns comprehensive understanding of visual content, tables, diagrams, etc.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        // Verify authentication token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized: Missing Token' });
            return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        await auth.verifyIdToken(idToken);

        // Get Hugging Face API token
        const huggingFaceToken = process.env.HUGGING_FACE_API_KEY || process.env.VITE_HUGGING_FACE_API_KEY || '';
        if (!huggingFaceToken) {
            console.error('Missing Hugging Face API token');
            return res.status(500).json({ error: 'Service configuration error: Missing vision API key.' });
        }

        const { imageData, prompt = 'Describe this image in detail. Include any text, diagrams, tables, and visual elements.' } = req.body as {
            imageData: string; // base64 or data URL
            prompt?: string;
        };

        if (!imageData) {
            return res.status(400).json({ error: 'Missing imageData' });
        }

        // Convert data URL to base64 if needed
        let base64Image = imageData;
        if (imageData.startsWith('data:')) {
            base64Image = imageData.split(',')[1];
        }

        // Call BLIP-2 via Hugging Face Inference API
        const visionResult = await callBLIP2(base64Image, prompt, huggingFaceToken);

        res.status(200).json({
            success: true,
            imageAnalysis: visionResult,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Vision Analysis Error:', error);
        res.status(500).json({
            error: error?.message || 'Vision analysis failed',
            details: error?.response?.data || error?.message
        });
    }
}

/**
 * Calls BLIP-2 model on Hugging Face for image understanding
 */
async function callBLIP2(
    base64Image: string,
    prompt: string,
    huggingFaceToken: string,
    maxRetries: number = 3
): Promise<string> {
    const BLIP2_API_URL = 'https://api-inference.huggingface.co/models/Salesforce/blip2-opt-6.7b';

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            console.log(`BLIP-2 Attempt ${attempt + 1}/${maxRetries}`);

            const response = await fetch(BLIP2_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${huggingFaceToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: {
                        image: base64Image,
                        question: prompt
                    },
                    // Wait for the model to be ready
                    wait_for_model: true
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.warn(`BLIP-2 API Error (${response.status}):`, errorData);

                // If model is loading or service is busy, retry
                if (response.status === 503 || response.status === 429) {
                    if (attempt < maxRetries - 1) {
                        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
                        console.log(`Waiting ${waitTime}ms before retry...`);
                        await new Promise(r => setTimeout(r, waitTime));
                        continue;
                    }
                }

                throw new Error(`BLIP-2 API Error (${response.status}): ${errorData.error || 'Unknown error'}`);
            }

            const result: HuggingFaceResponse = await response.json();
            const analysis = result.generated_text || '';

            if (!analysis) {
                throw new Error('BLIP-2 returned empty response');
            }

            return analysis;
        } catch (error: any) {
            console.error(`BLIP-2 Attempt ${attempt + 1} failed:`, error.message);

            if (attempt === maxRetries - 1) {
                throw new Error(`Vision analysis failed after ${maxRetries} attempts: ${error.message}`);
            }

            // Wait before retrying
            const waitTime = Math.pow(2, attempt) * 500;
            await new Promise(r => setTimeout(r, waitTime));
        }
    }

    throw new Error('Vision analysis failed');
}
