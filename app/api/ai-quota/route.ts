import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';

// Server-side AI quota for the header menu in the Neon backend, where the
// browser has no direct Data API session. get_ai_quota() is scoped to auth.uid().
export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json(null, { status: 401 });

  const { data, error } = await supabase.rpc('get_ai_quota');
  if (error) {
    console.error('load header AI quota failed', { code: error.code });
    return NextResponse.json(null, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json(row ?? null, { headers: { 'Cache-Control': 'no-store' } });
}
