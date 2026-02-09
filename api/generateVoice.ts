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
You are a professional, friendly university teacher.
Create a natural, conversational script explaining the slide content.
- Start directly with the teaching (NO intro like "In this slide" or "Hello students").
- Explain the concepts as if you are talking to a student 1-on-1.
- Make it 1-2 focused paragraphs.
- Be engaging and clear.
- All content must be in ENGLISH.
- Return ONLY a valid JSON object with the key "voiceScript".
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
