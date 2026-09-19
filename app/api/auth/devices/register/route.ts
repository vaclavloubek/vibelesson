import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import {
  registerCurrentTrustedDevice,
  trustedDeviceErrorMessage,
} from '@/lib/trusted-device-access';

export const dynamic = 'force-dynamic';

export async function POST() {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const gate = await registerCurrentTrustedDevice(userId);
    if (!gate.required || gate.trusted) {
      return NextResponse.json(gate);
    }

    const status = gate.code === 'trusted_device_rotation_limit_reached' ? 429 : 409;
    return NextResponse.json({
      ...gate,
      error: trustedDeviceErrorMessage(gate.code),
    }, { status });
  } catch (error) {
    console.error('trusted device registration failed', error);
    return NextResponse.json({ error: 'trusted_device_registration_failed' }, { status: 500 });
  }
}
