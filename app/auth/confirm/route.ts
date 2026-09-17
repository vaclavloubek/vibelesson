import type { EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SUPPORTED_TYPES = new Set<EmailOtpType>(['email', 'signup', 'recovery']);

function isSupportedType(value: string | null): value is EmailOtpType {
  return value !== null && SUPPORTED_TYPES.has(value as EmailOtpType);
}

function resolveNext(type: EmailOtpType, requestedNext: string | null) {
  if (type === 'recovery') {
    return requestedNext === '/auth/update-password' ? requestedNext : '/auth/update-password';
  }
  return requestedNext === '/lessons' ? requestedNext : '/lessons';
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');

  if (!tokenHash || !isSupportedType(type)) {
    return NextResponse.redirect(new URL('/auth/error?reason=invalid', request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(new URL('/auth/error?reason=invalid', request.url));
  }

  const next = resolveNext(type, request.nextUrl.searchParams.get('next'));
  return NextResponse.redirect(new URL(next, request.url));
}
