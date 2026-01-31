import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import admin from 'firebase-admin';
import Groq from 'groq-sdk';
// import { GoogleGenerativeAI } from '@google/generative-ai';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// const model_gemini = genAI.getGenerativeModel({
//     model: 'gemini-1.5-flash-latest',
//     generationConfig: {
//         responseMimeType: 'application/json'
//     }
// });

type Mode = 'simple' | 'deep' | 'exam';

function buildSlideContexts(slideNumbers: number[], textContentArray?: string[]) {
    return slideNumbers
        .map((num: number, i: number) => `[SLIDE ${num}]: ${textContentArray?.[i] || 'No text'}`)
        .join('\n\n');
}

function buildSystemPrompt() {
    return `
You are an Elite University Professor AND a professional slide-content editor.
Return ONLY a valid JSON object. No markdown. No extra text.

GOAL:
- Reconstruct slide content into structured, UI-ready JSON that mirrors the slide's logical structure.
- Do NOT add new concepts beyond what is in the slide content (reasonable clarification is allowed, invention is not).

STRICT OUTPUT KEYS:
1) "explanation": structured object (ALWAYS)
2) "examInsight": structured object (ALWAYS)
- Do NOT mention the slide/image/analysis process.
- All content in "explanation", "examInsight", and "quiz" (including reasoning) MUST be in ENGLISH.

- If labels are visible, you MUST use their exact wording.

MODE RULES:

1) simple:
- Tone: student-friendly, clear, light analogies (but still correct).
- Focus: WHAT + basic HOW. Explanations must be easy to digest but NOT superficial.
- Structure: 3–4 sections max with clear headings.
- Content: Break down complex ideas into simple terms. Use bullet points for lists.
- Include sections like: "What Is This?", "How It Works", "Key Terms", "Simple Example".
- MANDATORY: The "explanation" object MUST contain "title", "overview", and "sections".
- MANDATORY: "examInsight" object MUST be present.
- MANDATORY: EXACTLY 2 easy MCQs.

2) deep:
- Tone: University professor teaching an undergraduate. High academic depth.
- Goal: Comprehensive mastery. Do not leave out any details from the provided text/image.
- Reasoning: connect concepts (WHY it happens -> WHAT it causes).
- Structure: 4–6 sections. Each section must be detailed and cover a specific aspect thoroughly.
- Do NOT summarize briefly; explain fully.
- Include sections like: Concept Overview, Detailed Analysis, Implications, Key Definitions.
- MANDATORY: EXACTLY 2 difficult MCQs.
- MANDATORY: "examInsight" object MUST be present.


3) exam:
- Do NOT generate explanation or examInsight. Return empty objects: { "sections": [] }
- Focus ONLY on creating exactly 10 hard MCQs in "quiz".
- Questions must be directly based on the slide content.
- Each question must test deep understanding, not just memorization.

JSON SCHEMA:
1) "explanation": { "title": string, "overview": string, "sections": [{ "heading": string, "bullets": string[] } OR { "heading": string, "text": string }] }
2) "examInsight": { "title": string, "overview": string, "sections": [{ "heading": string, "text": string }] }
3) "quiz": Array of objects: { "q": string, "options": [string (exactly 4)], "a": number (0-3), "reasoning": string }

LaTeX Rules:
- Use $...$ for inline and $$...$$ for block math (ALWAYS use block math for primary formulas/equations).
- JSON ESCAPING: Use double-backslashes (e.g., "\\\\frac").
- FONT STYLE: Do not use \text{} inside LaTeX unless absolutely necessary; keep symbols clean.
- Ensure all math is mathematically rigorous and professional.
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


        // CLIENTS SETUP: Initialize clients for both keys
        // Note: GROQ_API_KEY_2 must be set in Vercel environment variables
        const clients = [
            new Groq({ apiKey: process.env.GROQ_API_KEY_2 || process.env.GROQ_API_KEY })
        ];

        const LLAMA_MODEL = 'llama-3.3-70b-versatile';
        const QWEN_MODEL = 'qwen/qwen3-32b';
        // const VISION_MODEL = 'llama-3.2-11b-vision-preview'; // Specific fallback for heavy vision if needed

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

        // RETRY LOOP: 4 attempts with exponential backoff and key rotation
        for (let attempt = 0; attempt < 4; attempt++) {
            // Alternate keys per attempt: 0->primary, 1->secondary, 2->primary...
            const client = clients[attempt % clients.length];
            // TEMPORARY: Use ONLY Qwen for testing per user request
            const targetModelToUse = QWEN_MODEL;

            try {
                const key2Status = process.env.GROQ_API_KEY_2 ? "Detected" : "MISSING";
                console.log(`Attempt ${attempt + 1}/4 | Model: ${targetModelToUse} | Key: ${attempt % clients.length === 0 ? 'Primary' : 'Secondary'} | Key2 Status: ${key2Status}`);

                const isVision = isVisionRequest(thumbnail);
                const preparedMessages = coerceMessagesForModel(messages, isVision);

                const completion = await client.chat.completions.create({
                    model: targetModelToUse,
                    messages: preparedMessages,
                    temperature: 0.1,
                    response_format: { type: 'json_object' },
                    max_tokens: 2500
                });

                const raw = completion.choices[0]?.message?.content || '';

                if (!raw.trim().startsWith('{')) {
                    throw new Error('MODEL_RETURNED_NON_JSON');
                }

                let parsed: any;
                try {
                    parsed = JSON.parse(raw);
                } catch {
                    throw new Error('JSON_PARSE_FAILED');
                }

                if (!validateResultShape(parsed, resolvedMode)) {
                    throw new Error('INVALID_SHAPE');
                }

                // SUCCESS: Log and update DB
                console.log(`Success on attempt ${attempt + 1}`);

                await updateUsage(uid, today, (userRef as any));

                res.status(200).json(parsed);
                return;

            } catch (err: any) {
                console.warn(`Attempt ${attempt + 1} failed: ${err?.message}`);
                lastError = err;

                if (!isRetryable(err) && err?.message !== 'MODEL_RETURNED_NON_JSON' && err?.message !== 'INVALID_SHAPE') {
                    // Critical non-retryable error (like auth failure not related to rate limit)
                    break;
                }

                // Exponential backoff: 700ms, 1400ms, 2100ms...
                if (attempt < 3) {
                    await sleep(700 * (attempt + 1));
                }
            }
        }

        // FAILURE after all retries
        res.status(503).json({
            error: 'System busy. Please retry in a moment.',
            details: String(lastError?.message || lastError)
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
