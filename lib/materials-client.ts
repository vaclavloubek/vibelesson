'use client';

import JSZip from 'jszip';
import {
  assertOfficeXmlEntryCount,
  assertSafeOfficeZipContainer,
  createOfficeXmlBudget,
  readOfficeXmlText,
} from './office-archive';
import {
  MATERIAL_MAX_FILES,
  MATERIAL_MAX_TEXT_PER_FILE,
  MATERIAL_MAX_TEXT_TOTAL,
  MATERIAL_MAX_TOTAL_BYTES,
  MaterialError,
  type ExtractedMaterial,
  extensionOf,
  isSupportedMaterialExtension,
  normalizeMaterialText,
  truncateMaterialText,
  xmlParagraphText,
} from './materials';

const PDF_WORKER_URL = '/pdf.worker.min.mjs';
let pdfWorkerConfigured = false;

function fileNumber(path: string) {
  const match = path.match(/(\d+)\.xml$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function extractDocx(data: ArrayBuffer) {
  assertSafeOfficeZipContainer(data);
  const zip = await JSZip.loadAsync(data);
  const document = zip.file('word/document.xml');
  if (!document) throw new MaterialError('DOCX neobsahuje čitelný dokument.');

  const budget = createOfficeXmlBudget();
  const xml = await readOfficeXmlText(document, budget);
  return xmlParagraphText(xml, 'w:p', 'w:t');
}

async function extractPptx(data: ArrayBuffer) {
  assertSafeOfficeZipContainer(data);
  const zip = await JSZip.loadAsync(data);
  const slideFiles = zip.file(/^ppt\/slides\/slide\d+\.xml$/).sort((a, b) => fileNumber(a.name) - fileNumber(b.name));
  if (!slideFiles.length) throw new MaterialError('PPTX neobsahuje čitelné snímky.');

  const noteFiles = zip.file(/^ppt\/notesSlides\/notesSlide\d+\.xml$/).sort((a, b) => fileNumber(a.name) - fileNumber(b.name));
  assertOfficeXmlEntryCount(slideFiles.length + noteFiles.length);

  const budget = createOfficeXmlBudget();
  const parts: string[] = [];
  for (const file of slideFiles) {
    const xml = await readOfficeXmlText(file, budget);
    const text = xmlParagraphText(xml, 'a:p', 'a:t');
    if (text) parts.push(`Snímek ${fileNumber(file.name)}\n${text}`);
  }

  for (const file of noteFiles) {
    const xml = await readOfficeXmlText(file, budget);
    const text = xmlParagraphText(xml, 'a:p', 'a:t');
    if (text) parts.push(`Poznámky ke snímku ${fileNumber(file.name)}\n${text}`);
  }

  return parts.join('\n\n');
}

async function extractPdf(data: ArrayBuffer) {
  const { PDFParse } = await import('pdf-parse');
  if (!pdfWorkerConfigured) {
    PDFParse.setWorker(PDF_WORKER_URL);
    pdfWorkerConfigured = true;
  }

  const parser = new PDFParse({ data: new Uint8Array(data) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractSingle(file: File): Promise<ExtractedMaterial> {
  const extension = extensionOf(file.name);
  if (!isSupportedMaterialExtension(extension)) {
    throw new MaterialError(`Soubor „${file.name}“ má nepodporovaný formát. Použij PDF, PPTX, DOCX, TXT nebo MD.`);
  }

  const data = await file.arrayBuffer();
  let text = '';
  if (extension === 'pdf') text = await extractPdf(data);
  else if (extension === 'pptx') text = await extractPptx(data);
  else if (extension === 'docx') text = await extractDocx(data);
  else text = new TextDecoder('utf-8').decode(data);

  const normalized = normalizeMaterialText(text);
  if (!normalized) {
    const hint = extension === 'pdf' ? ' Pokud jde o naskenované PDF bez textové vrstvy, OCR zatím nepodporujeme.' : '';
    throw new MaterialError(`Ze souboru „${file.name}“ se nepodařilo získat žádný text.${hint}`);
  }

  return {
    name: file.name,
    text: truncateMaterialText(normalized, MATERIAL_MAX_TEXT_PER_FILE),
  };
}

export async function extractMaterialsInBrowser(files: File[]) {
  if (files.length > MATERIAL_MAX_FILES) {
    throw new MaterialError(`Nahraj nejvýše ${MATERIAL_MAX_FILES} souborů.`);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MATERIAL_MAX_TOTAL_BYTES) {
    throw new MaterialError('Podklady mohou mít dohromady nejvýše 10 MB.');
  }

  const extracted: ExtractedMaterial[] = [];
  let remaining = MATERIAL_MAX_TEXT_TOTAL;

  for (const file of files) {
    if (remaining <= 0) break;
    const material = await extractSingle(file);
    const text = truncateMaterialText(material.text, remaining);
    extracted.push({ ...material, text });
    remaining -= text.length;
  }

  return extracted;
}
