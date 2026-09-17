import { notFound, redirect } from 'next/navigation';
import PresenterScoreboard from '@/components/PresenterScoreboard';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Prezentační režim | Syllonaut',
};

type Props = { params: Promise<{ id: string }> };

export default async function PresenterPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  if (!userId) redirect('/');

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', id)
    .eq('teacher_id', userId)
    .maybeSingle();

  if (!session) notFound();

  return <PresenterScoreboard sessionId={id} />;
}
