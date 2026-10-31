'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi, ApiClientError } from '../../../../lib/api-client';

type OrderItem = {
  id: string;
  productNameSnapshot: string;
  skuSnapshot?: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};
type Payment = {
  id: string;
  gateway: string;
  gatewayOrderId: string;
  gatewayPaymentId?: string | null;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
};
type StatusHistory = {
  id: string;
  oldStatus?: string | null;
  newStatus: string;
  reason?: string | null;
  changedBy?: string | null;
  createdAt: string;
};
type ShipmentEvent = {
  id: string;
  status: string;
  location?: string | null;
  description?: string | null;
  occurredAt: string;
};
type Shipment = {
  id: string;
  status: string;
  carrier: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  trackingEvents: ShipmentEvent[];
};
type InvoiceItem = {
  id: string;
  productName: string;
  sku: string;
  hsnCode: string;
  quantity: number;
  unitPriceCents: number;
  taxableValueCents: number;
  taxRatePercent: number;
  cgstCents: number;
  sgstCents: number;
  igstCents: number;
  lineTotalCents: number;
};
type Invoice = {
  invoiceNumber: string;
  issuedAt: string;
  taxableSubtotalCents: number;
  cgstCents: number;
  sgstCents: number;
  igstCents: number;
  totalTaxCents: number;
  shippingNetCents: number;
  discountCents: number;
  grandTotalCents: number;
  currency: string;
  items?: InvoiceItem[];
};
type Order = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  items: OrderItem[];
  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  shippingCents: number;
  grandTotalCents: number;
  shippingAddressSnapshot: Record<string, unknown>;
  billingAddressSnapshot?: Record<string, unknown> | null;
  payments: Payment[];
  statusHistory: StatusHistory[];
};

const returnReasons = [
  ['DAMAGED', 'Damaged'],
  ['WRONG_ITEM', 'Wrong item'],
  ['QUALITY_ISSUE', 'Quality issue'],
  ['OTHER', 'Other'],
] as const;

