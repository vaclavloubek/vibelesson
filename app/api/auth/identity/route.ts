import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const headers = {
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
  };

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
