# Code Reference - BLIP-2 Vision Integration

## Quick Code Examples

### 1. Using Vision Analysis in React Component

```typescript
import { analyzeSlideImage } from '../services/aiService';

export function DiagramSlide({ thumbnail, slideNumber }) {
    const [analyzing, setAnalyzing] = useState(false);
    const [visionResult, setVisionResult] = useState('');

    const handleAnalyzeDiagram = async () => {
        setAnalyzing(true);
        try {
            const result = await analyzeSlideImage(
                thumbnail,
                'Analyze this diagram and explain its components'
            );
            
            if (result.success) {
                setVisionResult(result.imageAnalysis);
            } else {
                console.error(result.imageAnalysis);
            }
        } finally {
            setAnalyzing(false);
        }
    };

    return (
        <div>
            <img src={thumbnail} alt={`Slide ${slideNumber}`} />
            <button 
                onClick={handleAnalyzeDiagram}
                disabled={analyzing}
            >
                {analyzing ? 'Analyzing...' : 'Analyze Diagram'}
            </button>
            {visionResult && <p>{visionResult}</p>}
        </div>
    );
}
```

### 2. Main Analysis with Vision Integration

```typescript
// This is what happens internally in /api/analyze.ts

const analyzeWithVision = async (
    slideNumbers: number[],
    textContent: string[],
    thumbnail: string,
    huggingFaceToken: string
) => {
    // Step 1: Get OCR text
    const ocrText = textContent.join(' ');

    // Step 2: If we have image, enhance with vision
    let enhancedText = ocrText;
    
    if (thumbnail && huggingFaceToken) {
        try {
            const visionAnalysis = await callBLIP2Vision(
                thumbnail,
                'Describe all visual elements in this slide',
                huggingFaceToken
            );
            
            enhancedText = `${ocrText}\n\n[VISION ANALYSIS]:\n${visionAnalysis}`;
        } catch (error) {
            console.warn('Vision failed, continuing with OCR only');
        }
    }

    // Step 3: Send to Gemini
    const response = await gemini.generateContent({
        prompt: buildPrompt(enhancedText),
        mode: 'simple'
    });

    return response;
};
```

### 3. Direct API Call from Frontend

```typescript
// Call vision API directly
const analyzeWithCustomPrompt = async (imageData: string) => {
    const user = auth.currentUser;
    const token = await user.getIdToken();

    const response = await fetch('/api/analyzeImage', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            imageData: imageData,
            prompt: 'Focus on the mathematical relationships shown'
        })
    });

    if (!response.ok) {
        throw new Error(`Analysis failed: ${response.status}`);
    }

    return response.json(); // { success, imageAnalysis, timestamp }
};
```

### 4. Error Handling Pattern

```typescript
// Robust error handling for vision analysis
const safeAnalyzeImage = async (imageData: string) => {
    try {
        const result = await analyzeSlideImage(imageData);
        
        if (!result.success) {
            // Vision analysis returned error
            console.error('Vision error:', result.imageAnalysis);
            return { 
                fallback: true, 
                message: 'Skipping vision, using text only' 
            };
        }
        
        return { success: true, data: result.imageAnalysis };
        
    } catch (error) {
        // Network or auth error
        console.error('Vision API error:', error);
        return { 
            fallback: true, 
            message: 'Vision unavailable, analyzing text only' 
        };
    }
};
```

### 5. Vision + Text Combination

```typescript
// How to optimally combine vision and text analysis
const combineAnalyses = (ocrText: string, visionAnalysis: string) => {
    return {
        text: ocrText,
        visual: visionAnalysis,
        combined: `
            TEXT CONTENT:
            ${ocrText}

            VISUAL ELEMENTS:
            ${visionAnalysis}

            KEY RELATIONSHIPS:
            [Let LLM identify these from combined content]
        `,
        score: {
            hasText: ocrText.length > 0,
            hasVision: visionAnalysis.length > 0,
            quality: (ocrText.length + visionAnalysis.length) / 1000
        }
    };
};
```

### 6. Environment Configuration

```typescript
// .env.example
HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE
VITE_HUGGING_FACE_API_KEY=hf_YOUR_TOKEN_HERE

// Vercel deployment
// Settings → Environment Variables
// Add: HUGGING_FACE_API_KEY = hf_YOUR_TOKEN_HERE
```

### 7. Testing Vision Integration

```typescript
// Test file: api/__tests__/analyzeImage.test.ts

import handler from '../analyzeImage';

describe('BLIP-2 Vision Analysis', () => {
    it('should analyze image successfully', async () => {
        const req = {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${validToken}`,
                'content-type': 'application/json'
            },
            body: {
                imageData: base64ImageString,
                prompt: 'Describe this image'
            }
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            setHeader: jest.fn()
        };

        await handler(req as any, res as any);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                imageAnalysis: expect.any(String)
            })
        );
    });

    it('should handle missing token', async () => {
        const req = {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: { imageData: base64ImageString }
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            setHeader: jest.fn()
        };

        await handler(req as any, res as any);

        expect(res.status).toHaveBeenCalledWith(401);
    });
});
```

### 8. Monitoring & Logging

```typescript
// Add to api/analyze.ts for monitoring
const logVisionAnalysis = (
    slideNumber: number,
    success: boolean,
    duration: number,
    error?: string
) => {
    console.log(JSON.stringify({
        event: 'vision_analysis',
        slide: slideNumber,
        success,
        duration_ms: duration,
        error: error || null,
        timestamp: new Date().toISOString()
    }));
};

