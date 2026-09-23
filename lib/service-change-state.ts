import { z } from 'zod';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';

const Notice=z.object({
  deliveryId:z.string().uuid(),changeKey:z.string(),classification:z.string(),strategy:z.string(),
  reasonCs:z.string(),reasonEn:z.string(),impactCs:z.string(),impactEn:z.string(),
  effectiveAt:z.string(),sentAt:z.string(),legacyPreservedUntil:z.string().nullable(),
  terminationDeadline:z.string().nullable(),terminationRequested:z.boolean(),terminationStatus:z.string().nullable(),
});
export type ServiceChangeNotice=z.infer<typeof Notice>;

export async function getServiceChangeNotices(userId:string):Promise<ServiceChangeNotice[]> {
  const {data,error}=await createPrivilegedRpcClient().rpc('get_service_change_notices_for_user_service',{p_user_id:userId});
  if(error) throw new Error('service_change_notice_lookup_failed');
  return z.array(Notice).parse(data??[]);
}
