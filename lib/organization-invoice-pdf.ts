import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';
import { ORGANIZATION_PLANS } from '@/lib/organization-billing-catalog';
import type { OrganizationBankInvoiceData } from '@/lib/organization-bank-invoice';

pdfMake.addVirtualFileSystem(pdfFonts);

const ACCENT = '#5B57E8';
const INK = '#20222A';
const MUTED = '#6B6D77';
const LINE = '#D7D8DE';
const SOFT = '#F4F3FF';

type PdfNode = Record<string, unknown>;

function money(amountMinor: number, currency: string, locale: 'cs' | 'en') {
  return new Intl.NumberFormat(locale === 'cs' ? 'cs-CZ' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountMinor / 100);
}

function date(value: string, locale: 'cs' | 'en') {
  return new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
    dateStyle: 'medium',
    timeZone: 'Europe/Prague',
  }).format(new Date(value + (value.length === 10 ? 'T12:00:00Z' : '')));
}

function customerLines(invoice: OrganizationBankInvoiceData) {
  const customer = invoice.snapshot.customer;
  const address = (customer.billingAddress ?? {}) as Record<string, unknown>;
  const values = [
    customer.legalName || customer.name || invoice.organizationName,
    address.line1,
    address.line2,
    [address.postalCode, address.city].filter(Boolean).join(' '),
    customer.billingCountry,
    customer.registrationNumber ? 'IČO: ' + customer.registrationNumber : null,
    customer.vatId ? 'DIČ / VAT ID: ' + customer.vatId : null,
    customer.billingEmail,
  ];
  return values.filter(Boolean).map(String);
}

function sellerLines(
  invoice: OrganizationBankInvoiceData,
  locale: 'cs' | 'en',
) {
  const seller = invoice.snapshot.seller;
  const vatPayer = seller.vatPayer ?? Boolean(seller.vatId);

  return [
    seller.name,
    seller.addressLine1,
    seller.addressLine2,
    seller.postalCode + ' ' + seller.city,
    seller.country,
    'IČO: ' + seller.registrationNumber,
    seller.vatId ? 'DIČ / VAT ID: ' + seller.vatId : null,
    !vatPayer
      ? (locale === 'en'
        ? 'Supplier is not registered for VAT.'
        : 'Dodavatel není plátcem DPH.')
      : null,
  ].filter(Boolean).map(String);
}

