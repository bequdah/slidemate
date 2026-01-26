import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import Groq from 'groq-sdk';

// Initialize Groq (Server-side key)
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        // 2. Auth Verification
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized: Missing Token' });
            return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // 3. Rate Limiting (10 requests per day)
        const today = new Date().toISOString().split('T')[0];
        const userRef = db.collection('users').doc(uid);

        await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            const data = doc.data() || {};
            const usage = data.dailyUsage || { date: today, count: 0 };

            if (usage.date !== today) {
                // Reset for new day
                usage.date = today;
                usage.count = 0;
            }

            if (usage.count >= 10) {
                throw new Error("RATE_LIMIT_EXCEEDED");
            }

            usage.count++;
            t.set(userRef, { dailyUsage: usage }, { merge: true });
        });

        // 4. Parse Body
        const { slideNumbers, textContentArray, mode, thumbnail } = req.body;

        // 5. Call AI (Logic from aiService.ts)
        const isMulti = slideNumbers.length > 1;
        const model = (!!thumbnail && !isMulti) ? "meta-llama/llama-3.2-11b-vision-preview" : "llama-3.3-70b-versatile"; // Use Vision model if image present

        const slideContexts = slideNumbers.map((num: number, i: number) => `[SLIDE ${num}]: ${textContentArray?.[i] || "No text"}`).join('\n\n');

        const systemPrompt = `You are an expert university Professor. 
CRITICAL: You MUST return ONLY a valid JSON object. Start with { and end with }.
NO text before or after the JSON. NO markdown code blocks.`;

        const userPrompt = isMulti ? `
            Analyze these slides and create a connected synthesis.
            SLIDES: ${slideContexts}
            MODE: ${mode}
            Return proper JSON with explanation, examInsight, arabic, and quiz.
        ` : `
            Analyze this slide (Slide ${slideNumbers[0]}):
            ${textContentArray?.[0] || ""}
            MODE: ${mode}
            Return proper JSON with explanation, examInsight, arabic, and quiz.
        `;

        const messages: any[] = [{ role: "system", content: systemPrompt }];

        // Just handling text for now to keep this robust, or pass image URL if public.
        // For simplicity in V1, we'll stick to text-heavy logical analysis unless we have a public URL.
        // Note: thumbnail sent from client is dataURL, which can be huge. 
        // Best practice: Store image in Firebase Storage -> Send signed URL to AI. 
        // For now, let's rely on text extraction which is already robust.

        messages.push({ role: "user", content: userPrompt });

        const completion = await groq.chat.completions.create({
            messages,
            model: model,
            temperature: 0.5,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(completion.choices[0]?.message?.content || "{}");

        res.status(200).json(result);

    } catch (error: any) {
        console.error('API Error:', error);
        if (error.message === "RATE_LIMIT_EXCEEDED") {
            res.status(429).json({ error: "Daily limit reached (10/10)" });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
}
