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

        // 5. Build Prompts
        const isMulti = slideNumbers.length > 1;
        const slideContexts = slideNumbers.map((num: number, i: number) => `[SLIDE ${num}]: ${textContentArray?.[i] || "No text"}`).join('\n\n');

        const systemPrompt = `You are an elite University Professor.
Follow these rules strictly:
1. JSON ONLY. No text before or after.
2. Structure: {
    "explanation": "### Topic 1\n...\n### Topic 2\n...",
    "examInsight": "Point 1\n- Point 2...",
    "arabic": { 
        "explanation": "Professional Arabic (### Heading structure)", 
        "examInsight": "Arabic bullet points" 
    },
    "quiz": [ 
        { "q": "...", "options": ["A","B","C","D"], "a": 0, "reasoning": "..." } 
    ]
}
3. MODE CONTENT RULES:
   - 'simple': Return DETAILED EXPLANATION + 3-4 INSIGHT POINTS + EXACTLY 2 MCQs. Focus on analogies.
   - 'deep': Return DETAILED EXPLANATION + 3-4 INSIGHT POINTS + EXACTLY 2 MCQs. Focus on theory.
   - 'exam': Return explanation: "" and examInsight: "". RETURN EXACTLY 10 DIFFICULT MCQ QUESTIONS in "quiz".
4. MATH RENDERING (STRICT):
   - Use LaTeX for ALL variables and math.
   - Use SINGLE $ for inline math ($f(x)$).
   - Use DOUBLE $$ for block math ($$\\frac{a}{b}$$).
   - Use DOUBLE BACKSLASHES for all LaTeX commands in JSON (\\\\frac).`;

        const userPrompt = `
            CONTENT: ${isMulti ? slideContexts : (textContentArray?.[0] || "")}
            MODE: ${mode.toUpperCase()}
            
            STRICT INSTRUCTIONS FOR ${mode.toUpperCase()}:
            ${mode === 'exam'
                ? "-> YOU MUST PROVIDE EXACTLY 10 HARD MCQs. Set explanation to '' and examInsight to ''."
                : "-> PROVIDE A DETAILED EXPLANATION, EXAM INSIGHTS, AND EXACTLY 2 MEDIUM MCQs."
            }
            - All math MUST be perfectly formatted with \\\\ commands.
        `;

        // 6. Model Selection & Routing
        let targetModels = [
            "llama-3.3-70b-versatile",
            "mixtral-8x7b-32768",
            "llama-3-8b-8192"
        ];

        let messages: any[] = [{ role: "system", content: systemPrompt }];

        // Check for Vision Request
        if (thumbnail && thumbnail.startsWith('data:image')) {
            console.log("Vision Request Detected");
            targetModels = ["llama-3.2-11b-vision-preview", "llama-3-8b-8192"];

            // For vision, we need to restructure the prompt
            messages = [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text", text: userPrompt },
                        {
                            type: "image_url",
                            image_url: {
                                url: thumbnail, // Base64 image
                            },
                        },
                    ],
                }
            ];
        } else {
            messages.push({ role: "user", content: userPrompt });
        }

        let completion;
        let lastError;

        for (const targetModel of targetModels) {
            try {
                console.log(`Attempting analysis with ${targetModel}...`);

                // Add a timeout for the overall request if possible, 
                // but Groq SDK doesn't have a simple 'timeout' param in completions.create
                // Vercel will handle the 10s limit.

                completion = await groq.chat.completions.create({
                    messages,
                    model: targetModel,
                    temperature: 0.1,
                    response_format: { type: "json_object" }
                });
                console.log(`Success with ${targetModel}`);
                break;
            } catch (err: any) {
                lastError = err;
                console.error(`Error with ${targetModel}:`, err.message);

                // If Rate Limit (429), try next model immediately
                if (err.status === 429 || err.message?.includes("rate_limit")) {
                    continue;
                }

                // For other errors, if we have another model, try it
                if (targetModels.indexOf(targetModel) < targetModels.length - 1) {
                    continue;
                }

                throw err;
            }
        }

        if (!completion) throw lastError;

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
