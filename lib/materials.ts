import JSZip from 'jszip';
import { PDFParse } from 'pdf-parse';

export const MATERIAL_MAX_FILES = 5;
export const MATERIAL_MAX_TOTAL_BYTES = 3_500_000;
const MATERIAL_MAX_TEXT_PER_FILE = 40_000;
const MATERIAL_MAX_TEXT_TOTAL = 100_000;

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'pptx', 'docx', 'txt', 'md']);

export type MaterialMode = 'primary' | 'strict' | 'inspiration';

export type ExtractedMaterial = {
  name: string;
  text: string;
};

export class MaterialError extends Error {}

function extensionOf(name: string) {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n\n[Obsah podkladu byl kvůli délce zkrácen.]`;
}

function xmlParagraphText(xml: string, paragraphTag: string, textTag: string) {
  const paragraphs = xml.match(new RegExp(`<${paragraphTag}\\b[\\s\\S]*?<\\/${paragraphTag}>`, 'g')) ?? [];
  const textPattern = new RegExp(`<${textTag}\\b[^>]*>([\\s\\S]*?)<\\/${textTag}>`, 'g');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const chunks: string[] = [];
    for (const match of paragraph.matchAll(textPattern)) chunks.push(decodeXmlEntities(match[1]));
    const line = chunks.join('').trim();
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

async function extractDocx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const document = zip.file('word/document.xml');
  if (!document) throw new MaterialError('DOCX neobsahuje čitelný dokument.');
  const xml = await document.async('string');
  return xmlParagraphText(xml, 'w:p', 'w:t');
}

function slideNumber(path: string) {
  const match = path.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function extractPptx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = zip.file(/^ppt\/slides\/slide\d+\.xml$/).sort((a, b) => slideNumber(a.name) - slideNumber(b.name));
  if (!slideFiles.length) throw new MaterialError('PPTX neobsahuje čitelné snímky.');

  const slides: string[] = [];
  for (const file of slideFiles) {
    const xml = await file.async('string');
    const text = xmlParagraphText(xml, 'a:p', 'a:t');
    if (text) slides.push(`Snímek ${slideNumber(file.name)}\n${text}`);
  }

  const noteFiles = zip.file(/^ppt\/notesSlides\/notesSlide\d+\.xml$/).sort((a, b) => slideNumber(a.name) - slideNumber(b.name));
  for (const file of noteFiles) {
    const xml = await file.async('string');
    const text = xmlParagraphText(xml, 'a:p', 'a:t');
    if (text) slides.push(`Poznámky ${slideNumber(file.name)}\n${text}`);
  }

  return slides.join('\n\n');
}

async function extractPdf(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractSingle(file: File): Promise<ExtractedMaterial> {
  const extension = extensionOf(file.name);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new MaterialError(`Soubor „${file.name}“ má nepodporovaný formát. Použij PDF, PPTX, DOCX, TXT nebo MD.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text = '';
  if (extension === 'pdf') text = await extractPdf(buffer);
  else if (extension === 'pptx') text = await extractPptx(buffer);
  else if (extension === 'docx') text = await extractDocx(buffer);
  else text = new TextDecoder('utf-8').decode(buffer);

  const normalized = normalizeText(text);
  if (!normalized) throw new MaterialError(`Ze souboru „${file.name}“ se nepodařilo získat žádný text.`);
  return { name: file.name, text: truncate(normalized, MATERIAL_MAX_TEXT_PER_FILE) };
}

export async function extractMaterials(files: File[]) {
  if (files.length > MATERIAL_MAX_FILES) {
    throw new MaterialError(`Nahraj nejvýše ${MATERIAL_MAX_FILES} souborů.`);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MATERIAL_MAX_TOTAL_BYTES) {
    throw new MaterialError('Podklady jsou příliš velké. Kvůli limitu Vercelu mohou mít dohromady nejvýše 3,5 MB.');
  }

  const extracted: ExtractedMaterial[] = [];
  let remaining = MATERIAL_MAX_TEXT_TOTAL;
  for (const file of files) {
    const material = await extractSingle(file);
    if (remaining <= 0) break;
    const text = truncate(material.text, remaining);
    extracted.push({ ...material, text });
    remaining -= text.length;
  }
  return extracted;
}

export function materialsToPrompt(materials: ExtractedMaterial[]) {
  if (!materials.length) return '';
  return materials.map((material, index) =>
    `--- PODKLAD ${index + 1}: ${material.name} ---\n${material.text}\n--- KONEC PODKLADU ${index + 1} ---`,
  ).join('\n\n');
}
