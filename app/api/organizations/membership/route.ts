import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { getCurrentOrganizationForUser } from '@/lib/organizations';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json(
      { hasOrganization: false },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const organization = await getCurrentOrganizationForUser(userId);
    return NextResponse.json(
      { hasOrganization: Boolean(organization) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('organization membership lookup failed', error);
    return NextResponse.json(
      { hasOrganization: false },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
