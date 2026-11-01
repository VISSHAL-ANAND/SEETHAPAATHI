import { z } from 'zod';

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const GSTIN_PLACEHOLDER = '33AAAAA0000A1Z5'; // PLACEHOLDER ONLY — MUST NOT BE USED IN PRODUCTION
export const SELLER_CONFIG_PLACEHOLDERS = {
  legalName: 'Seethapaati Foods Private Limited',
  tradeName: 'Seethapaati',
  addressLine1: '42, Heritage Kitchen Road, Mylapore',
  city: 'Chennai',
  state: 'Tamil Nadu',
  stateCode: '33',
  pincode: '600004',
} as const;

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/seethapaati_dev?schema=public'),
    REDIS_URL: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() !== '' ? val.trim() : undefined),
      z.string().optional(),
    ),
    REDIS_HOST: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() !== '' ? val.trim() : undefined),
      z.string().optional(),
    ),
    REDIS_PORT: z.preprocess(
      (val) => (val !== undefined && val !== '' ? Number(val) : undefined),
      z.coerce.number().optional(),
    ),
    REDIS_PASSWORD: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() !== '' ? val.trim() : undefined),
      z.string().optional(),
    ),
    JWT_SECRET: z.string().min(16).default('development_jwt_secret_must_be_changed_in_prod'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
    RAZORPAY_KEY_ID: z.string().default('rzp_test_placeholder'),
    RAZORPAY_KEY_SECRET: z.string().default('rzp_secret_placeholder'),
    RAZORPAY_WEBHOOK_SECRET: z.string().default('rzp_webhook_placeholder'),
    RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(15),

    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().default('onboarding@resend.dev'),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),

    // Statutory Seller Configuration for Invoicing & GST
    SELLER_LEGAL_NAME: z.string().min(1).default('Seethapaati Foods Private Limited'),
    SELLER_TRADE_NAME: z.string().min(1).default('Seethapaati'),
    // 33AAAAA0000A1Z5 IS PLACEHOLDER ONLY — MUST NOT BE USED IN PRODUCTION
    SELLER_GSTIN: z.string().default(GSTIN_PLACEHOLDER),
    SELLER_ADDRESS_LINE1: z.string().min(1).default('42, Heritage Kitchen Road, Mylapore'),
    SELLER_ADDRESS_LINE2: z.string().optional(),
    SELLER_CITY: z.string().min(1).default('Chennai'),
    SELLER_STATE: z.string().min(1).default('Tamil Nadu'),
    SELLER_STATE_CODE: z.string().regex(/^\d{2}$/, 'State code must be 2 digits').default('33'),
    SELLER_PINCODE: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits').default('600004'),
  })
  .transform((data) => {
    // If REDIS_URL is provided, automatically extract host, port, and password
    if (data.REDIS_URL) {
      try {
        const parsed = new URL(data.REDIS_URL);
        if (!data.REDIS_HOST) {
          data.REDIS_HOST = parsed.hostname;
        }
        if (!data.REDIS_PORT) {
          data.REDIS_PORT = parsed.port ? parseInt(parsed.port, 10) : 6379;
        }
        if (!data.REDIS_PASSWORD && parsed.password) {
          data.REDIS_PASSWORD = decodeURIComponent(parsed.password);
        }
      } catch {
        // Fallback for non-standard Redis URLs
      }
    }
    // If REDIS_URL is not provided and host/port are not explicit, apply local development defaults
    if (!data.REDIS_HOST) {
      data.REDIS_HOST = 'localhost';
    }
    if (!data.REDIS_PORT) {
      data.REDIS_PORT = 6379;
    }
    return data as typeof data & { REDIS_HOST: string; REDIS_PORT: number };
  })
  .superRefine((data, ctx) => {
    if ((data.NODE_ENV === 'production' || data.NODE_ENV === 'staging') && !data.RESEND_API_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['RESEND_API_KEY'], message: 'RESEND_API_KEY is required in production/staging' });
    }
    if (data.NODE_ENV === 'production' || data.NODE_ENV === 'staging') {
      if (data.CORS_ORIGIN.split(',').some((origin) => origin.trim() === '*')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['CORS_ORIGIN'], message: 'Wildcard CORS is not allowed in production/staging' });
      }
    }
    if (data.NODE_ENV === 'production') {
      if (
        data.JWT_SECRET === 'development_jwt_secret_must_be_changed_in_prod' ||
        data.JWT_SECRET.length < 32 ||
        /replace_with|placeholder|x{8,}/i.test(data.JWT_SECRET)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message:
            'In production, JWT_SECRET must be at least 32 characters and cannot use default development secret',
        });
      }

      // Production seller identity/address configuration must be explicitly supplied.
      const sellerPlaceholdersUsed =
        data.SELLER_LEGAL_NAME === SELLER_CONFIG_PLACEHOLDERS.legalName ||
        data.SELLER_TRADE_NAME === SELLER_CONFIG_PLACEHOLDERS.tradeName ||
        data.SELLER_ADDRESS_LINE1 === SELLER_CONFIG_PLACEHOLDERS.addressLine1 ||
        data.SELLER_CITY === SELLER_CONFIG_PLACEHOLDERS.city ||
        data.SELLER_STATE === SELLER_CONFIG_PLACEHOLDERS.state ||
        data.SELLER_STATE_CODE === SELLER_CONFIG_PLACEHOLDERS.stateCode ||
        data.SELLER_PINCODE === SELLER_CONFIG_PLACEHOLDERS.pincode;
      if (sellerPlaceholdersUsed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SELLER_LEGAL_NAME'],
          message: 'Production seller legal/trade name, address, state code and pincode must be explicitly configured; development placeholders are not allowed.',
        });
      }

      const credentialPlaceholders = /placeholder|replace_with|your_|url_encoded|set_me|change_me|x{8,}/i;
      if (
        !data.RAZORPAY_KEY_ID.startsWith('rzp_live_') ||
        credentialPlaceholders.test(data.RAZORPAY_KEY_ID) ||
        credentialPlaceholders.test(data.RAZORPAY_KEY_SECRET) ||
        credentialPlaceholders.test(data.RAZORPAY_WEBHOOK_SECRET)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_KEY_ID'],
          message: 'Production Razorpay live credentials must be explicitly configured; placeholders and test keys are not allowed.',
        });
      }

      if (!data.RESEND_API_KEY || credentialPlaceholders.test(data.RESEND_API_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RESEND_API_KEY'],
          message: 'A real production Resend API key is required; placeholders are not allowed.',
        });
      }

      if (data.EMAIL_FROM === 'onboarding@resend.dev') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_FROM'],
          message: 'Configure a verified production sender address.',
        });
      }

      if (
        data.DATABASE_URL === 'postgresql://postgres:postgres@localhost:5432/seethapaati_dev?schema=public' ||
        credentialPlaceholders.test(data.DATABASE_URL)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'Configure a real production PostgreSQL connection string; placeholders are not allowed.',
        });
      }

      if (data.CORS_ORIGIN.split(',').some((origin) => /localhost|127\.0\.0\.1/i.test(origin.trim()))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGIN'],
          message: 'Localhost origins are not allowed in production CORS configuration.',
        });
      }

      // Production GSTIN Validation: Fail Closed
      if (data.SELLER_GSTIN === GSTIN_PLACEHOLDER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SELLER_GSTIN'],
          message:
            'In production, SELLER_GSTIN cannot use the placeholder 33AAAAA0000A1Z5 (PLACEHOLDER ONLY — MUST NOT BE USED IN PRODUCTION)',
        });
      } else if (!GSTIN_REGEX.test(data.SELLER_GSTIN)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SELLER_GSTIN'],
          message: 'In production, SELLER_GSTIN must be a valid 15-character statutory GSTIN format',
        });
      } else if (data.SELLER_GSTIN.substring(0, 2) !== data.SELLER_STATE_CODE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SELLER_STATE_CODE'],
          message: 'SELLER_STATE_CODE must match the first 2 digits of SELLER_GSTIN',
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = EnvSchema.safeParse(config);
  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:', JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Environment variable validation failed');
  }
  return parsed.data;
}
