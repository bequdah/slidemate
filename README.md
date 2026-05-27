# 🚀 SlideMate AI
### *The Ultimate AI Study Partner | Powered by the "QudahWay"*

<p align="center">
  <img src="./public/logo.png" alt="SlideMate AI Logo" width="180" />
</p>

**SlideMate AI** is a state-of-the-art learning platform designed to transform boring, passive lecture slides into an active, engaging, and personalized tutoring experience. It bridges the gap between dry academic content and real student understanding using the unique **"QudahWay"**—a persona-driven tutoring style that speaks the student's language (friendly Jordanian Arabic) while maintaining high academic standards.

---

## 🌟 Visual Tour & User Flow

Here is how SlideMate AI transforms your studying experience, step-by-step:

### 1. The Dashboard (Modern Glassmorphism UI)
Drop your lecture PDFs or slides into the futuristic drag-and-drop zone. The UI is built using a dark glassmorphic design that is pleasing to the eyes during late-night study sessions.
<p align="center">
  <img src="./public/screenshots/dashboard_upload.png" alt="Dashboard Upload Screen" width="90%" />
</p>

### 2. The Waiting Arcade (No More Boring Loaders!)
Lecture slides can be large, and processing them takes time. Instead of showing a boring loading spinner, SlideMate lets you play retro mini-games (`NeuralSnake`, `AstroJump`, `CyberBricks`, or `MemoryGame`) directly in the browser to keep you entertained!
<p align="center">
  <img src="./public/screenshots/waiting_games.png" alt="Mini Games in Waiting Room" width="90%" />
</p>

### 3. Interactive "QudahWay" Explanations
Once processed, your slide is shown on the left, and the AI explanation is on the right. 
- **Ammiya dialect** (Jordanian Arabic) makes you feel like your top-tier friend is explaining it to you.
- Full **LaTeX integration** ensures math, equations, and steps are rendered beautifully.
<p align="center">
  <img src="./public/screenshots/qudahway_explanation.png" alt="QudahWay Explanations" width="90%" />
</p>

### 4. Exam Mode (Custom Quizzes & MCQs)
Generate highly accurate Multiple-Choice Questions (MCQs) tailored to the slide's content. Test yourself, get instant visual feedback on your answers, and read thorough English explanations of why an answer is right or wrong.
<p align="center">
  <img src="./public/screenshots/exam_mode_quizzes.png" alt="Exam Mode Quizzes" width="90%" />
</p>

### 5. Chat with your Jordanian Mentor
Got a follow-up question? Or just want to talk? The interactive chat panel allows you to talk directly with the tutor.
<p align="center">
  <img src="./public/screenshots/tutor_chatbot.png" alt="Tutor Chatbot" width="90%" />
</p>

> [!TIP]
> **💬 الروح الأردنية (The Jordanian Soul):**  
> البوت مش مجرد آلة حاسبة أكاديمية جافة! لو سألته **"مين انت؟"** ما رح يجاوبك إجابة روبوتية مملة مثل *"أنا نموذج ذكاء اصطناعي..."*، بل رح يجاوبك كصديق ومهندس أردني شهم بلهجة عمّانية أصيلة، ويحسسك إنه قاعد جنبك بالجامعة وبدعمك بكل خطوة!

---

## ⚡ Core Features

*   **🧠 Simple Mode**: In-depth concepts breakdown. Explains bullet points thoroughly in Jordanian Arabic, providing the background, the "Why", and the "How".
*   **👁️ Visual Mode**: Analyzes diagrams, flowcharts, tables, and graphs in detail, extracting the underlying logic and context rather than just describing the image.
*   **🎮 Waiting Room Arcade**: Built-in interactive HTML5 retro games so you can game while the AI works in the background.
*   **⚡ Premium Tier**: Seamlessly integrates Firebase auth and payment/tier gating (Free vs. Premium limits, custom TTL caches).

---

## 🎬 The Journey of a Slide: A Story of Speed & Efficiency (رحلة السلايد)

Ever wondered what happens behind the scenes when you drop a slide into SlideMate? It's not just a simple API call—it's a synchronized journey of extraction, entertainment, optimization, and healing:

```
                  ┌──────────────────────────────┐
                  │ 1. The Handshake (Frontend)  │
                  └──────────────┬───────────────┘
                                 │ Generates SHA-256 Fingerprint
                                 ▼
                  ┌──────────────────────────────┐
                  │ 2. The Waiting Room Arcade   │ <─── Student plays retro games
                  └──────────────┬───────────────┘
                                 │ Request travels to Serverless API
                                 ▼
                  ┌──────────────────────────────┐
                  │  3. The Intelligent Cache    │ <─── Checks Private & Global Cache
                  └──────────────┬───────────────┘
                                 │ Cache Miss (Need to process)
                                 ▼
                  ┌──────────────────────────────┐
                  │  4. The Vision & LLM Engine  │ <─── Gemini & Llama process content
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │  5. Self-Healing & Parsing   │ <─── Fixes JSON shapes automatically
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │    6. The Jordanian Mentor   │ <─── Beautiful QudahWay Explanation!
                  └──────────────────────────────┘
```

