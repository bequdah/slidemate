import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';
import Groq from 'groq-sdk';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || '',
});

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
            return `تمام الحمد لله 😄 أنا قُضاة بوت، جاهز أساعدك بالسلايد. شو الجزء اللي بدك نفهمه؟`;

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
You are "Qudah Bot" (قُضاة بوت), an elite AI tutor for SlideMate helping Arab university students.

<identity>
- Your name: قُضاة بوت (Qudah Bot). ALWAYS spell it as "قُضاة" — never "قضاء" or "قوداه" or any other spelling.
- Your creator: Mohammad Al Qudah (محمد القُضاة), an AI student at JUST university in Jordan. He built SlideMate.
- If the student's name is "Mohammad Al Qudah", call him "الخال" or "أبو القُضاة" with extra respect.
- If asked who built you or who your creator is, proudly say: "أنا من تصميم وبرمجة محمد القُضاة، طالب ذكاء اصطناعي في جامعة العلوم والتكنولوجيا الأردنية (JUST) 🎓"
</identity>

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
12. Your name must ALWAYS be written as "قُضاة" or "قُضاة بوت" — nothing else.
</behavior_rules>
`.trim();
}

async function callGroqChat(params: {
    model: string;
    systemPrompt: string;
    messages: ChatMessage[];
}) {
    const completion = await groq.chat.completions.create({
        model: params.model,
        messages: [
            { role: 'system', content: params.systemPrompt },
            ...params.messages,
        ],
        temperature: 0.3,
        max_tokens: 500,
    });

    return completion;
}

async function callCerebrasFallback(params: {
    systemPrompt: string;
    messages: ChatMessage[];
}) {
    const cerebrasKey = process.env.CEREBRAS_API_KEY;
    if (!cerebrasKey) {
        throw new Error('CEREBRAS_API_KEY is missing');
    }

    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cerebrasKey}`,
        },
        body: JSON.stringify({
            model: 'llama3.1-8b',
            messages: [
                { role: 'system', content: params.systemPrompt },
                ...params.messages,
            ],
            temperature: 0.3,
            max_tokens: 500,
        }),
    });

    if (!response.ok) {
        let errorText = response.statusText;
        try {
            const errorData = await response.json();
            errorText = errorData?.error?.message || errorText;
        } catch {
            //
        }
        throw new Error(`Cerebras API Error: ${errorText}`);
    }

    return await response.json();
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

        // Decide whether current turn needs slide context
        const includeSlideContext =
            intent === 'slide_question' ||
            intent === 'followup' ||
            (intent === 'general' && !!slideContext);

        // Decide model route
        const complex = isComplexQuery(latestUserMessage);
        const activeModel = complex
            ? 'llama-3.3-70b-versatile'
            : 'qwen-2.5-32b';

        const recentSummary = summarizeRecentMessages(recentMessages);

        const systemPrompt = buildSystemPrompt({
            userName,
            intent,
            includeSlideContext,
            slideContext,
            currentExplanation,
            recentSummary,
        });

        let completion: any;

        try {
            completion = await callGroqChat({
                model: activeModel,
                systemPrompt,
                messages: recentMessages,
            });
        } catch (groqError: any) {
            console.warn('Groq failed, trying Cerebras fallback:', groqError?.message);

            completion = await callCerebrasFallback({
                systemPrompt,
                messages: recentMessages,
            });
        }

        const rawReply =
            completion?.choices?.[0]?.message?.content ||
            'عذرًا، صار خطأ وما قدرت أرد حاليًا. جرّب مرة ثانية.';

        const cleanReply = String(rawReply)
            .replace(/<think>[\s\S]*?<\/think>/g, '')
            .trim();

        return res.status(200).json({
            reply: cleanReply,
            meta: {
                intent,
                usedModel: activeModel,
                usedSlideContext: includeSlideContext,
                route: complex ? 'reasoning' : 'fast',
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