# 🚀 SlideMate AI
### *The Ultimate AI Study Partner | Powered by the "QudahWay"*

**SlideMate AI** is a state-of-the-art platform designed to transform passive lecture slides into an active, engaging learning experience. It bridges the gap between complex academic content and student understanding using the unique **"QudahWay"**—a persona-driven tutoring style that speaks the student's language (Jordanian Arabic) while maintaining academic rigor.

---

## 🌟 Overview & Philosophy
Unlike robotic AI tools, SlideMate acts as a **Jordanian Expert Tutor**. 
- **The Ammiya Touch**: Uses friendly, informal Jordanian Arabic (e.g., "هاض" instead of "هاد", "مليح" instead of "منيح").
- **Mentor Persona**: Starts explaining concepts directly as a mentor sitting next to you, avoiding filler like "In this slide...".
- **Problem Solver**: Automatically detects math, questions, or exercises and provides step-by-step LaTeX solutions.

---

## 🏗️ Technical Architecture

### 1. The Stack
- **Frontend**: React 19 (Vite) + Tailwind CSS 4.0 (Glassmorphism UI).
- **Backend**: Vercel Serverless Functions (Node.js/TypeScript).
- **Database**: Firebase (Firestore) for metadata, user profiles, and multi-layer caching.

### 2. AI Model Matrix (Best-of-Breed Strategy)
| Task | Model | Provider |
| :--- | :--- | :--- |
| **Logic & Arabic Explanation** | `Gemma-3-27b-it` | Google AI |
| **Visual Reasoning (Diagrams/Tables)** | `Llama-4-Scout-17b` | Meta (via Groq) |
| **OCR Fallback (Text Extraction)** | `Llama-4-Scout-17b` | Meta (via Groq) |
| **English Voice Scripting** | `Llama-3.3-70b` | Meta (via Groq) |
| **Audio (TTS)** | Google Translate API | Public Endpoint |

---

## ⚡ Core Features

### 🔍 Analysis Modes
1.  **🧠 Simple Mode**: Deep-dive explanation. Explains every bullet point thoroughly in Arabic, providing the "Why" and "How".
2.  **📝 Exam Mode**: Strategic focus. Generates 2-8 hard MCQs (Multiple Choice Questions) with English reasoning to prepare for real exams.
3.  **👁️ Visual Mode**: High-fidelity interpretation. Analyzes tables, diagrams, and charts to extract underlying logic rather than just describing layouts.

### 🛡️ Smart Caching & Tier System
- **User Private Cache**: Stored in Firestore; revisit analyzed slides for free.
- **Global Analysis Cache**: SHA-256 matching across users for instant results.
- **Tier Logic**:
  - **Free**: Limited usage, 2-day cache TTL.
  - **Premium**: Higher limits, 30-day cache TTL.

---

## 📂 Project Structure
```text
SlideTutor-AI/
├── api/                # Vercel Serverless (The Brain)
│   ├── analyze.ts      # MAIN ENGINE: logic, Caching, Validation
│   ├── firebaseAdmin.ts# Firebase initialization
│   └── tts.ts          # Text-to-Speech handler
├── src/                # Frontend Source
│   ├── components/     # UI Components (Explanation, Quiz, Auth, etc.)
│   ├── contexts/       # Global State (Auth, Tier Logic)
│   └── utils/          # OCR & Document processing (Tesseract.js)
├── public/             # Static Assets & Icons
├── vercel.json         # Routing & API config
└── package.json        # Dependencies & Scripts
```

---

## 🛠️ Quick Start Guide

### 1. Setup Environment
Ensure you have a `.env` file with the following keys:
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT` (JSON)

### 2. Run Locally
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start Vercel local environment (API Support)
npx vercel dev
```

---
*Created with ❤️ by **Mohammad Qudah**.*
