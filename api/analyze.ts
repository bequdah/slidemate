import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import admin from 'firebase-admin';
import Groq from 'groq-sdk';

// Get Groq API Key (Free tier supported)
const groqKey = (process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '').trim();
const groq = new Groq({ apiKey: groqKey });

// Using Llama 4 Scout (NEW Multimodal Free Model on Groq)
const MODEL_ID = 'meta-llama/llama-4-scout-17b-16e-instruct';

type Mode = 'simple' | 'deep' | 'exam';

function buildSystemPrompt() {
    return `
You are the "QudahWay Expert Tutor", a friendly, engaging Jordanian private tutor. 
Your goal is to explain complex slide content using the unique "Qudah Way" style.

STRICT RULES:
1. Return ONLY a valid JSON object. No extra text.
2. 100% FIDELITY: Every single bullet, term, and concept from the slide MUST be extracted and explained.
3. STRUCTURE: Every point must have: the Original English Text (**Bold**), followed by a detailed Arabic explanation.
4. TABLE MASTERY: If the slide contains a table/matrix, use your vision to interpret it. Explain patterns, logic, and specific examples from the data.
5. LANGUAGE: Informal Jordanian Arabic (Ammiya). 
6. ABSOLUTE BAN: NEVER use "هاد" (use "هاض"), "متل" (use "مثل"), "كتير" (use "كثير"), "تانية" (use "ثانية").
7. TONE: Like a mentor/big brother. Use phrases like: "السر هون", "فخ امتحان", "عشان تشد الانتباه", "الهدف الحقيقي".
8. LaTeX: Use $...$ for inline and $$...$$ for block formulas. English ONLY.
9. QUIZ RULE: Questions ("q") and "options" MUST be in English ONLY. "reasoning" MUST be in Jordanian Arabic.
`;
}

function requiredQuizCount(mode: Mode) {
    return mode === 'exam' ? 10 : 2;
}

function validateResultShape(result: any, mode: Mode) {
    if (!result || typeof result !== 'object') return false;
    if (!Array.isArray(result.quiz) || result.quiz.length !== requiredQuizCount(mode)) return false;
    if (mode !== 'exam' && (!result.explanation || typeof result.explanation !== 'object')) return false;
    return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const today = new Date().toISOString().split('T')[0];
        const userRef = db.collection('users').doc(uid);

        const { textContentArray, mode, thumbnail } = req.body;
        const resolvedMode: Mode = mode || 'simple';
        const combinedText = (textContentArray || []).join('\n');

        const systemPrompt = buildSystemPrompt();
        const userPrompt = `
SLIDE TEXT CONTENT:
${combinedText}

CRITICAL "QUDAH WAY" EXTRACTION & FORMATTING:

1. **100% Text-to-Explanation**: For every single bullet, title, or important line in the slide, you MUST provide:
   - "heading": The English Text (exactly as written in the slide).
   - "text": A detailed Jordanian Arabic explanation in QudahWay style.
2. **The "Qudah Way" Tone**: 
   - Use warm, conversational Jordanian Ammiya.
   - Use phrases like: "السر هون", "فخ امتحان", "عشان تشد الانتباه", "الهدف الحقيقي".
   - **CRITICAL**: Use "هاض", "مثل", "كثير", "ثانية", "هسا".
3. **Quiz Language**:
   - The question ("q") and all 4 "options" MUST be in English.
   - The "reasoning" MUST be in Jordanian Arabic (QudahWay style).

EXAMPLE JSON ELEMENT:
{
  "heading": "Skip Lists use multiple layers for faster search",
  "text": "ببساطة، الـ Skip List هي طريقة ذكية عشان نسرع البحث. تخيل إنك بطلعة درج طويل، وبدل ما تطلع درجة درجة (هاض البحث العادي)، بتقرر تنط كل 5 درجات مرة وحدة عشان توصل أسرع. هاض هو السر هون! بنعمل طبقات فوق بعض عشان نختصر الوقت."
}

MODE: ${resolvedMode.toUpperCase()}
REQUIRED MCQS: ${requiredQuizCount(resolvedMode)}

REMINDER: Scan for "هاد" (to "هاض"), "متل" (to "مثل"), "كتير" (to "كثير").
`;

        const messages: any[] = [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: [
                    { type: 'text', text: userPrompt },
                    ...(thumbnail ? [{
                        type: 'image_url',
                        image_url: { url: thumbnail }
                    }] : [])
                ]
            }
        ];

        let lastError: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                console.log(`Attempt ${attempt + 1} | Model: ${MODEL_ID} | Vision: ${!!thumbnail}`);
                const chatCompletion = await groq.chat.completions.create({
                    messages,
                    model: MODEL_ID,
                    response_format: { type: 'json_object' },
                    temperature: 0.1,
                });

                const raw = chatCompletion.choices[0]?.message?.content || '{}';
                const parsed = JSON.parse(raw);

                if (validateResultShape(parsed, resolvedMode)) {
                    await updateUsage(uid, today, (userRef as any));
                    return res.status(200).json(parsed);
                }
                throw new Error('INVALID_SHAPE');
            } catch (err: any) {
                console.warn(`Attempt ${attempt + 1} failed: ${err.message}`);
                lastError = err;
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        res.status(503).json({ error: 'System busy. Please try again.', details: lastError?.message });
    } catch (error: any) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
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
