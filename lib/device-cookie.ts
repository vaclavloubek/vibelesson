export const TRUSTED_DEVICE_COOKIE = 'syllonaut_device_v1';
export const TRUSTED_DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function createTrustedDeviceToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
