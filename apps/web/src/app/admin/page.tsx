'use client';

import { useCallback, useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { fetchApi } from '../../lib/api-client';
import { ShippingLabelModal, LabelOrder } from '../../components/admin/ShippingLabelModal';

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  grandTotalCents: number;
  currency: string;
  trackingNumber?: string | null;
  courierPartner?: string | null;
  shippingAddressSnapshot?: Record<string, any>;
  items: Array<{ id: string; productNameSnapshot: string; quantity: number; weightGrams?: number }>;
  payments?: Array<{ gateway?: string; status?: string }>;
};

type OrdersResponse = { items: Order[]; total: number; page: number; limit: number; totalPages: number };
type Shipment = { id: string; status: string; carrier: string; trackingNumber?: string | null; trackingUrl?: string | null };
type Invoice = { invoiceNumber: string; grandTotalCents: number; totalTaxCents: number; currency: string; issuedAt: string };
type ReturnItem = { id: string; orderItemId: string; quantity: number; condition?: 'SEALED_INTACT' | 'DAMAGED_OPENED' | null };
type Return = { id: string; returnNumber: string; orderId: string; status: string; reason: string; createdAt: string; items: ReturnItem[] };

const orderTransitions: Record<string, string[]> = {
  PAID: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
};
const shipmentTransitions: Record<string, string[]> = {
  CREATED: ['AWB_ASSIGNED', 'CANCELLED'],
  AWB_ASSIGNED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
};

