import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

const geminiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
const genAI = new GoogleGenerativeAI(geminiKey);
const model_gemma = genAI.getGenerativeModel({
    model: 'gemma-3-27b-it'
});

type Mode = 'simple' | 'exam';

function buildSlideContexts(slideNumbers: number[], textContentArray?: string[]) {
    return slideNumbers
        .map((num: number, i: number) => `[SLIDE ${num}]: ${textContentArray?.[i] || 'No text'}`)
        .join('\n\n');
}

function buildSystemPrompt() {
    return `
You are the "QudahWay Expert Tutor", a friendly, engaging Jordanian private tutor. 
Your goal is to explain complex slide content to students like a mentor/big brother, using the unique "Qudah Way" style.

STRICT RULES:
1. Return ONLY a valid JSON object. No extra text.
2. 100% FIDELITY: Every single bullet, term, and concept from the slide MUST be extracted. 
3. STRUCTURE: For EVERY point, start with the Original English Text (**Bold**), then follow with a detailed Arabic explanation.
4. LANGUAGE: Informal Jordanian Arabic (Ammiya). 
5. ABSOLUTE BAN: NEVER use "هاد" (use "هاض"), NEVER use "منيح" (use "مليح"). Also, no "متل" (use "مثل"), no "كتير" (use "كثير"), no "تانية" (use "ثانية").
6. TONE: The "QudahWay Expert" - Academic but friendly. Avoid distracting analogies (like cooking or movies) unless they are directly related to the concept. Focus on "What does this actually mean for the student?".
7. IGNORE META-DATA: Do NOT extract or explain textbook references, section numbers (e.g., "Sec. 1.1", "4.3"), page numbers, slide numbers, or administrative headers/footers. Skip them entirely.

STRICT OUTPUT KEYS:
1) "explanation": { "title", "overview", "sections" }  (Used in simple/deep)
2) "quiz": Array of MCQs (Used ONLY in exam mode)

MODE RULES:
- simple: Focus on a clear explanation. No section limits (AI decides length based on content), but sentences must be short and punchy. NO QUIZ.
- exam: Focused on "Exam strategy" and generating MCQs. Return between 2 and 8 hard MCQs depending on slide complexity. NO EXPLANATION TEXT.

JSON SCHEMA:
- explanation: { "title": string, "overview": string, "sections": [{ "heading": string, "bullets": string[] } | { "heading": string, "text": string }] }
  NOTE: "heading" = Main topic ONLY (e.g., "Tokenization") - displayed in INDIGO color
        "bullets" = Sub-points and examples (e.g., "Cut character sequence...") - displayed in YELLOW color
- quiz: [{ "q": string, "options": [string (4)], "a": number (0-3), "reasoning": string }]

LaTeX: Use $$ ... $$ (BLOCK) for formulas.
STRICT MATH RULE: Use DOUBLE BACKSLASHES (e.g., \\\\frac) to ensure backslashes are preserved in the JSON string. Formulas MUST be in English only.
Every technical variable (P, R, f, n...) MUST be wrapped in LaTeX symbols.
QUIZ RULE: All quiz questions ("q") and "options" MUST be in English ONLY. No Arabic in the quiz questions or options. "reasoning" remains in Jordanian Arabic.
`;
}

