import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import HeaderMobileNav from '@/components/HeaderMobileNav';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';
import SiteFooter from '@/components/SiteFooter';
import SyllonautMark from '@/components/SyllonautMark';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import { isReferralsEnabled } from '@/lib/referral-program';
import { REFERRAL_PROGRAM } from '@/lib/referral-program-config';
import { createClient } from '@/lib/supabase/server';
import landing from '@/components/LandingPage.module.css';
import styles from '@/app/gdpr/GdprPage.module.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  return {
    title: english ? 'Referral rules — Syllonaut' : 'Pravidla doporučování — Syllonaut',
    description: english
      ? 'Rules of the Syllonaut referral program: who takes part, when a reward is granted and its limits.'
      : 'Pravidla doporučovacího programu Syllonaut: kdo se může zapojit, kdy vzniká odměna a jaké má limity.',
    alternates: {
      canonical: `/${locale}/referral`,
      languages: { cs: '/cs/referral', en: '/en/referral', 'x-default': '/en/referral' },
    },
    robots: { index: true, follow: true },
  };
}

type RulesSection = { title: string; items: string[] };

function rules(english: boolean): RulesSection[] {
  const p = REFERRAL_PROGRAM;
  if (english) {
    return [
      {
        title: 'Who can take part',
        items: [
          'Teachers with an individual account (Free, Teacher or Teacher Pro) get a personal referral link on the Subscription page.',
          'Administrators and members of a school or organization account do not take part and have no referral link.',
          'You share the link yourself. Syllonaut sends no invitations and does not ask for your colleagues’ email addresses.',
        ],
      },
      {
        title: 'How a referral is assigned',
        items: [
          'A colleague signs up through your link, or enters your code in the optional "Referral code" field during registration.',
          'Each new account can have at most one referrer, and it cannot be changed after registration.',
          'The code is taken only from the link or the registration form; Syllonaut stores no cookie or other browser data for it.',
        ],
      },
      {
        title: 'When you get a reward',
        items: [
          `Within ${p.qualifyWindowDays} days of registering, the invited colleague must either subscribe to a paid individual plan (Teacher or Teacher Pro), or verify their email and teach an ended live lesson in which at least ${p.minSubmittingParticipants} different participants submitted at least one individual answer.`,
          'For the live lesson route, the invited colleague must not share any device with you (for example the same browser used for both accounts).',
          'Only the referrer is rewarded; the invited colleague receives nothing.',
          'Referrals are evaluated automatically about once an hour. If the conditions are not met within the deadline, the referral expires without a reward.',
        ],
      },
      {
        title: 'The reward',
        items: [
          `${p.rewardUnits} bonus AI lesson generations for each qualified colleague, valid for ${p.rewardValidMonths} months from the day they are credited.`,
          'Bonus lessons are used only after the monthly lesson limit of your plan runs out, starting with those that expire first. A failed generation does not use a bonus lesson.',
          'Bonus lessons are not a discount, cannot be exchanged for money and cannot be transferred to another account.',
          'Bonus lessons can be used only while your account is individual. As a member of a school or organization they stay frozen; their validity is not extended.',
          'Other limits of your plan, including the Free plan limits per device, still apply.',
        ],
      },
      {
        title: 'Limits',
        items: [
          `At most ${p.monthlyCap} rewards per calendar month (UTC) and at most ${p.totalCap} rewards in total.`,
          'A referral that qualifies after a limit has been reached is recorded without a reward; it is not carried over to a later month.',
        ],
      },
      {
        title: 'Misuse',
        items: [
          'No reward is granted when you refer your own account, when the colleague registers on a device you use, when the email addresses are the same (including variants of one Gmail address), or when the colleague registers with a disposable email address.',
          'Syllonaut may withhold or remove a reward obtained by circumventing these rules.',
        ],
      },
      {
        title: 'Personal data',
        items: [
          'To run the program, Syllonaut records which account referred which, and a one-way hash of the device identifier used to prevent misuse. You never see the names or email addresses of the colleagues you referred, only the numbers.',
          `The link between the accounts is deleted at the latest ${p.retentionMonths} months after the referral closed, or after the reward expired; details are in the Privacy Notice.`,
        ],
      },
      {
        title: 'Changes and end of the program',
        items: [
          'Syllonaut may change or end the program. Bonus lessons already credited remain valid until they expire.',
        ],
      },
    ];
  }

  return [
    {
      title: 'Kdo se může zapojit',
      items: [
        'Učitelé s individuálním účtem (Free, Teacher nebo Teacher Pro) mají na stránce Předplatné osobní odkaz na doporučení.',
        'Administrátoři a členové školního nebo organizačního účtu se programu neúčastní a odkaz nemají.',
        'Odkaz sdílíte sami. Syllonaut žádné pozvánky nerozesílá a e-mailové adresy kolegů nežádá.',
      ],
    },
    {
      title: 'Jak se doporučení přiřadí',
      items: [
        'Kolega se zaregistruje přes váš odkaz, nebo při registraci zadá váš kód do nepovinného pole „Kód doporučení“.',
        'Každý nový účet může mít nejvýš jednoho doporučujícího a po registraci ho nelze změnit.',
        'Kód se bere jen z odkazu nebo z registračního formuláře; Syllonaut kvůli němu neukládá žádnou cookie ani jiná data v prohlížeči.',
      ],
    },
    {
      title: 'Kdy vzniká nárok na odměnu',
      items: [
        `Pozvaný kolega musí do ${p.qualifyWindowDays} dnů od registrace buď přejít na placený individuální tarif (Teacher nebo Teacher Pro), nebo mít ověřený e-mail a odučit ukončenou živou hodinu, ve které aspoň ${p.minSubmittingParticipants} různých účastníků odeslalo aspoň jednu individuální odpověď.`,
        'U cesty přes živou hodinu s vámi pozvaný kolega nesmí sdílet žádné zařízení (například stejný prohlížeč pro oba účty).',
        'Odměnu dostává jen doporučující; pozvaný kolega nedostává nic.',
        'Doporučení se vyhodnocují automaticky zhruba jednou za hodinu. Když podmínky nejsou splněné do termínu, doporučení propadne bez odměny.',
      ],
    },
    {
      title: 'Odměna',
      items: [
        `Za každého kvalifikovaného kolegu ${p.rewardUnits} bonusová generování AI lekce s platností ${p.rewardValidMonths} měsíců ode dne připsání.`,
        'Bonusové lekce se čerpají až po vyčerpání měsíčního limitu lekcí vašeho tarifu, nejdřív ty s nejbližší expirací. Neúspěšné generování bonusovou lekci nespotřebuje.',
        'Bonusové lekce nejsou sleva, nelze je směnit za peníze ani převést na jiný účet.',
        'Bonusové lekce lze čerpat jen s individuálním účtem. Po dobu členství ve škole nebo organizaci zůstávají zmrazené; jejich platnost se neprodlužuje.',
        'Ostatní limity tarifu, včetně limitů Free tarifu na jedno zařízení, platí dál.',
      ],
    },
    {
      title: 'Limity',
      items: [
        `Nejvýš ${p.monthlyCap} odměny za kalendářní měsíc (UTC) a nejvýš ${p.totalCap} odměn celkem.`,
        'Doporučení, které splní podmínky po dosažení limitu, se zaznamená bez odměny; do dalšího měsíce se nepřevádí.',
      ],
    },
    {
      title: 'Zneužití',
      items: [
        'Odměna nevzniká, když doporučíte vlastní účet, když se kolega registruje na zařízení, které používáte vy, když se shodují e-mailové adresy (včetně variant jedné adresy Gmail) nebo když se kolega registruje jednorázovou e-mailovou adresou.',
        'Syllonaut může odměnu získanou obcházením těchto pravidel nepřipsat nebo odebrat.',
      ],
    },
    {
      title: 'Osobní údaje',
      items: [
        'Kvůli programu Syllonaut eviduje, který účet doporučil který, a jednosměrný hash identifikátoru zařízení kvůli ochraně proti zneužití. Jména ani e-maily doporučených kolegů neuvidíte, jen počty.',
        `Vazbu mezi účty smažeme nejpozději ${p.retentionMonths} měsíců po uzavření doporučení, u odměny po skončení její platnosti; podrobnosti jsou v informacích o ochraně osobních údajů.`,
      ],
    },
    {
      title: 'Změny a ukončení programu',
      items: [
        'Syllonaut může program změnit nebo ukončit. Už připsané bonusové lekce platí do své expirace.',
      ],
    },
  ];
}

