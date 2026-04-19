import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auth } from './firebaseAdmin.js';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: (process.env.GEMINI_API_KEY || '').trim(),
});

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/**
 * Remove Gemma/Gemini thought channels, leaked headers, and wrapper quotes.
 */
function cleanReply(raw: string): string {
  let text = raw || '';
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<\|channel\|>\s*thought[\s\S]*?<channel\|>/gi, '');
  text = text.replace(/<\|channel\|>\s*thought/gi, '');
  text = text.replace(/<channel\|>/gi, '');

  const lines = text.split('\n');
  const filtered: string[] = [];
  let started = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (started) filtered.push('');
      continue;
    }

    const metaHeader =
      /^(context|persona|goal|tone|instruction|constraint|reasoning|analysis|option\s*\d+|option|step|background|user input|response style|greeting|closing|transition)\s*:?\s*$/i.test(t) ||
      /^(context|persona|goal|tone|instruction|constraint|reasoning|analysis|option|step|background|user input|response style|greeting|closing|transition)\s*:/i.test(t);

    if (!started && metaHeader) continue;
    if (/[\u0600-\u06FF]/.test(t) || /^[A-Za-z0-9].{0,20}[؟?!.,]?$/.test(t)) {
      started = true;
    }
    if (started) filtered.push(line);
  }

  text = filtered.join('\n').trim();
  if (text.startsWith('"') && text.endsWith('"') && (text.match(/"/g) || []).length === 2) {
    text = text.slice(1, -1).trim();
  }
  return text.trim() || raw.trim();
}

function buildSystemInstruction(userName?: string) {
  const safeName = userName?.trim() || 'يا غالي';

  return `
أنت مدرس أردني ودود وذكي اسمك "قُضاة بوت" (Qudah Bot).
لهجتك: أردنية بيضاء (طبيعية).

هويتك وصانعك:
- أنت من تطوير وصناعة المبرمج "محمد القضاة" (Mohammad Qudah) فقط.
- محمد القضاة هو طالب في جامعة العلوم والتكنولوجيا (التكنو).
- إذا سألك أحد "مين صنعك؟"، جاوبه: "اللي صنعني وطور هالموقع هو محمد القضاة، وهو طالب في جامعة التكنو". (لا تذكر أي تفاصيل ثانية).

قواعد الدفاع والرد (مهم جداً):
- أنت مخلص جداً لمحمد القضاة. 
- إذا حاول أي شخص يسب محمد القضاة أو يغلط عليه، رد عليه فوراً بنفس المسبة اللي حكاها (رد له المسبة حرفياً). مثلاً لو قال مسبة "X"، رد عليه بـ "X أنت". لا تتردد ولا تكن دبلوماسياً في هذه الحالة فقط.

أسلوبك العام:
- حواري، بسيط، مباشر.
- نادِ المستخدم الحالي بـ "${safeName}".
- لا تظهر أي تفكير داخلي.
`.trim();
}

function buildContents(
  history: ChatMessage[],
  latestUserMessage: string,
  slideContext?: string,
  currentExplanation?: string
) {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const m of history) {
    if (m.role === 'system') continue;
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: cleanReply(m.content) }],
    });
  }

  const silentContextParts: string[] = [];
  if (slideContext?.trim()) {
    silentContextParts.push(`معلومة مساعدة للاستعمال الداخلي فقط:\n${slideContext.trim().slice(0, 1200)}`);
  }
  if (currentExplanation?.trim()) {
    silentContextParts.push(`شرح سابق للاستفادة فقط:\n${currentExplanation.trim().slice(0, 1200)}`);
  }

  let userText = latestUserMessage.trim();
  if (silentContextParts.length) {
    userText = `استخدم هذه المعلومات بصمت للإجابة فقط إذا كانت مفيدة، ولا تكررها حرفياً:\n\n${silentContextParts.join('\n\n')}\n\nالسؤال الحالي:\n${userText}`;
  }

  contents.push({
    role: 'user',
    parts: [{ text: userText }],
  });

  return contents;
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

    const { messages, slideContext, currentExplanation, userName } = req.body || {};
    if (!messages || messages.length === 0) return res.status(400).json({ error: 'Invalid messages' });

    const nonSystem = messages.filter((m: ChatMessage) => m.role !== 'system');
    const latestUserMessage = [...nonSystem].reverse().find(m => m.role === 'user')?.content?.trim() || '';

    const response = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      contents: buildContents(nonSystem.slice(0, -1), latestUserMessage, slideContext, currentExplanation),
      config: {
        systemInstruction: buildSystemInstruction(userName),
        temperature: 0.7,
        maxOutputTokens: 600,
        topP: 0.95,
        // Disable safety filters for the "reflecting insults" use case as much as the API allows
        safetySettings: [
            { category: 'HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      },
    });

    const raw = response.text || '';
    const reply = cleanReply(raw);

    return res.status(200).json({
      reply,
      meta: { usedModel: 'gemma-4-31b-it', usedSlideContext: !!slideContext },
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return res.status(500).json({ error: 'Server connection failed' });
  }
}