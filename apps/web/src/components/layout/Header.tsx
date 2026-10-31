'use client';

export { SiteHeader as Header } from '../storefront/SiteHeader';
export default function LayoutHeader() {
  const { SiteHeader } = require('../storefront/SiteHeader');
  return <SiteHeader />;
}
