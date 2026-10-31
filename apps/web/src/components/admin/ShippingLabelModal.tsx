'use client';

import React from 'react';
import { Printer, X } from 'lucide-react';

export type LabelOrder = {
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
  items: Array<{
    id: string;
    productNameSnapshot: string;
    quantity: number;
    weightGrams?: number;
    skuSnapshot?: string;
  }>;
  payments?: Array<{
    gateway?: string;
    status?: string;
  }>;
};

interface ShippingLabelModalProps {
  order: LabelOrder | null;
  onClose: () => void;
}

export function ShippingLabelModal({ order, onClose }: ShippingLabelModalProps) {
  if (!order) return null;

  const addr = order.shippingAddressSnapshot || {};
  const isPrepaid = order.payments?.some((p) => p.status === 'SUCCESS' || p.status === 'COMPLETED') ?? true;
  const formattedPin = addr.postalCode
    ? `${addr.postalCode.slice(0, 3)} ${addr.postalCode.slice(3)}`
    : '—';
  const trackingNo = order.trackingNumber || 'SPEED-POST-BOOKING-PENDING';

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs print:p-0 print:bg-white print:static">
      {/* Print-specific style block */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-shipping-label,
          #printable-shipping-label * {
            visibility: visible;
          }
          #printable-shipping-label {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 12px;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="relative w-full max-w-2xl rounded-sm border border-[#ECE7DE] bg-white p-6 shadow-2xl print:border-none print:shadow-none print:p-0">
        {/* Modal Controls (Hidden in Print) */}
        <div className="no-print mb-4 flex items-center justify-between border-b border-[#ECE7DE] pb-3">
          <div className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-[#183024]" />
            <h2 className="font-serif text-lg text-[#183024]">India Post Parcel Dispatch Slip</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xs bg-[#183024] px-4 py-2 text-xs uppercase tracking-wider text-[#FAF7F2] hover:bg-[#254333] transition"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Label
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xs border border-stone-300 p-2 text-stone-600 hover:bg-stone-100 transition"
              aria-label="Close label preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Label Sheet */}
        <div
          id="printable-shipping-label"
          className="border-2 border-black bg-white p-5 text-black font-sans text-xs leading-tight"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b-2 border-black pb-3">
            <div>
              <h1 className="font-serif text-xl font-bold tracking-tight text-black uppercase">
                SEETHAPAATI HEIRLOOM FOODS
              </h1>
              <p className="text-[10px] tracking-widest uppercase font-semibold text-stone-700">
                Nilgiris Artisanal Mill & Provisions
              </p>
            </div>
            <div className="text-right border-l-2 border-black pl-4">
              <span className="inline-block bg-black text-white px-2.5 py-1 text-xs font-bold uppercase tracking-wider">
                INDIA POST (SPEED POST)
              </span>
              <p className="mt-1 font-mono text-[11px] font-bold">
                CONSIGNMENT: {trackingNo}
              </p>
            </div>
          </div>

          {/* Barcode Mock / Tracking Header */}
          <div className="my-3 border-b-2 border-black pb-3 text-center">
            <div className="tracking-widest font-mono text-lg font-bold">
              * {trackingNo} *
            </div>
            <div className="mx-auto mt-1 h-8 w-64 bg-repeating-linear-gradient flex items-center justify-center font-mono text-[9px] text-stone-500">
              ||||| | |||| ||| |||||| | || ||||| |||| | ||| |||||
            </div>
          </div>

          {/* From & To Grid */}
          <div className="grid grid-cols-2 gap-4 border-b-2 border-black pb-4">
            {/* FROM Box */}
            <div className="border-r-2 border-black pr-4">
              <span className="text-[9px] font-bold uppercase tracking-widest text-stone-600">
                FROM (SHIPPER):
              </span>
              <div className="mt-1 space-y-0.5 text-[11px]">
                <p className="font-bold text-black">SEETHAPAATI HEIRLOOM FOODS</p>
                <p>Atelier: Nilgiris Organic Processing Hub</p>
                <p>Chennai Central Fulfillment Center</p>
                <p className="font-medium">FSSAI Lic. No: 12424999000142</p>
                <p className="pt-1 text-[10px] text-stone-800">
                  Contact: +91 94440 12345 | care@seethapaati.com
                </p>
              </div>
            </div>

            {/* TO Box */}
            <div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-stone-600">
                TO (CONSIGNEE):
              </span>
              <div className="mt-1 space-y-0.5 text-xs">
                <p className="font-bold text-sm text-black">
                  {addr.fullName || 'Patron Consignee'}
                </p>
                <p>{addr.addressLine1 || '—'}</p>
                {addr.addressLine2 && <p>{addr.addressLine2}</p>}
                <p>
                  {addr.city || '—'}, {addr.state || '—'}
                </p>

                {/* Bold Monospace PIN Code Highlight */}
                <div className="my-1.5 inline-block border-2 border-black bg-stone-100 px-3 py-1 font-mono text-base font-extrabold text-black">
                  PIN: {formattedPin}
                </div>

                <p className="font-bold text-[11px]">
                  Phone: {addr.phone || '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Order Details & Logistics */}
          <div className="my-3 grid grid-cols-3 gap-2 border-b-2 border-black pb-3 text-[11px]">
            <div>
              <span className="text-[9px] uppercase tracking-wider text-stone-500">Order Ref:</span>
              <p className="font-mono font-bold text-xs">{order.orderNumber}</p>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-stone-500">Booking Date:</span>
              <p className="font-medium">
                {new Date(order.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-stone-500">Payment Status:</span>
              <p className="font-bold uppercase text-black">
                {isPrepaid ? 'PREPAID — DO NOT COLLECT CASH' : 'COLLECT CASH ON DELIVERY'}
              </p>
            </div>
          </div>

          {/* Items Manifest Table */}
          <div className="border-b-2 border-black pb-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-stone-600">
              PARCEL MANIFEST & CONTENTS:
            </span>
            <table className="mt-1.5 w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-black text-[9px] font-bold uppercase">
                  <th className="py-1">Item Description</th>
                  <th className="py-1 text-center">Qty</th>
                  <th className="py-1 text-right">Declared Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-1 font-medium">{item.productNameSnapshot}</td>
                    <td className="py-1 text-center font-mono">× {item.quantity}</td>
                    <td className="py-1 text-right text-stone-600">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer Notice */}
          <div className="mt-3 flex items-center justify-between text-[10px] text-stone-600">
            <span>Dispatched via India Post Speed Post Network</span>
            <span className="font-bold text-black">
              Total Declared Value: ₹{(order.grandTotalCents / 100).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
