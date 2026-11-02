import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { EmailProvider } from './email.provider';

describe('EmailProvider', () => {
  const message = {
    to: 'customer@example.com',
    subject: 'Order update',
    html: '<p>Order update</p>',
    idempotencyKey: 'notification:event-1',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('bounds provider requests with an AbortSignal timeout', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'RESEND_API_KEY') return 're_test_example';
        if (key === 'EMAIL_FROM') return 'orders@example.com';
        if (key === 'NODE_ENV') return 'test';
        return fallback;
      }),
    } as unknown as ConfigService;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email-1' }),
    } as Response);

    const provider = new EmailProvider(config);
    await expect(provider.send(message)).resolves.toBe('email-1');

    const requestOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
    expect(requestOptions.headers).toMatchObject({
      'Idempotency-Key': message.idempotencyKey,
    });
  });

  it('fails closed when email is not configured in production', async () => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'NODE_ENV') return 'production';
        return fallback;
      }),
    } as unknown as ConfigService;

    const provider = new EmailProvider(config);
    await expect(provider.send(message)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
