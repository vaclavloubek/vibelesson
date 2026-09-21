import { getAuthenticatedUserId } from '@/lib/auth';
import { isSuperadminUserId } from '@/lib/superadmin';
import WithdrawalAdmin from '@/components/WithdrawalAdmin';

export const dynamic = 'force-dynamic';
export default async function WithdrawalsPage() {
  const {userId} = await getAuthenticatedUserId();
  if (!isSuperadminUserId(userId)) return <main><h1>Přístup není dostupný</h1></main>;
  return <main style={{maxWidth:900,margin:'40px auto',padding:24}}>
    <h1>Spotřebitelská odstoupení</h1><WithdrawalAdmin />
  </main>;
}
