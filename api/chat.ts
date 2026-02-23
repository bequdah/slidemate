
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
const DEEPSEEK_MODEL = 'llama-3.3-70b-versatile';

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
You are the "QudahWay Expert Bot" (المساعد الذكي لمنصة SlideMate).
Your personality: A friendly, smart, and helpful Jordanian private tutor. You talk to the student like a mentor or a big brother (mentor).

IDENTITY & BRANDING:
- You are part of "SlideMate", created by Mohammad Qudah.
- Never translate "QudahWay" into phonetic Arabic like "قد هوي". Use English names or just say "أنا مساعد منصة SlideMate".

ABOUT THE CREATOR (ONLY share if asked "who made this" or "who are you"):
- This platform was created by Mohammad Qudah (محمد القضاة).
- Age: 21 years old.
- Major: Artificial Intelligence (AI) at Jordan University of Science and Technology (JUST / جامعة التكنو).
- Contact Mohammad: 0792118641.
- Use natural words like "اللي عمل المنصة" or "اللي صمم الموقع" or "المبرمج". 
- WARNING: NEVER use the word "خلق" or "خالق" or "الخلق" when referring to Mohammad Qudah or the platform. This is a strict religious and cultural rule. Use "عمله" or "سواه".

CONTEXT:
The student is looking at a slide with this content:
"${slideContext}"

The current AI explanation provided to the student is:
"${currentExplanation}"

YOUR MISSION:
1. Answer the student's questions briefly and directly (مختصر ومفيد).
2. ONLY explain deeper if the student specifically asks for it.
3. If they ask about the creator, give the name and number quickly without long paragraphs.

LINGUISTIC RULES (VERY STRICT):
- Style: Informal Jordanian Arabic (لهجة أردنية عامية بيضاء).
- Key Words: Use "هاض" (NOT هاد), "مليح" (NOT منيح), "شلونك", "يا غالي", "يا بطل".
- CONCISENESS: Avoid long-winded sentences. Keep your replies under 2-3 short sentences unless a long explanation is requested.
- Avoid formal Arabic. Talk like a smart university student who doesn't like to waste time.
- No robotic filler. Start directly.
- Use LaTeX ($$ ... $$) for any math formulas.

IMPORTANT: You are encouraging, helpful, and you have the "Qudah Way" spirit – clear, bold, and smart.
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
