import { currentTrustedDeviceHash } from '@/lib/trusted-device-access';

export type FreeDeviceBudgetAction = 'lesson' | 'revision' | 'import';

export async function currentFreeDeviceBudgetHash() {
  return currentTrustedDeviceHash();
}

export function freeDeviceBudgetMessage(
  code: string | null | undefined,
  action: FreeDeviceBudgetAction,
  limit?: number | null,
) {
  if (code === 'free_device_cookie_required') {
    return 'Zařízení se zatím nepodařilo bezpečně rozpoznat. Obnov stránku a zkus akci znovu.';
  }

  if (code !== 'free_device_budget_exhausted') return null;

  if (action === 'lesson') {
    return `Na tomto zařízení už byla v posledních 30 dnech využita maximální bezplatná kapacita ${limit ?? 10} AI lekcí napříč Free účty. Limit se průběžně obnovuje.`;
  }
  if (action === 'revision') {
    return `Na tomto zařízení už byla v posledních 30 dnech využita maximální bezplatná kapacita ${limit ?? 40} AI úprav napříč Free účty. Limit se průběžně obnovuje.`;
  }
  return `Na tomto zařízení už byla v posledních 30 dnech využita maximální bezplatná kapacita ${limit ?? 6} importů nebo kopií napříč Free účty. Limit se průběžně obnovuje.`;
}
