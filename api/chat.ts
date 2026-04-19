import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI((process.env.GEMINI_API_KEY || '').trim());

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

/**
 * Strips any model "thinking" / analysis preamble that Gemma 4 sometimes outputs
 * before giving the actual conversational reply.
 */
function cleanReply(raw: string): string {
    // Remove <think>...</think> blocks (explicit thinking tags)
    let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');

    // Split into lines and drop any "analysis" lines we can detect heuristically
    const lines = cleaned.split('\n');
    const replyLines: string[] = [];
    let foundRealReply = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines before we have real content
        if (!foundRealReply && trimmed === '') continue;

        // Heuristic: lines that look like meta-commentary / reasoning
        const isMetaLine =
            /^[\*\-•]\s*\*(Incorrect|Too formal|Too slang|Correct|Balanced|Option \d|Greeting|Casual|Study)/.test(trimmed) ||
            /^[\*\-•]?\s*(Option \d|✅|❌)/.test(trimmed) ||
            /^(Needs to be|Since the persona|Background in|Persona:|Dialect:|Cheerful|Avoid formal|Jordanian)/.test(trimmed) ||
            /^(NLP|Machine Translation|Sentiment Analysis|Text Generation|Text Classification|Named Entity)/.test(trimmed) ||
            /^"قُضاة"\s*\(Qudah\)/.test(trimmed);

        if (isMetaLine) continue;

        foundRealReply = true;
        replyLines.push(line);
    }

    cleaned = replyLines.join('\n').trim();

    // If stripping made it empty, return the raw (something is better than nothing)
    return cleaned || raw.trim();
}

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

        // Priming history: multiple shot examples showing the DIRECT, friendly Jordanian style.
        // Each pair anchors a different conversational scenario so the model learns the pattern.
        const primingHistory = [
            // Shot 1: simple greeting
            { role: 'user', parts: [{ text: 'هلا' }] },
            { role: 'model', parts: [{ text: `هلا والله ${safeName}! 😄 كيفك؟ شو بدك نطحن اليوم؟` }] },
            // Shot 2: "how are you"
            { role: 'user', parts: [{ text: 'شو اخبارك' }] },
            { role: 'model', parts: [{ text: `بأحسن حال طالما إنه قاعدين بنطحن دراسة ومع بعض بنفهم هالمواد 💪 وانت كيفك ${safeName}؟` }] },
            // Shot 3: who are you
            { role: 'user', parts: [{ text: 'مين انت؟' }] },
            { role: 'model', parts: [{ text: `أنا قُضاة، صاحبك بالدراسة 😎 لما بدك تفهم شي بالسلايدات أنا موجود وبشرحلك بأسلوبي.` }] },
        ];

        // Actual conversation history (strip system messages, exclude the latest user message)
        const conversationHistory = messages
            .filter(m => m.role !== 'system')
            .slice(0, -1)
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

        // Append slide context as a silent model note only when relevant
        const contextNote = slideContext
            ? `[سياق: الطالب قاعد يدرس السلايد التالي — ${slideContext.substring(0, 200)}]`
            : null;

        const model = genAI.getGenerativeModel({ model: 'gemma-4-31b-it' });

        const chat = model.startChat({
            history: [...primingHistory, ...conversationHistory],
            generationConfig: { maxOutputTokens: 800, temperature: 0.8 }
        });

        // If there's slide context, prepend it silently to the user message
        const messageToSend = contextNote
            ? `${contextNote}\n${latestUserMessage}`
            : latestUserMessage;

        const result = await chat.sendMessage(messageToSend);
        const rawReply = result.response.text();
        const reply = cleanReply(rawReply);

        return res.status(200).json({
            reply,
            meta: { usedModel: 'gemma-4-31b-it', usedSlideContext: !!slideContext }
        });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return res.status(500).json({ error: 'Failed to connect to AI', details: error?.message });
    }
}