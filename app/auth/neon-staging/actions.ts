'use server';

import { createServerAuth } from '@/lib/neon/auth';

type AuthActionResult = {
  error?: string;
};

function previewAuthIsAvailable() {
  return process.env.VERCEL_ENV !== 'production'
    && Boolean(process.env.NEON_AUTH_BASE_URL)
    && Boolean(process.env.NEON_AUTH_COOKIE_SECRET);
}

export async function signInWithNeon(email: string, password: string): Promise<AuthActionResult> {
  if (!previewAuthIsAvailable()) {
    return { error: 'Neon Auth staging není v tomto prostředí dostupný.' };
  }

  try {
    const { error } = await createServerAuth().signIn.email({ email, password });
    if (error) return { error: error.message || 'Přihlášení se nepodařilo.' };
    return {};
  } catch {
    return { error: 'Přihlášení se nepodařilo. Zkontroluj e-mail a heslo.' };
  }
}

export async function signOutFromNeon(): Promise<AuthActionResult> {
  if (!previewAuthIsAvailable()) {
    return { error: 'Neon Auth staging není v tomto prostředí dostupný.' };
  }

  try {
    const { error } = await createServerAuth().signOut();
    if (error) return { error: error.message || 'Odhlášení se nepodařilo.' };
    return {};
  } catch {
    return { error: 'Odhlášení se nepodařilo.' };
  }
}
