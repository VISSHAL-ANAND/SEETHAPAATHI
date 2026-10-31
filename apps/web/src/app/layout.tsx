import type { Metadata } from 'next';
import Link from 'next/link';
import { Cormorant_Garamond, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Hairline } from '../components/ui/Hairline';
import { SiteHeader } from '../components/storefront/SiteHeader';
import { CartProvider } from '../context/CartContext';
import { CartDrawer } from '../components/storefront/CartDrawer';
import { MobileBottomNav } from '../components/storefront/MobileBottomNav';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || 'SEETHAPAATI';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://seethapaati.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    template: `%s | ${STORE_NAME}`,
    default: `${STORE_NAME} — Artisanal South Indian Pantry Staples & Spices`,
  },
  description:
    'Handcrafted spice blends, nourishing ABC malt mixes, single-estate Ceylon teas, and authentic South Indian pantry delicacies.',
  keywords: [
    'Seethapaati',
    'South Indian spices',
    'artisan masala',
    'Rasam powder',
    'ABC malt',
    'health mix',
    'Ceylon tea',
    'traditional pantry',
  ],
  authors: [{ name: 'Seethapaati' }],
  creator: 'Seethapaati',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: SITE_URL,
    siteName: STORE_NAME,
    title: `${STORE_NAME} — Artisanal South Indian Pantry Staples & Spices`,
    description:
      'Purity of ingredients, traditional craft, and pantry staples prepared for everyday rituals.',
    images: [
      {
        url: '/images/masala.jpg',
        width: 1200,
        height: 630,
        alt: `${STORE_NAME} Artisanal Spice Collection`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${STORE_NAME} — Artisanal South Indian Pantry Staples`,
    description:
      'Purity of ingredients, traditional craft, and pantry staples prepared for everyday rituals.',
    images: ['/images/masala.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${plusJakarta.variable}`}>
      <body className="min-h-screen flex flex-col bg-[#F7F5F0] text-[#181513] selection:bg-[#181513] selection:text-[#F7F5F0]">
        <CartProvider>
          <SiteHeader />
          <main className="flex-grow pb-28 md:pb-0">{children}</main>
          <CartDrawer />
          <MobileBottomNav />
          <footer className="bg-[#241C18] text-[#F7F5F0] pt-16 pb-24 md:pb-10 mt-24">
            <div className="mx-auto max-w-[1440px] px-6 md:px-10">
              <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-12">
                <div className="sm:col-span-2 md:col-span-5">
                  <Link href="/" className="font-serif text-3xl tracking-tight text-[#F7F5F0]">
                    SEETHAPAATI
                  </Link>
                  <p className="mt-4 max-w-sm text-sm leading-7 text-[#F7F5F0]/65">
                    A growing collection of everyday favourites and heirloom pantry staples, made to find a place in your kitchen.
                  </p>
                  <Link
                    href="/about"
                    className="mt-5 inline-block text-[10px] uppercase tracking-[0.16em] text-[#D7A63B] hover:text-white"
                  >
                    Our story ↗
                  </Link>
                </div>
                <div className="md:col-span-3 md:col-start-7">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#F7F5F0]/45">Explore</p>
                  <div className="mt-4 flex flex-col gap-3 text-sm text-[#F7F5F0]/75">
                    <Link href="/shop" className="hover:text-white">
                      Shop Collection
                    </Link>
                    <Link href="/about" className="hover:text-white">
                      Our Heritage
                    </Link>
                    <Link href="/contact" className="hover:text-white">
                      Contact & Care
                    </Link>
                    <Link href="/cart" className="hover:text-white">
                      Shopping Bag
                    </Link>
                    <Link href="/account/orders" className="hover:text-white">
                      Track Order
                    </Link>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#F7F5F0]/45">Help & policies</p>
                  <div className="mt-4 flex flex-col gap-3 text-sm text-[#F7F5F0]/75">
                    <Link href="/shipping" className="hover:text-white">
                      Shipping Policy
                    </Link>
                    <Link href="/returns" className="hover:text-white">
                      Returns & Refunds
                    </Link>
                    <Link href="/terms-and-conditions" className="hover:text-white">
                      Terms & Conditions
                    </Link>
                    <Link href="/privacy-policy" className="hover:text-white">
                      Privacy Policy
                    </Link>
                  </div>
                </div>
              </div>
              <Hairline className="mt-12 bg-white/10" />

              {/* Statutory FSSAI & Corporate Disclosures */}
              <div className="mt-8 border-b border-white/10 pb-8 text-[11px] leading-relaxed text-[#F7F5F0]/50 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="border border-[#D7A63B]/60 bg-[#D7A63B]/10 px-2 py-0.5 text-[10px] font-semibold text-[#D7A63B] uppercase tracking-wider">
                      FSSAI Lic. No. 12426999000142
                    </span>
                    <span className="text-[#F7F5F0]/70">Food Safety &amp; Standards Authority of India Certified</span>
                  </div>
                  <div>
                    <span>Grievance Officer: </span>
                    <a href="mailto:grievance@seethapaati.com" className="text-[#D7A63B] underline underline-offset-2">
                      grievance@seethapaati.com
                    </a>
                  </div>
                </div>
                <p>
                  <strong>Legal Entity:</strong> Seethapaati Heirloom Foods Private Limited (CIN: U10799TN2026PTC158941) • Registered Office: 14/2 South Mada Street, Mylapore, Chennai, Tamil Nadu 600004, India.
                </p>
                <p>
                  <strong>Allergen &amp; Health Disclaimer:</strong> Traditional culinary food staples. Not intended to diagnose, treat, prevent, or cure any disease. Manufactured in a heritage facility that handles sesame, peanuts, mustard, tree nuts, and dairy. Please review ingredient declarations if you have known food sensitivities.
                </p>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#F7F5F0]/35">
                <p>© {new Date().getFullYear()} SEETHAPAATI HEIRLOOM FOODS PVT. LTD. All rights reserved.</p>
                <p>Pure South Indian Culinary Staples • Handcrafted in Chennai, India</p>
              </div>
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}