export default function AdminOperationsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [returns, setReturns] = useState<Return[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [printingOrder, setPrintingOrder] = useState<LabelOrder | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [refundAmounts, setRefundAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [inspection, setInspection] = useState<Record<string, 'SEALED_INTACT' | 'DAMAGED_OPENED'>>({});

  const selectOrder = useCallback(async (order: Order) => {
    setSelected(order);
    setInvoice(null);
    setShipment(null);
    try { setShipment(await fetchApi<Shipment>('/orders/' + order.id + '/track')); } catch { setShipment(null); }
    try { setInvoice(await fetchApi<Invoice>('/invoices/admin/order/' + order.id)); } catch { setInvoice(null); }
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const [o, r] = await Promise.all([
        fetchApi<OrdersResponse>('/orders/admin?page=1&limit=50'),
        fetchApi<Return[]>('/admin/returns'),
      ]);
      setOrders(o.items);
      setReturns(r);
      if (selected) {
        const fresh = o.items.find((x) => x.id === selected.id) || null;
        if (fresh) await selectOrder(fresh);
        else { setSelected(null); setShipment(null); setInvoice(null); }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load operations');
    }
  }, [selected, selectOrder]);

  useEffect(() => { load().catch(() => undefined); }, [load]);

  async function updateOrderStatus(status: string) {
    if (!selected) return;
    setBusy(true); setMessage(''); setError('');
    try {
      await fetchApi('/orders/' + selected.id + '/status', { method: 'PATCH', body: JSON.stringify({ status }) });
      setMessage('Order status updated.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update order'); }
    finally { setBusy(false); }
  }

  async function submitManualTracking() {
    if (!selected || !carrier.trim() || !tracking.trim()) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const res = await fetchApi<{ order: Order; shipment: Shipment }>('/admin/orders/' + selected.id + '/tracking', {
        method: 'POST',
        body: JSON.stringify({
          courierName: carrier.trim(),
          trackingNumber: tracking.trim(),
          trackingUrl: trackingUrl.trim() || undefined,
        }),
      });
      setShipment(res.shipment);
      setMessage('Dispatched via India Post Speed Post.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to dispatch consignment'); }
    finally { setBusy(false); }
  }

  async function updateShipment(status: string) {
    if (!shipment) return;
    setBusy(true); setMessage(''); setError('');
    try {
      await fetchApi('/admin/shipments/' + shipment.id + '/events', {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setMessage('Shipment transitioned to ' + status);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update shipment'); }
    finally { setBusy(false); }
  }

  async function updateReturn(ret: Return, status: string) {
    setBusy(true); setMessage(''); setError('');
    try {
      await fetchApi('/admin/returns/' + ret.id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          inspections: status === 'INSPECTED' ? ret.items.map((i) => ({ itemId: i.id, condition: inspection[i.id] })) : undefined,
        }),
      });
      setMessage(ret.returnNumber + ' updated.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update return'); }
    finally { setBusy(false); }
  }

  async function processRefund(ret: Return) {
    const amountCents = Math.round(Number(refundAmounts[ret.id] || 0) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setError('Enter a valid refund amount in rupees.');
      return;
    }
    setBusy(true); setMessage(''); setError('');
    try {
      await fetchApi('/admin/orders/' + ret.orderId + '/refunds', {
        method: 'POST',
        body: JSON.stringify({
          amountCents,
          reason: 'RETURN',
          returnId: ret.id,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setRefundAmounts((current) => ({ ...current, [ret.id]: '' }));
      setMessage(ret.returnNumber + ' refund processed.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to process refund'); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-12 md:px-10 md:py-16">
      <p className="text-[10px] uppercase tracking-[0.24em] text-[#B8860B]">Operations</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-6 border-b border-[#ECE7DE] pb-8">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl text-[#183024]">Fulfillment Desk</h1>
          <p className="mt-3 text-sm text-[#181513]/55">Manage India Post parcel dispatches, invoices, and returns.</p>
        </div>
        <button type="button" onClick={() => load().catch(() => undefined)} className="text-xs uppercase tracking-wider underline underline-offset-4 text-[#183024]">
          Refresh
        </button>
      </div>

      {error && <p role="alert" className="mt-6 text-sm text-red-700 bg-red-50 p-3 border-l-2 border-red-700">{error}</p>}
      {message && <p role="status" className="mt-6 text-sm text-emerald-800 bg-emerald-50 p-3 border-l-2 border-emerald-600">{message}</p>}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <div className="border-y border-[#ECE7DE] divide-y divide-[#ECE7DE]">
            {orders.length === 0 ? (
              <p className="py-10 text-sm text-[#181513]/50">No orders found.</p>
            ) : (
              orders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => selectOrder(order)}
                  className={
                    'grid w-full cursor-pointer gap-3 py-4 text-left sm:grid-cols-[1fr_auto_auto_auto] sm:items-center px-2 rounded-xs transition ' +
                    (selected?.id === order.id ? 'bg-[#ECE7DE]/50 font-medium' : 'hover:bg-[#ECE7DE]/25')
                  }
                >
                  <div>
                    <span className="font-serif text-lg text-[#181513]">{order.orderNumber}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-[#181513]/55 border border-[#181513]/20 px-1.5 py-0.5 rounded-xs">
                      {order.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <span className="text-xs text-[#181513]/50">
                    {new Date(order.createdAt).toLocaleDateString('en-IN')}
                  </span>
                  <span className="text-sm font-medium">
                    ₹{(order.grandTotalCents / 100).toLocaleString('en-IN')}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPrintingOrder(order as unknown as LabelOrder);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xs border border-[#183024]/40 bg-white px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[#183024] hover:bg-[#183024] hover:text-[#FAF7F2] transition shadow-2xs"
                    title="Print Shipping Label"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Label
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="space-y-10">
          {!selected ? (
            <div className="border-t border-[#181513] pt-6 text-sm text-[#181513]/55">
              Select an order to manage fulfillment or print parcel slips.
            </div>
          ) : (
            <>
              <section className="border-t border-[#181513] pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/50">
                    Order · {selected.orderNumber}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPrintingOrder(selected as unknown as LabelOrder)}
                    className="inline-flex items-center gap-1.5 rounded-xs bg-[#183024] px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[#FAF7F2] hover:bg-[#254333] transition"
                  >
                    <Printer className="h-3 w-3" />
                    Print Label
                  </button>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {(orderTransitions[selected.status] || []).map((status) => (
                    <button
                      disabled={busy}
                      key={status}
                      onClick={() => updateOrderStatus(status)}
                      className="border border-[#181513] px-3 py-2 text-[10px] uppercase tracking-[0.15em] rounded-xs disabled:opacity-40"
                    >
                      {status.replaceAll('_', ' ')}
                    </button>
                  ))}
                </div>
                <div className="mt-6 space-y-2 text-sm">
                  {selected.items.map((item) => (
                    <div key={item.id} className="flex justify-between border-b border-[#ECE7DE] py-2">
                      <span>{item.productNameSnapshot}</span>
                      <span>× {item.quantity}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="border-t border-[#181513] pt-6">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/50">
                  India Post Delivery Dispatch
                </p>
                {!shipment || shipment.status === 'CREATED' ? (
                  <div className="mt-5 space-y-4">
                    <input
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder="Carrier Partner (Default: India Post Speed Post)"
                      className="w-full border-b border-[#181513]/25 bg-transparent py-2 text-sm outline-none placeholder-[#181513]/40"
                    />
                    <input
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                      placeholder="India Post Consignment / AWB No. (e.g. EM123456789IN)"
                      className="w-full border-b border-[#181513]/25 bg-transparent py-2 text-sm outline-none placeholder-[#181513]/40 font-mono"
                    />
                    <input
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      placeholder="Direct Tracking URL (optional)"
                      className="w-full border-b border-[#181513]/25 bg-transparent py-2 text-sm outline-none placeholder-[#181513]/40"
                    />
                    <div className="flex gap-2 pt-2">
                      <button
                        disabled={busy || !tracking.trim()}
                        onClick={submitManualTracking}
                        className="rounded-xs bg-[#183024] px-4 py-3 text-[10px] uppercase tracking-[0.16em] text-[#FAF7F2] transition hover:bg-[#254333] disabled:opacity-40"
                      >
                        Dispatch & Mark Shipped
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5">
                    <div className="flex items-baseline justify-between">
                      <p className="text-sm font-medium">
                        {shipment.carrier} · {shipment.trackingNumber || 'Tracking pending'}
                      </p>
                      {shipment.trackingUrl && (
                        <a
                          href={shipment.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-[#A66B18] underline underline-offset-4 hover:text-[#181513]"
                        >
                          Track on India Post ↗
                        </a>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-[#181513]/45">
                      {shipment.status.replaceAll('_', ' ')}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {(shipmentTransitions[shipment.status] || []).map((status) => (
                        <button
                          disabled={busy}
                          key={status}
                          onClick={() => updateShipment(status)}
                          className="border border-[#181513] px-3 py-2 text-[10px] uppercase tracking-[0.15em] rounded-xs hover:bg-white/40 disabled:opacity-40"
                        >
                          {status.replaceAll('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {invoice && (
                <section className="border-t border-[#181513] pt-6">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/50">Invoice</p>
                  <div className="mt-4 flex items-end justify-between gap-5">
                    <p className="font-serif text-2xl">{invoice.invoiceNumber}</p>
                    <p className="text-sm">₹{(invoice.grandTotalCents / 100).toLocaleString('en-IN')}</p>
                  </div>
                  <p className="mt-2 text-xs text-[#181513]/45">
                    Tax ₹{(invoice.totalTaxCents / 100).toLocaleString('en-IN')} · Issued{' '}
                    {new Date(invoice.issuedAt).toLocaleDateString('en-IN')}
                  </p>
                </section>
              )}
            </>
          )}
        </aside>
      </div>

      <section className="mt-16 border-t border-[#181513] pt-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/50">Returns queue</p>
        <div className="mt-6 divide-y divide-[#ECE7DE] border-y border-[#ECE7DE]">
          {returns.length === 0 ? (
            <p className="py-10 text-sm text-[#181513]/55">No return requests.</p>
          ) : (
            returns.map((ret) => {
              const next =
                ret.status === 'REQUESTED'
                  ? ['APPROVED', 'REJECTED']
                  : ret.status === 'APPROVED'
                  ? ['PICKED_UP', 'CANCELLED']
                  : ret.status === 'PICKED_UP'
                  ? ['RECEIVED']
                  : ret.status === 'RECEIVED'
                  ? ['INSPECTED']
                  : ret.status === 'INSPECTED'
                  ? ['REFUND_ELIGIBLE', 'REJECTED']
                  : ret.status === 'REFUND_ELIGIBLE'
                  ? ['COMPLETED']
                  : [];
              return (
                <div key={ret.id} className="grid gap-4 py-5 lg:grid-cols-[1fr_auto_auto] lg:items-center lg:gap-8">
                  <div>
                    <p className="font-serif text-xl">{ret.returnNumber}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#181513]/45">
                      {ret.reason} · {ret.status}
                    </p>
                    {ret.status === 'RECEIVED' && (
                      <div className="mt-4 space-y-2">
                        {ret.items.map((item, index) => (
                          <label key={item.id} className="flex items-center gap-3 text-xs">
                            <span className="text-[#181513]/55">
                              Item {index + 1} · ×{item.quantity}
                            </span>
                            <select
                              value={inspection[item.id] || ''}
                              onChange={(e) =>
                                setInspection((current) => ({
                                  ...current,
                                  [item.id]: e.target.value as 'SEALED_INTACT' | 'DAMAGED_OPENED',
                                }))
                              }
                              className="border-b border-[#181513]/25 bg-transparent py-1 text-xs outline-none"
                            >
                              <option value="">Inspect condition</option>
                              <option value="SEALED_INTACT">Sealed / intact</option>
                              <option value="DAMAGED_OPENED">Damaged / opened</option>
                            </select>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-[#181513]/50">
                    {new Date(ret.createdAt).toLocaleDateString('en-IN')}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {next.map((status) => {
                      const inspectionIncomplete =
                        status === 'INSPECTED' && ret.items.some((item) => !inspection[item.id]);
                      return (
                        <button
                          disabled={busy || inspectionIncomplete}
                          key={status}
                          onClick={() => updateReturn(ret, status)}
                          className="border border-[#181513] px-3 py-2 text-[10px] uppercase tracking-[0.15em] rounded-xs disabled:opacity-40"
                        >
                          {status.replaceAll('_', ' ')}
                        </button>
                      );
                    })}
                    {ret.status === 'REFUND_ELIGIBLE' && (
                      <div className="flex w-full gap-2 pt-2">
                        <input
                          inputMode="decimal"
                          value={refundAmounts[ret.id] || ''}
                          onChange={(e) =>
                            setRefundAmounts((current) => ({ ...current, [ret.id]: e.target.value }))
                          }
                          placeholder="Refund ₹"
                          className="w-28 border-b border-[#181513]/25 bg-transparent py-2 text-xs outline-none"
                        />
                        <button
                          disabled={busy}
                          onClick={() => processRefund(ret)}
                          className="border border-[#181513] px-3 py-2 text-[10px] uppercase tracking-[0.15em] rounded-xs disabled:opacity-40"
                        >
                          Process refund
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Printable Shipping Label Modal */}
      <ShippingLabelModal order={printingOrder} onClose={() => setPrintingOrder(null)} />
    </main>
  );
}
