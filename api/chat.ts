import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI((process.env.GEMINI_API_KEY || '').trim());

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
        await auth.verifyIdToken(authHeader.split('Bearer ')[1]);

        const { messages, slideContext, currentExplanation, userName }: {
            messages?: ChatMessage[];
            slideContext?: string;
            currentExplanation?: string;
            userName?: string;
        } = req.body || {};

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Invalid messages' });
        }

        const latestUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content?.trim() || '';
        const safeName = userName?.trim() || 'يا بطل';

        // NO systemInstruction - Gemma 4 leaks it.
        // Instead: inject a natural "priming" conversation at the very start of history.
        // This anchors the bot's identity without any risk of leakage.
        const primingHistory = [
            {
                role: 'user',
                parts: [{ text: 'مرحبا' }]
            },
            {
                role: 'model',
                parts: [{ text: `هلا والله ${safeName}! 😄 أنا قُضاة، صاحبك بالدراسة. كيفك؟ شو بدك نشتغل عليه اليوم؟${slideContext ? `\n\n(سلايدنا الحين عن: ${slideContext.substring(0, 120)}...)` : ''}` }]
            }
        ];

        // Real conversation history (exclude system messages, exclude last user message)
        const conversationHistory = messages
            .filter(m => m.role !== 'system')
            .slice(0, -1)
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

        const model = genAI.getGenerativeModel({ model: 'gemma-4-31b-it' });

        const chat = model.startChat({
            history: [...primingHistory, ...conversationHistory],
            generationConfig: {
                maxOutputTokens: 800,
                temperature: 0.85
            }
        });

        const result = await chat.sendMessage(latestUserMessage);
        const reply = result.response.text().trim();

        return res.status(200).json({
            reply,
            meta: { usedModel: 'gemma-4-31b-it', usedSlideContext: !!slideContext }
        });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return res.status(500).json({ error: 'Failed to connect to AI', details: error?.message });
    }
}