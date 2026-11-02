import { BUSINESS_INFO } from '../../lib/business-info';
import Link from 'next/link';
import { ShieldCheck, Scale, AlertTriangle, FileText, CheckCircle } from 'lucide-react';

export const metadata = {
  title: 'Terms & Conditions (Comprehensive Legal Agreement) | Seethapaati',
  description:
    `Terms of service, limitation of liability, allergen disclosures and dispute terms for ${BUSINESS_INFO.legalEntityName}.`,
};

export default function TermsPage() {
  return (
    <main className="editorial-page mx-auto max-w-[1180px] px-4 pb-24 pt-10 sm:px-6 md:px-10 md:pb-32 md:pt-16">
      {/* Header */}
      <header className="max-w-3xl border-b border-[#E3DFD7] pb-8 md:pb-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B8860B]">
          Binding Legal Contract
        </p>
        <h1 className="mt-3 font-serif text-4xl font-normal leading-[1.05] tracking-[-0.04em] text-[#181513] sm:text-6xl md:text-7xl">
          Terms &amp; Conditions
        </h1>
        <p className="mt-4 text-xs font-medium text-[#181513]/70 leading-relaxed sm:text-sm">
          <strong>Entity:</strong> {BUSINESS_INFO.legalEntityName}{BUSINESS_INFO.registrationNumber ? ` (${BUSINESS_INFO.registrationLabel}: ${BUSINESS_INFO.registrationNumber})` : ''} • FSSAI Lic. No: {BUSINESS_INFO.fssaiLicenseNumber}<br />
          <strong>Registered Office:</strong> {BUSINESS_INFO.registeredOffice}<br />
          <strong>Effective Date:</strong> January 1, 2026 • Governed under the laws of the Republic of India.
        </p>
      </header>

      {/* Critical Legal Summary Box */}
      <div className="mt-8 border border-[#B8860B]/40 bg-[#B8860B]/5 p-5 text-xs leading-relaxed text-[#181513] sm:p-6">
        <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-[#A66B18]">
          <ShieldCheck className="h-4 w-4" />
          <span>Notice of Binding Arbitration &amp; Limitation of Liability</span>
        </div>
        <p className="mt-2 text-[#181513]/80">
          PLEASE READ THESE TERMS CAREFULLY. BY BROWSING, REGISTERING, PURCHASING, OR OTHERWISE ACCESSING THIS STORE, YOU ENTER INTO A LEGALLY BINDING CONTRACT WITH {BUSINESS_INFO.legalEntityName.toUpperCase()}. THESE TERMS CONTAIN A STRICT <strong>LIMITATION OF AGGREGATE LIABILITY CAPPED AT THE PURCHASE PRICE OF YOUR ORDER</strong>, MANDATORY INDIVIDUAL ARBITRATION IN CHENNAI, WAIVERS OF CLASS ACTION CLAIMS, AND COMPREHENSIVE ALLERGEN &amp; HEALTH DISCLAIMERS. IF YOU DO NOT AGREE, DO NOT PROCEED WITH ANY PURCHASE.
        </p>
      </div>

      {/* Main Legal Clauses */}
      <div className="mt-12 space-y-12 text-sm leading-relaxed text-[#181513]/80">
        {/* Section 1 */}
        <section>
          <h2 className="font-serif text-2xl text-[#181513]">1. Legal Capacity &amp; Click-Wrap Consent</h2>
          <p className="mt-2">
            By creating an account, clicking &ldquo;Proceed to Payment&rdquo;, &ldquo;Add to Bag&rdquo;, or checking the terms acceptance checkbox at checkout, you represent and warrant that:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1.5 text-xs text-[#181513]/75">
            <li>You are at least eighteen (18) years of age and legally competent to contract under the Indian Contract Act, 1872.</li>
            <li>You are purchasing products solely for personal, bona fide domestic consumption and not for commercial resale, distribution, relabeling, or unauthorized alteration.</li>
            <li>All registration, delivery, and payment information supplied by you is authentic, complete, and current.</li>
          </ul>
          <p className="mt-2 text-xs">
            This agreement satisfies all requirements for electronic contracts under Section 10A of the Information Technology Act, 2000.
          </p>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="font-serif text-2xl text-[#181513]">2. Strict Limitation of Aggregate Liability</h2>
          <div className="mt-3 border-l-2 border-[#181513] pl-4 text-xs font-medium uppercase tracking-wide text-[#181513]">
            Maximum Financial Cap on Damages
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#181513]/85 sm:text-sm">
            TO THE MAXIMUM EXTENT PERMITTED UNDER APPLICABLE INDIAN LAW, UNDER NO CIRCUMSTANCES SHALL {BUSINESS_INFO.legalEntityName.toUpperCase()}, ITS FOUNDERS, DIRECTORS, SHAREHOLDERS, EMPLOYEES, AFFILIATES, AGENTS, OR SUPPLIERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, PUNITIVE, OR EXEMPLARY DAMAGES (INCLUDING LOSS OF REVENUE, LOSS OF PROFITS, GOODWILL, REPUTATIONAL DAMAGE, LOSS OF DATA, OR EXPENSES OF ALTERNATIVE GOODS PROCUREMENT), HOWEVER CAUSED AND UNDER ANY THEORY OF LIABILITY (WHETHER IN CONTRACT, TORT, STRICT LIABILITY, NEGLIGENCE, STATUTORY WARRANTY, CONSUMER PROTECTION CLAIM, OR OTHERWISE), EVEN IF INFORMED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-[#181513]/85 sm:text-sm">
            <strong>ABSOLUTE MAXIMUM AGGREGATE RECOVERY:</strong> IN ALL CIRCUMSTANCES, SEETHAPAATI&apos;S TOTAL AGGREGATE FINANCIAL LIABILITY FOR ANY AND ALL CLAIMS, DISPUTES, INJURIES, OR LOSSES ARISING OUT OF OR RELATING TO THE PRODUCTS, PACKAGING, SERVICES, OR THESE TERMS SHALL BE STRICTLY AND ABSOLUTELY CAPPED AT <strong>THE ACTUAL AMOUNT PAID BY THE CUSTOMER FOR THE SPECIFIC ORDER GIVING RISE TO THE CLAIM</strong> (OR ₹500, WHICHEVER IS LOWER).
          </p>
        </section>

        {/* Section 3 */}
        <section>
          <h2 className="font-serif text-2xl text-[#181513]">3. Dietary, Allergen &amp; Health Non-Medicinal Disclaimer</h2>
          <p className="mt-2">
            Our products comprise artisanal culinary staples, roasted seed powders, spices, and dried pantry blends prepared using traditional South Indian methods.
          </p>
          <div className="mt-3 space-y-2 border border-[#E3DFD7] bg-white/60 p-4 text-xs">
            <p>
              <strong>FSSAI Non-Medicinal Declaration:</strong> Our products are categorized and licensed as traditional edible food provisions under FSSAI regulations. <strong>THEY ARE NOT DRUGS, MEDICINES, OR MEDICAL SUPPLEMENTS.</strong> No product, description, narrative, or communication on this website is intended to diagnose, treat, prevent, mitigate, or cure any disease, ailment, or medical disorder within the meaning of the Drugs and Cosmetics Act, 1940 or the Drugs and Magic Remedies (Objectionable Advertisements) Act, 1954.
            </p>
            <p>
              <strong>Universal Allergen Warning:</strong> All provisions are prepared in an artisanal kitchen facility that routinely handles allergens, including <strong>sesame seeds (til), peanuts, tree nuts, mustard seeds, dairy (ghee), and pulses</strong>. Traces of these allergens may be present in any product.
            </p>
            <p>
              <strong>Assumption of Risk:</strong> The customer bears sole responsibility for carefully reading ingredient listings prior to ordering or consumption. Seethapaati disclaims all liability for individual adverse reactions, food intolerances, anaphylaxis, allergies, or idiosyncratic health reactions. If you suffer from known medical conditions or food allergies, consult a registered physician before consuming.
            </p>
          </div>
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="font-serif text-2xl text-[#181513]">4. Artisanal Heritage &amp; Natural Harvest Variance</h2>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            Because our spices and podis are stone-ground in small batches without artificial colors, emulsifiers, chemical stabilizers, or anti-caking agents, natural variations in aroma, color intensity (due to sun-drying batches), coarseness, or settling during transit are expected and inherent characteristics of pure agricultural food. Such natural variances do not constitute a defect, deterioration, or non-conformance of goods.
          </p>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="font-serif text-2xl text-[#181513]">5. Pricing, GST Invoicing &amp; Authoritative Orders</h2>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            All prices are stated in Indian Rupees (₹, INR). Applicable GST is calculated from the configured HSN tax rate for each item and is displayed separately in the checkout breakdown. The final checkout total includes the applicable tax and shipping charges. Product listings, descriptions, and pricing are subject to correction without prior notice. While we strive for accuracy, in the event of an inadvertent typographical error or system anomaly displaying an incorrect price or out-of-stock item, we reserve the right to cancel the order and provide an immediate full refund to the original payment source.
          </p>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            Order placement constitutes an offer to purchase; acceptance occurs only when payment verification succeeds and a dispatch confirmation invoice is generated.
          </p>
        </section>

        {/* Section 6 */}
        <section>
          <h2 className="font-serif text-2xl text-[#181513]">6. Logistics, Delivery &amp; Force Majeure Immunity</h2>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            Shipping and delivery are executed through vetted third-party logistics aggregators and national couriers (e.g. Bluedart, Delhivery, DTDC, India Post).
          </p>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            <strong>Force Majeure:</strong> Seethapaati shall not be deemed in breach of contract or liable for delay, damage, or non-delivery resulting directly or indirectly from acts of God, flood, drought, earthquake, cyclone, pandemic, epidemic, acts of war, civil commotion, strikes, transport blockades, courier hub lockouts, road closures, power grid failures, telecommunication disruptions, or statutory embargoes.
          </p>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            <strong>Title &amp; Risk:</strong> Title transfers to the customer upon delivery scan by the courier. Customers are protected exclusively by our{' '}
            <Link href="/returns" className="font-semibold text-[#A66B18] underline underline-offset-4">
              7-Day Transit Damage Replacement Guarantee
            </Link>.
          </p>
        </section>

        {/* Section 7 */}
        <section>
          <h2 className="font-serif text-2xl text-[#181513]">7. Customer Indemnification</h2>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            You agree to defend, indemnify, and hold harmless {BUSINESS_INFO.legalEntityName}, its directors, officers, employees, and licensors from and against any and all claims, demands, liabilities, damages, penalties, fines, costs, and expenses (including reasonable attorney and litigation fees) arising out of or related to:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-[#181513]/75">
            <li>Your breach of any provision of these Terms or applicable laws;</li>
            <li>Your improper storage, adulteration, or preparation of products contrary to packaging instructions;</li>
            <li>Your provision of inaccurate, fraudulent, or outdated shipping, tax, or payment credentials;</li>
            <li>Any third-party claim arising from your unauthorized redistribution or resale of products.</li>
          </ul>
        </section>

        {/* Section 8 */}
        <section>
          <h2 className="font-serif text-2xl text-[#181513]">8. Intellectual Property &amp; Brand Protection</h2>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            The name &ldquo;SEETHAPAATI&rdquo;, the logo, branding elements, bespoke packaging design, product formulations, recipe copy, digital artwork, and typography are protected trademarks and intellectual property of {BUSINESS_INFO.legalEntityName} under the Trade Marks Act, 1999 and the Copyright Act, 1957. Any unauthorized reproduction, scraping, deep-linking, reverse engineering, or commercial use is strictly prohibited and subject to civil injunctions and criminal prosecution.
          </p>
        </section>

        {/* Section 9 */}
        <section>
          <h2 className="font-serif text-2xl text-[#181513]">9. Mandatory 2-Tier Dispute Resolution &amp; Chennai Arbitration</h2>
          <div className="mt-3 space-y-3 text-xs leading-relaxed text-[#181513]/85 sm:text-sm">
            <p>
              <strong>Tier 1 — Mandatory Informal Conciliation:</strong> Prior to initiating any formal legal or administrative proceeding, you agree to submit a written statement of dispute to our Grievance Redressal Desk at <code>{BUSINESS_INFO.legalEmail}</code>. The parties agree to engage in good-faith negotiations for thirty (30) business days.
            </p>
            <p>
              <strong>Tier 2 — Sole &amp; Exclusive Binding Arbitration:</strong> If the dispute is not resolved during the conciliation period, it shall be finally resolved by binding arbitration conducted under the provisions of the <strong>Arbitration and Conciliation Act, 1996</strong> (as amended). The arbitration shall be conducted by a sole arbitrator mutually agreed upon or appointed in accordance with the Act. The seat and venue of arbitration shall be <strong>Chennai, Tamil Nadu, India</strong>. The language of arbitration shall be English. The arbitrator&apos;s award shall be final, conclusive, and binding on both parties.
            </p>
            <p>
              <strong>Exclusive Judicial Jurisdiction:</strong> Subject to the arbitration clause, the courts of competent jurisdiction located exclusively in <strong>Chennai, Tamil Nadu, India</strong> shall have sole and exclusive jurisdiction over any proceeding arising out of or in connection with these Terms.
            </p>
            <p>
              <strong>Waiver of Class Action:</strong> All disputes shall be resolved on an individual basis. You waive any right to bring or participate in any class action, collective suit, representative proceeding, or private attorney general action against Seethapaati.
            </p>
          </div>
        </section>

        {/* Section 10 */}
        <section className="border-t border-[#E3DFD7] pt-8">
          <h2 className="font-serif text-2xl text-[#181513]">10. Statutory Grievance Redressal Officer</h2>
          <p className="mt-2 text-xs leading-relaxed text-[#181513]/70">
            In compliance with the <strong>Consumer Protection (E-Commerce) Rules, 2020</strong> and Rule 3(2) of the <strong>Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</strong>, the designated Nodal and Grievance Officer is:
          </p>
          <div className="mt-4 border border-[#E3DFD7] bg-white/70 p-5 text-xs text-[#181513]">
            <p><strong>Grievance Officer:</strong> {BUSINESS_INFO.grievanceOfficerName}</p>
            <p className="mt-1"><strong>Company:</strong> {BUSINESS_INFO.legalEntityName}</p>
            {BUSINESS_INFO.registrationNumber ? <p className="mt-1"><strong>{BUSINESS_INFO.registrationLabel}:</strong> {BUSINESS_INFO.registrationNumber}</p> : null}
            <p className="mt-1"><strong>FSSAI Registration / License:</strong> {BUSINESS_INFO.fssaiLicenseNumber}</p>
            <p className="mt-1"><strong>Registered Address:</strong> {BUSINESS_INFO.registeredOffice}</p>
            <p className="mt-1"><strong>Email:</strong> {BUSINESS_INFO.grievanceEmail} / {BUSINESS_INFO.legalEmail}</p>
            <p className="mt-1"><strong>Helpline / Phone:</strong> {BUSINESS_INFO.supportPhoneDisplay}</p>
            <p className="mt-2 text-[11px] text-[#181513]/60 italic">
              Statutory timeline: Acknowledgement of consumer grievance within 48 hours; resolution within 1 month from date of receipt.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
