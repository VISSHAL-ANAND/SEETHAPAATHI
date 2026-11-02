import { EnvSchema } from './env.schema';

const validProductionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:strong-password@db.acmefoods.in:5432/store?schema=public',
  REDIS_URL: 'rediss://cache-user:strong-password@cache.acmefoods.in:6380',
  JWT_SECRET: 'a'.repeat(48),
  CORS_ORIGIN: 'https://shop.acmefoods.in',
  RAZORPAY_KEY_ID: 'rzp_live_1234567890',
  RAZORPAY_KEY_SECRET: 'razorpay_secret_1234567890',
  RAZORPAY_WEBHOOK_SECRET: 'razorpay_webhook_secret_1234567890',
  RESEND_API_KEY: 're_prod_1234567890ABCDEFG',
  EMAIL_FROM: 'orders@acmefoods.in',
  SELLER_LEGAL_NAME: 'Acme Foods Private Limited',
  SELLER_TRADE_NAME: 'Acme Foods',
  SELLER_GSTIN: '33ABCDE1234F1Z5',
  SELLER_ADDRESS_LINE1: '1 Market Road',
  SELLER_CITY: 'Chennai',
  SELLER_STATE: 'Tamil Nadu',
  SELLER_STATE_CODE: '33',
  SELLER_PINCODE: '600001',
};

describe('EnvSchema production validation', () => {
  it('accepts fully specified non-placeholder production configuration', () => {
    const result = EnvSchema.safeParse(validProductionEnvironment);
    if (!result.success) console.error(result.error.format());
    expect(result.success).toBe(true);
  });

  it.each([
    ['SELLER_LEGAL_NAME', 'REPLACE_WITH_ACTUAL_LEGAL_NAME'],
    ['SELLER_TRADE_NAME', 'YOUR_TRADE_NAME'],
    ['SELLER_ADDRESS_LINE1', 'REPLACE_WITH_REGISTERED_ADDRESS'],
    ['SELLER_CITY', 'EXAMPLE_CITY'],
    ['SELLER_STATE', 'REPLACE_WITH_STATE'],
    ['SELLER_STATE_CODE', '00'],
    ['SELLER_PINCODE', '000000'],
  ])('rejects placeholder value for %s', (field, value) => {
    const result = EnvSchema.safeParse({
      ...validProductionEnvironment,
      [field]: value,
    });
    expect(result.success).toBe(false);
  });

  it('rejects example sender addresses in production', () => {
    const result = EnvSchema.safeParse({
      ...validProductionEnvironment,
      EMAIL_FROM: 'orders@example.test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects production Redis configuration without a configured Redis provider', () => {
    const result = EnvSchema.safeParse({
      ...validProductionEnvironment,
      REDIS_URL: undefined,
      REDIS_HOST: undefined,
      REDIS_PASSWORD: undefined,
    });
    expect(result.success).toBe(false);
  });
});
