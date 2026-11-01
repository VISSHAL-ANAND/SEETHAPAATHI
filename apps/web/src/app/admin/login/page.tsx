'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { RoleName, type AuthResponse } from '@seethapaati/contracts';
import { fetchApi } from '../../../lib/api-client';

function getSafeNext(value: string | null, fallback: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  return value;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = getSafeNext(search.get('next'), '/admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetchApi<Pick<AuthResponse, 'user' | 'expiresIn'>>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const roles = response.user?.roles || [];
      const hasAdminAccess =
        roles.includes(RoleName.ADMIN) ||
        roles.includes(RoleName.STAFF) ||
        roles.includes(RoleName.MANAGER);

      if (!hasAdminAccess) {
        await fetchApi('/auth/logout', { method: 'POST' }).catch(() => {});
        setError('Access denied. Administrator privileges are required to enter this console.');
        return;
      }

      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid administrator credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[85vh] flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md border border-[#E3DFD7] bg-white/40 p-8 shadow-xs md:p-10 backdrop-blur-xs">
        <div className="flex items-center justify-between border-b border-[#E3DFD7] pb-5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#B8860B]" />
            <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#B8860B]">
              Administrative Portal
            </span>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-[#181513]/55 transition hover:text-[#181513]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Storefront
          </Link>
        </div>

        <div className="mt-6">
          <h1 className="font-serif text-3xl font-normal tracking-[-0.03em] text-[#181513] md:text-4xl">
            Console Sign In
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-[#181513]/60">
            Authentication is required to access operations, catalog merchandising, inventory, and order fulfillment.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 border border-red-300 bg-red-50/80 p-4 text-xs text-red-800"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <p className="leading-relaxed font-sans">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.18em] text-[#181513]/70">
              Admin Email
            </label>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@seethapaati.com"
              className="mt-2 w-full border-b border-[#181513]/25 bg-transparent py-2.5 text-sm text-[#181513] placeholder-[#181513]/30 outline-none transition focus:border-[#B8860B]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.18em] text-[#181513]/70">
              Password
            </label>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="mt-2 w-full border-b border-[#181513]/25 bg-transparent py-2.5 text-sm text-[#181513] placeholder-[#181513]/30 outline-none transition focus:border-[#B8860B]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#181513] px-6 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#F7F5F0] transition hover:bg-[#2E2824] disabled:opacity-50"
          >
            {loading ? 'Authenticating…' : 'Access Portal'}
          </button>
        </form>

        <div className="mt-8 border-t border-[#E3DFD7] pt-5 text-center">
          <p className="text-[11px] text-[#181513]/50">
            For customer orders, returns, or address books, use the{' '}
            <Link href="/account/login" className="text-[#A66B18] underline underline-offset-4 hover:text-[#181513]">
              customer sign-in
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}

