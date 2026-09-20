export const SUPERADMIN_USER_ID = '5bbed66a-c125-4740-947c-946a364c6d3f';

export function isSuperadminUserId(userId: string | null | undefined) {
  return userId === SUPERADMIN_USER_ID;
}
