// Version: Parallel Analysis & Voice Optimization (Commit 901a690)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { db, auth } from './firebaseAdmin.js';
import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const CACHE_TTL_DAYS = 30;
const CACHE_VERSION = 'v57'; // Updated: LaTeX repair system added

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
        v: CACHE_VERSION, // Added versioning
        n: slideNumbers,
        t: textContentArray || [],
        th: thumbHash,
        m: mode
    });
    const contentHash = crypto.createHash('sha256').update(payload).digest('hex');
    return `${contentHash}_${mode}`.replace(/[/\\]/g, '_');
}

const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
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
Your goal is to explain complex slide content to students like a mentor/big brother.

STRICT BANNED PHRASES (ROBOTIC FILLER):
- NEVER start or use: "هون السلايد بوضح", "هذا السلايد بيركز", "السلايد بيأكد", "في هذا السلايد".
- These phrases are robotic and formal. Avoid them at all costs.

NATURAL TUTORING STYLE:
- Talk directly to the student. Use phrases like: "الفكرة هون إنو...", "بمعنى ثاني...", "يعني تخيل إنو...", "أهم شي تفهم هون إنو...".
- Lead with the concept, not the slide. Act as if you are explaining the idea to a friend sitting next to you.
- Use a natural, flowing way (شرح فلفسجي).

STRICT RULES:
1. Return ONLY a valid JSON object. No extra text.
2. 100% FIDELITY: Every single concept from the slide MUST be interpreted.
3. STRUCTURE: For EVERY point, start with the Original English Text (**Bold**), then follow with a detailed Arabic explanation.
4. LANGUAGE: Informal Jordanian Arabic (Ammiya). 
5. ABSOLUTE BAN: NEVER use "هاد" (use "هاض"), NEVER use "منيح" (use "مليح"). Also, no "متل" (use "مثل"), no "كتير" (use "كثير"), no "تانية" (use "ثانية").
6. TONE: The "QudahWay Expert" - Academic but friendly.
7. IGNORE META-DATA: Do NOT extract section numbers, page numbers, or slide numbers.

STRICT OUTPUT KEYS:
1) "explanation": { "title", "overview", "sections" }
2) "quiz": Array of MCQs

MODE RULES:
- simple: Focus on a clear explanation. sentences must be short and punchy. NO QUIZ.
- exam: Focused on "Exam strategy" and generating MCQs. Return 2-8 hard MCQs. NO EXPLANATION TEXT.

EXAM QUIZ SCHEMA (STRICT):
- Each quiz item MUST be exactly: { "q": string, "options": [string,string,string,string], "a": 0|1|2|3, "reasoning": string }

LaTeX RULES (CRITICAL - READ CAREFULLY):
- Use $$ ... $$ for BLOCK formulas and $ ... $ for INLINE variables.
- Since the output is JSON, you MUST use DOUBLE BACKSLASHES for ALL LaTeX commands.
- CORRECT: "$$\\frac{x^2}{4} + \\frac{y^2}{9} = 1$$"
- WRONG: "$$\frac{x^2}{4}$$" (single backslash will break in JSON!)
- WRONG: "**$$...$$**" (never put bold around math!)
- Common commands that MUST have double backslash: \\frac, \\sum, \\int, \\sqrt, \\cdot, \\times, \\leq, \\geq, \\neq, \\infty, \\alpha, \\beta, \\theta, \\lambda, \\sigma, \\mu, \\pi, \\log, \\lim, \\sin, \\cos, \\tan, \\text, \\mathbf, \\hat, \\vec, \\bar, \\overline, \\underline, \\left, \\right, \\begin, \\end
`;
}

async function repairExamJsonShape(systemPrompt: string, slidePrompt: string, badJson: any): Promise<any> {
    const repairPrompt = `Fix this JSON to match EXACTLY this schema (do not add extra keys):\n\n{\n  \"explanation\": {},\n  \"quiz\": [\n    {\n      \"q\": string,\n      \"options\": [string,string,string,string],\n      \"a\": 0|1|2|3,\n      \"reasoning\": string\n    }\n  ]\n}\n\nRules:\n- Return ONLY valid JSON.\n- Preserve the same questions/options as much as possible.\n- Ensure every quiz item has numeric \"a\" (0-3).\n\nJSON TO FIX:\n${JSON.stringify(badJson)}`;

    const fixed = await model_gemma.generateContent([
        systemPrompt,
        slidePrompt,
        repairPrompt
    ].join('\n\n'));

    const fixedRaw = (await fixed.response).text();
    const jsonMatch = fixedRaw.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : fixedRaw);
}