function money(cents: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function formatStatus(value: string) {
  return value.replaceAll('_', ' ');
}

function snapshotLine(snapshot: Record<string, unknown>) {
  return [snapshot.addressLine1, snapshot.addressLine2, snapshot.city, snapshot.state, snapshot.postalCode]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(', ');
}

export default function OrderConfirmationPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const orderId = params.orderId;
  const [order, setOrder] = useState<Order | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('DAMAGED');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [submittingReturn, setSubmittingReturn] = useState(false);

  const loadOrder = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    setError('');
    try {
      const data = await fetchApi<Order>('/orders/' + orderId);
      setOrder(data);
      const [trackResult, invoiceResult] = await Promise.allSettled([
        fetchApi<Shipment>('/orders/' + orderId + '/track'),
        fetchApi<Invoice>('/invoices/order/' + orderId),
      ]);
      setShipment(trackResult.status === 'fulfilled' ? trackResult.value : null);
      setInvoice(invoiceResult.status === 'fulfilled' ? invoiceResult.value : null);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'UNAUTHORIZED') {
        router.replace('/account/login?next=' + encodeURIComponent('/orders/' + orderId + '/confirmation'));
        return;
      }
      if (!isPolling) {
        setError(err instanceof Error ? err.message : 'Unable to load this order.');
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [orderId, router]);

  useEffect(() => {
    loadOrder().catch(() => undefined);
  }, [loadOrder]);

  // If order is pending payment, poll every 3 seconds for up to 30 seconds to catch webhook confirmation
  useEffect(() => {
    if (order?.status !== 'PENDING_PAYMENT') return;
    const interval = setInterval(() => {
      loadOrder(true).catch(() => undefined);
    }, 3000);
    return () => clearInterval(interval);
  }, [order?.status, loadOrder]);

  const totalReturnQty = useMemo(
    () => Object.values(returnQty).reduce((sum, value) => sum + value, 0),
    [returnQty],
  );

  async function cancelOrder() {
    if (!order || order.status !== 'PENDING_PAYMENT') return;
    setCancelling(true);
    setError('');
    try {
      await fetchApi('/orders/' + order.id + '/cancel', {
        method: 'POST',
        body: JSON.stringify({ reason: 'CANCELLED_BY_CUSTOMER' }),
      });
      setMessage('Order cancelled and the active stock reservation was released.');
      await loadOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel this order.');
    } finally {
      setCancelling(false);
    }
  }

  async function submitReturn() {
    if (!order || totalReturnQty === 0) return;
    setSubmittingReturn(true);
    setError('');
    try {
      const items = order.items
        .filter((item) => (returnQty[item.id] || 0) > 0)
        .map((item) => ({ orderItemId: item.id, quantity: returnQty[item.id] }));
      await fetchApi('/orders/' + order.id + '/returns', {
        method: 'POST',
        body: JSON.stringify({
          reason: returnReason,
          items,
          ...(returnNotes.trim() ? { notes: returnNotes.trim() } : {}),
        }),
      });
      setReturnOpen(false);
      setReturnQty({});
      setReturnNotes('');
      setMessage('Return request submitted.');
      await loadOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit the return request.');
    } finally {
      setSubmittingReturn(false);
    }
  }

  if (loading) {
    return (
      <main className="editorial-page mx-auto max-w-[1280px] px-6 py-20 md:px-10 md:py-28">
        <div className="animate-pulse space-y-8">
          <div className="h-5 w-40 bg-[#ECE8E0]" />
          <div className="h-16 w-96 max-w-full bg-[#ECE8E0]" />
          <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
            <div className="h-96 bg-[#ECE8E0]" />
            <div className="h-72 bg-[#ECE8E0]" />
          </div>
        </div>
      </main>
    );
  }

  if (error && !order) {
    return (
      <main className="editorial-page mx-auto max-w-2xl px-6 py-28 text-center md:py-36">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#B8860B]">Order Lookup</p>
        <h1 className="mt-4 font-serif text-4xl text-[#181513]">We could not open this order.</h1>
        <p className="mt-3 text-sm text-red-700">{error}</p>
        <Link href="/account/orders" className="mt-8 inline-block text-xs uppercase tracking-[0.16em] text-[#A66B18] underline underline-offset-4">Back to orders →</Link>
      </main>
    );
  }

  if (!order) return null;

  const canReturn = order.status === 'DELIVERED';
  const canCancel = order.status === 'PENDING_PAYMENT';
  const address = order.shippingAddressSnapshot;
  const paidPayment = order.payments.find((payment) => payment.status === 'CAPTURED' || payment.status === 'PAID') || order.payments[0];

  return (
    <main className="editorial-page mx-auto max-w-[1280px] px-6 pb-24 pt-12 md:px-10 md:pb-32 md:pt-20">
      <header className="border-b border-[#E3DFD7] pb-10">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#B8860B]">Order Confirmed</p>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-serif text-5xl font-normal tracking-[-0.05em] md:text-7xl">{order.orderNumber}</h1>
            <p className="mt-4 text-sm text-[#181513]/55">{new Date(order.createdAt).toLocaleString('en-IN')}</p>
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#A66B18]">{formatStatus(order.status)}</p>
        </div>
      </header>

      {error && <p role="alert" className="mt-6 border-l-2 border-red-700 px-4 py-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-6 border-l-2 border-[#B8860B] px-4 py-2 text-sm">{message}</p>}

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px] lg:gap-20">
        <div className="space-y-12">
          <section className="border-t border-[#181513] pt-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/45">Items</p>
            <div className="mt-5 divide-y divide-[#E3DFD7] border-y border-[#E3DFD7]">
              {order.items.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-5 py-5">
                  <div><p className="font-serif text-xl">{item.productNameSnapshot}</p><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#181513]/45">{item.skuSnapshot || 'Item'} · ×{item.quantity}</p></div>
                  <p className="text-sm tabular-nums">{money(item.lineTotalCents, order.currency)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-[#181513] pt-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/45">Order progress</p>
            <div className="mt-6 space-y-0">
              {order.statusHistory.map((entry) => (
                <div key={entry.id} className="relative border-l border-[#B8860B] py-1 pl-6 pb-7 last:pb-1">
                  <span className="absolute -left-[4px] top-2 h-2 w-2 rounded-full bg-[#B8860B]" />
                  <p className="text-[10px] uppercase tracking-[0.15em]">{formatStatus(entry.newStatus)}</p>
                  <p className="mt-1 text-xs text-[#181513]/45">{new Date(entry.createdAt).toLocaleString('en-IN')}{entry.reason ? ' · ' + entry.reason : ''}</p>
                </div>
              ))}
            </div>
          </section>

          {shipment && (
            <section className="border-t border-[#181513] pt-6">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/45">Shipment</p>
                  <h2 className="mt-2 font-serif text-3xl">{shipment.carrier}</h2>
                </div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#A66B18]">{formatStatus(shipment.status)}</p>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="border-t border-[#E3DFD7] pt-4"><p className="text-[9px] uppercase tracking-[0.15em] text-[#181513]/45">India Post Tracking Number</p><p className="mt-2 text-sm font-medium">{shipment.trackingNumber || 'Consignment number will appear once dispatched.'}</p></div>
                <div className="border-t border-[#E3DFD7] pt-4"><p className="text-[9px] uppercase tracking-[0.15em] text-[#181513]/45">Dispatched</p><p className="mt-2 text-sm">{shipment.dispatchedAt ? new Date(shipment.dispatchedAt).toLocaleDateString('en-IN') : 'Preparing for dispatch'}</p></div>
              </div>
              {shipment.trackingNumber && (
                <a
                  href={shipment.trackingUrl || 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx'}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-2 bg-[#181513] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F7F5F0] transition hover:bg-[#2E2824]"
                >
                  Track on India Post →
                </a>
              )}
              {shipment.trackingEvents?.length > 0 && <div className="mt-7 divide-y divide-[#E3DFD7] border-y border-[#E3DFD7]">{shipment.trackingEvents.map((event) => <div key={event.id} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr]"><p className="text-[9px] uppercase tracking-[0.14em] text-[#181513]/45">{new Date(event.occurredAt).toLocaleString('en-IN')}</p><div><p className="text-xs uppercase tracking-[0.12em]">{formatStatus(event.status)}</p>{event.description && <p className="mt-1 text-sm text-[#181513]/55">{event.description}</p>}{event.location && <p className="mt-1 text-xs text-[#181513]/40">{event.location}</p>}</div></div>)}</div>}
            </section>
          )}

          {canReturn && (
            <section className="border-t border-[#181513] pt-6">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div><p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/45">Need a return?</p><p className="mt-2 max-w-xl text-sm leading-6 text-[#181513]/55">Select the items and quantity you want to return. Eligibility is checked by the commerce service.</p></div>
                <button type="button" onClick={() => setReturnOpen((open) => !open)} className="text-[10px] uppercase tracking-[0.16em] text-[#A66B18] underline underline-offset-4">{returnOpen ? 'Close return form' : 'Start a return →'}</button>
              </div>
              {returnOpen && <div className="mt-7 border-t border-[#E3DFD7] pt-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <label className="text-[10px] uppercase tracking-[0.14em]">Reason<select value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="mt-2 w-full border-b border-[#181513]/25 bg-transparent py-3 text-sm outline-none">{returnReasons.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="text-[10px] uppercase tracking-[0.14em]">Notes <span className="text-[#181513]/35">(optional)</span><input value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} maxLength={2000} className="mt-2 w-full border-b border-[#181513]/25 bg-transparent py-3 text-sm outline-none" /></label>
                </div>
                <div className="mt-7 divide-y divide-[#E3DFD7] border-y border-[#E3DFD7]">
                  {order.items.map((item) => <label key={item.id} className="flex items-center justify-between gap-5 py-4 text-sm"><span>{item.productNameSnapshot} · ×{item.quantity}</span><select value={returnQty[item.id] || 0} onChange={(e) => setReturnQty((current) => ({ ...current, [item.id]: Math.min(item.quantity, Math.max(0, Number(e.target.value))) }))} className="border-b border-[#181513]/25 bg-transparent py-1 text-sm outline-none"><option value={0}>No return</option>{Array.from({length:item.quantity},(_,index)=><option key={index+1} value={index+1}>Return ×{index+1}</option>)}</select></label>)}
                </div>
                <button type="button" disabled={submittingReturn || totalReturnQty === 0} onClick={submitReturn} className="mt-6 bg-[#181513] px-6 py-3 text-[10px] uppercase tracking-[0.17em] text-[#F7F5F0] disabled:opacity-40">{submittingReturn ? 'Submitting…' : 'Submit return request'}</button>
              </div>}
            </section>
          )}
        </div>

        <aside className="space-y-9">
          <section className="border-t border-[#181513] pt-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/45">Summary</p>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{money(order.subtotalCents, order.currency)}</span></div>
              {order.discountCents > 0 && <div className="flex justify-between"><span>Discount</span><span>−{money(order.discountCents, order.currency)}</span></div>}
              <div className="flex justify-between"><span>Tax</span><span>{money(order.taxCents, order.currency)}</span></div>
              <div className="flex justify-between"><span>Shipping</span><span>{money(order.shippingCents, order.currency)}</span></div>
            </div>
            <div className="mt-6 flex justify-between border-t border-[#E3DFD7] pt-5 font-serif text-2xl"><span>Total</span><span>{money(order.grandTotalCents, order.currency)}</span></div>
          </section>

          <section className="border-t border-[#181513] pt-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/45">Payment</p>
            {paidPayment ? <div className="mt-4 space-y-2 text-sm"><p>{paidPayment.gateway} · {formatStatus(paidPayment.status)}</p><p className="text-xs text-[#181513]/50">{money(paidPayment.amountCents, paidPayment.currency)} · {paidPayment.gatewayPaymentId || paidPayment.gatewayOrderId}</p><p className="text-xs text-[#181513]/40">{new Date(paidPayment.createdAt).toLocaleString('en-IN')}</p></div> : <p className="mt-4 text-sm text-[#181513]/50">Payment details will appear after the gateway records the payment.</p>}
          </section>

          <section className="border-t border-[#181513] pt-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/45">Delivery address</p>
            <p className="mt-4 text-sm leading-6">{String(address.fullName || '')}<br />{snapshotLine(address)}{address.phone ? <><br />{String(address.phone)}</> : null}</p>
          </section>

          {invoice && <section className="border-t border-[#181513] pt-6">
            <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/45">Invoice</p><p className="mt-2 font-serif text-2xl">{invoice.invoiceNumber}</p></div><p className="text-[10px] uppercase tracking-[0.14em] text-[#181513]/45">{new Date(invoice.issuedAt).toLocaleDateString('en-IN')}</p></div>
            <div className="mt-5 space-y-2 text-sm"><div className="flex justify-between"><span>Taxable subtotal</span><span>{money(invoice.taxableSubtotalCents, invoice.currency)}</span></div><div className="flex justify-between"><span>CGST</span><span>{money(invoice.cgstCents, invoice.currency)}</span></div><div className="flex justify-between"><span>SGST</span><span>{money(invoice.sgstCents, invoice.currency)}</span></div><div className="flex justify-between"><span>IGST</span><span>{money(invoice.igstCents, invoice.currency)}</span></div></div>
          </section>}

          {canCancel && <button type="button" disabled={cancelling} onClick={cancelOrder} className="w-full border border-red-700/40 px-5 py-3 text-[10px] uppercase tracking-[0.16em] text-red-700 disabled:opacity-40">{cancelling ? 'Cancelling…' : 'Cancel pending payment order'}</button>}

          <div className="flex flex-wrap gap-5 text-[10px] uppercase tracking-[0.16em]">
            <Link href="/account/orders" className="text-[#A66B18] underline underline-offset-4">All orders →</Link>
            <Link href="/account/returns" className="text-[#A66B18] underline underline-offset-4">Returns →</Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
