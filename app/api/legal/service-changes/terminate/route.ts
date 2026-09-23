import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/lib/auth';
import { executeServiceChangeTermination } from '@/lib/service-change-termination';
import { createPrivilegedRpcClient } from '@/lib/neon/privileged-rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const Input=z.object({deliveryId:z.string().uuid(),confirmImmediateTermination:z.literal(true)});
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(request:Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin) return json({error:'same_origin_required'},403);
  const {authenticatedUserId}=await getAuthenticatedUserId();
  if(!authenticatedUserId) return json({error:'authentication_required'},401);
  const parsed=Input.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return json({error:'invalid_service_change_termination_request'},400);
  const requestedAt=new Date().toISOString();
  const {data:id,error}=await createPrivilegedRpcClient().rpc('request_service_change_termination_for_service',{
    p_user_id:authenticatedUserId,p_delivery_id:parsed.data.deliveryId,p_requested_at:requestedAt,
    p_immediate_termination_confirmed:parsed.data.confirmImmediateTermination,
  });
  if(error || typeof id!=='string') return json({error:'service_change_termination_not_available'},409);
  const key=process.env.STRIPE_SECRET_KEY_LIVE;
  if(!key) return json({error:'live_billing_not_configured',requestPreserved:true},503);
  try {
    const result=await executeServiceChangeTermination(id,key);
    return json({id,status:result.request.status,refundAmountMinor:result.request.refund_amount_minor});
  } catch(error) {
    const code=error instanceof Error && /^service_change_[a-z_]+$/.test(error.message)
      ? error.message : 'service_change_termination_review_required';
    return json({error:code,requestPreserved:true,id},409);
  }
}
