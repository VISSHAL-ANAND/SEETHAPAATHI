'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, ArrowUpRight, LogIn } from 'lucide-react';
import { fetchApi, ApiClientError } from '../../../lib/api-client';

type Notification = {
  id: string;
  orderId: string | null;
  eventType: string;
  subject: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attemptCount: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
};

type Preferences = {
  orderUpdates: boolean;
  shipmentUpdates: boolean;
  returnUpdates: boolean;
  refundUpdates: boolean;
};

const labels: Record<string, string> = {
  NOTIFY_ORDER_STATUS: 'Order Update',
  NOTIFY_SHIPMENT_STATUS: 'Shipment & Tracking',
  NOTIFY_RETURN_STATUS: 'Return Status',
  NOTIFY_REFUND_STATUS: 'Refund Confirmation',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [error, setError] = useState('');
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingPreference, setSavingPreference] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    setIsUnauthorized(false);
    Promise.all([
      fetchApi<Notification[]>('/users/me/notifications'),
      fetchApi<Preferences>('/users/me/notifications/preferences'),
    ])
      .then(([items, prefs]) => {
        setNotifications(items);
        setPreferences(prefs);
      })
      .catch((err) => {
        if (err instanceof ApiClientError && (err.status === 401 || err.code === 'UNAUTHORIZED')) {
          setIsUnauthorized(true);
        } else {
          setError(err instanceof Error ? err.message : 'Unable to load notifications');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function togglePreference(key: keyof Preferences, value: boolean) {
    setSavingPreference(key);
    setError('');
    try {
      const next = await fetchApi<Preferences>('/users/me/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value }),
      });
      setPreferences(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update notification preferences');
    } finally {
      setSavingPreference(null);
    }
  }

  // Graceful Unauthenticated Empty State
  if (isUnauthorized) {
    return (
      <main className="editorial-page mx-auto max-w-[1280px] px-6 py-24 text-center md:py-32">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FAF7F2] border border-[#ECE7DE] text-[#183024]">
          <LogIn className="h-7 w-7" />
        </div>
        <h1 className="mt-6 font-serif text-3xl font-normal text-[#181513]">
          Please sign in to view your account details
        </h1>
        <p className="mt-2 text-xs text-[#181513]/65 max-w-md mx-auto leading-relaxed">
          Sign in to access your dispatch notifications, order communications, and manage email channel preferences.
        </p>
        <div className="mt-8">
          <Link
            href="/account/login?redirect=/account/notifications"
            className="inline-flex items-center gap-2 rounded-xs bg-[#183024] px-7 py-3.5 text-xs uppercase tracking-[0.18em] text-[#FAF7F2] transition hover:bg-[#254333]"
          >
            Sign In to Your Account
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="editorial-page mx-auto max-w-[1280px] px-6 pb-24 pt-10 md:px-10 md:pb-32 md:pt-14">
      <div className="grid gap-12 lg:grid-cols-[1fr_340px]">
        {/* Activity feed */}
        <section>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#B8860B]">
            Communication Log
          </p>
          <h1 className="mt-3 font-serif text-4xl font-normal tracking-[-0.04em] text-[#181513] md:text-5xl">
            Transactional Updates
          </h1>
          <p className="mt-3 max-w-xl text-xs leading-relaxed text-[#181513]/65">
            System dispatch notices, order verifications, and delivery events recorded for your account.
          </p>

          {error && (
            <p role="alert" className="mt-6 border-l-2 border-red-700 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </p>
          )}

          {loading ? (
            <div className="mt-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-xs border border-[#ECE7DE] bg-white p-4 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="mt-8 divide-y divide-[#ECE7DE] border-y border-[#ECE7DE]">
              {notifications.length === 0 ? (
                <div className="py-16 text-center text-xs text-[#181513]/55">
                  No notification history recorded yet.
                </div>
              ) : (
                notifications.map((item) => (
                  <article key={item.id} className="grid gap-4 py-6 sm:grid-cols-[1fr_auto]">
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#B8860B]">
                        {labels[item.eventType] ?? 'Account update'}
                      </span>
                      <h2 className="mt-1 text-sm font-medium text-[#181513]">{item.subject}</h2>
                      {item.orderId && (
                        <Link
                          href={`/orders/${item.orderId}/confirmation`}
                          className="mt-2 inline-flex items-center gap-1 text-xs text-[#A66B18] underline underline-offset-4 hover:text-[#181513]"
                        >
                          View Order Details <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      )}
                      {item.lastError && item.status === 'FAILED' && (
                        <p className="mt-2 text-xs text-red-700">Delivery attempt is being retried automatically.</p>
                      )}
                    </div>
                    <div className="text-left text-xs text-[#181513]/50 sm:text-right">
                      <span
                        className={`inline-block border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-xs ${
                          item.status === 'SENT'
                            ? 'border-green-300 bg-green-50 text-green-800'
                            : item.status === 'FAILED'
                            ? 'border-red-300 bg-red-50 text-red-800'
                            : 'border-[#181513]/20 bg-white/40 text-[#181513]'
                        }`}
                      >
                        {item.status}
                      </span>
                      <p className="mt-1.5">{new Date(item.createdAt).toLocaleDateString('en-IN')}</p>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </section>

        {/* Preferences Aside */}
        <aside className="border-t border-[#ECE7DE] pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#181513]/60">
            Email Notification Channels
          </p>
          <div className="mt-6 space-y-4 text-xs">
            {preferences &&
              Object.entries(preferences).map(([key, enabled]) => (
                <div key={key} className="flex items-center justify-between gap-6 border-b border-[#ECE7DE] pb-3">
                  <span className="text-[#181513] font-medium">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={savingPreference === key}
                    onClick={() => togglePreference(key as keyof Preferences, !enabled)}
                    className={`border px-3 py-1 text-[11px] uppercase tracking-wider rounded-xs transition ${
                      enabled
                        ? 'border-[#183024] bg-[#183024] text-[#FAF7F2]'
                        : 'border-[#ECE7DE] bg-white text-[#181513]/60 hover:border-[#181513]'
                    } disabled:opacity-40`}
                  >
                    {savingPreference === key ? 'Updating…' : enabled ? 'Active' : 'Muted'}
                  </button>
                </div>
              ))}
          </div>
          <p className="mt-6 text-[11px] leading-relaxed text-[#181513]/50">
            Channel preferences configure delivery of automated email notices. Critical transactional events and invoices remain permanently accessible in your account.
          </p>
        </aside>
      </div>
    </main>
  );
}
