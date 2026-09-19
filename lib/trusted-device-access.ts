import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { TRUSTED_DEVICE_COOKIE } from '@/lib/device-cookie';

export type TrustedDeviceGate = {
  required: boolean;
  trusted: boolean;
  code: string | null;
  activeCount: number;
  maxActive: number;
  newIn30Days: number;
  maxNewIn30Days: number;
  deviceId?: string | null;
};

function normalizeGate(value: unknown): TrustedDeviceGate {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    required: Boolean(row.required),
    trusted: Boolean(row.trusted),
    code: typeof row.code === 'string' ? row.code : null,
    activeCount: typeof row.activeCount === 'number' ? row.activeCount : 0,
    maxActive: typeof row.maxActive === 'number' ? row.maxActive : 3,
    newIn30Days: typeof row.newIn30Days === 'number' ? row.newIn30Days : 0,
    maxNewIn30Days: typeof row.maxNewIn30Days === 'number' ? row.maxNewIn30Days : 5,
    deviceId: typeof row.deviceId === 'string' ? row.deviceId : null,
  };
}

export async function currentTrustedDeviceHash() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value ?? null;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function registerCurrentTrustedDevice(userId: string): Promise<TrustedDeviceGate> {
  const admin = createAdminClient();
  const tokenHash = await currentTrustedDeviceHash();
  const { data, error } = await admin.rpc('register_personal_trusted_device', {
    p_user_id: userId,
    p_token_hash: tokenHash,
  });
  if (error) throw new Error('trusted_device_registration_failed');
  return normalizeGate(data);
}

export async function requireTrustedDeviceForPaidIndividual(userId: string) {
  const gate = await registerCurrentTrustedDevice(userId);
  return {
    ...gate,
    allowed: !gate.required || gate.trusted,
  };
}

export function trustedDeviceErrorMessage(code: string | null) {
  if (code === 'trusted_device_limit_reached') {
    return 'Tento individuální účet už má 3 důvěryhodná zařízení. Odeber jedno starší zařízení ve správě předplatného.';
  }
  if (code === 'trusted_device_rotation_limit_reached') {
    return 'Za posledních 30 dní už bylo k tomuto individuálnímu účtu přidáno 5 nových zařízení. Další nové zařízení zatím nelze aktivovat.';
  }
  if (code === 'trusted_device_cookie_missing') {
    return 'Zařízení se zatím nepodařilo bezpečně identifikovat. Obnov stránku a zkus akci znovu.';
  }
  return 'Toto zařízení není pro placené funkce individuálního účtu důvěryhodné.';
}
