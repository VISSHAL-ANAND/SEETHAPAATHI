'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Lock, Check, Tag, Trash2, Sparkles } from 'lucide-react';
import type { CartResponse, UserProfile } from '@seethapaati/contracts';
import { fetchApi, ApiClientError } from '../../lib/api-client';
import { useCart } from '../../context/CartContext';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type Address = {
  id?: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

const INDIAN_STATES = [
  { code: '33', name: 'Tamil Nadu' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '07', name: 'Delhi' },
  { code: '24', name: 'Gujarat' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '19', name: 'West Bengal' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '06', name: 'Haryana' },
  { code: '03', name: 'Punjab' },
  { code: '21', name: 'Odisha' },
  { code: '10', name: 'Bihar' },
  { code: '20', name: 'Jharkhand' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '30', name: 'Goa' },
  { code: '05', name: 'Uttarakhand' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '18', name: 'Assam' },
  { code: '34', name: 'Puducherry' },
  { code: '31', name: 'Lakshadweep' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '04', name: 'Chandigarh' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '38', name: 'Ladakh' },
];

const emptyAddress: Address = {
  fullName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: 'Chennai',
  state: 'Tamil Nadu',
  postalCode: '',
  country: 'IN',
  isDefault: true,
};

export default function CheckoutPage() {
  const router = useRouter();
  const {
    cart: contextCart,
    removeItem,
    updateQuantity,
    applyCoupon,
    removeCoupon,
    coupon: savedCoupon,
    refreshCart,
  } = useCart();
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [stateCode, setStateCode] = useState('33');
  const [coupon, setCoupon] = useState(savedCoupon || '');
  const [couponAppliedNotice, setCouponAppliedNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Sync checkout cart state whenever contextCart changes
  useEffect(() => {
    if (contextCart) {
      setCart(contextCart);
      if (contextCart.pricing?.couponCode) {
        setCoupon(contextCart.pricing.couponCode);
      }
    }
  }, [contextCart]);

  const loadCheckoutData = async (couponToApply?: string) => {
    const activeCoupon = couponToApply !== undefined ? couponToApply : coupon;
    const cartUrl = activeCoupon ? `/cart?coupon=${encodeURIComponent(activeCoupon)}` : '/cart';

    try {
      const [nextCart, nextProfile, nextAddresses] = await Promise.all([
        fetchApi<CartResponse>(cartUrl),
        fetchApi<UserProfile>('/users/me'),
        fetchApi<Address[]>('/users/me/addresses'),
      ]);

      setCart(nextCart);
      setProfile(nextProfile);
      setAddresses(nextAddresses);

      const preferred = nextAddresses.find((a) => a.isDefault) ?? nextAddresses[0];
      if (preferred) {
        setAddress(preferred);
        // Map address.state to stateCode if possible
        const matched = INDIAN_STATES.find(
          (s) => s.name.toLowerCase() === preferred.state?.toLowerCase()
        );
        if (matched) {
          setStateCode(matched.code);
        }
      } else {
        setAddress((a) => ({
          ...a,
          fullName: nextProfile.fullName || '',
          phone: nextProfile.phone ?? '',
        }));
      }
    } catch (err) {
      if (err instanceof ApiClientError && ['UNAUTHORIZED', 'USER_NOT_FOUND'].includes(err.code)) {
        router.replace('/account/login?next=/checkout');
      } else {
        setError(err instanceof Error ? err.message : 'Unable to load checkout');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCheckoutData();
  }, [router]);

  function setField<K extends keyof Address>(key: K, value: Address[K]) {
    setAddress((a) => ({ ...a, [key]: value }));
  }

  function handleStateChange(selectedCode: string) {
    setStateCode(selectedCode);
    const matched = INDIAN_STATES.find((s) => s.code === selectedCode);
    if (matched) {
      setAddress((a) => ({ ...a, state: matched.name }));
    }
  }

  const handleRemoveItem = async (variantId: string) => {
    if (!variantId) return;
    setError('');
    await removeItem(variantId);
  };

  const handleDecrementItem = async (item: { variantId: string; quantity: number }) => {
    setError('');
    if (item.quantity <= 1) {
      await removeItem(item.variantId);
    } else {
      await updateQuantity(item.variantId, item.quantity - 1);
    }
  };

  const handleIncrementItem = async (item: { variantId: string; quantity: number }) => {
    setError('');
    await updateQuantity(item.variantId, Math.min(10, item.quantity + 1));
  };

  async function handleToggleCoupon(code: string) {
    setError('');
    setCouponAppliedNotice('');
    const trimmed = code.trim().toUpperCase();
    if (cart?.pricing.couponCode === trimmed) {
      await removeCoupon();
      setCoupon('');
      setCouponAppliedNotice('');
    } else {
      setCoupon(trimmed);
      const res = await applyCoupon(trimmed);
      if (res.success) {
        setCouponAppliedNotice(res.message || `Promo code "${trimmed}" applied!`);
      } else {
        setError(res.message || 'Coupon code not applicable or minimum order threshold not met.');
      }
    }
  }

  async function handleApplyCouponManual() {
    if (!coupon.trim()) return;
    await handleToggleCoupon(coupon.trim());
  }

  async function saveAddress() {
    setSavingAddress(true);
    try {
      const saved = await fetchApi<Address>('/users/me/addresses', {
        method: 'POST',
        body: JSON.stringify({ ...address, isDefault: addresses.length === 0 }),
      });
      setAddresses((a) => [...a, saved]);
      setAddress(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save address');
    } finally {
      setSavingAddress(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!cart || !profile || cart.items.length === 0) return;
    setError('');
    setPaying(true);

    if (!termsAccepted) {
      setError('Please acknowledge and accept our Terms & Conditions and Allergen disclosures to proceed.');
      setPaying(false);
      return;
    }

    try {
      const shippingAddress = { ...address, stateCode, country: 'IN' };
      if (
        !shippingAddress.fullName ||
        !shippingAddress.phone ||
        !shippingAddress.addressLine1 ||
        !shippingAddress.city ||
        !shippingAddress.state ||
        !shippingAddress.postalCode ||
        !/^[0-9]{2}$/.test(stateCode)
      ) {
        throw new Error('Please complete the delivery address and select a valid State.');
      }

      const intent = await fetchApi<{
        orderId: string;
        orderNumber: string;
        amountCents: number;
        currency: string;
        gateway: string;
        gatewayOrderId: string;
        gatewayKeyId: string;
      }>('/checkout/intent', {
        method: 'POST',
        body: JSON.stringify({
          cartId: cart.cartId,
          shippingAddress,
          couponCode: coupon.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (intent.gateway !== 'RAZORPAY') throw new Error('Unsupported payment gateway');
      if (!window.Razorpay) throw new Error('Payment checkout is still loading. Please try again.');

      const payment = new window.Razorpay({
        key: intent.gatewayKeyId,
        amount: intent.amountCents,
        currency: intent.currency,
        name: 'SEETHAPAATI',
        description: `Order ${intent.orderNumber} — Artisanal Pantry`,
        image: '/images/masala.jpg',
        order_id: intent.gatewayOrderId,
        theme: {
          color: '#B8860B',
          backdrop_color: '#181513',
        },
        prefill: {
          name: shippingAddress.fullName,
          email: profile.email,
          contact: shippingAddress.phone,
        },
        handler: async (response: Record<string, string>) => {
          try {
            await fetchApi('/checkout/verify', {
              method: 'POST',
              body: JSON.stringify({
                orderId: intent.orderId,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            router.replace('/orders/' + intent.orderId + '/confirmation');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Payment verification failed');
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
          },
        },
      });

      if (typeof (payment as any).on === 'function') {
        (payment as any).on('payment.failed', function (resp: any) {
          setError(
            resp?.error?.description ||
              'Payment could not be completed. Please check your card or UPI details and try again.'
          );
          setPaying(false);
        });
      }

      payment.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize payment');
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
        <main className="mx-auto max-w-6xl px-6 py-24 md:py-32">
          <div className="animate-pulse space-y-8">
            <div className="h-8 w-64 bg-[#ECE8E0]" />
            <div className="grid gap-10 md:grid-cols-[1fr_360px]">
              <div className="h-96 bg-[#ECE8E0]" />
              <div className="h-80 bg-[#ECE8E0]" />
            </div>
          </div>
        </main>
      </>
    );
  }

  if (error && !cart) {
    return (
      <>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
        <main className="mx-auto max-w-2xl px-6 py-28 text-center md:py-36">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#B8860B]">
            Checkout Gateway
          </p>
          <h1 className="mt-4 font-serif text-4xl text-[#181513]">
            Checkout Unavailable
          </h1>
          <p className="mt-3 text-sm text-red-700">{error}</p>
          <Link
            href="/cart"
            className="mt-8 inline-flex items-center gap-2 border border-[#181513] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[#181513] hover:bg-[#181513] hover:text-[#F7F5F0] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Return to Bag
          </Link>
        </main>
      </>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
        <main className="mx-auto max-w-2xl px-6 py-28 text-center md:py-36">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#B8860B]">
            Secure Checkout
          </p>
          <h1 className="mt-4 font-serif text-4xl text-[#181513] md:text-5xl">
            Your bag is empty.
          </h1>
          <p className="mt-3 text-sm text-[#181513]/60">
            Please add selections to your shopping bag before proceeding to checkout.
          </p>
          <Link
            href="/shop"
            className="mt-8 inline-flex items-center gap-2 bg-[#181513] px-6 py-3.5 text-xs uppercase tracking-[0.18em] text-[#F7F5F0] transition hover:bg-[#B8860B]"
          >
            Explore the Collection
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <main className="mx-auto max-w-[1280px] px-4 pb-24 pt-8 sm:px-6 md:px-10 md:pb-32 md:pt-14">
        {/* Header */}
        <header className="border-b border-[#E3DFD7] pb-6 sm:pb-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#B8860B]">
                Express Direct Checkout
              </p>
              <h1 className="mt-2 font-serif text-3xl font-normal tracking-[-0.03em] text-[#181513] sm:text-5xl md:text-6xl">
                Delivery Details
              </h1>
            </div>
            <Link
              href="/cart"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#181513]/60 transition hover:text-[#181513]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Bag
            </Link>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-[#2E7D32]">
            <ShieldCheck className="h-4 w-4" />
            <span>256-Bit SSL Encrypted • Direct-from-Mylapore Dispatch</span>
          </div>
        </header>

        {/* Checkout Form */}
        <form onSubmit={submit} className="mt-8 grid gap-10 md:mt-12 md:grid-cols-[1fr_380px] lg:gap-16">
          <section className="space-y-8">
            {/* Saved Addresses */}
            {addresses.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#181513]/70">
                  Select Saved Address
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {addresses.map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => {
                        setAddress(a);
                        const matched = INDIAN_STATES.find(
                          (s) => s.name.toLowerCase() === a.state?.toLowerCase()
                        );
                        if (matched) setStateCode(matched.code);
                      }}
                      className={`w-full border p-4 text-left text-xs transition-colors rounded-xs ${
                        address.id === a.id
                          ? 'border-[#181513] bg-white shadow-xs ring-1 ring-[#181513]'
                          : 'border-[#E3DFD7] bg-white/40 hover:border-[#B8860B]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#181513]">{a.fullName}</span>
                        {a.isDefault && (
                          <span className="text-[10px] uppercase tracking-wider text-[#A66B18] font-medium">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[#181513]/70">
                        {a.addressLine1}, {a.city}, {a.state} {a.postalCode}
                      </p>
                      <p className="mt-1 text-[11px] text-[#181513]/50">{a.phone}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery Address Form */}
            <div className="border-t border-[#181513] pt-7">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#181513]/70">
                Shipping Destination (India)
              </p>

              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#181513]/80">
                  Full Name *
                  <input
                    required
                    value={address.fullName}
                    onChange={(e) => setField('fullName', e.target.value)}
                    placeholder="e.g. Meenakshi Sundaram"
                    className="mt-2 w-full border-b border-[#181513]/30 bg-transparent py-2.5 text-xs text-[#181513] outline-none transition focus:border-[#B8860B]"
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#181513]/80">
                  Phone (for Delivery SMS/Call) *
                  <input
                    required
                    type="tel"
                    value={address.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    placeholder="+91 98765 43210"
                    className="mt-2 w-full border-b border-[#181513]/30 bg-transparent py-2.5 text-xs text-[#181513] outline-none transition focus:border-[#B8860B]"
                  />
                </label>

                <label className="block sm:col-span-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#181513]/80">
                  Street Address & House No. *
                  <input
                    required
                    value={address.addressLine1}
                    onChange={(e) => setField('addressLine1', e.target.value)}
                    placeholder="Door No, Building, Street Name"
                    className="mt-2 w-full border-b border-[#181513]/30 bg-transparent py-2.5 text-xs text-[#181513] outline-none transition focus:border-[#B8860B]"
                  />
                </label>

                <label className="block sm:col-span-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#181513]/80">
                  Apartment, Suite, Landmark (Optional)
                  <input
                    value={address.addressLine2 || ''}
                    onChange={(e) => setField('addressLine2', e.target.value)}
                    placeholder="Near Temple / Landmark"
                    className="mt-2 w-full border-b border-[#181513]/30 bg-transparent py-2.5 text-xs text-[#181513] outline-none transition focus:border-[#B8860B]"
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#181513]/80">
                  City / Town *
                  <input
                    required
                    value={address.city}
                    onChange={(e) => setField('city', e.target.value)}
                    placeholder="Chennai"
                    className="mt-2 w-full border-b border-[#181513]/30 bg-transparent py-2.5 text-xs text-[#181513] outline-none transition focus:border-[#B8860B]"
                  />
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#181513]/80">
                  PIN Code *
                  <input
                    required
                    maxLength={6}
                    inputMode="numeric"
                    value={address.postalCode}
                    onChange={(e) => setField('postalCode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="600004"
                    className="mt-2 w-full border-b border-[#181513]/30 bg-transparent py-2.5 text-xs text-[#181513] outline-none transition focus:border-[#B8860B]"
                  />
                </label>

                {/* Curated Indian State Selector (Auto sets GST State Code) */}
                <label className="block sm:col-span-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#181513]/80">
                  State / Territory *
                  <div className="mt-2 relative">
                    <select
                      value={stateCode}
                      onChange={(e) => handleStateChange(e.target.value)}
                      className="w-full appearance-none border-b border-[#181513]/30 bg-transparent py-2.5 text-xs font-medium text-[#181513] outline-none transition focus:border-[#B8860B] cursor-pointer"
                    >
                      {INDIAN_STATES.map((state) => (
                        <option key={state.code} value={state.code}>
                          {state.name} (Code: {state.code})
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2 top-2.5 text-xs text-[#181513]/50">
                      ▼
                    </span>
                  </div>
                </label>
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  disabled={savingAddress}
                  onClick={() => saveAddress()}
                  className="text-xs text-[#A66B18] font-medium underline underline-offset-4 hover:text-[#181513] disabled:opacity-50"
                >
                  {savingAddress ? 'Saving address…' : 'Save this address to your account'}
                </button>
              </div>
            </div>

            {/* Coupon Code & 1-Tap Chips */}
            <div className="border-t border-[#E3DFD7] pt-7">
              <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#181513]/80">
                Have a Festive or Promo Coupon?
              </label>

              <div className="mt-3 flex max-w-md items-center gap-2">
                <input
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                  placeholder="Enter code (e.g. SEETHA10)"
                  className="flex-1 border-b border-[#181513]/30 bg-transparent py-2.5 text-xs uppercase tracking-wider text-[#181513] outline-none transition focus:border-[#B8860B]"
                />
                <button
                  type="button"
                  onClick={handleApplyCouponManual}
                  className="border border-[#181513] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#181513] hover:bg-[#181513] hover:text-[#F7F5F0] transition active:scale-95 cursor-pointer"
                >
                  Apply
                </button>
              </div>

              {/* 1-Tap Coupon Chips */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-[#181513]/60">Quick apply:</span>
                {[
                  { code: 'SEETHA10', label: 'SEETHA10 (10% Off)' },
                  { code: 'WELCOME50', label: 'WELCOME50 (₹50 Off)' },
                ].map((chip) => {
                  const isActive = cart?.pricing.couponCode === chip.code;
                  return (
                    <button
                      key={chip.code}
                      type="button"
                      onClick={() => handleToggleCoupon(chip.code)}
                      className={`inline-flex items-center gap-1 border border-dashed px-2.5 py-1 text-[11px] font-semibold transition rounded-xs cursor-pointer ${
                        isActive
                          ? 'border-[#B8860B] bg-[#B8860B] text-[#F7F5F0]'
                          : 'border-[#B8860B] bg-[#B8860B]/10 text-[#B8860B] hover:bg-[#B8860B] hover:text-[#F7F5F0]'
                      }`}
                    >
                      <Tag className="h-3 w-3" />
                      {chip.label}
                      {isActive && <span className="ml-1 text-[10px]">✕</span>}
                    </button>
                  );
                })}
              </div>

              {couponAppliedNotice && (
                <p className="mt-2.5 flex items-center gap-1 text-xs text-[#2E7D32]">
                  <Check className="h-3.5 w-3.5" />
                  {couponAppliedNotice}
                </p>
              )}
            </div>

            {error && (
              <p role="alert" className="border-l-2 border-red-700 bg-red-50 p-3.5 text-xs text-red-800">
                {error}
              </p>
            )}
          </section>

          {/* Order Summary Aside */}
          <aside className="h-fit border-t border-[#181513] pt-6 md:sticky md:top-10">
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#181513]/70">
              Order Summary ({cart.items.reduce((s, i) => s + i.quantity, 0)} Items)
            </p>

            {/* Item Mini List with Stepper & Remove */}
            <div className="mt-4 max-h-64 overflow-y-auto divide-y divide-[#E3DFD7]/60 pr-1 text-xs">
              {cart.items.map((item) => (
                <div key={item.variantId} className="flex items-center justify-between py-2.5 gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[#181513]">{item.productName}</p>
                    <p className="text-[11px] text-[#181513]/55">
                      {item.packType} {item.weightGrams ? `· ${item.weightGrams}g` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Stepper */}
                    <div className="flex items-center border border-[#E3DFD7] bg-white rounded-xs">
                      <button
                        type="button"
                        onClick={() => handleDecrementItem(item)}
                        className="grid h-6 w-6 place-items-center text-xs text-[#181513] hover:bg-[#F7F5F0] transition cursor-pointer"
                        title={item.quantity <= 1 ? 'Remove from bag' : 'Decrease quantity'}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="grid h-6 min-w-6 place-items-center border-x border-[#E3DFD7] px-1 text-[11px] font-medium tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        disabled={item.quantity >= 10}
                        onClick={() => handleIncrementItem(item)}
                        className="grid h-6 w-6 place-items-center text-xs text-[#181513] hover:bg-[#F7F5F0] transition disabled:opacity-30 cursor-pointer"
                        title="Increase quantity"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <span className="tabular-nums text-[#181513] font-medium min-w-16 text-right">
                      ₹{(item.lineTotalCents / 100).toLocaleString('en-IN')}
                    </span>

                    {/* Remove Button */}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.variantId || (item as any).id)}
                      className="p-1 text-[#181513]/40 hover:text-red-700 transition cursor-pointer"
                      title="Remove from bag"
                      aria-label={`Remove ${item.productName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-3 border-t border-[#E3DFD7] pt-4 text-xs text-[#181513]">
              <div className="flex justify-between">
                <span className="text-[#181513]/70">Subtotal</span>
                <span className="tabular-nums font-medium">
                  ₹{(cart.pricing.subtotalCents / 100).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#181513]/70">Tax (GST)</span>
                <span className="tabular-nums font-medium">
                  ₹{(cart.pricing.taxCents / 100).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#181513]/70">Courier Shipping</span>
                <span className="tabular-nums font-medium">
                  {cart.pricing.shippingCents === 0 ? (
                    <span className="text-[#2E7D32] font-semibold">FREE (₹500 or more after discounts)</span>
                  ) : (
                    `₹${(cart.pricing.shippingCents / 100).toLocaleString('en-IN')}`
                  )}
                </span>
              </div>

              {((cart.pricing.couponDiscountCents ?? 0) > 0 || (cart.pricing.discountCents ?? 0) > 0) && (
                <div className="flex justify-between items-center text-[#B8860B] font-medium">
                  <span className="flex items-center gap-1.5">
                    Coupon Discount {cart.pricing.couponCode ? `(${cart.pricing.couponCode})` : ''}
                    {cart.pricing.couponCode && (
                      <button
                        type="button"
                        onClick={() => handleToggleCoupon(cart.pricing.couponCode!)}
                        className="text-[10px] text-red-700 underline underline-offset-2 hover:opacity-80 cursor-pointer"
                        title="Remove coupon"
                      >
                        Remove
                      </button>
                    )}
                  </span>
                  <span className="tabular-nums">
                    −₹{(((cart.pricing.couponDiscountCents ?? 0) + (cart.pricing.discountCents ?? 0)) / 100).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-between border-t border-[#E3DFD7] pt-4 font-serif text-2xl text-[#181513]">
              <span>Grand Total</span>
              <span className="tabular-nums font-normal">
                ₹{(cart.pricing.grandTotalCents / 100).toLocaleString('en-IN')}
              </span>
            </div>

            <div className="mt-5 border-t border-[#E3DFD7] pt-4">
              <label className="flex items-start gap-2.5 text-xs text-[#181513]/80 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded-xs border-[#181513]/40 text-[#181513] accent-[#B8860B] cursor-pointer shrink-0"
                />
                <span className="leading-snug">
                  I have read and agree to Seethapaati&apos;s{' '}
                  <Link
                    href="/terms-and-conditions"
                    target="_blank"
                    className="font-semibold text-[#181513] underline underline-offset-2 hover:text-[#B8860B]"
                  >
                    Terms &amp; Conditions
                  </Link>
                  ,{' '}
                  <Link
                    href="/privacy-policy"
                    target="_blank"
                    className="font-semibold text-[#181513] underline underline-offset-2 hover:text-[#B8860B]"
                  >
                    Privacy Policy
                  </Link>
                  , and acknowledge the{' '}
                  <Link
                    href="/returns"
                    target="_blank"
                    className="font-semibold text-[#181513] underline underline-offset-2 hover:text-[#B8860B]"
                  >
                    Allergen &amp; Return Policies
                  </Link>.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={paying}
              className="mt-6 flex w-full h-13 items-center justify-center gap-2 bg-[#181513] px-6 text-xs uppercase tracking-[0.2em] font-semibold text-[#F7F5F0] transition hover:bg-[#B8860B] active:scale-[0.99] disabled:opacity-50"
            >
              <Lock className="h-4 w-4" />
              {paying ? 'Connecting Razorpay…' : 'Proceed to Payment'}
            </button>

            <div className="mt-4 space-y-1 text-center text-[11px] text-[#181513]/50">
              <p>Supports UPI (GPay, PhonePe, Paytm), NetBanking, Cards &amp; EMI.</p>
              <p>Fast dispatch from our Mylapore kitchen within 24-48 hours.</p>
            </div>
          </aside>
        </form>
      </main>
    </>
  );
}