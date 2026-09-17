import { MaterialError } from './materials';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const CENTRAL_DIRECTORY_DIGITAL_SIGNATURE = 0x05054b50;
const ZIP64_UINT16_SENTINEL = 0xffff;
const ZIP64_UINT32_SENTINEL = 0xffffffff;
const EOCD_MIN_BYTES = 22;
const MAX_ZIP_COMMENT_BYTES = 0xffff;

export const OFFICE_MAX_ZIP_ENTRIES = 2_000;
export const OFFICE_MAX_XML_ENTRIES = 500;
export const OFFICE_MAX_XML_ENTRY_BYTES = 5_000_000;
export const OFFICE_MAX_XML_TOTAL_BYTES = 20_000_000;

type ZipStream = {
  on(event: 'data', callback: (chunk: Uint8Array) => void): ZipStream;
  on(event: 'end', callback: () => void): ZipStream;
  on(event: 'error', callback: (error: Error) => void): ZipStream;
  pause(): ZipStream;
  resume(): ZipStream;
};

export type OfficeZipEntry = {
  internalStream(type: 'uint8array'): ZipStream;
};

export type OfficeXmlBudget = {
  remainingEntries: number;
  remainingBytes: number;
};

function archiveTooLargeError() {
  return new MaterialError('DOCX/PPTX je po rozbalení příliš velký nebo obsahuje neobvykle mnoho částí. Zkus menší podklad.');
}

function invalidArchiveError() {
  return new MaterialError('DOCX/PPTX nemá podporovanou strukturu ZIP archivu.');
}

function findEndOfCentralDirectory(view: DataView) {
  const minimumOffset = Math.max(0, view.byteLength - EOCD_MIN_BYTES - MAX_ZIP_COMMENT_BYTES);

  for (let offset = view.byteLength - EOCD_MIN_BYTES; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + EOCD_MIN_BYTES + commentLength === view.byteLength) return offset;
  }

  return -1;
}

export function assertSafeOfficeZipContainer(data: ArrayBuffer) {
  if (data.byteLength < EOCD_MIN_BYTES) throw invalidArchiveError();

  const view = new DataView(data);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) throw invalidArchiveError();

  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(eocdOffset + 6, true);
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const declaredEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);

  if (
    diskNumber !== 0
    || centralDirectoryDisk !== 0
    || entriesOnDisk === ZIP64_UINT16_SENTINEL
    || declaredEntries === ZIP64_UINT16_SENTINEL
    || centralDirectorySize === ZIP64_UINT32_SENTINEL
    || centralDirectoryOffset === ZIP64_UINT32_SENTINEL
  ) {
    throw invalidArchiveError();
  }

  if (entriesOnDisk !== declaredEntries || declaredEntries > OFFICE_MAX_ZIP_ENTRIES) {
    throw archiveTooLargeError();
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryOffset > eocdOffset || centralDirectoryEnd > eocdOffset) throw invalidArchiveError();

  let cursor = centralDirectoryOffset;
  let actualEntries = 0;

  while (cursor < centralDirectoryEnd) {
    if (cursor + 4 > centralDirectoryEnd) throw invalidArchiveError();
    const signature = view.getUint32(cursor, true);

    if (signature === CENTRAL_DIRECTORY_DIGITAL_SIGNATURE) {
      if (cursor + 6 > centralDirectoryEnd) throw invalidArchiveError();
      const signatureDataLength = view.getUint16(cursor + 4, true);
      cursor += 6 + signatureDataLength;
      if (cursor > centralDirectoryEnd) throw invalidArchiveError();
      continue;
    }

    if (signature !== CENTRAL_FILE_HEADER_SIGNATURE || cursor + 46 > centralDirectoryEnd) {
      throw invalidArchiveError();
    }

    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraFieldLength = view.getUint16(cursor + 30, true);
    const fileCommentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);

    if (
      compressedSize === ZIP64_UINT32_SENTINEL
      || uncompressedSize === ZIP64_UINT32_SENTINEL
      || diskStart === ZIP64_UINT16_SENTINEL
    ) {
      throw invalidArchiveError();
    }

    cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
    if (cursor > centralDirectoryEnd) throw invalidArchiveError();

    actualEntries += 1;
    if (actualEntries > OFFICE_MAX_ZIP_ENTRIES) throw archiveTooLargeError();
  }

  if (cursor !== centralDirectoryEnd || actualEntries !== declaredEntries) throw invalidArchiveError();
}

export function createOfficeXmlBudget(): OfficeXmlBudget {
  return {
    remainingEntries: OFFICE_MAX_XML_ENTRIES,
    remainingBytes: OFFICE_MAX_XML_TOTAL_BYTES,
  };
}

export function assertOfficeXmlEntryCount(count: number) {
  if (!Number.isSafeInteger(count) || count < 0 || count > OFFICE_MAX_XML_ENTRIES) {
    throw archiveTooLargeError();
  }
}

export async function readOfficeXmlText(entry: OfficeZipEntry, budget: OfficeXmlBudget) {
  if (budget.remainingEntries <= 0 || budget.remainingBytes <= 0) throw archiveTooLargeError();
  budget.remainingEntries -= 1;

  const byteLimit = Math.min(OFFICE_MAX_XML_ENTRY_BYTES, budget.remainingBytes);
  const decoder = new TextDecoder('utf-8');
  const stream = entry.internalStream('uint8array');

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let bytesRead = 0;
    let text = '';

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      stream.pause();
      reject(error);
    };

    stream
      .on('data', (chunk) => {
        if (settled) return;
        if (!(chunk instanceof Uint8Array)) {
          fail(invalidArchiveError());
          return;
        }

        if (bytesRead + chunk.byteLength > byteLimit) {
          fail(archiveTooLargeError());
          return;
        }

        bytesRead += chunk.byteLength;
        text += decoder.decode(chunk, { stream: true });
      })
      .on('error', (error) => fail(error))
      .on('end', () => {
        if (settled) return;
        settled = true;
        budget.remainingBytes -= bytesRead;
        text += decoder.decode();
        resolve(text);
      })
      .resume();
  });
}
