'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Printer,
  Search,
  X,
  Package,
  TrendingUp,
  Clock,
  CheckCircle2,
  MapPin,
  Phone,
  User,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Truck,
  ShieldCheck,
} from 'lucide-react';
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
  shippingAddressSnapshot?: {
    fullName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | null;
  user?: {
    id?: string;
    fullName?: string;
    email?: string;
    phone?: string;
  } | null;
  items: Array<{
    id: string;
    productNameSnapshot: string;
    quantity: number;
    weightGrams?: number;
    unitPriceCents?: number;
  }>;
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

type FilterTab = 'All' | 'Pending Dispatch' | 'Shipped' | 'Cancelled';

export default function AdminOperationsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [returns, setReturns] = useState<Return[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [printingOrder, setPrintingOrder] = useState<LabelOrder | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [carrier, setCarrier] = useState('India Post Speed Post');
  const [tracking, setTracking] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [refundAmounts, setRefundAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [inspection, setInspection] = useState<Record<string, 'SEALED_INTACT' | 'DAMAGED_OPENED'>>({});

  // Search & Filter State
  const [currentTab, setCurrentTab] = useState<FilterTab>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const selectOrder = useCallback(async (order: Order) => {
    setSelected(order);
    setInvoice(null);
    setShipment(null);
    setTracking(order.trackingNumber || '');
    setCarrier(order.courierPartner || 'India Post Speed Post');
    try { setShipment(await fetchApi<Shipment>('/orders/' + order.id + '/track')); } catch { setShipment(null); }
    try { setInvoice(await fetchApi<Invoice>('/invoices/admin/order/' + order.id)); } catch { setInvoice(null); }
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const [o, r] = await Promise.all([
        fetchApi<OrdersResponse>('/orders/admin?page=1&limit=100'),
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

  // KPI Calculations
  const metrics = useMemo(() => {
    const totalRevenueCents = orders
      .filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED')
      .reduce((acc, o) => acc + (o.grandTotalCents || 0), 0);

    const pendingDispatchCount = orders.filter((o) =>
      ['PAID', 'PROCESSING', 'PACKED'].includes(o.status),
    ).length;

    const activeOrdersCount = orders.filter(
      (o) => !['CANCELLED', 'DELIVERED', 'REFUNDED'].includes(o.status),
    ).length;

    const deliveredCount = orders.filter((o) => o.status === 'DELIVERED').length;

    return {
      totalRevenue: totalRevenueCents / 100,
      pendingDispatch: pendingDispatchCount,
      activeOrders: activeOrdersCount,
      delivered: deliveredCount,
    };
  }, [orders]);

  // Filtered Orders List
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Tab Filtering
      if (currentTab === 'Pending Dispatch') {
        if (!['PAID', 'PROCESSING', 'PACKED', 'PENDING_PAYMENT'].includes(order.status)) return false;
      } else if (currentTab === 'Shipped') {
        if (!['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(order.status)) return false;
      } else if (currentTab === 'Cancelled') {
        if (order.status !== 'CANCELLED') return false;
      }

      // Search Query Filtering
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const orderNum = (order.orderNumber || '').toLowerCase();
        const custName = (
          order.shippingAddressSnapshot?.fullName ||
          order.user?.fullName ||
          ''
        ).toLowerCase();
        const custPhone = (
          order.shippingAddressSnapshot?.phone ||
          order.user?.phone ||
          ''
        ).toLowerCase();
        const trackingNum = (order.trackingNumber || '').toLowerCase();
        const city = (order.shippingAddressSnapshot?.city || '').toLowerCase();
        const pincode = (order.shippingAddressSnapshot?.postalCode || '').toLowerCase();

        return (
          orderNum.includes(q) ||
          custName.includes(q) ||
          custPhone.includes(q) ||
          trackingNum.includes(q) ||
          city.includes(q) ||
          pincode.includes(q)
        );
      }

      return true;
    });
  }, [orders, currentTab, searchQuery]);

  async function updateOrderStatus(status: string) {
    if (!selected) return;
    setBusy(true); setMessage(''); setError('');
    try {
      await fetchApi('/orders/' + selected.id + '/status', { method: 'PATCH', body: JSON.stringify({ status }) });
      setMessage('Order status transitioned to ' + status);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update order'); }
    finally { setBusy(false); }
  }

  async function submitManualTracking() {
    if (!selected || !tracking.trim()) return;
    setBusy(true); setMessage(''); setError('');
    try {
      const res = await fetchApi<{ order: Order; shipment: Shipment }>('/admin/orders/' + selected.id + '/fulfill', {
        method: 'POST',
        body: JSON.stringify({
          trackingNumber: tracking.trim(),
        }),
      });
      setShipment(res.shipment);
      setMessage(`Consignment ${tracking.trim()} dispatched via India Post Speed Post.`);
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

  const selectedAddr = selected?.shippingAddressSnapshot || {};

  return (
    <main className="min-h-screen bg-[#FBF9F5] px-6 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-7xl">
        {/* Top Header */}
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#ECE7DE] pb-6">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#B8860B]">
              Logistics & Storefront Operations
            </span>
            <h1 className="mt-1 font-serif text-3xl md:text-4xl text-[#183024]">
              Fulfillment Command Center
            </h1>
            <p className="mt-1 text-xs text-[#181513]/60">
              India Post parcel dispatching, consignment labels, order lifecycle, and customer returns.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load().catch(() => undefined)}
            className="inline-flex items-center gap-1.5 rounded-xs border border-[#183024]/30 bg-white px-3 py-1.5 text-xs uppercase tracking-wider text-[#183024] hover:bg-[#183024] hover:text-[#FAF7F2] transition shadow-2xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Data
          </button>
        </div>

        {/* Global Feedback Banners */}
        {error && (
          <div role="alert" className="mt-6 flex items-center gap-2 rounded-xs border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="mt-6 flex items-center gap-2 rounded-xs border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {message}
          </div>
        )}

        {/* Top Metrics Strip (4 Summary KPI Cards) */}
        <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Card 1: Total Revenue */}
          <div className="rounded-sm border border-[#ECE7DE] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#181513]/55">
                Total Revenue
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-800">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 font-serif text-2xl md:text-3xl font-medium text-[#183024]">
              ₹{metrics.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
            <p className="mt-1 text-[11px] text-[#181513]/50">Non-cancelled orders sum</p>
          </div>

          {/* Card 2: Orders Pending Dispatch */}
          <div className="rounded-sm border border-[#ECE7DE] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#181513]/55">
                Pending Dispatch
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-800">
                <Package className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 font-serif text-2xl md:text-3xl font-medium text-amber-900">
              {metrics.pendingDispatch}
            </p>
            <p className="mt-1 text-[11px] text-[#181513]/50">Paid / Packed / Ready</p>
          </div>

          {/* Card 3: Total Active Orders */}
          <div className="rounded-sm border border-[#ECE7DE] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#181513]/55">
                Total Active Orders
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-800">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 font-serif text-2xl md:text-3xl font-medium text-[#181513]">
              {metrics.activeOrders}
            </p>
            <p className="mt-1 text-[11px] text-[#181513]/50">In processing & transit</p>
          </div>

          {/* Card 4: Delivered / Completed */}
          <div className="rounded-sm border border-[#ECE7DE] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#181513]/55">
                Delivered / Fulfilled
              </span>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-[#183024]">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 font-serif text-2xl md:text-3xl font-medium text-emerald-800">
              {metrics.delivered}
            </p>
            <p className="mt-1 text-[11px] text-[#181513]/50">Successfully completed</p>
          </div>
        </section>

        {/* Search Bar & Filter Tabs */}
        <section className="mt-8 rounded-sm border border-[#ECE7DE] bg-white p-4 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[#ECE7DE] pb-2 sm:border-b-0 sm:pb-0">
              {(['All', 'Pending Dispatch', 'Shipped', 'Cancelled'] as FilterTab[]).map((tab) => {
                const isActive = currentTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCurrentTab(tab)}
                    className={`rounded-xs px-3 py-1.5 text-xs uppercase tracking-wider transition ${
                      isActive
                        ? 'bg-[#183024] font-medium text-[#FAF7F2]'
                        : 'bg-[#FBF9F5] text-[#181513]/70 hover:bg-[#ECE7DE]'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* Real-time Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#181513]/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Order ID, Name, Phone..."
                className="w-full rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] py-2 pl-9 pr-8 text-xs text-[#181513] placeholder-[#181513]/40 focus:border-[#183024] focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-[#181513]/40 hover:text-[#181513]"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Main Dashboard Layout: Orders Queue vs. Clean Detail Pane */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1.1fr]">
          {/* Left: Orders List */}
          <section className="rounded-sm border border-[#ECE7DE] bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#ECE7DE] pb-3">
              <h2 className="font-serif text-lg text-[#183024]">
                Orders Queue ({filteredOrders.length})
              </h2>
              {searchQuery && (
                <span className="text-[11px] text-[#B8860B]">Filtered by &quot;{searchQuery}&quot;</span>
              )}
            </div>

            <div className="mt-3 divide-y divide-[#ECE7DE]">
              {filteredOrders.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#181513]/50">
                  No orders match your filter criteria.
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const isSelected = selected?.id === order.id;
                  const isShipped = ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status);
                  const custName = order.shippingAddressSnapshot?.fullName || order.user?.fullName || 'Patron';

                  return (
                    <div
                      key={order.id}
                      onClick={() => selectOrder(order)}
                      className={`group flex flex-col justify-between gap-3 p-3.5 transition rounded-xs cursor-pointer ${
                        isSelected ? 'bg-[#ECE7DE]/50 border-l-3 border-[#183024]' : 'hover:bg-[#FBF9F5]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-base font-medium text-[#181513]">
                            {order.orderNumber}
                          </span>
                          <span
                            className={`rounded-xs border px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wider ${
                              order.status === 'PAID'
                                ? 'border-amber-300 bg-amber-50 text-amber-800'
                                : order.status === 'PROCESSING'
                                ? 'border-blue-300 bg-blue-50 text-blue-800'
                                : order.status === 'SHIPPED'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : order.status === 'DELIVERED'
                                ? 'border-green-300 bg-green-50 text-green-800'
                                : 'border-[#181513]/20 bg-stone-100 text-[#181513]/70'
                            }`}
                          >
                            {order.status.replaceAll('_', ' ')}
                          </span>
                        </div>
                        <span className="text-xs font-semibold tabular-nums text-[#181513]">
                          ₹{(order.grandTotalCents / 100).toLocaleString('en-IN')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-[#181513]/60">
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-[#181513]/40" />
                          <span className="font-medium text-[#181513]">{custName}</span>
                          {order.shippingAddressSnapshot?.city && (
                            <span>· {order.shippingAddressSnapshot.city}</span>
                          )}
                        </div>
                        <span>
                          {new Date(order.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="text-[11px] text-[#181513]/50">
                          {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
                          {order.trackingNumber && (
                            <span className="ml-2 font-mono text-[10px] text-emerald-800 font-medium">
                              AWB: {order.trackingNumber}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrintingOrder(order as unknown as LabelOrder);
                          }}
                          className="inline-flex items-center gap-1 rounded-xs border border-[#183024]/40 bg-white px-2 py-1 text-[10.5px] font-medium uppercase tracking-wider text-[#183024] hover:bg-[#183024] hover:text-[#FAF7F2] transition shadow-2xs"
                          title="Print Shipping Label"
                        >
                          <Printer className="h-3 w-3" />
                          Print Label
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Right: Cleaned-Up Order Detail Pane */}
          <aside className="space-y-6">
            {!selected ? (
              <div className="rounded-sm border border-dashed border-[#ECE7DE] bg-white p-12 text-center text-xs text-[#181513]/55">
                <Package className="mx-auto h-8 w-8 text-[#181513]/30" />
                <p className="mt-2 font-medium">Select an order from the list</p>
                <p className="text-[11px] text-[#181513]/50 mt-1">
                  View customer delivery details, line items, and generate India Post dispatch slips.
                </p>
              </div>
            ) : (
              <div className="rounded-sm border border-[#ECE7DE] bg-white p-6 shadow-xs space-y-6">
                {/* Detail Header */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ECE7DE] pb-4">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-[#181513]/50 font-semibold">
                      Selected Order
                    </span>
                    <h3 className="font-serif text-2xl text-[#183024]">{selected.orderNumber}</h3>
                    <p className="text-xs text-[#181513]/60 mt-0.5">
                      Booked on{' '}
                      {new Date(selected.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPrintingOrder(selected as unknown as LabelOrder)}
                    className="inline-flex items-center gap-1.5 rounded-xs bg-[#183024] px-3.5 py-2 text-xs font-medium uppercase tracking-wider text-[#FAF7F2] hover:bg-[#254333] transition shadow-xs"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Shipping Label
                  </button>
                </div>

                {/* Status Transitions Strip */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[#181513]/50 font-semibold mb-2">
                    Order Status Controls
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-xs bg-[#ECE7DE] px-2.5 py-1.5 text-xs font-medium text-[#181513]">
                      Current: {selected.status.replaceAll('_', ' ')}
                    </span>
                    {(orderTransitions[selected.status] || []).map((status) => (
                      <button
                        disabled={busy}
                        key={status}
                        onClick={() => updateOrderStatus(status)}
                        className="rounded-xs border border-[#183024] px-3 py-1.5 text-xs uppercase tracking-wider text-[#183024] hover:bg-[#183024] hover:text-[#FAF7F2] transition disabled:opacity-40"
                      >
                        Advance to {status.replaceAll('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Structured Box 1: Customer Delivery Details */}
                <div className="rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#ECE7DE] pb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#B8860B] flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      Customer Delivery Address
                    </span>
                    {selectedAddr.postalCode && (
                      <span className="rounded-xs bg-black text-white px-2 py-0.5 font-mono text-xs font-bold">
                        PIN: {selectedAddr.postalCode}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-[#181513] space-y-1">
                    <p className="font-semibold text-sm">
                      {selectedAddr.fullName || selected.user?.fullName || 'Patron'}
                    </p>
                    <p>{selectedAddr.addressLine1 || 'No street address specified'}</p>
                    {selectedAddr.addressLine2 && <p>{selectedAddr.addressLine2}</p>}
                    <p>
                      {selectedAddr.city || '—'}, {selectedAddr.state || '—'} —{' '}
                      <strong className="font-mono">{selectedAddr.postalCode || '—'}</strong>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#ECE7DE] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-[#183024]">
                      <Phone className="h-3.5 w-3.5" />
                      <a
                        href={`tel:${selectedAddr.phone || selected.user?.phone || ''}`}
                        className="font-medium underline underline-offset-2"
                      >
                        {selectedAddr.phone || selected.user?.phone || 'No phone recorded'}
                      </a>
                    </div>
                    {selected.user?.email && (
                      <span className="text-[#181513]/60">{selected.user.email}</span>
                    )}
                  </div>
                </div>

                {/* Structured Box 2: Items Breakdown & Order Financials */}
                <div className="rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] p-4 space-y-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#B8860B] flex items-center gap-1.5 border-b border-[#ECE7DE] pb-2">
                    <Package className="h-3.5 w-3.5" />
                    Items Breakdown ({selected.items.length})
                  </span>

                  <div className="divide-y divide-[#ECE7DE]">
                    {selected.items.map((item) => (
                      <div key={item.id} className="py-2 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-medium text-[#181513]">{item.productNameSnapshot}</p>
                          <p className="text-[11px] text-[#181513]/55">Quantity: {item.quantity}</p>
                        </div>
                        <span className="font-mono text-[#181513]">
                          × {item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-[#ECE7DE] flex items-center justify-between text-xs font-semibold text-[#181513]">
                    <span className="uppercase tracking-wider">Total Value</span>
                    <span className="font-mono text-base font-bold text-[#183024]">
                      ₹{(selected.grandTotalCents / 100).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Structured Box 3: India Post Speed Post Dispatch Console */}
                <div className="rounded-xs border border-[#ECE7DE] bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#ECE7DE] pb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#183024] flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5" />
                      India Post Dispatch Management
                    </span>
                    <span className="text-[10px] text-stone-500 font-mono uppercase">
                      Carrier: India Post
                    </span>
                  </div>

                  {!selected.trackingNumber && (!shipment || shipment.status === 'CREATED') ? (
                    <div className="space-y-3 pt-1">
                      <div>
                        <label className="block text-[10.5px] font-medium uppercase tracking-wider text-[#181513]/70">
                          India Post Consignment / AWB Tracking Number
                        </label>
                        <input
                          value={tracking}
                          onChange={(e) => setTracking(e.target.value)}
                          placeholder="e.g. EM123456789IN"
                          className="mt-1 w-full rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] px-3 py-2 text-xs font-mono text-[#181513] focus:border-[#183024] focus:outline-hidden"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busy || !tracking.trim()}
                        onClick={submitManualTracking}
                        className="rounded-xs bg-[#183024] px-4 py-2 text-xs uppercase tracking-wider text-[#FAF7F2] hover:bg-[#254333] transition disabled:opacity-40"
                      >
                        {busy ? 'Dispatching…' : 'Dispatch via India Post Speed Post'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <p className="text-xs font-medium text-[#181513]">
                            India Post Speed Post ·{' '}
                            <span className="font-mono font-bold text-[#183024]">
                              {selected.trackingNumber || shipment?.trackingNumber}
                            </span>
                          </p>
                          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[#181513]/55">
                            Status: {shipment?.status ? shipment.status.replaceAll('_', ' ') : 'SHIPPED'}
                          </p>
                        </div>
                        <a
                          href={
                            selected.trackingNumber
                              ? `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx`
                              : '#'
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#B8860B] hover:text-[#183024] font-medium underline underline-offset-4"
                        >
                          Track on India Post
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>

                      {shipment && (
                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#ECE7DE]">
                          {(shipmentTransitions[shipment.status] || []).map((status) => (
                            <button
                              disabled={busy}
                              key={status}
                              onClick={() => updateShipment(status)}
                              className="rounded-xs border border-[#181513]/30 px-2.5 py-1 text-[10px] uppercase tracking-wider hover:bg-[#ECE7DE] disabled:opacity-40"
                            >
                              Move to {status.replaceAll('_', ' ')}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Structured Box 4: Tax Invoice Snapshot */}
                {invoice && (
                  <div className="rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] p-4 flex items-center justify-between text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#181513]/50 font-semibold">Tax Invoice</p>
                      <p className="font-serif text-base text-[#181513]">{invoice.invoiceNumber}</p>
                      <p className="text-[11px] text-[#181513]/55">
                        Issued {new Date(invoice.issuedAt).toLocaleDateString('en-IN')} · Tax: ₹
                        {(invoice.totalTaxCents / 100).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-semibold">
                      ₹{(invoice.grandTotalCents / 100).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>

        {/* Returns Queue Section */}
        <section className="mt-14 rounded-sm border border-[#ECE7DE] bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#ECE7DE] pb-4">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B8860B]">
                Customer Returns Queue
              </span>
              <h2 className="font-serif text-xl text-[#183024]">Reverse Pickups & Refund Processing</h2>
            </div>
            <span className="text-xs text-[#181513]/50">
              {returns.length} {returns.length === 1 ? 'request' : 'requests'}
            </span>
          </div>

          <div className="mt-4 divide-y divide-[#ECE7DE]">
            {returns.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#181513]/50">No return requests pending.</p>
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
                  <div key={ret.id} className="grid gap-4 py-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                    <div>
                      <p className="font-serif text-lg text-[#181513]">{ret.returnNumber}</p>
                      <p className="text-xs text-[#181513]/60">
                        Reason: {ret.reason} · Status:{' '}
                        <span className="font-semibold text-[#183024]">{ret.status}</span>
                      </p>
                      {ret.status === 'RECEIVED' && (
                        <div className="mt-3 space-y-2">
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
                            className="rounded-xs border border-[#181513] px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] hover:bg-[#183024] hover:text-[#FAF7F2] transition disabled:opacity-40"
                          >
                            {status.replaceAll('_', ' ')}
                          </button>
                        );
                      })}
                      {ret.status === 'REFUND_ELIGIBLE' && (
                        <div className="flex w-full gap-2 pt-1">
                          <input
                            inputMode="decimal"
                            value={refundAmounts[ret.id] || ''}
                            onChange={(e) =>
                              setRefundAmounts((current) => ({ ...current, [ret.id]: e.target.value }))
                            }
                            placeholder="Refund ₹"
                            className="w-28 border-b border-[#181513]/25 bg-transparent py-1 text-xs outline-none"
                          />
                          <button
                            disabled={busy}
                            onClick={() => processRefund(ret)}
                            className="rounded-xs bg-[#183024] px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#FAF7F2] hover:bg-[#254333] transition disabled:opacity-40"
                          >
                            Process Refund
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
      </div>
    </main>
  );
}
