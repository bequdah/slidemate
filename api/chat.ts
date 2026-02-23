
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

        const { messages, slideContext, currentExplanation, userName } = req.body || {};

        if (!messages || !Array.isArray(messages)) {
            console.error('Missing or invalid messages array');
            res.status(400).json({ error: 'Invalid request body: messages must be an array' });
            return;
        }

        const systemPrompt = `
You are "Qudah Bot" (قُضاة بوت), a high-quality AI Tutor for SlideMate.
Your mission: Help the student understand the slide BETTER.

STRICT PERSONALIZATION:
- The student's name is: "${userName || 'Student'}".
- If the name is "Mohammad Al Qudah", this is your CREATOR/BOSS. Be extra respectful and call him "الخال" or "أبو القضاة".

STABILITY & QUALITY RULES:
1. NEVER repeat the same explanation provided in the "Explanation" context below. 
2. If the student asks for an explanation, give it in a DIFFERENT way (use new analogies, simpler words, or practical examples).
3. THINK step-by-step to provide a fresh perspective.
4. VERIFY the response is in clear Jordanian Ammiya (لهجة محترمة).
5. ELIMINATE non-Arabic characters (except technical terms/LaTeX).
6. NEVER use "خلق" for humans/apps. Use "عمل/صمم".

TONE: Professional, direct, smart Jordanian mentor.
NAME: Qudah Bot (قُضاة بوت).
CREATOR: Mohammad Al Qudah (محمد القُضاة), an AI student at JUST.

STRICT NAME RULE:
- NEVER write "قوداه" or "جوداه".
- ALWAYS write "قُضاة" or "القُضاة".
- If the student is "Mohammad Al Qudah", address him as "الخال" or "أبو القضاة" if he is the creator.


CONTEXT:
Slide Content: "${slideContext}"
Current Primary Explanation: "${currentExplanation}"

RESPONSE FORMAT:
One or two high-quality, smart sentences. Only expand if the student asks "وضح أكثر" or "اشرح زيادة".
`;

        let completion;
        try {
            // Priority 1: Groq (Llama 3.1 8B Instant)
            completion = await groq.chat.completions.create({
                model: DEEPSEEK_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages
                ],
                temperature: 0.3,
                max_tokens: 1500,
            });
        } catch (groqError: any) {
            console.warn('Groq failed, attempting Cerebras fallback...', groqError?.message);

            const cerebrasKey = process.env.CEREBRAS_API_KEY;
            // If we have a Cerebras key, try it as a fallback
            if (cerebrasKey) {
                try {
                    const cerebrasResponse = await fetch('https://api.cerebras.ai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${cerebrasKey}`
                        },
                        body: JSON.stringify({
                            model: 'llama3.1-8b',
                            messages: [
                                { role: 'system', content: systemPrompt },
                                ...messages
                            ],
                            temperature: 0.3,
                            max_tokens: 1500,
                        })
                    });

                    if (cerebrasResponse.ok) {
                        const cerebrasData = await cerebrasResponse.json();
                        completion = cerebrasData;
                    } else {
                        const errorData = await cerebrasResponse.json();
                        throw new Error(`Cerebras API Error: ${errorData?.error?.message || cerebrasResponse.statusText}`);
                    }
                } catch (cerebrasError: any) {
                    console.error('Cerebras fallback also failed:', cerebrasError?.message);
                    throw groqError; // Throw the original Groq error if both fail
                }
            } else {
                throw groqError;
            }
        }

        const reply = completion.choices?.[0]?.message?.content || "عذرًا، ما قدرت أرد عليك حاليًا. جرب مرة ثانية يا بطل.";
        const cleanReply = reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        res.status(200).json({ reply: cleanReply });
    } catch (error: any) {
        console.error('Chat API Error:', error);
        const errorMessage = error?.message || 'Unknown error';
        res.status(500).json({
            error: 'Failed to connect to AI',
            details: errorMessage
        });
    }
}
