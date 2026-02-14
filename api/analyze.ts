import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { db, auth } from './firebaseAdmin.js';
import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const CACHE_TTL_DAYS = 30;

function getAnalysisCacheKey(
    slideNumbers: number[],
    textContentArray: string[] | undefined,
    thumbnail: string | undefined,
    mode: Mode
): string {
    const thumbHash = thumbnail
        ? crypto.createHash('sha256').update(thumbnail).digest('hex')
        : '';
    const payload = JSON.stringify({
        n: slideNumbers,
        t: textContentArray || [],
        th: thumbHash,
        m: mode
    });
    const contentHash = crypto.createHash('sha256').update(payload).digest('hex');
    return `${contentHash}_${mode}`.replace(/[/\\]/g, '_');
}

const geminiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
const genAI = new GoogleGenerativeAI(geminiKey);
const model_gemma = genAI.getGenerativeModel({
    model: 'gemma-3-27b-it'
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

type Mode = 'simple' | 'exam' | 'visual';

function buildSlideContexts(slideNumbers: number[], textContentArray?: string[]) {
    return slideNumbers
        .map((num: number, i: number) => `[SLIDE ${num}]: ${textContentArray?.[i] || 'No text'}`)
        .join('\n\n');
}

function buildSystemPrompt() {
    return `
You are the "QudahWay Expert Tutor", a friendly, engaging Jordanian private tutor. 
Your goal is to explain complex slide content to students like a mentor/big brother, using the unique "Qudah Way" style.

EXPLAIN WHAT YOU SEE (do not copy-paste):
- Imagine you are standing next to the student looking at the slide. Explain what the slide SHOWS and what it MEANS in a natural, flowing way.
- Do NOT mechanically copy each line of text then add a translation. Instead: interpret the content, connect ideas, and tell a coherent story (شرح فلفسجي — smooth and natural).
- Cover every important point and concept, but phrase it as "here’s what this part is saying" or "هون السلايد بيوضح إن..." rather than "Line 1: ... Line 2: ...".
- Keep the student’s attention with one continuous explanation per section; avoid a robotic list of copied lines.

STRICT RULES:
1. Return ONLY a valid JSON object. No extra text.
2. 100% FIDELITY: Every single bullet, term, and concept from the slide MUST be extracted.’3. STRUCTURE: For EVERY point, start with the Original English Text (**Bold**), then follow with a detailed Arabic explanation.
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

EXPLANATION ORDER FOR SLIDES WITH TABLES / BOXES / DIAGRAMS:
When the slide content describes a table, matrix, or highlighted boxes (e.g. legend, query example), order your "sections" like a clear lecture flow:
1) Title and main idea (one short section).
2) Definition / legend: what rows, columns, and cell values mean (e.g. "1 if play contains word, 0 otherwise") — one section with bold English key phrase then Arabic explanation.
3) The table or "what we get": e.g. "one 0/1 vector per term", with one concrete example row (e.g. "Caesar's row is 110111") — one section.
4) How to use it: if there is a procedure (e.g. answering a query with bitwise AND), use NUMBERED STEPS in Arabic (1. 2. 3.) in the bullets.
5) Concrete example: if the slide has a query or formula (e.g. "Brutus AND Caesar BUT NOT Calpurnia"), add a section that states the example and the result (e.g. vectors used and final result) so the student sees the full application.
Keep each section focused on ONE idea (like one yellow box per idea). Do not merge definition, procedure, and example into one long block.

LaTeX: Use $$ ... $$ (BLOCK) for formulas.
STRICT MATH RULE: Use DOUBLE BACKSLASHES (e.g., \\\\frac) to ensure backslashes are preserved in the JSON string. Formulas MUST be in English only.
Every technical variable (P, R, f, n...) MUST be wrapped in LaTeX symbols.
QUIZ RULE: All quiz questions ("q") and "options" MUST be in English ONLY. No Arabic in the quiz questions or options. "reasoning" remains in Jordanian Arabic.
`;
}

const QUIZ_MIN = 2;
const QUIZ_MAX = 8;

function getQuizRange(mode: Mode): { min: number; max: number } | null {
    return mode === 'exam' ? { min: QUIZ_MIN, max: QUIZ_MAX } : null;
}

/** For validation/prompt: visual behaves like simple (explanation, no quiz). */
function resolveModeForAnalysis(mode?: Mode): Mode {
    return mode === 'exam' ? 'exam' : 'simple';
}

function isVisionRequest(thumbnail?: string) {
    return !!thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('data:image');
}

const VISION_EXTRACT_PROMPT = `You are analyzing a lecture slide that may contain tables, charts, diagrams, and highlighted boxes (e.g. red box, black box with labels).

TASKS (do all that apply):

1. SLIDE TITLE
   - Give the exact slide title or main heading.

2. TABLE(S)
   - For each table: state clearly what the ROWS represent (e.g. terms/words) and what the COLUMNS represent (e.g. documents/plays).
   - State what each CELL VALUE means (e.g. "1 = term appears in document, 0 = term does not appear").
   - List the ROW HEADERS (e.g. Antony, Brutus, Caesar, ...) and COLUMN HEADERS (e.g. Antony and Cleopatra, Julius Caesar, ...).
   - Include 1–2 example rows with their 0/1 values so the reader can see how the table works.

3. HIGHLIGHTED BOXES / CALLOUTS
   - For every distinct box (red, black, or any colored/highlighted area with text):
     - Quote the EXACT text inside the box.
     - State what the box is: e.g. "Legend explaining cell values", "Example search query", "Definition", "Formula".
     - In one sentence, explain how it relates to the rest of the slide (e.g. "This query would find plays containing Brutus AND Caesar but NOT Calpurnia.").

4. CHARTS / DIAGRAMS (if any)
   - Describe axes, labels, and what the chart/diagram shows. For diagrams, describe steps or flow.

5. BODY TEXT
   - Any other headings or bullet points: extract verbatim, preserve order.

OUTPUT: One structured block in English. Use clear section headers like "TITLE:", "TABLE:", "BOX (legend):", "BOX (query example):", "BODY:". No conversational filler. This text will be used to generate a student-facing explanation.`;

async function extractSlideContentWithGroqVision(thumbnail: string): Promise<string> {
    const completion = await groq.chat.completions.create({
        model: GROQ_VISION_MODEL,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: VISION_EXTRACT_PROMPT },
                    { type: 'image_url', image_url: { url: thumbnail } }
                ]
            }
        ],
        max_tokens: 4096,
        temperature: 0.2
    });
    const text = completion.choices[0]?.message?.content?.trim() || '';
    return text || '[No content extracted from image.]';
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

    const quizRange = getQuizRange(mode);

    // Validate quiz if required
    if (mode === 'exam' && quizRange) {
        if (!Array.isArray(result.quiz)) {
            console.warn("Validation Failed: 'quiz' is not an array");
            return false;
        }

        if (result.quiz.length < quizRange.min || result.quiz.length > quizRange.max) {
            console.warn(`Validation Failed: Quiz length is ${result.quiz.length}, expected ${quizRange.min}-${quizRange.max}`);
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

        const resolvedMode: Mode = resolveModeForAnalysis(mode);

        const cacheKey = getAnalysisCacheKey(slideNumbers, textContentArray, thumbnail, resolvedMode);
        const cacheRef = userRef.collection('analyses').doc(cacheKey);
        const cacheSnap = await cacheRef.get();
        if (cacheSnap.exists) {
            const cached = cacheSnap.data();
            const createdAt = cached?.createdAt as admin.firestore.Timestamp | undefined;
            if (createdAt) {
                const ageMs = Date.now() - createdAt.toMillis();
                if (ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) {
                    console.log('Cache hit:', cacheKey);
                    return res.status(200).json(cached?.result ?? {});
                }
            }
        }

        const systemPrompt = buildSystemPrompt();

        const contextInfo = (previousTopics && previousTopics.length > 0)
            ? `\nPREVIOUSLY COVERED TOPICS (DO NOT RE-EXPLAIN THESE IN DETAIL):\n- ${previousTopics.join('\n- ')}\n`
            : '';

        let userPrompt = `
${contextInfo}
SLIDE CONTENT TO ANALYZE:
[[SLIDE_CONTENT]]

CRITICAL "QUDAH WAY" — EXPLAIN WHAT YOU SEE (Full English -> Jordanian Explanation):

1. **STRUCTURE**: For EVERY bullet point, you MUST strictly follow this format:
   **"[FULL ENGLISH SENTENCE FROM SLIDE]"**
   [Jordanian Arabic Explanation]
   - **Do NOT** summarize the English text. Copy it exactly as it appears on the slide (or the full logic sentence).
   - **Then** explain it as if you are talking to the student ("يعني هون قصده...", "لاحظ إنه...").

2. **THE "هاض" & "مليح" RULES (ABSOLUTE BANS)**: 
   - Prohibited words: "هاد" (use "هاض"), "منيح" (use "مليح"), "كتير" (use "كثير"), "تانية" (use "ثانية"), "متل" (use "مثل").
   - This applies to EVERYTHING you write.

3. **Math & Symbols (MOBILE OPTIMIZED)**: 
   - **DETECT FORMULAS**: If a line is a mathematical formula (contains =, <, >, sum, integral, etc.), you MUST wrap the ENTIRE line in Block LaTeX \`$$ ... $$\`.
   - **NO BOLDING**: NEVER put bold markers (\`**\`) around formulas. Just use \`$$...$$\`. Bolding breaks the math rendering.
   - **INLINE MATH**: For variables (x, y) or small expressions inside Arabic text, use Inline LaTeX \`$ ... $\`. Never write raw LaTeX commands like \`frac\` without delimiters.
   - **COMPLEX SYMBOLS**: Ensure proper LaTeX for sums (\`\\\\sum\`), integrals (\`\\\\int\`), fractions (\`\\\\frac\`), and subscripts (\`_\`).
   - **DOUBLE BACKSLASHES**: You MUST use \`\\\\\` for all LaTeX commands (e.g., \`\\\\sum\`, \`\\\\frac\`). This is non-negotiable for JSON safety.

4. **Quiz Language (Exam mode only)**:
   - The question ("q") and all 4 "options" MUST be in English.
   - The "reasoning" MUST be in Jordanian Arabic (QudahWay style).

EXAMPLE (The "Classic" Style):
Slide content: "Inverted index. For each term t, store list of docs containing t. Identify each doc by docID."

GOOD JSON:
{
  "sections": [
    {
      "heading": "Inverted index",
      "bullets": [
        "**Inverted index. For each term t, store list of docs containing t.**\\nيعني الفكرة هون إنه بالـ Inverted index، لكل كلمة (term) بنخزن قائمة بكل المستندات اللي موجودة فيها هاي الكلمة. بدل ما ندور بكل الملفات، بنكون عارفين وين كل كلمة موجودة.",
        "**Identify each doc by docID.**\\nوهون بحكيلك إنه كل مستند بنعطيه رقم مميز (docID) عشان نميزه عن غيره ونقدر نوصله بسرعة."
      ]
    }
  ]
}
NOTE: STRICTLY use **Full English Text** then the Arabic explanation.

MODE: ${resolvedMode.toUpperCase()}
REMINDER:
- Scan final response for banned words and replace them.
- **MATH CHECK**: Ensure LaTeX \`$$...$$\` with \`\\\\\`.
- **NO BOLD MATH**: Final check -> If you see \`**$$...$$**\`, change it to \`$$...$$\`.
- Return between 2 and 8 MCQs (comprehensive to the slide).
`;

        if (resolvedMode === 'simple') {
            userPrompt += `
            - EXPLANATION MODE: Provide a DEEP DIVE and COMPREHENSIVE explanation of all slide content.
- Every single bullet point, term, and detail from the slide MUST have a thorough, detailed Arabic explanation.
- Do not limit the length; explain the "Why", "How", and "What it means" for every concept. 
- IMPORTANT: Ensure each point is explained in sufficient detail to ensure full understanding.
- DO NOT generate a quiz array(return empty array "quiz": []).
        `;
        } else {
            userPrompt += `
            - EXAM MODE: Focus ONLY on finding the hardest exam points.
- DO NOT generate explanation(return empty object "explanation": { }).
        - Generate between 2 and 8 MCQs depending on the amount of content.
`;
        }


        // STRATEGY: Use ONLY the smartest model (70b).
        // We list it multiple times to act as "retries" in case of a random network glitch or bad output.
        // We DO NOT fallback to dumber models (8b/Mixtral) to preserve quality.
        let messages: any[] = [{ role: 'system', content: systemPrompt }];

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
        const hasGroqKey = !!(process.env.GROQ_API_KEY);

        if (mode === 'visual' && isVisionRequest(thumbnail) && !hasGroqKey) {
            console.error("CRITICAL: Visual mode requires GROQ_API_KEY for image analysis.");
            return res.status(500).json({ error: "Service configuration error: Missing GROQ_API_KEY for visual mode." });
        }
        if (!hasGeminiKey) {
            console.error("CRITICAL: No Gemini API key found in environment variables.");
            return res.status(500).json({ error: "Service configuration error: Missing API keys." });
        }

        // When user chose "visual" mode and sent thumbnail: run Groq Vision once to get full slide description (tables, charts, diagrams).
        let initialFinalText: string[] | undefined = textContentArray;
        let initialFinalThumbnail: string | undefined = thumbnail;
        if (mode === 'visual' && thumbnail && isVisionRequest(thumbnail)) {
            try {
                console.log("Visual mode: Running Groq Llama 4 Vision for tables/charts/diagrams...");
                const visionText = await extractSlideContentWithGroqVision(thumbnail);
                console.log(`Groq Vision provided ${visionText.length} chars.`);
                const visualPrefix = `[VISUAL SLIDE - The content below describes a slide with a table and/or highlighted boxes. Organize your explanation in this order, ONE section per point: (1) Title and main idea. (2) Definition/legend: what rows, columns, and cell values mean — bold the key phrase (e.g. "1 if play contains word, 0 otherwise") then explain in Arabic. (3) What the table gives us (e.g. one vector per term) with one example row. (4) How to use it: if there is a procedure, use numbered steps in Arabic. (5) Concrete example (e.g. query "Brutus AND Caesar BUT NOT Calpurnia" with vectors and result). Do not merge into one block.]\n\n`;
                initialFinalText = [visualPrefix + visionText];
                initialFinalThumbnail = undefined;
            } catch (err: any) {
                console.warn("Groq Vision failed, falling back to text content:", err?.message);
            }
        }

        // RETRY LOOP: 4 attempts with exponential backoff
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                if (!hasGeminiKey) {
                    throw new Error("GEMINI_API_KEY_MISSING");
                }

                let finalTextContentArray = initialFinalText;
                let finalThumbnail = initialFinalThumbnail;

                if (mode !== 'visual' && isVisionRequest(thumbnail) && thumbnail) {
                    console.log("Vision Request Detected: Running OCR with Vision Model...");
                    const mimeType = thumbnail.split(';')[0].split(':')[1];
                    const base64Data = thumbnail.split(',')[1];

                    const visionModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

                    for (let i = 0; i < 3; i++) {
                        try {
                            const ocrResult = await visionModel.generateContent([
                                "OCR INSTRUCTION: Extract ALL text from this slide verbatim. Preserve structure (headings, bullets). Do not summarize or add conversational filler. Output ONLY the extracted text.",
                                { inlineData: { data: base64Data, mimeType: mimeType } }
                            ]);
                            const ocrText = ocrResult.response.text();
                            console.log(`OCR Success provided ${ocrText.length} chars.`);

                            finalTextContentArray = [ocrText];
                            finalThumbnail = undefined;
                            break;
                        } catch (err: any) {
                            console.warn(`OCR Attempt ${i + 1} failed: ${err.message}`);
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }
                }

                const isMulti = Array.isArray(slideNumbers) && slideNumbers.length > 1;
                const slideContexts = isMulti
                    ? buildSlideContexts(slideNumbers, finalTextContentArray)
                    : (finalTextContentArray?.[0] || '');

                const currentMessages = [{ role: 'system', content: systemPrompt }];
                currentMessages.push({ role: 'user', content: userPrompt.replace('[[SLIDE_CONTENT]]', slideContexts || '') });

                const isVision = isVisionRequest(finalThumbnail);
                console.log(`Attempt ${attempt + 1}/4 | Model: gemma-3-27b-it | Vision: ${isVision}`);

                let result;
                if (isVision && finalThumbnail) {
                    // Fallback to Visual Analysis if OCR failed to clear the thumbnail
                    const mimeType = finalThumbnail.split(';')[0].split(':')[1];
                    const base64Data = finalThumbnail.split(',')[1];
                    result = await model_gemma.generateContent([
                        currentMessages[0].content, // System prompt
                        currentMessages[1].content, // User prompt (with slide content)
                        {
                            inlineData: {
                                data: base64Data,
                                mimeType: mimeType
                            }
                        }
                    ]);
                } else {
                    result = await model_gemma.generateContent(currentMessages.map(m => m.content).join('\n\n'));
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

                await cacheRef.set({
                    mode: resolvedMode,
                    result: polishedResult,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
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
