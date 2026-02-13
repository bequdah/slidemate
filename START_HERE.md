# 🎯 GETTING STARTED - SlideTutor-AI with BLIP-2 Vision

**Welcome! Your SlideTutor-AI project now has AI vision capabilities.** 

This file gets you running in **5 minutes**. Let's go! 🚀

---

## ⚡ 5-Minute Quick Start

### Step 1: Get Hugging Face Token (2 min)
```bash
# 1. Go to https://huggingface.co/join
# 2. Create free account (or login if you have one)
# 3. Go to https://huggingface.co/settings/tokens
# 4. Click "New token"
# 5. Copy your token (starts with hf_)
```

### Step 2: Configure Your Project (2 min)
```bash
# Open .env file in project root
# Add these two lines:
HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE
VITE_HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE

# Replace hf_YOUR_TOKEN_HERE with your actual token
```

### Step 3: Run It! (1 min)
```bash
# Install dependencies (first time only)
npm install

# Start dev server
npm run dev

# Open http://localhost:5173 in your browser
```

**That's it! You're ready to use vision analysis.** ✨

---

## 🧪 Quick Test

1. **Login** with your account
2. **Upload** a PDF with diagrams or charts
3. **Select** a slide with visual content
4. **Click** "Explain" button
5. **Watch** the AI understand the image! 🎉

You should see in the explanation:
- ✅ Text descriptions from the slide
- ✅ Details about diagrams/charts
- ✅ Table layouts explained
- ✅ Visual relationships described

---

## 📚 Documentation Guide

### For Quick Help
👉 **[QUICK_SETUP.md](./QUICK_SETUP.md)** - 5-minute setup with troubleshooting

### For Understanding How It Works
👉 **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - What was built and why

### For Detailed Information
👉 **[VISION_INTEGRATION.md](./VISION_INTEGRATION.md)** - Complete technical guide

### For Code Examples
👉 **[CODE_REFERENCE.md](./CODE_REFERENCE.md)** - Copy-paste code snippets

### For Deployment
👉 **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Production deployment guide

### For All Documentation
👉 **[DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)** - Full documentation map

---

## ❓ Common Questions

### Q: Do I need to pay anything?
**A:** No! Hugging Face offers unlimited free inference. No credit card needed.

### Q: What if I don't add the token?
**A:** The app still works! It falls back to text-only analysis (no vision).

### Q: Is my data private?
**A:** Yes. Images are analyzed but not stored. See [VISION_INTEGRATION.md](./VISION_INTEGRATION.md#-security-notes) for details.

### Q: How long does analysis take?
**A:** 5-15 seconds per slide. First request is slower (model loads), subsequent requests are faster.

### Q: What if analysis fails?
**A:** System automatically retries. If it fails, falls back to text-only analysis.

### Q: Can I use my own Hugging Face model?
**A:** Yes! See [CODE_REFERENCE.md](./CODE_REFERENCE.md) for how to modify the prompt.

---

## 🚀 For Production (Vercel)

1. **Add environment variable to Vercel:**
   - Go to https://vercel.com/dashboard
   - Select your project
   - Settings → Environment Variables
   - Add: `HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE`
   - Save and redeploy

2. **Push code to GitHub:**
   ```bash
   git add .
   git commit -m "Add BLIP-2 vision integration"
   git push
   ```

3. **Vercel auto-deploys!** ✅

For more details: [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)

---

## 🆘 Troubleshooting

### "Vision analysis failed"
✅ **Check:** Is token in `.env`? Is it valid? Restart dev server.

### "Service unavailable (503)"
✅ **Normal:** Happens sometimes. System retries automatically.

### "Permission denied"
✅ **For Vercel:** Add token in Vercel dashboard, not just `.env`.

### Slow processing (10+ seconds)
✅ **Normal:** First request loads model. Subsequent requests are faster.

See [QUICK_SETUP.md](./QUICK_SETUP.md#🆘-مشاكل-شائعة) for more troubleshooting.

---

## 📊 What Was Added

### New Features
- ✅ **BLIP-2 Vision Analysis** - Understands images and diagrams
- ✅ **Smart Fallback** - Uses text-only if vision unavailable
- ✅ **Automatic Retries** - Handles network issues gracefully
- ✅ **Better Explanations** - Combines text and visual understanding

### New Code
- ✅ `/api/analyzeImage.ts` - Vision API endpoint
- ✅ `analyzeSlideImage()` function - Client-side vision calls
- ✅ Vision integration in `/api/analyze.ts`

### Zero Breaking Changes
- ✅ All existing features work unchanged
- ✅ No new dependencies
- ✅ Works with or without vision token

---

## 🎓 Architecture (Simple View)

```
PDF Upload
    ↓
Extract Text (OCR) + Image Thumbnail
    ↓
Send to /api/analyze
    ├─ Extract text from PDF
    ├─ If image available:
    │  └─ Send to BLIP-2 (Hugging Face)
    │     └─ Get visual description
    ├─ Combine text + vision
    └─ Send to Gemini LLM
    ↓
Get Explanation
├─ Text content
├─ Visual explanations
├─ Quiz questions
└─ Voice script
```

For detailed diagrams: [VISUAL_ARCHITECTURE.md](./VISUAL_ARCHITECTURE.md)

---

## ✅ Next Steps

### Now (5 min)
- [ ] Get Hugging Face token
- [ ] Add to `.env`
- [ ] Run `npm run dev`
- [ ] Test with PDF

### Today (1 hour)
- [ ] Read [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- [ ] Understand the architecture
- [ ] Test with different PDFs

### This Week (varies)
- [ ] Deploy to Vercel production
- [ ] Set environment variables
- [ ] Monitor performance
- [ ] Gather user feedback

### Future (optional)
- [ ] Implement caching
- [ ] Add vision preferences UI
- [ ] Monitor analytics
- [ ] Optimize performance

---

## 🔗 Important Links

- **Hugging Face**: https://huggingface.co
- **Get Token**: https://huggingface.co/settings/tokens
- **BLIP-2 Model**: https://huggingface.co/Salesforce/blip2-opt-6.7b
- **Vercel Dashboard**: https://vercel.com/dashboard

---

## 📞 Need Help?

1. **Quick answers**: Check [QUICK_SETUP.md](./QUICK_SETUP.md)
2. **Technical details**: See [VISION_INTEGRATION.md](./VISION_INTEGRATION.md)
3. **Code examples**: Look at [CODE_REFERENCE.md](./CODE_REFERENCE.md)
4. **Full map**: Visit [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)

---

## 🎉 You're Ready!

**Everything is set up. Just add your token and run!**

```bash
# Add to .env:
HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE
VITE_HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE

# Then:
npm run dev

# Open: http://localhost:5173
```

**That's it!** The AI now understands images in your slides. 🚀

---

**Questions?** Read the docs above. Everything is explained! 📚

**Ready to deploy?** See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)

**Want to learn more?** Check [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)

Happy analyzing! ✨
