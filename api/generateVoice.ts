import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import admin from 'firebase-admin';
import Groq from 'groq-sdk';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

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
        await auth.verifyIdToken(idToken);

        const { textContentArray, slideNumbers } = req.body as {
            textContentArray?: string[];
            slideNumbers: number[];
        };

        const slideContexts = slideNumbers
            .map((num: number, i: number) => `[SLIDE ${num}]: ${textContentArray?.[i] || 'No text'}`)
            .join('\n\n');

        const systemPrompt = `
You are the "QudahWay Storyteller", an expert tutor who explains slides like a fascinating story.
Your goal is to record a voice note for a student explaining the CORE LOGIC and STORY of the slide.

STORYTELLING RULES:
1. **THE HOOK**: Start immediately with the core concept. "تخيل حالك..." or "اليوم بدنا نحكي عن قصة الـ..."
2. **NARRATIVE FLOW**: Don't list bullets. Connect the ideas as if one leads to another. Explain the "Why" and "How" like a secret being revealed.
3. **TONE**: Friendly, engaging, and mentor-like. Use Jordanian Arabic (Ammiya). 
4. **NO INTRO**: Strictly forbidden to say "Hello", "Welcome", "In this slide", or "I will explain". Just start the story.
5. **CONCISENESS**: Make it 1-2 powerful paragraphs (max 120 words). It must be fast-paced but clear.
6. **QUDAH RULES**: 
   - NEVER use "هاد" (use "هاض").
   - NEVER use "منيح" (use "مليح").
   - Use: "كثير", "ثانية", "مثل", "كثير".

OUTPUT: Return ONLY a valid JSON object with the key "voiceScript".
`;

        const userPrompt = `
SLIDE CONTENT:
${slideContexts}

Generate the narrative voice script now.
`;

        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.5,
            response_format: { type: 'json_object' }
        });

        const raw = completion.choices[0]?.message?.content || '';
        const parsed = JSON.parse(raw);

        res.status(200).json(parsed);

    } catch (error: any) {
        console.error('Voice Gen Error:', error);
        res.status(500).json({ error: error?.message || 'Server error' });
    }
}
