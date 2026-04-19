import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI((process.env.GEMINI_API_KEY || '').trim());

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized: Missing Token' }); return; }
        await auth.verifyIdToken(authHeader.split('Bearer ')[1]);

        const { textContentArray, slideNumbers } = req.body as {
            textContentArray?: string[];
            slideNumbers: number[];
        };

        const slideContexts = slideNumbers
            .map((num: number, i: number) => `[SLIDE ${num}]: ${textContentArray?.[i] || 'No text'}`)
            .join('\n\n');

        const systemInstruction = `You are the "QudahWay Storyteller", an expert English-speaking tutor.
Create a natural, comprehensive voice script for the slide content.
RULES:
1. Start directly — NO "Hello", "In this slide", or "I will explain".
2. Flowing narrative, NOT bullet points.
3. Professional yet friendly tone.
4. 1-3 well-structured paragraphs covering EVERYTHING on the slide.`;

        const model = genAI.getGenerativeModel({
            model: 'gemma-4-31b-it',
            systemInstruction,
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.5
            }
        });

        const result = await model.generateContent(
            `SLIDE CONTENT:\n${slideContexts}\n\nReturn a JSON object with key "voiceScript" containing the narrative script.`
        );

        const raw = result.response.text() || '{}';
        res.status(200).json(JSON.parse(raw));

    } catch (error: any) {
        console.error('Voice Gen Error:', error);
        res.status(500).json({ error: error?.message || 'Server error' });
    }
}
