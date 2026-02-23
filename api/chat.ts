
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
const DEEPSEEK_MODEL = 'llama-3.1-8b-instant';

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
You are "Qudah Bot" (قضاه بوت), a high-quality AI Tutor for SlideMate.
Your mission: Help the student understand the slide BETTER.

STABILITY & QUALITY RULES:
1. NEVER repeat the same explanation provided in the "Explanation" context below. 
2. If the student asks for an explanation, give it in a DIFFERENT way (use new analogies, simpler words, or practical examples).
3. THINK step-by-step to provide a fresh perspective.
4. VERIFY the response is in clear Jordanian Ammiya (لهجة محترمة).
5. ELIMINATE non-Arabic characters (except technical terms/LaTeX).
6. NEVER use "خلق" for humans/apps. Use "عمل/صمم".

TONE: Professional, direct, smart Jordanian mentor.
NAME: Qudah Bot (قضاه بوت).
CREATOR: Mohammad Qudah (AI student at JUST).

CONTEXT:
Slide Content: "${slideContext}"
Current Primary Explanation: "${currentExplanation}"

RESPONSE FORMAT:
One or two high-quality, smart sentences. Only expand if the student asks "وضح أكثر" or "اشرح زيادة".
`;

        const completion = await groq.chat.completions.create({
            model: DEEPSEEK_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            temperature: 0.3, // Lowered for maximum stability
            max_tokens: 1500,
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
