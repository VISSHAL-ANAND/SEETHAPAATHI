import { BUSINESS_INFO } from '../../lib/business-info';
import Link from 'next/link';
import { Truck, ShieldCheck, Clock, MapPin, PackageCheck, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Shipping & Delivery Policy | Seethapaati',
  description:
    'Shipping charges, dispatch information and current carrier tracking capabilities for Seethapaati orders.',
};

export default function ShippingPage() {
  return (
    <main className="editorial-page mx-auto max-w-[1240px] px-4 pb-24 pt-10 sm:px-6 md:px-10 md:pb-32 md:pt-16">
      {/* Header */}
      <header className="max-w-3xl border-b border-[#E3DFD7] pb-8 md:pb-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B8860B]">
          Direct Delivery Standards
        </p>
        <h1 className="mt-3 font-serif text-4xl font-normal leading-[1.05] tracking-[-0.04em] text-[#181513] sm:text-6xl md:text-7xl">
          Shipping &amp; Delivery
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#181513]/70 md:text-base">
          Delivery options, dispatch information and tracking availability depend on the order and destination. Shipping charges are calculated at checkout.
        </p>
      </header>

      {/* Grid */}
      <div className="mt-10 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="space-y-10 text-sm leading-relaxed text-[#181513]/80">
          {/* Section 1: Rates */}
          <section>
            <h2 className="font-serif text-2xl text-[#181513]">1. Shipping Rates &amp; Free Delivery Threshold</h2>
            <div className="mt-4 space-y-3">
              <div className="border border-[#E3DFD7] bg-white/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#181513]">Orders of ₹500 or more</span>
                  <span className="font-semibold text-[#2E7D32] uppercase tracking-wider text-xs">
                    Free Delivery
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#181513]/60">
                  Free standard shipping when the post-discount merchandise value is ₹500 or more.
                </p>
              </div>

              <div className="border border-[#E3DFD7] bg-white/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#181513]">Orders below ₹500</span>
                  <span className="font-semibold text-[#181513] tabular-nums">
                    ₹50 Standard Shipping
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#181513]/60">
                  Standard shipping charge for orders below the free-shipping threshold.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2: Dispatch & Transit */}
          <section>
            <h2 className="font-serif text-2xl text-[#181513]">2. Dispatch Windows &amp; Estimated Transit Times</h2>
            <p className="mt-3">
              Orders are prepared for dispatch after payment confirmation. Actual packing and handover times can vary with stock availability, order volume and operating days. Any estimate shared with an order is indicative, not a guaranteed delivery time.
            </p>

            <p className="mt-3">
              Transit time depends on the destination, selected postal service and carrier operations. The storefront does not currently receive live India Post route estimates, so it cannot promise a fixed delivery window before dispatch.
            </p>
          </section>

          {/* Section 3: Couriers & Live Tracking */}
          <section>
            <h2 className="font-serif text-2xl text-[#181513]">3. Carrier &amp; Tracking Status</h2>
            <p className="mt-3">
              India Post is the carrier currently supported by the manual dispatch workflow. A live India Post CEPt booking or route-serviceability integration is not enabled. A valid PIN-code format alone does not confirm that the selected service can deliver to a destination.
            </p>
            <p className="mt-2">
              As soon as your package is scanned at the hub, an automated SMS and WhatsApp update with your live tracking AWB link will be dispatched to your phone. You can also monitor your parcel status directly on our{' '}
              <Link href="/tracking" className="font-semibold text-[#A66B18] underline underline-offset-4">
                Order Tracking
              </Link>.
            </p>
          </section>

          {/* Section 4: Protective Packaging */}
          <section>
            <h2 className="font-serif text-2xl text-[#181513]">4. Preparing Orders for Transit</h2>
            <p className="mt-3">
              We take care when preparing orders for transit. If an order arrives damaged or an item is missing, contact support with your order number and clear photos so the team can review the issue under the published returns policy.
            </p>
          </section>
        </div>

        {/* Right Aside */}
        <aside className="space-y-6">
          <div className="border border-[#181513] bg-white/70 p-6 sm:p-8">
            <PackageCheck className="h-8 w-8 text-[#B8860B]" />
            <h3 className="mt-3 font-serif text-2xl text-[#181513]">Track An Existing Order</h3>
            <p className="mt-2 text-xs leading-relaxed text-[#181513]/70">
              Need immediate visibility on your dispatch? Enter your order number and phone to view live carrier checkpoint updates.
            </p>
            <div className="mt-6">
              <Link
                href="/tracking"
                className="inline-flex h-12 w-full items-center justify-center gap-2 bg-[#181513] text-xs font-semibold uppercase tracking-[0.2em] text-[#F7F5F0] transition hover:bg-[#B8860B]"
              >
                Track Live Order <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="border border-[#E3DFD7] bg-white/50 p-6 text-xs text-[#181513]/75 space-y-3">
            <p className="font-semibold uppercase tracking-wider text-[#181513]">Delivery Inquiries</p>
            <p>
              Experiencing an unexpected transit delay or need an address correction? Contact our concierge team immediately:
            </p>
            <p className="font-medium text-[#181513]">
              Email: {BUSINESS_INFO.supportEmail}<br />
              WhatsApp: {BUSINESS_INFO.supportPhoneDisplay}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
