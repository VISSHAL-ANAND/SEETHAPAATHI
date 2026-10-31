'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, ShoppingBag, PackageCheck, User } from 'lucide-react';
import { useCart } from '../../context/CartContext';

export function MobileBottomNav() {
  const pathname = usePathname();
  const { itemCount, openDrawer } = useCart();

  // Hide on admin routes or checkout screen so it doesn't distract or occlude payment forms
  if (pathname.startsWith('/admin') || pathname.startsWith('/checkout')) {
    return null;
  }

  const isHome = pathname === '/';
  const isShop = pathname.startsWith('/shop');
  const isCart = pathname === '/cart';
  const isAccountOrOrders = pathname.startsWith('/account') || pathname.startsWith('/orders');

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#FBF9F5]/95 backdrop-blur-md border-t border-[#E7E2D8] md:hidden transition-transform duration-300 shadow-[0_-4px_20px_rgba(24,21,19,0.06)]"
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))' }}
      aria-label="Mobile Bottom Navigation"
    >
      <div className="mx-auto grid h-15 max-w-lg grid-cols-4 items-center px-3">
        {/* Home */}
        <Link
          href="/"
          className={`flex flex-col items-center justify-center gap-1 py-1 transition-colors ${
            isHome ? 'text-[#B8860B]' : 'text-[#181513]/60 hover:text-[#181513]'
          }`}
          aria-label="Home"
        >
          <Home className="h-5 w-5" strokeWidth={isHome ? 2.2 : 1.75} />
          <span className={`text-[10px] uppercase tracking-wider ${isHome ? 'font-semibold' : 'font-medium'}`}>
            Home
          </span>
        </Link>

        {/* Shop */}
        <Link
          href="/shop"
          className={`flex flex-col items-center justify-center gap-1 py-1 transition-colors ${
            isShop ? 'text-[#B8860B]' : 'text-[#181513]/60 hover:text-[#181513]'
          }`}
          aria-label="Shop Catalog"
        >
          <Compass className="h-5 w-5" strokeWidth={isShop ? 2.2 : 1.75} />
          <span className={`text-[10px] uppercase tracking-wider ${isShop ? 'font-semibold' : 'font-medium'}`}>
            Shop
          </span>
        </Link>

        {/* Cart Drawer Trigger */}
        <button
          type="button"
          onClick={openDrawer}
          className={`relative flex flex-col items-center justify-center gap-1 py-1 transition-colors ${
            isCart ? 'text-[#B8860B]' : 'text-[#181513]/60 hover:text-[#181513]'
          }`}
          aria-label={`Shopping Bag, ${itemCount} items`}
        >
          <div className="relative">
            <ShoppingBag className="h-5 w-5" strokeWidth={isCart ? 2.2 : 1.75} />
            {itemCount > 0 && (
              <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B8860B] px-1 text-[9px] font-bold text-[#F7F5F0] tabular-nums shadow-xs">
                {itemCount}
              </span>
            )}
          </div>
          <span className={`text-[10px] uppercase tracking-wider ${isCart ? 'font-semibold' : 'font-medium'}`}>
            Bag
          </span>
        </button>

        {/* Account / Orders */}
        <Link
          href="/account/orders"
          className={`flex flex-col items-center justify-center gap-1 py-1 transition-colors ${
            isAccountOrOrders ? 'text-[#B8860B]' : 'text-[#181513]/60 hover:text-[#181513]'
          }`}
          aria-label="Orders and Account"
        >
          <PackageCheck className="h-5 w-5" strokeWidth={isAccountOrOrders ? 2.2 : 1.75} />
          <span className={`text-[10px] uppercase tracking-wider ${isAccountOrOrders ? 'font-semibold' : 'font-medium'}`}>
            Orders
          </span>
        </Link>
      </div>
    </nav>
  );
}
