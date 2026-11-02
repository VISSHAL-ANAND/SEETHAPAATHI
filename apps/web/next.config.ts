import type { NextConfig } from 'next';

function validatePublicBusinessConfiguration() {
  if (process.env.NODE_ENV !== 'production' || process.env.CI === 'true') return;

  const required = [
    'NEXT_PUBLIC_LEGAL_ENTITY_NAME',
    'NEXT_PUBLIC_FSSAI_LICENSE_NUMBER',
    'NEXT_PUBLIC_REGISTERED_OFFICE',
    'NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME',
    'NEXT_PUBLIC_GRIEVANCE_EMAIL',
    'NEXT_PUBLIC_PRIVACY_EMAIL',
    'NEXT_PUBLIC_LEGAL_EMAIL',
    'NEXT_PUBLIC_SUPPORT_EMAIL',
    'NEXT_PUBLIC_SUPPORT_PHONE_DISPLAY',
    'NEXT_PUBLIC_SUPPORT_PHONE_E164',
    'NEXT_PUBLIC_WHATSAPP_PHONE',
  ] as const;

  const placeholder = /replace[_\s-]?with|placeholder|example\.(?:com|net|org|test|invalid)|demo[ _-]/i;
  const missing = required.filter((key) => {
    const value = process.env[key]?.trim();
    return !value || placeholder.test(value);
  });
  if (missing.length) {
    throw new Error(`Production business disclosures are incomplete or still contain template values: ${missing.join(', ')}`);
  }

  const emailKeys = [
    'NEXT_PUBLIC_GRIEVANCE_EMAIL',
    'NEXT_PUBLIC_PRIVACY_EMAIL',
    'NEXT_PUBLIC_LEGAL_EMAIL',
    'NEXT_PUBLIC_SUPPORT_EMAIL',
  ] as const;
  for (const key of emailKeys) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env[key] || '')) {
      throw new Error(`${key} must be a valid public business contact email address.`);
    }
  }

  if (!/^\d{14}$/.test(process.env.NEXT_PUBLIC_FSSAI_LICENSE_NUMBER || '')) {
    throw new Error('NEXT_PUBLIC_FSSAI_LICENSE_NUMBER must contain the verified 14-digit FSSAI licence/registration number.');
  }
  if (!/^\+91[6-9]\d{9}$/.test(process.env.NEXT_PUBLIC_SUPPORT_PHONE_E164 || '')) {
    throw new Error('NEXT_PUBLIC_SUPPORT_PHONE_E164 must be the verified Indian support phone in +91XXXXXXXXXX format.');
  }
  if (!/^91[6-9]\d{9}$/.test((process.env.NEXT_PUBLIC_WHATSAPP_PHONE || '').replace(/\D/g, ''))) {
    throw new Error('NEXT_PUBLIC_WHATSAPP_PHONE must be the verified WhatsApp number in 91XXXXXXXXXX format.');
  }

  const registrationLabel = process.env.NEXT_PUBLIC_BUSINESS_REGISTRATION_LABEL?.trim();
  const registrationNumber = process.env.NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER?.trim();
  if (Boolean(registrationLabel) !== Boolean(registrationNumber)) {
    throw new Error('Set both NEXT_PUBLIC_BUSINESS_REGISTRATION_LABEL and NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER, or leave both empty when not applicable.');
  }
  if (registrationNumber && placeholder.test(registrationNumber)) {
    throw new Error('The public business registration number still contains a template value.');
  }
}

function getApiRewriteDestination(): string | null {
  const configured = (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Set INTERNAL_API_URL or NEXT_PUBLIC_API_URL so browser /api/v1 requests can reach the API.');
    }
    return null;
  }

  let apiUrl: URL;
  try {
    apiUrl = new URL(configured);
  } catch {
    throw new Error('INTERNAL_API_URL or NEXT_PUBLIC_API_URL must be a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash) {
    throw new Error('The configured API URL must use HTTP(S) and must not contain credentials, query parameters, or a fragment.');
  }

  let apiPath = apiUrl.pathname.replace(/\/+$/, '');
  if (!apiPath.endsWith('/api/v1')) {
    apiPath = `${apiPath}/api/v1`;
  }

  return `${apiUrl.origin}${apiPath}/:path*`;
}

validatePublicBusinessConfiguration();

const nextConfig: NextConfig = {
  async rewrites() {
    const destination = getApiRewriteDestination();
    if (!destination) return [];

    return [
      {
        source: '/api/v1/:path*',
        destination,
      },
    ];
  },
};

export default nextConfig;
