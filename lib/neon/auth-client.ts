'use client';

import { createAuthClient } from '@neondatabase/auth/next';

type AuthResult = Promise<{
  error?: { message?: string } | null;
}>;

type NeonAuthClient = {
  useSession: () => {
    data: { user: { email: string } } | null;
    isPending: boolean;
    refetch: () => Promise<unknown>;
  };
  signIn: {
    email: (input: { email: string; password: string }) => AuthResult;
  };
  signOut: () => AuthResult;
  requestPasswordReset: (input: { email: string; redirectTo: string }) => AuthResult;
  resetPassword: (input: { newPassword: string; token: string }) => AuthResult;
};

export const neonAuthClient = createAuthClient() as unknown as NeonAuthClient;
