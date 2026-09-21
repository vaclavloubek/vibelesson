import { NextResponse } from 'next/server';
import { deliverPendingServiceChangeNotices } from '@/lib/service-change-email';

export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET;
  if(!secret || request.headers.get('authorization')!=='Bearer '+secret) {
    return NextResponse.json({error:'unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
  }
  try {
    return NextResponse.json({ok:true,...await deliverPendingServiceChangeNotices()},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    console.error('service change delivery cron failed',{error:error instanceof Error?error.message:'unknown'});
    return NextResponse.json({error:'service_change_delivery_failed'},{status:500,headers:{'Cache-Control':'no-store'}});
  }
}
