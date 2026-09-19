import { headers } from 'next/headers';
import SchoolInviteClient from '@/components/SchoolInviteClient';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SchoolInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const safeToken =
    typeof token === 'string' && token.length >= 20 && token.length <= 200 ? token : '';

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : null;

  return (
    <SchoolInviteClient
      locale={locale}
      token={safeToken}
      initialUser={userId ? { id: userId, email } : null}
    />
  );
}
