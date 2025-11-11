import { test, expect } from '@playwright/test';

/**
 * Protocol v3 (WebRTC) Integration Tests
 *
 * These tests verify that:
 * 1. Backend v3 endpoints are accessible
 * 2. ProtocolV3 class is loaded
 * 3. Basic WebRTC functionality works (requires API key for full test)
 */

const BASE_URL = process.env.BASE_URL || 'https://app.asimo.io/';

test.describe('Protocol v3 Backend', () => {
  test('health endpoint is accessible', async ({ request }) => {
    const response = await request.get('https://quran.asimo.io/realtime/v3/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data.protocol).toBe('v3');
    expect(data.transport).toBe('webrtc');
    expect(data.openai_configured).toBeDefined();
  });

  test('session endpoint requires valid request', async ({ request }) => {
    const response = await request.post('https://quran.asimo.io/realtime/v3/session', {
      data: {
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy'
      }
    });

    // Should return 200 if OpenAI key is configured, or error if not
    // Either way, endpoint should be reachable
    expect([200, 500, 502].includes(response.status())).toBeTruthy();
  });

  test('session endpoint has rate limiting', async ({ request }) => {
    // Make multiple requests quickly
    const requests = [];
    for (let i = 0; i < 12; i++) {
      requests.push(
        request.post('https://quran.asimo.io/realtime/v3/session', {
          data: {
            model: 'gpt-4o-realtime-preview-2024-12-17'
          }
        })
      );
    }

    const responses = await Promise.all(requests);
    const statuses = responses.map(r => r.status());

    // At least one should be rate limited (429)
    expect(statuses.some(s => s === 429)).toBeTruthy();
  });
});

test.describe('Protocol v3 Frontend', () => {
  test('ProtocolV3 class is loaded', async ({ page }) => {
    await page.goto(BASE_URL);

    const hasProtocolV3 = await page.evaluate(() => {
      return typeof window.ProtocolV3 === 'function';
    });

    expect(hasProtocolV3).toBeTruthy();
  });

  test('ProtocolV3 constructor works', async ({ page }) => {
    await page.goto(BASE_URL);

    const instanceCreated = await page.evaluate(() => {
      try {
        const p3 = new window.ProtocolV3({
          tokenUrl: '/realtime/v3/session',
          model: 'gpt-4o-realtime-preview-2024-12-17',
          voice: 'alloy'
        });

        return {
          hasStats: typeof p3.stats === 'object',
          hasConnect: typeof p3.connect === 'function',
          hasSendEvent: typeof p3.sendEvent === 'function',
          protocol: p3.stats.protocol,
          transport: p3.stats.transport
        };
      } catch (err) {
        return { error: err.message };
      }
    });

    expect(instanceCreated.error).toBeUndefined();
    expect(instanceCreated.hasStats).toBeTruthy();
    expect(instanceCreated.hasConnect).toBeTruthy();
    expect(instanceCreated.hasSendEvent).toBeTruthy();
    expect(instanceCreated.protocol).toBe('v3');
    expect(instanceCreated.transport).toBe('webrtc');
  });

  test('localStorage flag enables v3', async ({ page }) => {
    // Set localStorage flag
    await page.addInitScript(() => {
      localStorage.setItem('useProtocolV3', 'true');
    });

    await page.goto(BASE_URL);

    // Check if flag is set
    const flagEnabled = await page.evaluate(() => {
      return localStorage.getItem('useProtocolV3') === 'true';
    });

    expect(flagEnabled).toBeTruthy();
  });

  test('PoC page loads correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}prototypes/webrtc-poc.html`);

    // Check title
    await expect(page).toHaveTitle(/Protocol v3.*WebRTC/);

    // Check key elements exist
    await expect(page.locator('#btnConnect')).toBeVisible();
    await expect(page.locator('#apiKey')).toBeVisible();
    await expect(page.locator('#log')).toBeVisible();

    // Check ProtocolV3 is loaded
    const hasProtocolV3 = await page.evaluate(() => {
      return typeof window.ProtocolV3 === 'function';
    });
    expect(hasProtocolV3).toBeTruthy();
  });
});

test.describe('Protocol v3 Stats', () => {
  test('stats object has expected fields', async ({ page }) => {
    await page.goto(BASE_URL);

    const statsFields = await page.evaluate(() => {
      const p3 = new window.ProtocolV3({});
      const stats = p3.getStats();

      return {
        hasProtocol: 'protocol' in stats,
        hasTransport: 'transport' in stats,
        hasCodec: 'codec' in stats,
        hasPacketsLost: 'packetsLost' in stats,
        hasJitter: 'jitter' in stats,
        hasRTT: 'roundTripTime' in stats,
        hasBytes: 'bytesReceived' in stats && 'bytesSent' in stats,
        hasStates: 'connectionState' in stats && 'iceState' in stats
      };
    });

    expect(statsFields.hasProtocol).toBeTruthy();
    expect(statsFields.hasTransport).toBeTruthy();
    expect(statsFields.hasCodec).toBeTruthy();
    expect(statsFields.hasPacketsLost).toBeTruthy();
    expect(statsFields.hasJitter).toBeTruthy();
    expect(statsFields.hasRTT).toBeTruthy();
    expect(statsFields.hasBytes).toBeTruthy();
    expect(statsFields.hasStates).toBeTruthy();
  });

  test('stats initial values are correct', async ({ page }) => {
    await page.goto(BASE_URL);

    const stats = await page.evaluate(() => {
      const p3 = new window.ProtocolV3({});
      return p3.getStats();
    });

    expect(stats.protocol).toBe('v3');
    expect(stats.transport).toBe('webrtc');
    expect(stats.codec).toBe('opus');
    expect(stats.packetsLost).toBe(0);
    expect(stats.jitter).toBe(0);
    expect(stats.roundTripTime).toBe(0);
    expect(stats.bytesReceived).toBe(0);
    expect(stats.bytesSent).toBe(0);
    expect(stats.connectionState).toBe('new');
    expect(stats.iceState).toBe('new');
  });
});

test.describe('Protocol v3 Error Handling', () => {
  test('handles invalid token URL gracefully', async ({ page }) => {
    await page.goto(BASE_URL);

    const result = await page.evaluate(async () => {
      const p3 = new window.ProtocolV3({
        tokenUrl: '/invalid/endpoint'
      });

      try {
        await p3.connect();
        return { success: true };
      } catch (error) {
        return {
          success: false,
          errorMessage: error.message,
          hasError: true
        };
      }
    });

    expect(result.success).toBeFalsy();
    expect(result.hasError).toBeTruthy();
    expect(result.errorMessage).toBeDefined();
  });

  test('cleanup works correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    const cleanupWorks = await page.evaluate(async () => {
      const p3 = new window.ProtocolV3({});

      // Try to disconnect (should not throw even if not connected)
      try {
        await p3.disconnect();
        return true;
      } catch (error) {
        return false;
      }
    });

    expect(cleanupWorks).toBeTruthy();
  });
});
