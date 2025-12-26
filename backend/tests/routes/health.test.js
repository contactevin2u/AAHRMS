/**
 * Health Check Endpoint Tests
 *
 * Tests for the /api/health endpoint.
 */

const request = require('supertest');
const app = require('../app');

describe('Health Check Endpoint', () => {
  describe('GET /api/health', () => {
    it('should return 200 with status ok', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });
  });
});

describe('404 Handler', () => {
  it('should return 404 for undefined routes', async () => {
    const response = await request(app)
      .get('/api/nonexistent-route')
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('should include route in error message', async () => {
    const response = await request(app)
      .get('/api/some/random/path')
      .expect(404);

    expect(response.body.error.message).toContain('/api/some/random/path');
  });
});

describe('Error Handler', () => {
  it('should handle malformed JSON', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }')
      .expect(400);

    expect(response.body.success).toBe(false);
  });
});
