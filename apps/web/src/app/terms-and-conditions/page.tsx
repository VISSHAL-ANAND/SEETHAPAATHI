import { BUSINESS_INFO } from '../../lib/business-info';
import Link from 'next/link';

export const metadata = {
  title: 'Terms & Conditions | Seethapaati',
  description: `Store terms covering orders, product information, payment, delivery, returns and customer support for ${BUSINESS_INFO.legalEntityName}.`,
};

export default function TermsPage() {
  return (
    <main className="editorial-page mx-auto max-w-[1180px] px-4 pb-24 pt-10 sm:px-6 md:px-10 md:pb-32 md:pt-16">
      <header className="max-w-3xl border-b border-[#E3DFD7] pb-8 md:pb-12">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B8860B]">
          Store information
        </p>
        <h1 className="mt-3 font-serif text-4xl font-normal leading-[1.05] tracking-[-0.04em] text-[#181513] sm:text-6xl md:text-7xl">
          Terms &amp; Conditions
        </h1>
        <p className="mt-4 text-xs font-medium text-[#181513]/70 leading-relaxed sm:text-sm">
          <strong>Business:</strong> {BUSINESS_INFO.legalEntityName}<br />
          <strong>Registered Office:</strong> {BUSINESS_INFO.registeredOffice}<br />
          <strong>FSSAI Licence / Registration:</strong> {BUSINESS_INFO.fssaiLicenseNumber}<br />
          <strong>Effective date:</strong> The date this version is published.
        </p>
      </header>

      <div className="mt-8 border border-[#E3DFD7] bg-white/60 p-5 text-xs leading-relaxed text-[#181513] sm:p-6">
        These terms explain how orders are placed and fulfilled through this store. They are a general customer information document and do not remove or limit any rights or remedies available under applicable law. The business should obtain legal review of this page before publication.
      </div>

      <div className="mt-12 space-y-12 text-sm leading-relaxed text-[#181513]/80">
        <section>
          <h2 className="font-serif text-2xl text-[#181513]">1. Business and store information</h2>
          <p className="mt-2">
            This store is operated by {BUSINESS_INFO.legalEntityName}. Product availability, prices, shipping charges and order status are displayed during the shopping and checkout process. Please provide accurate account, delivery and contact information so that orders and support requests can be handled correctly.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">2. Product details, ingredients and allergens</h2>
          <p className="mt-2">
            Review the current product listing and packaging for ingredients, allergen declarations, net quantity, storage instructions and shelf-life information. Product details can vary by item or batch. Contact support before ordering if you need clarification about an ingredient. Customers with allergies or medical dietary requirements should rely on the product label and advice from a qualified health professional.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">3. Prices, tax, orders and payment</h2>
          <p className="mt-2">
            Prices are displayed in Indian Rupees. Applicable tax is calculated using the configured product tax classification and rate and is shown in the checkout breakdown. Shipping charges are also shown before an order is placed. The final amount payable is the amount presented at checkout.
          </p>
          <p className="mt-2">
            An order is confirmed only after the server verifies successful payment. A browser payment message by itself is not proof that payment has been received. If a payment or stock issue affects an order, the store will update the order status and handle any applicable refund through the configured payment provider.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">4. Shipping, dispatch and tracking</h2>
          <p className="mt-2">
            Available shipping charges and any delivery estimate are presented during checkout. Dispatch and transit times can vary with stock, destination, operating days and carrier operations. Estimates are indicative unless the store confirms a specific commitment for an order.
          </p>
          <p className="mt-2">
            The current store supports staff-entered India Post consignment and tracking information. Live India Post booking, route serviceability checks and automatic carrier tracking synchronization are not enabled. A valid PIN-code format alone does not confirm delivery serviceability.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">5. Returns and refunds</h2>
          <p className="mt-2">
            Please review our <Link href="/returns" className="font-semibold text-[#A66B18] underline underline-offset-4">Returns &amp; Refunds Policy</Link> for how to report damaged, incorrect or missing items and request a review. A refund is not approved until the store confirms it. When a refund is approved, processing and settlement times depend on the payment provider and the customer&apos;s bank or payment method.
          </p>
          <p className="mt-2">
            Nothing in this page or the returns policy is intended to exclude rights or remedies that cannot lawfully be excluded.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">6. Accounts and acceptable use</h2>
          <p className="mt-2">
            Keep your account credentials private and contact support if you believe your account has been accessed without permission. Do not attempt to disrupt the store, access another customer&apos;s account or data, submit malicious files, or misuse payment, checkout or support functions.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-[#181513]">7. Website content and intellectual property</h2>
          <p className="mt-2">
            Website text, graphics, logos, photographs and other content may be owned by the business or used under licence. Do not reproduce or commercially use content without permission from the relevant rights holder.
          </p>
        </section>

        <section className="border-t border-[#E3DFD7] pt-8">
          <h2 className="font-serif text-2xl text-[#181513]">8. Questions and complaints</h2>
          <p className="mt-2">
            Contact our team with your order number and a description of the issue. For privacy matters, write to {BUSINESS_INFO.privacyEmail}. For general complaints, write to {BUSINESS_INFO.grievanceEmail}.
          </p>
          <div className="mt-4 border border-[#E3DFD7] bg-white/70 p-5 text-xs text-[#181513]">
            <p><strong>Designated contact:</strong> {BUSINESS_INFO.grievanceOfficerName}</p>
            <p className="mt-1"><strong>Business:</strong> {BUSINESS_INFO.legalEntityName}</p>
            {BUSINESS_INFO.registrationNumber ? <p className="mt-1"><strong>{BUSINESS_INFO.registrationLabel}:</strong> {BUSINESS_INFO.registrationNumber}</p> : null}
            <p className="mt-1"><strong>FSSAI Licence / Registration:</strong> {BUSINESS_INFO.fssaiLicenseNumber}</p>
            <p className="mt-1"><strong>Registered Office:</strong> {BUSINESS_INFO.registeredOffice}</p>
            <p className="mt-1"><strong>Email:</strong> {BUSINESS_INFO.grievanceEmail}</p>
            <p className="mt-1"><strong>Phone:</strong> {BUSINESS_INFO.supportPhoneDisplay}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