export default async function ReferralRulesPage() {
  if (!isReferralsEnabled()) notFound();

  const requestHeaders = await headers();
  const locale = normalizeUiLocale(requestHeaders.get(LOCALE_REQUEST_HEADER)) ?? 'cs';
  const english = locale === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
  const accountUser = userId ? {
    id: userId,
    email: typeof claimsData?.claims?.email === 'string' ? claimsData.claims.email : undefined,
    user_metadata: claimsData?.claims?.user_metadata && typeof claimsData.claims.user_metadata === 'object'
      ? claimsData.claims.user_metadata as Record<string, unknown>
      : {},
  } : null;

  return (
    <main className={landing.page}>
      <header className={landing.header}>
        <Link href={`/${locale}`} className={landing.brand} aria-label={ui('Syllonaut – domů', 'Syllonaut – home')}>
          <SyllonautMark /><span>Syllonaut</span><span className={landing.beta}>BETA</span>
        </Link>
        <nav className={landing.nav} aria-label={ui('Hlavní navigace', 'Main navigation')}>
          <Link href={`/${locale}#jak-to-funguje`}>{ui('Jak to funguje', 'How it works')}</Link>
          <Link href={`/${locale}/pricing`}>{ui('Ceník', 'Pricing')}</Link>
          {accountUser ? <Link href="/lessons">{ui('Moje lekce', 'My lessons')}</Link> : null}
        </nav>
        <div className={landing.headerActions}>
          <LocaleSwitcher />
          {accountUser ? <PublicHeaderAccountMenu user={accountUser} /> : null}
          <Link href="/new" className={landing.headerCta} style={{ whiteSpace: 'nowrap' }}>{ui('Připravit hodinu', 'Prepare a lesson')}</Link>
          <HeaderMobileNav signedIn={Boolean(accountUser)} current="home" />
        </div>
      </header>

      <article className={styles.page}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>{ui('Doporučovací program', 'Referral program')}</span>
          <h1>{ui('Pravidla doporučování', 'Referral rules')}</h1>
          <p>{ui(
            'Doporučte Syllonaut kolegům a za každého, kdo ho začne opravdu používat, získáte bonusové lekce.',
            'Recommend Syllonaut to colleagues and get bonus lessons for everyone who actually starts using it.',
          )}</p>
        </div>

        {rules(english).map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}

        <section>
          <h2>{ui('Související dokumenty', 'Related documents')}</h2>
          <p>
            <Link href="/subscription#doporuceni">{ui('Váš odkaz na doporučení', 'Your referral link')}</Link>
            {' · '}
            <Link href={`/${locale}/terms`}>{ui('Obchodní podmínky', 'Terms of Service')}</Link>
            {' · '}
            <Link href={`/${locale}/gdpr`}>{ui('Ochrana osobních údajů (GDPR)', 'Privacy Notice')}</Link>
          </p>
        </section>
      </article>
      <SiteFooter />
    </main>
  );
}
