'use client';

import { useState } from 'react';

export default function WithdrawalAdmin() {
  const [id,setId] = useState('');
  const [busy,setBusy] = useState(false);
  const [result,setResult] = useState<Record<string, unknown> | null>(null);
  async function send(body: Record<string,unknown>) {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/withdrawals', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body) });
      const data = await response.json();
      setResult(data);
      if (typeof data.id === 'string') setId(data.id);
    } catch { setResult({error:'Spojení selhalo. Stav nejprve ověřte podle ID žádosti.'}); }
    finally { setBusy(false); }
  }
  return <>
    <p>Odstoupení přijaté e-mailem. Nejdříve ověřte totožnost, spotřebitelské postavení a zákonný nárok včetně včasného odeslání. Původní zprávu uchovejte v právní evidenci. Uvedený čas je doručení oznámení, nikoli čas administrativního zpracování.</p>
    <form onSubmit={event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      void send({ action:'register',userId:form.get('userId'),snapshotId:form.get('snapshotId'),
        sentAt:form.get('sentAt'),receivedAt:form.get('receivedAt'),noticeSha256:form.get('noticeSha256'),consumerAndWithdrawalEligibilityConfirmed:true });
    }}>
      <p><label>ID účtu <input name="userId" required /></label></p>
      <p><label>ID smluvního snapshotu <input name="snapshotId" required /></label></p>
      <p><label>Odesláno spotřebitelem (ISO čas včetně Z nebo časového posunu) <input name="sentAt" placeholder="2026-09-21T11:58:00+02:00" required /></label></p>
      <p><label>Doručeno poskytovateli (ISO čas včetně Z nebo časového posunu) <input name="receivedAt" placeholder="2026-09-21T12:00:00+02:00" required /></label></p>
      <p><label>SHA-256 původního oznámení <input name="noticeSha256" pattern="[0-9a-f]{64}" required /></label></p>
      <p><label><input type="checkbox" required /> Ověřil/a jsem totožnost, spotřebitelské postavení a platnost odstoupení.</label></p>
      <button disabled={busy}>Zaevidovat odstoupení</button>
    </form>
    <hr />
    <p><label>ID žádosti <input value={id} onChange={event=>{setId(event.target.value);setResult(null);}} /></label></p>
    <button disabled={busy || !id} onClick={()=>void send({action:'status',id})}>Ověřit stav</button>{' '}
    <button disabled={busy || !id} onClick={()=>void send({action:'prepare',id})}>Připravit výpočet</button>
    <div role="status" aria-live="polite">
      {result && typeof result.refundDueMinor === 'number' && <p>
        Vrátit: {(result.refundDueMinor / 100).toFixed(2)} {String(result.currency).toUpperCase()}. Poměrná úhrada: {(Number(result.retainedMinor)/100).toFixed(2)}.
      </p>}
      {result && <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result,null,2)}</pre>}
    </div>
    {result && typeof result.refundDueMinor === 'number' && <button disabled={busy}
      onClick={()=>{if(window.confirm('Ukončit toto předplatné a zadat zobrazenou vratku na původní platbu?')) void send({action:'execute',id});}}>
      Ukončit předplatné a provést refund
    </button>}
    <p>Chyba nebo stav pending neznamenají dokončenou vratku. Při nejasné historii tarifu či platby nejdříve dokončete individuální posouzení. Oznámení zůstává evidováno.</p>
  </>;
}
