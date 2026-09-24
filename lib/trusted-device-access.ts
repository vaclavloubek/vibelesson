import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createTrustedDeviceToken,
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_COOKIE_MAX_AGE,
} from '@/lib/device-cookie';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createNeonSql } from '@/lib/neon/server';

export type TrustedDeviceScope = 'none' | 'personal' | 'organization';

export type TrustedDeviceGate = {
  required: boolean;
  trusted: boolean;
  scope: TrustedDeviceScope;
  organizationId: string | null;
  code: string | null;
  activeCount: number;
  maxActive: number;
  newIn30Days: number;
  maxNewIn30Days: number;
  deviceId?: string | null;
};

function normalizeScope(value: unknown): TrustedDeviceScope {
  return value === 'personal' || value === 'organization' ? value : 'none';
}

export function normalizeTrustedDeviceGate(value: unknown): TrustedDeviceGate {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const scope = normalizeScope(row.scope);
  return {
    required: Boolean(row.required),
    trusted: Boolean(row.trusted),
    scope,
    organizationId: typeof row.organizationId === 'string' ? row.organizationId : null,
    code: typeof row.code === 'string' ? row.code : null,
    activeCount: typeof row.activeCount === 'number' ? row.activeCount : 0,
    maxActive: typeof row.maxActive === 'number' ? row.maxActive : scope === 'organization' ? 5 : 3,
    newIn30Days: typeof row.newIn30Days === 'number' ? row.newIn30Days : 0,
    maxNewIn30Days: typeof row.maxNewIn30Days === 'number' ? row.maxNewIn30Days : scope === 'organization' ? 10 : 5,
    deviceId: typeof row.deviceId === 'string' ? row.deviceId : null,
  };
}

export function hashTrustedDeviceToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function currentTrustedDeviceHash() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value ?? null;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return hashTrustedDeviceToken(token);
}

// The device cookie is set only on sign-in, registration or for an already
// signed-in account (LEGAL-022); anonymous visitors never receive it.
// Returns the valid token, creating one when the cookie is missing.
export async function ensureTrustedDeviceCookie() {
  const cookieStore = await cookies();
  const current = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value ?? '';
  if (/^[0-9a-f]{64}$/.test(current)) return current;

  const token = createTrustedDeviceToken();
  cookieStore.set(TRUSTED_DEVICE_COOKIE, token, {
    path: '/',
    maxAge: TRUSTED_DEVICE_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return token;
}

export async function registerTrustedDeviceHash(
  userId: string,
  tokenHash: string | null,
): Promise<TrustedDeviceGate> {
  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    const sql = createNeonSql();
    const rows = await sql`
      select public.register_trusted_device_server(
        ${userId}::uuid,
        ${tokenHash}::text
      ) as gate
    `;
    if (
      rows.length !== 1
      || !rows[0].gate
      || typeof rows[0].gate !== 'object'
      || (rows[0].gate as Record<string, unknown>).code === 'profile_not_found'
    ) {
      throw new Error('trusted_device_registration_failed');
    }
    return normalizeTrustedDeviceGate(rows[0].gate);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('register_trusted_device_server', {
    p_user_id: userId,
    p_token_hash: tokenHash,
  });
  if (error) throw new Error('trusted_device_registration_failed');
  return normalizeTrustedDeviceGate(data);
}

export async function registerCurrentTrustedDevice(userId: string): Promise<TrustedDeviceGate> {
  return registerTrustedDeviceHash(userId, await currentTrustedDeviceHash());
}

export async function requireTrustedDeviceForPaidAccess(userId: string) {
  const gate = await registerCurrentTrustedDevice(userId);
  return {
    ...gate,
    allowed: !gate.required || gate.trusted,
  };
}

// Backward-compatible export so every existing paid-operation route gets the
// organization-member policy even before call sites are renamed.
export async function requireTrustedDeviceForPaidIndividual(userId: string) {
  return requireTrustedDeviceForPaidAccess(userId);
}

export function trustedDeviceErrorMessage(gate: Pick<TrustedDeviceGate, 'code' | 'scope' | 'maxActive' | 'maxNewIn30Days'>) {
  const organization = gate.scope === 'organization';

  if (gate.code === 'trusted_device_limit_reached') {
    return organization
      ? `Tento školní uživatelský účet už má ${gate.maxActive} důvěryhodných zařízení. Odeber starší zařízení ve správě školy nebo požádej správce školy o reset aktivních zařízení.`
      : `Tento individuální účet už má ${gate.maxActive} důvěryhodných zařízení. Odeber jedno starší zařízení ve správě předplatného.`;
  }

  if (gate.code === 'trusted_device_rotation_limit_reached') {
    return organization
      ? `Za posledních 30 dní už bylo k tomuto školnímu uživatelskému účtu přidáno ${gate.maxNewIn30Days} nových zařízení. Další nové zařízení zatím nelze aktivovat.`
      : `Za posledních 30 dní už bylo k tomuto individuálnímu účtu přidáno ${gate.maxNewIn30Days} nových zařízení. Další nové zařízení zatím nelze aktivovat.`;
  }

  if (gate.code === 'trusted_device_reset_required') {
    return 'Správce školy resetoval důvěryhodná zařízení tohoto účtu. Obnov stránku; Syllonaut vytvoří nový náhodný device token a zařízení se znovu započítá do 30denního limitu.';
  }

  if (gate.code === 'trusted_device_cookie_missing') {
    return 'Zařízení se zatím nepodařilo bezpečně identifikovat. Obnov stránku a zkus akci znovu.';
  }

  return organization
    ? 'Toto zařízení není pro placené funkce školního účtu důvěryhodné.'
    : 'Toto zařízení není pro placené funkce individuálního účtu důvěryhodné.';
}
