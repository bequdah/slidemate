# BLIP-2 Vision Integration Guide

## 📋 Overview

This document explains the integration of **BLIP-2 (Salesforce)** vision model from Hugging Face into the SlideTutor-AI application. This enhancement enables the AI to understand:

- ✅ Text content in slides
- ✅ Diagrams and visual elements
- ✅ Tables and their structure
- ✅ Charts and graphs
- ✅ Mathematical equations
- ✅ Layout and visual hierarchy

## 🏗️ Architecture

```
User Upload (PDF)
       ↓
PDF Processing (React)
       ├─ Extract Text (OCR)
       └─ Render Thumbnail (Canvas)
       ↓
Analyze Button Click
       ↓
/api/analyze (Vercel Function)
       ├─ Extract user token
       ├─ If thumbnail available & BLIP-2 token exists:
       │  └─ Call callBLIP2Vision()
       │     ├─ Convert image to base64
       │     └─ Send to Hugging Face API
       ├─ Combine OCR text + Vision analysis
       └─ Send enhanced text to Gemini
       ↓
Response with:
- explanation (Arabic + English)
- examInsight
- quiz (MCQs)
- voiceScript
```

## 🔧 Setup Instructions

### 1. Get Hugging Face API Token

1. Go to https://huggingface.co/join
2. Create a free account
3. Navigate to https://huggingface.co/settings/tokens
4. Click "New token"
5. Name: `SlideTutor-AI`
6. Select "Read" permission
7. Copy the token (starts with `hf_`)

### 2. Update Environment Variables

Add your token to both `.env` files:

**`.env` (Local Development)**
```dotenv
HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE
VITE_HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE
```

**`.env.local` (Vercel Deployment)**
```dotenv
HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE
VITE_HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE
```

**Vercel Dashboard** (Alternative)
- Project Settings → Environment Variables
- Add: `HUGGING_FACE_API_KEY` = `hf_YOUR_TOKEN_HERE`
- Redeploy

### 3. Important: Never Commit Tokens

The `.env` file is already in `.gitignore`. Keep it that way!

```gitignore
# ✅ Good - Token is safe
.env
.env.local
```

## 📁 New Files Added

### `/api/analyzeImage.ts`
Standalone API endpoint for BLIP-2 vision analysis
- Authenticates user
- Validates image data
- Calls Hugging Face BLIP-2 API
- Handles retries and errors

### Updated `/api/analyze.ts`
Enhanced main analysis endpoint
- Imports `callBLIP2Vision()` function
- When thumbnail is available:
  - Calls BLIP-2 for visual analysis
  - Combines OCR + Vision results
  - Sends enhanced text to Gemini

### Updated `src/services/aiService.ts`
Added new functions:
- `analyzeSlideImage()` - Direct vision API call
- `VisionAnalysisResult` interface

## 🎯 How It Works

### Step 1: User Uploads PDF
```typescript
// App.tsx extracts slides
const slides = extractFromPDF(file)
// Each slide has:
// - number: page number
// - textContent: OCR text
// - thumbnail: base64 image data
```

### Step 2: User Clicks "Explain Slide"
```typescript
// React component calls:
await analyzeSlide(
    [slideNumber],
    [textContent],
    'simple',  // mode
    thumbnailImage  // ← Vision data
)
```

### Step 3: Backend Processing
```typescript
// api/analyze.ts receives request
const enhancedText = combinedText;

if (thumbnail && huggingFaceToken) {
    // Call BLIP-2
    const visionAnalysis = await callBLIP2Vision(
        thumbnail,
        'Describe this slide...',
        huggingFaceToken
    );
    
    // Combine results
    enhancedText = `${combinedText}\n[VISION]: ${visionAnalysis}`;
}

// Send to Gemini with enhanced content
```

### Step 4: Gemini Generates Explanation
```typescript
// Gemini receives combined text:
// "OCR TEXT + VISION ANALYSIS"
// Generates comprehensive explanation covering:
// - All text points
// - Visual elements from BLIP-2
// - Tables in markdown
// - Equations in LaTeX
```

## ⚙️ Configuration Details

### BLIP-2 Model Settings
- **Model**: `Salesforce/blip2-opt-6.7b`
- **API**: Hugging Face Inference API (free tier available)
- **Input**: Base64 image + text prompt
- **Output**: Natural language description
- **Timeout**: 30 seconds per request
- **Retries**: 2 attempts with exponential backoff

### Prompt Template
```
"Describe this slide in detail. Include all text, diagrams, tables, 
charts, and visual elements. For tables, provide markdown format. 
For equations, use LaTeX format."
```

