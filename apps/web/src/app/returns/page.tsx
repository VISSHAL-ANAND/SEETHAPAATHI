import { BUSINESS_INFO } from '../../lib/business-info';
import Link from 'next/link';
import { ShieldAlert, RefreshCw, CheckCircle, ArrowRight, MessageCircle, Mail } from 'lucide-react';

export const metadata = {
  title: 'Returns & Refund Policy | Seethapaati',
  description:
    'How to contact Seethapaati about damaged, incorrect or missing items and request a return or refund review.',
};

export default function ReturnsPage() {
  return (
    <main className="editorial-page mx-auto max-w-[1240px] px-4 pb-24 pt-10 sm:px-6 md:px-10 md:pb-32 md:pt-16">
      {/* Header */}
      <header className="max-w-3xl border-b border-[#E3DFD7] pb-8 md:pb-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B8860B]">
          Fair &amp; Transparent Terms
        </p>
        <h1 className="mt-3 font-serif text-4xl font-normal leading-[1.05] tracking-[-0.04em] text-[#181513] sm:text-6xl md:text-7xl">
          Returns &amp; Refunds
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#181513]/70 md:text-base">
          Contact our team promptly if an item is damaged, incorrect, missing or appears compromised. Requests are reviewed against the order details, item condition and applicable consumer protections.
        </p>
      </header>

      {/* Main Content Grid */}
      <div className="mt-10 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="space-y-10 text-sm leading-relaxed text-[#181513]/80">
          {/* Section 1: Food Safety Standard */}
          <section>
            <h2 className="font-serif text-2xl text-[#181513]">1. Food Hygiene &amp; Perishability Policy</h2>
            <p className="mt-3">
              Food products can require special handling for health and safety reasons. Return eligibility depends on the issue and item condition. This policy does not restrict remedies or rights that apply under Indian consumer law, including for defective, damaged, incorrect or misdescribed goods.
            </p>
          </section>

          {/* Section 2: Transit Damage & Quality Replacement Guarantee */}
          <section>
            <h2 className="font-serif text-2xl text-[#181513]">2. Damaged, Incorrect or Missing Items</h2>
            <p className="mt-3">
              If your order is damaged in transit, contains incorrect or missing items, or arrives with a compromised seal, contact support with your order number and clear evidence. The team will review the issue and confirm the available remedy under applicable law and the approved business policy.
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3 border border-[#E3DFD7] bg-white/60 p-4">
                <CheckCircle className="h-5 w-5 shrink-0 text-[#2E7D32] mt-0.5" />
                <div>
                  <p className="font-semibold text-[#181513]">Damaged or Broken in Transit</p>
                  <p className="text-xs text-[#181513]/70 mt-0.5">
                    If outer packaging is ruptured, a seal is breached, or an item is damaged during courier transportation.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 border border-[#E3DFD7] bg-white/60 p-4">
                <CheckCircle className="h-5 w-5 shrink-0 text-[#2E7D32] mt-0.5" />
                <div>
                  <p className="font-semibold text-[#181513]">Incorrect or Missing Items</p>
                  <p className="text-xs text-[#181513]/70 mt-0.5">
                    If you receive a variant or product different from your order confirmation, or if any part of your order is missing.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 border border-[#E3DFD7] bg-white/60 p-4">
                <CheckCircle className="h-5 w-5 shrink-0 text-[#2E7D32] mt-0.5" />
                <div>
                  <p className="font-semibold text-[#181513]">Defect in Freshness or Seal</p>
                  <p className="text-xs text-[#181513]/70 mt-0.5">
                    If an airtight lid or tin membrane arrives unsealed or compromised upon arrival.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: How to Claim */}
          <section>
            <h2 className="font-serif text-2xl text-[#181513]">3. How to Initiate a Replacement or Refund</h2>
            <p className="mt-3">
              Please contact support as soon as reasonably possible after delivery so the issue can be reviewed. This request guidance does not limit any statutory consumer rights.
            </p>
            <ol className="mt-3 list-decimal list-inside space-y-2 text-xs text-[#181513]/75">
              <li>
                Take a clear photograph or 10-second video of the damaged box, shipping label, and product seal.
              </li>
              <li>
                Send the media along with your Order Number (e.g. SP-2026-XXXX) via WhatsApp to{' '}
                <a
                  href={`https://wa.me/${BUSINESS_INFO.whatsappPhone}`}
                  className="font-semibold text-[#25D366] underline underline-offset-4"
                >
                  {BUSINESS_INFO.supportPhoneDisplay}
                </a>{' '}
                or email{' '}
                <a
                  href={`mailto:${BUSINESS_INFO.supportEmail}`}
                  className="font-semibold text-[#A66B18] underline underline-offset-4"
                >
                  {BUSINESS_INFO.supportEmail}
                </a>.
              </li>
            </ol>
            <p className="mt-3 text-xs text-[#181513]/70">
              Our support team will review the details and confirm the next steps. A replacement or refund is not considered approved until the team confirms it.
            </p>
          </section>

          {/* Section 4: Refund Processing */}
          <section>
            <h2 className="font-serif text-2xl text-[#181513]">4. Refund Settlement Timelines</h2>
            <p className="mt-3">
              If a refund is approved, it is submitted through the configured payment gateway. The time for the amount to appear in your account depends on the payment provider and issuing bank:
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-[#181513]/70">
              <li>
                <strong>UPI &amp; NetBanking:</strong> Settlement timing varies by payment provider and bank.
              </li>
              <li>
                <strong>Debit / Credit Cards:</strong> Settlement timing varies by card network and issuing bank.
              </li>
            </ul>
          </section>
        </div>

        {/* Right Aside */}
        <aside className="space-y-6">
          <div className="border border-[#181513] bg-white/70 p-6 sm:p-8">
            <RefreshCw className="h-8 w-8 text-[#B8860B]" />
            <h3 className="mt-3 font-serif text-2xl text-[#181513]">Direct Resolution</h3>
            <p className="mt-2 text-xs leading-relaxed text-[#181513]/70">
              We never make our customers jump through endless bureaucratic hoops. Speak directly with our kitchen support team.
            </p>
            <div className="mt-6 space-y-3">
              <a
                href={`https://wa.me/${BUSINESS_INFO.whatsappPhone}`}
                className="flex h-12 w-full items-center justify-center gap-2 bg-[#181513] text-xs font-semibold uppercase tracking-[0.2em] text-[#F7F5F0] transition hover:bg-[#25D366]"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp Helpline
              </a>
              <Link
                href="/contact"
                className="flex h-12 w-full items-center justify-center gap-2 border border-[#181513] text-xs font-semibold uppercase tracking-[0.2em] text-[#181513] transition hover:bg-[#181513] hover:text-[#F7F5F0]"
              >
                Contact Form
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
