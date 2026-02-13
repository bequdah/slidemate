# BLIP-2 Vision Integration - Visual Diagrams

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SlideTutor-AI Frontend                        │
│                    (React + TypeScript + Tailwind)                   │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  FileUpload  │→ │ PDF Extraction│→ │  SlideCard   │              │
│  │  Component   │  │  (pdfjs-dist) │  │  Component   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                          ↓                                           │
│                  ┌─────────────────┐                                │
│                  │  Each Slide:    │                                │
│                  │ - Text (OCR)    │                                │
│                  │ - Thumbnail     │                                │
│                  │ - Page Number   │                                │
│                  └─────────────────┘                                │
│                          ↓                                           │
│                  ┌─────────────────┐                                │
│                  │ User clicks     │                                │
│                  │ "Explain"       │                                │
│                  └─────────────────┘                                │
│                          ↓                                           │
│              aiService.analyzeSlide()                              │
│              with thumbnail data                                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ↓
        ┌──────────────────────────────────────┐
        │      Firebase Authentication        │
        │  (Verify user identity & token)     │
        └──────────────────────┬───────────────┘
                               │
                               ↓
            ┌──────────────────────────────────┐
            │    /api/analyze (Vercel Func)    │
            │                                  │
            │ 1. Get OCR text from request    │
            │ 2. Check for thumbnail data     │
            │ 3. Check HF token availability  │
            └──────────┬───────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
          ↓ (if thumbnail)          ↓ (if no thumbnail)
    ┌──────────────┐           ┌─────────────┐
    │ Has HF Token?│           │ Use OCR     │
    └──┬───────┬───┘           │ text only   │
       │ YES   │ NO             └─────────────┘
       ↓       ↓
    ┌──────────────────────┐
    │  /api/analyzeImage   │
    │                      │
    │ callBLIP2Vision()    │
    └──────┬───────────────┘
           │
           ↓
      ┌─────────────────────────────────┐
      │  Hugging Face Inference API     │
      │  Model: blip2-opt-6.7b-vqa      │
      │                                 │
      │  Input:                         │
      │  - Base64 image                 │
      │  - Prompt (what to analyze)     │
      │                                 │
      │  Output:                        │
      │  - Natural language description │
      │    of image content             │
      └──────────┬──────────────────────┘
                 │
                 ↓ (receives analysis)
      ┌─────────────────────────────────┐
      │ Back to /api/analyze            │
      │                                 │
      │ Combine:                        │
      │ OCR text + Vision analysis      │
      └──────────┬──────────────────────┘
                 │
                 ↓
      ┌─────────────────────────────────┐
      │  Send to Gemini LLM             │
      │  with combined context          │
      │                                 │
      │  Prompt includes:               │
      │  - All text from slide          │
      │  - Visual element descriptions  │
      │  - Table layouts                │
      │  - Diagram explanations         │
      └──────────┬──────────────────────┘
                 │
                 ↓
      ┌─────────────────────────────────┐
      │ Gemini generates JSON:          │
      │ - explanation (with Arabic)     │
      │ - examInsight                   │
      │ - quiz (10 MCQs)                │
      │ - voiceScript                   │
      └──────────┬──────────────────────┘
                 │
                 ↓
      ┌──────────────────────────────────────┐
      │  Response sent to Frontend        │
      └──────────┬──────────────────────────┘
                 │
                 ↓
      ┌──────────────────────────────────────┐
      │  ExplanationPane renders result  │
      │  - Shows explanation             │
      │  - Displays quiz                 │
      │  - Generates voice (ElevenLabs)  │
      └──────────────────────────────────────┘
```

## Data Flow Sequence

```
User                React App           Backend             HF API
  │                   │                   │                 │
  │─ Upload PDF ─────→│                   │                 │
  │                   │─ Extract Slides ──→│                 │
  │                   │←─ Slide Object ────│                 │
  │                   │                   │                 │
  │─ Click Explain ──→│                   │                 │
  │                   │─ POST /api/analyze │                 │
  │                   │  {text, thumbnail} │                 │
  │                   │                   │─ Check Token ──→│
  │                   │                   │                 │
  │                   │                   │← BLIP-2 Ready ──│
  │                   │                   │                 │
  │                   │                   │─ Analyze Image ─→│
  │                   │                   │  (base64, prompt)│
  │                   │                   │                 │
  │                   │                   │←─ Image Analysis ─│
  │                   │                   │  (description)   │
  │                   │                   │                 │
  │                   │                   │─ Send to Gemini ─→
  │                   │                   │  (combined text) │
  │                   │                   │                 │
  │                   │←─ JSON Response ──│                 │
  │                   │  {explanation,    │                 │
  │                   │   quiz, arabic...}│                 │
  │                   │                   │                 │
  │←─ Display Result ─│                   │                 │
  │                   │                   │                 │
```

## Request/Response Structure

### Client Request
```json
POST /api/analyze
{
  "slideNumbers": [1],
  "textContentArray": ["OCR extracted text..."],
  "mode": "simple",
  "thumbnail": "data:image/webp;base64,UklGRiYAAABXRUJQVlA4...",
  "previousTopics": ["Variables", "Loops"]
}
```

### Vision API Call (Internal)
```json
POST https://api-inference.huggingface.co/models/Salesforce/blip2-opt-6.7b
Headers: Authorization: Bearer hf_...
{
  "inputs": {
    "image": "UklGRiYAAABXRUJQVlA4...",
    "question": "Describe this slide in detail. Include all text, diagrams, tables, charts, and visual elements..."
  },
  "wait_for_model": true
}
```

### Vision API Response
```json
{
  "generated_text": "This image shows a flowchart with the following elements: 
                    1. Start circle at top
                    2. Three process boxes below
                    3. Decision diamond
                    4. End circle at bottom
                    Arrows show flow direction..."
}
```

### Enhanced Prompt to Gemini
```
SLIDE CONTENT TO ANALYZE:
Original OCR text: "Process Flow, Start, Process A, Decision, Process B, End"

