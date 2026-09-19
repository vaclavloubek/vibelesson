'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthControls from '@/components/AuthControls';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SyllonautMark from '@/components/SyllonautMark';
import {
  ORGANIZATION_PLANS,
  type OrganizationBillingPeriod,
  type OrganizationPlanCode,
} from '@/lib/organization-billing-catalog';
import styles from './SchoolAdmin.module.css';

type InitialUser = { id: string; email: string | null };

type Summary = {
  id: string;
  name: string;
  legalName: string | null;
  registrationNumber: string | null;
  vatId: string | null;
  billingEmail: string;
  billingCountry: string;
  billingPeriod: OrganizationBillingPeriod;
  currency: 'czk' | 'eur' | 'usd';
  planCode: OrganizationPlanCode;
  status: 'awaiting_payment' | 'active' | 'past_due' | 'suspended' | 'expired' | 'cancelled';
  role: 'owner' | 'admin' | 'teacher';
  manager: boolean;
  renewalMode: 'automatic_card' | 'manual_invoice';
  cancelAtPeriodEnd: boolean;
  pastDueAt: string | null;
  currentPeriodEnd: string | null;
  seats: { active: number; pending: number; limit: number };
  usage: {
    lessonUsed: number;
    lessonLimit: number;
    revisionUsed: number;
    revisionLimit: number;
    shared: true;
  };
  members: Array<{
    userId: string;
    email: string | null;
    role: 'owner' | 'admin' | 'teacher';
    joinedAt: string;
  }>;
  invitations: Array<{
    id: string;
    email_normalized: string;
    role: 'admin' | 'teacher';
    expires_at: string;
  }>;
  orders: Array<{
    id: string;
    status: string;
    payment_method: string;
    amount_minor: number;
    currency: string;
    billing_period: string;
    created_at: string;
    paid_at: string | null;
    hosted_invoice_url: string | null;
    invoice_pdf_url: string | null;
    external_subscription_id: string | null;
    livemode: boolean;
  }>;
};

