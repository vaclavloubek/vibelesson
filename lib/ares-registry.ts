import 'server-only';

// LEGAL-015: Czech organisations ordering by invoice are invoiced only under
// the official identity from the public ARES business register.

const ARES_SUBJECT_URL = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/';
const ARES_TIMEOUT_MS = 6000;

export type AresVerifiedOrganization = {
  source: 'ARES';
  registrationNumber: string;
  legalName: string;
  billingAddress: { line1: string; line2: string; city: string; postalCode: string };
  registryAddress: string;
  verifiedAt: string;
};

export type AresRegistryErrorCode =
  | 'registration_number_required'
  | 'registration_number_invalid'
  | 'registration_number_not_found'
  | 'registration_number_inactive'
  | 'registry_unavailable';

export class AresRegistryError extends Error {
  readonly code: AresRegistryErrorCode;

  constructor(code: AresRegistryErrorCode) {
    super(code);
    this.code = code;
  }
}

export function normalizeCzechRegistrationNumber(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\s+/g, '');
  if (!digits) throw new AresRegistryError('registration_number_required');
  if (!/^\d{1,8}$/.test(digits)) throw new AresRegistryError('registration_number_invalid');
  const ico = digits.padStart(8, '0');

  let sum = 0;
  for (let index = 0; index < 7; index += 1) sum += Number(ico[index]) * (8 - index);
  const remainder = sum % 11;
  const check = remainder === 0 ? 1 : remainder === 1 ? 0 : 11 - remainder;
  if (check !== Number(ico[7])) throw new AresRegistryError('registration_number_invalid');
  return ico;
}

type AresSubject = {
  ico?: string;
  obchodniJmeno?: string;
  datumZaniku?: string | null;
  sidlo?: {
    nazevUlice?: string;
    nazevCastiObce?: string;
    nazevObce?: string;
    cisloDomovni?: number;
    typCisloDomovni?: number;
    cisloOrientacni?: number;
    cisloOrientacniPismeno?: string;
    psc?: number;
    textovaAdresa?: string;
  };
};

function formatPostalCode(psc: number) {
  const value = String(psc).padStart(5, '0');
  return value.slice(0, 3) + ' ' + value.slice(3);
}

export async function verifyCzechOrganization(registrationNumber: string | null | undefined): Promise<AresVerifiedOrganization> {
  const ico = normalizeCzechRegistrationNumber(registrationNumber);

  let response: Response;
  try {
    response = await fetch(ARES_SUBJECT_URL + ico, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(ARES_TIMEOUT_MS),
    });
  } catch {
    throw new AresRegistryError('registry_unavailable');
  }

  if (response.status === 404) throw new AresRegistryError('registration_number_not_found');
  if (!response.ok) throw new AresRegistryError('registry_unavailable');

  const subject = await response.json().catch(() => null) as AresSubject | null;
  const seat = subject?.sidlo;
  if (!subject || subject.ico !== ico || !subject.obchodniJmeno?.trim() || !seat?.nazevObce || !seat.psc) {
    throw new AresRegistryError('registry_unavailable');
  }
  if (subject.datumZaniku) throw new AresRegistryError('registration_number_inactive');

  const houseNumber = seat.cisloDomovni
    ? (seat.typCisloDomovni === 2 ? 'č. ev. ' : '') + String(seat.cisloDomovni)
      + (seat.cisloOrientacni ? '/' + seat.cisloOrientacni + (seat.cisloOrientacniPismeno ?? '') : '')
    : '';
  const street = seat.nazevUlice ?? seat.nazevCastiObce ?? seat.nazevObce;
  const line1 = [street, houseNumber].filter(Boolean).join(' ');
  const line2 = seat.nazevUlice && seat.nazevCastiObce && seat.nazevCastiObce !== seat.nazevObce
    ? seat.nazevCastiObce
    : '';

  return {
    source: 'ARES',
    registrationNumber: ico,
    legalName: subject.obchodniJmeno.trim(),
    billingAddress: {
      line1,
      line2,
      city: seat.nazevObce,
      postalCode: formatPostalCode(seat.psc),
    },
    registryAddress: seat.textovaAdresa ?? '',
    verifiedAt: new Date().toISOString(),
  };
}
