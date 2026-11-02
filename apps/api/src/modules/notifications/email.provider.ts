import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmailMessage { to: string; subject: string; html: string; idempotencyKey: string; }

const EMAIL_REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class EmailProvider {
  constructor(private readonly config: ConfigService) {}
  async send(message: EmailMessage): Promise<string> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM', 'Seethapaati <onboarding@resend.dev>');
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (!apiKey) {
      if (nodeEnv === 'production' || nodeEnv === 'staging') throw new ServiceUnavailableException({ error: 'EMAIL_PROVIDER_NOT_CONFIGURED' });
      return `dev-email:${message.idempotencyKey}`;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html }),
      signal: AbortSignal.timeout(EMAIL_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Provider response bodies can include recipient addresses or request
      // details. Keep them out of application logs and persisted outbox errors.
      throw new Error(`Resend email request failed with HTTP ${response.status}`);
    }
    const body = await response.json() as { id?: string };
    if (!body.id) throw new Error('Email provider returned no message id');
    return body.id;
  }
}
