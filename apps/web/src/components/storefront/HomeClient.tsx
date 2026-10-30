'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ProductDto } from '@seethapaati/contracts';

const fallbackCollections = [
  {
    number: '01',
    name: 'One Powder for All',
    note: 'A versatile everyday powder · ₹299',
    image: '/images/masala.jpg',
    imageAlt: 'Seethapaati One Powder for All jar',
    tone: 'collection-card--spice',
    slug: 'one-powder-for-all',
    badge: 'FEATURED',
  },
  {
    number: '02',
    name: 'ABC Malt Health Mix',
    note: 'A nourishing malt mix · ₹449',
    image: '/images/mix.png',
    imageAlt: 'Seethapaati ABC Malt Health Mix jar',
    tone: 'collection-card--malt',
    slug: 'abc-malt-health-mix',
    badge: 'BESTSELLER',
  },
  {
    number: '03',
    name: 'Premium Ceylon Tea Blend',
    note: 'A cup to make your own · ₹349',
    image: '/images/tea.png',
    imageAlt: 'Seethapaati Premium Ceylon Tea Blend jar',
    tone: 'collection-card--tea',
    slug: 'premium-ceylon-tea-blend',
    badge: 'NEW',
  },
];

interface HomeClientProps {
  initialProducts?: ProductDto[];
}

