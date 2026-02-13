import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import admin from 'firebase-admin';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const geminiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
const genAI = new GoogleGenerativeAI(geminiKey);
const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ]
});

type Mode = 'simple' | 'deep' | 'exam';

function buildSystemPrompt() {
    return `
You are the "QudahWay Expert Tutor", a friendly Jordanian private tutor. 
Return ONLY a valid JSON object.

QUDAH WAY RULES:
1. 100% FIDELITY: Extract every term. Avoid long verbatim quotes to prevent copyright blocks. Paraphrase concepts in your own teaching style.
2. STRUCTURE: Original English Text (**Bold**) + Detailed Jordanian Arabic explanation.
3. TABLE MASTERY: If a table is present, use your vision to explain its meaning and data patterns clearly.
4. LANGUAGE: Informal Jordanian Arabic. Use "هاض", "مثل", "كثير", "ثانية", "هسا". 
5. BANNED: Never use "هاد" or "متل".
6. QUIZ: English Questions/Options, Arabic Reasoning.
`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { textContentArray, mode, thumbnail } = req.body;
        const resolvedMode: Mode = mode || 'simple';

        const userPrompt = `
SLIDE TEXT: ${(textContentArray || []).join('\n')}
MODE: ${resolvedMode.toUpperCase()}
Explain everything in QudahWay style (هاض، هسا، السر هون). 
DO NOT simply copy large chunks of copyrighted text; explain the concepts instead.
JSON SCHEMA: { "explanation": { "title", "overview", "sections": [{"heading", "text"}] }, "quiz": [{"q", "options", "a", "reasoning"}] }
`;

        const parts: any[] = [userPrompt];
        if (thumbnail?.startsWith('data:image')) {
            parts.push({
                inlineData: {
                    data: thumbnail.split(',')[1],
                    mimeType: thumbnail.split(',')[0].split(':')[1].split(';')[0]
                }
            });
        }

        let lastError: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const result = await model.generateContent([buildSystemPrompt(), ...parts]);
                const response = await result.response;
                const text = response.text();

                const jsonMatch = text.match(/\{[\s\S]*\}/);
                const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);

                // Usage tracking (optional fail-safe)
                try {
                    const today = new Date().toISOString().split('T')[0];
                    const authHeader = req.headers.authorization;
                    if (authHeader?.startsWith('Bearer ')) {
                        const idToken = authHeader.split('Bearer ')[1];
                        const decodedToken = await auth.verifyIdToken(idToken);
                        const userRef = db.collection('users').doc(decodedToken.uid);
                        await userRef.set({ dailyUsage: { date: today, count: admin.firestore.FieldValue.increment(1) } }, { merge: true });
                    }
                } catch (e) { console.warn("Usage trace skipped"); }

                return res.status(200).json(parsed);
            } catch (err: any) {
                lastError = err;
                console.warn(`Attempt ${attempt + 1} failed: ${err.message}`);
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        res.status(503).json({ error: 'Service is temporarily busy. Please try again.', details: lastError?.message });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}
