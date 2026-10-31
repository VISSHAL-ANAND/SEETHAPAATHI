import { validateEnv, GSTIN_PLACEHOLDER } from '../src/config/env.schema';

describe('EnvSchema - Configuration Validation', () => {
  it('should accept valid development configuration with defaults', () => {
    const validDev = validateEnv({
      NODE_ENV: 'development',
    });

    expect(validDev.NODE_ENV).toBe('development');
    expect(validDev.PORT).toBe(4000);
    expect(validDev.JWT_SECRET).toBe('development_jwt_secret_must_be_changed_in_prod');
    expect(validDev.SELLER_GSTIN).toBe(GSTIN_PLACEHOLDER);
    expect(validDev.SELLER_STATE_CODE).toBe('33');
    expect(validDev.SELLER_LEGAL_NAME).toBe('Seethapaati Foods Private Limited');
  });

  it('should throw an error in production if JWT_SECRET uses the default dev secret', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'development_jwt_secret_must_be_changed_in_prod',
        SELLER_GSTIN: '33ABCDE1234F1Z5',
      }),
    ).toThrow('Environment variable validation failed');
  });

  it('should throw an error in production if SELLER_GSTIN uses the development placeholder', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a_very_secure_production_jwt_secret_at_least_32_characters_long',
        SELLER_GSTIN: GSTIN_PLACEHOLDER,
      }),
    ).toThrow('Environment variable validation failed');
  });

  it('should throw an error in production if SELLER_GSTIN has an invalid format', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a_very_secure_production_jwt_secret_at_least_32_characters_long',
        SELLER_GSTIN: 'INVALID_GSTIN_123',
      }),
    ).toThrow('Environment variable validation failed');
  });

  it('should throw an error in production if SELLER_STATE_CODE does not match GSTIN prefix', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a_very_secure_production_jwt_secret_at_least_32_characters_long',
        SELLER_GSTIN: '33ABCDE1234F1Z5',
        SELLER_STATE_CODE: '29', // Karnataka code with Tamil Nadu GSTIN
      }),
    ).toThrow('Environment variable validation failed');
  });

  it('should pass in production when a secure secret and valid statutory seller GSTIN are provided', () => {
    const validProd = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a_very_secure_production_jwt_secret_at_least_32_characters_long',
      SELLER_GSTIN: '33ABCDE1234F1Z5',
      SELLER_STATE_CODE: '33',
      SELLER_LEGAL_NAME: 'Example Seller Legal Entity',
      SELLER_ADDRESS_LINE1: '1 Test Street',
      SELLER_CITY: 'Coimbatore',
      SELLER_PINCODE: '641001',
      RESEND_API_KEY: 're_test_phase9_ci',
    });

    expect(validProd.NODE_ENV).toBe('production');
    expect(validProd.SELLER_GSTIN).toBe('33ABCDE1234F1Z5');
    expect(validProd.SELLER_STATE_CODE).toBe('33');
  });

  it('should correctly parse REDIS_URL and extract host, port, and password without defaulting to localhost:6379', () => {
    const parsed = validateEnv({
      NODE_ENV: 'development',
      REDIS_URL: 'rediss://default:upstash_token_123@mute-violet-12345.upstash.io:6380',
    });

    expect(parsed.REDIS_URL).toBe('rediss://default:upstash_token_123@mute-violet-12345.upstash.io:6380');
    expect(parsed.REDIS_HOST).toBe('mute-violet-12345.upstash.io');
    expect(parsed.REDIS_PORT).toBe(6380);
    expect(parsed.REDIS_PASSWORD).toBe('upstash_token_123');
    expect(parsed.REDIS_HOST).not.toBe('localhost');
  });

  it('should default REDIS_HOST to localhost and REDIS_PORT to 6379 when REDIS_URL is not set', () => {
    const parsed = validateEnv({
      NODE_ENV: 'development',
    });

    expect(parsed.REDIS_HOST).toBe('localhost');
    expect(parsed.REDIS_PORT).toBe(6379);
  });
});
