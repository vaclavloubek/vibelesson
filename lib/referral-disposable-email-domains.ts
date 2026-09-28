// Small static list of disposable email domains for the referral program only:
// a referral from such an address is recorded as rejected. Registration itself
// is not affected.
export const REFERRAL_DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com',
  '20minutemail.com',
  'discard.email',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamailblock.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mintemail.com',
  'mohmal.com',
  'moakt.com',
  'sharklasers.com',
  'spamgourmet.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmail.dev',
  'tempmailo.com',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
  'yopmail.fr',
]);

export function isDisposableEmailDomain(email: string) {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  return REFERRAL_DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
