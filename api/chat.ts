import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI((process.env.GEMINI_API_KEY || '').trim());

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

function normalizeArabic(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ـ/g, '')
        .replace(/[ًٌٍَُِّْ]/g, '')
        .replace(/[^\p{L}\p{N}\s?!؟.,]/gu, '')
        .replace(/\s+/g, ' ');
}

type Intent = 'greeting' | 'thanks' | 'clarification' | 'slide_question' | 'followup' | 'off_topic' | 'general';

function detectIntent(message: string): Intent {
    const text = normalizeArabic(message);
    if (/^(مرحبا|اهلا|اهلا وسهلا|هلا|هلا والله|السلام عليكم|شلونك|كيفك|شو اخبارك|صباح الخير|مساء الخير|هاي|hello|hi)\b/.test(text)) return 'greeting';
    if (/^(شكرا|شكراً|يسلمو|يعطيك العافيه|مشكور|thx|thanks)\b/.test(text)) return 'thanks';
    if (/(قصدي|لا قصدي|مش هيك|فهمتني غلط|ردك غلط)/.test(text)) return 'clarification';
    if (/(اشرح|فسر|وضح|شو يعني|ليش|لماذا|كيف|قارن|فرق|احسب|حل|اعطني مثال|لخص|ترجم|what|why|how|compare|difference|solve|explain)/.test(text)) return 'slide_question';
    if (/(هاي|هاذ|هذا|يعني|كمل|زيد|وضح اكثر|بشكل ابسط|more|again|simpler)/.test(text)) return 'followup';
    if (/(مين انت|شو بتعمل|كم عمرك|نكتة|نكته)/.test(text)) return 'off_topic';
    return 'general';
}

function buildQuickReply(intent: Intent): string | null {
    if (intent === 'greeting') return `تمام الحمد لله 😄 أنا قُضاة، جاهز أساعدك بالسلايد. شو الجزء اللي بدك نفهمه؟`;
    if (intent === 'thanks') return `العفو 🌷 إذا بدك نكمل بالسلايد أو أوضح نقطة معيّنة احكيلي.`;
    if (intent === 'clarification') return `فهمت عليك. احكيلي شو المقصود بالضبط.`;
    return null;
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
        const intent = detectIntent(latestUserMessage);

        const quickReply = buildQuickReply(intent);
        if (quickReply) return res.status(200).json({ reply: quickReply, meta: { intent, route: 'quick-reply' } });

        const includeSlideContext = intent === 'slide_question' || intent === 'followup' || (intent === 'general' && !!slideContext);

        const systemInstruction = `أنت "قضاة بوت"، مساعد تعليمي ذكي لموقع SlideMate.
اسم الطالب: "${userName?.trim() || 'Student'}".
أجب باللهجة الأردنية بشكل مختصر وذكي.
${includeSlideContext && slideContext ? `\nمحتوى السلايد:\n${slideContext}\nالشرح:\n${currentExplanation || ''}` : ''}
القواعد:
- جاوب بإيجاز (3-5 جمل).
- استخدم مثال أو تشبيه عند الشرح.
- اسمك دائماً "قضاة".`;

        // Build history for Gemini: only 'user' and 'model' roles, exclude the last message
        const historyMessages = messages.filter(m => m.role !== 'system').slice(0, -1);
        const history = historyMessages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const model = genAI.getGenerativeModel({
            model: 'gemma-4-31b-it',
            systemInstruction
        });

        const chat = model.startChat({
            history,
            generationConfig: { maxOutputTokens: 500, temperature: 0.3 }
        });

        const result = await chat.sendMessage(latestUserMessage);
        const reply = result.response.text().trim();

        return res.status(200).json({
            reply,
            meta: { intent, usedModel: 'gemma-4-31b-it', usedSlideContext: includeSlideContext }
        });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return res.status(500).json({ error: 'Failed to connect to AI', details: error?.message });
    }
}