'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, RotateCcw, CheckCircle2, LogIn } from 'lucide-react';
import { fetchApi, ApiClientError } from '../../../lib/api-client';

type ReturnItem = {
  id: string;
  orderItemId: string;
  quantity: number;
  condition?: 'SEALED_INTACT' | 'DAMAGED_OPENED' | null;
};
type Refund = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  reason: string;
  gatewayRefundId?: string | null;
  processedAt?: string | null;
};
type ReturnRecord = {
  id: string;
  returnNumber: string;
  orderId: string;
  status: string;
  reason: string;
  notes?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  items: ReturnItem[];
  refunds: Refund[];
};

const lifecycle = [
  { key: 'REQUESTED', label: 'Requested' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'PICKED_UP', label: 'Picked Up' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'INSPECTED', label: 'Inspected' },
  { key: 'REFUND_ELIGIBLE', label: 'Eligible for Refund' },
  { key: 'COMPLETED', label: 'Completed' },
];

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [error, setError] = useState('');
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    setIsUnauthorized(false);
    fetchApi<ReturnRecord[]>('/returns')
      .then(setReturns)
      .catch((err) => {
        if (err instanceof ApiClientError && (err.status === 401 || err.code === 'UNAUTHORIZED')) {
          setIsUnauthorized(true);
        } else {
          setError(err instanceof Error ? err.message : 'Unable to load returns');
        }
      })
      .finally(() => setLoading(false));
  }, []);

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
          Sign in to view your return requests, track reverse pickup milestones, or check refund disbursement status.
        </p>
        <div className="mt-8">
          <Link
            href="/account/login?redirect=/account/returns"
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
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[#ECE7DE] pb-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#B8860B]">
            Customer Support
          </p>
          <h1 className="mt-3 font-serif text-4xl font-normal tracking-[-0.04em] text-[#181513] md:text-5xl">
            Returns & Refunds
          </h1>
        </div>
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-[#A66B18] hover:text-[#181513]"
        >
          View Orders
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {error && (
        <p role="alert" className="mt-6 border-l-2 border-red-700 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-8 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-44 rounded-xs border border-[#ECE7DE] bg-white p-4 animate-pulse" />
          ))}
        </div>
      ) : returns.length === 0 ? (
        <div className="py-24 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FAF7F2] border border-[#ECE7DE] text-[#181513]/40">
            <RotateCcw className="h-8 w-8" />
          </div>
          <p className="mt-6 font-serif text-3xl text-[#181513]">No active return requests</p>
          <p className="mt-2 text-xs text-[#181513]/60">
            Returns can be initiated from your delivered orders within the eligible return period.
          </p>
          <Link
            href="/account/orders"
            className="mt-6 inline-flex items-center gap-2 rounded-xs bg-[#183024] px-6 py-3 text-xs uppercase tracking-[0.18em] text-[#FAF7F2] transition hover:bg-[#254333]"
          >
            Review Delivered Orders
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {returns.map((ret) => {
            const currentIdx = lifecycle.findIndex((s) => s.key === ret.status);

            return (
              <article key={ret.id} className="rounded-sm border border-[#ECE7DE] bg-white p-6 md:p-8 shadow-xs">
                <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-4">
                      <div>
                        <h2 className="font-serif text-3xl text-[#181513]">{ret.returnNumber}</h2>
                        <p className="mt-1 text-xs text-[#181513]/60">
                          Reason: <span className="font-medium text-[#181513]">{ret.reason.replaceAll('_', ' ')}</span> · Status:{' '}
                          <span className="font-medium text-[#B8860B]">{ret.status.replaceAll('_', ' ')}</span>
                        </p>
                      </div>
                      <Link
                        href={'/orders/' + ret.orderId + '/confirmation'}
                        className="text-xs uppercase tracking-[0.15em] text-[#A66B18] underline underline-offset-4 hover:text-[#181513]"
                      >
                        View Order Details →
                      </Link>
                    </div>

                    {/* Responsive Lifecycle Timeline */}
                    <div className="mt-8 border-y border-[#ECE7DE] py-6">
                      <div className="flex flex-wrap gap-2 sm:gap-4">
                        {lifecycle.map((stage, idx) => {
                          const isDone = idx <= currentIdx;
                          const isCurrent = idx === currentIdx;

                          return (
                            <div
                              key={stage.key}
                              className={`flex items-center gap-2 text-xs ${
                                isCurrent
                                  ? 'font-semibold text-[#B8860B]'
                                  : isDone
                                  ? 'text-[#181513]'
                                  : 'text-[#181513]/30'
                              }`}
                            >
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  isCurrent ? 'bg-[#B8860B]' : isDone ? 'bg-[#183024]' : 'bg-[#181513]/25'
                                }`}
                              />
                              <span>{stage.label}</span>
                              {idx < lifecycle.length - 1 && (
                                <span className="text-[#181513]/20">→</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Returned Items */}
                    <div className="mt-6 space-y-3">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#181513]/60">
                        Returned Items
                      </p>
                      <div className="divide-y divide-[#ECE7DE]">
                        {ret.items.map((item) => (
                          <div key={item.id} className="flex justify-between py-2 text-xs">
                            <span className="text-[#181513]">Quantity: {item.quantity}</span>
                            <span className="text-[#181513]/60">
                              Condition:{' '}
                              {item.condition ? item.condition.replaceAll('_', ' ') : 'Inspection Pending'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Aside details */}
                  <aside className="space-y-6 border-t border-[#ECE7DE] pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[#181513]/55">
                        Date Requested
                      </p>
                      <p className="mt-1 text-xs text-[#181513]">
                        {new Date(ret.createdAt).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>

                    {ret.resolvedAt && (
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-[#181513]/55">
                          Date Resolved
                        </p>
                        <p className="mt-1 text-xs text-[#181513]">
                          {new Date(ret.resolvedAt).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    )}

                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-[#181513]/55">
                        Refund Status
                      </p>
                      {ret.refunds.length === 0 ? (
                        <p className="mt-1 text-xs text-[#181513]/50">
                          No refund processed yet.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-3">
                          {ret.refunds.map((refund) => (
                            <div key={refund.id} className="rounded-xs border border-[#ECE7DE] bg-[#FAF7F2] p-3">
                              <p className="font-serif text-xl text-[#181513]">
                                ₹{(refund.amountCents / 100).toLocaleString('en-IN')}
                              </p>
                              <p className="mt-1 text-xs text-[#181513]/60">
                                {refund.status} · {refund.reason.replaceAll('_', ' ')}
                              </p>
                              {refund.gatewayRefundId && (
                                <p className="mt-1 font-mono text-[11px] text-[#181513]/40">
                                  Ref: {refund.gatewayRefundId}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </aside>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
