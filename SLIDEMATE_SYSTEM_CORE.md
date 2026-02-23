# 🚀 SlideMate AI | System Core Documentation
**Version**: 2026.02.23 (Stability & Vision Build)
**Author**: Antigravity (AI Architect)

---

## 🌟 Overview
**SlideMate AI** is a state-of-the-art AI Study Partner designed to transform passive learning from lecture slides into an active, engaging experience. It bridges the gap between complex academic content and student understanding using the unique **"QudahWay"**—a persona-driven tutoring style that speaks the student's language (Jordanian Arabic) while maintaining academic rigor.

---

## 🏗️ Technical Architecture

### 1. Frontend (The Interface)
- **Framework**: React 19 (Vite)
- **Styling**: Tailwind CSS 4.0 (Modern, glassmorphism design)
- **State Management**: React Contexts (Auth, Tier Logic)
- **Key Modules**:
  - `FileUpload.tsx`: Handles PDF/Image ingestion.
  - `SlideCard.tsx`: Interactive preview of each lecture slide.
  - `ExplanationPane.tsx`: The primary study hub where AI content is displayed.
  - `ocrService.ts`: Client-side preprocessing and OCR coordination.

### 2. Backend (The Brain)
- **Platform**: Vercel Serverless Functions (Node.js/TypeScript)
- **Engine**: The `/api/analyze.ts` handler is the core orchestration point.
- **Database**: Firebase (Firestore) for metadata, user profiles, and multi-layer caching.

### 3. AI Model Matrix (The Intelligence)
SlideMate uses a "Best-of-Breed" multi-model strategy to ensure accuracy and speed:

| Task | Model | Source | Provider |
| :--- | :--- | :--- | :--- |
| **Logic & Arabic Explanation** | `Gemma-3-27b-it` | Google | Google AI SDK |
| **Visual Reasoning (Diagrams/Tables)** | `Llama-4-Scout-17b` | Meta | Groq SDK |
| **OCR Fallback (Text Extraction)** | `Llama-4-Scout-17b` | Meta | Groq SDK |
| **English Voice Scripting** | `Llama-3.3-70b` | Meta | Groq SDK |
| **Audio (TTS)** | Google Translate API | Google | Public Endpoint |

---

## ⚡ Core Features & Logic

### 🧠 The "QudahWay" Persona
Unlike generic AIs, SlideMate acts as a **Jordanian Expert Tutor**. 
- **Language**: Friendly, informal Jordanian Arabic (Ammiya).
- **Strict Linguistic Rules**: Uses "هاض" instead of "هاد", "مليح" instead of "منيح", etc.
- **Engaging Tone**: Avoids robotic phrases like "In this slide...". It starts explaining the concept directly as a mentor would.

### 🔍 Analysis Modes
1. **Simple Mode**: Deep-dive explanation. Every bullet point is explained thoroughly in Arabic, providing the "Why" and "How".
2. **Exam Mode**: Strategic focus. Generates 2-8 hard MCQs (Multiple Choice Questions) with English reasoning to prepare students for real exams.
3. **Visual Mode**: High-fidelity interpretation. Analyzes tables (Who is the winner/loser?), diagrams (What is the flow?), and charts to extract the underlying logic rather than just describing the layout.

### 🛡️ Smart Caching & Tier System
To optimize costs and performance, SlideMate implements a **Multi-Layer Cache**:
- **User Private Cache**: Stored in Firestore, ensuring students don't pay "Usage Points" for slides they've already analyzed.
- **Global Analysis Cache**: A shared repository that matches identical slides across different users (using SHA-256 content hashing), providing instant results.
- **Tier Logic**:
  - **Free**: Limited daily usage, 2-day cache TTL.
  - **Premium/Unlimited**: Higher limits, 30-day cache TTL.

---

## 🛠️ API & Integration Details

### `/api/analyze.ts`
The primary endpoint. It handles:
- **Authentication**: Firebase Admin SDK verification.
- **Usage Tracking**: Transaction-locked daily usage counters.
- **OCR Fallback**: If Tesseract.js (client-side) fails, it triggers Groq Vision (Llama-4-Scout-17b) to read the slide.
- **Latex Repair**: Automatically escapes and repairs LaTeX formulas ($$ \dots $$) for clean math rendering.

### `/api/generateVoice.ts`
Generates a narrative text script in English using Llama-3.3-70b, designed to be read aloud by the TTS engine.

### `/api/tts.ts`
Proxies requests to the Google Translate TTS engine to generate high-quality audio streams without requiring expensive cloud TTS subscriptions.

---

## 📂 Project Structure Map
```text
SlideTutor-AI/
├── api/                # Vercel Serverless Functions (Backend)
│   ├── analyze.ts      # MAIN ENGINE: GPT logic, Caching, Validation
│   ├── firebaseAdmin.ts# Firebase initialization
│   ├── tts.ts          # Text-to-Speech handler
│   └── tsconfig.json   # Backend TS config
├── src/                # Frontend Source
│   ├── components/     # UI Components (Explanation, Quiz, Auth, etc.)
│   ├── contexts/       # Auth & Tier global state
│   ├── utils/          # OCR & Document processing
│   ├── App.tsx         # Main UI Orchestration
│   └── main.tsx        # Entry point
├── firebase.json       # Firebase Hosting/Rules config
├── package.json        # Dependencies (React, Groq, Google AI)
└── vercel.json         # Routing & API config
```

---

## 🎯 Current Status
- ✅ **Stability**: Robust retry logic (4 attempts) for AI endpoints.
- ✅ **Vision**: Advanced interpretation of complex visual slides.
- ✅ **Math**: High-fidelity LaTeX support with server-side repair.
- ✅ **UX**: Ultra-premium glassmorphism UI with smooth animations.

---
*Document generated by Antigravity AI for SlideMate Team.*