function normalizeExamQuiz(parsed: any): any {
    if (!parsed || typeof parsed !== 'object') return parsed;
    if (!Array.isArray((parsed as any).quiz)) return parsed;

    const toIndex = (v: any): number | undefined => {
        if (v === null || v === undefined) return undefined;
        if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;

        const s = String(v).trim();
        if (!s) return undefined;

        if (/^[0-3]$/.test(s)) return Number(s);
        if (/^[1-4]$/.test(s)) return Number(s) - 1;

        const upper = s.toUpperCase();
        if (upper === 'A') return 0;
        if (upper === 'B') return 1;
        if (upper === 'C') return 2;
        if (upper === 'D') return 3;

        return undefined;
    };

    (parsed as any).quiz = (parsed as any).quiz.map((q: any) => {
        if (!q || typeof q !== 'object') return q;

        if (q.a !== undefined) {
            const idx = toIndex(q.a);
            return idx === undefined ? q : { ...q, a: idx };
        }

        const candidates = [q.answer, q.correct, q.correctAnswer, q.correct_index, q.correctIndex];
        for (const c of candidates) {
            const idx = toIndex(c);
            if (idx !== undefined) return { ...q, a: idx };
        }

        return q;
    });

    return parsed;
}

const QUIZ_MIN = 1;
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

const VISION_EXTRACT_PROMPT = `You are the "Master Interpreter" for an expert tutor. Your job is to look at this slide and explain the TRUTH and LOGIC hidden in it. 

STRICT RULE: Do NOT describe the layout (e.g. "There is a table with 3 rows", "The columns are X and Y"). NO ONE CARES ABOUT THE LAYOUT.
Instead, tell me what the layout represents.

YOUR TASKS:
1. **The Core Story**: What is the "Aha!" moment of this slide? (e.g., "This slide proves that Vector Space models are better than Boolean because they allow for partial matches").
2. **Translate Visuals to Logic**:
   - **Tables**: If it's a comparison table, give me the WINNER and the LOSER of each point. Explain the relationship.
   - **Diagrams**: Walk through the logic like a journey. "Start here, then this happens, and we end up with this."
   - **Boxes/Highlights**: Why did the professor put a red box there? What is the "gotcha"?
3. **The 'So What?'**: For every visual, explain what the student needs to REMEMBER for the exam.

OUTPUT FORMAT (Structured English Interpretation):
- **MAIN THESIS**: [The single most important lesson from this slide]
2. **LOGICAL FLOW**: [Narrative walkthrough of the diagram or table's truth]
3. **EXAM TRAPS**: [Explain specific highlighted points or 'gotchas' in the visuals]
4. **DATA BREAKDOWN**: [Logical translation of facts, NOT rows/columns]`;

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

