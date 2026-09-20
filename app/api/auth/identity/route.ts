import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  return NextResponse.json(
    { userId: error ? null : (data.user?.id ?? null) },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
      },
    },
  );
}