function money(amountMinor: number, currency: string, locale: 'cs' | 'en') {
  return new Intl.NumberFormat(locale === 'cs' ? 'cs-CZ' : 'en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountMinor / 100);
}

function statusLabel(
  status: Summary['status'],
  english: boolean,
) {
  const labels: Record<Summary['status'], [string, string]> = {
    awaiting_payment: ['Čeká na platbu', 'Awaiting payment'],
    active: ['Aktivní', 'Active'],
    past_due: ['Po splatnosti', 'Past due'],
    suspended: ['Pozastavená', 'Suspended'],
    expired: ['Ukončená', 'Expired'],
    cancelled: ['Zrušená', 'Cancelled'],
  };
  return english ? labels[status][1] : labels[status][0];
}

export default function SchoolAdmin({
  locale,
  initialPlan,
  initialBilling,
  billingEnvironment,
  initialUser,
}: {
  locale: 'cs' | 'en';
  initialPlan: OrganizationPlanCode;
  initialBilling: OrganizationBillingPeriod;
  billingEnvironment: 'sandbox' | 'live';
  initialUser: InitialUser | null;
}) {
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'info' | 'error'>('info');
  const [busy, setBusy] = useState(false);

  const [planCode, setPlanCode] = useState<OrganizationPlanCode>(initialPlan);
  const [billingPeriod, setBillingPeriod] = useState<OrganizationBillingPeriod>(initialBilling);
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [vatId, setVatId] = useState('');
  const [billingEmail, setBillingEmail] = useState(initialUser?.email ?? '');
  const [billingCountry, setBillingCountry] = useState('CZ');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'invoice' | 'card'>('invoice');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'teacher' | 'admin'>('teacher');

  const load = useCallback(async () => {
    if (!initialUser) {
      setLoaded(true);
      return;
    }

    const response = await fetch('/api/organizations/current', { cache: 'no-store' });
    if (!response.ok) {
      setMessageKind('error');
      setMessage(ui(
        'Správu školy se nepodařilo načíst.',
        'School administration could not be loaded.',
      ));
      setLoaded(true);
      return;
    }

    const payload = await response.json() as { organization: Summary | null };
    setSummary(payload.organization);
    setLoaded(true);
  }, [initialUser, english]);

  useEffect(() => {
    void load();
  }, [load]);

  const signupRedirectPath = useMemo(
    () => '/school?plan=' + planCode + '&billing=' + billingPeriod,
    [billingPeriod, planCode],
  );

  async function createOrder(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    const response = await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        legalName,
        registrationNumber,
        vatId,
        billingEmail,
        billingCountry,
        billingAddress: {
          line1: addressLine1,
          city,
          postalCode,
        },
        planCode,
        billingPeriod,
        paymentMethod,
        environment: billingEnvironment,
      }),
    });

    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      orderCreated?: boolean;
      paymentUrl?: string | null;
    };
    setBusy(false);

    if (!response.ok) {
      if (payload.orderCreated) {
        setMessageKind('error');
        setMessage(ui(
          'Objednávka vznikla, ale platební krok se nepodařilo otevřít. Zkus jej spustit znovu níže.',
          'The order was created, but the payment step could not be opened. Retry it below.',
        ));
        await load();
        return;
      }
      setMessageKind('error');
      setMessage(
        payload.error === 'active_organization_membership_exists'
          ? ui(
            'Tento účet už patří do jiné školní organizace.',
            'This account already belongs to another school organization.',
          )
          : ui(
            'Objednávku se nepodařilo vytvořit.',
            'The order could not be created.',
          ),
      );
      return;
    }

    if (payload.paymentUrl) {
      window.location.assign(payload.paymentUrl);
      return;
    }

    setMessageKind('info');
    setMessage(ui(
      'Objednávka byla vytvořena. Školní licence se aktivuje až po potvrzení platby.',
      'The order has been created. The school licence activates only after payment is confirmed.',
    ));
    await load();
  }

  async function retryPayment() {
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/organizations/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: billingEnvironment }),
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      paymentUrl?: string;
    };
    setBusy(false);

    if (!response.ok || !payload.paymentUrl) {
      setMessageKind('error');
      setMessage(ui(
        'Platební krok se nepodařilo znovu otevřít.',
        'The payment step could not be reopened.',
      ));
      return;
    }

    window.location.assign(payload.paymentUrl);
  }

  async function setAutomaticRenewalCancellation(cancelAtPeriodEnd: boolean) {
    setBusy(true);
    setMessage('');

    const response = await fetch('/api/organizations/subscription', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancelAtPeriodEnd }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);

    if (!response.ok) {
      setMessageKind('error');
      setMessage(ui(
        'Nastavení automatického obnovení se nepodařilo změnit.',
        'Automatic renewal settings could not be changed.',
      ));
      return;
    }

    setMessageKind('info');
    setMessage(cancelAtPeriodEnd
      ? ui(
        'Automatické obnovení je vypnuté. Licence poběží do konce zaplaceného období.',
        'Automatic renewal is off. The licence remains active until the end of the paid period.',
      )
      : ui(
        'Automatické obnovení je znovu aktivní.',
        'Automatic renewal is active again.',
      ));
    await load();
  }

  async function createRenewalInvoice() {
    setBusy(true);
    setMessage('');

    const response = await fetch('/api/organizations/renewal', {
      method: 'POST',
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      paymentUrl?: string;
      orderCreated?: boolean;
    };
    setBusy(false);

    if (!response.ok) {
      if (payload.error === 'organization_renewal_too_early') {
        setMessageKind('error');
        setMessage(ui(
          'Obnovovací fakturu lze vystavit nejdříve 90 dní před koncem licence.',
          'A renewal invoice can be issued no earlier than 90 days before the licence ends.',
        ));
        return;
      }
      if (payload.error === 'organization_pending_order_exists') {
        setMessageKind('error');
        setMessage(ui(
          'Pro tuto školu už existuje nezaplacená objednávka.',
          'This school already has an unpaid order.',
        ));
        return;
      }

      setMessageKind('error');
      setMessage(ui(
        'Obnovovací fakturu se nepodařilo vytvořit.',
        'The renewal invoice could not be created.',
      ));
      if (payload.orderCreated) await load();
      return;
    }

    if (payload.paymentUrl) {
      window.location.assign(payload.paymentUrl);
      return;
    }

    await load();
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    const response = await fetch('/api/organizations/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      emailSent?: boolean;
      invitationUrl?: string | null;
    };
    setBusy(false);

    if (!response.ok) {
      setMessageKind('error');
      setMessage(
        payload.error === 'organization_seat_limit_reached'
          ? ui(
            'Kapacita tarifu je už vyčerpaná nebo rezervovaná čekajícími pozvánkami.',
            'The plan capacity is already full or reserved by pending invitations.',
          )
          : ui(
            'Pozvánku se nepodařilo vytvořit.',
            'The invitation could not be created.',
          ),
      );
      return;
    }

    setInviteEmail('');
    setMessageKind('info');
    setMessage(
      payload.emailSent
        ? ui('Pozvánka byla odeslána.', 'Invitation sent.')
        : ui(
          'Pozvánka vznikla, ale e-mail se neodeslal. Odkaz: ' + (payload.invitationUrl ?? ''),
          'Invitation created, but email delivery failed. Link: ' + (payload.invitationUrl ?? ''),
        ),
    );
    await load();
  }

  async function updateMember(userId: string, role: 'admin' | 'teacher') {
    setBusy(true);
    const response = await fetch(
      '/api/organizations/members/' + encodeURIComponent(userId),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      },
    );
    setBusy(false);

    if (!response.ok) {
      setMessageKind('error');
      setMessage(ui('Roli se nepodařilo změnit.', 'The role could not be changed.'));
      return;
    }
    await load();
  }

  async function removeMember(userId: string) {
    if (!window.confirm(ui(
      'Odebrat tohoto uživatele ze školy?',
      'Remove this user from the school?',
    ))) return;

    setBusy(true);
    const response = await fetch(
      '/api/organizations/members/' + encodeURIComponent(userId),
      { method: 'DELETE' },
    );
    setBusy(false);

    if (!response.ok) {
      setMessageKind('error');
      setMessage(ui(
        'Uživatele se nepodařilo odebrat.',
        'The user could not be removed.',
      ));
      return;
    }
    await load();
  }

  const selectedPlan = ORGANIZATION_PLANS[planCode];

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href={'/' + locale} className={styles.brand}>
            <SyllonautMark />
            <span>Syllonaut</span>
          </Link>

          <div className={styles.topActions}>
            <LocaleSwitcher />
            {initialUser ? (
              <PublicHeaderAccountMenu
                user={{
                  id: initialUser.id,
                  email: initialUser.email ?? undefined,
                  user_metadata: {},
                }}
              />
            ) : null}
          </div>
        </header>

        <section className={styles.hero}>
          <span className={styles.eyebrow}>
            {ui('Školní licence', 'School licence')}
            {billingEnvironment === 'sandbox' ? ' · SANDBOX' : ''}
          </span>
          <h1>
            {summary
              ? summary.name
              : ui(
                'Syllonaut pro celý pedagogický tým',
                'Syllonaut for your teaching team',
              )}
          </h1>
          <p>
            {summary
              ? ui(
                'Správa členů, společného AI limitu a licence školy na jednom místě.',
                'Manage members, the shared AI allowance and your school licence in one place.',
              )
              : ui(
                'Každý učitel má vlastní účet. Škola spravuje licenci, členy a společnou měsíční AI kapacitu.',
                'Every teacher keeps a separate account. The school manages the licence, members and a shared monthly AI allowance.',
              )}
          </p>
        </section>

        {message ? (
          <div className={messageKind === 'error' ? styles.error : styles.warning}>
            {message}
          </div>
        ) : null}

        {!initialUser ? (
          <section className={styles.card + ' ' + styles.wide}>
            <h2>{ui('Nejdřív se přihlaste', 'Sign in first')}</h2>
            <p>
              {ui(
                'Objednávka bude svázaná s účtem vlastníka školní organizace.',
                'The order will be linked to the school organization owner account.',
              )}
            </p>
            <AuthControls
              onAuthChange={(user) => { if (user) router.refresh(); }}
              initialOpen
              initialMode="signup"
              signupRedirectPath={signupRedirectPath}
            />
          </section>
        ) : !loaded ? (
          <section className={styles.card + ' ' + styles.wide}>
            {ui('Načítám správu školy…', 'Loading school administration…')}
          </section>
        ) : !summary ? (
          <section className={styles.card + ' ' + styles.wide}>
            <h2>{ui('Založit školní organizaci', 'Create a school organization')}</h2>
            <p>
              {ui(
                'Objednávka sama placené funkce neaktivuje. Licence se aktivuje až po potvrzené platbě.',
                'Creating the order does not activate paid features. The licence activates only after payment is confirmed.',
              )}
            </p>

            <div className={styles.planNote}>
              <strong>{selectedPlan.name}</strong>
              {' · '}
              {selectedPlan.seatLimit}
              {' '}
              {ui('učitelů', 'teachers')}
              {' · '}
              {selectedPlan.monthlyLessonLimit}
              {' '}
              {ui('AI lekcí +', 'AI lessons +')}
              {' '}
              {selectedPlan.monthlyRevisionLimit}
              {' '}
              {ui('AI úprav / měsíc společně', 'AI edits / month shared')}
            </div>

            <form className={styles.form} onSubmit={createOrder} style={{ marginTop: 18 }}>
              <div className={styles.field}>
                <label>{ui('Tarif', 'Plan')}</label>
                <select
                  value={planCode}
                  onChange={(event) => setPlanCode(event.target.value as OrganizationPlanCode)}
                >
                  <option value="team">Team · 10</option>
                  <option value="school">School · 30</option>
                  <option value="campus">Campus · 100</option>
                </select>
              </div>

              <div className={styles.field}>
                <label>{ui('Fakturace', 'Billing')}</label>
                <select
                  value={billingPeriod}
                  onChange={(event) => setBillingPeriod(event.target.value as OrganizationBillingPeriod)}
                >
                  <option value="annual">{ui('Ročně', 'Annual')}</option>
                  <option value="monthly">{ui('Měsíčně', 'Monthly')}</option>
                </select>
              </div>

              <div className={styles.field}>
                <label>{ui('Název školy / týmu', 'School / team name')}</label>
                <input required value={name} onChange={(event) => setName(event.target.value)} />
              </div>

              <div className={styles.field}>
                <label>{ui('Oficiální název', 'Legal name')}</label>
                <input value={legalName} onChange={(event) => setLegalName(event.target.value)} />
              </div>

              <div className={styles.field}>
                <label>{ui('IČO / registrační číslo', 'Registration number')}</label>
                <input
                  value={registrationNumber}
                  onChange={(event) => setRegistrationNumber(event.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label>{ui('DIČ / VAT ID', 'VAT ID')}</label>
                <input value={vatId} onChange={(event) => setVatId(event.target.value)} />
              </div>

              <div className={styles.field}>
                <label>{ui('Fakturační e-mail', 'Billing email')}</label>
                <input
                  type="email"
                  required
                  value={billingEmail}
                  onChange={(event) => setBillingEmail(event.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label>{ui('Fakturační země', 'Billing country')}</label>
                <input
                  required
                  maxLength={2}
                  value={billingCountry}
                  onChange={(event) => setBillingCountry(event.target.value.toUpperCase())}
                />
              </div>

              <div className={styles.field}>
                <label>{ui('Ulice a číslo', 'Street address')}</label>
                <input
                  value={addressLine1}
                  onChange={(event) => setAddressLine1(event.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label>{ui('Město', 'City')}</label>
                <input value={city} onChange={(event) => setCity(event.target.value)} />
              </div>

              <div className={styles.field}>
                <label>{ui('PSČ', 'Postal code')}</label>
                <input
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label>{ui('Způsob platby', 'Payment method')}</label>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as 'invoice' | 'card')}
                >
                  <option value="invoice">
                    {ui('Faktura', 'Invoice')}
                  </option>
                  <option value="card">
                    {ui('Platební karta', 'Payment card')}
                  </option>
                </select>
              </div>

              <div className={styles.full}>
                <button className={styles.primary} type="submit" disabled={busy}>
                  {busy
                    ? ui('Zakládám…', 'Creating…')
                    : ui('Pokračovat k platbě', 'Continue to payment')}
                </button>
              </div>
            </form>
          </section>
        ) : (
          <div className={styles.grid}>
            <section className={styles.card}>
              <span className={styles.status}>
                {summary.planCode.toUpperCase()} · {statusLabel(summary.status, english)}
              </span>
              <h2 style={{ marginTop: 14 }}>{ui('Licence', 'Licence')}</h2>
              <p>
                {summary.status === 'active'
                  ? ui(
                    'Licence je zaplacená a školní entitlementy jsou aktivní.',
                    'The licence is paid and school entitlements are active.',
                  )
                  : ui(
                    'Placené školní entitlementy nejsou aktivní. AI se zatím čerpá pouze z osobního tarifu každého uživatele.',
                    'Paid school entitlements are not active. AI currently uses only each user’s personal plan.',
                  )}
              </p>

              {summary.status === 'awaiting_payment' ? (
                <>
                  <div className={styles.warning}>
                    {ui(
                      'Čekáme na platbu. Správu školy a pozvánky můžete připravit už teď, ale společný AI pool se nečerpá.',
                      'Waiting for payment. You can prepare school administration and invitations now, but the shared AI pool is not available.',
                    )}
                  </div>
                  {summary.manager ? (
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={busy}
                      onClick={retryPayment}
                    >
                      {ui('Pokračovat k platbě', 'Continue to payment')}
                    </button>
                  ) : null}
                </>
              ) : null}

              {summary.status === 'past_due' || summary.status === 'suspended' ? (
                <div className={styles.warning}>
                  {ui(
                    'Platba není potvrzená. Nové placené školní AI operace jsou zablokované; existující obsah zůstává dostupný.',
                    'Payment is not confirmed. New paid school AI operations are blocked; existing content remains available.',
                  )}
                </div>
              ) : null}

              {summary.currentPeriodEnd ? (
                <p className={styles.muted}>
                  {ui('Licence do', 'Licence until')}
                  {' '}
                  {new Date(summary.currentPeriodEnd).toLocaleDateString(
                    english ? 'en-GB' : 'cs-CZ',
                  )}
                </p>
              ) : null}

              {summary.manager && summary.renewalMode === 'automatic_card' && summary.status === 'active' ? (
                <div className={styles.planNote} style={{ marginTop: 14 }}>
                  <strong>{ui('Obnovení', 'Renewal')}</strong>
                  <p>
                    {summary.cancelAtPeriodEnd
                      ? ui(
                        'Automatické obnovení je vypnuté. Licence skončí na konci zaplaceného období.',
                        'Automatic renewal is off. The licence will end at the end of the paid period.',
                      )
                      : ui(
                        'Licence se obnovuje automaticky platební kartou.',
                        'The licence renews automatically by card.',
                      )}
                  </p>
                  <button
                    type="button"
                    className={summary.cancelAtPeriodEnd ? styles.primary : styles.secondary}
                    disabled={busy}
                    onClick={() => setAutomaticRenewalCancellation(!summary.cancelAtPeriodEnd)}
                  >
                    {summary.cancelAtPeriodEnd
                      ? ui('Znovu zapnout automatické obnovení', 'Restore automatic renewal')
                      : ui('Vypnout automatické obnovení', 'Turn off automatic renewal')}
                  </button>
                </div>
              ) : null}

              {summary.manager && summary.renewalMode === 'manual_invoice'
                && ['active', 'past_due', 'expired'].includes(summary.status) ? (
                <div className={styles.planNote} style={{ marginTop: 14 }}>
                  <strong>{ui('Obnovení na fakturu', 'Invoice renewal')}</strong>
                  <p>
                    {ui(
                      'Nové období se aktivuje až po potvrzené úhradě obnovovací faktury.',
                      'The new period activates only after the renewal invoice is confirmed as paid.',
                    )}
                  </p>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={busy}
                    onClick={createRenewalInvoice}
                  >
                    {ui('Vystavit obnovovací fakturu', 'Create renewal invoice')}
                  </button>
                </div>
              ) : null}
            </section>

            <section className={styles.card}>
              <h2>{ui('Kapacita a AI pool', 'Capacity and AI pool')}</h2>
              <div className={styles.metrics}>
                <div className={styles.metric}>
                  <span>{ui('Místa', 'Seats')}</span>
                  <strong>
                    {summary.seats.active + summary.seats.pending}/{summary.seats.limit}
                  </strong>
                </div>
                <div className={styles.metric}>
                  <span>{ui('AI lekce', 'AI lessons')}</span>
                  <strong>{summary.usage.lessonUsed}/{summary.usage.lessonLimit}</strong>
                </div>
                <div className={styles.metric}>
                  <span>{ui('AI úpravy', 'AI edits')}</span>
                  <strong>{summary.usage.revisionUsed}/{summary.usage.revisionLimit}</strong>
                </div>
              </div>
              <p className={styles.muted}>
                {ui(
                  'AI počítadla jsou společná pro aktivní licenci celé organizace.',
                  'AI counters are shared across the whole active organization licence.',
                )}
              </p>
            </section>

            {summary.manager ? (
              <section className={styles.card + ' ' + styles.wide}>
                <h2>{ui('Pozvat učitele', 'Invite teachers')}</h2>
                <form className={styles.form} onSubmit={invite}>
                  <div className={styles.field}>
                    <label>E-mail</label>
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label>{ui('Role', 'Role')}</label>
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(
                        event.target.value as 'teacher' | 'admin',
                      )}
                    >
                      <option value="teacher">{ui('Učitel', 'Teacher')}</option>
                      <option value="admin">{ui('Administrátor', 'Administrator')}</option>
                    </select>
                  </div>
                  <div className={styles.full}>
                    <button className={styles.primary} disabled={busy}>
                      {ui('Odeslat pozvánku', 'Send invitation')}
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            <section className={styles.card + ' ' + styles.wide}>
              <h2>{ui('Uživatelé', 'Users')}</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>E-mail</th>
                      <th>{ui('Role', 'Role')}</th>
                      {summary.manager ? <th>{ui('Akce', 'Actions')}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.members.map((member) => (
                      <tr key={member.userId}>
                        <td>
                          {member.email
                            ?? (member.userId === initialUser.id ? initialUser.email : '—')}
                        </td>
                        <td>{member.role}</td>
                        {summary.manager ? (
                          <td>
                            <div className={styles.rowActions}>
                              {member.role !== 'owner' ? (
                                <>
                                  <button
                                    type="button"
                                    className={styles.secondary}
                                    disabled={busy}
                                    onClick={() => updateMember(
                                      member.userId,
                                      member.role === 'admin' ? 'teacher' : 'admin',
                                    )}
                                  >
                                    {member.role === 'admin'
                                      ? ui('Změnit na učitele', 'Make teacher')
                                      : ui('Udělat admina', 'Make admin')}
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.danger}
                                    disabled={busy}
                                    onClick={() => removeMember(member.userId)}
                                  >
                                    {ui('Odebrat', 'Remove')}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {summary.manager && summary.invitations.length ? (
                <p className={styles.muted}>
                  {ui('Čekající pozvánky', 'Pending invitations')}
                  {': '}
                  {summary.invitations.map((invite) => invite.email_normalized).join(', ')}
                </p>
              ) : null}
            </section>

            {summary.manager ? (
              <section className={styles.card + ' ' + styles.wide}>
                <h2>{ui('Objednávky a fakturace', 'Orders and billing')}</h2>
                {summary.orders.length === 0 ? (
                  <p>{ui('Zatím bez objednávek.', 'No orders yet.')}</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{ui('Datum', 'Date')}</th>
                          <th>{ui('Částka', 'Amount')}</th>
                          <th>{ui('Platba', 'Payment')}</th>
                          <th>Status</th>
                          <th>{ui('Doklady', 'Documents')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.orders.map((order) => (
                          <tr key={order.id}>
                            <td>
                              {new Date(order.created_at).toLocaleDateString(
                                english ? 'en-GB' : 'cs-CZ',
                              )}
                            </td>
                            <td>{money(order.amount_minor, order.currency, locale)}</td>
                            <td>{order.payment_method}</td>
                            <td>{order.status}</td>
                            <td>
                              <div className={styles.rowActions}>
                                {order.hosted_invoice_url ? (
                                  <a
                                    className={styles.back}
                                    href={order.hosted_invoice_url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {ui('Faktura', 'Invoice')}
                                  </a>
                                ) : null}
                                {order.invoice_pdf_url ? (
                                  <a
                                    className={styles.back}
                                    href={order.invoice_pdf_url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    PDF
                                  </a>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
