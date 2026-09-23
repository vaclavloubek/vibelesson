import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { getNeonRequestUser } from '@/lib/neon/request-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = {
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
  };

  if (getDatabaseBackend() === 'neon') {
    assertApprovedNeonCutover();
    try {
      const { user, error } = await getNeonRequestUser();
      if (error) {
        return NextResponse.json({ error: 'identity_verification_unavailable' }, { status: 503, headers });
      }
      return NextResponse.json({ userId: user?.id ?? null }, { headers });
    } catch {
      return NextResponse.json({ error: 'identity_verification_unavailable' }, { status: 503, headers });
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error && error.name !== 'AuthSessionMissingError' && error.status !== 401) {
    return NextResponse.json(
      { error: 'identity_verification_unavailable' },
      { status: 503, headers },
    );
  }

  return NextResponse.json(
    { userId: data.user?.id ?? null },
    { headers },
  );
}
