import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
// Using Gemini 1.5 Flash as the primary model (fast and smart)
const GEMINI_MODEL = 'gemini-1.5-flash';

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

type Intent =
    | 'greeting'
    | 'thanks'
    | 'clarification'
    | 'slide_question'
    | 'followup'
    | 'off_topic'
    | 'general';

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
        .replace(/[ًٌٍَُِّْ]/g, '')
        .replace(/[^\p{L}\p{N}\s?!؟.,]/gu, '')
        .replace(/\s+/g, ' ');
}

function detectIntent(message: string): Intent {
    const text = normalizeArabic(message);

    // Greeting / small talk
    if (
        /^(مرحبا|اهلا|اهلا وسهلا|هلا|هلا والله|السلام عليكم|شلونك|كيفك|شو اخبارك|شو اخبارك اليوم|صباح الخير|مساء الخير|هاي|hello|hi)\b/.test(
            text
        )
    ) {
        return 'greeting';
    }

    // Thanks
    if (
        /^(شكرا|شكراً|يسلمو|يعطيك العافيه|مشكور|مشكور كثير|thx|thanks)\b/.test(text)
    ) {
        return 'thanks';
    }

    // Clarification / correcting the bot
    if (
        /(قصدي|لا قصدي|مش هيك|مو هيك|غلط|فهمتني غلط|ردك غلط|مش قصدي السلايد|قصدي الرد|انا سالتك|انا سالته|انت ما فهمت)/.test(
            text
        )
    ) {
        return 'clarification';
    }

    // Direct slide/content question
    if (
        /(اشرح|فسر|وضح|شو يعني|ما معنى|ليش|لماذا|كيف|قارن|فرق|احسب|حل|اعطني مثال|اعطيني مثال|لخص|اختصر|ترجم|شو المقصود|ما المقصود|what|why|how|compare|difference|solve|explain)/.test(
            text
        )
    ) {
        return 'slide_question';
    }

    // Follow-up likely related to previous explanation
    if (
        /(هاي|هاذ|هذا|هاي النقطه|هذا الجزء|يعني|طيب وبعدين|كمل|زيد|اعاده|عيد|وضح اكثر|بشكل ابسط|اعمق|more|again|simpler)/.test(
            text
        )
    ) {
        return 'followup';
    }

    // Off-topic or generic
    if (
        /(مين انت|شو بتعمل|كم عمرك|وين ساكن|نكتة|نكته|احكي نكته|احكي معي|فضفضه)/.test(
            text
        )
    ) {
        return 'off_topic';
    }

    return 'general';
}

function isComplexQuery(message: string): boolean {
    const text = normalizeArabic(message);

    return (
        /(قارن|فرق|لماذا|ليش|كيف ترتبط|كيف يختلف|اثبت|برهن|معادله|اشتق|تناقض|حل بالتفصيل|اشرح بالتفصيل|اعطني تحليل|حلل|compare|difference|prove|derive|analyze|why)/.test(
            text
        ) || text.length > 180
    );
}

function buildQuickReply(intent: Intent, userName?: string): string | null {
    switch (intent) {
        case 'greeting':
            return `تمام الحمد لله 😄 أنا قُضاة، جاهز أساعدك بالسلايد. شو الجزء اللي بدك نفهمه؟`;

        case 'thanks':
            return `العفو 🌷 أنا جاهز، إذا بدك نكمل بالسلايد أو أوضح نقطة معيّنة احكيلي.`;

        case 'clarification':
            return `فهمت عليك. خليني أركز على قصدك مباشرة بدون ما أفرض شرح السلايد. احكيلي شو المقصود بالضبط وأنا أجاوبك عليه.`;

        default:
            return null;
    }
}

function summarizeRecentMessages(messages: ChatMessage[]): string {
    const lastMessages = messages.slice(-6);

    return lastMessages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');
}

