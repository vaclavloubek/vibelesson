'use client';

import Link from 'next/link';
import { type ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  isInternalTest: boolean;
  cancelAtPeriodEnd: boolean;
  pastDueAt: string | null;
  currentPeriodEnd: string | null;
  seats: {
    active: number;
    pending: number;
    limit: number;
    periodUniqueUsed: number;
    periodUniqueLimit: number;
    replacementAllowance: number;
    pendingNewReservations: number;
    periodStart: string | null;
    periodEnd: string | null;
  };
  usage: {
    lessonUsed: number;
    lessonLimit: number;
    revisionUsed: number;
    revisionLimit: number;
    shared: true;
  };
  usageByMember: Array<{
    userId: string;
    email: string | null;
    lessonUsed: number;
    revisionUsed: number;
  }>;
  libraryEnabled: boolean;
  library: Array<{
    id: string;
    title: string;
    subject: string | null;
    published_by: string | null;
    created_at: string;
  }>;
  ownLessons: Array<{
    id: string;
    title: string;
    updated_at: string;
  }>;
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

function roleLabel(
  role: Summary['role'],
  english: boolean,
) {
  const labels: Record<Summary['role'], [string, string]> = {
    owner: ['Vlastník', 'Owner'],
    admin: ['Administrátor', 'Administrator'],
    teacher: ['Učitel', 'Teacher'],
  };
  return english ? labels[role][1] : labels[role][0];
}

export default function SchoolAdmin({
  locale,
  initialPlan,
  initialBilling,
  billingEnvironment,
  initialCheckoutResult,
  schoolBillingAvailable,
  initialUser,
}: {
  locale: 'cs' | 'en';
  initialPlan: OrganizationPlanCode;
  initialBilling: OrganizationBillingPeriod;
  billingEnvironment: 'sandbox' | 'live';
  initialCheckoutResult: 'success' | 'cancelled' | null;
  schoolBillingAvailable: boolean;
  initialUser: InitialUser | null;
}) {
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const router = useRouter();
  const renderedUserId = initialUser?.id ?? null;
  const authBoundaryTriggeredRef = useRef(false);
  const checkoutPollingStartedRef = useRef(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'info' | 'error'>('info');
  const [busy, setBusy] = useState(false);

  const [planCode, setPlanCode] = useState<OrganizationPlanCode>(initialPlan);
  const [billingPeriod, setBillingPeriod] = useState<OrganizationBillingPeriod>(initialBilling);
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [legalNameTouched, setLegalNameTouched] = useState(false);
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
  const [bulkInviteEntries, setBulkInviteEntries] = useState<Array<{
    email: string;
    role: 'teacher' | 'admin';
  }>>([]);
  const bulkInviteNormalizedEmails = bulkInviteEntries.map(
    (entry) => entry.email.trim().toLowerCase(),
  );
  const bulkInviteHasInvalidEmail = bulkInviteNormalizedEmails.some(
    (email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  );
  const bulkInviteHasDuplicateEmail = new Set(bulkInviteNormalizedEmails).size
    !== bulkInviteNormalizedEmails.length;
  const bulkInviteCanSend = bulkInviteEntries.length > 0
    && !bulkInviteHasInvalidEmail
    && !bulkInviteHasDuplicateEmail;
  const [libraryLessonId, setLibraryLessonId] = useState('');
  const [librarySubjectFilter, setLibrarySubjectFilter] = useState('__all__');

  const enforceRenderedIdentity = useCallback((nextUserId: string | null) => {
    if (nextUserId === renderedUserId || authBoundaryTriggeredRef.current) return;

    authBoundaryTriggeredRef.current = true;

    // Never leave privileged organization state visible after the authenticated
    // identity changes (including another tab changing the shared Supabase session).
    setSummary(null);
    setLoaded(false);
    setBusy(true);
    setMessage('');

    window.location.reload();
  }, [locale, renderedUserId]);

  useEffect(() => {
    let active = true;

    async function verifyRenderedIdentity() {
      try {
        const response = await fetch('/api/auth/identity', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!active || !response.ok) return;
        const payload = await response.json().catch(() => ({})) as {
          userId?: string | null;
        };
        enforceRenderedIdentity(payload.userId ?? null);
      } catch {
        // Backend authorization remains authoritative if this freshness probe fails.
      }
    }

    const handleFocus = () => {
      void verifyRenderedIdentity();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void verifyRenderedIdentity();
    };
    const handlePageShow = () => {
      void verifyRenderedIdentity();
    };

    void verifyRenderedIdentity();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void verifyRenderedIdentity();
    }, 5000);

    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enforceRenderedIdentity]);

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

  useEffect(() => {
    if (!initialUser || !initialCheckoutResult || checkoutPollingStartedRef.current) return;

    if (initialCheckoutResult === 'cancelled') {
      checkoutPollingStartedRef.current = true;
      setMessageKind('info');
      setMessage(ui(
        'Platba nebyla dokončena. Objednávka zůstává uložená a k platbě se můžete vrátit.',
        'Payment was not completed. Your order is saved and you can return to payment.',
      ));
      window.history.replaceState({}, '', '/school');
      return;
    }

    checkoutPollingStartedRef.current = true;
    setMessageKind('info');
    setMessage(ui(
      'Platbu ověřujeme. Licence se aktivuje automaticky po potvrzení Stripe.',
      'We are confirming your payment. The licence activates automatically after Stripe confirms it.',
    ));

    let cancelled = false;
    let timeoutId: number | null = null;
    let attempts = 0;
    const maxAttempts = 10;

    async function pollCheckoutStatus() {
      attempts += 1;

      try {
        const response = await fetch('/api/organizations/current', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok || cancelled) return;

        const payload = await response.json() as { organization: Summary | null };
        if (cancelled) return;

        setSummary(payload.organization);
        setLoaded(true);

        if (payload.organization?.status === 'active') {
          setMessageKind('info');
          setMessage(ui(
            'Platba je potvrzená a školní licence je aktivní. Teď můžete pozvat učitele.',
            'Payment is confirmed and the school licence is active. You can now invite teachers.',
          ));
          window.history.replaceState({}, '', '/school');
          return;
        }
      } catch {
        // Webhook state remains authoritative. A transient polling failure is safe to retry.
      }

      if (!cancelled && attempts < maxAttempts) {
        timeoutId = window.setTimeout(pollCheckoutStatus, 1500);
        return;
      }

      if (!cancelled) {
        setMessageKind('info');
        setMessage(ui(
          'Potvrzení platby ještě čeká na Stripe. Objednávka je uložená; stav se po potvrzení automaticky projeví po obnovení stránky.',
          'Stripe has not confirmed the payment yet. Your order is saved; the status will update after confirmation when the page is refreshed.',
        ));
      }
    }

    void pollCheckoutStatus();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [initialCheckoutResult, initialUser, english]);

  const signupRedirectPath = useMemo(
    () => '/school?plan=' + planCode + '&billing=' + billingPeriod,
    [billingPeriod, planCode],
  );

  const librarySubjects = useMemo(() => {
    const subjects = (summary?.library ?? [])
      .map((entry) => entry.subject?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((subject): subject is string => subject.length > 0);
    return Array.from(new Set(subjects)).sort((left, right) => left.localeCompare(right, locale));
  }, [locale, summary]);

  const hasUnclassifiedLibraryLessons = useMemo(
    () => (summary?.library ?? []).some((entry) => !entry.subject?.trim()),
    [summary],
  );

  const filteredLibrary = useMemo(() => {
    const entries = summary?.library ?? [];
    if (librarySubjectFilter === '__all__') return entries;
    if (librarySubjectFilter === '__unclassified__') {
      return entries.filter((entry) => !entry.subject?.trim());
    }
    return entries.filter((entry) => entry.subject?.trim() === librarySubjectFilter);
  }, [librarySubjectFilter, summary]);

  useEffect(() => {
    if (!summary || librarySubjectFilter === '__all__') return;
    if (
      librarySubjectFilter === '__unclassified__'
        ? hasUnclassifiedLibraryLessons
        : librarySubjects.includes(librarySubjectFilter)
    ) return;
    setLibrarySubjectFilter('__all__');
  }, [
    hasUnclassifiedLibraryLessons,
    librarySubjectFilter,
    librarySubjects,
    summary,
  ]);

  async function downloadQuote() {
    if (!name.trim()) {
      setMessageKind('error');
      setMessage(ui(
        'Nejdřív vyplňte název školy nebo týmu.',
        'Enter the school or team name first.',
      ));
      return;
    }

    setBusy(true);
    setMessage('');

    const response = await fetch('/api/organizations/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        legalName,
        registrationNumber,
        vatId,
        billingCountry,
        billingAddress: {
          line1: addressLine1,
          city,
          postalCode,
        },
        planCode,
        billingPeriod,
        locale,
      }),
    });

    if (!response.ok) {
      setBusy(false);
      setMessageKind('error');
      setMessage(ui(
        'Cenovou nabídku se nepodařilo vytvořit.',
        'The price quote could not be created.',
      ));
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'syllonaut-nabidka-' + planCode + '.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

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
        payload.error === 'organization_member_already_active'
          ? ui(
            'Tento e-mail už patří aktivnímu členovi školy. Jeho roli změňte přímo v přehledu uživatelů.',
            'This email already belongs to an active school member. Change the role directly in the user list.',
          )
          : payload.error === 'organization_replacement_limit_reached'
            ? ui(
              'V tomto fakturačním období už byla využita povolená kapacita výměn členů. Dalšího nového člověka lze přidat až v dalším období.',
              'The member replacement allowance for this billing period has been used. Another new person can be added in the next period.',
            )
            : payload.error === 'organization_seat_limit_reached'
            ? ui(
              'Všechna aktivní místa jsou obsazená nebo rezervovaná čekajícími pozvánkami.',
              'All active seats are occupied or reserved by pending invitations.',
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

  async function handleBulkInviteFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setBulkInviteEntries([]);
      return;
    }

    const text = await file.text();
    const entries: Array<{ email: string; role: 'teacher' | 'admin' }> = [];
    const seen = new Set<string>();

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const cells = line.split(/[;,]/).map((value) => value.trim());
      const email = (cells[0] ?? '').toLowerCase();
      if (!email || email === 'email' || email === 'e-mail' || seen.has(email)) continue;
      const roleCell = (cells[1] ?? '').toLowerCase();
      const role = ['admin', 'administrator', 'administrátor'].includes(roleCell)
        ? 'admin'
        : 'teacher';
      seen.add(email);
      entries.push({ email, role });
    }

    setBulkInviteEntries(entries.slice(0, 100));
    setMessageKind('info');
    setMessage(ui(
      'Načteno adres: ' + Math.min(entries.length, 100) + '.',
      'Loaded addresses: ' + Math.min(entries.length, 100) + '.',
    ));
  }

  function updateBulkInviteEntry(
    index: number,
    patch: Partial<{ email: string; role: 'teacher' | 'admin' }>,
  ) {
    setBulkInviteEntries((current) => current.map(
      (entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry,
    ));
  }

  function removeBulkInviteEntry(index: number) {
    setBulkInviteEntries((current) => current.filter((_, entryIndex) => entryIndex !== index));
  }

  async function sendBulkInvites() {
    if (!bulkInviteCanSend) {
      setMessageKind('error');
      setMessage(bulkInviteHasDuplicateEmail
        ? ui(
          'V seznamu jsou duplicitní e-mailové adresy. Před odesláním je upravte nebo odeberte.',
          'The list contains duplicate email addresses. Edit or remove them before sending.',
        )
        : ui(
          'Některá e-mailová adresa není platná. Před odesláním ji opravte.',
          'One or more email addresses are invalid. Fix them before sending.',
        ));
      return;
    }

    const normalizedEntries = bulkInviteEntries.map((entry) => ({
      email: entry.email.trim().toLowerCase(),
      role: entry.role,
    }));

    setBusy(true);
    setMessage('');

    const response = await fetch('/api/organizations/invitations/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: normalizedEntries }),
    });
    const payload = await response.json().catch(() => ({})) as {
      invited?: string[];
      failed?: Array<{ email: string; error: string }>;
    };
    setBusy(false);

    const invitedCount = payload.invited?.length ?? 0;
    const failedCount = payload.failed?.length ?? 0;
    const activeMemberHit = payload.failed?.some(
      (item) => item.error === 'member_already_active',
    ) ?? false;
    const replacementLimitHit = payload.failed?.some(
      (item) => item.error === 'replacement_limit_reached',
    ) ?? false;

    if (!response.ok && invitedCount === 0) {
      setMessageKind('error');
      setMessage(activeMemberHit
        ? ui(
          'Některé adresy už patří aktivním členům školy. Jejich role změňte přímo v přehledu uživatelů.',
          'Some addresses already belong to active school members. Change their roles directly in the user list.',
        )
        : ui(
          'Hromadné pozvánky se nepodařilo odeslat.',
          'Bulk invitations could not be sent.',
        ));
      return;
    }

    setBulkInviteEntries([]);
    setMessageKind(failedCount ? 'error' : 'info');
    setMessage(replacementLimitHit
      ? ui(
        'Část pozvánek byla odeslána, ale další nové osoby už překročily povolenou kapacitu výměn pro toto fakturační období.',
        'Some invitations were sent, but additional new people would exceed the replacement allowance for this billing period.',
      )
      : activeMemberHit
        ? ui(
          'Nové pozvánky byly odeslány, ale adresy aktivních členů byly přeskočené. Jejich role změňte v přehledu uživatelů.',
          'New invitations were sent, but active member addresses were skipped. Change their roles in the user list.',
        )
        : ui(
          'Odesláno: ' + invitedCount + (failedCount ? ', neodesláno: ' + failedCount : '') + '.',
          'Sent: ' + invitedCount + (failedCount ? ', failed: ' + failedCount : '') + '.',
        ));
    await load();
  }

  async function transferOwner(newOwnerUserId: string, email: string | null) {
    if (!window.confirm(ui(
      'Převést vlastnictví školy na ' + (email ?? newOwnerUserId) + '? Váš účet zůstane administrátorem.',
      'Transfer school ownership to ' + (email ?? newOwnerUserId) + '? Your account will remain an administrator.',
    ))) return;

    setBusy(true);
    const response = await fetch('/api/organizations/owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newOwnerUserId }),
    });
    setBusy(false);

    if (!response.ok) {
      setMessageKind('error');
      setMessage(ui(
        'Vlastnictví školy se nepodařilo převést.',
        'School ownership could not be transferred.',
      ));
      return;
    }

    setMessageKind('info');
    setMessage(ui('Vlastnictví školy bylo převedeno.', 'School ownership was transferred.'));
    await load();
  }

  async function publishLibraryLesson() {
    if (!libraryLessonId) return;
    setBusy(true);
    setMessage('');

    const response = await fetch('/api/organizations/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId: libraryLessonId }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);

    if (!response.ok) {
      setMessageKind('error');
      setMessage(payload.error === 'lesson_already_in_school_library'
        ? ui('Tato lekce už ve školní knihovně je.', 'This lesson is already in the school library.')
        : ui('Lekci se nepodařilo publikovat do školy.', 'The lesson could not be published to the school.'));
      return;
    }

    setLibraryLessonId('');
    setMessageKind('info');
    setMessage(ui('Lekce byla přidána do školní knihovny.', 'Lesson added to the school library.'));
    await load();
  }

  async function importLibraryLesson(entryId: string) {
    setBusy(true);
    const response = await fetch(
      '/api/organizations/library/' + encodeURIComponent(entryId) + '/import',
      { method: 'POST' },
    );
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      lessonId?: string;
    };
    setBusy(false);

    if (!response.ok || !payload.lessonId) {
      setMessageKind('error');
      setMessage(ui(
        'Kopii lekce se nepodařilo uložit.',
        'The lesson copy could not be saved.',
      ));
      return;
    }

    router.push('/lessons/' + payload.lessonId);
  }

  async function removeLibraryLesson(entryId: string) {
    if (!window.confirm(ui(
      'Odebrat tuto lekci ze školní knihovny? Kopie, které si už učitelé importovali, zůstanou zachované.',
      'Remove this lesson from the school library? Copies already imported by teachers will remain.',
    ))) return;

    setBusy(true);
    const response = await fetch(
      '/api/organizations/library/' + encodeURIComponent(entryId),
      { method: 'DELETE' },
    );
    setBusy(false);

    if (!response.ok) {
      setMessageKind('error');
      setMessage(ui(
        'Lekci se nepodařilo odebrat ze školní knihovny.',
        'The lesson could not be removed from the school library.',
      ));
      return;
    }

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

  async function revokeInvitation(invitationId: string, email: string) {
    if (!window.confirm(ui(
      'Zrušit čekající pozvánku pro ' + email + '?',
      'Cancel the pending invitation for ' + email + '?',
    ))) return;

    setBusy(true);
    setMessage('');

    const response = await fetch(
      '/api/organizations/invitations/' + encodeURIComponent(invitationId),
      { method: 'DELETE' },
    );
    setBusy(false);

    if (!response.ok) {
      setMessageKind('error');
      setMessage(ui(
        'Pozvánku se nepodařilo zrušit.',
        'The invitation could not be cancelled.',
      ));
      return;
    }

    setMessageKind('info');
    setMessage(ui('Pozvánka byla zrušena.', 'Invitation cancelled.'));
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
        ) : !summary && !schoolBillingAvailable ? (
          <section className={styles.card + ' ' + styles.wide}>
            <h2>{ui('Školní tarify připravujeme', 'School plans are coming soon')}</h2>
            <p>
              {ui(
                'Správa školních licencí je technicky připravená, ale veřejné objednávky zatím nejsou spuštěné.',
                'School licence management is technically ready, but public ordering has not launched yet.',
              )}
            </p>
            <Link className={styles.back} href={'/' + locale + '/pricing'}>
              {ui('Zpět na ceník →', 'Back to pricing →')}
            </Link>
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
                <label>{ui('Název školy / týmu *', 'School / team name *')}</label>
                <input
                  required
                  value={name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setName(nextName);
                    if (!legalNameTouched) setLegalName(nextName);
                  }}
                />
              </div>

              <div className={styles.field}>
                <label>{ui('Oficiální název *', 'Legal name *')}</label>
                <input
                  required
                  value={legalName}
                  onChange={(event) => {
                    setLegalNameTouched(true);
                    setLegalName(event.target.value);
                  }}
                />
              </div>

              <div className={styles.field}>
                <label>
                  {ui(
                    'IČO / registrační číslo (volitelné)',
                    'Registration number (optional)',
                  )}
                </label>
                <input
                  value={registrationNumber}
                  onChange={(event) => setRegistrationNumber(event.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label>{ui('DIČ / VAT ID (volitelné)', 'VAT ID (optional)')}</label>
                <input value={vatId} onChange={(event) => setVatId(event.target.value)} />
              </div>

              <div className={styles.field}>
                <label>{ui('Fakturační e-mail *', 'Billing email *')}</label>
                <input
                  type="email"
                  required
                  value={billingEmail}
                  onChange={(event) => setBillingEmail(event.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label>{ui('Fakturační země *', 'Billing country *')}</label>
                <input
                  required
                  maxLength={2}
                  value={billingCountry}
                  onChange={(event) => setBillingCountry(event.target.value.toUpperCase())}
                />
              </div>

              <div className={styles.field}>
                <label>{ui('Ulice a číslo *', 'Street address *')}</label>
                <input
                  required
                  value={addressLine1}
                  onChange={(event) => setAddressLine1(event.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label>{ui('Město *', 'City *')}</label>
                <input required value={city} onChange={(event) => setCity(event.target.value)} />
              </div>

              <div className={styles.field}>
                <label>{ui('PSČ *', 'Postal code *')}</label>
                <input
                  required
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
                <div className={styles.rowActions}>
                  <button className={styles.primary} type="submit" disabled={busy}>
                    {busy
                      ? ui('Zakládám…', 'Creating…')
                      : ui('Pokračovat k platbě', 'Continue to payment')}
                  </button>
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={busy || !name.trim()}
                    onClick={downloadQuote}
                  >
                    {ui('Stáhnout cenovou nabídku PDF', 'Download price quote PDF')}
                  </button>
                </div>
              </div>
            </form>
          </section>
        ) : (
          <div className={styles.grid}>
            <section className={styles.card}>
              <span className={styles.status}>
                {summary.isInternalTest ? ui('INTERNÍ TEST · ', 'INTERNAL TEST · ') : ''}
                {summary.planCode.toUpperCase()} · {statusLabel(summary.status, english)}
              </span>
              <h2 style={{ marginTop: 14 }}>{ui('Licence', 'Licence')}</h2>
              <p>
                {summary.isInternalTest
                  ? ui(
                    'Interní testovací Campus je trvale aktivní a není napojený na fakturaci. Slouží k ověřování školních funkcí.',
                    'The internal test Campus is permanently active and is not connected to billing. It is used to verify school features.',
                  )
                  : summary.status === 'active'
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

              {!summary.isInternalTest && summary.manager && summary.renewalMode === 'automatic_card' && summary.status === 'active' ? (
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

              {!summary.isInternalTest && summary.manager && summary.renewalMode === 'manual_invoice'
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
                  <span>{ui('Aktivní místa', 'Active seats')}</span>
                  <strong>{summary.seats.active}/{summary.seats.limit}</strong>
                </div>
                <div className={styles.metric}>
                  <span>{ui('Čekající pozvánky', 'Pending invitations')}</span>
                  <strong>{summary.seats.pending}</strong>
                </div>
                <div className={styles.metric}>
                  <span>{ui('Unikátní uživatelé v období', 'Unique users this period')}</span>
                  <strong>
                    {summary.seats.periodUniqueUsed}/{summary.seats.periodUniqueLimit}
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

              {summary.seats.periodStart ? (
                <div className={styles.planNote} style={{ marginTop: 14 }}>
                  <strong>{ui('Jak fungují výměny členů', 'How member replacements work')}</strong>
                  <p>
                    {ui(
                      'Nejde o souběžná místa. Tarif má stále ' + summary.seats.limit
                        + ' současně aktivních míst. Limit ' + summary.seats.periodUniqueLimit
                        + ' unikátních uživatelů znamená těchto ' + summary.seats.limit
                        + ' míst plus rezervu ' + summary.seats.replacementAllowance
                        + ' uživatelů pro personální výměny během tohoto fakturačního období.',
                      'This is not a concurrent-seat limit. The plan still has '
                        + summary.seats.limit + ' simultaneously active seats. The '
                        + summary.seats.periodUniqueLimit + ' unique-user limit means those '
                        + summary.seats.limit + ' seats plus a replacement allowance of '
                        + summary.seats.replacementAllowance + ' users during this billing period.',
                    )}
                  </p>
                  {summary.seats.pendingNewReservations ? (
                    <p className={styles.muted}>
                      {ui(
                        'Čekající pozvánky pro nové osoby nyní rezervují '
                          + summary.seats.pendingNewReservations
                          + ' z této výměnové kapacity.',
                        'Pending invitations for new people currently reserve '
                          + summary.seats.pendingNewReservations
                          + ' of this replacement capacity.',
                      )}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className={styles.muted}>
                  {ui(
                    'Limit výměn členů se začne počítat od začátku aktivního fakturačního období.',
                    'The member replacement limit starts with the active billing period.',
                  )}
                </p>
              )}

              <p className={styles.muted}>
                {ui(
                  'AI počítadla jsou společná pro aktivní licenci celé organizace.',
                  'AI counters are shared across the whole active organization licence.',
                )}
              </p>
              {summary.isInternalTest ? (
                <p className={styles.muted}>
                  {ui(
                    'Tvůj interní admin účet zůstává neomezený a nepočítá se do komerčních míst ani výměn. Přizvané běžné účty Campus limity používají standardně.',
                    'Your internal admin account remains unlimited and does not count toward commercial seats or replacements. Invited regular accounts use the Campus limits normally.',
                  )}
                </p>
              ) : null}
            </section>

            {summary.manager && summary.usageByMember.length ? (
              <section className={styles.card + ' ' + styles.wide}>
                <h2>{ui('Využití AI podle uživatelů', 'AI usage by user')}</h2>
                <p className={styles.muted}>
                  {ui(
                    'Pouze agregované počty za aktuální měsíc. Obsah promptů ani lekcí se administrátorovi nezobrazuje.',
                    'Aggregated counts for the current month only. Prompt and lesson content is never shown to administrators.',
                  )}
                </p>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>E-mail</th>
                        <th>{ui('AI lekce', 'AI lessons')}</th>
                        <th>{ui('AI úpravy', 'AI edits')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.usageByMember.map((usage) => (
                        <tr key={usage.userId}>
                          <td>{usage.email ?? '—'}</td>
                          <td>{usage.lessonUsed}</td>
                          <td>{usage.revisionUsed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {summary.libraryEnabled ? (
              <section className={styles.card + ' ' + styles.wide}>
                <h2>{ui('Školní knihovna', 'School library')}</h2>
                <p>
                  {ui(
                    'Společné místo pro lekce, které členové školy předali škole jako samostatné kopie.',
                    'A shared place for lessons that school members have contributed as separate copies.',
                  )}
                </p>

                {summary.status === 'active' ? (
                  <div className={styles.planNote} style={{ marginTop: 16 }}>
                    <strong>{ui('Přidat lekci do školní knihovny', 'Add a lesson to the school library')}</strong>
                    <p>
                      {ui(
                        'Vyberte jednu ze svých lekcí. Do školní knihovny se uloží její samostatná kopie; vaše původní lekce zůstane nezměněná.',
                        'Choose one of your lessons. A separate copy will be stored in the school library; your original lesson stays unchanged.',
                      )}
                    </p>

                    {summary.ownLessons.length ? (
                      <div className={styles.form} style={{ marginTop: 14 }}>
                        <div className={styles.field}>
                          <label>{ui('Moje lekce', 'My lessons')}</label>
                          <select
                            value={libraryLessonId}
                            onChange={(event) => setLibraryLessonId(event.target.value)}
                          >
                            <option value="">{ui('Vyberte lekci…', 'Choose a lesson…')}</option>
                            {summary.ownLessons.map((lesson) => (
                              <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
                            ))}
                          </select>
                        </div>
                        <div className={styles.field}>
                          <label>&nbsp;</label>
                          <button
                            type="button"
                            className={styles.primary}
                            disabled={busy || !libraryLessonId}
                            onClick={publishLibraryLesson}
                          >
                            {ui('Přidat kopii do školní knihovny', 'Add copy to school library')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={styles.muted}>
                        {ui(
                          'Zatím nemáte žádnou vlastní lekci, kterou by bylo možné do školy přidat.',
                          'You do not have a personal lesson to add yet.',
                        )}
                      </p>
                    )}
                  </div>
                ) : null}

                <div style={{ marginTop: 22 }}>
                  <h3>{ui('Lekce ve školní knihovně', 'Lessons in the school library')}</h3>
                  <p className={styles.muted}>
                    {ui(
                      'Každý člen školy si může ze školní lekce vytvořit vlastní nezávislou kopii.',
                      'Each school member can create an independent personal copy from a school lesson.',
                    )}
                  </p>

                  {summary.library.length ? (
                    <>
                      <div className={styles.libraryFilterBar}>
                        <div className={styles.field}>
                          <label htmlFor="school-library-subject-filter">
                            {ui('Předmět', 'Subject')}
                          </label>
                          <select
                            id="school-library-subject-filter"
                            value={librarySubjectFilter}
                            onChange={(event) => setLibrarySubjectFilter(event.target.value)}
                          >
                            <option value="__all__">
                              {ui('Všechny předměty', 'All subjects')} ({summary.library.length})
                            </option>
                            {librarySubjects.map((subject) => (
                              <option key={subject} value={subject}>
                                {subject} ({summary.library.filter(
                                  (entry) => entry.subject?.trim() === subject,
                                ).length})
                              </option>
                            ))}
                            {hasUnclassifiedLibraryLessons ? (
                              <option value="__unclassified__">
                                {ui('Nezařazeno', 'Unclassified')} ({summary.library.filter(
                                  (entry) => !entry.subject?.trim(),
                                ).length})
                              </option>
                            ) : null}
                          </select>
                        </div>
                        <span className={styles.muted}>
                          {ui('Zobrazeno', 'Showing')}: {filteredLibrary.length}/{summary.library.length}
                        </span>
                      </div>

                      {filteredLibrary.length ? (
                        <div
                          className={
                            styles.tableWrap
                            + (filteredLibrary.length >= 10 ? ' ' + styles.libraryScrollable : '')
                          }
                        >
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th>{ui('Lekce', 'Lesson')}</th>
                                <th>{ui('Předmět', 'Subject')}</th>
                                <th>{ui('Přidal', 'Added by')}</th>
                                <th>{ui('Datum', 'Date')}</th>
                                <th>{ui('Akce', 'Actions')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredLibrary.map((entry) => {
                                const publisher = summary.members.find(
                                  (member) => member.userId === entry.published_by,
                                );
                                const canRemove = summary.manager
                                  || entry.published_by === initialUser.id;
                                return (
                                  <tr key={entry.id}>
                                    <td>{entry.title}</td>
                                    <td>
                                      {entry.subject?.trim()
                                        || ui('Nezařazeno', 'Unclassified')}
                                    </td>
                                    <td>{publisher?.email ?? '—'}</td>
                                    <td>{new Date(entry.created_at).toLocaleDateString(
                                      english ? 'en-GB' : 'cs-CZ',
                                    )}</td>
                                    <td>
                                      <div className={styles.rowActions}>
                                        <button
                                          type="button"
                                          className={styles.secondary}
                                          disabled={busy || summary.status !== 'active'}
                                          onClick={() => importLibraryLesson(entry.id)}
                                          title={summary.status === 'active'
                                            ? undefined
                                            : ui(
                                              'Import je dostupný pouze s aktivní školní licencí.',
                                              'Import is available only with an active school licence.',
                                            )}
                                        >
                                          {ui('Vytvořit vlastní kopii', 'Create my copy')}
                                        </button>
                                        {canRemove ? (
                                          <button
                                            type="button"
                                            className={styles.danger}
                                            disabled={busy}
                                            onClick={() => removeLibraryLesson(entry.id)}
                                          >
                                            {ui('Odebrat', 'Remove')}
                                          </button>
                                        ) : null}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className={styles.muted}>
                          {ui(
                            'Pro vybraný předmět tu zatím žádná lekce není.',
                            'There are no lessons for the selected subject yet.',
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className={styles.muted}>
                      {ui('Školní knihovna je zatím prázdná.', 'The school library is empty.')}
                    </p>
                  )}
                </div>
              </section>
            ) : null}

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

                <div className={styles.planNote} style={{ marginTop: 18 }}>
                  <strong>{ui('Hromadně z CSV', 'Bulk CSV invite')}</strong>
                  <p>
                    {ui(
                      'První sloupec: e-mail. Volitelný druhý sloupec: teacher/admin. Maximum 100 řádků.',
                      'First column: email. Optional second column: teacher/admin. Maximum 100 rows.',
                    )}
                  </p>
                  <div className={styles.rowActions}>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleBulkInviteFile}
                      disabled={busy}
                    />
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy || !bulkInviteCanSend}
                      onClick={sendBulkInvites}
                    >
                      {ui(
                        'Odeslat ' + bulkInviteEntries.length + ' pozvánek',
                        'Send ' + bulkInviteEntries.length + ' invitations',
                      )}
                    </button>
                  </div>

                  {bulkInviteEntries.length ? (
                    <>
                      <div className={styles.bulkInvitePreviewHeader}>
                        <strong>{ui('Náhled pozvánek', 'Invitation preview')}</strong>
                        <span className={styles.muted}>
                          {bulkInviteEntries.length} {ui('adres', 'addresses')}
                        </span>
                      </div>
                      <div
                        className={
                          styles.tableWrap
                          + (bulkInviteEntries.length > 10
                            ? ' ' + styles.bulkInviteScrollable
                            : '')
                        }
                      >
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>E-mail</th>
                              <th>{ui('Role', 'Role')}</th>
                              <th>{ui('Akce', 'Actions')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkInviteEntries.map((entry, index) => (
                              <tr key={index}>
                                <td>
                                  <input
                                    className={styles.inlineTableInput}
                                    type="email"
                                    aria-label={ui(
                                      'E-mail pozvánky ' + (index + 1),
                                      'Invitation email ' + (index + 1),
                                    )}
                                    value={entry.email}
                                    onChange={(event) => updateBulkInviteEntry(index, {
                                      email: event.target.value,
                                    })}
                                    disabled={busy}
                                  />
                                </td>
                                <td>
                                  <select
                                    className={styles.inlineTableSelect}
                                    aria-label={ui(
                                      'Role pozvánky ' + (index + 1),
                                      'Invitation role ' + (index + 1),
                                    )}
                                    value={entry.role}
                                    onChange={(event) => updateBulkInviteEntry(index, {
                                      role: event.target.value as 'teacher' | 'admin',
                                    })}
                                    disabled={busy}
                                  >
                                    <option value="teacher">{ui('Učitel', 'Teacher')}</option>
                                    <option value="admin">
                                      {ui('Administrátor', 'Administrator')}
                                    </option>
                                  </select>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className={styles.danger}
                                    disabled={busy}
                                    onClick={() => removeBulkInviteEntry(index)}
                                  >
                                    {ui('Odebrat', 'Remove')}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {bulkInviteHasInvalidEmail || bulkInviteHasDuplicateEmail ? (
                        <p className={styles.bulkInviteValidation} role="alert">
                          {bulkInviteHasDuplicateEmail
                            ? ui(
                              'Duplicitní e-mailové adresy je potřeba před odesláním upravit nebo odebrat.',
                              'Duplicate email addresses must be edited or removed before sending.',
                            )
                            : ui(
                              'Opravte neplatnou e-mailovou adresu před odesláním.',
                              'Fix the invalid email address before sending.',
                            )}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
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
                        <td>{roleLabel(member.role, english)}</td>
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
                                  {summary.role === 'owner' && !summary.isInternalTest ? (
                                    <button
                                      type="button"
                                      className={styles.secondary}
                                      disabled={busy}
                                      onClick={() => transferOwner(member.userId, member.email)}
                                    >
                                      {ui('Převést vlastnictví', 'Transfer ownership')}
                                    </button>
                                  ) : null}
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
                <div style={{ marginTop: 18 }}>
                  <strong>{ui('Čekající pozvánky', 'Pending invitations')}</strong>
                  <div
                    className={
                      styles.tableWrap
                      + (summary.invitations.length > 10
                        ? ' ' + styles.bulkInviteScrollable
                        : '')
                    }
                  >
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>E-mail</th>
                          <th>{ui('Role', 'Role')}</th>
                          <th>{ui('Platí do', 'Expires')}</th>
                          <th>{ui('Akce', 'Actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.invitations.map((invitation) => (
                          <tr key={invitation.id}>
                            <td>{invitation.email_normalized}</td>
                            <td>{roleLabel(invitation.role, english)}</td>
                            <td>
                              {new Date(invitation.expires_at).toLocaleDateString(
                                english ? 'en-GB' : 'cs-CZ',
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={busy}
                                onClick={() => revokeInvitation(
                                  invitation.id,
                                  invitation.email_normalized,
                                )}
                              >
                                {ui('Zrušit pozvánku', 'Cancel invitation')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </section>

            {summary.manager && summary.isInternalTest ? (
              <section className={styles.card + ' ' + styles.wide}>
                <h2>{ui('Testovací organizace', 'Test organization')}</h2>
                <p>
                  {ui(
                    'Tato organizace je záměrně mimo objednávky, Stripe, faktury, expiraci a převod vlastnictví. Všechny funkční entitlementy odpovídají tarifu Campus.',
                    'This organization is intentionally excluded from ordering, Stripe, invoices, expiry and ownership transfer. All functional entitlements match the Campus plan.',
                  )}
                </p>
              </section>
            ) : null}

            {summary.manager && !summary.isInternalTest ? (
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