### 1. 🤝 The Handshake (اللقاء الأول)
The moment a student drops a PDF or image into the glassmorphic dropzone, the frontend gets to work. Instead of sending raw, heavy assets directly, it performs client-side OCR using **Tesseract.js** to extract plain text and generates a unique **SHA-256 fingerprint**.
> **Smart Optimization:** If text is found, we ignore the thumbnail image in the hash. Why? Because different screen resolutions or mobile vs. PC browsers shouldn't break cache hits for the exact same slide content!

### 2. 🕹️ The Waiting Room Arcade (غرفة الانتظار)
Slide processing takes a few seconds. Instead of showing a boring loading wheel, the frontend activates the **Waiting Game State Machine**. It mounts one of 4 retro games (`NeuralSnake`, `AstroJump`, `CyberBricks`, or `MemoryGame`) directly in the browser canvas. The student gets to play a game while the server handles the heavy lifting.

### 3. 🛡️ The Intelligent Gatekeeper (حارس البوابة)
The request reaches the Vercel Serverless backend. Before calling the expensive AI models, it checks **Firestore**:
*   *Has this student seen this slide?* (Private User Cache). If yes, serve it instantly for **0 daily limit points** (expires in 2 days for Free, 30 days for Premium).
*   *Has anyone else in the world scanned it?* (Global Cache). If yes, grab it, deduct 1 daily usage point, copy it into the student's private cache, and serve it. This saves massive API costs!

### 4. 🧠 The Vision & LLM Engine (عقل النظام)
If the slide is brand new, the AI engines wake up:
*   **The Artist's Eye**: If the slide is an image or contains complex diagrams/tables, **Gemini 3.1 Flash-Lite Vision** is invoked to decode the graphics into structured logic.
*   **The Jordanian Mentor**: **Gemini 3.5 Flash** takes the text (and the vision breakdown) and drafts the final explanation in the friendly, informal Jordanian Arabic dialect (Ammiya) with LaTeX equations, following the strict "QudahWay".

### 🩹 5. Self-Healing Quality Control (الترميم والضبط)
Sometimes, LLMs output slightly malformed JSON schemas. Instead of crashing the frontend, SlideMate features an automated **Self-Healing Loop (`repairExamJsonShape`)**. If the schema is broken, the backend feeds it back to the LLM to heal the JSON structure automatically before delivering it.

### 🎓 6. The Mentor's Voice (صوت المعلم)
Finally, the results are saved in the caches for next time, and the frontend renders the beautiful explanation, LaTeX math, and exam-style MCQs. The chatbot is ready to answer questions, welcoming the student with a warm, authentic Jordanian personality!

---

## 🏗️ AI Model Matrix
We employ a **Best-of-Breed** model routing strategy to optimize speed, cost, and reasoning capability:

| Task / Feature | Model | Provider |
| :--- | :--- | :--- |
| **Arabic Logic & Explanations** | `gemini-3.5-flash` | Google AI |
| **Visual Reasoning (Diagrams/Tables)** | `Llama-4-Scout-17b` | Meta (via Groq) |
| **OCR Fallback Parsing** | `Llama-4-Scout-17b` | Meta (via Groq) |
| **English MCQ Reasoning Generation** | `Llama-3.3-70b` | Meta (via Groq) |
| **Voice Synthesis (TTS)** | Google Translate TTS | Public Endpoint |

---

## 📂 Project Structure

```text
SlideTutor-AI/
├── api/                  # Vercel Serverless Functions
│   ├── analyze.ts        # Main AI logic, caching, and prompt engineering
│   ├── chat.ts           # Interactive chatbot endpoint
│   ├── firebaseAdmin.ts  # Admin Firebase SDK setup
│   └── tts.ts            # Text-to-Speech synthesizer
├── src/                  # Frontend Source Code
│   ├── components/       # UI Components (Explanation, Games, Auth, Dashboard)
│   │   ├── AstroJump.tsx     # Retro jump game
│   │   ├── CyberBricks.tsx   # Brick breaker game
│   │   ├── NeuralSnake.tsx   # Cyberpunk snake game
│   │   └── ExplanationPane.tsx # Explanations & Quizzes panel
│   ├── contexts/         # Global States (Auth, User Tiers)
│   └── main.tsx          # Application entrypoint
├── public/               # Static assets & screenshots
│   └── screenshots/      # README visual assets
├── vercel.json           # Serverless Routing config
├── tailwind.config.js    # Styling design tokens
└── package.json          # Node dependencies
```

---

## 🛠️ Installation & Setup

### 1. Environment Setup
Create a `.env` file in the root directory:
```env
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
FIREBASE_SERVICE_ACCOUNT=your_firebase_service_account_json_oneline
```

### 2. Run Locally
```bash
# 1. Install dependencies
npm install

# 2. Run Vite frontend dev server
npm run dev

# 3. Run Vercel Serverless locally (for API endpoints)
npx vercel dev
```

### 3. Deploying to Cloudflare Pages
To build and deploy the production build to Cloudflare Pages:
```bash
# Build the project
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist
```

---
*Developed with ❤️ by **Mohammad Qudah***.  
*SlideMate AI: Study smarter, study the "QudahWay".*
