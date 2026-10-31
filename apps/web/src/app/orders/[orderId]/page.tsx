'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Package,
  Truck,
  MapPin,
  AlertCircle,
  XCircle,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import { fetchApi, ApiClientError } from '../../../lib/api-client';

type OrderItem = {
  id: string;
  productNameSnapshot: string;
  skuSnapshot?: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

type TrackingCheckpoint = {
  key: string;
  label: string;
  completed: boolean;
  active: boolean;
  timestamp?: string | null;
  description?: string | null;
  location?: string | null;
};

type TrackingData = {
  orderId: string;
  orderNumber: string;
  status: string;
  courierName?: string | null;
  courierPartner?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  createdAt: string;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  checkpoints: TrackingCheckpoint[];
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  courierPartner?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  createdAt: string;
  items: OrderItem[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  shippingCents: number;
  grandTotalCents: number;
  currency: string;
  shippingAddressSnapshot: Record<string, any>;
};

const CANCELLABLE_STATUSES = ['PENDING', 'CONFIRMED', 'PENDING_PAYMENT', 'PROCESSING'];
const SHIPPED_STATUSES = ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

export default function OrderTrackingPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;

  const [order, setOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [isUnauthenticated, setIsUnauthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelFeedback, setCancelFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = useCallback(
    async (isPolling = false) => {
      if (!orderId) return;
      if (!isPolling) setLoading(true);
      setError('');

      try {
        // Always attempt to fetch public tracking timeline first
        const trackingPromise = fetchApi<TrackingData>('/orders/' + orderId + '/track').catch(() => null);

        // Attempt authenticated order detail fetch
        const orderPromise = fetchApi<Order>('/orders/' + orderId).catch((err) => {
          if (err instanceof ApiClientError && (err.status === 401 || err.code === 'UNAUTHORIZED' || err.code === 'ORDER_FORBIDDEN')) {
            setIsUnauthenticated(true);
            return null;
          }
          return null;
        });

        const [trackingData, orderData] = await Promise.all([trackingPromise, orderPromise]);

        if (trackingData) {
          setTracking(trackingData);
        }
        if (orderData) {
          setOrder(orderData);
          setIsUnauthenticated(false);
        }

        if (!trackingData && !orderData) {
          setError('Could not locate tracking records for this order reference.');
        }
      } catch (err) {
        if (!isPolling) {
          setError(err instanceof Error ? err.message : 'Unable to load delivery tracking details.');
        }
      } finally {
        if (!isPolling) setLoading(false);
      }
    },
    [orderId],
  );

  useEffect(() => {
    loadData().catch(() => undefined);
  }, [loadData]);

  // Periodic polling for live shipment updates every 10 seconds
  useEffect(() => {
    const currentStatus = order?.status || tracking?.status;
    if (!currentStatus || ['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(currentStatus)) return;
    const interval = setInterval(() => {
      loadData(true).catch(() => undefined);
    }, 10000);
    return () => clearInterval(interval);
  }, [order?.status, tracking?.status, loadData]);

  async function handleCancelOrder() {
    if (!orderId) return;
    const confirmCancel = window.confirm(
      'Are you sure you wish to cancel this order? This action cannot be reversed.',
    );
    if (!confirmCancel) return;

    setCancelling(true);
    setCancelFeedback(null);
    try {
      await fetchApi('/orders/' + orderId + '/cancel', {
        method: 'POST',
        body: JSON.stringify({ reason: 'Customer requested cancellation via portal' }),
      });
      setCancelFeedback({
        type: 'success',
        message: 'Your order has been cancelled successfully. Any reservations have been released.',
      });
      await loadData();
    } catch (err: any) {
      setCancelFeedback({
        type: 'error',
        message: err?.message || 'Unable to cancel this order at this time.',
      });
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-20 md:py-28">
        <div className="animate-pulse space-y-8">
          <div className="h-6 w-36 bg-[#ECE8E0]" />
          <div className="h-14 w-80 bg-[#ECE8E0]" />
          <div className="h-64 rounded-xs border border-[#ECE7DE] bg-white p-6" />
        </div>
      </main>
    );
  }

  const effectiveStatus = order?.status || tracking?.status || 'CONFIRMED';
  const effectiveOrderNumber = order?.orderNumber || tracking?.orderNumber || orderId;
  const trackingNumber = tracking?.trackingNumber || order?.trackingNumber;
  const trackingUrl =
    tracking?.trackingUrl ||
    order?.trackingUrl ||
    (trackingNumber
      ? `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx`
      : null);
  const checkpoints = tracking?.checkpoints || [];
  const address = order?.shippingAddressSnapshot || {};

  const isShipped = SHIPPED_STATUSES.includes(effectiveStatus);
  const isCancellable = CANCELLABLE_STATUSES.includes(effectiveStatus) && Boolean(order);

  if (error && !tracking && !order) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 text-center md:py-32">
        <AlertCircle className="mx-auto h-12 w-12 text-[#B8860B]" />
        <h1 className="mt-4 font-serif text-3xl text-[#181513]">Tracking Unavailable</h1>
        <p className="mt-2 text-sm text-[#181513]/60">{error}</p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-2 border border-[#181513] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[#181513] hover:bg-[#181513] hover:text-[#FAF7F2] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Orders
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-10 md:px-10 md:pb-32 md:pt-14">
      {/* Navigation */}
      <div className="flex items-center justify-between border-b border-[#ECE7DE] pb-6">
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-[#181513]/60 hover:text-[#181513] transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          My Orders
        </Link>
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#B8860B]">
          Live Delivery Status
        </span>
      </div>

      {/* Guest / Unauthenticated Notice Banner */}
      {isUnauthenticated && (
        <div className="mt-6 rounded-sm border border-[#C8A265]/40 bg-[#FAF7F2] p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-[#B8860B] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-serif font-medium text-[#181513]">
                  Guest Order View
                </h4>
                <p className="text-xs text-[#181513]/70 mt-0.5">
                  Sign in to view your complete order history, line items, and invoice receipts, or track delivery progress below.
                </p>
              </div>
            </div>
            <Link
              href={`/account/login?redirect=/orders/${orderId}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-xs bg-[#183024] px-4 py-2 text-xs uppercase tracking-wider text-[#FAF7F2] hover:bg-[#254333] transition shrink-0"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </Link>
          </div>
        </div>
      )}

      {/* Cancel Feedback Alerts */}
      {cancelFeedback && (
        <div
          className={`mt-6 rounded-sm p-4 text-xs ${
            cancelFeedback.type === 'success'
              ? 'border border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border border-red-300 bg-red-50 text-red-800'
          }`}
        >
          {cancelFeedback.message}
        </div>
      )}

      {/* Header & Status Summary */}
      <div className="mt-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#181513]/50">Order Reference</p>
          <h1 className="mt-1 font-serif text-3xl font-normal tracking-[-0.03em] text-[#181513] md:text-5xl">
            {effectiveOrderNumber}
          </h1>
          {(order?.createdAt || tracking?.createdAt) && (
            <p className="mt-2 text-xs text-[#181513]/60">
              Placed on{' '}
              {new Date(order?.createdAt || tracking?.createdAt || '').toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          )}
        </div>

        {/* Courier / India Post Tracking Badge & Action */}
        <div className="flex flex-col items-start gap-3 rounded-sm border border-[#ECE7DE] bg-white p-4 shadow-xs md:items-end">
          <div className="text-left md:text-right">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B8860B]">
              Fulfillment Partner
            </span>
            <p className="text-sm font-medium text-[#181513]">
              India Post Speed Post
            </p>
            {trackingNumber ? (
              <p className="text-xs font-mono text-[#181513]/70 mt-0.5">
                Consignment: <strong className="text-[#183024]">{trackingNumber}</strong>
              </p>
            ) : (
              <p className="text-xs text-[#181513]/50 mt-0.5">Consignment awaiting dispatch</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {trackingNumber && trackingUrl && (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xs bg-[#183024] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#FAF7F2] transition hover:bg-[#254333]"
              >
                Track on India Post
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            {/* Conditional Cancellation Button: strictly hidden once shipped */}
            {isCancellable && (
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 rounded-xs border border-red-300 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                {cancelling ? 'Cancelling…' : 'Cancel Order'}
              </button>
            )}

            {isShipped && (
              <span className="inline-flex items-center gap-1 rounded-xs bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Shipped via India Post
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Step-by-Step Delivery Timeline */}
      <section className="mt-12 rounded-sm border border-[#ECE7DE] bg-white p-6 md:p-10 shadow-xs">
        <h2 className="font-serif text-2xl text-[#181513]">Shipment Journey</h2>
        <p className="mt-1 text-xs text-[#181513]/60">
          Real-time milestones from our traditional Nilgiris processing hub to your doorstep.
        </p>

        <div className="relative mt-10">
          {/* Vertical Connecting Line */}
          <div className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-[#ECE7DE]" />

          <div className="space-y-8">
            {checkpoints.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#181513]/50">
                Tracking checkpoints will update as your consignment moves through India Post hubs.
              </div>
            ) : (
              checkpoints.map((cp) => {
                const isPastOrCurrent = cp.completed || cp.active;

                return (
                  <div key={cp.key} className="relative flex items-start gap-5">
                    {/* Indicator Dot */}
                    <div
                      className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        cp.active
                          ? 'border-[#B8860B] bg-[#B8860B] text-white shadow-xs'
                          : cp.completed
                          ? 'border-[#183024] bg-[#183024] text-white'
                          : 'border-[#ECE7DE] bg-[#FAF7F2] text-[#181513]/30'
                      }`}
                    >
                      {cp.completed ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : cp.active ? (
                        <Truck className="h-4 w-4 animate-bounce" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </div>

                    {/* Checkpoint Details */}
                    <div className="flex-grow pt-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3
                          className={`text-sm uppercase tracking-[0.14em] font-medium ${
                            isPastOrCurrent ? 'text-[#181513]' : 'text-[#181513]/40'
                          }`}
                        >
                          {cp.label}
                        </h3>
                        {cp.timestamp && (
                          <span className="text-xs text-[#181513]/50">
                            {new Date(cp.timestamp).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      {cp.description && (
                        <p className="mt-1 text-xs text-[#181513]/70 leading-relaxed">
                          {cp.description}
                        </p>
                      )}
                      {cp.location && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-[#A66B18]">
                          <MapPin className="h-3 w-3" />
                          {cp.location}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Authenticated Order Items & Delivery Destination Grid */}
      {order && (
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {/* Destination Address */}
          <div className="rounded-sm border border-[#ECE7DE] bg-white p-6 md:p-8 shadow-xs">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B8860B]">
              Delivery Destination
            </p>
            <div className="mt-4 text-xs leading-relaxed text-[#181513]/80 space-y-1">
              <p className="text-sm font-medium text-[#181513]">{address.fullName || 'Patron'}</p>
              <p>{address.addressLine1}</p>
              {address.addressLine2 && <p>{address.addressLine2}</p>}
              <p>
                {address.city}, {address.state} — <strong className="font-mono">{address.postalCode}</strong>
              </p>
              <p className="pt-2 text-[#181513]/60">Contact: {address.phone || '—'}</p>
            </div>
          </div>

          {/* Order Items */}
          <div className="rounded-sm border border-[#ECE7DE] bg-white p-6 md:p-8 shadow-xs">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B8860B]">
              Items in Shipment
            </p>
            <div className="mt-4 divide-y divide-[#ECE7DE]">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3 text-xs">
                  <div>
                    <p className="font-medium text-[#181513]">{item.productNameSnapshot}</p>
                    <p className="text-[#181513]/50">Qty: {item.quantity}</p>
                  </div>
                  <span className="font-mono text-[#181513]">
                    ₹{((item.lineTotalCents || 0) / 100).toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#181513]">
                <span>Grand Total</span>
                <span className="font-mono text-sm">
                  ₹{(order.grandTotalCents / 100).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
