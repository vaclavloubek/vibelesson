import { NextResponse } from 'next/server';
import { clearAllLiveResumeCookies } from '@/lib/live-resume';

export async function POST() {
  await clearAllLiveResumeCookies();
  return NextResponse.json({ ok: true });
}
