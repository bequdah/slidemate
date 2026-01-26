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

        // 3. Rate Limiting (50 requests per day)
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

            if (usage.count >= 50) {
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

        const systemPrompt = `You are an elite University Professor.
Follow these rules strictly:
1. JSON ONLY. No text before or after.
2. Structure: {
    "explanation": "### Topic 1\n...\n### Topic 2\n...",
    "examInsight": "ONLY for EXAM mode: - Point 1\n- Point 2...",
    "arabic": { 
        "explanation": "Professional Arabic (### Heading structure)", 
        "examInsight": "Arabic bullet points (EXAM mode only)" 
    },
    "quiz": [ 
        { "q": "...", "options": ["A","B","C","D"], "a": 0, "reasoning": "..." } 
    ]
}
3. MODE CONTENT RULES:
   - 'simple': Return quiz: [] and examInsight: "". Focus on analogies.
   - 'deep': Return quiz: [] and examInsight: "". Focus on deep theory.
   - 'exam': YOU MUST RETURN EXACTLY 10 MCQ QUESTIONS in "quiz" and 3-4 points in "examInsight".
4. MATH RENDERING (STRICT):
   - Use LaTeX for ALL variables and math.
   - Use SINGLE $ for inline math: e.g., $f(x)$.
   - Use DOUBLE $$ for block math: e.g., $$\\frac{a}{b}$$.
   - IMPORTANT: In your JSON response, ALWAYS use DOUBLE BACKSLASHES for LaTeX commands (e.g., Use \\\\frac instead of \\frac) to avoid escaping errors.`;

        const userPrompt = `
            CONTENT: ${isMulti ? slideContexts : (textContentArray?.[0] || "")}
            MODE: ${mode.toUpperCase()}
            
            INSTRUCTIONS:
            - If MODE is EXAM: Provide EXACTLY 10 DIFFICULT QUESTIONS and EXAM INSIGHTS.
            - If MODE is SIMPLE/DEEP: Provide 0 QUESTIONS (quiz: []) and 0 INSIGHTS (examInsight: "").
            - Ensure math formulas are perfect with \\\\ commands.
        `;

        const messages: any[] = [{ role: "system", content: systemPrompt }];
        messages.push({ role: "user", content: userPrompt });

        const completion = await groq.chat.completions.create({
            messages,
            model: model,
            temperature: 0.1, // Fixed low temperature for strict JSON and formatting
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(completion.choices[0]?.message?.content || "{}");

        res.status(200).json(result);

    } catch (error: any) {
        console.error('API Error:', error);
        if (error.message === "RATE_LIMIT_EXCEEDED") {
            res.status(429).json({ error: "Daily limit reached (50/50)" });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
}
