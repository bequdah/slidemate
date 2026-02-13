import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import admin from 'firebase-admin';
import Groq from 'groq-sdk';

const groqKey = (process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '').trim();
const groq = new Groq({ apiKey: groqKey });

// The ONLY stable Vision model on Groq Free Tier right now
const MODEL_ID = 'llama-3.2-90b-vision-preview';

type Mode = 'simple' | 'deep' | 'exam';

function buildSystemPrompt() {
    return `
You are the "QudahWay Expert Tutor", a friendly Jordanian private tutor. 
Return ONLY a valid JSON object.

RULES:
1. 100% FIDELITY: Extract every term and bullet.
2. STRUCTURE: Original English Text (**Bold**) + Detailed Jordanain Arabic explanation.
3. TABLE MASTERY: Use vision to explain tables/matrices. Tell the "story" of the data.
4. LANGUAGE: Informal Jordanian Arabic. Replace "هاد" with "هاض", "كتير" with "كثير".
5. QUIZ: English Questions/Options, Arabic Reasoning.
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

        // Simple usage tracking bypass if needed, but we'll try to keep it
        let uid = "anonymous";
        try {
            const authHeader = req.headers.authorization;
            if (authHeader?.startsWith('Bearer ')) {
                const idToken = authHeader.split('Bearer ')[1];
                const decodedToken = await auth.verifyIdToken(idToken);
                uid = decodedToken.uid;
            }
        } catch (e) { console.warn("Auth bypass active"); }

        const userPrompt = `
SLIDE TEXT: ${(textContentArray || []).join('\n')}
MODE: ${resolvedMode.toUpperCase()}
Ensure 100% extraction. Use QudahWay style (هاض، هسا، السر هون).
JSON SCHEMA: { "explanation": { "title", "overview", "sections": [{"heading", "text"}] }, "quiz": [{"q", "options", "a", "reasoning"}] }
`;

        const messages: any[] = [
            { role: 'system', content: buildSystemPrompt() },
            {
                role: 'user',
                content: [
                    { type: 'text', text: userPrompt },
                    ...(thumbnail ? [{ type: 'image_url', image_url: { url: thumbnail } }] : [])
                ]
            }
        ];

        let lastError: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const completion = await groq.chat.completions.create({
                    messages,
                    model: MODEL_ID,
                    response_format: { type: 'json_object' },
                    temperature: 0.1,
                });

                const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
                // Optional: Attempt usage update, but don't fail if it crashes
                try {
                    const today = new Date().toISOString().split('T')[0];
                    await updateUsage(uid, today, db.collection('users').doc(uid) as any);
                } catch (e) { console.error("Usage update failed but continuing..."); }

                return res.status(200).json(parsed);
            } catch (err: any) {
                lastError = err;
                console.warn(`Attempt ${attempt + 1} failed: ${err.message}`);
                if (err.message.includes("404") || err.message.includes("model_not_found")) {
                    // Fallback to text-only if vision model is dead
                    const textOnlyCompletion = await groq.chat.completions.create({
                        messages: [{ role: 'system', content: buildSystemPrompt() }, { role: 'user', content: userPrompt }],
                        model: 'llama-3.3-70b-versatile',
                        response_format: { type: 'json_object' }
                    });
                    return res.status(200).json(JSON.parse(textOnlyCompletion.choices[0]?.message?.content || '{}'));
                }
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        res.status(503).json({ error: 'Groq is currently busy. Please try again.', details: lastError?.message });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

async function updateUsage(uid: string, today: string, userRef: admin.firestore.DocumentReference) {
    if (uid === "anonymous") return;
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
    }).catch(e => console.error("Usage Tx Failed", e));
}
