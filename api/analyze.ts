import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

const geminiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
const genAI = new GoogleGenerativeAI(geminiKey);
const model_gemini = genAI.getGenerativeModel({
    model: 'gemma-3-27b-it'
});

type Mode = 'simple' | 'deep' | 'exam';

function buildSlideContexts(slideNumbers: number[], textContentArray?: string[]) {
    return slideNumbers
        .map((num: number, i: number) => `[SLIDE ${num}]: ${textContentArray?.[i] || 'No text'}`)
        .join('\n\n');
}

function buildSystemPrompt() {
    return `
You are an Elite University Professor. Return ONLY a valid JSON object. No extra text.

GOAL:
- Reconstruct slide content into structured JSON.
- Do NOT add new concepts (reasonable clarification only).

STRICT OUTPUT KEYS:
1) "explanation": { "title", "overview", "sections" }
2) "examInsight": { "title", "overview", "sections" }
3) "quiz": Array of MCQs

MODE RULES:
- simple: 3-4 concise sections, easy language. 2 easy MCQs.
- deep: 4-6 detailed sections, academic depth. 2 hard MCQs.
- exam: Empty explanation/examInsight. Exactly 10 hard MCQs.

JSON SCHEMA:
- explanation: { "title": string, "overview": string, "sections": [{ "heading": string, "bullets": string[] } | { "heading": string, "text": string }] }
- examInsight: { "title": string, "overview": string, "sections": [{ "heading": string, "text": string }] }
- quiz: [{ "q": string, "options": [string (4)], "a": number (0-3), "reasoning": string }]

LaTeX: $...$ for inline, $$...$$ for block. Use \\\\frac. English ONLY.
`;
}

function requiredQuizCount(mode: Mode) {
    return mode === 'exam' ? 10 : 2;
}

function isVisionRequest(thumbnail?: string) {
    return !!thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('data:image');
}

function coerceMessagesForModel(messages: any[], isVisionModel: boolean) {
    return messages.map(m => {
        if (!isVisionModel && Array.isArray(m.content)) {
            const textPart = m.content.find((p: any) => p.type === 'text');
            return { ...m, content: textPart ? textPart.text : '' };
        }
        return m;
    });
}

function isStructuredObject(x: any) {
    return x && typeof x === 'object' && !Array.isArray(x);
}

