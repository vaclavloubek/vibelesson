import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  currentTrustedDeviceHash,
  registerCurrentTrustedDevice,
} from '@/lib/trusted-device-access';

export const dynamic = 'force-dynamic';

const DeleteSchema = z.object({
  deviceId: z.string().uuid(),
});

async function loadDevices(userId: string) {
  const registration = await registerCurrentTrustedDevice(userId);
  const currentHash = await currentTrustedDeviceHash();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('list_trusted_device_access', {
    p_user_id: userId,
    p_current_token_hash: currentHash,
  });
  if (error) throw error;
  return { registration, summary: data };
}

export async function GET() {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    return NextResponse.json(await loadDevices(userId));
  } catch (error) {
    console.error('load trusted devices failed', error);
    return NextResponse.json({ error: 'trusted_devices_load_failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const { deviceId } = DeleteSchema.parse(await request.json());
    const currentHash = await currentTrustedDeviceHash();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('revoke_trusted_device_access', {
      p_user_id: userId,
      p_device_id: deviceId,
      p_current_token_hash: currentHash,
    });
    if (error) throw error;

    const result = data as { revoked?: boolean; code?: string | null } | null;
    if (!result?.revoked) {
      const status = result?.code === 'cannot_revoke_current_device' ? 409 : 404;
      return NextResponse.json({ error: result?.code ?? 'trusted_device_not_found' }, { status });
    }

    return NextResponse.json(await loadDevices(userId));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'invalid_device_id' }, { status: 400 });
    }
    console.error('revoke trusted device failed', error);
    return NextResponse.json({ error: 'trusted_device_revoke_failed' }, { status: 500 });
  }
}
