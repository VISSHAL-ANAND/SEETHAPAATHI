import { BUSINESS_INFO } from '../../lib/business-info';
import Link from 'next/link';
import { Truck, ShieldCheck, Clock, MapPin, PackageCheck, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Shipping & Delivery Policy | Seethapaati',
  description:
    'Comprehensive delivery terms for Seethapaati heirloom foods. Pan-India shipping with complimentary delivery on orders above ₹499 and live courier tracking.',
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
          Every parcel leaves our Mylapore kitchen packaged with artisanal care. Here is everything you need to know about delivery timelines, shipping charges, and tracking.
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
                  <span className="font-semibold text-[#181513]">Orders above ₹499</span>
                  <span className="font-semibold text-[#2E7D32] uppercase tracking-wider text-xs">
                    Free Delivery
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#181513]/60">
                  Complimentary express courier delivery anywhere across India.
                </p>
              </div>

              <div className="border border-[#E3DFD7] bg-white/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#181513]">Orders below ₹499</span>
                  <span className="font-semibold text-[#181513] tabular-nums">
                    ₹49 Flat Rate
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#181513]/60">
                  Nominal fee covering protective packaging and courier handling.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2: Dispatch & Transit */}
          <section>
            <h2 className="font-serif text-2xl text-[#181513]">2. Dispatch Windows &amp; Estimated Transit Times</h2>
            <p className="mt-3">
              Because our podis and spices are freshly milled in small batches without artificial anti-caking agents, orders are packed fresh and dispatched within <strong>24 to 48 business hours</strong> from our Chennai kitchen (excluding Sundays and national holidays).
            </p>

            <div className="mt-4 overflow-hidden border border-[#E3DFD7]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#ECE8E0] text-[#181513] uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="p-3">Destination Region</th>
                    <th className="p-3">Estimated Transit Window</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3DFD7] bg-white/40">
                  <tr>
                    <td className="p-3 font-medium text-[#181513]">Chennai &amp; Tamil Nadu</td>
                    <td className="p-3 text-[#181513]/70">1 to 2 business days</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-[#181513]">South India Metros (Bengaluru, Hyderabad, Kochi)</td>
                    <td className="p-3 text-[#181513]/70">2 to 3 business days</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-[#181513]">West &amp; North Metros (Mumbai, Delhi NCR, Pune, Kolkata)</td>
                    <td className="p-3 text-[#181513]/70">3 to 4 business days</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-[#181513]">Rest of India &amp; Tier 2/3 Regions</td>
                    <td className="p-3 text-[#181513]/70">4 to 6 business days</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Couriers & Live Tracking */}
          <section>
            <h2 className="font-serif text-2xl text-[#181513]">3. Courier Partners &amp; Live Tracking</h2>
            <p className="mt-3">
              We dispatch 100% of our orders via India Post (Speed Post & Registered Parcel), guaranteeing reliable, state-backed delivery to every postal code across India.
            </p>
            <p className="mt-2">
              As soon as your package is scanned at the hub, an automated SMS and WhatsApp update with your live tracking AWB link will be dispatched to your phone. You can also monitor your parcel status directly on our{' '}
              <Link href="/tracking" className="font-semibold text-[#A66B18] underline underline-offset-4">
                Self-Service Tracking Portal
              </Link>.
            </p>
          </section>

          {/* Section 4: Protective Packaging */}
          <section>
            <h2 className="font-serif text-2xl text-[#181513]">4. Transit-Grade Packaging Guarantee</h2>
            <p className="mt-3">
              To guarantee that fragile spices and oils arrive completely intact and fresh, every tin is hermetically sealed and placed inside thick corrugated mailers cushioned with 100% recyclable, biodegradable filler. In the rare event of transit damage, our immediate replacement policy protects every parcel.
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
