'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Package, ArrowLeft, LogIn, XCircle, CheckCircle2 } from 'lucide-react';
import { fetchApi, ApiClientError } from '../../../lib/api-client';

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  grandTotalCents: number;
  currency: string;
  trackingNumber?: string | null;
  courierPartner?: string | null;
};

type OrdersResponse = {
  items: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const statusLabels: Record<string, { label: string; tone: string }> = {
  PENDING_PAYMENT: { label: 'Payment Pending', tone: 'border-amber-300 bg-amber-50 text-amber-800' },
  PAID: { label: 'Order Confirmed', tone: 'border-[#B8860B]/40 bg-[#B8860B]/10 text-[#B8860B]' },
  PROCESSING: { label: 'In Preparation', tone: 'border-blue-300 bg-blue-50 text-blue-800' },
  PACKED: { label: 'Packed & Ready', tone: 'border-indigo-300 bg-indigo-50 text-indigo-800' },
  SHIPPED: { label: 'Dispatched via India Post', tone: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  IN_TRANSIT: { label: 'In Transit', tone: 'border-purple-300 bg-purple-50 text-purple-800' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', tone: 'border-amber-400 bg-amber-50 text-amber-900' },
  DELIVERED: { label: 'Delivered', tone: 'border-green-300 bg-green-50 text-green-800' },
  CANCELLED: { label: 'Cancelled', tone: 'border-stone-300 bg-stone-100 text-stone-700' },
};

const CANCELLABLE_STATUSES = ['PENDING', 'CONFIRMED', 'PENDING_PAYMENT', 'PROCESSING'];
const SHIPPED_STATUSES = ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    setIsUnauthorized(false);
    try {
      const data = await fetchApi<OrdersResponse>('/orders?page=1&limit=30');
      setOrders(data.items);
    } catch (err: any) {
      if (err instanceof ApiClientError && (err.status === 401 || err.code === 'UNAUTHORIZED')) {
        setIsUnauthorized(true);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to load orders');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders().catch(() => undefined);
  }, [loadOrders]);

  async function handleCancel(orderId: string) {
    const confirmCancel = window.confirm(
      'Are you sure you want to cancel this order? Any inventory reservations will be released immediately.',
    );
    if (!confirmCancel) return;

    setCancellingId(orderId);
    try {
      await fetchApi('/orders/' + orderId + '/cancel', {
        method: 'POST',
        body: JSON.stringify({ reason: 'Customer requested cancellation' }),
      });
      await loadOrders();
    } catch (err: any) {
      alert(err?.message || 'Unable to cancel this order.');
    } finally {
      setCancellingId(null);
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
          Sign in to view your orders
        </h1>
        <p className="mt-2 text-xs text-[#181513]/65 max-w-md mx-auto leading-relaxed">
          Please sign in to view your account details, track past artisanal shipments, or download tax invoices.
        </p>
        <div className="mt-8">
          <Link
            href="/account/login?redirect=/account/orders"
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
            Account Management
          </p>
          <h1 className="mt-3 font-serif text-4xl font-normal tracking-[-0.04em] text-[#181513] md:text-5xl">
            Your Orders
          </h1>
        </div>
        {!loading && (
          <span className="text-xs uppercase tracking-[0.16em] text-[#181513]/55">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'} placed
          </span>
        )}
      </header>

      {error && (
        <p role="alert" className="mt-6 border-l-2 border-red-700 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-8 space-y-4" aria-label="Loading orders">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xs border border-[#ECE7DE] bg-white p-4 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="py-24 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FAF7F2] border border-[#ECE7DE] text-[#181513]/40">
            <Package className="h-8 w-8" />
          </div>
          <p className="mt-6 font-serif text-3xl text-[#181513]">No orders placed yet</p>
          <p className="mt-2 text-xs text-[#181513]/60">
            Once you place an order, its fulfillment timeline and invoice will appear here.
          </p>
          <Link
            href="/shop"
            className="mt-6 inline-flex items-center gap-2 rounded-xs bg-[#183024] px-6 py-3 text-xs uppercase tracking-[0.18em] text-[#FAF7F2] transition hover:bg-[#254333]"
          >
            Explore the Collection
          </Link>
        </div>
      ) : (
        <div className="mt-8 divide-y divide-[#ECE7DE] border-y border-[#ECE7DE]">
          {orders.map((order) => {
            const statusConfig = statusLabels[order.status] ?? {
              label: order.status.replaceAll('_', ' '),
              tone: 'border-[#181513]/20 bg-white/40 text-[#181513]',
            };

            const isShipped = SHIPPED_STATUSES.includes(order.status);
            const isCancellable = CANCELLABLE_STATUSES.includes(order.status);

            return (
              <div
                key={order.id}
                className="group flex flex-col justify-between gap-4 py-6 sm:flex-row sm:items-center transition-colors hover:bg-white/40 px-2"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-serif text-2xl text-[#181513]">{order.orderNumber}</span>
                    <span
                      className={`border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded-xs ${statusConfig.tone}`}
                    >
                      {statusConfig.label}
                    </span>

                    {/* India Post Tracking Badge */}
                    {isShipped && (
                      <span className="inline-flex items-center gap-1 rounded-xs border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" />
                        India Post Speed Post
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#181513]/55">
                    Placed on{' '}
                    {new Date(order.createdAt).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4">
                  <span className="text-base font-medium tabular-nums text-[#181513]">
                    ₹{(order.grandTotalCents / 100).toLocaleString('en-IN')}
                  </span>

                  <div className="flex items-center gap-2">
                    <Link
                      href={'/orders/' + order.id}
                      className="inline-flex items-center gap-1 rounded-xs bg-[#183024] px-3.5 py-2 text-xs uppercase tracking-[0.16em] text-[#FAF7F2] transition hover:bg-[#254333]"
                    >
                      Track Order
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>

                    {/* Conditional Cancellation Button: strictly hidden once shipped */}
                    {isCancellable && (
                      <button
                        type="button"
                        onClick={() => handleCancel(order.id)}
                        disabled={cancellingId === order.id}
                        className="inline-flex items-center gap-1 rounded-xs border border-red-300 px-3 py-2 text-xs uppercase tracking-wider text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {cancellingId === order.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}

                    <Link
                      href={'/orders/' + order.id + '/confirmation'}
                      className="inline-flex items-center gap-1 rounded-xs border border-[#181513]/30 px-3 py-2 text-xs uppercase tracking-[0.16em] text-[#181513] transition hover:border-[#181513] hover:bg-[#181513] hover:text-[#FAF7F2]"
                    >
                      Receipt
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
