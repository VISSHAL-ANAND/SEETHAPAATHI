import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root and health checks', () => {
    it('GET / should return status ok with ISO timestamp', () => {
      const response = appController.getRoot();
      expect(response.status).toBe('ok');
      expect(response.timestamp).toBeDefined();
      expect(new Date(response.timestamp).getTime()).not.toBeNaN();
    });

    it('GET /health should return status ok with ISO timestamp', () => {
      const response = appController.getHealth();
      expect(response.status).toBe('ok');
      expect(response.timestamp).toBeDefined();
      expect(new Date(response.timestamp).getTime()).not.toBeNaN();
    });

    it('GET /api/health should return status ok with ISO timestamp', () => {
      const response = appController.getApiHealth();
      expect(response.status).toBe('ok');
      expect(response.timestamp).toBeDefined();
      expect(new Date(response.timestamp).getTime()).not.toBeNaN();
    });
  });
});
