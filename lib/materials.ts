import { inflateRawSync } from 'node:zlib';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_CHARS = 60_000;
const MAX_ARCHIVE_ENTRIES = 2_000;

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'pptx', 'docx', 'txt', 'md', 'markdown']);

export type MaterialMode = 'grounded' | 'strict' | 'inspiration';

export type PdfMaterial = {
  name: string;
  data: Uint8Array;
};

type ZipEntry = {
  name: string;
  compression: number;
  flags: number;
  compressedSize: number;
  localHeaderOffset: number;
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

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Soubor není platný DOCX/PPTX archiv.');
}

function readZipEntries(buffer: Buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount > MAX_ARCHIVE_ENTRIES) throw new Error('Dokument obsahuje příliš mnoho částí.');

  const entries = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('DOCX/PPTX má neplatnou strukturu archivu.');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > buffer.length) throw new Error('DOCX/PPTX má poškozený seznam souborů.');
    const name = buffer.subarray(nameStart, nameEnd).toString('utf8');
    entries.set(name, { name, compression, flags, compressedSize, localHeaderOffset });
    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry) {
  if ((entry.flags & 0x1) !== 0) throw new Error('Šifrované DOCX/PPTX soubory nejsou podporované.');
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error('DOCX/PPTX má poškozenou lokální hlavičku.');
  }
  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) throw new Error('DOCX/PPTX obsahuje neúplná data.');
  const compressed = buffer.subarray(dataStart, dataEnd);

  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) return inflateRawSync(compressed);
  throw new Error('DOCX/PPTX používá nepodporovanou kompresi.');
}

function getZipText(buffer: Buffer, entries: Map<string, ZipEntry>, path: string) {
  const entry = entries.get(path);
  return entry ? readZipEntry(buffer, entry).toString('utf8') : '';
}

function extractDocx(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const parts = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'];
  const texts: string[] = [];

  for (const path of parts) {
    const xml = getZipText(buffer, entries, path);
    if (!xml) continue;
    const text = extractXmlText(xml, /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, /<\/w:p>/g);
    if (text) texts.push(text);
  }

  return texts.join('\n\n');
}

function slideNumber(path: string) {
  const match = path.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function extractPptx(buffer: Buffer) {
  const entries = readZipEntries(buffer);
  const slidePaths = [...entries.keys()]
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const slides: string[] = [];
  for (const path of slidePaths) {
    const xml = getZipText(buffer, entries, path);
    const text = extractXmlText(xml, /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, /<\/a:p>/g);
    if (text) slides.push(`Snímek ${slideNumber(path)}:\n${text}`);
  }

  const notePaths = [...entries.keys()]
    .filter((path) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  const notes: string[] = [];
  for (const path of notePaths) {
    const xml = getZipText(buffer, entries, path);
    const text = extractXmlText(xml, /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g, /<\/a:p>/g);
    if (text) notes.push(text);
  }

  return notes.length > 0
    ? `${slides.join('\n\n')}\n\nPoznámky prezentace:\n${notes.join('\n\n')}`
    : slides.join('\n\n');
}

export async function extractLessonMaterials(files: File[]) {
  if (files.length > MAX_FILES) throw new Error(`Lze nahrát maximálně ${MAX_FILES} souborů.`);

  const textMaterials: Array<{ name: string; text: string }> = [];
  const pdfMaterials: PdfMaterial[] = [];

  for (const file of files) {
    const extension = getExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error(`Soubor ${file.name} nemá podporovaný formát.`);
    if (file.size > MAX_FILE_BYTES) throw new Error(`Soubor ${file.name} je větší než 10 MB.`);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (extension === 'pdf') {
      pdfMaterials.push({ name: file.name, data: bytes });
      continue;
    }

    let text = '';
    if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
      text = new TextDecoder('utf-8').decode(bytes);
    } else if (extension === 'docx') {
      text = extractDocx(Buffer.from(bytes));
    } else if (extension === 'pptx') {
      text = extractPptx(Buffer.from(bytes));
    }

    text = text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
    if (!text) throw new Error(`Ze souboru ${file.name} se nepodařilo získat žádný text.`);
    textMaterials.push({ name: file.name, text });
  }

  let remaining = MAX_TOTAL_CHARS;
  const chunks: string[] = [];
  for (const material of textMaterials) {
    if (remaining <= 0) break;
    const header = `--- PODKLAD: ${material.name} ---\n`;
    const available = Math.max(0, remaining - header.length);
    const body = material.text.slice(0, available);
    chunks.push(`${header}${body}`);
    remaining -= header.length + body.length;
  }

  return {
    text: chunks.join('\n\n'),
    pdfs: pdfMaterials,
    truncated: remaining <= 0,
  };
}
