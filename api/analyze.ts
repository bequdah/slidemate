import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import Groq from 'groq-sdk';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

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
3) "quiz": array of MCQ objects
4) "arabic": translated versions of explanation and examInsight (same structure or empty string)

STRUCTURED OBJECT FORMAT (MANDATORY when not empty):
{
  "title": "Main Title (optional)",
  "overview": "One concise sentence (optional)",
  "sections": [
    { "heading": "Section Title", "text": "Max 2 sentences explanation" }
    OR { "heading": "Section Title", "bullets": ["Point 1", "Point 2"] }
    OR { "heading": "Key Definitions", "definitions": [{"term":"...","def":"..."}] }
  ]
}

QUIZ FORMAT (MANDATORY):
"quiz": [
  { 
    "q": "Question text", 
    "options": ["Option A", "Option B", "Option C", "Option D"], 
    "a": 0, 
    "reasoning": "Short explanation (max 1 sentence)."
    
  }
]
CRITICAL: Every quiz question MUST include a detailed "reasoning" field that explains the answer.

QUALITY RULES:
- Preserve hierarchy: title -> bullets -> conclusion.
- Each bullet in the slide should become its own bullet or short text line.
- Definitions must appear under "Key Definitions" and must be precise.
- Avoid repetition.
- Academic tone, clear and structured.
- Do NOT mention the slide/image/analysis process.

ARABIC:
- Translate explanation and examInsight into Arabic (Modern Standard Arabic).
- Keep the same JSON structure.

MODE RULES:

1) simple:
- Tone: student-friendly, clear, light analogies (but still correct).
- Focus: WHAT + basic HOW (avoid deep theoretical WHY).
- Use simple, everyday language that undergraduate students can easily understand.
- Structure: 3–4 sections max with clear headings.
- Each section should have either: simple text explanation (1-2 sentences), bullet points, or definitions.
- Include sections like: "What Is This?", "How It Works", "Key Terms", "Simple Example".
- MANDATORY: The "explanation" object MUST contain "title", "overview", and "sections".
- MANDATORY: "examInsight" object MUST be present (keep it simple/brief).
- MANDATORY: EXACTLY 2 easy MCQs in "quiz".

2) deep:
- Tone: University professor teaching an undergraduate (2nd–3rd year). Clear and structured, NOT research-paper style but with high academic depth.
- CRITICAL: Use cause–effect reasoning for every concept (explain WHY the problem occurs, WHAT it causes, and HOW it is resolved).
- Provide ONE clear mental model or conceptual example per slide (not daily-life analogies, but technical/academic models).
- Do NOT list concepts without explanation; introduce every technical term AFTER explaining the underlying idea.
- Prefer fewer sections (4–6) with DEEPER explanations rather than many shallow sections.
- Write as a professor explaining to a student, NOT as a textbook summary or bullet-point list.
- Include sections like: Concept Overview, Why [Problem] Occurs, How [Solution] Works, Key Definitions, Common Failure Scenarios.
- Technical terminology must be precise and clearly defined.
- All explanations MUST stay strictly grounded in the slide content and what can be logically inferred from it.
- Avoid generic academic filler phrases; every paragraph must explain a concrete mechanism or consequence.
- MANDATORY: EXACTLY 2 difficult MCQs.


3) exam:
- Do NOT generate explanation or examInsight. Return empty objects: { "sections": [] }
- Focus ONLY on creating exactly 10 hard MCQs in "quiz".
- Questions must be directly based on the slide content.
- Each question must test deep understanding, not just memorization.

