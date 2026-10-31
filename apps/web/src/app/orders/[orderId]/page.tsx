'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Package,
  Truck,
  MapPin,
  ShieldCheck,
  AlertCircle,
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

export default function OrderTrackingPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const orderId = params?.orderId;

  const [order, setOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(
    async (isPolling = false) => {
      if (!orderId) return;
      if (!isPolling) setLoading(true);
      setError('');
      try {
        const [orderData, trackingData] = await Promise.all([
          fetchApi<Order>('/orders/' + orderId),
          fetchApi<TrackingData>('/orders/' + orderId + '/track').catch(() => null),
        ]);
        setOrder(orderData);
        setTracking(trackingData);
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'UNAUTHORIZED') {
          router.replace('/account/login?next=' + encodeURIComponent('/orders/' + orderId));
          return;
        }
        if (!isPolling) {
          setError(err instanceof Error ? err.message : 'Unable to load delivery tracking details.');
        }
      } finally {
        if (!isPolling) setLoading(false);
      }
    },
    [orderId, router],
  );

  useEffect(() => {
    loadData().catch(() => undefined);
  }, [loadData]);

  // Periodic polling for live shipment updates every 8 seconds
  useEffect(() => {
    if (!order || ['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status)) return;
    const interval = setInterval(() => {
      loadData(true).catch(() => undefined);
    }, 8000);
    return () => clearInterval(interval);
  }, [order?.status, loadData]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-20 md:py-28">
        <div className="animate-pulse space-y-8">
          <div className="h-6 w-36 bg-[#ECE8E0]" />
          <div className="h-14 w-80 bg-[#ECE8E0]" />
          <div className="h-64 rounded-xs border border-[#E3DFD7] bg-[#ECE8E0]/40" />
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 text-center md:py-32">
        <AlertCircle className="mx-auto h-12 w-12 text-[#B8860B]" />
        <h1 className="mt-4 font-serif text-3xl text-[#181513]">Tracking Unavailable</h1>
        <p className="mt-2 text-sm text-[#181513]/60">{error || 'Could not locate tracking information for this order.'}</p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-2 border border-[#181513] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[#181513] hover:bg-[#181513] hover:text-[#F7F5F0] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Orders
          </Link>
        </div>
      </main>
    );
  }

  const checkpoints = tracking?.checkpoints || [];
  const address = order.shippingAddressSnapshot || {};

  return (
    <main className="mx-auto max-w-5xl px-6 pb-24 pt-10 md:px-10 md:pb-32 md:pt-14">
      {/* Navigation */}
      <div className="flex items-center justify-between border-b border-[#E3DFD7] pb-6">
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

      {/* Header */}
      <div className="mt-8 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#181513]/50">Order Ref</p>
          <h1 className="mt-1 font-serif text-4xl font-normal tracking-[-0.03em] text-[#181513] md:text-5xl">
            {order.orderNumber}
          </h1>
          <p className="mt-2 text-xs text-[#181513]/60">
            Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Courier / AWB Card */}
        {tracking?.trackingNumber && (
          <div className="flex flex-col items-start gap-3 rounded-xs border border-[#E3DFD7] bg-white/50 p-4 md:items-end backdrop-blur-xs">
            <div className="text-left md:text-right">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B8860B]">
                Delivery Partner
              </span>
              <p className="text-sm font-medium text-[#181513]">
                India Post Speed Post · Consignment: {tracking.trackingNumber}
              </p>
            </div>
            <a
              href={tracking.trackingUrl || 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#181513] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#F7F5F0] transition hover:bg-[#2E2824]"
            >
              Track on India Post
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* Step-by-Step Delivery Timeline */}
      <section className="mt-12 border border-[#E3DFD7] bg-white/40 p-6 md:p-10 backdrop-blur-xs">
        <h2 className="font-serif text-2xl text-[#181513]">Shipment Journey</h2>
        <p className="mt-1 text-xs text-[#181513]/60">
          Real-time milestones from our traditional milling atelier to your doorstep.
        </p>

        <div className="relative mt-10">
          {/* Vertical Connecting Line */}
          <div className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-[#E3DFD7]" />

          <div className="space-y-8">
            {checkpoints.map((cp, idx) => {
              const isPastOrCurrent = cp.completed || cp.active;

              return (
                <div key={cp.key} className="relative flex items-start gap-5">
                  {/* Indicator Dot */}
                  <div
                    className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      cp.active
                        ? 'border-[#B8860B] bg-[#B8860B] text-white shadow-xs'
                        : cp.completed
                        ? 'border-[#181513] bg-[#181513] text-white'
                        : 'border-[#E3DFD7] bg-[#F7F5F0] text-[#181513]/30'
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
            })}
          </div>
        </div>
      </section>

      {/* Delivery Destination & Order Summary Grid */}
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        {/* Destination Address */}
        <div className="border border-[#E3DFD7] bg-white/40 p-6 md:p-8 backdrop-blur-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B8860B]">
            Delivery Destination
          </p>
          <div className="mt-4 text-xs leading-relaxed text-[#181513]/80 space-y-1">
            <p className="text-sm font-medium text-[#181513]">{address.fullName || 'Patron'}</p>
            <p>{address.addressLine1}</p>
            {address.addressLine2 && <p>{address.addressLine2}</p>}
            <p>
              {address.city}, {address.state} — {address.postalCode}
            </p>
            <p className="pt-2 text-[#181513]/60">Contact: {address.phone || '—'}</p>
          </div>
        </div>

        {/* Order Items */}
        <div className="border border-[#E3DFD7] bg-white/40 p-6 md:p-8 backdrop-blur-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B8860B]">
            Items in Shipment
          </p>
          <div className="mt-4 divide-y divide-[#E3DFD7]">
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
    </main>
  );
}
