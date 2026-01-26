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
Your goal is to provide high-level academic insights tailored to the student's needs.

CRITICAL INSTRUCTIONS:
1. RETURN ONLY VALID JSON. No preamble, no markdown.
2. Structure: {
    "explanation": "Markdown string (### Topics). Split into 2-4 distinct topics. Use bold for key terms. Use LaTeX for math.",
    "examInsight": "Markdown string. 3-4 bullet points using '-'. Predict tricky professor questions.",
    "arabic": {
        "explanation": "Professional Arabic version of the explanation. MUST follow '### اسم الموضوع' structure.",
        "examInsight": "Arabic version as a bulleted list."
    },
    "quiz": [
        { "q": "Question text?", "options": ["A", "B", "C", "D"], "a": 0, "reasoning": "Academic explanation for the answer." }
    ]
}

3. STYLE MODES:
   - 'simple': Use layman's terms, catchy analogies, and focus on the "big picture". Avoid over-complex jargon.
   - 'deep': Focus on theoretical foundations, mathematical proofs, and complex connections to other concepts. Use technical language.
   - 'exam': Focus on definitions, edge cases, and "must-know" facts. MUST provide 10 HIGH-QUALITY MULTIPLE CHOICE QUESTIONS (Medium to Hard difficulty).

4. MATH: Always wrap math in single $ for inline or double $$ for blocks. Example: $I(x,y)$.`;

        const userPrompt = isMulti ? `
            CONTEXT: Multiple slides from a lecture.
            SLIDES CONTENT:
            ${slideContexts}
            
            MODE: ${mode}
            
            TASK: 
            - If mode is 'simple', use easy analogies.
            - If mode is 'deep', provide deep theoretical synthesis.
            - If mode is 'exam', focus on testable points and PROVIDE EXACTLY 10 MCQS (Medium/Hard).
            
            OUTPUT: Provide the JSON structure as requested.` : `
            CONTEXT: Slide ${slideNumbers[0]} from a lecture.
            CONTENT:
            ${textContentArray?.[0] || ""}
            
            MODE: ${mode}
            
            TASK:
            - If mode is 'simple', use easy analogies and simple language.
            - If mode is 'deep', perform a rigorous academic analysis with technical depth.
            - If mode is 'exam', focus on strict definitions and PROVIDE EXACTLY 10 MCQS (Medium/Hard).
            
            OUTPUT: Provide the JSON structure as requested.
        `;

        const messages: any[] = [{ role: "system", content: systemPrompt }];

        messages.push({ role: "user", content: userPrompt });

        const completion = await groq.chat.completions.create({
            messages,
            model: model,
            temperature: mode === 'simple' ? 0.7 : 0.4, // Higher creativity for analogies in simple mode
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