export function createOrganizationInvoicePdfDefinition(
  invoice: OrganizationBankInvoiceData,
  locale: 'cs' | 'en' = 'cs',
) {
  const english = locale === 'en';
  const plan = ORGANIZATION_PLANS[
    invoice.planCode as keyof typeof ORGANIZATION_PLANS
  ];
  const period = invoice.billingPeriod === 'annual'
    ? (english ? '12 months' : '12 měsíců')
    : (english ? '1 month' : '1 měsíc');
  const status = invoice.status === 'paid'
    ? (english ? 'PAID' : 'ZAPLACENO')
    : (english ? 'UNPAID' : 'NEZAPLACENO');

  const details: PdfNode[] = [];

  if (!invoice.snapshot.livemode) {
    details.push({
      text: english
        ? 'TEST DOCUMENT — DO NOT PAY'
        : 'TESTOVACÍ DOKLAD — NEPLAŤTE',
      bold: true,
      alignment: 'center',
      color: '#9A2A2A',
      fillColor: '#FFF0F0',
      margin: [0, 0, 0, 16],
    });
  }

  details.push(
    {
      columns: [
        { width: '*', text: 'Syllonaut', bold: true, fontSize: 13, color: INK },
        {
          width: 'auto',
          text: english ? 'INVOICE' : 'FAKTURA',
          bold: true,
          fontSize: 8,
          color: ACCENT,
          characterSpacing: 0.8,
        },
      ],
    },
    {
      columns: [
        {
          width: '*',
          stack: [
            {
              text: invoice.invoiceNumber,
              fontSize: 25,
              bold: true,
              color: INK,
              margin: [0, 22, 0, 4],
            },
            {
              text: status,
              fontSize: 10,
              bold: true,
              color: invoice.status === 'paid' ? '#195D37' : '#9A2A2A',
            },
          ],
        },
        {
          width: 190,
          stack: [
            { text: english ? 'Issued' : 'Vystaveno', fontSize: 8, bold: true, color: MUTED },
            { text: date(invoice.issuedAt, locale), margin: [0, 3, 0, 8], fontSize: 9 },
            { text: english ? 'Due date' : 'Splatnost', fontSize: 8, bold: true, color: MUTED },
            { text: date(invoice.dueDate, locale), margin: [0, 3, 0, 0], fontSize: 9 },
          ],
        },
      ],
      columnGap: 24,
    },
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: english ? 'Supplier' : 'Dodavatel', fontSize: 8, bold: true, color: MUTED },
            ...sellerLines(invoice, locale).map((line, index) => ({
              text: line,
              fontSize: index === 0 ? 10 : 9,
              bold: index === 0,
              margin: [0, index === 0 ? 4 : 1, 0, 0],
            })),
          ],
        },
        {
          width: '*',
          stack: [
            { text: english ? 'Customer' : 'Odběratel', fontSize: 8, bold: true, color: MUTED },
            ...customerLines(invoice).map((line, index) => ({
              text: line,
              fontSize: index === 0 ? 10 : 9,
              bold: index === 0,
              margin: [0, index === 0 ? 4 : 1, 0, 0],
            })),
          ],
        },
      ],
      columnGap: 28,
      margin: [0, 22, 0, 0],
    },
    {
      margin: [0, 24, 0, 0],
      table: {
        widths: ['*', 92, 110],
        body: [
          [
            { text: english ? 'Licence' : 'Licence', bold: true, fillColor: SOFT },
            { text: english ? 'Period' : 'Období', bold: true, fillColor: SOFT },
            { text: english ? 'Amount' : 'Částka', bold: true, fillColor: SOFT, alignment: 'right' },
          ],
          [
            {
              text: 'Syllonaut '
                + (plan?.name ?? invoice.planCode.toUpperCase())
                + (plan ? ' · ' + plan.seatLimit + ' ' + (english ? 'teachers' : 'učitelů') : ''),
            },
            { text: period },
            {
              text: money(invoice.amountMinor, invoice.currency, locale),
              bold: true,
              alignment: 'right',
            },
          ],
        ],
      },
      layout: {
        hLineColor: () => LINE,
        vLineColor: () => LINE,
        hLineWidth: () => 0.7,
        vLineWidth: () => 0.7,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 7,
        paddingBottom: () => 7,
      },
      fontSize: 9,
    },
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: english ? 'Bank transfer' : 'Bankovní převod', fontSize: 11, bold: true },
            { text: (english ? 'Account: ' : 'Účet: ') + invoice.snapshot.bank.account, margin: [0, 7, 0, 0] },
            { text: 'IBAN: ' + invoice.snapshot.bank.iban, margin: [0, 3, 0, 0] },
            ...(invoice.snapshot.bank.bic
              ? [{ text: 'BIC/SWIFT: ' + invoice.snapshot.bank.bic, margin: [0, 3, 0, 0] }]
              : []),
            {
              text: (english ? 'Variable symbol: ' : 'Variabilní symbol: ') + invoice.variableSymbol,
              bold: true,
              margin: [0, 7, 0, 0],
            },
            {
              text: (english ? 'Amount: ' : 'Částka: ')
                + money(invoice.amountMinor, invoice.currency, locale),
              bold: true,
              margin: [0, 3, 0, 0],
            },
          ],
          fontSize: 9,
        },
        {
          width: 120,
          stack: [
            {
              qr: invoice.spayd,
              fit: 96,
              eccLevel: 'M',
              alignment: 'right',
            },
            {
              text: english ? 'QR payment' : 'QR platba',
              alignment: 'center',
              fontSize: 8,
              bold: true,
              margin: [0, 4, 0, 0],
            },
          ],
        },
      ],
      columnGap: 24,
      margin: [0, 24, 0, 0],
    },
  );

  return {
    pageSize: 'A4',
    pageMargins: [46, 44, 46, 42],
    info: {
      title: (english ? 'Syllonaut invoice ' : 'Faktura Syllonaut ') + invoice.invoiceNumber,
      author: 'Syllonaut',
      subject: english ? 'School licence invoice' : 'Faktura školní licence',
      creator: 'Syllonaut',
    },
    content: [
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 503, y2: 0, lineWidth: 3, lineColor: ACCENT }],
        margin: [0, 0, 0, 12],
      },
      ...details,
    ],
    footer: (currentPage: number, pageCount: number) => ({
      margin: [46, 10, 46, 0],
      columns: [
        { text: 'syllonaut.com', fontSize: 7, color: MUTED },
        { text: currentPage + ' / ' + pageCount, alignment: 'right', fontSize: 7, color: MUTED },
      ],
    }),
    defaultStyle: {
      font: 'Roboto',
      fontSize: 9.5,
      color: INK,
      lineHeight: 1.25,
    },
  };
}

export async function createOrganizationInvoicePdfBuffer(
  invoice: OrganizationBankInvoiceData,
  locale: 'cs' | 'en' = 'cs',
) {
  const definition = createOrganizationInvoicePdfDefinition(invoice, locale);
  const buffer = await pdfMake.createPdf(definition).getBuffer();
  return Buffer.from(buffer);
}
