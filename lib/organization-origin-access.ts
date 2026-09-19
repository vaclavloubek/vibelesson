import { createAdminClient } from '@/lib/supabase/admin';

export type OrganizationOriginAccess = {
  organizationId: string | null;
  organizationName: string | null;
  locked: boolean;
};

type OrganizationAccessRow = {
  id: string;
  name: string;
  status: string;
};

export async function getOrganizationOriginAccessMap(
  userId: string,
  organizationIds: string[],
): Promise<Map<string, OrganizationOriginAccess>> {
  const uniqueIds = [...new Set(organizationIds.filter(Boolean))];
  const result = new Map<string, OrganizationOriginAccess>();
  if (!uniqueIds.length) return result;

  const admin = createAdminClient();
  const [profileResult, organizationsResult, membershipsResult] = await Promise.all([
    admin.from('profiles').select('role').eq('id', userId).maybeSingle(),
    admin.from('organizations').select('id, name, status').in('id', uniqueIds),
    admin.from('organization_memberships')
      .select('organization_id, status, revoked_at')
      .eq('user_id', userId)
      .in('organization_id', uniqueIds),
  ]);

  if (profileResult.error) throw new Error('organization_origin_profile_lookup_failed');
  if (organizationsResult.error) throw new Error('organization_origin_organization_lookup_failed');
  if (membershipsResult.error) throw new Error('organization_origin_membership_lookup_failed');

  const isInternalAdmin = profileResult.data?.role === 'admin';
  const organizations = new Map(
    ((organizationsResult.data ?? []) as OrganizationAccessRow[]).map((row) => [row.id, row]),
  );
  const activeMemberships = new Set(
    (membershipsResult.data ?? [])
      .filter((row) => row.status === 'active' && !row.revoked_at)
      .map((row) => row.organization_id as string),
  );

  for (const organizationId of uniqueIds) {
    const organization = organizations.get(organizationId);
    result.set(organizationId, {
      organizationId,
      organizationName: organization?.name ?? null,
      locked: !isInternalAdmin && !(
        organization?.status === 'active'
        && activeMemberships.has(organizationId)
      ),
    });
  }

  return result;
}

export async function getLessonOrganizationOriginAccess(
  userId: string,
  lessonId: string,
): Promise<OrganizationOriginAccess | null> {
  const admin = createAdminClient();
  const { data: lesson, error } = await admin
    .from('lessons')
    .select('owner_id, organization_origin_id')
    .eq('id', lessonId)
    .maybeSingle();

  if (error) throw new Error('lesson_organization_origin_lookup_failed');
  if (!lesson || lesson.owner_id !== userId) return null;

  const organizationId = typeof lesson.organization_origin_id === 'string'
    ? lesson.organization_origin_id
    : null;
  if (!organizationId) {
    return { organizationId: null, organizationName: null, locked: false };
  }

  const accessMap = await getOrganizationOriginAccessMap(userId, [organizationId]);
  return accessMap.get(organizationId) ?? {
    organizationId,
    organizationName: null,
    locked: true,
  };
}

export function organizationOriginLockedMessage(name: string | null) {
  return name
    ? `Tato lekce pochází z knihovny organizace „${name}“. K úpravám a používání je potřeba aktivní členství v této organizaci.`
    : 'Tato lekce pochází ze školní knihovny. K úpravám a používání je potřeba aktivní členství v původní organizaci.';
}
