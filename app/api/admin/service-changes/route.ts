import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { TERMS_ACCEPTANCE_KEY, TERMS_VERSION } from '@/lib/legal';
import { SERVICE_CHANGE_POLICY_VERSION } from '@/lib/service-change-policy';
import { isSuperadminUserId } from '@/lib/superadmin';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';

export const runtime='nodejs'; export const dynamic='force-dynamic';
const Input=z.object({changeKey:z.string().regex(/^[a-z0-9][a-z0-9._-]{2,79}$/),
  classification:z.enum(['conformity_or_security','beneficial_or_minor','material_adverse']),
  reasonCode:z.enum(['security','legal','compatibility','supplier','capacity','product_improvement']),
  reasonCs:z.string().min(10).max(2000),reasonEn:z.string().min(10).max(2000),
  impactCs:z.string().min(10).max(4000),impactEn:z.string().min(10).max(4000),
  effectiveAt:z.string().datetime({offset:true}),legacyAvailable:z.boolean(),
  targetPlanCodes:z.array(z.enum(['teacher','teacher_pro','team','school','campus'])).min(1).max(5),
});
export async function POST(request:Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin) return NextResponse.json({error:'same_origin_required'},{status:403});
  const {authenticatedUserId}=await getAuthenticatedUserId();
  if(!authenticatedUserId || !isSuperadminUserId(authenticatedUserId)) return NextResponse.json({error:'superadmin_required'},{status:403});
  const parsed=Input.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:'invalid_service_change_release'},{status:400});
  const input=parsed.data;
  const strategy=input.classification==='material_adverse'?(input.legacyAvailable?'grandfather':'durable_notice'):'apply';
  const canonical=JSON.stringify({...input,strategy,policyVersion:SERVICE_CHANGE_POLICY_VERSION,termsVersion:TERMS_VERSION,termsAcceptanceKey:TERMS_ACCEPTANCE_KEY});
  const sha=createHash('sha256').update(canonical).digest('hex');
  const {data,error}=await createPrivilegedRpcClient().rpc('publish_service_change_for_service',{
    p_change_key:input.changeKey,p_policy_version:SERVICE_CHANGE_POLICY_VERSION,p_terms_version:TERMS_VERSION,
    p_terms_acceptance_key:TERMS_ACCEPTANCE_KEY,p_classification:input.classification,p_strategy:strategy,
    p_reason_code:input.reasonCode,p_reason_cs:input.reasonCs,p_reason_en:input.reasonEn,p_impact_cs:input.impactCs,
    p_impact_en:input.impactEn,p_effective_at:input.effectiveAt,p_legacy_available:input.legacyAvailable,
    p_target_plan_codes:[...new Set(input.targetPlanCodes)],p_content_sha256:sha,p_actor_user_id:authenticatedUserId,
  });
  if(error) return NextResponse.json({error:'service_change_release_not_published'},{status:409,headers:{'Cache-Control':'no-store'}});
  return NextResponse.json({id:data,strategy,contentSha256:sha},{headers:{'Cache-Control':'no-store'}});
}
