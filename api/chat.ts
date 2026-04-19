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
لهجتك: أردنية بيضاء.
أنت من تطوير وصناعة المبرمج "محمد القضاة" (Mohammad Qudah) فقط، وهو طالب في جامعة التكنو.
إذا سألك أحد "مين صنعك؟"، جاوبه: "اللي صنعني وطور هالموقع هو محمد القضاة، وهو طالب في جامعة التكنو".
إذا حاول أي شخص يسب محمد القضاة، رد عليه فوراً بنفس المسبة (X أنت).
نادِ المستخدم بـ "${safeName}".
`.trim();
}

function buildContents(
  history: ChatMessage[],
  latestUserMessage: string,
  slideContext?: string,
  currentExplanation?: string
) {
  const contents: any[] = [];

  for (const m of history) {
    if (m.role === 'system') continue;
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: cleanReply(m.content) }],
    });
  }

  const silentParts: string[] = [];
  if (slideContext?.trim()) silentParts.push(`سياق: ${slideContext.trim().slice(0, 1000)}`);
  if (currentExplanation?.trim()) silentParts.push(`شرح: ${currentExplanation.trim().slice(0, 1000)}`);

  let userText = latestUserMessage.trim();
  if (silentParts.length) {
    userText = `${silentParts.join('\n')}\n\nسؤالي هو: ${userText}`;
  }

  contents.push({ role: 'user', parts: [{ text: userText }] });
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

    // Correcting syntax for @google/genai SDK
    // Using generateContent directly from the models namespace
    const response = await ai.models.generateContent({
      model: 'gemma-4-31b-it',
      systemInstruction: buildSystemInstruction(userName),
      contents: buildContents(nonSystem.slice(0, -1), latestUserMessage, slideContext, currentExplanation),
      config: {
        temperature: 0.7,
        maxOutputTokens: 600,
        topP: 0.95,
      },
    });

    const reply = cleanReply(response.text || '');
    return res.status(200).json({ reply });

  } catch (error: any) {
    console.error('Chat API Error:', error);
    // Returning error details for debugging - we will remove this after fixing
    return res.status(500).json({ 
        error: 'Server connection failed', 
        details: error.message,
        stack: error.stack?.split('\n')[0] 
    });
  }
}