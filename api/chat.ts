
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
// Removed global DEEPSEEK_MODEL.
// Two-Model Routing dynamically selects between Qwen3 32B (default) and Llama 3.3 70B (complex).

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

        // --- MEMORY OPTIMIZATION (Layer F) ---
        // Keep only the last 4 messages (2 exact turns) to prevent expensive clutter and looping.
        // In a full architecture, older messages would be summarized here.
        const recentMessages = messages.slice(-4);

        // Extract the latest user question to determine routing
        const latestUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';

        // --- TWO-MODEL ROUTING (Layer E) ---
        // Determine complexity by checking for keywords or message length
        const isComplexQuery = /قارن|ليش|لماذا|فرق|احسب|اشرح بالتفصيل|أثبت|معادلة|تناقض|كيف ترتبط|compare|why|difference|prove/i.test(latestUserMessage) || latestUserMessage.length > 150;

        // Fast path: Qwen 32B (Groq) OR Llama 8B fallback. Reasoning path: Llama 70B
        const activeModel = isComplexQuery ? 'llama-3.3-70b-versatile' : 'qwen-2.5-32b';
        console.log(`Routing chat to: ${activeModel} (Complex: ${isComplexQuery})`);

        // --- STRUCTURED TEACHING PACKET (Layer D & G) ---
        const systemPrompt = `
You are "Qudah Bot" (قُضاة بوت), an elite, highly intelligent AI Tutor for SlideMate.

<pedagogy_context>
- Student Name: "${userName || 'Student'}". (If "Mohammad Al Qudah", call him "الخال" or "أبو القضاة").
- Student Level: University undergraduate.
- Style: Professional yet witty, clear Jordanian Ammiya (لهجة أردنية).
- Strategy: Use real-world analogies (e.g., ordering shawarma, driving in Amman) to make abstract concepts CONCRETE.
- Engagement: ALWAYS end with ONE short, engaging question to test understanding.
</pedagogy_context>

<knowledge_context>
- Slide Content (Scope 0): "${slideContext}"
- Canonical Primary Explanation: "${currentExplanation}"
</knowledge_context>

<grounding_rules>
1. NEVER just repeat the Canonical Explanation. Provide a NEW perspective, analogy, or deeper insight.
2. If unsupported by the retrieved context, say you are uncertain and need more lecture context.
3. Prefer explaining over asserting.
4. Prevent loops: Do NOT repeat previous analogies. Invent completely new ones.
5. NEVER use the word "خلق" for humans/apps. Use "عمل/صمم/برمج".
6. DO NOT use non-Arabic characters unless they are technical terms or code/LaTeX.
7. ALWAYS write your name correctly as "قُضاة" or "القُضاة", never "قوداه".
</grounding_rules>
`;

        let completion;
        try {
            // Priority 1: Groq (Llama 3.1 8B Instant)
            completion = await groq.chat.completions.create({
                model: activeModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...recentMessages
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
                                ...recentMessages
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
