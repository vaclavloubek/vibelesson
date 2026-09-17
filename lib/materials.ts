import JSZip from 'jszip';
import { PDFParse } from 'pdf-parse';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_CHARS = 60_000;

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'pptx', 'docx', 'txt', 'md', 'markdown']);

export type MaterialMode = 'grounded' | 'strict' | 'inspiration';

export type ExtractedMaterial = {
  name: string;
  text: string;
};

function getExtension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function extractXmlText(xml: string, textTag: RegExp, paragraphTag: RegExp) {
  return decodeXmlEntities(
    xml
      .replace(paragraphTag, '\n')
      .replace(textTag, '$1 ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractDocx(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const parts = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'];
  const texts: string[] = [];

  for (const path of parts) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const text = extractXmlText(xml, /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, /<\/w:p>/g);
    if (text) texts.push(text);
  }

  return texts.join('\n\n');
}

function slideNumber(path: string) {
  const match = path.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function extractPptx(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const slides: string[] = [];
  for (const path of slidePaths) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const text = extractXmlText(xml, /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, /<\/a:p>/g);
    if (text) slides.push(`Snímek ${slideNumber(path)}:\n${text}`);
  }

  const notePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path))
    .sort();
  const notes: string[] = [];
  for (const path of notePaths) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const text = extractXmlText(xml, /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, /<\/a:p>/g);
    if (text) notes.push(text);
  }

  return notes.length > 0
    ? `${slides.join('\n\n')}\n\nPoznámky prezentace:\n${notes.join('\n\n')}`
    : slides.join('\n\n');
}

async function extractPdf(buffer: ArrayBuffer) {
  const parser = new PDFParse({ data: Buffer.from(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractFile(file: File): Promise<ExtractedMaterial> {
  const extension = getExtension(file.name);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`Soubor ${file.name} nemá podporovaný formát.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Soubor ${file.name} je větší než 10 MB.`);
  }

  const buffer = await file.arrayBuffer();
  let text = '';

  if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
    text = new TextDecoder('utf-8').decode(buffer);
  } else if (extension === 'docx') {
    text = await extractDocx(buffer);
  } else if (extension === 'pptx') {
    text = await extractPptx(buffer);
  } else if (extension === 'pdf') {
    text = await extractPdf(buffer);
  }

  text = text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error(`Ze souboru ${file.name} se nepodařilo získat žádný text.`);

  return { name: file.name, text };
}

export async function extractLessonMaterials(files: File[]) {
  if (files.length > MAX_FILES) throw new Error(`Lze nahrát maximálně ${MAX_FILES} souborů.`);

  const extracted = await Promise.all(files.map(extractFile));
  let remaining = MAX_TOTAL_CHARS;
  const chunks: string[] = [];

  for (const material of extracted) {
    if (remaining <= 0) break;
    const header = `--- PODKLAD: ${material.name} ---\n`;
    const available = Math.max(0, remaining - header.length);
    const body = material.text.slice(0, available);
    chunks.push(`${header}${body}`);
    remaining -= header.length + body.length;
  }

  return {
    text: chunks.join('\n\n'),
    files: extracted.map((item) => item.name),
    truncated: remaining <= 0,
  };
}