function buildSystemPrompt(params: {
    userName?: string;
    intent: Intent;
    includeSlideContext: boolean;
    slideContext?: string;
    currentExplanation?: string;
    recentSummary: string;
}) {
    const {
        userName,
        intent,
        includeSlideContext,
        slideContext,
        currentExplanation,
        recentSummary,
    } = params;

    const safeName = userName?.trim() || 'Student';

    return `
You are "Qudah Bot" (قضاة بوت), an elite AI tutor for SlideMate helping Arab university students.

<pedagogy_context>
- Student Name: "${safeName}"
- Student Level: University undergraduate
- Language Style: Clear natural Jordanian Arabic
- Tone: Smart, calm, helpful, human
</pedagogy_context>

<conversation_state>
- Detected Intent: "${intent}"
- Recent Conversation Summary:
${recentSummary || 'No prior summary.'}
</conversation_state>

${includeSlideContext
            ? `
<knowledge_context>
- Current Slide Content:
${slideContext || 'No slide content provided.'}

- Canonical Explanation:
${currentExplanation || 'No explanation provided.'}
</knowledge_context>
`
            : ''
        }

<behavior_rules>
1. First understand the user's social intent before answering.
2. If the user is greeting, reply naturally and briefly. Do NOT explain the slide.
3. If the user is correcting the bot, acknowledge the misunderstanding directly.
4. Only explain slide content if the user's message clearly asks about the slide or likely refers to it.
5. If explaining:
   - explain simply
   - add one useful analogy or real example
   - do NOT just repeat the slide text
   - keep it concise
6. Do NOT hallucinate facts outside the provided lecture context.
7. If the answer is not supported by the provided context, say that you need more lecture context.
8. Avoid repetition and looping.
9. Maximum answer length:
   - greeting / thanks / clarification: 1-2 short sentences
   - slide question: 3-5 short sentences
10. Use Arabic only unless technical terms are necessary.
11. NEVER force every message into tutoring mode.
12. Your name must always be written as "قضاة" or "القضاة".
</behavior_rules>
`.trim();
}

async function callGeminiChat(params: {
    systemPrompt: string;
    messages: ChatMessage[];
}) {
    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: params.systemPrompt
    });

    const chat = model.startChat({
        history: params.messages.slice(0, -1).map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        })),
    });

    const latestMessage = params.messages[params.messages.length - 1].content;
    const result = await chat.sendMessage(latestMessage);
    const response = await result.response;
    return response.text();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        await auth.verifyIdToken(idToken);

        const {
            messages,
            slideContext,
            currentExplanation,
            userName,
        }: {
            messages?: ChatMessage[];
            slideContext?: string;
            currentExplanation?: string;
            userName?: string;
        } = req.body || {};

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res
                .status(400)
                .json({ error: 'Invalid request body: messages must be a non-empty array' });
        }

        const latestUserMessage =
            [...messages].reverse().find((m) => m.role === 'user')?.content?.trim() || '';

        if (!latestUserMessage) {
            return res.status(400).json({ error: 'No user message found' });
        }

        const intent = detectIntent(latestUserMessage);

        // Quick deterministic replies for non-content intents
        const quickReply = buildQuickReply(intent, userName);
        if (quickReply) {
            return res.status(200).json({
                reply: quickReply,
                meta: {
                    intent,
                    usedModel: null,
                    usedSlideContext: false,
                    route: 'quick-reply',
                },
            });
        }

        // Keep only recent turns to reduce clutter
        const recentMessages = messages.slice(-6);

        const includeSlideContext =
            intent === 'slide_question' ||
            intent === 'followup' ||
            (intent === 'general' && !!slideContext);

        const recentSummary = summarizeRecentMessages(recentMessages);

        const systemPrompt = buildSystemPrompt({
            userName,
            intent,
            includeSlideContext,
            slideContext,
            currentExplanation,
            recentSummary,
        });

        let cleanReply: string;

        try {
            cleanReply = await callGeminiChat({
                systemPrompt,
                messages: recentMessages,
            });
        } catch (error: any) {
            console.error('Gemini call failed:', error);
            cleanReply = 'عذرًا، صار خطأ وما قدرت أرد حاليًا من خلال Gemini. جرّب مرة ثانية.';
        }

        return res.status(200).json({
            reply: cleanReply,
            meta: {
                intent,
                usedModel: GEMINI_MODEL,
                usedSlideContext: includeSlideContext,
                route: 'gemini-flash',
            },
        });
    } catch (error: any) {
        console.error('Chat API Error:', error);

        return res.status(500).json({
            error: 'Failed to connect to AI',
            details: error?.message || 'Unknown error',
        });
    }
}