import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';

pdfMake.addVirtualFileSystem(pdfFonts);

const buffer = await pdfMake.createPdf({
  pageSize: 'A4',
  content: [
    { text: 'Syllonaut PDF runtime check', bold: true, fontSize: 16 },
    { text: 'Příliš žluťoučký kůň úpěl ďábelské ódy. Řešení, třída, žák.' },
    {
      table: {
        widths: ['*'],
        dontBreakRows: true,
        body: [[{ text: 'Aktivita zůstává pohromadě.' }]],
      },
      layout: 'noBorders',
    },
  ],
  defaultStyle: { font: 'Roboto' },
}).getBuffer();

const bytes = Buffer.from(buffer);
if (bytes.length < 8000 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
  console.error('worksheet PDF runtime verification failed', { size: bytes.length, prefix: bytes.subarray(0, 5).toString('ascii') });
  process.exit(1);
}

console.log('worksheet PDF runtime verification passed', bytes.length);
