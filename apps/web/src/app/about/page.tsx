import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'About Seethapaati | South Indian Pantry',
  description: 'Explore Seethapaati pantry staples and review the product-specific ingredient, allergen and handling information before ordering.',
};

export default function AboutPage() {
  return (
    <main className="editorial-page mx-auto max-w-[1240px] px-4 pb-24 pt-10 sm:px-6 md:px-10 md:pb-32 md:pt-16">
      <header className="max-w-3xl border-b border-[#E3DFD7] pb-8 md:pb-14">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B8860B]">
          South Indian Pantry
        </p>
        <h1 className="mt-3 font-serif text-4xl font-normal leading-[1.05] tracking-[-0.04em] text-[#181513] sm:text-6xl md:text-7xl">
          A pantry for everyday cooking.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#181513]/70 md:text-lg">
          Explore pantry staples selected for South Indian kitchens. Product ingredients, allergen details, storage instructions and availability can vary by item and batch, so please review the information shown with each product before ordering.
        </p>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="space-y-10 text-sm leading-relaxed text-[#181513]/80">
          <section>
            <h2 className="font-serif text-3xl font-normal text-[#181513]">
              Product information first
            </h2>
            <p className="mt-3">
              We want customers to be able to understand what they are ordering. Check each product listing and its packaging for the current ingredient declaration, allergen information, net quantity, storage guidance, shelf-life details and applicable food licence information.
            </p>
            <p className="mt-3">
              If an ingredient or handling detail is unclear, contact our team before placing your order. Do not rely on a general brand description as a substitute for the product label or advice from a qualified health professional.
            </p>
          </section>

          <section className="border-l-2 border-[#B8860B] pl-6">
            <p className="font-serif text-xl leading-relaxed text-[#181513]">
              Good product information helps customers make informed choices.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-3xl font-normal text-[#181513]">
              Ordering and fulfilment
            </h2>
            <p className="mt-3">
              Product availability, price, applicable tax and shipping charges are shown during the order flow. Dispatch timing and carrier options depend on stock, destination and the service available for the order. Any delivery estimate is indicative unless explicitly confirmed otherwise.
            </p>
            <p className="mt-3">
              For questions about an order, use the support details on our contact page and include your order number. Tracking information is shown in the order details when staff have recorded the consignment information.
            </p>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="border border-[#E3DFD7] bg-[#ECE8E0] p-8 text-center">
            <p className="font-serif text-3xl text-[#181513]">Explore the collection</p>
            <p className="mt-3 text-xs leading-relaxed text-[#181513]/70">
              Review the details for each product and choose the items that suit your kitchen.
            </p>
            <div className="mt-8 border-t border-[#181513]/10 pt-6">
              <Link
                href="/shop"
                className="inline-flex h-12 w-full items-center justify-center gap-2 bg-[#181513] text-xs font-semibold uppercase tracking-[0.2em] text-[#F7F5F0] transition hover:bg-[#B8860B]"
              >
                Shop the Collection <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="border border-[#E3DFD7] bg-white/60 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#B8860B]">
              Need product help?
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#181513]/75">
              Contact support for questions about ingredients, product details, availability or an existing order.
            </p>
            <Link
              href="/contact"
              className="mt-4 inline-block text-xs font-semibold text-[#A66B18] underline underline-offset-4"
            >
              Contact support →
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
