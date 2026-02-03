import JSZip from 'jszip';

export interface PPTXSlide {
    slideNumber: number;
    textContent: string;
    thumbnail?: string; // Base64 image data
}

/**
 * Extracts text content and thumbnails from a PPTX file.
 * PPTX files are ZIP archives containing XML files and media.
 * Text is stored in ppt/slides/slide*.xml files.
 * Thumbnails can be found in ppt/media/ or docProps/thumbnail.jpeg
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

        // Collect slide relationship files to find images
        const slideRels: Map<number, string[]> = new Map();
        zip.folder('ppt/slides/_rels')?.forEach((relativePath, file) => {
            const match = relativePath.match(/^slide(\d+)\.xml\.rels$/);
            if (match) {
                const slideNum = parseInt(match[1]);
                file.async('text').then(content => {
                    const imageRefs = extractImageReferences(content);
                    slideRels.set(slideNum, imageRefs);
                });
            }
        });

        // Wait for all relationship files to be processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Extract text and thumbnail from each slide
        for (let i = 0; i < slideFiles.length; i++) {
            const slideFile = slideFiles[i].file;
            const slideNumber = i + 1;
            const xmlContent = await slideFile.async('text');
            const textContent = extractTextFromSlideXML(xmlContent);

            // Try to get the first image for this slide as thumbnail
            let thumbnail: string | undefined;
            const imageRefs = slideRels.get(slideNumber);
            if (imageRefs && imageRefs.length > 0) {
                const imagePath = `ppt/media/${imageRefs[0]}`;
                const imageFile = zip.file(imagePath);
                if (imageFile) {
                    const imageBlob = await imageFile.async('blob');
                    thumbnail = await blobToBase64(imageBlob);
                }
            }

            slides.push({
                slideNumber,
                textContent: textContent.trim(),
                thumbnail
            });
        }

        return slides;
    } catch (error) {
        console.error('Error extracting PPTX content:', error);
        throw new Error('Failed to process PPTX file. Please ensure it is a valid PowerPoint file.');
    }
}

/**
 * Extracts image references from slide relationship XML.
 */
function extractImageReferences(relsXML: string): string[] {
    const imageRefs: string[] = [];
    const regex = /<Relationship[^>]*Type="[^"]*image"[^>]*Target="\.\.\/media\/([^"]+)"/g;
    let match;
    while ((match = regex.exec(relsXML)) !== null) {
        imageRefs.push(match[1]);
    }
    return imageRefs;
}

/**
 * Converts a Blob to Base64 data URL.
 */
async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
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
