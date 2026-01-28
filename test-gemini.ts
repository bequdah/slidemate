import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

async function test() {
    const apiKey = "AIzaSyDtl5kabEt50znlM1XwfINv0IRODjI5dRE"; // Updated with new key
    if (!apiKey) {
        console.error("Error: GEMINI_API_KEY is not set in .env file");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    console.log("Testing gemini-2.0-flash...");
    try {
        const result = await model.generateContent("Say hello");
        console.log("Response:", result.response.text());
        console.log("SUCCESS: Gemini 2.0 Flash is working!");
    } catch (error: any) {
        console.error("Detailed Error:", error);
    }
}

test();
