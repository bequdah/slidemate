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
        const model = "llama-3.3-70b-versatile"; // Use a stable supported model

        const slideContexts = slideNumbers.map((num: number, i: number) => `[SLIDE ${num}]: ${textContentArray?.[i] || "No text"}`).join('\n\n');

        const systemPrompt = `You are an elite University Professor and Subject Matter Expert.
Your goal is to provide high-level academic insights that help students master complex concepts.

CRITICAL INSTRUCTIONS:
1. RETURN ONLY VALID JSON. No preamble, no markdown code blocks, no trailing text.
2. Structure: {
    "explanation": "Markdown string. CRITICAL: Split the explanation into 2-4 distinct topics. Each topic MUST start with '### Topic Name'. DO NOT return a single block of text. Use bold for key terms. Use LaTeX for math like $E=mc^2$.",
    "examInsight": "Markdown string. Predict what a professor would ask. Focus on tricky parts and common pitfalls.",
    "arabic": {
        "explanation": "Professional Arabic version of the explanation. MUST follow the same '### اسم الموضوع' structure.",
        "examInsight": "Arabic version of the exam insight."
    },
    "quiz": [
        { "q": "Question text?", "options": ["A", "B", "C", "D"], "a": 0, "reasoning": "Explain why A is correct using academic logic." }
    ]
}
3. LANGUAGE: Use professional, encouraging, and highly educational tone.
4. MATH: Always wrap math in single $ for inline or double $$ for blocks. Example: $I(x,y)$.`;

        const userPrompt = isMulti ? `
            CONTEXT: Multiple slides from a lecture.
            TASK: Synthesize these slides into a cohesive master explanation. Connect the dots between them.
            SLIDES CONTENT:
            ${slideContexts}
            
            MODE: ${mode} (simple: use analogies; deep: focus on theory; exam: focus on definitions and likely questions)
            
            OUTPUT: Provide the JSON structure as requested.
        ` : `
            CONTEXT: Slide ${slideNumbers[0]} from a lecture.
            CONTENT:
            ${textContentArray?.[0] || ""}
            
            MODE: ${mode}
            
            TASK: Deeply analyze this specific slide. If it contains math or code, explain it line by line.
            
            OUTPUT: Provide the JSON structure as requested.
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
