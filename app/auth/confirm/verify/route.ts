import type { EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SUPPORTED_TYPES = new Set<EmailOtpType>(['email', 'signup', 'recovery']);
const SHARED_LESSON_PATH = /^\/s\/[0-9a-f]{48}$/;

function isSupportedType(value: FormDataEntryValue | null): value is EmailOtpType {
  return typeof value === 'string' && SUPPORTED_TYPES.has(value as EmailOtpType);
}

function destinationFor(type: EmailOtpType) {
  if (type === 'recovery') return '/auth/update-password';
  if (type === 'signup') return '/lessons?signup=completed';
  return '/lessons';
}

function safeSignupDestination(next: FormDataEntryValue | null, requestUrl: string) {
  if (typeof next !== 'string' || !next) return null;

  try {
    const requestOrigin = new URL(requestUrl).origin;
    const destination = new URL(next, requestOrigin);
    if (destination.origin !== requestOrigin || !SHARED_LESSON_PATH.test(destination.pathname)) return null;
    if (destination.hash) return null;

    const entries = Array.from(destination.searchParams.entries());
    const importRequested = entries.length === 1
      && entries[0][0] === 'import'
      && entries[0][1] === '1';
    if (destination.search && !importRequested) return null;

    return `${destination.pathname}${importRequested ? '?import=1' : ''}`;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const tokenHash = formData.get('token_hash');
  const type = formData.get('type');
  const next = formData.get('next');

  if (typeof tokenHash !== 'string' || !tokenHash || !isSupportedType(type)) {
    return NextResponse.redirect(new URL('/auth/error?reason=invalid', request.url), 303);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(new URL('/auth/error?reason=invalid', request.url), 303);
  }

  const requestedDestination = type === 'recovery' ? null : safeSignupDestination(next, request.url);
  return NextResponse.redirect(new URL(requestedDestination ?? destinationFor(type), request.url), 303);
}
