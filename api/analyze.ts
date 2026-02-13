import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

const geminiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
const genAI = new GoogleGenerativeAI(geminiKey);
const model_gemma = genAI.getGenerativeModel({
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
You are the "QudahWay Expert Tutor", a friendly, engaging Jordanian private tutor. 
Your goal is to explain complex slide content to students like a mentor/big brother, using the unique "Qudah Way" style.

STRICT RULES:
1. Return ONLY a valid JSON object. No extra text.
2. 100% FIDELITY: Every single bullet, term, and concept from the slide MUST be extracted. 
3. STRUCTURE: For EVERY point, start with the Original English Text (**Bold**), then follow with a detailed Arabic explanation.
4. LANGUAGE: Informal Jordanian Arabic (Ammiya). 
5. ABSOLUTE BAN: No "هاد" (use "هاض"), no "متل" (use "مثل"), no "كتير" (use "كثير"), no "تانية" (use "ثانية").
6. TONE: The "QudahWay Expert" - Academic but friendly. Avoid distracting analogies (like cooking or movies) unless they are directly related to the concept. Focus on "What does this actually mean for the student?".

STRICT OUTPUT KEYS:
1) "explanation": { "title", "overview", "sections" }
2) "quiz": Array of MCQs

MODE RULES:
- simple: Use simple analogies, very informal language. 3-4 sections. 2 easy MCQs.
- deep: Detailed technical breakdown while maintaining the "Qudah Way" tone. 4-6 sections. 2 hard MCQs.
- exam: Focused on "Exam strategy", common pitfalls, and "The Secret Here". 10 hard MCQs.

JSON SCHEMA:
- explanation: { "title": string, "overview": string, "sections": [{ "heading": string, "bullets": string[] } | { "heading": string, "text": string }] }
- quiz: [{ "q": string, "options": [string (4)], "a": number (0-3), "reasoning": string }]

LaTeX: Use $...$ for inline and $$...$$ for block formulas.
STRICT MATH RULE: For mathematical content, formulas, or technical notation (like V={w1...}, q=q1...), you MUST use proper LaTeX syntax. DO NOT use plain text for math.
English ONLY for LaTeX.
QUIZ RULE: All quiz questions ("q") and "options" MUST be in English ONLY. No Arabic in the quiz questions or options. "reasoning" remains in Jordanian Arabic.
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

        const { slideNumbers, textContentArray, mode, thumbnail, previousTopics } = req.body as {
            slideNumbers: number[];
            textContentArray?: string[];
            mode?: Mode;
            thumbnail?: string;
            previousTopics?: string[];
        };

        const resolvedMode: Mode = mode || 'simple';

        // Allow analysis if either text or image is provided
        const combinedText = (textContentArray || []).join(' ').trim();
        if (!combinedText && !thumbnail) {
            return res.status(200).json({
                explanation: { title: "Empty Slide", overview: "No text or image found to analyze. Please upload a slide with content.", sections: [] },
                quiz: [],
                note: "Empty slides are not supported."
            });
        }

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

1. **100% Text-to-Explanation**: For every single bullet or line in the slide, you MUST provide:
   - **The English Text** (exactly as written in the slide).
   - A detailed Jordanian Arabic explanation of what that specific text means.
2. **The "Qudah Way" Tone**: 
   - Use warm, conversational Jordanian Ammiya.
   - Use phrases like: "السر هون", "فخ امتحان", "عشان تشد الانتباه", "الهدف الحقيقي".
   - **NO DISTRACTING STORIES**: Don't talk about cooking or neighborhood shops. Explain the *concept* itself in a way that feels like a private tutor session.
   - **CRITICAL**: Use "هاض", "مثل", "كثير", "ثانية", "هسا".
3. **Math & Symbols**: 
   - ALWAYS use LaTeX ($...$) for formulas and symbols. Preserve subscripts ($q_i$).
4. **Quiz Language**:
   - The question ("q") and all 4 "options" MUST be in English.
   - The "reasoning" MUST be in Jordanian Arabic (QudahWay style).

EXAMPLE:
"**Skip Lists use multiple layers for faster search**
ببساطة، الـ Skip List هي طريقة ذكية عشان نسرع البحث. تخيل إنك بطلعة درج طويل، وبدل ما تطلع درجة درجة (هاض البحث العادي)، بتقرر تنط كل 5 درجات مرة وحدة عشان توصل أسرع. هاض هو السر هون! بنعمل طبقات فوق بعض عشان نختصر الوقت."

MODE: ${resolvedMode.toUpperCase()}
REMINDER:
- Scan final response for "هاد" (to "هاض"), "متل" (to "مثل"), "كتير" (to "كثير"), "تانية" (to "ثانية").
- **MATH CHECK**: Ensure every formula or variable (like V, q, d_i) is wrapped in LaTeX $...$ in both English and Arabic sections.
- **QUIZ CHECK**: Ensure questions/options are English ONLY.
- Return EXACTLY ${requiredQuizCount(resolvedMode)} MCQs.
`;

        if (resolvedMode !== 'exam') {
            userPrompt += `
- explanation must cover 100% of slide content
- Each bullet/section must have detailed Arabic explanation
`;
        } else {
            userPrompt += `
- DO NOT generate explanation
- Output ONLY the quiz array with ${requiredQuizCount(resolvedMode)} questions
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

                console.log(`Attempt ${attempt + 1}/4 | Model: gemma-3-27b-it | Vision: ${!!thumbnail}`);
                const fullPrompt = systemPrompt + "\n\n" + userPrompt;

                // Prepare multimodal parts
                const parts: any[] = [fullPrompt];
                if (thumbnail && thumbnail.startsWith('data:image')) {
                    try {
                        const base64Data = thumbnail.split(',')[1];
                        const mimeType = thumbnail.split(',')[0].split(':')[1].split(';')[0];
                        parts.push({
                            inlineData: {
                                data: base64Data,
                                mimeType: mimeType
                            }
                        });
                    } catch (e) {
                        console.error("Error parsing thumbnail image:", e);
                    }
                }

                const result = await model_gemma.generateContent(parts);
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
