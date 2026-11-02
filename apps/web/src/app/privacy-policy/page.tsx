import { BUSINESS_INFO } from '../../lib/business-info';
import Link from 'next/link';
import { ShieldCheck, Lock, FileText, Database } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy (DPDP Act & IT Act Compliant) | Seethapaati',
  description:
    'Comprehensive data privacy policy governing customer information, payment encryption, and data rights under the Digital Personal Data Protection Act, 2023 and Information Technology Act, 2000.',
};

export default function PrivacyPage() {
  return (
    <main className="editorial-page mx-auto max-w-[1180px] px-4 pb-24 pt-10 sm:px-6 md:px-10 md:pb-32 md:pt-16">
      {/* Header */}
      <header className="max-w-3xl border-b border-[#E3DFD7] pb-8 md:pb-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B8860B]">
          Data Governance &amp; Security
        </p>
        <h1 className="mt-3 font-serif text-4xl font-normal leading-[1.05] tracking-[-0.04em] text-[#181513] sm:text-6xl md:text-7xl">
          Privacy Policy
        </h1>
        <p className="mt-4 text-xs font-medium text-[#181513]/70 leading-relaxed sm:text-sm">
          <strong>Data Fiduciary:</strong> {BUSINESS_INFO.legalEntityName}{BUSINESS_INFO.registrationNumber ? ` (${BUSINESS_INFO.registrationLabel}: ${BUSINESS_INFO.registrationNumber})` : ''}<br />
          <strong>Statutory Compliance:</strong> Digital Personal Data Protection Act, 2023 (DPDP Act) &amp; Information Technology Act, 2000.<br />
          <strong>Effective Date:</strong> January 1, 2026 • Last Updated: October 2026.
        </p>
      </header>

      {/* Trust Callout */}
      <div className="mt-8 border border-[#2E7D32]/30 bg-[#2E7D32]/5 p-5 text-xs leading-relaxed text-[#181513] sm:p-6">
        <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-[#2E7D32]">
          <ShieldCheck className="h-4 w-4" />
          <span>Zero-Brokerage Data Integrity Standard</span>
        </div>
        <p className="mt-2 text-[#181513]/80">
          {BUSINESS_INFO.legalEntityName.toUpperCase()} NEVER SELLS, LEASES, MONETIZES, OR DISTRIBUTES YOUR PERSONAL DATA TO THIRD-PARTY ADVERTISERS OR MARKETING BROKERS. DATA IS COLLECTED EXCLUSIVELY FOR FULFILLING YOUR ORDERS, COMPLYING WITH INDIAN TAX LAWS (GST), AND PROVIDING DIRECT CUSTOMER CARE.
        </p>
      </div>

      {/* Sections */}
      <div className="mt-12 space-y-12 text-sm leading-relaxed text-[#181513]/80">
        <section>
          <h2 className="font-serif text-2xl text-[#181513]">1. Regulatory Framework &amp; Consent</h2>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            This Policy constitutes a legal notice under the <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong>, the <strong>Information Technology Act, 2000</strong>, and the <strong>Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011</strong>.
          </p>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            By creating an account, browsing our store, or placing an order, you provide explicit, affirmative, and informed consent for the collection, storage, and processing of your personal data strictly for the specified lawful purposes outlined below.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">2. Categories of Personal Data Collected</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 text-xs">
            <div className="border border-[#E3DFD7] bg-white/60 p-4">
              <p className="font-semibold text-[#181513] uppercase tracking-wider">A. Identity &amp; Contact</p>
              <p className="mt-1 text-[#181513]/70">
                Full legal name, email address, mobile telephone number for courier tracking notifications and customer care authentication.
              </p>
            </div>
            <div className="border border-[#E3DFD7] bg-white/60 p-4">
              <p className="font-semibold text-[#181513] uppercase tracking-wider">B. Delivery Coordinates</p>
              <p className="mt-1 text-[#181513]/70">
                House/street address, city, state, postal PIN code, and 2-digit GST state code necessary for freight transit and tax calculation.
              </p>
            </div>
            <div className="border border-[#E3DFD7] bg-white/60 p-4">
              <p className="font-semibold text-[#181513] uppercase tracking-wider">C. Transaction Records</p>
              <p className="mt-1 text-[#181513]/70">
                Purchased item lines, batch numbers, tax invoices, timestamps, order amounts, and payment verification identifiers.
              </p>
            </div>
            <div className="border border-[#E3DFD7] bg-white/60 p-4">
              <p className="font-semibold text-[#181513] uppercase tracking-wider">D. Technical Telemetry</p>
              <p className="mt-1 text-[#181513]/70">
                IP address, browser type, and cryptographically signed session cookies strictly necessary to maintain your shopping cart and security tokens.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">3. Payment Data Security &amp; Tokenization</h2>
          <div className="mt-3 border-l-2 border-[#181513] pl-4 text-xs font-medium uppercase tracking-wide text-[#181513]">
            Strict Non-Storage of Financial Instruments
          </div>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            <strong>WE DO NOT STORE OR PROCESS RAW FINANCIAL CREDENTIALS.</strong> Your full 16-digit debit/credit card numbers, CVVs, card expiration dates, bank netbanking passwords, and UPI PINs are NEVER processed, transmitted, or stored on Seethapaati servers.
          </p>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            Payment transactions are executed through Razorpay, an authorized payment aggregator certified under <strong>PCI-DSS Level 1</strong> and regulated by the <strong>Reserve Bank of India (RBI)</strong>. All transmissions use end-to-end 256-bit TLS encryption.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">4. Lawful Purpose &amp; Data Minimization</h2>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            Under the principle of purpose limitation, your personal data is utilized strictly for:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1.5 text-xs text-[#181513]/75">
            <li>Generating statutory tax invoices complying with Section 31 of the Central Goods and Services Tax Act, 2017.</li>
            <li>Preparing shipments with the carrier selected for the order and providing the available consignment/tracking information.</li>
            <li>Direct concierge resolution of refund, replacement, or inquiry requests.</li>
            <li>Preventing fraudulent orders, chargebacks, and cyber security incidents.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">5. Third-Party Disclosures &amp; Cross-Border Transfers</h2>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            We share only essential, minimal operational data with contractually bound processors:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-[#181513]/75">
            <li><strong>Courier Partners:</strong> Name, delivery destination, and contact phone (solely to complete doorstep delivery).</li>
            <li><strong>SMS &amp; WhatsApp Gateways:</strong> Telephone number (solely for transactional order dispatch and tracking updates).</li>
            <li><strong>Statutory Authorities:</strong> If required by a valid judicial court order, warrant, or governmental investigative agency under applicable Indian law.</li>
          </ul>
          <p className="mt-2 text-xs text-[#181513]/70">
            We store our customer database within secure Indian data center facilities complying with local data localization directives.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">6. Statutory Data Retention Limits</h2>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            In compliance with Section 128 of the Companies Act, 2013 and Rule 56 of the CGST Rules, 2017, books of account and related order invoice records must be preserved for a statutory duration of <strong>eight (8) years</strong>. Non-statutory behavioral telemetry or temporary cart state is automatically purged or anonymized within 90 days.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">7. Your Rights as a Data Principal</h2>
          <p className="mt-2 text-xs leading-relaxed sm:text-sm">
            Under Chapter III of the Digital Personal Data Protection Act, 2023, you enjoy the following rights:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-[#181513]/75">
            <li><strong>Right to Access:</strong> Request a summary of your personal data processed by Seethapaati.</li>
            <li><strong>Right to Correction &amp; Erasure:</strong> Request the rectification of inaccurate data or deletion of your customer profile (subject to statutory tax retention mandates).</li>
            <li><strong>Right to Grievance Redressal:</strong> Submit a complaint directly to our Data Protection Desk.</li>
            <li><strong>Right to Nominate:</strong> Nominate an individual to exercise rights on your behalf in the event of death or incapacity.</li>
          </ul>
          <p className="mt-3 text-xs">
            To exercise any of these rights, email our Data Protection Officer at <code>{BUSINESS_INFO.privacyEmail}</code>. Requests are acknowledged within 48 hours and processed within thirty (30) days.
          </p>
        </section>

        <section className="border-t border-[#E3DFD7] pt-8">
          <h2 className="font-serif text-2xl text-[#181513]">8. Designated Grievance &amp; Data Protection Officer</h2>
          <div className="mt-4 border border-[#E3DFD7] bg-white/70 p-5 text-xs text-[#181513]">
            <p><strong>Nodal Officer:</strong> {BUSINESS_INFO.grievanceOfficerName}</p>
            <p className="mt-1"><strong>Entity:</strong> {BUSINESS_INFO.legalEntityName}</p>
            {BUSINESS_INFO.registrationNumber ? <p className="mt-1"><strong>{BUSINESS_INFO.registrationLabel}:</strong> {BUSINESS_INFO.registrationNumber}</p> : null}
            <p className="mt-1"><strong>Registered Office:</strong> {BUSINESS_INFO.registeredOffice}</p>
            <p className="mt-1"><strong>Email:</strong> {BUSINESS_INFO.privacyEmail} / {BUSINESS_INFO.grievanceEmail}</p>
            <p className="mt-1"><strong>Helpline:</strong> {BUSINESS_INFO.supportPhoneDisplay}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
