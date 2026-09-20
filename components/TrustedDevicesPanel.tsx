'use client';

import { useEffect, useState } from 'react';
import { useUiLocale } from '@/components/LocaleProvider';
import styles from './SubscriptionManagement.module.css';

type DeviceRow = {
  id: string;
  firstTrustedAt: string;
  lastSeenAt: string;
  current: boolean;
};

type DeviceSummary = {
  required: boolean;
  scope: 'none' | 'individual' | 'organization';
  organizationName?: string | null;
  activeCount: number;
  maxActive: number;
  newIn30Days: number;
  maxNewIn30Days: number;
  currentTrusted: boolean;
  devices: DeviceRow[];
};

type Registration = {
  required: boolean;
  trusted: boolean;
  code: string | null;
};

type Payload = {
  registration: Registration;
  summary: DeviceSummary;
};

function formatDate(value: string, english: boolean) {
  return new Intl.DateTimeFormat(english ? 'en-GB' : 'cs-CZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

export default function TrustedDevicesPanel() {
  const english = useUiLocale() === 'en';
  const ui = (cs: string, en: string) => english ? en : cs;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/auth/devices', { cache: 'no-store' });
    if (!response.ok) throw new Error('load_failed');
    const next = await response.json() as Payload;
    setPayload(next);
  }

  useEffect(() => {
    let active = true;
    void load()
      .catch(() => {
        if (active) setError(ui('Zařízení se nepodařilo načíst.', 'Devices could not be loaded.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function removeDevice(deviceId: string) {
    if (busyId) return;
    setBusyId(deviceId);
    setError('');
    try {
      const response = await fetch('/api/auth/devices', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ deviceId }),
      });
      const next = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(next.error ?? 'remove_failed');
      setPayload(next);
    } catch {
      setError(ui('Zařízení se nepodařilo odebrat.', 'The device could not be removed.'));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <section className={styles.devicesCard} aria-busy="true">
        <span className={styles.kicker}>{ui('Zařízení', 'Devices')}</span>
        <h2>{ui('Důvěryhodná zařízení', 'Trusted devices')}</h2>
        <p>{ui('Načítám správu zařízení…', 'Loading device management…')}</p>
      </section>
    );
  }

  if (!payload?.summary.required) return null;

  const blockedCode = payload.registration.code;
  const blockedMessage = blockedCode === 'trusted_device_limit_reached'
    ? ui(
      `Toto zařízení zatím není důvěryhodné, protože už je aktivní maximum ${payload.summary.maxActive} zařízení. Odeber některé jiné zařízení; aktuální se pak automaticky zkusí přidat.`,
      `This device is not trusted yet because the maximum of ${payload.summary.maxActive} devices is already active. Remove another device and the current one will be registered automatically.`,
    )
    : blockedCode === 'trusted_device_rotation_limit_reached'
      ? ui(
        `Toto zařízení zatím nelze přidat: za posledních 30 dní už bylo přidáno ${payload.summary.maxNewIn30Days} nových zařízení.`,
        `This device cannot be added yet: ${payload.summary.maxNewIn30Days} new devices have already been added in the last 30 days.`,
      )
      : blockedCode === 'trusted_device_cookie_missing'
        ? ui(
          'Aktuální zařízení se zatím nepodařilo bezpečně identifikovat. Obnov stránku.',
          'The current device could not be identified securely yet. Refresh the page.',
        )
        : null;

  return (
    <section className={styles.devicesCard}>
      <div className={styles.deviceHeading}>
        <div>
          <span className={styles.kicker}>{ui('Zabezpečení tarifu', 'Plan security')}</span>
          <h2>{ui('Důvěryhodná zařízení', 'Trusted devices')}</h2>
          <p>{payload.summary.scope === 'organization'
            ? ui(
              `Školní licence je určená pro jednoho konkrétního uživatele. Tento účet může používat nejvýše ${payload.summary.maxActive} důvěryhodných zařízení.`,
              `The school licence is intended for one specific user. This account can use up to ${payload.summary.maxActive} trusted devices.`,
            )
            : ui(
              `Teacher a Teacher Pro jsou určené pro jednoho učitele. Účet může používat nejvýše ${payload.summary.maxActive} důvěryhodných zařízení.`,
              `Teacher and Teacher Pro are intended for one teacher. The account can use up to ${payload.summary.maxActive} trusted devices.`,
            )}</p>
        </div>
      </div>

      <div className={styles.deviceStats}>
        <div>
          <span>{ui('Aktivní zařízení', 'Active devices')}</span>
          <strong>{payload.summary.activeCount}/{payload.summary.maxActive}</strong>
        </div>
        <div>
          <span>{ui('Nová zařízení za posledních 30 dní', 'New devices in the last 30 days')}</span>
          <strong>{payload.summary.newIn30Days}/{payload.summary.maxNewIn30Days}</strong>
        </div>
      </div>

      {blockedMessage ? <div className={styles.warning} role="status">{blockedMessage}</div> : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      <div className={styles.deviceList}>
        {payload.summary.devices.map((device, index) => (
          <div className={styles.deviceRow} key={device.id}>
            <div>
              <strong>{ui(`Zařízení ${index + 1}`, `Device ${index + 1}`)}</strong>
              {device.current ? <span className={styles.deviceBadge}>{ui('Toto zařízení', 'This device')}</span> : null}
              <p>
                {ui('Přidáno', 'Added')} {formatDate(device.firstTrustedAt, english)}
                {' · '}
                {ui('Naposledy použito', 'Last used')} {formatDate(device.lastSeenAt, english)}
              </p>
            </div>
            {!device.current ? (
              <button
                type="button"
                className={styles.ghost}
                disabled={Boolean(busyId)}
                onClick={() => void removeDevice(device.id)}
              >
                {busyId === device.id ? ui('Odebírám…', 'Removing…') : ui('Odebrat', 'Remove')}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <p className={styles.privacyNote}>{ui(
        'Neukládáme IP adresu, User-Agent, polohu ani fingerprint zařízení. Evidujeme jen hash náhodného tokenu a časy použití.',
        'We do not store IP address, User-Agent, location or a device fingerprint. We keep only a hash of a random token and usage timestamps.',
      )}</p>
    </section>
  );
}
