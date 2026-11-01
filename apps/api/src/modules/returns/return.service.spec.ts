import { BadRequestException } from '@nestjs/common';
import { ReturnReason } from '@prisma/client';
import { ReturnService } from './return.service';

describe('ReturnService return quantity accounting', () => {
  it('does not allow a completed return quantity to be returned again', async () => {
    const tx: any = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          userId: 'user-1',
          status: 'DELIVERED',
          items: [{ id: 'order-item-1', quantity: 2 }],
        }),
      },
      return: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $queryRaw: jest.fn((strings: TemplateStringsArray) => {
        const query = strings.join('');
        if (query.includes('SELECT id, quantity FROM order_items')) {
          return [{ id: 'order-item-1', quantity: 2 }];
        }
        if (query.includes('SELECT oi.quantity AS purchased')) {
          // The two purchased units have already been returned in a completed
          // return. Completed returns must remain part of this total.
          return [{ purchased: 2, returned: 2 }];
        }
        throw new Error('Unexpected SQL in return quantity test: ' + query);
      }),
    };
    const prisma: any = {
      $transaction: jest.fn((callback: (transaction: any) => unknown) => callback(tx)),
    };
    const service = new ReturnService(prisma, {} as any);

    await expect(
      service.request(
        'order-1',
        'user-1',
        ReturnReason.DAMAGED,
        [{ orderItemId: 'order-item-1', quantity: 1 }],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.return.create).toBeUndefined();
  });
});
