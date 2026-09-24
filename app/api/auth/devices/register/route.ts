import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  createTrustedDeviceToken,
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_COOKIE_MAX_AGE,
} from '@/lib/device-cookie';
import {
  ensureTrustedDeviceCookie,
  hashTrustedDeviceToken,
  registerTrustedDeviceHash,
  trustedDeviceErrorMessage,
} from '@/lib/trusted-device-access';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    // Signed-in accounts without a device cookie (e.g. signed in before
    // LEGAL-022 or with cleared cookies) get one here instead of in proxy.ts.
    const deviceToken = await ensureTrustedDeviceCookie();
    const gate = await registerTrustedDeviceHash(userId, hashTrustedDeviceToken(deviceToken));

    if (gate.code === 'trusted_device_reset_required' && gate.scope === 'organization') {
      const response = NextResponse.json({
        ...gate,
        trusted: false,
        code: 'trusted_device_token_rotated',
        error: 'Správce školy resetoval důvěryhodná zařízení. Syllonaut vytvořil nový device token; další placená akce toto zařízení znovu zaregistruje v rámci školních limitů.',
      }, { status: 409 });

      response.cookies.set(TRUSTED_DEVICE_COOKIE, createTrustedDeviceToken(), {
        path: '/',
        maxAge: TRUSTED_DEVICE_COOKIE_MAX_AGE,
        httpOnly: true,
        sameSite: 'lax',
        secure: new URL(request.url).protocol === 'https:',
      });
      return response;
    }

    if (!gate.required || gate.trusted) {
      return NextResponse.json(gate);
    }

    const status = gate.code === 'trusted_device_rotation_limit_reached' ? 429 : 409;
    return NextResponse.json({
      ...gate,
      error: trustedDeviceErrorMessage(gate),
    }, { status });
  } catch (error) {
    console.error('trusted device registration failed', error);
    return NextResponse.json({ error: 'trusted_device_registration_failed' }, { status: 500 });
  }
}