LaTeX Rules:
- Use $...$ for inline and $$...$$ for block math.
- JSON ESCAPING: You MUST use double-backslashes (e.g., "\\\\frac").
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
    if (!result || typeof result !== 'object') return false;

    // quiz must exist and have correct count
    if (!Array.isArray(result.quiz)) return false;
    if (result.quiz.length !== requiredQuizCount(mode)) return false;

    // Relaxed validation: We only strictly check 'quiz' and basic 'explanation' structure if not exam mode.
    // arabic and examInsight are now optional to prevent failures.

    if (mode !== 'exam') {
        if (!isStructuredObject(result.explanation)) return false;
    }

    // In exam mode, enforce empty sections
    if (mode === 'exam') {
        // In exam mode, ONLY enforce quiz correctness
        return true;
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

        const isMulti = Array.isArray(slideNumbers) && slideNumbers.length > 1;
        const slideContexts = isMulti
            ? buildSlideContexts(slideNumbers, textContentArray)
            : (textContentArray?.[0] || '');

        const systemPrompt = buildSystemPrompt();

        const userPrompt = `
CONTENT:
${slideContexts || 'No text provided'}

MODE: ${resolvedMode.toUpperCase()}
REMINDER:
- You MUST follow ${resolvedMode.toUpperCase()} rules.
- Return EXACTLY ${requiredQuizCount(resolvedMode)} MCQs in the quiz array.
- explanation/examInsight rules per mode must be respected.
`;

        let targetModels: string[] = ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'llama-3.1-8b-instant'];

        let messages: any[] = [{ role: 'system', content: systemPrompt }];

        if (isVisionRequest(thumbnail)) {
            console.log('Vision Request Detected');
            targetModels = ['llama-3.2-11b-vision-preview', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
            messages = [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userPrompt },
                        {
                            type: 'image_url',
                            image_url: { url: thumbnail }
                        }
                    ]
                }
            ];
        } else {
            messages.push({ role: 'user', content: userPrompt });
        }

        let completion: any = null;
        let lastError: any = null;

        for (const targetModel of targetModels) {
            try {
                console.log(`Attempting analysis with ${targetModel}...`);
                const isVisionModel = targetModel.includes('vision');
                const preparedMessages = coerceMessagesForModel(messages, isVisionModel);

                completion = await groq.chat.completions.create({
                    messages: preparedMessages,
                    model: targetModel,
                    temperature: 0.1,
                    response_format: { type: 'json_object' }
                });

                const raw = completion.choices[0]?.message?.content || '';

                console.log('RAW(first 300):', raw.slice(0, 300));

                if (!raw.trim().startsWith('{')) {
                    console.warn(`Model ${targetModel} did not return JSON. Trying next...`);
                    continue;
                }

                let parsed: any;
                try {
                    parsed = JSON.parse(raw);
                } catch (e: any) {
                    console.warn(`JSON.parse failed on ${targetModel}: ${e?.message}. Trying next...`);
                    continue;
                }

                if (!validateResultShape(parsed, resolvedMode)) {
                    console.warn(`Model ${targetModel} returned invalid shape; trying next model...`);
                    continue;
                }

                console.log(`Success with ${targetModel}`);

                await db.runTransaction(async t => {
                    const doc = await t.get(userRef);
                    const data = doc.data() || {};
                    const currentUsage = data.dailyUsage || { date: today, count: 0 };

                    if (currentUsage.date !== today) {
                        currentUsage.date = today;
                        currentUsage.count = 1;
                    } else {
                        currentUsage.count++;
                    }

                    t.set(userRef, { dailyUsage: currentUsage }, { merge: true });
                });

                res.status(200).json(parsed);
                return;
            } catch (err: any) {
                lastError = err;
                console.error(`Error with ${targetModel}:`, err?.message || err);
                continue;
            }
        }

        if (!completion) throw lastError || new Error('All models failed');

        res.status(500).json({ error: 'Unable to generate a valid response. Please try again.' });
    } catch (error: any) {
        console.error('API Error:', error);
        if (error?.message === 'RATE_LIMIT_EXCEEDED') {
            res.status(429).json({ error: 'Daily limit reached (200/200)' });
        } else {
            res.status(500).json({ error: error?.message || 'Server error' });
        }
    }
}