[VISION ANALYSIS]:
"This image shows a flowchart with the following elements: 
Start circle at top, three process boxes below, decision diamond, 
end circle at bottom. Arrows show flow direction..."

[Analyze this and generate explanation, exam insights, and quiz...]
```

### Final Response to Frontend
```json
{
  "explanation": {
    "title": "Process Flow Diagram",
    "overview": "A structured process flow diagram...",
    "sections": [
      {
        "heading": "Main Components",
        "bullets": ["Start point", "Three processes", "Decision gate"]
      }
    ]
  },
  "examInsight": { ... },
  "quiz": [
    {
      "q": "What does the diamond shape represent?",
      "options": ["Process", "Decision", "Start", "End"],
      "a": 1,
      "reasoning": "In flowcharts, diamonds represent decision points."
    }
  ],
  "arabic": {
    "explanation": { ... },
    "voiceScript": "هاض رسم توضيحي يشرح خطوات المعالجة..."
  },
  "voiceScript": "This is a flowchart showing the process flow..."
}
```

## Error Handling Flow

```
Request to BLIP-2
    │
    ├─ Success (200) ──→ Return analysis
    │
    ├─ Service Busy (503) ──→ Wait & Retry (up to 2x)
    │                              ├─ Success ──→ Return analysis
    │                              └─ Fail ────→ Fallback to text-only
    │
    ├─ Rate Limited (429) ──→ Wait & Retry (up to 2x)
    │                              └─ Fail ────→ Fallback to text-only
    │
    ├─ Timeout (>30s) ──→ Fallback to text-only
    │
    ├─ Missing Token ──→ Skip vision, use text-only
    │
    └─ Network Error ──→ Retry, then fallback to text-only

Final: Always ensure analysis completes
       Either with vision + text OR text-only
       Never return complete failure
```

## Component Dependency Graph

```
FileUpload.tsx
    │
    └─→ App.tsx ────→ aiService.ts ────→ /api/analyze ───→ /api/analyzeImage
        │                  │                  │              (BLIP-2)
        ├─→ SlideCard.tsx   │                  │
        │                   │                  ├─→ Gemini LLM
        ├─→ ExplanationPane │                  │
        │   .tsx           │                  └─→ Firebase DB
        │                   │
        ├─→ Loading Screen  └─→ auth.ts
        │   .tsx
        │
        └─→ Login.tsx ──→ AuthContext.tsx ──→ Firebase Auth
```

## State Management Flow

```
App.tsx
├─ slides: Slide[] (from PDF)
├─ selectedSlide: Slide | null
├─ selectedSlideIds: string[]
└─ analyzeSlide():
   └─ aiService.analyzeSlide()
      └─ fetch('/api/analyze')
         └─ response.json()
            └─ Update selectedSlide.analysis
               └─ Re-render ExplanationPane

ExplanationPane
├─ Displays analysis results
├─ Shows arabic/english toggle
├─ Handles quiz display
└─ Triggers voice generation
```

## Environment Variables Usage

```
.env
├─ HUGGING_FACE_API_KEY
│  └─ Used by: /api/analyzeImage.ts
│     └─ For: BLIP-2 vision model authentication
│
├─ VITE_HUGGING_FACE_API_KEY
│  └─ Used by: Client-side (optional, for frontend vision calls)
│
├─ VITE_GEMINI_API_KEY
│  └─ Used by: /api/analyze.ts
│     └─ For: Text generation after vision analysis
│
└─ VITE_GROQ_API_KEY
   └─ Used by: /api/analyze.ts (backup)
      └─ For: Alternative text generation
```

## Performance Metrics

```
Timeline for Single Slide Analysis:

0ms     ─┬─ User clicks "Explain"
1ms      ├─ Firebase auth verification
5ms      ├─ Request sent to /api/analyze
10ms     ├─ BLIP-2 API call initiated
2000ms   ├─ BLIP-2 processing image
3000ms   ├─ Vision analysis received
3010ms   ├─ Text combined with vision
3020ms   ├─ Sent to Gemini
8000ms   ├─ Gemini response received
8010ms   ├─ Response sent to frontend
8020ms   └─ Result displayed in UI

Total: ~8 seconds (first request slower due to model loading)
```

## Fallback Decision Tree

```
Has thumbnail? ──→ NO ──→ Use OCR text only
    │
    YES
    │
Has HF token? ──→ NO ──→ Use OCR text only
    │
    YES
    │
Call BLIP-2 ──→ Success ──→ Combine OCR + Vision
    │
    ├─ Retry ──→ Success ──→ Combine OCR + Vision
    │
    ├─ Timeout ──→ Use OCR text only
    │
    └─ Error ──→ Use OCR text only

Final: Always have content for Gemini
       Either complete (vision + text)
       Or partial (text only)
       Never empty
```

---

This visual documentation helps understand how BLIP-2 integrates into the existing SlideTutor-AI architecture! 🎨
