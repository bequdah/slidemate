import JSZip from 'jszip';

export interface PPTXSlide {
    slideNumber: number;
    textContent: string;
}

/**
 * Extracts text content from a PPTX file.
 * PPTX files are ZIP archives containing XML files.
 * Text is stored in ppt/slides/slide*.xml files.
 */
export async function extractPPTXContent(file: File): Promise<PPTXSlide[]> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);

        const slides: PPTXSlide[] = [];
        const slideFiles: { name: string; file: JSZip.JSZipObject }[] = [];

        // Collect all slide XML files
        zip.folder('ppt/slides')?.forEach((relativePath, file) => {
            if (relativePath.match(/^slide\d+\.xml$/)) {
                slideFiles.push({ name: relativePath, file });
            }
        });

        // Sort slides by number
        slideFiles.sort((a, b) => {
            const numA = parseInt(a.name.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.name.match(/\d+/)?.[0] || '0');
            return numA - numB;
        });

        // Extract text from each slide
        for (let i = 0; i < slideFiles.length; i++) {
            const slideFile = slideFiles[i].file;
            const xmlContent = await slideFile.async('text');
            const textContent = extractTextFromSlideXML(xmlContent);

            slides.push({
                slideNumber: i + 1,
                textContent: textContent.trim()
            });
        }

        return slides;
    } catch (error) {
        console.error('Error extracting PPTX content:', error);
        throw new Error('Failed to process PPTX file. Please ensure it is a valid PowerPoint file.');
    }
}

/**
 * Extracts plain text from a slide XML content.
 * Looks for <a:t> tags which contain the actual text.
 */
function extractTextFromSlideXML(xmlContent: string): string {
    const textMatches = xmlContent.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);

    if (!textMatches) {
        return '';
    }

    const texts = textMatches.map(match => {
        const textContent = match.replace(/<a:t[^>]*>/, '').replace(/<\/a:t>/, '');
        return decodeXMLEntities(textContent);
    });

    return texts.join(' ');
}

/**
 * Decodes common XML entities.
 */
function decodeXMLEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}
