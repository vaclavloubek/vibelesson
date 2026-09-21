import { createHash } from 'node:crypto';
import { z } from 'zod';
import { renderServiceChangeEmail } from '@/lib/service-change-email-core';
import { createAdminClient } from '@/lib/supabase/admin';

const Delivery=z.object({
  deliveryId:z.string().uuid(),leaseToken:z.string().uuid(),recipientKind:z.enum(['individual','organization']),
  subjectId:z.string().uuid(),email:z.string().email(),locale:z.enum(['cs','en']),planCode:z.string(),
  paidPeriodEnd:z.string().nullable(),legacyPreservedUntil:z.string().nullable(),changeKey:z.string(),
  classification:z.enum(['conformity_or_security','beneficial_or_minor','material_adverse']),
  strategy:z.enum(['apply','grandfather','durable_notice']),reasonCode:z.string(),reasonCs:z.string(),reasonEn:z.string(),
  impactCs:z.string(),impactEn:z.string(),effectiveAt:z.string(),releaseSha256:z.string().regex(/^[0-9a-f]{64}$/),
});

async function send(to:string,rendered:{subject:string;text:string;html:string},idempotencyKey:string) {
  const apiKey=process.env.RESEND_API_KEY;
  if(!apiKey?.startsWith('re_')) throw new Error('service_change_resend_key_missing');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,
    'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({
      from:process.env.BILLING_EMAIL_FROM??'Syllonaut <billing@syllonaut.com>',to:[to],
      reply_to:process.env.BILLING_EMAIL_REPLY_TO??'vaclav@syllonaut.com',...rendered,
    }),signal:AbortSignal.timeout(10_000)}).catch(()=>null);
  if(!response?.ok) throw new Error('service_change_resend_failed');
  const payload=await response.json().catch(()=>null) as {id?:unknown}|null;
  if(typeof payload?.id!=='string') throw new Error('service_change_resend_response_invalid');
  return payload.id;
}

export async function deliverPendingServiceChangeNotices(limit=25) {
  const admin=createAdminClient();
  const {data,error}=await admin.rpc('claim_service_change_deliveries_for_service',{p_limit:limit});
  if(error) throw new Error('service_change_delivery_claim_failed');
  const deliveries=z.array(Delivery).parse(data??[]); let sent=0,failed=0;
  for(const delivery of deliveries) {
    try {
      const rendered=renderServiceChangeEmail(delivery);
      const noticeSha256=createHash('sha256').update(rendered.subject+'\n'+rendered.text+'\n'+rendered.html).digest('hex');
      const emailSha256=createHash('sha256').update(delivery.email.trim().toLowerCase()).digest('hex');
      const providerMessageId=await send(delivery.email,rendered,'syllonaut:service-change:'+delivery.deliveryId);
      const {error:recordError}=await admin.rpc('record_service_change_delivery_sent_for_service',{
        p_delivery_id:delivery.deliveryId,p_lease_token:delivery.leaseToken,p_recipient_email_sha256:emailSha256,
        p_notice_sha256:noticeSha256,p_provider_message_id:providerMessageId,p_sent_at:new Date().toISOString(),
      });
      if(recordError) throw new Error('service_change_delivery_record_failed'); sent+=1;
    } catch(cause) {
      failed+=1; const code=cause instanceof Error?cause.message:'service_change_delivery_failed';
      await admin.rpc('fail_service_change_delivery_for_service',{
        p_delivery_id:delivery.deliveryId,p_lease_token:delivery.leaseToken,p_error_code:code,
      });
    }
  }
  return {claimed:deliveries.length,sent,failed};
}
