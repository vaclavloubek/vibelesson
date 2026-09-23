'use server';

import { assertApprovedNeonCutover, getDatabaseBackend } from '@/lib/neon/config';
import { createServerAuth } from '@/lib/neon/auth';

type AuthActionResult = { error?: string };

function neonAppAuthIsAvailable() {
  if (getDatabaseBackend() !== 'neon') return false;
  assertApprovedNeonCutover();
  return Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET);
}

export async function signInWithNeonForApp(email: string, password: string): Promise<AuthActionResult> {
  if (!neonAppAuthIsAvailable()) return { error: 'Neon Auth is not active for this deployment.' };
  try {
    const { error } = await createServerAuth().signIn.email({ email, password });
    return error ? { error: error.message || 'Sign-in failed.' } : {};
  } catch {
    return { error: 'Sign-in failed.' };
  }
}

export async function signOutFromNeonApp(): Promise<AuthActionResult> {
  if (!neonAppAuthIsAvailable()) return { error: 'Neon Auth is not active for this deployment.' };
  try {
    const { error } = await createServerAuth().signOut();
    return error ? { error: error.message || 'Sign-out failed.' } : {};
  } catch {
    return { error: 'Sign-out failed.' };
  }
}
