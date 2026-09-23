import { getAuthenticatedUserId } from '@/lib/auth';
import ComplaintAdmin from '@/components/ComplaintAdmin';
import { complaintsAvailable, listComplaintsForAdmin } from '@/lib/complaints';
import { isSuperadminUserId } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export default async function ComplaintsAdminPage() {
  const { authenticatedUserId: userId } = await getAuthenticatedUserId();
  if (!isSuperadminUserId(userId)) return <main><h1>Přístup není dostupný</h1></main>;
  const available = await complaintsAvailable();
  return (
    <main style={{ maxWidth: 960, margin: '40px auto', padding: 24 }}>
      <h1>Reklamace</h1>
      {available
        ? <ComplaintAdmin complaints={await listComplaintsForAdmin()} />
        : <p>Evidence reklamací zatím není v databázi (chybí migrace <code>0011_customer_complaints_legal_017.sql</code>).</p>}
    </main>
  );
}
