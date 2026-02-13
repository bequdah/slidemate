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

        const { slideNumbers, textContentArray, mode, thumbnail, previousTopics } = req.body as {
            slideNumbers: number[];
            textContentArray?: string[];
            mode?: Mode;
            thumbnail?: string;
            previousTopics?: string[];
        };

        const resolvedMode: Mode = mode || 'simple';

        // Prepare text content
        const combinedText = (textContentArray || []).join(' ').trim();

        // If vision API token is available and we have image data, enhance text with vision analysis
        let enhancedText = combinedText;
        const huggingFaceToken = process.env.HUGGING_FACE_API_KEY || process.env.VITE_HUGGING_FACE_API_KEY || '';
        
        if (thumbnail && huggingFaceToken) {
            try {
                console.log('Attempting vision analysis with BLIP-2...');
                const visionResult = await callBLIP2Vision(
                    thumbnail,
                    'Describe this slide in detail. Include all text, diagrams, tables, charts, and visual elements. For tables, provide markdown format. For equations, use LaTeX format.',
                    huggingFaceToken
                );
                
                if (visionResult) {
                    console.log('Vision analysis successful');
                    // Combine OCR text with vision analysis
                    enhancedText = combinedText 
                        ? `${combinedText}\n\n[VISION ANALYSIS]:\n${visionResult}`
                        : `[VISION ANALYSIS]:\n${visionResult}`;
                }
            } catch (visionError: any) {
                console.warn(`Vision analysis failed, continuing with OCR text only: ${visionError.message}`);
                // Fall back to text-only if vision fails
            }
        }

        // If we still have no content, return empty response
        if (!enhancedText) {
            return res.status(200).json({
                explanation: { title: "Unable to Extract Content", overview: "This slide could not be analyzed. Please try with a different slide.", sections: [] },
                examInsight: { title: "Exam Insight", overview: "No content found to analyze.", sections: [] },
                quiz: [],
                note: "No text or visual content could be extracted from this slide."
            });
        }

        const isMulti = Array.isArray(slideNumbers) && slideNumbers.length > 1;
        const slideContexts = isMulti
            ? buildSlideContexts(slideNumbers, enhancedText.split('\n\n'))
            : enhancedText;

        const systemPrompt = buildSystemPrompt();

        const contextInfo = (previousTopics && previousTopics.length > 0)
            ? `\nPREVIOUSLY COVERED TOPICS (DO NOT RE-EXPLAIN THESE IN DETAIL):\n- ${previousTopics.join('\n- ')}\n`
            : '';

        let userPrompt = `
${contextInfo}
SLIDE CONTENT TO ANALYZE:
${slideContexts || ''}

CRITICAL EXTRACTION & FORMATTING REQUIREMENTS:

1. **Extract EVERY point, bullet, concept, and sentence from the slide**
2. **Format each point as follows:**
   - First: Show the original English text from the slide (bold formatting)
   - Second: Provide a detailed Arabic explanation directly underneath
3. **Complete Coverage**: Do NOT skip any content from the slide
4. **Explanation Style**: 
   - Use warm, conversational Jordanian Arabic (ببساطة، يعني، تخيل، خلينا نفهم)
   - **CRITICAL Jordanian vocabulary rules:**
     * ALWAYS use "هاض" (NEVER "هاد")
     * ALWAYS use "هسا" (NEVER "هلا" for "now")
     * Use "بيتعلم" not "بتعلم"
     * Use "مش رح" not "مش هت"
   - **ABSOLUTE PROHIBITION: The word "هاد" is COMPLETELY BANNED. Replace ALL instances with "هاض"**
   - Before finalizing your response, scan for "هاد" and replace with "هاض"
   - **Balanced Explanation Strategy:**
     * Complex/important concepts: Detailed explanation with examples (3-4 sentences)
     * Simple/straightforward points: Concise clear explanation (1-2 sentences)
     * NOT every point needs an example - use examples strategically
     * Prioritize clarity over length
   - Explain like a friendly tutor, not a textbook
   - Break down technical terms naturally

EXAMPLE FORMAT:
Complex concept example:
"**Machine Learning uses algorithms to learn from data**

ببساطة، التعلم الآلي هو تقنية بتخلي الكمبيوتر يتعلم من البيانات. تخيل إنك بتعلم طفل يميز بين التفاح والبرتقال - بتوريه أمثلة كثيرة وهو بيفهم الفرق لحاله. هاض بالضبط الخوارزميات بتشتغل!"

Simple concept example:
"**Data is stored in databases**

ببساطة، البيانات بتنخزن في قواعد بيانات عشان نقدر نرجعلها وقت ما بدنا."

VISION/CONTEXT RULES:
- If visual content is weak, USE THE PROVIDED TEXT CONTENT to generate the explanation
- ONLY return empty sections if BOTH image and text are insufficient
- DO NOT re-explain concepts from "PREVIOUSLY COVERED TOPICS" - focus on new information
- DO NOT use placeholders like "Variable A / Variable B"
- ALWAYS provide real, specific explanations

MODE: ${resolvedMode.toUpperCase()}
REMINDER:
- You MUST extract ALL slide content
- You MUST explain each point comprehensively in Arabic
- You MUST follow ${resolvedMode.toUpperCase()} rules
- You MUST follow the JSON SCHEMA exactly
- Return EXACTLY ${requiredQuizCount(resolvedMode)} MCQs in the quiz array
`;

        if (resolvedMode !== 'exam') {
            userPrompt += `
- explanation/examInsight must cover 100% of slide content
- Each bullet/section must have detailed Arabic explanation
`;
        } else {
            userPrompt += `
- DO NOT generate explanation or examInsight
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

                console.log(`Attempt ${attempt + 1}/4 | Model: gemma-3-27b-it`);
                const prompt = systemPrompt + "\n\n" + userPrompt;

                // Gemma-3 currently might not support strict JSON output mode via SDK config config
                const result = await model_gemma.generateContent(prompt);
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

/**
 * Calls BLIP-2 model on Hugging Face for enhanced image understanding
 */
async function callBLIP2Vision(
    imageData: string,
    prompt: string,
    huggingFaceToken: string,
    maxRetries: number = 2
): Promise<string> {
    const BLIP2_API_URL = 'https://api-inference.huggingface.co/models/Salesforce/blip2-opt-6.7b';

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            console.log(`BLIP-2 Vision Attempt ${attempt + 1}/${maxRetries}`);

            // Convert data URL to base64 if needed
            let base64Image = imageData;
            if (imageData.startsWith('data:')) {
                base64Image = imageData.split(',')[1];
            }

            const response = await fetch(BLIP2_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${huggingFaceToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: {
                        image: base64Image,
                        question: prompt
                    },
                    wait_for_model: true
                }),
                signal: AbortSignal.timeout(30000) // 30 second timeout
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.warn(`BLIP-2 API Error (${response.status}):`, errorData);

                // Retry on service unavailable
                if (response.status === 503 && attempt < maxRetries - 1) {
                    const waitTime = Math.pow(2, attempt) * 1000;
                    console.log(`Vision API busy, waiting ${waitTime}ms before retry...`);
                    await new Promise(r => setTimeout(r, waitTime));
                    continue;
                }

                throw new Error(`BLIP-2 API Error (${response.status})`);
            }

            const result: any = await response.json();
            const analysis = result.generated_text || result[0]?.generated_text || '';

            if (!analysis) {
                throw new Error('BLIP-2 returned empty response');
            }

            console.log('BLIP-2 vision analysis completed successfully');
            return analysis;
        } catch (error: any) {
            console.error(`BLIP-2 Vision Attempt ${attempt + 1} failed:`, error.message);

            if (attempt === maxRetries - 1) {
                throw error;
            }

            const waitTime = Math.pow(2, attempt) * 500;
            await new Promise(r => setTimeout(r, waitTime));
        }
    }

    throw new Error('Vision analysis failed after all retries');
}
