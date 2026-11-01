import { BadRequestException } from '@nestjs/common';
import { ShippingService } from './shipping.service';

describe('ShippingService.checkServiceability', () => {
  const service = new ShippingService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('rejects malformed PIN codes', async () => {
    await expect(service.checkServiceability('12345')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.checkServiceability('000000')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.checkServiceability('ABCDEF')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does not treat a syntactically valid PIN as verified serviceability', async () => {
    await expect(service.checkServiceability('600004')).resolves.toEqual({
      serviceable: false,
      verified: false,
      carrier: 'India Post Speed Post',
      estimatedDays: 'Unverified',
      pincode: '600004',
      message: 'Delivery serviceability is not currently verified for this PIN code.',
    });
  });

  it('normalizes whitespace before validating and returning the PIN', async () => {
    await expect(service.checkServiceability(' 600004 ')).resolves.toMatchObject({
      serviceable: false,
      verified: false,
      pincode: '600004',
    });
  });
});
