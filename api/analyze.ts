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
You are an Elite University Professor AND a professional slide-content editor.
Return ONLY a valid JSON object. No markdown. No extra text.

GOAL:
- Reconstruct slide content into structured, UI-ready JSON that mirrors the slide's logical structure.
- Do NOT add new concepts beyond what is in the slide content (reasonable clarification is allowed, invention is not).

STRICT OUTPUT KEYS:
1) "explanation": structured object (ALWAYS)
2) "examInsight": structured object (ALWAYS)
- Do NOT mention the slide/image/analysis process.
- All content in "explanation", "examInsight", "voiceScript", and "quiz" (including reasoning) MUST be in ENGLISH.
- "voiceScript" (MANDATORY): A 2-4 paragraph narrative script explaining the slide content as if a teacher is talking to a student. It must be engaging, cohesive, and NOT formatted as a list or bullets.

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
3) "voiceScript": string
4) "quiz": Array of objects: { "q": string, "options": [string (exactly 4)], "a": number (0-3), "reasoning": string }

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

function isStructuredObject(x: any) {
    return x && typeof x === 'object' && !Array.isArray(x);
}

function validateResultShape(result: any, mode: Mode) {
    if (!result || typeof result !== 'object') {
        return false;
    }

    if (!Array.isArray(result.quiz)) {
        return false;
    }

    const requiredCount = requiredQuizCount(mode);
    if (result.quiz.length !== requiredCount) {
        return false;
    }

    if (mode !== 'exam') {
        if (!isStructuredObject(result.explanation)) {
            return false;
        }
        if (typeof result.voiceScript !== 'string' || result.voiceScript.trim().length === 0) {
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

        const combinedText = (textContentArray || []).join(' ').trim();
        if (!combinedText) {
            return res.status(200).json({
                explanation: { title: "Image-only Slide", overview: "This slide contains only an image. Please use text-based slides for analysis.", sections: [] },
                examInsight: { title: "Exam Insight", overview: "No text found to analyze.", sections: [] },
                voiceScript: "This slide appears to have only images and no text content for me to explain verbally. Please try a slide with text.",
                quiz: [],
                note: "Image-only slides are currently not supported. Please upload slides with text content."
            });
        }

        const isMulti = Array.isArray(slideNumbers) && slideNumbers.length > 1;
        const slideContexts = isMulti
            ? buildSlideContexts(slideNumbers, textContentArray)
            : (textContentArray?.[0] || '');

        const systemPrompt = buildSystemPrompt();

        const userPrompt = `
CONTENT (TEXT MAY BE EMPTY):
${slideContexts || ''}

MODE: ${resolvedMode.toUpperCase()}
REMINDER:
- You MUST follow ${resolvedMode.toUpperCase()} rules.
- You MUST follow the JSON SCHEMA exactly.
- Return EXACTLY ${requiredQuizCount(resolvedMode)} MCQs in the quiz array.
`;

        const finalPrompt = `${systemPrompt}\n\nUSER REQUEST:\n${userPrompt}`;

        const result = await model_gemini.generateContent(finalPrompt);
        const responseText = result.response.text();

        // Clean potentially markdown-wrapped JSON
        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        let parsed: any;
        try {
            parsed = JSON.parse(cleanJson);
        } catch (e) {
            console.error("JSON Parse Error:", e, responseText);
            throw new Error('MODEL_RETURNED_INVALID_JSON');
        }

        if (!validateResultShape(parsed, resolvedMode)) {
            throw new Error('INVALID_RESULTS_SHAPE');
        }

        await updateUsage(uid, today, (userRef as any));
        res.status(200).json(parsed);

    } catch (error: any) {
        console.error('API Error:', error);
        res.status(500).json({ error: error?.message || 'Server error' });
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
