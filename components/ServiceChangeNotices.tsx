'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import type { ServiceChangeNotice } from '@/lib/service-change-state';
import styles from './SubscriptionManagement.module.css';

function date(value:string,english:boolean) {
  return new Intl.DateTimeFormat(english?'en-GB':'cs-CZ',{dateStyle:'long',timeZone:'Europe/Prague'}).format(new Date(value));
}

export default function ServiceChangeNotices({notices}:{notices:ServiceChangeNotice[]}) {
  const locale=useUiLocale(); const english=locale==='en'; const router=useRouter();
  const [confirmed,setConfirmed]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState<string|null>(null); const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  if(!notices.length) return null;

  async function terminate(deliveryId:string) {
    if(!confirmed[deliveryId] || busy) return;
    setBusy(deliveryId); setError(''); setMessage('');
    try {
      const response=await fetch('/api/legal/service-changes/terminate',{method:'POST',headers:{'content-type':'application/json'},
        cache:'no-store',body:JSON.stringify({deliveryId,confirmImmediateTermination:true})});
      const payload=await response.json() as {status?:string;error?:string;requestPreserved?:boolean};
      if(!response.ok) throw new Error(payload.requestPreserved
        ? (english?'Your request was recorded and requires individual review. Support will contact you.':'Požadavek je uložený a vyžaduje individuální kontrolu. Podpora se vám ozve.')
        : (english?'The termination request could not be completed.':'Požadavek na ukončení se nepodařilo dokončit.'));
      setMessage(english?'The subscription was terminated. Any unused prepaid amount is being returned to the original payment method.':'Předplatné bylo ukončeno. Nevyužitou předplacenou část vracíme původním platebním prostředkem.');
      router.refresh();
    } catch(cause) { setError(cause instanceof Error?cause.message:(english?'The request failed.':'Požadavek selhal.')); }
    finally { setBusy(null); }
  }

  return <>
    {notices.map(notice=><section className={styles.warning} key={notice.deliveryId} aria-labelledby={`change-${notice.deliveryId}`}>
      <strong id={`change-${notice.deliveryId}`}>{english?'Announced service change':'Oznámená změna služby'}</strong>
      <p>{english?notice.reasonEn:notice.reasonCs}</p><p>{english?notice.impactEn:notice.impactCs}</p>
      <p><strong>{english?'Effective date:':'Datum účinnosti:'}</strong> {date(notice.effectiveAt,english)}.</p>
      {notice.legacyPreservedUntil?<p>{english?`Your current version remains available until ${date(notice.legacyPreservedUntil,true)}.`:`Současná verze vám zůstává dostupná do ${date(notice.legacyPreservedUntil,false)}.`}</p>:null}
      {notice.terminationDeadline && !notice.terminationRequested?<>
        <p>{english?`You may terminate without penalty until ${date(notice.terminationDeadline,true)}. Termination is immediate and the unused prepaid part is returned.`:`Do ${date(notice.terminationDeadline,false)} můžete smlouvu bez postihu vypovědět. Ukončení je okamžité a nevyužitá předplacená část se vrací.`}</p>
        <label><input type="checkbox" checked={Boolean(confirmed[notice.deliveryId])} onChange={event=>setConfirmed(value=>({...value,[notice.deliveryId]:event.target.checked}))}/>{' '}{english?'I understand that access to the paid plan ends immediately.':'Rozumím, že přístup k placenému tarifu skončí okamžitě.'}</label>
        <p><button type="button" className={styles.secondary} disabled={!confirmed[notice.deliveryId]||Boolean(busy)} onClick={()=>void terminate(notice.deliveryId)}>{busy===notice.deliveryId?(english?'Terminating…':'Ukončuji…'):(english?'Terminate because of this change':'Vypovědět kvůli této změně')}</button></p>
      </>:notice.terminationRequested?<p><strong>{english?'Termination request status:':'Stav výpovědi:'}</strong> {notice.terminationStatus}</p>:null}
    </section>)}
    {message?<div className={styles.success} role="status">{message}</div>:null}
    {error?<div className={styles.error} role="alert">{error}</div>:null}
  </>;
}