### Error Handling
1. **Vision fails, continue with text**: Falls back to OCR-only
2. **Both vision and text fail**: Returns empty slide response
3. **API rate limit (429)**: Retries after exponential backoff
4. **API busy (503)**: Retries up to 2 times
5. **Timeout (>30s)**: Fails gracefully, continues with text

## 📊 Usage & Quotas

### Hugging Face Free Tier
- ✅ **Unlimited** inference requests
- ✅ **All models** available
- ⚠️ Models may take 5-10 seconds first time (cold start)
- ⚠️ Heavy use may experience rate limiting

### Cost
- **Zero additional cost** (free tier unlimited)
- If you need guaranteed performance → Hugging Face Pro ($9/month)

## 🧪 Testing Vision Integration

### Test 1: Direct API Call (Node.js)
```javascript
const response = await fetch('/api/analyzeImage', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        imageData: base64ImageString,
        prompt: 'Describe this image'
    })
});
console.log(await response.json());
```

### Test 2: Full Workflow
1. Upload a PDF with diagrams
2. Click "Explain Slide" on a diagram-heavy slide
3. Check browser console for BLIP-2 logs:
   ```
   BLIP-2 Vision Attempt 1/2
   Vision analysis completed successfully
   ```
4. Verify explanation includes diagram descriptions

### Test 3: Check Environment Variables
```bash
# Run in Vercel function
echo "HUGGING_FACE_API_KEY is set: $([[ -z $HUGGING_FACE_API_KEY ]] && echo 'NO' || echo 'YES')"
```

## 🚨 Troubleshooting

### Issue: "Vision analysis failed"
**Cause**: Token not set or invalid
**Fix**: 
1. Verify token in `.env`
2. Check token permissions on huggingface.co
3. Restart dev server

### Issue: "BLIP-2 returned empty response"
**Cause**: Image too small or unclear
**Fix**: Test with clearer images, check console logs

### Issue: "Service unavailable (503)"
**Cause**: Hugging Face API overloaded or model cold-starting
**Fix**: System automatically retries 2x with backoff

### Issue: Slow response times (5-10 seconds)
**Cause**: BLIP-2 model loading for first time
**Fix**: This is normal for free tier; subsequent requests faster

### Issue: "Permission denied" on Vercel
**Cause**: Environment variable not set in Vercel dashboard
**Fix**: Go to Project Settings → Environment Variables → Add token

## 📈 Performance Optimization

### Current Implementation
- Sequential: Text extraction → Vision analysis → Gemini generation
- Vision analysis adds 2-10 seconds per slide

### Future Improvements
- Parallel vision + text processing
- Caching vision results for repeated slides
- Progressive UI updates (show results as they arrive)
- Optional vision toggle (user preference)

## 🔒 Security Notes

1. **Token Security**:
   - Never commit `.env` files
   - Use Vercel Environment Variables for production
   - Rotate tokens periodically

2. **User Authentication**:
   - All vision API calls require Firebase auth token
   - Backend verifies token before processing
   - Images not stored; processed immediately

3. **Data Privacy**:
   - Images sent to Hugging Face API
   - No data stored on Hugging Face
   - Own Vercel instance keeps no copies

## 📚 References

- [BLIP-2 Model Card](https://huggingface.co/Salesforce/blip2-opt-6.7b)
- [Hugging Face Inference API Docs](https://huggingface.co/docs/api-inference/index)
- [Hugging Face API Keys](https://huggingface.co/settings/tokens)

## 🎓 What BLIP-2 Can Do

✅ **Good At**
- Reading text from images
- Describing diagrams and charts
- Understanding table layouts
- Recognizing equations
- Identifying visual relationships

⚠️ **Limitations**
- May struggle with very small fonts
- Can misinterpret ambiguous handwriting
- Doesn't extract perfect table data (use OCR for that)
- Single query per image

## 🚀 Next Steps

1. **Add your Hugging Face token** to `.env`
2. **Test with a diagram-heavy PDF**
3. **Monitor browser console** for vision analysis logs
4. **Provide feedback** on accuracy and speed
5. **Consider** vision toggle UI for users

## ✅ Checklist

- [ ] Created Hugging Face account
- [ ] Generated API token
- [ ] Added token to `.env`
- [ ] Added token to Vercel environment variables
- [ ] Tested with local dev server
- [ ] Tested on Vercel deployment
- [ ] Verified logs show "Vision analysis completed"
- [ ] Explained slides include diagram descriptions

---

**Version**: 1.0  
**Last Updated**: February 2026  
**Maintainer**: SlideTutor-AI Team
