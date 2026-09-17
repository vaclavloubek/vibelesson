export const MATERIAL_MAX_FILES = 5;
export const MATERIAL_MAX_TOTAL_BYTES = 10_000_000;
export const MATERIAL_MAX_TEXT_PER_FILE = 40_000;
export const MATERIAL_MAX_TEXT_TOTAL = 100_000;

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'pptx', 'docx', 'txt', 'md']);

export type MaterialMode = 'primary' | 'strict' | 'inspiration';

export type ExtractedMaterial = {
  name: string;
  text: string;
};

export class MaterialError extends Error {}

export function extensionOf(name: string) {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

export function isSupportedMaterialExtension(extension: string) {
  return SUPPORTED_EXTENSIONS.has(extension);
}

export function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

export function normalizeMaterialText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function truncateMaterialText(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n\n[Obsah podkladu byl kvůli délce zkrácen.]`;
}

export function xmlParagraphText(xml: string, paragraphTag: string, textTag: string) {
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

function safeMaterialName(name: string) {
  return name.replace(/[\r\n]+/g, ' ').trim().slice(0, 255) || 'podklad';
}

export function materialsToPrompt(materials: ExtractedMaterial[]) {
  if (!materials.length) return '';
  return materials.map((material, index) =>
    `--- PODKLAD ${index + 1}: ${safeMaterialName(material.name)} ---\n${material.text}\n--- KONEC PODKLADU ${index + 1} ---`,
  ).join('\n\n');
}
