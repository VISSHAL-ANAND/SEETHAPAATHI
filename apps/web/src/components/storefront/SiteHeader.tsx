'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, User, Menu, X, ArrowUpRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { itemCount, openDrawer } = useCart();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  }, [pathname]);

  const toggleMobileMenu = () => {
    setMobileMenuOpen((prev) => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        document.body.style.overflow = next ? 'hidden' : '';
      }
      return next;
    });
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  };

  return (
    <>
      {/* Editorial Top Scrolling Marquee Bar */}
      <div className="site-announcement" aria-label="Seethapaati brand announcement">
        <div className="site-announcement__track" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <span className="site-announcement__item" key={index}>
              <i>✳</i> Stone-Ground in Small Batches <i>✳</i> 100% Pure Heirloom Recipes <i>✳</i> Complimentary Delivery on Orders Above ₹499 <i>✳</i> Safe UPI & Card Checkout <i>✳</i>
            </span>
          ))}
        </div>
      </div>

      <header className="sticky top-0 z-40 bg-[#FBF9F5]/90 backdrop-blur-md border-b border-[#E7E2D8] transition-colors">
        <div className="mx-auto flex min-h-[64px] max-w-[1600px] items-center justify-between gap-4 px-5 py-3 md:min-h-[76px] md:px-10">
          {/* Brand Logo */}
          {/* Brand Logo & Luxury Heritage Mark */}
          <Link
            href="/"
            onClick={closeMobileMenu}
            className="shrink-0 flex flex-col items-start leading-none group transition-opacity hover:opacity-90"
            aria-label="Seethapaati home"
          >
            <span className="font-serif text-[23px] font-semibold tracking-[-0.03em] text-[#1A2820] md:text-[27px]">
              SEETHAPAATI<span className="ml-0.5 text-[#C8A265]">.</span>
            </span>
            <span className="mt-0.5 text-[9px] tracking-[0.25em] text-stone-500 uppercase font-sans font-medium">
              EST. NILGIRIS
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex text-[11px] font-medium uppercase tracking-[0.18em]">
            {[
              ['/shop', 'Shop'],
              ['/about', 'Our Story'],
              ['/contact', 'Contact'],
              ['/account/orders', 'Track Order'],
            ].map(([href, label]) => {
              const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative py-1 transition-colors ${
                    isActive ? 'text-[#B8860B] font-semibold' : 'text-[#181513]/70 hover:text-[#181513]'
                  }`}
                >
                  {label}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-[1px] h-[1.5px] bg-[#B8860B]" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Desktop & Mobile Actions */}
          <div className="flex items-center gap-2.5 sm:gap-4">
            {/* Bag Button - Opens Drawer */}
            <button
              type="button"
              onClick={openDrawer}
              className="relative flex items-center gap-2 border border-[#E3DFD7] px-3.5 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#181513] transition hover:border-[#B8860B] hover:text-[#B8860B] active:scale-95"
              aria-label={`Shopping bag with ${itemCount} items`}
            >
              <ShoppingBag className="h-4 w-4" strokeWidth={1.75} />
              <span className="hidden sm:inline">Bag</span>
              <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#181513] px-1 text-[10px] font-bold text-[#F7F5F0] tabular-nums">
                {itemCount}
              </span>
            </button>

            {/* Account Icon */}
            <Link
              href="/account"
              className="hidden sm:grid h-9 w-9 place-items-center border border-[#E3DFD7] text-[#181513] transition hover:border-[#B8860B] hover:text-[#B8860B]"
              aria-label="Account or sign in"
              title="Account / Sign in"
            >
              <User className="h-4 w-4" strokeWidth={1.75} />
            </Link>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={toggleMobileMenu}
              className="grid h-9 w-9 place-items-center border border-[#E3DFD7] text-[#181513] md:hidden transition-colors hover:border-[#181513]"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div
            id="mobile-navigation"
            className="fixed inset-x-0 top-[94px] bottom-0 z-50 bg-[#F7F5F0] px-6 py-6 overflow-y-auto md:hidden border-t border-[#E3DFD7] animate-fade-in"
          >
            <nav aria-label="Mobile main navigation" className="divide-y divide-[#E3DFD7]">
              {[
                ['/', 'Home'],
                ['/shop', 'The Collection'],
                ['/about', 'Our Story & Heritage'],
                ['/contact', 'Contact & Care'],
                ['/account/orders', 'Track Orders'],
                ['/account', 'My Account'],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={closeMobileMenu}
                  className="flex items-center justify-between py-4.5 font-serif text-2xl text-[#181513] transition hover:text-[#B8860B]"
                >
                  <span>{label}</span>
                  <ArrowUpRight className="h-4 w-4 text-[#B8860B]" />
                </Link>
              ))}
            </nav>

            <div className="mt-8 pt-6 border-t border-[#E3DFD7] space-y-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#181513]/40">
                Pantry Support & Policies
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#181513]/70">
                <Link href="/shipping" onClick={closeMobileMenu} className="hover:text-[#B8860B]">
                  Shipping Policy
                </Link>
                <Link href="/returns" onClick={closeMobileMenu} className="hover:text-[#B8860B]">
                  Returns & Care
                </Link>
                <Link href="/terms-and-conditions" onClick={closeMobileMenu} className="hover:text-[#B8860B]">
                  Terms & Conditions
                </Link>
                <Link href="/privacy-policy" onClick={closeMobileMenu} className="hover:text-[#B8860B]">
                  Privacy Policy
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
