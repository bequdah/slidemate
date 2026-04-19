import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI((process.env.GEMINI_API_KEY || '').trim());

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

/**
 * Aggressively cleans any meta-reasoning, thought blocks, or prompt-leaked headers.
 */
function cleanReply(raw: string): string {
    // 1. Remove <think> blocks
    let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');

    const lines = cleaned.split('\n');
    const filteredLines: string[] = [];
    let foundGreetingOrArabic = false;

    for (const line of lines) {
        const t = line.trim();
        if (!t) {
            if (foundGreetingOrArabic) filteredLines.push(line);
            continue;
        }

        // 2. Blacklist meta-labels and reasoning headers (common Gemma 4 leaks)
        const isBlacklisted = 
            /^(Context|Persona|Goal|Tone|Instruction|Constraint|User input|Acknowledge|Pivot|Explanation|Simplified|Slide Content|Step|Option|Greeting|Casual vibe|Study nudge|Background in)/i.test(t) ||
            /^[*\-\•\s]*\*(Incorrect|Correct|Too|Balanced|Option|Formal|Slang)/i.test(t) ||
            /^[*\-\•\s]*\d+\.\s*(Acknowledge|Pivot|Explain|Transition)/i.test(t) ||
            /^"قُضاة"\s*\(Qudah\)/i.test(t) ||
            /^(What is NLP|Why\?|How am I|Closing|Transition):/i.test(t) ||
            /^(Student name|Name|Dialect):/i.test(t);

        if (isBlacklisted && !foundGreetingOrArabic) continue;

        // 3. Heuristic: If the line contains significant Arabic text, it's likely the actual reply
        const hasArabic = /[\u0600-\u06FF]/.test(t);
        if (hasArabic) foundGreetingOrArabic = true;

        if (foundGreetingOrArabic) {
            filteredLines.push(line);
        }
    }

    // 4. Final polish: if the model wrapped the final reply in quotes, unwrap it
    let result = filteredLines.join('\n').trim();
    if (result.startsWith('"') && result.endsWith('"') && (result.match(/"/g) || []).length === 2) {
        result = result.substring(1, result.length - 1);
    }
    
    return result || raw.trim();
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
        const safeName = userName?.trim() || 'يا بطلب';

        // Priming history: No instructions, just pure conversational examples.
        const primingHistory = [
            { role: 'user', parts: [{ text: 'مرحبا' }] },
            { role: 'model', parts: [{ text: `هلا والله ${safeName}! 😄 كيفك؟ شو حاب نسولف أو نطحن مادة اليوم؟` }] },
            { role: 'user', parts: [{ text: 'شو اخبارك' }] },
            { role: 'model', parts: [{ text: `بأحسن حال طالما إنه قاعدين بنطحن دراسة ومع بعض بنفهم هالمواد 💪 بشرني عنك؟` }] },
        ];

        const model = genAI.getGenerativeModel({ model: 'gemma-4-31b-it' });

        // Build history
        const history = [
            ...primingHistory,
            ...messages.filter(m => m.role !== 'system').slice(0, -1).map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }))
        ];

        const chat = model.startChat({
            history,
            generationConfig: { maxOutputTokens: 600, temperature: 0.8 }
        });

        // Prepend context only as a "Thought Note" that we then filter out if leaked.
        const contextualPrompt = slideContext 
            ? `(سياق السلايد الحالي: ${slideContext.substring(0, 300)})\n\n${latestUserMessage}`
            : latestUserMessage;

        const result = await chat.sendMessage(contextualPrompt);
        const reply = cleanReply(result.response.text());

        return res.status(200).json({
            reply,
            meta: { usedModel: 'gemma-4-31b-it', usedSlideContext: !!slideContext }
        });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return res.status(500).json({ error: 'Server connection failed' });
    }
}