function validateResultShape(result: any, mode: Mode): { ok: true } | { ok: false; reason: string } {
    if (!result || typeof result !== 'object') {
        return { ok: false, reason: 'Result is not an object' };
    }

    const quizRange = getQuizRange(mode);

    // Validate quiz if required
    if (mode === 'exam' && quizRange) {
        if (!Array.isArray(result.quiz)) {
            return { ok: false, reason: "'quiz' is not an array" };
        }

        if (result.quiz.length < quizRange.min || result.quiz.length > quizRange.max) {
            return {
                ok: false,
                reason: `Quiz length is ${result.quiz.length}, expected ${quizRange.min}-${quizRange.max}`
            };
        }

        // Validate MCQ options strictness
        for (let i = 0; i < result.quiz.length; i++) {
            const q = result.quiz[i];
            if (!Array.isArray(q.options) || q.options.length !== 4) {
                return { ok: false, reason: `Question ${i} does not have exactly 4 options` };
            }
            if (typeof q.a !== 'number' || q.a < 0 || q.a > 3) {
                return { ok: false, reason: `Question ${i} has invalid correct answer index (a): ${q.a}` };
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
            return { ok: false, reason: "'explanation' is missing or not an object" };
        }
    }

    return { ok: true };
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

        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        const userData = userDoc.data() || {};
        const userTier = userData.tier || 'free';

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
                // Logic: Free users get 2 days cache, others get full TTL (30 days)
                const effectiveTTL = userTier === 'free' ? 2 : CACHE_TTL_DAYS;

                if (ageMs < effectiveTTL * 24 * 60 * 60 * 1000) {
                    console.log(`Cache hit (${userTier}):`, cacheKey);
                    return res.status(200).json({
                        ...(cached?.result ?? {}),
                        isCached: true
                    });
                }
            }
        }

        const today = new Date().toISOString().split('T')[0];
        const usage = userData.dailyUsage || { date: today, count: 0 };

        if (usage.date === today && usage.count >= 200) {
            res.status(429).json({ error: 'Daily limit reached (200/200)' });
            return;
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

1. **STRUCTURE**: Every point MUST be a single integrated line.
   **[FULL ENGLISH SENTENCE]** : [Concise Arabic Explanation]
   - **START WITH ENGLISH**: You MUST start the bullet point with the English text in bold stars \`**\`.
   - **COLON RULE**: The colon (:) MUST be placed OUTSIDE the bold tags, followed by a space (e.g., **English text** : الشرح).
   - **COLOR LOGIC**: By putting the colon outside \`**\`, it will correctly align between the languages in RTL.

2. **THE "هاض" & "مليح" RULES**: 
   - Prohibited: "هاد", "منيح", "كتير", "تانية", "متل".
   - Use: "هاض", "مليح", "كثير", "ثانية", "مثل".

3. **Math & Symbols (CRITICAL)**: 
   - Block formulas -> $$ ... $$ (on their own line).
   - Inline variables -> $ ... $ (inside text).
   - ALL LaTeX commands MUST use DOUBLE BACKSLASHES in JSON: \\frac, \\sum, \\sqrt, etc.
   - EXAMPLE CORRECT JSON: "$$\\frac{x^2}{4} + \\frac{y^2}{9} = 1$$"
   - EXAMPLE WRONG JSON: "$$\frac{x^2}{4}$$" (BROKEN - single backslash gets eaten by JSON!)

EXAMPLE:
{
  "sections": [
    {
      "heading": "MAIN TOPIC",
      "bullets": [
        "**Pull Mode (search engines)** : يعني زي محركات البحث؛ إنت اللي بتطلب المعلومة وبتم سحبها بناءً على طلبك.",
        "**Users take initiative** : وهون المعنى إنه المستخدم هو اللي ببلش العملية وبقرر شو بده يدور بالضبط."
      ]
    }
  ]
}

4. **Quiz Language**: The question (q), all 1-4 options, and the REASONING MUST be in English.

MODE: ${resolvedMode.toUpperCase()}
REMINDER:
- Scan final response for banned words and replace them.
- **MATH CHECK**: Ensure LaTeX \`$$...$$\` with \`\\\\\`.
- **NO BOLD MATH**: Final check -> If you see \`**$$...$$**\`, change it to \`$$...$$\`.
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
        - **CRITICAL**: The quiz "reasoning" MUST be in English.
        - **STRICT QUIZ SCHEMA**: Each quiz item MUST be exactly:
          { "q": string, "options": [string,string,string,string], "a": 0|1|2|3, "reasoning": string }
        - **CRITICAL**: The field "a" MUST always exist and MUST be a NUMBER 0-3 (index of correct option).
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
                const visualPrefix = `[VISUAL SLIDE ANALYSIS - GUIDE FOR TUTOR]\n\nThe following is a structural breakdown of the visual slide content (tables, diagrams, flows) provided by your assistant.\nUSE THIS DETAILED LOGIC to explain the concepts to the student.\n\n${visionText}\n\n[END VISUAL ANALYSIS]\n\n`;
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

                if (resolvedMode === 'exam') {
                    parsed = normalizeExamQuiz(parsed);
                }


                let validation = validateResultShape(parsed, resolvedMode);
                if (!validation.ok && resolvedMode === 'exam') {
                    // If Gemma returned the quiz but forgot/garbled the correct index, attempt a fast repair pass.
                    const reason = String(validation.reason || '');
                    if (reason.includes('correct answer index') || reason.includes('invalid correct answer')) {
                        try {
                            const slidePrompt = userPrompt.replace('[[SLIDE_CONTENT]]', slideContexts || '');
                            const repaired = await repairExamJsonShape(systemPrompt, slidePrompt, parsed);
                            parsed = normalizeExamQuiz(repaired);
                            validation = validateResultShape(parsed, resolvedMode);
                        } catch (e: any) {
                            console.warn(`Exam JSON repair failed: ${e?.message || e}`);
                        }
                    }
                }

                if (!validation.ok) {
                    console.warn(`Validation Failed: ${validation.reason}`);
                    throw new Error(`GEMMA_INVALID_SHAPE: ${validation.reason}`);
                }

                // --- LATEX REPAIR SYSTEM ---
                const repairLatex = (text: string): string => {
                    // Fix broken LaTeX commands where backslash was eaten by JSON parsing
                    // e.g. "rac{" -> "\frac{", "sum_" -> "\sum_", "sqrt{" -> "\sqrt{"
                    const latexCommands = [
                        'frac', 'sum', 'int', 'sqrt', 'cdot', 'times', 'div',
                        'leq', 'geq', 'neq', 'approx', 'equiv', 'infty',
                        'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta',
                        'lambda', 'sigma', 'mu', 'pi', 'omega', 'phi', 'psi',
                        'log', 'ln', 'lim', 'sin', 'cos', 'tan', 'exp',
                        'text', 'mathbf', 'mathrm', 'mathcal', 'mathbb',
                        'hat', 'vec', 'bar', 'overline', 'underline', 'tilde',
                        'left', 'right', 'begin', 'end',
                        'partial', 'nabla', 'forall', 'exists', 'in', 'notin',
                        'subset', 'supset', 'cup', 'cap', 'land', 'lor', 'neg',
                        'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow',
                        'quad', 'qquad', 'hspace', 'vspace'
                    ];
                    let result = text;
                    for (const cmd of latexCommands) {
                        // Match the command name NOT preceded by a backslash
                        // e.g. "rac{" at word boundary but not "\frac{"
                        const regex = new RegExp(`(?<!\\\\)\\b${cmd}(?=[{_^(\\s])`, 'g');
                        result = result.replace(regex, `\\${cmd}`);
                    }
                    return result;
                };

                // --- PUNITIVE REVIEW SYSTEM (QUDAHWAY GUARD) ---
                const punitiveReview = (obj: any): any => {
                    if (!obj) return obj;
                    if (typeof obj === 'string') {
                        let cleaned = obj
                            .replace(/هاد/g, 'هاض')
                            .replace(/منيح/g, 'مليح')
                            .replace(/كتير/g, 'كثير')
                            .replace(/تانية/g, 'ثانية')
                            .replace(/متل/g, 'مثل');
                        // Repair broken LaTeX if the string contains math delimiters
                        if (cleaned.includes('$')) {
                            cleaned = repairLatex(cleaned);
                        }
                        return cleaned;
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
