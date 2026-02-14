import Tesseract from 'tesseract.js';

/**
 * Extracts text from an image using Tesseract OCR
 * @param imageData - Image data in base64 or data URL format
 * @returns Promise<string> - Extracted text
 */
export const extractTextFromImage = async (imageData: string): Promise<string> => {
    try {
        // Convert data URL to base64 if needed
        let base64Image = imageData;
        if (imageData.startsWith('data:')) {
            base64Image = imageData;
        }

        console.log('Starting OCR extraction...');

        const result = await Tesseract.recognize(
            base64Image,
            ['ara', 'eng'], // Arabic and English
            {
                logger: (m) => {
                    if (m.status === 'recognizing') {
                        console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                    }
                }
            }
        );

        const extractedText = result.data.text || '';
        console.log('OCR extraction complete. Text length:', extractedText.length);

        return extractedText.trim();
    } catch (error: any) {
        console.error('OCR Error:', error);
        throw new Error(`Failed to extract text from image: ${error.message}`);
    }
};

/**
 * Analyzes an image using Tesseract OCR and returns the extracted text
 * Falls back to generic description if OCR fails
 * @param imageData - Image data in base64 or data URL format
 * @returns Promise<string> - Extracted or processed text
 */
export const processImageForAnalysis = async (imageData: string): Promise<string> => {
    try {
        const extractedText = await extractTextFromImage(imageData);

        // If we got meaningful text from OCR, return it
        if (extractedText.length > 50) {
            return extractedText;
        }

        // If text is too short, return a message for vision analysis
        if (extractedText.length > 0) {
            return `[OCR Text]: ${extractedText}\n\n[Additional Visual Analysis Needed]: This image may contain diagrams, charts, or visual elements that require additional analysis.`;
        }

        // If no text was extracted, return a fallback message
        return '[IMAGE_UPLOADED] This image needs visual analysis for diagrams, charts, tables, and other visual content.';
    } catch (error) {
        console.error('Image processing error:', error);
        // Fallback if OCR fails
        return '[IMAGE_UPLOADED] Slide image uploaded. Visual analysis in progress.';
    }
};

/**
 * Extracts text from a PDF page rendered as image using OCR
 * @param canvas - Canvas element containing the rendered PDF page
 * @returns Promise<string> - Extracted text
 */
export const extractTextFromPDFPage = async (canvas: HTMLCanvasElement): Promise<string> => {
    try {
        const imageData = canvas.toDataURL('image/png');
        return await extractTextFromImage(imageData);
    } catch (error: any) {
        console.error('Failed to extract text from PDF page:', error);
        return '';
    }
};

