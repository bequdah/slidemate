import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, auth } from './firebaseAdmin.js';
import Groq from 'groq-sdk';

// Initialize Groq (Server-side key)
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        // 2. Auth Verification
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized: Missing Token' });
            return;
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // 3. Rate Limiting Check (100 requests per day)
        const today = new Date().toISOString().split('T')[0];
        const userRef = db.collection('users').doc(uid);

        const userDoc = await userRef.get();
        const userData = userDoc.data() || {};
        const usage = userData.dailyUsage || { date: today, count: 0 };

        if (usage.date === today && usage.count >= 100) {
            res.status(429).json({ error: "Daily limit reached (100/100)" });
            return;
        }

        // 4. Parse Body
        const { slideNumbers, textContentArray, mode, thumbnail } = req.body;

        // 5. Build Prompts
        const isMulti = slideNumbers.length > 1;
        const slideContexts = slideNumbers.map((num: number, i: number) => `[SLIDE ${num}]: ${textContentArray?.[i] || "No text"}`).join('\n\n');

        const systemPrompt = `You are an Elite University Professor AND a professional slide-content editor.
Return ONLY a valid JSON object.

STRICT SEPARATION RULES:
1. "explanation": Reconstruct the slide content to mirror its logical and visual structure. Do NOT add new concepts.
2. "examInsight": Exactly 3-4 bullet points for exam preparation.
3. "quiz": The array of MCQ objects.
4. "arabic": Translated versions of explanation and examInsight.

EXPLANATION FORMATTING RULES:
- If the slide has a title, it MUST appear as a section header (##).
- Reconstruct the hierarchy implied by titles and bullet points.
- Each bullet point MUST become a separate, clearly explained sub-point.
- Definitions MUST be written in **bold** and placed under a "## Key Definitions" section.
- Cause–effect relationships MUST be explicit.
- Use short paragraphs (max 2 sentences each).
- Tone: Academic, concise, and exam-oriented. No conversational language.
- Do NOT mention the slide, image, or analysis process.
- Do NOT repeat information unnecessarily.

EXPLANATION STRUCTURE (ADAPT AS NEEDED):
## [Slide Title / Main Theme]
(One concise sentence summarizing the slide’s purpose)

## [Core Logic / Causes / Components]
(Logical breakdown using sub-headers or bullet points)

## Key Definitions
- **Term**: Formal definition.

## [Purpose / Why It Is Needed]
(Clearly connect concepts or explain the necessity/utility)

## Concrete Example (If applicable)
(One precise example aligned with the slide content)

Structure Template:
{
  "explanation": "## Title\\n...\\n## Key Definitions\\n- **Term**: Def\\n...\\n## Example\\n...",
  "examInsight": "- Point 1\\n- Point 2",
  "arabic": { "explanation": "الشرح", "examInsight": "نصائح" },
  "quiz": [
    { "q": "Question Text", "options": ["A", "B", "C", "D"], "a": 0, "reasoning": "Reason" }
  ]
}

Mode Rules:
1. 'simple': Use simple language, focus on analogies. MANDATORY: Return EXACTLY 2 easy MCQs in "quiz".
2. 'deep': Use technical terms, focus on deep theory/proofs. MANDATORY: Return EXACTLY 2 difficult MCQs in "quiz".
3. 'exam': Set explanation and examInsight to "". MANDATORY: Return EXACTLY 10 hard MCQs in "quiz".

LaTeX Rules:
- Use $...$ for inline and $$...$$ for block math.
- JSON ESCAPING (CRITICAL): You MUST use double-backslashes (e.g., "\\\\frac") so LaTeX survives JSON parsing.

FINAL VALIDATION:
- Ensure headers (##) are used instead of plain text titles.
- Do NOT include 'Exam Summary' inside 'explanation' as it overlaps with 'examInsight'.`;

        const userPrompt = `
            CONTENT:\n${isMulti ? slideContexts : (textContentArray?.[0] || "")}
            
            MODE: ${mode.toUpperCase()}
            REMINDER: You MUST follow the ${mode.toUpperCase()} mode rules and return EXACTLY ${mode === 'exam' ? '10' : '2'} MCQs in the quiz array.
        `;

        // 6. Model Selection & Routing
        let targetModels = [
            "llama-3.3-70b-versatile",
            "mixtral-8x7b-32768",
            "llama-3.1-8b-instant"
        ];

        let messages: any[] = [{ role: "system", content: systemPrompt }];

        // Check for Vision Request
        if (thumbnail && thumbnail.startsWith('data:image')) {
            console.log("Vision Request Detected");
            targetModels = ["llama-3.2-11b-vision-preview", "llama-3.1-8b-instant"];

            // For vision, we need to restructure the prompt
            messages = [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text", text: userPrompt },
                        {
                            type: "image_url",
                            image_url: {
                                url: thumbnail, // Base64 image
                            },
                        },
                    ],
                }
            ];
        } else {
            messages.push({ role: "user", content: userPrompt });
        }

        let completion;
        let lastError;

        for (const targetModel of targetModels) {
            try {
                console.log(`Attempting analysis with ${targetModel}...`);

                // CRITICAL: If falling back to a text model from a vision prompt,
                // we must convert the content back to a string.
                const isVisionModel = targetModel.includes('vision');
                const preparedMessages = messages.map(m => {
                    if (!isVisionModel && Array.isArray(m.content)) {
                        // Extract just the text part for non-vision models
                        const textPart = m.content.find((p: any) => p.type === 'text');
                        return { ...m, content: textPart ? textPart.text : "" };
                    }
                    return m;
                });

                completion = await groq.chat.completions.create({
                    messages: preparedMessages,
                    model: targetModel,
                    temperature: 0.1,
                    response_format: { type: "json_object" }
                });
                console.log(`Success with ${targetModel}`);
                break;
            } catch (err: any) {
                lastError = err;
                console.error(`Error with ${targetModel}:`, err.message);

                // If Rate Limit (429), try next model immediately
                if (err.status === 429 || err.message?.includes("rate_limit")) {
                    continue;
                }

                // For other errors, if we have another model, try it
                if (targetModels.indexOf(targetModel) < targetModels.length - 1) {
                    continue;
                }

                throw err;
            }
        }

        if (!completion) throw lastError;

        const result = JSON.parse(completion.choices[0]?.message?.content || "{}");

        // 7. Increment usage on success
        await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            const data = doc.data() || {};
            const currentUsage = data.dailyUsage || { date: today, count: 0 };

            if (currentUsage.date !== today) {
                currentUsage.date = today;
                currentUsage.count = 1;
            } else {
                currentUsage.count++;
            }
            t.set(userRef, { dailyUsage: currentUsage }, { merge: true });
        });

        res.status(200).json(result);

    } catch (error: any) {
        console.error('API Error:', error);
        if (error.message === "RATE_LIMIT_EXCEEDED") {
            res.status(429).json({ error: "Daily limit reached (100/100)" });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
}
