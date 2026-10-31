'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  MapPin,
  Package,
  RotateCcw,
  Bell,
  HelpCircle,
  ArrowUpRight,
  Plus,
  Edit2,
  Trash2,
  LogOut,
  CheckCircle,
  Calendar,
  Phone,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { fetchApi, ApiClientError } from '../../lib/api-client';

type Profile = {
  id?: string;
  fullName: string;
  email: string;
  phone?: string | null;
  createdAt?: string;
};

type Address = {
  id: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

const blankAddress = {
  fullName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'IN',
  isDefault: false,
};

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ fullName: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // Address Edit/Create State
  const [addressForm, setAddressForm] = useState(blankAddress);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [p, a] = await Promise.all([
        fetchApi<Profile>('/users/me'),
        fetchApi<Address[]>('/users/me/addresses'),
      ]);
      setProfile(p);
      setProfileForm({ fullName: p.fullName || '', phone: p.phone || '' });
      setAddresses(a);
    } catch (e) {
      if (e instanceof ApiClientError && (e.status === 401 || e.code === 'UNAUTHORIZED')) {
        router.replace('/account/login?redirect=/account');
      } else {
        setError(e instanceof Error ? e.message : 'Unable to load account details.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData().catch(() => undefined);
  }, []);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setError('');
    setNotice('');
    try {
      const updated = await fetchApi<Profile>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(profileForm),
      });
      setProfile(updated);
      setProfileForm({ fullName: updated.fullName, phone: updated.phone || '' });
      setIsEditingProfile(false);
      setNotice('Your personal details have been updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  function handleOpenNewAddress() {
    setEditingAddressId(null);
    setAddressForm({
      ...blankAddress,
      fullName: profile?.fullName || '',
      phone: profile?.phone || '',
      isDefault: addresses.length === 0,
    });
    setIsAddressModalOpen(true);
  }

  function handleOpenEditAddress(addr: Address) {
    setEditingAddressId(addr.id);
    setAddressForm({
      fullName: addr.fullName,
      phone: addr.phone,
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2 || '',
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      country: addr.country || 'IN',
      isDefault: addr.isDefault,
    });
    setIsAddressModalOpen(true);
  }

  async function handleSaveAddress(e: FormEvent) {
    e.preventDefault();
    setSavingAddress(true);
    setError('');
    setNotice('');
    try {
      const saved = editingAddressId
        ? await fetchApi<Address>('/users/me/addresses/' + editingAddressId, {
            method: 'PATCH',
            body: JSON.stringify(addressForm),
          })
        : await fetchApi<Address>('/users/me/addresses', {
            method: 'POST',
            body: JSON.stringify(addressForm),
          });

      setAddresses((prev) => {
        const next = editingAddressId
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [...prev, saved];
        return saved.isDefault ? next.map((a) => ({ ...a, isDefault: a.id === saved.id })) : next;
      });

      setIsAddressModalOpen(false);
      setNotice(editingAddressId ? 'Delivery address updated.' : 'New delivery address added.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save address.');
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleDeleteAddress(id: string) {
    if (!window.confirm('Are you sure you want to remove this delivery address?')) return;
    try {
      await fetchApi('/users/me/addresses/' + id, { method: 'DELETE' });
      setAddresses((prev) => prev.filter((item) => item.id !== id));
      setNotice('Address removed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to remove address.');
    }
  }

  async function handleLogout() {
    await fetchApi('/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/');
  }

  return (
    <main className="min-h-screen bg-[#FBF9F5] px-6 pb-28 pt-8 md:px-12 md:pb-36 md:pt-12">
      <div className="mx-auto max-w-6xl">
        {/* Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#ECE7DE] pb-6">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#B8860B]">
              Patron Sanctuary
            </span>
            <h1 className="mt-1 font-serif text-3xl md:text-4xl text-[#183024]">
              {profile?.fullName ? `Namaste, ${profile.fullName}` : 'My Account'}
            </h1>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xs border border-[#183024]/20 bg-white/70 px-3.5 py-1.5 text-xs uppercase tracking-wider text-[#183024] hover:bg-[#183024] hover:text-[#FAF7F2] transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </header>

        {/* Notices & Feedback */}
        {error && (
          <div className="mt-6 rounded-xs border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-6 rounded-xs border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            {notice}
          </div>
        )}

        {/* Quick Navigation Cards */}
        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <Link
            href="/account/orders"
            className="group rounded-sm border border-[#ECE7DE] bg-white p-4 shadow-xs hover:border-[#183024]/40 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <Package className="h-5 w-5 text-[#183024]" />
              <ArrowUpRight className="h-4 w-4 text-[#181513]/30 group-hover:text-[#183024] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <h3 className="mt-3 font-serif text-base text-[#181513]">Your Orders</h3>
            <p className="mt-0.5 text-[11px] text-[#181513]/60">Track shipments & invoices</p>
          </Link>

          <Link
            href="/account/returns"
            className="group rounded-sm border border-[#ECE7DE] bg-white p-4 shadow-xs hover:border-[#183024]/40 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <RotateCcw className="h-5 w-5 text-[#183024]" />
              <ArrowUpRight className="h-4 w-4 text-[#181513]/30 group-hover:text-[#183024] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <h3 className="mt-3 font-serif text-base text-[#181513]">Returns</h3>
            <p className="mt-0.5 text-[11px] text-[#181513]/60">Pickups & refund status</p>
          </Link>

          <Link
            href="/account/notifications"
            className="group rounded-sm border border-[#ECE7DE] bg-white p-4 shadow-xs hover:border-[#183024]/40 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <Bell className="h-5 w-5 text-[#183024]" />
              <ArrowUpRight className="h-4 w-4 text-[#181513]/30 group-hover:text-[#183024] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <h3 className="mt-3 font-serif text-base text-[#181513]">Notices</h3>
            <p className="mt-0.5 text-[11px] text-[#181513]/60">Dispatch logs & channels</p>
          </Link>

          <a
            href="mailto:care@seethapaati.com"
            className="group rounded-sm border border-[#ECE7DE] bg-white p-4 shadow-xs hover:border-[#183024]/40 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <HelpCircle className="h-5 w-5 text-[#183024]" />
              <ArrowUpRight className="h-4 w-4 text-[#181513]/30 group-hover:text-[#183024] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
            <h3 className="mt-3 font-serif text-base text-[#181513]">Support</h3>
            <p className="mt-0.5 text-[11px] text-[#181513]/60">Dedicated patron concierge</p>
          </a>
        </section>

        {/* Loading Skeletons */}
        {loading ? (
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div className="h-72 rounded-sm border border-[#ECE7DE] bg-white p-6 animate-pulse" />
            <div className="h-72 rounded-sm border border-[#ECE7DE] bg-white p-6 animate-pulse" />
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.3fr]">
            {/* Left Column: Profile Card */}
            <section className="rounded-sm border border-[#ECE7DE] bg-white p-6 md:p-8 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-[#ECE7DE] pb-4">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-[#183024]" />
                    <h2 className="font-serif text-xl text-[#183024]">Patron Profile</h2>
                  </div>
                  {!isEditingProfile && (
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(true)}
                      className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-[#B8860B] hover:text-[#183024] transition"
                    >
                      <Edit2 className="h-3 w-3" />
                      Edit Details
                    </button>
                  )}
                </div>

                {isEditingProfile ? (
                  <form onSubmit={handleSaveProfile} className="mt-6 space-y-4">
                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wider text-[#181513]/70">
                        Full Name
                      </label>
                      <input
                        required
                        type="text"
                        value={profileForm.fullName}
                        onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                        className="mt-1 w-full rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] px-3 py-2 text-xs text-[#181513] focus:border-[#183024] focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wider text-[#181513]/70">
                        Email Address (Read-only)
                      </label>
                      <input
                        disabled
                        type="email"
                        value={profile?.email || ''}
                        className="mt-1 w-full rounded-xs border border-[#ECE7DE] bg-[#ECE8E0]/40 px-3 py-2 text-xs text-[#181513]/50 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium uppercase tracking-wider text-[#181513]/70">
                        Contact Phone
                      </label>
                      <input
                        type="tel"
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        placeholder="+91 98765 43210"
                        className="mt-1 w-full rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] px-3 py-2 text-xs text-[#181513] focus:border-[#183024] focus:outline-hidden"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="rounded-xs bg-[#183024] px-4 py-2 text-xs uppercase tracking-wider text-[#FAF7F2] hover:bg-[#254333] transition disabled:opacity-50"
                      >
                        {savingProfile ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingProfile(false)}
                        className="rounded-xs border border-[#181513]/30 px-3 py-2 text-xs uppercase tracking-wider text-[#181513] hover:bg-stone-50 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 text-[#181513]/50 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#181513]/50">Full Name</p>
                        <p className="text-sm font-medium text-[#181513]">{profile?.fullName || 'Not specified'}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Mail className="h-4 w-4 text-[#181513]/50 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#181513]/50">Email Address</p>
                        <p className="text-sm font-medium text-[#181513]">{profile?.email || '—'}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-[#181513]/50 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#181513]/50">Registered Phone</p>
                        <p className="text-sm font-medium text-[#181513]">{profile?.phone || 'No phone linked'}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 pt-2 border-t border-[#ECE7DE]">
                      <Calendar className="h-4 w-4 text-[#181513]/40 mt-0.5" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[#181513]/50">Patron Since</p>
                        <p className="text-xs text-[#181513]/70">
                          {profile?.createdAt
                            ? new Date(profile.createdAt).toLocaleDateString('en-IN', {
                                month: 'long',
                                year: 'numeric',
                              })
                            : 'October 2026'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 pt-4 border-t border-[#ECE7DE] flex items-center justify-between text-xs text-[#181513]/60">
                <span className="flex items-center gap-1.5 text-emerald-800">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Verified Heirloom Account
                </span>
              </div>
            </section>

            {/* Right Column: Saved Addresses Card */}
            <section className="rounded-sm border border-[#ECE7DE] bg-white p-6 md:p-8 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#ECE7DE] pb-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-[#183024]" />
                  <h2 className="font-serif text-xl text-[#183024]">Delivery Addresses</h2>
                </div>
                <button
                  type="button"
                  onClick={handleOpenNewAddress}
                  className="inline-flex items-center gap-1 rounded-xs bg-[#183024] px-3 py-1.5 text-xs uppercase tracking-wider text-[#FAF7F2] hover:bg-[#254333] transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Address
                </button>
              </div>

              {/* Address List */}
              <div className="mt-6 space-y-4">
                {addresses.length === 0 ? (
                  <div className="rounded-xs border border-dashed border-[#ECE7DE] p-8 text-center">
                    <MapPin className="mx-auto h-7 w-7 text-[#181513]/30" />
                    <p className="mt-2 text-xs text-[#181513]/60">No saved delivery addresses yet.</p>
                    <button
                      type="button"
                      onClick={handleOpenNewAddress}
                      className="mt-3 text-xs uppercase tracking-wider text-[#B8860B] underline underline-offset-4"
                    >
                      Add your first delivery address
                    </button>
                  </div>
                ) : (
                  addresses.map((addr) => (
                    <div
                      key={addr.id}
                      className="group rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] p-4 transition hover:border-[#183024]/40"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-[#181513]">{addr.fullName}</span>
                            {addr.isDefault && (
                              <span className="rounded-xs border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-800">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-[#181513]/80 leading-relaxed">
                            {addr.addressLine1}
                            {addr.addressLine2 ? `, ${addr.addressLine2}` : ''}
                          </p>
                          <p className="text-xs text-[#181513]/80">
                            {addr.city}, {addr.state} —{' '}
                            <strong className="font-mono text-sm font-semibold text-[#183024]">
                              {addr.postalCode}
                            </strong>
                          </p>
                          <p className="mt-1.5 text-[11px] text-[#181513]/60">
                            Phone: {addr.phone}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditAddress(addr)}
                            className="p-1 text-[#181513]/50 hover:text-[#183024] transition"
                            title="Edit Address"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAddress(addr.id)}
                            className="p-1 text-[#181513]/50 hover:text-red-700 transition"
                            title="Delete Address"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add / Edit Address Drawer / Form Modal */}
              {isAddressModalOpen && (
                <div className="mt-6 rounded-xs border border-[#183024]/30 bg-white p-5 shadow-sm">
                  <h3 className="font-serif text-base text-[#183024] border-b border-[#ECE7DE] pb-2">
                    {editingAddressId ? 'Edit Delivery Address' : 'Add New Delivery Address'}
                  </h3>

                  <form onSubmit={handleSaveAddress} className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-1">
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-[#181513]/70">
                        Recipient Full Name
                      </label>
                      <input
                        required
                        type="text"
                        value={addressForm.fullName}
                        onChange={(e) => setAddressForm({ ...addressForm, fullName: e.target.value })}
                        className="mt-1 w-full rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] px-2.5 py-1.5 text-xs text-[#181513] focus:border-[#183024] focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-[#181513]/70">
                        Contact Phone
                      </label>
                      <input
                        required
                        type="tel"
                        value={addressForm.phone}
                        onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                        className="mt-1 w-full rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] px-2.5 py-1.5 text-xs text-[#181513] focus:border-[#183024] focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-[#181513]/70">
                        Street Address / Door No.
                      </label>
                      <input
                        required
                        type="text"
                        value={addressForm.addressLine1}
                        onChange={(e) => setAddressForm({ ...addressForm, addressLine1: e.target.value })}
                        className="mt-1 w-full rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] px-2.5 py-1.5 text-xs text-[#181513] focus:border-[#183024] focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-[#181513]/70">
                        Landmark / Locality (Optional)
                      </label>
                      <input
                        type="text"
                        value={addressForm.addressLine2 || ''}
                        onChange={(e) => setAddressForm({ ...addressForm, addressLine2: e.target.value })}
                        className="mt-1 w-full rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] px-2.5 py-1.5 text-xs text-[#181513] focus:border-[#183024] focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-[#181513]/70">
                        City
                      </label>
                      <input
                        required
                        type="text"
                        value={addressForm.city}
                        onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                        className="mt-1 w-full rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] px-2.5 py-1.5 text-xs text-[#181513] focus:border-[#183024] focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-[#181513]/70">
                        State
                      </label>
                      <input
                        required
                        type="text"
                        value={addressForm.state}
                        onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                        className="mt-1 w-full rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] px-2.5 py-1.5 text-xs text-[#181513] focus:border-[#183024] focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-[#181513]/70">
                        Postal PIN Code (6 digits)
                      </label>
                      <input
                        required
                        pattern="^[1-9][0-9]{5}$"
                        type="text"
                        value={addressForm.postalCode}
                        onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })}
                        className="mt-1 w-full rounded-xs border border-[#ECE7DE] bg-[#FBF9F5] px-2.5 py-1.5 text-xs text-[#181513] focus:border-[#183024] focus:outline-hidden font-mono"
                      />
                    </div>

                    <div className="sm:col-span-1 flex items-center pt-5">
                      <label className="inline-flex items-center gap-2 text-xs text-[#181513] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={addressForm.isDefault}
                          onChange={(e) => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                          className="h-4 w-4 rounded-xs border-[#ECE7DE] text-[#183024] focus:ring-0"
                        />
                        Set as default address
                      </label>
                    </div>

                    <div className="sm:col-span-2 flex items-center gap-3 pt-3">
                      <button
                        type="submit"
                        disabled={savingAddress}
                        className="rounded-xs bg-[#183024] px-4 py-2 text-xs uppercase tracking-wider text-[#FAF7F2] hover:bg-[#254333] transition disabled:opacity-50"
                      >
                        {savingAddress ? 'Saving…' : 'Save Address'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddressModalOpen(false)}
                        className="rounded-xs border border-[#181513]/30 px-3 py-2 text-xs uppercase tracking-wider text-[#181513] hover:bg-stone-50 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