// Usage:
const start = Date.now();
try {
    const visionResult = await callBLIP2Vision(...);
    const duration = Date.now() - start;
    logVisionAnalysis(slideNumber, true, duration);
} catch (error) {
    const duration = Date.now() - start;
    logVisionAnalysis(slideNumber, false, duration, error.message);
}
```

### 9. Performance Optimization

```typescript
// Cache vision results to avoid re-processing
const visionCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hour

const cachedAnalyzeImage = async (
    imageHash: string, 
    imageData: string,
    prompt: string
) => {
    // Check cache
    const cached = visionCache.get(imageHash);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log('Cache hit for image:', imageHash);
        return cached.result;
    }

    // Call vision API
    const result = await analyzeSlideImage(imageData, prompt);

    // Store in cache
    visionCache.set(imageHash, {
        result: result.imageAnalysis,
        timestamp: Date.now()
    });

    return result.imageAnalysis;
};
```

### 10. Parallel Processing

```typescript
// Process multiple slides with vision in parallel
const analyzeMultipleSlidesWithVision = async (
    slides: Array<{ number: number; text: string; thumbnail: string }>
) => {
    const analyses = await Promise.allSettled(
        slides.map(slide =>
            analyzeSlideImage(slide.thumbnail)
                .then(result => ({
                    slideNumber: slide.number,
                    visionAnalysis: result.imageAnalysis,
                    status: 'success' as const
                }))
                .catch(error => ({
                    slideNumber: slide.number,
                    error: error.message,
                    status: 'failed' as const
                }))
        )
    );

    // Filter successes
    const successful = analyses
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseSettledResult<any>).value)
        .filter(r => r.status === 'success');

    return {
        total: slides.length,
        successful: successful.length,
        results: successful
    };
};
```

---

## API Response Types

### `/api/analyzeImage` Response

```typescript
interface VisionAPIResponse {
    success: boolean;
    imageAnalysis: string;      // The vision model's output
    timestamp: string;           // ISO timestamp
    error?: string;              // If success is false
}
```

### `/api/analyze` Response (Enhanced)

```typescript
interface AnalysisResponse {
    explanation: {
        title: string;
        overview: string;
        sections: Section[];
    };
    examInsight: {
        title: string;
        overview: string;
        sections: Section[];
    };
    quiz: MCQ[];
    arabic: {
        explanation: any;
        examInsight: any;
        voiceScript: string;
    };
    voiceScript: string;
    note?: string;  // If vision was used
}

interface Section {
    heading: string;
    bullets?: string[];
    text?: string;
}

interface MCQ {
    q: string;
    options: string[];
    a: number;  // 0-3
    reasoning: string;
}
```

---

## Environment Variables Reference

```bash
# Development (.env)
HUGGING_FACE_API_KEY=hf_abc123...
VITE_HUGGING_FACE_API_KEY=hf_abc123...
GEMINI_API_KEY=AIza...
GROQ_API_KEY=gsk_...

# Production (Vercel)
# Same variables, set via Vercel dashboard

# Optional: Vision Model Selection (future)
VISION_MODEL=blip2          # or llava, gpt4v, etc
VISION_PROVIDER=huggingface # or openai, local, etc
```

---

## Troubleshooting Code Snippets

### Check if Vision is Working

```typescript
// Run in browser console
const testVision = async () => {
    const user = auth.currentUser;
    const token = await user.getIdToken();

    const response = await fetch('/api/analyzeImage', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            imageData: 'data:image/png;base64,...',  // Your image
            prompt: 'Describe this image'
        })
    });

    const data = await response.json();
    console.log('Vision result:', data);
    return data;
};

testVision();
```

### Verify Hugging Face Token

```bash
# Test token validity (bash)
curl -H "Authorization: Bearer hf_YOUR_TOKEN" \
  https://huggingface.co/api/user

# Should return user info if valid
```

### Monitor Vision Latency

```typescript
const measureVisionLatency = async () => {
    const times = [];

    for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await analyzeSlideImage(imageData);
        const duration = performance.now() - start;
        times.push(duration);
    }

    console.log('Vision latency stats:', {
        min: Math.min(...times),
        max: Math.max(...times),
        avg: times.reduce((a, b) => a + b) / times.length,
        all: times
    });
};
```

---

## Constants & Configuration

```typescript
// api/analyze.ts
const VISION_CONFIG = {
    MODEL: 'Salesforce/blip2-opt-6.7b',
    MAX_RETRIES: 2,
    TIMEOUT_MS: 30000,
    BACKOFF_BASE: 1000,  // exponential backoff
    ENABLE_CACHING: true,
    CACHE_DURATION_MS: 3600000  // 1 hour
};

const VISION_PROMPTS = {
    DETAILED: 'Describe this image in detail. Include all text, diagrams, tables, charts, and visual elements. For tables, provide markdown format. For equations, use LaTeX format.',
    CONCISE: 'Briefly describe the main elements in this image.',
    TECHNICAL: 'Analyze this technical diagram. Explain the components, relationships, and data flow.',
    TABLE: 'Extract and format this table as markdown.',
    EQUATION: 'Explain this mathematical equation or formula.'
};
```

---

**Last Updated**: February 2026  
**For Questions**: See VISION_INTEGRATION.md
