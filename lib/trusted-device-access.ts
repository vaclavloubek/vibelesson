import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { TRUSTED_DEVICE_COOKIE } from '@/lib/device-cookie';

export type TrustedDeviceGate = {
  required: boolean;
  trusted: boolean;
  scope: 'none' | 'individual' | 'organization';
  organizationId?: string | null;
  organizationName?: string | null;
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
    scope: row.scope === 'organization' || row.scope === 'individual' ? row.scope : 'none',
    organizationId: typeof row.organizationId === 'string' ? row.organizationId : null,
    organizationName: typeof row.organizationName === 'string' ? row.organizationName : null,
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
  const { data, error } = await admin.rpc('register_trusted_device_access', {
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

export function trustedDeviceErrorMessage(gate: TrustedDeviceGate) {
  if (gate.code === 'trusted_device_limit_reached') {
    return `Tento účet už má maximální počet důvěryhodných zařízení (${gate.maxActive}). Odeber jedno starší zařízení.`;
  }
  if (gate.code === 'trusted_device_rotation_limit_reached') {
    return `Za posledních 30 dní už bylo k tomuto účtu přidáno ${gate.maxNewIn30Days} nových zařízení. Další nové zařízení zatím nelze aktivovat.`;
  }
  if (gate.code === 'trusted_device_cookie_missing') {
    return 'Zařízení se zatím nepodařilo bezpečně identifikovat. Obnov stránku a zkus akci znovu.';
  }
  return gate.scope === 'organization'
    ? 'Toto zařízení není důvěryhodné pro funkce školní licence.'
    : 'Toto zařízení není pro placené funkce individuálního účtu důvěryhodné.';
}
