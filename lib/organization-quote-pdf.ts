import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';
import type { OrganizationBillingPeriod, OrganizationPlanCode } from '@/lib/organization-billing-catalog';
import { ORGANIZATION_PLANS } from '@/lib/organization-billing-catalog';

pdfMake.addVirtualFileSystem(pdfFonts);

const ACCENT = '#5B57E8';
const INK = '#20222A';
const MUTED = '#6B6D77';
const LINE = '#D7D8DE';
const SOFT = '#F4F3FF';

type Currency = 'czk' | 'eur' | 'usd';
type PdfNode = Record<string, unknown>;

function money(amountMinor: number, currency: Currency, locale: 'cs' | 'en') {
  return new Intl.NumberFormat(locale === 'cs' ? 'cs-CZ' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountMinor / 100);
}

function formatDate(value: Date, locale: 'cs' | 'en') {
  return new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'Europe/Prague',
  }).format(value);
}

export function createOrganizationQuotePdfDefinition(input: {
  locale: 'cs' | 'en';
  organizationName: string;
  legalName?: string | null;
  registrationNumber?: string | null;
  vatId?: string | null;
  billingCountry: string;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    postalCode?: string;
  };
  planCode: OrganizationPlanCode;
  billingPeriod: OrganizationBillingPeriod;
  currency: Currency;
  amountMinor: number;
  createdAt: Date;
}) {
  const english = input.locale === 'en';
  const plan = ORGANIZATION_PLANS[input.planCode];
  const validUntil = new Date(input.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const periodLabel = input.billingPeriod === 'annual'
    ? (english ? '12 months' : '12 měsíců')
    : (english ? '1 month' : '1 měsíc');
  const addressParts = [
    input.address.line1,
    input.address.line2,
    [input.address.postalCode, input.address.city].filter(Boolean).join(' '),
    input.billingCountry,
  ].filter((value): value is string => Boolean(value?.trim()));

  const included: string[] = [
    english ? 'Separate account for every teacher' : 'Samostatný účet pro každého učitele',
    english
      ? plan.monthlyLessonLimit + ' new AI lessons / month shared'
      : plan.monthlyLessonLimit + ' nových AI lekcí / měsíc společně',
    english
      ? plan.monthlyRevisionLimit + ' AI edits / month shared'
      : plan.monthlyRevisionLimit + ' AI úprav / měsíc společně',
    english ? 'Lessons in any language' : 'Lekce v libovolném jazyce',
    english ? 'Live lessons without a plan-based limit' : 'Živé hodiny bez tarifního limitu',
  ];

  if (input.planCode !== 'team') {
    included.push(
      english ? 'Printable worksheets and PDF export' : 'Pracovní listy a export do PDF',
      english ? 'AI grading' : 'AI hodnocení',
      english ? 'Folders and subfolders' : 'Složky a podsložky',
      english ? 'School lesson library' : 'Školní knihovna lekcí',
    );
  }

  const details: PdfNode[] = [
    {
      columns: [
        { width: '*', text: 'Syllonaut', bold: true, fontSize: 13, color: INK },
        {
          width: 'auto',
          text: english ? 'PRICE QUOTE' : 'CENOVÁ NABÍDKA',
          bold: true,
          fontSize: 8,
          color: ACCENT,
          characterSpacing: 0.8,
        },
      ],
    },
    {
      text: english ? 'Syllonaut for schools' : 'Syllonaut pro školy',
      fontSize: 27,
      bold: true,
      color: INK,
      margin: [0, 24, 0, 4],
    },
    {
      text: plan.name,
      fontSize: 15,
      bold: true,
      color: ACCENT,
      margin: [0, 0, 0, 18],
    },
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: english ? 'Customer' : 'Odběratel', fontSize: 8, bold: true, color: MUTED },
            { text: input.legalName?.trim() || input.organizationName, fontSize: 11, bold: true, margin: [0, 4, 0, 0] },
            ...(input.legalName?.trim() && input.organizationName !== input.legalName
              ? [{ text: input.organizationName, fontSize: 9, color: MUTED, margin: [0, 2, 0, 0] }]
              : []),
            ...(addressParts.length ? [{ text: addressParts.join('\n'), fontSize: 9, color: MUTED, margin: [0, 5, 0, 0] }] : []),
            ...(input.registrationNumber ? [{ text: (english ? 'Registration ID: ' : 'IČO: ') + input.registrationNumber, fontSize: 9, margin: [0, 5, 0, 0] }] : []),
            ...(input.vatId ? [{ text: 'VAT ID / DIČ: ' + input.vatId, fontSize: 9, margin: [0, 2, 0, 0] }] : []),
          ],
        },
        {
          width: 180,
          stack: [
            { text: english ? 'Issued' : 'Vystaveno', fontSize: 8, bold: true, color: MUTED },
            { text: formatDate(input.createdAt, input.locale), fontSize: 9, margin: [0, 4, 0, 8] },
            { text: english ? 'Valid until' : 'Platnost nabídky', fontSize: 8, bold: true, color: MUTED },
            { text: formatDate(validUntil, input.locale), fontSize: 9, margin: [0, 4, 0, 0] },
          ],
        },
      ],
      columnGap: 28,
    },
    {
      margin: [0, 24, 0, 0],
      table: {
        widths: ['*', 92, 110],
        body: [
          [
            { text: english ? 'Licence' : 'Licence', bold: true, fillColor: SOFT },
            { text: english ? 'Period' : 'Období', bold: true, fillColor: SOFT },
            { text: english ? 'Price' : 'Cena', bold: true, fillColor: SOFT, alignment: 'right' },
          ],
          [
            { text: 'Syllonaut ' + plan.name + ' · ' + plan.seatLimit + ' ' + (english ? 'teachers' : 'učitelů') },
            { text: periodLabel },
            { text: money(input.amountMinor, input.currency, input.locale), bold: true, alignment: 'right' },
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
      text: english ? 'Included in the plan' : 'Součást tarifu',
      fontSize: 11,
      bold: true,
      margin: [0, 22, 0, 6],
    },
    {
      ul: included,
      fontSize: 9,
      lineHeight: 1.25,
      margin: [14, 0, 0, 0],
    },
    {
      margin: [0, 22, 0, 0],
      table: {
        widths: ['*'],
        body: [[{
          text: english
            ? 'This document is a non-binding price quote, not a tax invoice. The final tax treatment and invoice details are determined during billing from the customer billing data.'
            : 'Tento dokument je nezávazný cenový podklad, nikoli daňový doklad. Konečný daňový režim a náležitosti faktury se určí při fakturaci podle fakturačních údajů odběratele.',
          color: MUTED,
          fillColor: '#FAFAFB',
          fontSize: 8.5,
          margin: [8, 7, 8, 7],
        }]],
      },
      layout: 'noBorders',
    },
  ];

  return {
    pageSize: 'A4',
    pageMargins: [46, 44, 46, 42],
    info: {
      title: (english ? 'Syllonaut price quote - ' : 'Cenová nabídka Syllonaut - ') + plan.name,
      author: 'Syllonaut',
      subject: english ? 'School licence price quote' : 'Cenová nabídka školní licence',
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

export async function createOrganizationQuotePdfBuffer(
  args: Parameters<typeof createOrganizationQuotePdfDefinition>[0],
) {
  const definition = createOrganizationQuotePdfDefinition(args);
  const buffer = await pdfMake.createPdf(definition).getBuffer();
  return Buffer.from(buffer);
}