function requiredQuizCount(mode: Mode) {
    return mode === 'exam' ? 10 : 0;
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

    const requiredCount = requiredQuizCount(mode);

    // Validate quiz if required
    if (mode === 'exam') {
        if (!Array.isArray(result.quiz)) {
            console.warn("Validation Failed: 'quiz' is not an array");
            return false;
        }

        if (result.quiz.length < 2 || result.quiz.length > 8) {
            console.warn(`Validation Failed: Quiz length is ${result.quiz.length}, expected 2-8`);
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
    } else {
        // Ensure quiz is either empty array or missing for non-quiz modes
        if (result.quiz && Array.isArray(result.quiz) && result.quiz.length > 0) {
            console.warn("Validation Warning: Expected NO quiz but found some.");
            // We can allow it but ideally it should be empty
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

        const { slideNumbers, textContentArray, mode, thumbnail, previousTopics } = req.body as {
            slideNumbers: number[];
            textContentArray?: string[];
            mode?: Mode;
            thumbnail?: string;
            previousTopics?: string[];
        };

        const resolvedMode: Mode = mode || 'simple';

        const combinedText = (textContentArray || []).join(' ').trim();

        const isMulti = Array.isArray(slideNumbers) && slideNumbers.length > 1;
        const slideContexts = isMulti
            ? buildSlideContexts(slideNumbers, textContentArray)
            : (textContentArray?.[0] || '');

        const systemPrompt = buildSystemPrompt();

        const contextInfo = (previousTopics && previousTopics.length > 0)
            ? `\nPREVIOUSLY COVERED TOPICS (DO NOT RE-EXPLAIN THESE IN DETAIL):\n- ${previousTopics.join('\n- ')}\n`
            : '';

        let userPrompt = `
${contextInfo}
SLIDE CONTENT TO ANALYZE:
${slideContexts || ''}

CRITICAL "QUDAH WAY" EXTRACTION & FORMATTING:

1. **Impact-Focused Content ONLY (NO FILLER)**: 
   - Explain *only* what is on the slide. 
   - **IMAGE-TO-TEXT TASK (STRICT OCR)**: If an image is provided, your *only* job is to treat it as a source of text. 
     - 1. Perform high-accuracy OCR to extract every single word, bullet, and formula.
     - 2. Explain this extracted text exactly as you would for a PDF.
     - 3. **NEVER** mention visual elements: No "In this image", "I see a diagram", "the blue box", or "this screenshot". 
     - 4. **indistinguishable from PDF**: The user should not know if the input was a PDF page or a screenshot. 
   - **SKIP META-DATA**: Ignore section numbers like "Sec. 1.1", "4.3", page numbers, or textbook references.
   - **NO CLOSING REMARKS**: Stop writing immediately after the last point is explained. 
   - Keep it short: Maximum 2 punchy sentences per point.
2. **LISTS, STEPS & PROCESSES (CRITICAL)**:
   - **NEVER SUMMARIZE A LIST**: If the slide has a numbered list (1, 2, 3...) or steps (First, Second...), you MUST extract each step as its own separate bullet point.
   - **FLATTEN NESTED LISTS**: If a bullet has a sub-list, extract the sub-list items as separate main bullets immediately following their parent.
   - **PROCESS STRUCTURE**: If the slide describes a process (e.g., "To find X:", "How it works:"):
     - Make the **GOAL/TITLE** the \`heading\` (e.g., "To find matching documents").
     - Make **EACH STEP** a separate \`bullet\` (e.g., "Locate BRUTUS", "Retrieve postings").
     - **DO NOT** lump steps into one paragraph.
3. **THE "هاض" & "مليح" RULES (ABSOLUTE BANS)**: 
   - Prohibited words: "هاد" (use "هاض"), "منيح" (use "مليح"), "متل" (use "مثل"), "كتير" (use "كثير"), "تانية" (use "ثانية").
   - This applies to EVERYTHING you write.
4. **Math & Symbols (MOBILE OPTIMIZED)**: 
   - ALWAYS use Block LaTeX ($$ ... $$) for formulas with DOUBLE BACKSLASHES (\\\\).
5. **Quiz Language (Exam mode only)**:
   - The question ("q") and all 4 "options" MUST be in English.
   - The "reasoning" MUST be in Jordanian Arabic (QudahWay style).

EXAMPLE OF CORRECT HIERARCHY:
Slide content:
"Tokenization
 - Cut character sequence into word tokens
 To find X:
 1. Locate A
 2. Retrieve B"

CORRECT JSON:
{
  "sections": [
    {
      "heading": "Tokenization",
      "bullets": [
        "**Cut character sequence into word tokens**\\nالتجزئة هي عملية تقسيم النص..."
      ]
    },
    {
      "heading": "To find X",
      "bullets": [
        "**Locate A**\\nالخطوة الأولى هي نحدد مكان A...",
        "**Retrieve B**\\nبعد ما نحدد A، بنجيب B..."
      ]
    }
  ]
}
NOTE: Create SEPARATE objects in "sections" for each new Main Topic or Process Goal.

MODE: ${resolvedMode.toUpperCase()}
REMINDER:
- Scan final response for banned words and replace them.
- **MATH CHECK**: Ensure LaTeX $$...$$ with \\\\.
- Return between 2 and 8 MCQs (comprehensive to the slide).
`;

        if (resolvedMode === 'simple') {
            userPrompt += `
- EXPLANATION MODE: Provide a DEEP DIVE and COMPREHENSIVE explanation of all slide content.
- Every single bullet point, term, and detail from the slide MUST have a thorough, detailed Arabic explanation.
- Do not limit the length; explain the "Why", "How", and "What it means" for every concept. 
- IMPORTANT: Ensure each point is explained in sufficient detail to ensure full understanding.
- DO NOT generate a quiz array (return empty array "quiz": []).
`;
        } else {
            userPrompt += `
- EXAM MODE: Focus ONLY on finding the hardest exam points.
- DO NOT generate explanation (return empty object "explanation": {}).
- Generate between 2 and 8 MCQs depending on the amount of content.
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

                const isVision = isVisionRequest(thumbnail);
                console.log(`Attempt ${attempt + 1}/4 | Model: gemma-3-27b-it | Vision: ${isVision}`);
                const prompt = systemPrompt + "\n\n" + userPrompt;

                let result;
                if (isVision && thumbnail) {
                    const base64Data = thumbnail.split(',')[1];
                    result = await model_gemma.generateContent([
                        prompt,
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: "image/jpeg"
                            }
                        }
                    ]);
                } else {
                    result = await model_gemma.generateContent(prompt);
                }

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

                // --- PUNITIVE REVIEW SYSTEM (QUDAHWAY GUARD) ---
                const punitiveReview = (obj: any): any => {
                    if (!obj) return obj;
                    if (typeof obj === 'string') {
                        return obj
                            .replace(/هاد/g, 'هاض')
                            .replace(/منيح/g, 'مليح')
                            .replace(/كتير/g, 'كثير')
                            .replace(/تانية/g, 'ثانية')
                            .replace(/متل/g, 'مثل');
                    }
                    if (Array.isArray(obj)) {
                        return obj.map(punitiveReview);
                    }
                    if (typeof obj === 'object') {
                        const newObj: any = {};
                        for (const key in obj) {
                            newObj[key] = punitiveReview(obj[key]);
                        }
                        return newObj;
                    }
                    return obj;
                };

                const polishedResult = punitiveReview(parsed);

                await updateUsage(uid, today, (userRef as any));
                res.status(200).json(polishedResult);
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