export function HomeClient({ initialProducts = [] }: HomeClientProps) {
  const [products] = useState<ProductDto[]>(initialProducts);
  const [activePlacementTab, setActivePlacementTab] = useState<'ALL' | 'FEATURED' | 'BESTSELLERS' | 'NEW_ARRIVALS' | 'SALE'>('ALL');

  // Hero Configuration: Dynamic Hero Product
  const heroProduct = useMemo(() => {
    const heroProds = products.filter(
      (p) => p.status === 'ACTIVE' && p.merchandising?.placements?.includes('HERO')
    );
    if (heroProds.length === 0) return null;
    return heroProds.sort((a, b) => {
      const prioA = a.merchandising?.hero?.priority ?? a.merchandising?.priority ?? 0;
      const prioB = b.merchandising?.hero?.priority ?? b.merchandising?.priority ?? 0;
      return prioB - prioA;
    })[0];
  }, [products]);

  const heroConfig = heroProduct?.merchandising?.hero;
  const headline = heroConfig?.headline;
  const subheadline =
    heroConfig?.subheadline ||
    'Meet Seethapaati — a growing collection of familiar flavours and everyday favourites, made to find a place in your kitchen.';
  const ctaLabel = heroConfig?.ctaLabel || 'Explore the collection';
  const ctaDestination = heroConfig?.ctaDestination || (heroProduct ? `/shop/${heroProduct.slug}` : '/shop');
  const mainImage = heroConfig?.desktopImageUrl || heroProduct?.images?.[0]?.url || '/images/masala.jpg';
  const smallImage = heroProduct?.images?.[1]?.url || '/images/tea.png';

  // Dynamic Collection Items based on merchandising placements
  const collectionItems = useMemo(() => {
    if (products.length === 0) {
      return fallbackCollections;
    }

    let filtered = products.filter((p) => p.status === 'ACTIVE');

    if (activePlacementTab !== 'ALL') {
      const withPlacement = filtered.filter(
        (p) =>
          p.merchandising?.placements?.includes(activePlacementTab) ||
          (activePlacementTab === 'FEATURED' && p.merchandising?.badge === 'FEATURED') ||
          (activePlacementTab === 'BESTSELLERS' && p.merchandising?.badge === 'BESTSELLER') ||
          (activePlacementTab === 'NEW_ARRIVALS' &&
            (p.merchandising?.badge === 'NEW' || p.merchandising?.badge === 'NEW_ARRIVAL')) ||
          (activePlacementTab === 'SALE' && p.merchandising?.badge === 'SALE')
      );
      if (withPlacement.length > 0) {
        filtered = withPlacement;
      }
    }

    const tones = ['collection-card--spice', 'collection-card--malt', 'collection-card--tea'];

    return filtered.slice(0, 6).map((product, index) => {
      const num = String(index + 1).padStart(2, '0');
      const img = product.images?.[0]?.url || '/images/masala.jpg';
      const variant = product.variants?.[0];
      const priceFormatted = variant ? `₹${(variant.priceCents / 100).toLocaleString('en-IN')}` : '';
      const note = product.category?.name || product.description?.slice(0, 35) || 'A considered delicacy';
      const tone = tones[index % tones.length];

      return {
        number: num,
        name: product.name,
        note: priceFormatted ? `${note} · ${priceFormatted}` : note,
        image: img,
        imageAlt: `${product.name} packaging`,
        tone,
        slug: product.slug,
        badge: product.merchandising?.badge,
      };
    });
  }, [products, activePlacementTab]);

  return (
    <div className="overflow-hidden">
      {/* Dynamic Editorial Hero Section */}
      <section className="home-hero relative">
        <div className="home-hero__copy">
          {headline ? (
            <h1 className="home-hero__title whitespace-pre-line">{headline}</h1>
          ) : (
            <h1 className="home-hero__title">
              Made for<br />
              <em>everyday</em><br />
              moments.
            </h1>
          )}
          <p className="home-hero__intro">{subheadline}</p>
          <div className="home-hero__actions">
            <Link href={ctaDestination} className="editorial-button editorial-button--dark">
              {ctaLabel} <ArrowUpRight size={16} strokeWidth={1.5} />
            </Link>
            <a href="#our-approach" className="editorial-text-link">
              A little about us <ArrowDownRight size={15} strokeWidth={1.5} />
            </a>
          </div>
        </div>
        <div className="home-hero__visual" aria-label="Seethapaati product collection">
          <div className="home-hero__image home-hero__image--main">
            <img src={mainImage} alt={heroProduct?.name || 'Seethapaati One Powder for All'} fetchPriority="high" />
          </div>
          <div className="home-hero__image home-hero__image--small">
            <img src={smallImage} alt="Seethapaati handcrafted blend" />
          </div>
          <span className="home-hero__seal" aria-hidden="true">
            <span>SEETHAPAATI</span>
            <b>Made for the everyday</b>
          </span>
          <span className="home-hero__vertical" aria-hidden="true">
            THE SEETHAPAATI COLLECTION · 2026
          </span>
        </div>
        <a className="home-hero__scroll" href="#collection">
          <span>View the collection</span>
          <span className="scroll-line" />
        </a>
      </section>

      {/* Brand Message Ticker */}
      <section className="ticker-band" aria-label="Seethapaati brand message">
        <div className="ticker-band__track" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <span className="ticker-band__group" key={index}>
              Good things belong at the table <i>✳</i> Seethapaati <i>✳</i> Everyday favourites <i>✳</i>
            </span>
          ))}
        </div>
      </section>

      {/* Merchandised Collection Section */}
      <section id="collection" className="home-collection section-wrap">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-number">01 /</span> The collection
            </p>
            <h2 className="section-title">
              A good place<br />
              <em>to begin.</em>
            </h2>
          </div>
          <div className="section-heading__aside">
            <p>Explore the products currently in our kitchen-to-yours collection.</p>
            <Link href="/shop" className="editorial-text-link">
              Shop all products <ArrowUpRight size={15} strokeWidth={1.5} />
            </Link>
          </div>
        </div>

        {/* Merchandising Placement Filter Tabs */}
        <div className="mb-8 flex flex-wrap gap-4 border-b border-[#E3DFD7] pb-3 text-[10px] uppercase tracking-[0.2em]">
          {(
            [
              { key: 'ALL', label: 'All Curations' },
              { key: 'FEATURED', label: 'Featured Collection' },
              { key: 'BESTSELLERS', label: 'Bestsellers' },
              { key: 'NEW_ARRIVALS', label: 'New Arrivals' },
              { key: 'SALE', label: 'Special Offers' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActivePlacementTab(tab.key)}
              className={`relative py-1 transition-colors ${
                activePlacementTab === tab.key
                  ? 'text-[#B8860B] font-semibold'
                  : 'text-[#181513]/55 hover:text-[#181513]'
              }`}
            >
              {tab.label}
              {activePlacementTab === tab.key && (
                <span className="absolute inset-x-0 -bottom-[13px] h-[2px] bg-[#B8860B]" />
              )}
            </button>
          ))}
        </div>

        {/* Dynamic Collection Grid */}
        <div className="collection-grid">
          {collectionItems.map((item) => (
            <Link href={`/shop/${item.slug}`} className={`collection-card ${item.tone}`} key={item.number}>
              <div className="collection-card__media">
                <span className="collection-card__number">{item.number}</span>
                <img src={item.image} alt={item.imageAlt} loading="lazy" />
                <span className="collection-card__arrow">
                  <ArrowUpRight size={18} strokeWidth={1.4} />
                </span>
                {item.badge && (
                  <span className="absolute left-3 bottom-3 border border-[#B8860B]/40 bg-[#F7F5F0]/95 px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.18em] text-[#B8860B] backdrop-blur-xs">
                    {item.badge.replace('_', ' ')}
                  </span>
                )}
              </div>
              <div className="collection-card__details">
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.note}</p>
                </div>
                <span className="collection-card__index">{item.number}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Approach Section */}
      <section id="our-approach" className="approach-section">
        <div className="approach-section__image">
          <img src="/images/mix.png" alt="Seethapaati product jar" loading="lazy" />
          <span className="approach-section__caption">SEETHAPAATI · A WORK IN PROGRESS</span>
        </div>
        <div className="approach-section__copy">
          <p className="eyebrow">
            <span className="eyebrow-number">02 /</span> Our approach
          </p>
          <h2 className="section-title">
            Growing with<br />
            <em>every jar.</em>
          </h2>
          <p className="approach-section__body">
            We’re at the beginning of our journey. Seethapaati is growing one product at a time, with a focus on bringing familiar food and drink favourites into everyday kitchens.
          </p>
          <p className="approach-section__body approach-section__body--small">
            As our collection grows, this space will grow with it.
          </p>
          <Link href="/shop" className="editorial-button editorial-button--light">
            Discover the collection <ArrowUpRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
      </section>

      {/* Closing Note Section */}
      <section className="closing-note">
        <p className="eyebrow">A note from Seethapaati</p>
        <p className="closing-note__title">
          Here’s to the little<br />
          <em>things we share.</em>
        </p>
        <Link href="/shop" className="editorial-text-link">
          Find your favourites <ArrowUpRight size={15} strokeWidth={1.5} />
        </Link>
      </section>
    </div>
  );
}