function validateResultShape(result: any, mode: Mode) {
    if (!result || typeof result !== 'object') {
        console.warn("Validation Failed: Result is not an object");
        return false;
    }

    // quiz must exist and have correct count
    if (!Array.isArray(result.quiz)) {
        console.warn("Validation Failed: 'quiz' is not an array");
        return false;
    }

    const requiredCount = requiredQuizCount(mode);
    if (result.quiz.length !== requiredCount) {
        console.warn(`Validation Failed: Quiz length is ${result.quiz.length}, expected ${requiredCount}`);
        return false;
    }

    // Validate MCQ options strictness
    for (let i = 0; i < result.quiz.length; i++) {
        const q = result.quiz[i];
        if (!Array.isArray(q.options) || q.options.length !== 4) {
            console.warn(`Validation Failed: Question ${i} does not have exactly 4 options`);
            return false;
        }
        if (typeof q.a !== 'number' || q.a < 0 || q.a > 3) {
            console.warn(`Validation Failed: Question ${i} has invalid correct answer index (a): ${q.a}`);
            return false;
        }
    }

    if (mode !== 'exam') {
        if (!isStructuredObject(result.explanation)) {
            console.warn("Validation Failed: 'explanation' is missing or not an object");
            return false;
        }
        if (!isStructuredObject(result.examInsight)) {
            console.warn("Validation Failed: 'examInsight' is missing or not an object");
            return false;
        }
    }

    return true;
}


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
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized: Missing Token' });
            return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const today = new Date().toISOString().split('T')[0];
        const userRef = db.collection('users').doc(uid);

        const userDoc = await userRef.get();
        const userData = userDoc.data() || {};
        const usage = userData.dailyUsage || { date: today, count: 0 };

        if (usage.date === today && usage.count >= 200) {
            res.status(429).json({ error: 'Daily limit reached (200/200)' });
            return;
        }

        const { slideNumbers, textContentArray, mode, thumbnail } = req.body as {
            slideNumbers: number[];
            textContentArray?: string[];
            mode?: Mode;
            thumbnail?: string;
        };

        const resolvedMode: Mode = mode || 'simple';

        // Block analysis if no text content is provided (Vision is disabled)
        const combinedText = (textContentArray || []).join(' ').trim();
        if (!combinedText) {
            return res.status(200).json({
                explanation: { title: "Image-only Slide", overview: "This slide contains only an image. Please use text-based slides for analysis.", sections: [] },
                examInsight: { title: "Exam Insight", overview: "No text found to analyze.", sections: [] },
                quiz: [],
                note: "Image-only slides are currently not supported. Please upload slides with text content."
            });
        }

        const isMulti = Array.isArray(slideNumbers) && slideNumbers.length > 1;
        const slideContexts = isMulti
            ? buildSlideContexts(slideNumbers, textContentArray)
            : (textContentArray?.[0] || '');

        const systemPrompt = buildSystemPrompt();

        let userPrompt = `
CONTENT (TEXT MAY BE EMPTY):
${slideContexts || ''}

VISION/CONTEXT RULE:
- If visual content is weak, USE THE PROVIDED TEXT CONTENT to generate the explanation.
- ONLY return empty sections if BOTH image and text are insufficient.
- DO NOT explain abstract concepts, variables, or general relationships unless explicitly present in the text.
- DO NOT use placeholders like "Variable A / Variable B".

MODE: ${resolvedMode.toUpperCase()}
REMINDER:
- You MUST follow ${resolvedMode.toUpperCase()} rules.
- You MUST follow the JSON SCHEMA exactly.
- Return EXACTLY ${requiredQuizCount(resolvedMode)} MCQs in the quiz array.
`;

        if (resolvedMode !== 'exam') {
            userPrompt += `
- explanation/examInsight rules per mode must be respected.
`;
        } else {
            userPrompt += `
- DO NOT generate explanation or examInsight.
- Output ONLY the quiz array.
`;
        }


        // STRATEGY: Use ONLY the smartest model (70b).
        // We list it multiple times to act as "retries" in case of a random network glitch or bad output.
        // We DO NOT fallback to dumber models (8b/Mixtral) to preserve quality.
        let messages: any[] = [{ role: 'system', content: systemPrompt }];
        messages.push({ role: 'user', content: userPrompt });




        const isRetryable = (err: any) => {
            const msg = String(err?.message || '').toLowerCase();
            return (
                err?.status === 503 ||
                err?.status === 429 ||
                msg.includes('system is busy') ||
                msg.includes('service unavailable') ||
                msg.includes('rate limit') ||
                msg.includes('rate_limit')
            );
        };

        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

        let lastError: any = null;
        let errorDetails: string[] = [];

        // Validation: Check if we have at least one valid key
        const hasGeminiKey = !!(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY);

        if (!hasGeminiKey) {
            console.error("CRITICAL: No Gemini API key found in environment variables.");
            return res.status(500).json({ error: "Service configuration error: Missing API keys." });
        }

        // RETRY LOOP: 4 attempts with exponential backoff
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                if (!hasGeminiKey) {
                    throw new Error("GEMINI_API_KEY_MISSING");
                }

                console.log(`Attempt ${attempt + 1}/4 | Model: gemma-3-27b-it (Google AI SDK)`);
                const prompt = systemPrompt + "\n\n" + userPrompt;
                const result = await model_gemini.generateContent(prompt);
                const response = await result.response;
                const raw = response.text();

                let parsed: any;
                try {
                    const jsonMatch = raw.match(/\{[\s\S]*\}/);
                    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
                } catch (e: any) {
                    console.error("Gemma JSON Parse Error. Raw response:", raw.substring(0, 200));
                    throw new Error(`GEMMA_JSON_PARSE_FAILED: ${e.message}`);
                }

                if (!validateResultShape(parsed, resolvedMode)) {
                    throw new Error('GEMMA_INVALID_SHAPE');
                }

                await updateUsage(uid, today, (userRef as any));
                res.status(200).json(parsed);
                return;
            } catch (err: any) {
                console.warn(`[Gemma] Attempt ${attempt + 1} failed: ${err?.message}`);
                lastError = err;
                errorDetails.push(`Gemma: ${err?.message}`);

                if (!isRetryable(err) && !err?.message?.includes('JSON') && !err?.message?.includes('SHAPE') && !err?.message?.includes('MISSING')) {
                    break;
                }

                if (attempt < 3) {
                    await sleep(700 * (attempt + 1));
                }
            }
        }

        // FAILURE after all retries
        res.status(503).json({
            error: 'System busy. Please retry in a moment.',
            details: errorDetails.join(" | ")
        });
    } catch (error: any) {
        console.error('API Error:', error);
        if (error?.message === 'RATE_LIMIT_EXCEEDED') {
            res.status(429).json({ error: 'Daily limit reached (200/200)' });
        } else {
            res.status(500).json({ error: error?.message || 'Server error' });
        }
    }
}

async function updateUsage(uid: string, today: string, userRef: admin.firestore.DocumentReference) {
    await db.runTransaction(async t => {
        const docSnapshot = await t.get(userRef);
        const data = docSnapshot.data() || {};
        const currentUsage = (data as any).dailyUsage || { date: today, count: 0 };

        if (currentUsage.date !== today) {
            currentUsage.date = today;
            currentUsage.count = 1;
        } else {
            currentUsage.count++;
        }

        t.set(userRef, { dailyUsage: currentUsage }, { merge: true });
    });
}
