declare module 'pdfmake/build/pdfmake.js' {
  type PdfGenerator = { getBuffer(): Promise<Buffer> };
  type PdfMake = {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    createPdf(definition: unknown): PdfGenerator;
  };
  const pdfMake: PdfMake;
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts.js' {
  const vfs: Record<string, string>;
  export default vfs;
}
