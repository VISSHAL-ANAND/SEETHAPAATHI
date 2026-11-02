/**
 * Public business disclosures used by storefront pages.
 *
 * Production builds require the corresponding NEXT_PUBLIC_* variables in
 * next.config.ts. Development fallbacks are intentionally non-statutory.
 */
export const BUSINESS_INFO = {
  legalEntityName: process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME || 'Business legal name pending configuration',
  registrationLabel: process.env.NEXT_PUBLIC_BUSINESS_REGISTRATION_LABEL || '',
  registrationNumber: process.env.NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER || '',
  fssaiLicenseNumber: process.env.NEXT_PUBLIC_FSSAI_LICENSE_NUMBER || 'FSSAI licence number pending configuration',
  registeredOffice: process.env.NEXT_PUBLIC_REGISTERED_OFFICE || 'Registered office address pending configuration',
  grievanceOfficerName: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME || 'Designated Grievance Officer',
  grievanceEmail: process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || 'grievance@example.invalid',
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || 'privacy@example.invalid',
  legalEmail: process.env.NEXT_PUBLIC_LEGAL_EMAIL || 'legal@example.invalid',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'care@example.invalid',
  supportPhoneDisplay: process.env.NEXT_PUBLIC_SUPPORT_PHONE_DISPLAY || 'Support phone pending configuration',
  supportPhoneE164: process.env.NEXT_PUBLIC_SUPPORT_PHONE_E164 || '',
  whatsappPhone: (process.env.NEXT_PUBLIC_WHATSAPP_PHONE || '').replace(/\D/g, ''),
} as const;
