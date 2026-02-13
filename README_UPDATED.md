# SlideTutor-AI 🎓

**AI-Powered Lecture Slide Analysis & Explanation**

Transform your lecture slides into interactive learning experiences with AI-powered analysis, voice generation, and exam-ready quizzes.

## ✨ What's New: BLIP-2 Vision Integration

This project now includes **BLIP-2 vision analysis** from Hugging Face for enhanced slide understanding:

✅ **Understands Images**: Diagrams, charts, tables, equations  
✅ **Combines Text + Vision**: OCR + AI visual analysis  
✅ **100% Free**: Unlimited Hugging Face API calls  
✅ **Production Ready**: Error handling, retries, fallbacks  

[👉 Quick Setup (5 minutes)](./QUICK_SETUP.md)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- npm or yarn
- Hugging Face API token (free at https://huggingface.co)

### Installation

```bash
# 1. Clone and install
git clone <repo>
cd SlideTutor-AI
npm install

# 2. Add Hugging Face token to .env
echo "HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE" >> .env
echo "VITE_HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE" >> .env

# 3. Start dev server
npm run dev

# Open http://localhost:5173
```

For complete setup with vision analysis, see [QUICK_SETUP.md](./QUICK_SETUP.md).

---

## 📋 How to Run

1. **Open Terminal**
   Open the project folder in VS Code and run a new terminal (`Ctrl + `).

2. **Install Dependencies (First Time Only)**
   ```bash
   npm install
   ```

3. **Add Hugging Face API Token** (Required for vision)
   ```bash
   # Create .env file with:
   HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE
   VITE_HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE
   ```
   Get free token: https://huggingface.co/settings/tokens

4. **Start the Application**
   ```bash
   npm run dev
   ```
   Click the link (e.g., `http://localhost:5173`) to open the app in your browser.

---

## 🎯 Features

### Core Analysis
- 📄 **PDF Upload**: Drag-and-drop PDF lecture slides
- 🧠 **AI Analysis**: Multiple explanation modes (simple, deep, exam)
- 📊 **Vision Understanding**: BLIP-2 analyzes diagrams, charts, tables
- 🗣️ **Voice Generation**: Narrated explanations
- ❓ **Smart Quizzes**: Auto-generated MCQs for exam prep
- 🌍 **Arabic Support**: Native Arabic explanations with Jordanian dialect

### Advanced Features
- 🔐 **Firebase Auth**: Secure user authentication
- 📈 **Daily Limits**: 200 free analyses per day
- 🎨 **Dark Theme**: Beautiful, eye-friendly interface
- ⚡ **Real-time**: Live slide processing and explanation
- 🔄 **Batch Analysis**: Analyze multiple slides together

---

## 📚 Documentation

### Setup & Installation
- **[QUICK_SETUP.md](./QUICK_SETUP.md)** - 5-minute setup guide (Arabic/English)
- **[VISION_INTEGRATION.md](./VISION_INTEGRATION.md)** - Complete vision guide

### Development
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - What was implemented
- **[CODE_REFERENCE.md](./CODE_REFERENCE.md)** - Code examples & snippets

### Technical
- **Architecture**: React + TypeScript + Firebase
- **AI Models**: Gemini (text), BLIP-2 (vision), Groq (backup)
- **APIs**: Vercel Functions, Hugging Face Inference

---

## 🏗️ Project Structure

```
SlideTutor-AI/
├── src/
│   ├── components/
│   │   ├── ExplanationPane.tsx      # Display explanations
│   │   ├── FileUpload.tsx           # PDF upload interface
│   │   ├── SlideCard.tsx            # Slide preview
│   │   ├── Login.tsx                # Authentication
│   │   └── ...
│   ├── services/
│   │   └── aiService.ts             # API calls (+ vision)
│   ├── contexts/
│   │   └── AuthContext.tsx          # Firebase auth
│   └── App.tsx                      # Main app
├── api/
│   ├── analyze.ts                   # Main analysis (+ vision)
│   ├── analyzeImage.ts              # BLIP-2 vision API ✨ NEW
│   ├── generateVoice.ts             # Voice generation
│   └── firebaseAdmin.ts             # Firebase config
├── .env                             # Environment variables
├── package.json
├── vite.config.ts
└── README.md
```

---

## 🔑 Environment Variables

Required for full functionality:

```dotenv
# Hugging Face - BLIP-2 Vision (FREE)
HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE
VITE_HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE

# Google Gemini - Text Analysis
VITE_GEMINI_API_KEY=AIza...

# Groq - Backup model (optional)
VITE_GROQ_API_KEY=gsk_...

# Firebase - Authentication & Database
VITE_FIREBASE_API_KEY=...
(See firebase.ts for other Firebase vars)
```

**Get Tokens:**
- Hugging Face: https://huggingface.co/settings/tokens (Free)
- Gemini API: https://makersuite.google.com (Free)
- Groq: https://console.groq.com (Free)

---

## 🛠️ Development

### Available Scripts

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

### Tech Stack
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Vercel Functions (Node.js)
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **AI Models**:
  - BLIP-2 (vision) - Hugging Face ✨ NEW
  - Gemini (text) - Google
  - Groq (backup) - Groq

---

## 🔄 Data Flow

```
1. User uploads PDF
       ↓
2. Slides extracted with text (OCR) + thumbnails (canvas)
       ↓
3. User clicks "Analyze Slide"
       ↓
4. Backend receives: text + image thumbnail
       ├─ If BLIP-2 available: analyze image → vision insights
       ├─ Combine OCR + vision analysis
       └─ Send to Gemini
       ↓
5. Gemini generates:
   - Explanation (with Arabic)
   - Exam insights
   - Quiz questions (10 MCQs)
   - Voice script
       ↓
6. Frontend displays results & generates voice
```

---

## 🌟 Key Improvements with BLIP-2

### Before (Text Only)
```
❌ Only reads visible text
❌ Ignores diagrams
❌ Misses table structures
❌ Can't understand visual concepts
```

### After (Text + Vision)
```
✅ Reads text + analyzes images
✅ Describes diagrams in detail
✅ Extracts table data to Markdown
✅ Explains visual concepts
✅ Recognizes equations & charts
```

### Example
**Slide with diagram:**
- Before: "Shows CPU vs GPU performance"
- After: "Shows a bar chart comparing CPU and GPU processing speeds. GPU clearly outperforms CPU by 2-3x on graphics and ML tasks..."

---

## 🚀 Deployment

### Local Development
```bash
npm install
echo "HUGGING_FACE_API_KEY=hf_..." > .env
npm run dev
```

### Production (Vercel)
```bash
# 1. Push to GitHub
git push

# 2. Vercel auto-deploys

# 3. Add environment variable:
# Settings → Environment Variables
# Key: HUGGING_FACE_API_KEY
# Value: hf_YOUR_TOKEN_HERE

# 4. Redeploy
vercel --prod
```

---

## 📊 Usage Limits

### Daily Limits
- **200 analyses/day** per user
- Includes both text and vision analyses
- Resets daily at UTC 00:00

### API Quotas
- **Google Gemini**: 50,000 req/month (free)
- **Hugging Face**: Unlimited (free tier)
- **Voice Generation**: Generous limits

---

## 🔐 Security

✅ **Authentication**: Firebase Auth required  
✅ **Token Management**: Environment variables only  
✅ **Data Privacy**: No persistent image storage  
✅ **Rate Limiting**: Daily usage tracking  
✅ **Error Handling**: Graceful fallbacks  

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

---

## 📝 License

[Add your license here]

---

## 📞 Support

Need help? Check these resources:
- [Quick Setup Guide](./QUICK_SETUP.md)
- [Vision Integration Docs](./VISION_INTEGRATION.md)
- [Code Reference](./CODE_REFERENCE.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)

---

## 🎉 Getting Started

1. **Create Hugging Face Account**: https://huggingface.co/join
2. **Get API Token**: https://huggingface.co/settings/tokens
3. **Add to `.env`**: `HUGGING_FACE_API_KEY=hf_YOUR_TOKEN`
4. **Run**: `npm run dev`
5. **Upload PDF**: Use the drag-drop interface
6. **Click Explain**: Watch the magic happen! ✨

---

**Made with ❤️ by SlideTutor-AI Team**

*Transforming lecture slides into interactive learning experiences*
