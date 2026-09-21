export type ServiceChangeEmailInput={
  recipientKind:'individual'|'organization'; locale:'cs'|'en'; changeKey:string;
  classification:'conformity_or_security'|'beneficial_or_minor'|'material_adverse';
  strategy:'apply'|'grandfather'|'durable_notice'; reasonCs:string; reasonEn:string;
  impactCs:string; impactEn:string; effectiveAt:string; legacyPreservedUntil:string|null;
};

function escape(value:string) {
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

export function renderServiceChangeEmail(input:ServiceChangeEmailInput) {
  const en=input.locale==='en';
  const format=(value:string)=>new Intl.DateTimeFormat(en?'en-GB':'cs-CZ',{dateStyle:'long',timeZone:'Europe/Prague'}).format(new Date(value));
  const subject=en?'Important information about a Syllonaut service change':'Důležitá informace o změně služby Syllonaut';
  const title=en?'Announced service change':'Oznámená změna služby';
  const reason=en?input.reasonEn:input.reasonCs; const impact=en?input.impactEn:input.impactCs;
  const effective=en?`Effective date: ${format(input.effectiveAt)}.`:`Datum účinnosti: ${format(input.effectiveAt)}.`;
  const legacy=input.legacyPreservedUntil
    ? (en?`Your current version remains available without additional cost until ${format(input.legacyPreservedUntil)}.`:`Současná verze vám zůstává bez dodatečných nákladů dostupná do ${format(input.legacyPreservedUntil)}.`)
    : '';
  const right=input.recipientKind==='individual'&&input.strategy==='durable_notice'
    ? (en?'Because this change may affect access or use in more than a minor way, you may terminate without penalty within the statutory period. The unused prepaid part will be returned to the original payment method. Use the Subscription page; accepting new Terms is not required to exercise this right.'
      :'Protože změna může zhoršit přístup nebo užívání nikoli jen nevýznamně, můžete smlouvu v zákonné lhůtě bez postihu vypovědět. Nevyužitá předplacená část bude vrácena původním platebním prostředkem. Použijte stránku Předplatné; pro uplatnění práva nemusíte přijmout nové podmínky.')
    : (input.recipientKind==='organization'
      ? (en?'For organization contract questions, contact us before the effective date.':'S dotazy ke smlouvě organizace nás kontaktujte před datem účinnosti.'):'');
  const url='https://www.syllonaut.com/subscription';
  const paragraphs=[reason,impact,effective,legacy,right].filter(Boolean);
  const text=[title,...paragraphs,url,`Change reference: ${input.changeKey}`].join('\n\n');
  const html='<!doctype html><html lang="'+input.locale+'"><body style="margin:0;background:#f6f5f1;color:#151721;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">'
    +'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #e2e1dc;border-radius:20px"><tr><td style="padding:28px">'
    +'<div style="font-size:18px;font-weight:800;margin-bottom:22px">Syllonaut</div><h1 style="font-size:28px;margin:0 0 18px">'+escape(title)+'</h1>'
    +paragraphs.map(p=>'<p style="line-height:1.65">'+escape(p)+'</p>').join('')
    +'<p style="margin:26px 0"><a href="'+url+'" style="display:inline-block;padding:12px 17px;border-radius:10px;background:#5b57e8;color:#fff;text-decoration:none;font-weight:700">'+escape(en?'Open Subscription':'Otevřít Předplatné')+'</a></p>'
    +'<p style="color:#686b74;font-size:12px">'+escape(`Change reference: ${input.changeKey}`)+'</p></td></tr></table></td></tr></table></body></html>';
  return {subject,text,html};
}
