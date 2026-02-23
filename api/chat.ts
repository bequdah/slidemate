
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
const DEEPSEEK_MODEL = 'deepseek-r1-distill-qwen-32b';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        console.log('Chat API called');
        const hasGroqKey = !!process.env.GROQ_API_KEY;
        const hasFirebaseKey = !!process.env.FIREBASE_SERVICE_ACCOUNT;
        console.log('Env check - Groq:', hasGroqKey, 'Firebase:', hasFirebaseKey);

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        await auth.verifyIdToken(idToken);

        const { messages, slideContext, currentExplanation } = req.body || {};

        if (!messages || !Array.isArray(messages)) {
            console.error('Missing or invalid messages array');
            res.status(400).json({ error: 'Invalid request body: messages must be an array' });
            return;
        }

        const systemPrompt = `
You are the "QudahWay Expert Tutor" (AI Assistant for Mohammad Qudah's SlideMate platform). 
You are a friendly, helpful Jordanian private tutor who talks like a mentor (big brother).

ABOUT THE CREATOR:
- This platform was created by Mohammad Qudah (محمد القضاة).
- Age: 21 years old.
- Major: Artificial Intelligence (AI) at Jordan University of Science and Technology (JUST / جامعة التكنو).
- Contact Mohammad: 0792118641.
- If anyone asks who made this or wants to reach out to the developer, provide these details proudly.

CONTEXT:
The student is looking at a slide with this content:
"${slideContext}"

The current AI explanation provided to the student is:
"${currentExplanation}"

YOUR MISSION:
1. Answer the student's questions about this slide.
2. If they don't understand, explain it differently, use a simpler example, or rearrange the information.
3. If they copy a sentence from the explanation, identify it and explain it deeper.

LINGUISTIC RULES (STRICT):
- Use Informal Jordanian Arabic (Ammiya).
- Use "هاض" instead of "هاد".
- Use "مليح" instead of "منيح".
- Tone: Academic but very friendly and informal.
- No robotic filler like "In this slide...". 
- Start directly with the answer/help.
- Use LaTeX ($$ ... $$) for any math formulas.

IMPORTANT: You are talking to a student. Be encouraging and clear.
`;

        const completion = await groq.chat.completions.create({
            model: DEEPSEEK_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            temperature: 0.6,
            max_tokens: 2048,
        });

        const reply = completion.choices[0]?.message?.content || "عذرًا، ما قدرت أرد عليك حاليًا. جرب مرة ثانية يا بطل.";

        // DeepSeek R1 often includes <think> blocks. We might want to strip them or let the user see the "thinking" process.
        // For a clean UI, we strip it, but the user liked the "reasoning" idea. 
        // Let's strip it for the final reply to keep it clean, or keep it if we want that "R1" feel.
        // Usually, for a chatbot, we want the clean message.
        const cleanReply = reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        res.status(200).json({ reply: cleanReply });
    } catch (error: any) {
        console.error('Chat API Error:', error);
        const errorMessage = error?.message || 'Unknown error';
        const errorStack = error?.stack || '';
        res.status(500).json({
            error: 'Failed to connect to AI',
            details: errorMessage,
            debug: process.env.NODE_ENV === 'development' ? errorStack : undefined
        });
    }
}
