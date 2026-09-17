import type { EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const SUPPORTED_TYPES = new Set<EmailOtpType>(['email', 'signup', 'recovery']);

function isSupportedType(value: FormDataEntryValue | null): value is EmailOtpType {
  return typeof value === 'string' && SUPPORTED_TYPES.has(value as EmailOtpType);
}

function destinationFor(type: EmailOtpType) {
  return type === 'recovery' ? '/auth/update-password' : '/lessons';
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const tokenHash = formData.get('token_hash');
  const type = formData.get('type');

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

  return NextResponse.redirect(new URL(destinationFor(type), request.url), 303);
}
