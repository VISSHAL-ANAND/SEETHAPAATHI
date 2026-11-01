'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Truck,
  Check,
  ShoppingBag,
  ArrowLeft,
  Sparkles,
  Flame,
  ShieldCheck,
  Utensils,
  ChevronDown,
  ChevronUp,
  Leaf,
  Clock,
  HeartHandshake,
} from 'lucide-react';
import type { ProductDto } from '@seethapaati/contracts';
import { useCart } from '../../context/CartContext';
import { fetchApi } from '../../lib/api-client';
import { Button } from '../ui/Button';
import { MobileStickyBuyBar } from './MobileStickyBuyBar';

interface ProductDetailClientProps {
  initialProduct: ProductDto;
}

export function ProductDetailClient({ initialProduct }: ProductDetailClientProps) {
  const [product] = useState<ProductDto>(initialProduct);
  const firstAvailable = product.variants.find((item) => item.isAvailable) ?? product.variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? '');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<'ready' | 'adding' | 'added' | 'error'>('ready');
  const [bagError, setBagError] = useState('');
  const [openAccordion, setOpenAccordion] = useState<string | null>('secret');
  const [pincode, setPincode] = useState('');
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeResult, setPincodeResult] = useState<{
    checked: boolean;
    serviceable?: boolean;
    verified?: boolean;
    carrier?: string;
    estimatedDays?: string;
    message?: string;
  } | null>(null);

  const checkPincodeServiceability = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pincode.trim();
    if (!/^[1-9][0-9]{5}$/.test(cleanPin)) {
      setPincodeResult({
        checked: true,
        serviceable: false,
        verified: true,
        message: 'Please enter a valid 6-digit Indian PIN code',
      });
      return;
    }
    setPincodeLoading(true);
    try {
      const res = await fetchApi<{
        serviceable: boolean;
        verified: boolean;
        carrier: string;
        estimatedDays: string;
        message?: string;
      }>('/shipping/serviceability?pincode=' + cleanPin);

      if (res?.verified === true && res.serviceable === true) {
        setPincodeResult({
          checked: true,
          serviceable: true,
          verified: true,
          carrier: res.carrier || 'India Post Speed Post',
          estimatedDays: res.estimatedDays || 'Unspecified',
        });
      } else {
        setPincodeResult({
          checked: true,
          serviceable: false,
          verified: res?.verified === true,
          message: res?.message || 'Delivery serviceability could not be verified. Please contact support before ordering.',
        });
      }
    } catch {
      setPincodeResult({
        checked: true,
        serviceable: false,
        verified: false,
        message: 'Delivery serviceability could not be verified. Please contact support before ordering.',
      });
    } finally {
      setPincodeLoading(false);
    }
  };

  const { addItem } = useCart();

  const selected = product.variants.find((item) => item.id === variantId) ?? product.variants[0];
  const images = product.images.length > 0 ? product.images : [{ url: '/images/masala.jpg', altText: product.name }];
  const activeImage = images[selectedImageIndex] || images[0];

  const hasDiscount = Boolean(
    selected?.compareAtPriceCents && selected.compareAtPriceCents > selected.priceCents
  );
  const discountPercent = hasDiscount
    ? Math.round(((selected.compareAtPriceCents! - selected.priceCents) / selected.compareAtPriceCents!) * 100)
    : 0;

  async function addToBag() {
    if (!selected?.isAvailable) return;
    setBagError('');
    setState('adding');
    try {
      const ok = await addItem(selected.id, quantity);
      if (ok) {
        setState('added');
        setTimeout(() => setState('ready'), 3500);
      } else {
        setBagError('Unable to add this item right now. Please try again.');
        setState('ready');
      }
    } catch (reason) {
      setBagError(reason instanceof Error ? reason.message : 'Unable to add this item. Please try again.');
      setState('ready');
    }
  }

  const toggleAccordion = (section: string) => {
    setOpenAccordion((prev) => (prev === section ? null : section));
  };

  return (
    <>
      <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 md:px-10 md:pb-32 md:pt-12">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#181513]/60 transition-colors hover:text-[#181513]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            The Collection
          </Link>
        </nav>

        {/* Main PDP Grid */}
        <div className="mt-6 grid items-start gap-10 md:mt-10 md:grid-cols-[1.08fr_0.92fr] md:gap-16 lg:gap-24">
          {/* Left Column: Visual Gallery */}
          <div className="space-y-4">
            <div className="relative aspect-[4/5] overflow-hidden bg-[#ECE8E0] shadow-xs">
              {activeImage?.url ? (
                <img
                  src={activeImage.url}
                  alt={activeImage.altText || product.name}
                  className="h-full w-full object-cover transition-opacity duration-300"
                />
              ) : (
                <div className="flex h-full items-end p-10">
                  <span className="font-serif text-6xl text-[#181513]/20">{product.name}</span>
                </div>
              )}

              {product.merchandising?.badge && (
                <span className="absolute left-4 top-4 border border-[#B8860B]/40 bg-[#F7F5F0]/95 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-[#B8860B] backdrop-blur-xs">
                  {product.merchandising.badge.replace('_', ' ')}
                </span>
              )}
            </div>

            {/* Thumbnail Strip */}
            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`relative aspect-[4/5] w-20 shrink-0 overflow-hidden border transition-all ${
                      selectedImageIndex === idx
                        ? 'border-[#181513] opacity-100 ring-1 ring-[#181513]'
                        : 'border-[#E3DFD7] opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Product Narrative & Purchasing */}
          <div className="pt-2 md:sticky md:top-12 md:pt-4">
            {product.category && (
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#B8860B]">
                {product.category.name}
              </p>
            )}

            <h1 className="mt-2 font-serif text-3xl font-normal leading-[1.1] tracking-[-0.03em] text-[#181513] sm:text-4xl md:text-5xl lg:text-6xl">
              {product.name}
            </h1>

            {/* Pricing & Stock Banner */}
            {selected && (
              <div className="mt-5 flex flex-wrap items-baseline gap-3">
                <span className="font-serif text-3xl font-normal tabular-nums text-[#181513] md:text-4xl">
                  ₹{(selected.priceCents / 100).toLocaleString('en-IN')}
                </span>

                {hasDiscount && (
                  <>
                    <span className="text-base text-[#181513]/40 line-through tabular-nums">
                      ₹{(selected.compareAtPriceCents! / 100).toLocaleString('en-IN')}
                    </span>
                    <span className="border border-[#B8860B]/40 bg-[#B8860B]/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-[#B8860B]">
                      {discountPercent}% OFF
                    </span>
                  </>
                )}

                <span className="ml-auto text-xs font-medium uppercase tracking-[0.16em]">
                  {selected.isAvailable ? (
                    <span className="text-[#2E7D32] flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#2E7D32] animate-pulse" />
                      In Stock · Fresh Batch
                    </span>
                  ) : (
                    <span className="text-[#C62828]">Currently unavailable</span>
                  )}
                </span>
              </div>
            )}

            {/* Short Description */}
            {product.description && (
              <div className="mt-5 border-t border-[#E3DFD7] pt-5">
                <p className="text-sm leading-relaxed text-[#181513]/75 whitespace-pre-line font-sans">
                  {product.description}
                </p>
              </div>
            )}

            {/* Variant Selection */}
            <div className="mt-6 space-y-5 border-t border-[#E3DFD7] pt-5">
              <div>
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[#181513]/60">
                  <span>Select Packaging Size</span>
                  {selected && (
                    <span className="font-medium text-[#181513]">
                      {selected.packType} {selected.weightGrams ? `(${selected.weightGrams}g)` : ''}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2.5">
                  {product.variants.map((variant) => {
                    const isSelected = variant.id === variantId;
                    const label = variant.name || variant.packType;
                    const weight = variant.weightGrams ? `${variant.weightGrams}g` : '';

                    return (
                      <button
                        type="button"
                        key={variant.id}
                        disabled={!variant.isAvailable}
                        aria-pressed={isSelected}
                        onClick={() => {
                          setVariantId(variant.id);
                          setState('ready');
                          setBagError('');
                        }}
                        className={`min-h-[52px] min-w-[120px] flex flex-col items-start justify-center border px-4 py-2.5 text-left transition-all ${
                          isSelected
                            ? 'border-[#181513] bg-[#181513] text-[#F7F5F0] shadow-xs'
                            : 'border-[#E3DFD7] bg-white/60 text-[#181513] hover:border-[#B8860B] active:bg-[#ECE8E0]'
                        } disabled:cursor-not-allowed disabled:opacity-35`}
                      >
                        <span className="text-xs font-semibold">
                          {label} {weight ? `· ${weight}` : ''}
                        </span>
                        <span
                          className={`mt-0.5 text-[11px] tabular-nums ${
                            isSelected ? 'text-[#F7F5F0]/80' : 'text-[#181513]/60'
                          }`}
                        >
                          ₹{(variant.priceCents / 100).toLocaleString('en-IN')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="flex items-center justify-between">
                <label htmlFor="quantity" className="text-xs uppercase tracking-[0.18em] text-[#181513]/60">
                  Quantity
                </label>
                <div className="flex items-center border border-[#181513]/30 bg-white/70">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((v) => Math.max(1, v - 1))}
                    className="h-11 w-11 flex items-center justify-center text-base text-[#181513] transition hover:bg-[#181513]/5 disabled:opacity-30"
                  >
                    −
                  </button>
                  <input
                    id="quantity"
                    type="number"
                    min={1}
                    max={10}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                    }
                    className="h-11 w-12 border-0 bg-transparent text-center text-xs font-semibold text-[#181513] outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={quantity >= 10}
                    onClick={() => setQuantity((v) => Math.min(10, v + 1))}
                    className="h-11 w-11 flex items-center justify-center text-base text-[#181513] transition hover:bg-[#181513]/5 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Add to Bag Desktop / In-Page Actions */}
            <div className="mt-8 space-y-4">
              <Button
                size="lg"
                onClick={addToBag}
                disabled={!selected?.isAvailable || state === 'adding'}
                isLoading={state === 'adding'}
                className="w-full h-13 text-xs uppercase tracking-[0.2em] font-semibold"
              >
                <ShoppingBag className="mr-2 h-4 w-4" />
                {!selected?.isAvailable
                  ? 'Currently Sold Out'
                  : state === 'added'
                  ? 'Added to Bag'
                  : 'Add to Bag'}
              </Button>

              {bagError && (
                <p role="alert" className="border-l-2 border-red-700 bg-red-50 p-3 text-xs text-red-800">
                  {bagError}
                </p>
              )}

              {state === 'added' && (
                <div className="flex items-center justify-between border border-[#B8860B]/40 bg-[#B8860B]/10 p-4 text-xs text-[#181513]">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#B8860B]" />
                    <span>Item added to your shopping bag.</span>
                  </div>
                  <Link
                    href="/cart"
                    className="font-semibold text-[#A66B18] underline underline-offset-4 hover:text-[#181513]"
                  >
                    View Bag →
                  </Link>
                </div>
              )}
            </div>

            {/* India Post Pincode Serviceability Widget */}
            <div className="mt-6 border border-[#E3DFD7] bg-white/50 p-4 rounded-xs backdrop-blur-xs">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-[#B8860B]" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#181513]">
                  Check Delivery Availability
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[#181513]/65">
                India Post Speed Post is our current dispatch carrier. PIN-code serviceability is confirmed manually before dispatch.
              </p>
              <form onSubmit={checkPincodeServiceability} className="mt-3 flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit PIN code"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 border border-[#E3DFD7] bg-white px-3 py-2 text-xs text-[#181513] placeholder:text-[#181513]/40 focus:border-[#B8860B] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={pincodeLoading || pincode.trim().length !== 6}
                  className="bg-[#181513] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F7F5F0] transition hover:bg-[#2E2824] disabled:opacity-40 cursor-pointer"
                >
                  {pincodeLoading ? 'Checking…' : 'Check'}
                </button>
              </form>

              {pincodeResult?.checked && (
                <div className="mt-3 pt-3 border-t border-[#E3DFD7]/70 text-xs">
                  {pincodeResult.serviceable ? (
                    <div className="flex items-start gap-2 text-[#1A2820]">
                      <Check className="h-4 w-4 text-[#B8860B] shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-[11px]">
                          Delivery available via {pincodeResult.carrier || 'India Post Speed Post'}
                        </p>
                        <p className="text-[10px] text-[#181513]/65">
                          Estimated dispatch to arrival: {pincodeResult.estimatedDays}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className={`text-[11px] ${pincodeResult.verified ? 'text-red-700' : 'text-amber-700'}`}>{pincodeResult.message}</p>
                  )}
                </div>
              )}
            </div>

            {/* Tactile Heirloom Provenance Seals */}
            <div className="mt-10 grid grid-cols-2 gap-3 border-y border-[#E3DFD7] py-6 sm:grid-cols-4">
              <div className="flex flex-col items-center text-center p-2 rounded bg-white/40 border border-[#E3DFD7]/60">
                <Sparkles className="h-5 w-5 text-[#B8860B]" />
                <span className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-[#181513]">
                  Stone Ground
                </span>
                <span className="text-[10px] text-[#181513]/60 leading-tight mt-0.5">
                  Granite mortar milled
                </span>
              </div>

              <div className="flex flex-col items-center text-center p-2 rounded bg-white/40 border border-[#E3DFD7]/60">
                <Flame className="h-5 w-5 text-[#B8860B]" />
                <span className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-[#181513]">
                  100% Sun-Dried
                </span>
                <span className="text-[10px] text-[#181513]/60 leading-tight mt-0.5">
                  Guntur & Byadgi crop
                </span>
              </div>

              <div className="flex flex-col items-center text-center p-2 rounded bg-white/40 border border-[#E3DFD7]/60">
                <ShieldCheck className="h-5 w-5 text-[#B8860B]" />
                <span className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-[#181513]">
                  Pure Heirloom
                </span>
                <span className="text-[10px] text-[#181513]/60 leading-tight mt-0.5">
                  Zero preservatives
                </span>
              </div>

              <div className="flex flex-col items-center text-center p-2 rounded bg-white/40 border border-[#E3DFD7]/60">
                <Utensils className="h-5 w-5 text-[#B8860B]" />
                <span className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-[#181513]">
                  Fresh Batches
                </span>
                <span className="text-[10px] text-[#181513]/60 leading-tight mt-0.5">
                  Crafted weekly
                </span>
              </div>
            </div>

            {/* Interactive Heritage Accordions */}
            <div className="mt-6 divide-y divide-[#E3DFD7] border-b border-[#E3DFD7]">
              {/* Accordion 1: Grandma's Secret / How to Relish */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleAccordion('secret')}
                  className="flex w-full items-center justify-between py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-[#181513] transition hover:text-[#B8860B]"
                >
                  <span className="flex items-center gap-2">
                    <HeartHandshake className="h-4 w-4 text-[#B8860B]" />
                    Grandma&apos;s Secret & How to Relish
                  </span>
                  {openAccordion === 'secret' ? (
                    <ChevronUp className="h-4 w-4 text-[#181513]/50" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#181513]/50" />
                  )}
                </button>
                {openAccordion === 'secret' && (
                  <div className="pb-5 pt-1 text-xs leading-relaxed text-[#181513]/70 space-y-2.5">
                    <p>
                      Paati&apos;s golden rule: <em>&ldquo;Never rush the tempering, and never heat the powder directly.&rdquo;</em>
                    </p>
                    <p>
                      Mix a generous spoonful with steaming hot Ponni rice and a drizzle of cold-pressed gingelly oil (til oil) or pure fragrant A2 cow ghee. For an authentic Mylapore tiffin experience, dust lightly over crispy ghee roast dosas or soft idlis straight from the steamer.
                    </p>
                  </div>
                )}
              </div>

              {/* Accordion 2: Ingredients & Sourcing */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleAccordion('ingredients')}
                  className="flex w-full items-center justify-between py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-[#181513] transition hover:text-[#B8860B]"
                >
                  <span className="flex items-center gap-2">
                    <Leaf className="h-4 w-4 text-[#B8860B]" />
                    Ingredients & Provenance
                  </span>
                  {openAccordion === 'ingredients' ? (
                    <ChevronUp className="h-4 w-4 text-[#181513]/50" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#181513]/50" />
                  )}
                </button>
                {openAccordion === 'ingredients' && (
                  <div className="pb-5 pt-1 text-xs leading-relaxed text-[#181513]/70 space-y-2">
                    <p>
                      Handpicked whole spices sourced from generational South Indian farm clusters: Sun-cured Guntur &amp; Byadgi chillies, organic Salem golden turmeric, Tellicherry black peppercorns, roasted split chickpea (chana dal), split black gram (urad dal), curry leaves, and mineral-rich unrefined rock salt.
                    </p>
                    <p className="text-[11px] text-[#181513]/60 italic">
                      Zero anti-caking agents • No synthetic food colouring • No MSG • 100% Vegetarian.
                    </p>
                  </div>
                )}
              </div>

              {/* Accordion 3: Artisanal Care & Storage */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleAccordion('care')}
                  className="flex w-full items-center justify-between py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-[#181513] transition hover:text-[#B8860B]"
                >
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-[#B8860B]" />
                    Artisanal Care & Storage
                  </span>
                  {openAccordion === 'care' ? (
                    <ChevronUp className="h-4 w-4 text-[#181513]/50" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#181513]/50" />
                  )}
                </button>
                {openAccordion === 'care' && (
                  <div className="pb-5 pt-1 text-xs leading-relaxed text-[#181513]/70 space-y-2">
                    <p>
                      Store in an airtight ceramic jar or our signature tin in a cool, dry pantry away from direct sunlight. Always use a clean, completely dry wooden or stainless steel spoon.
                    </p>
                    <p>
                      <strong>Shelf Life:</strong> Best relished within 9 months from the batch grinding date indicated on the bottom seal.
                    </p>
                  </div>
                )}
              </div>

              {/* Accordion 4: Statutory FSSAI & Allergen Advisory */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleAccordion('statutory')}
                  className="flex w-full items-center justify-between py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-[#181513] transition hover:text-[#B8860B]"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#B8860B]" />
                    FSSAI &amp; Allergen Advisory
                  </span>
                  {openAccordion === 'statutory' ? (
                    <ChevronUp className="h-4 w-4 text-[#181513]/50" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#181513]/50" />
                  )}
                </button>
                {openAccordion === 'statutory' && (
                  <div className="pb-5 pt-1 text-xs leading-relaxed text-[#181513]/70 space-y-2 border-l-2 border-[#B8860B]/60 pl-3">
                    <p>
                      <strong>FSSAI Lic. No:</strong> 12426999000142 • Standard Culinary Food Product.
                    </p>
                    <p>
                      <strong>Allergen Declaration:</strong> Produced in an artisanal South Indian kitchen that handles sesame seeds, mustard seeds, peanuts, tree nuts, and dairy (ghee).
                    </p>
                    <p>
                      <strong>Non-Medicinal Notice:</strong> This product is an edible culinary staple and is not intended to diagnose, cure, treat, or prevent any illness or medical condition.
                    </p>
                    <p className="text-[11px] text-[#181513]/55">
                      Country of Origin: India • Marketed by Seethapaati Heirloom Foods Pvt. Ltd.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Specifications Table */}
            {selected && (
              <div className="mt-8 pt-2">
                <h3 className="text-xs uppercase tracking-[0.2em] text-[#181513]/60">
                  Batch Specifications
                </h3>
                <dl className="mt-4 grid grid-cols-2 gap-4 border-y border-[#E3DFD7] py-4 text-xs">
                  <div>
                    <dt className="text-[#181513]/50">Packaging Format</dt>
                    <dd className="mt-0.5 font-medium text-[#181513]">{selected.packType}</dd>
                  </div>
                  <div>
                    <dt className="text-[#181513]/50">Net Quantity</dt>
                    <dd className="mt-0.5 font-medium text-[#181513]">
                      {selected.weightGrams ? `${selected.weightGrams}g` : 'Standard pack'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#181513]/50">SKU Reference</dt>
                    <dd className="mt-0.5 font-mono text-[11px] text-[#181513]">{selected.sku}</dd>
                  </div>
                  <div>
                    <dt className="text-[#181513]/50">Category</dt>
                    <dd className="mt-0.5 font-medium text-[#181513]">
                      {product.category?.name || 'Heritage Pantry'}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Sticky Buy Bar */}
      <MobileStickyBuyBar
        productName={product.name}
        selectedVariant={selected}
        onAddToCart={addToBag}
        isAdding={state === 'adding'}
        isAdded={state === 'added'}
      />
    </>
  );
}
