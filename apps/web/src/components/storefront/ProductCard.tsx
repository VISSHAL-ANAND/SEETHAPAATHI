'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, Check } from 'lucide-react';
import type { ProductDto } from '@seethapaati/contracts';
import { useCart } from '../../context/CartContext';

export function ProductCard({ product }: { product: ProductDto }) {
  const { addItem } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [isAdded, setIsAdded] = useState(false);

  const image = product.images[0]?.url;
  const variant = product.variants.find((item) => item.isAvailable) ?? product.variants[0];
  const badge = product.merchandising?.badge;
  const hasDiscount = Boolean(variant?.compareAtPriceCents && variant.compareAtPriceCents > variant.priceCents);

  const packDetail = variant
    ? [variant.weightGrams ? `${variant.weightGrams}g` : '', variant.packType || variant.name]
        .filter(Boolean)
        .join(' · ')
    : '';

  async function handleQuickAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!variant || !variant.isAvailable || isAdding) return;

    setIsAdding(true);
    const success = await addItem(variant.id, 1);
    setIsAdding(false);
    if (success) {
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 1800);
    }
  }

  return (
    <article className="group flex flex-col h-full bg-white border border-[#ECE7DE] hover:border-[#183024]/40 transition-all duration-300 rounded-sm p-3 shadow-xs hover:shadow-md">
      <Link href={`/shop/${product.slug}`} className="flex flex-col h-full focus:outline-hidden">
        {/* Media Container */}
        <div className="relative aspect-[4/5] overflow-hidden bg-[#ECE8E0] rounded-xs">
          {image ? (
            <img
              src={image}
              alt={product.images[0]?.altText || product.name}
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-end p-6">
              <span className="font-serif text-2xl leading-none text-[#181513]/25">{product.name}</span>
            </div>
          )}

          {/* Micro-badge */}
          {badge && (
            <span className="absolute left-2 top-2 border border-[#183024]/20 bg-white/95 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#183024] backdrop-blur-xs rounded-xs shadow-xs">
              {badge.replace('_', ' ')}
            </span>
          )}

          {!variant?.isAvailable && (
            <span className="absolute left-2 bottom-2 border border-[#181513]/20 bg-white/95 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-[#181513]/70 backdrop-blur-xs rounded-xs">
              Sold out
            </span>
          )}

          {/* Desktop Hover Quick Add Floating Button */}
          {variant?.isAvailable && (
            <div className="absolute inset-x-3 bottom-3 hidden md:flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
              <button
                type="button"
                onClick={handleQuickAdd}
                disabled={isAdding}
                className="w-full flex items-center justify-center gap-1.5 bg-[#183024] py-2.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#FAF7F2] hover:bg-[#B8860B] transition-colors shadow-md rounded-xs"
              >
                {isAdding ? (
                  <span className="animate-pulse">Adding…</span>
                ) : isAdded ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Added to Bag
                  </>
                ) : (
                  <>
                    <ShoppingBag className="h-3.5 w-3.5" /> Quick Add
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Product Details */}
        <div className="pt-3 pb-1 flex flex-1 flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#B8860B]">
              {product.category && <span>{product.category.name}</span>}
              {product.category && packDetail && <span className="text-[#181513]/30">·</span>}
              {packDetail && <span className="text-[#181513]/60">{packDetail}</span>}
            </div>

            <h2 className="mt-1 font-serif text-base sm:text-lg leading-snug text-[#181513] group-hover:text-[#183024] transition-colors line-clamp-2">
              {product.name}
            </h2>
          </div>

          <div className="mt-3 pt-2 border-t border-[#ECE7DE] flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-base sm:text-lg font-medium tabular-nums text-[#181513]">
                ₹{variant ? (variant.priceCents / 100).toLocaleString('en-IN') : '—'}
              </span>
              {hasDiscount && (
                <span className="text-xs text-[#181513]/40 line-through tabular-nums">
                  ₹{(variant!.compareAtPriceCents! / 100).toLocaleString('en-IN')}
                </span>
              )}
            </div>

            {/* Mobile-visible Refined Inline Outlined Add Button */}
            {variant?.isAvailable && (
              <button
                type="button"
                onClick={handleQuickAdd}
                disabled={isAdding}
                className="md:hidden inline-flex items-center gap-1.5 rounded-xs border border-[#183024]/30 bg-transparent px-2.5 py-1 text-[11px] font-medium tracking-wider text-[#183024] transition hover:bg-[#183024] hover:text-[#FAF7F2] active:scale-95 disabled:opacity-50"
                aria-label={`Add ${product.name} to bag`}
              >
                {isAdding ? (
                  <span className="animate-spin text-xs">⟳</span>
                ) : isAdded ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-700" /> Added
                  </>
                ) : (
                  <>
                    <ShoppingBag className="h-3.5 w-3.5" /> Add
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
