import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Safe worker init for vite
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

import mammoth from 'mammoth';

/**
 * Extracts text from a PDF file
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    fullText += strings.join(' ') + '\n';
  }
  return fullText;
}

/**
 * Extracts text from a DOCX file
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/**
 * Converts File to Base64 String 
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // remove the data:MIME_TYPE;base64, prefix
      const base64Data = result.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = error => reject(error);
  });
}

/**
 * Generic File Parser
 */
export async function parseFile(file: File): Promise<{ type: "text"|"image"|"audio", content?: string, base64?: string, mimeType?: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) {
    return { type: "image", base64: await fileToBase64(file), mimeType: file.type };
  }
  
  if (['mp3', 'wav', 'ogg'].includes(ext || '')) {
    return { type: "audio", base64: await fileToBase64(file), mimeType: file.type };
  }

  if (ext === 'pdf') {
    return { type: "text", content: await extractTextFromPDF(file) };
  }
  
  if (ext === 'docx') {
    return { type: "text", content: await extractTextFromDocx(file) };
  }

  // Fallback as general text
  const text = await file.text();
  return { type: "text", content: text };
}

/**
 * Extremely basic chunker. For production, use LangChain text splitters.
 */
export function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  
  if (words.length === 0) return [];
  
  while (i < Math.max(1, words.length)) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim()) {
      chunks.push(chunk);
    }
    if (i + chunkSize >= words.length) break;
    i += (chunkSize - overlap);
  }
  return chunks;
}
