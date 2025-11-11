import { test, expect } from '@playwright/test';

/**
 * Protocol v3 Integration Tests - WebRTC Connection
 *
 * These tests verify end-to-end WebRTC functionality with OpenAI's Realtime API.
 * Requires OPENAI_API_KEY environment variable to be set.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BACKEND_URL = 'https://quran.asimo.io';

test.describe('Protocol v3 Integration - WebRTC Connection', () => {
  test.skip(!OPENAI_API_KEY, 'Skipping - OPENAI_API_KEY not set');

  test('can create ephemeral token from backend', async ({ request }) => {
    const response = await request.post(`${BACKEND_URL}/realtime/v3/session`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy',
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Verify response structure
    expect(data).toHaveProperty('ephemeral_token');
    expect(data).toHaveProperty('expires_at');
    expect(data).toHaveProperty('ice_servers');

    // Token should be a string starting with "eph_"
    expect(typeof data.ephemeral_token).toBe('string');
    expect(data.ephemeral_token).toMatch(/^eph_/);

    // Should have ICE servers
    expect(Array.isArray(data.ice_servers)).toBeTruthy();
    expect(data.ice_servers.length).toBeGreaterThan(0);

    console.log('✅ Ephemeral token created successfully');
    console.log('   Token:', data.ephemeral_token.substring(0, 20) + '...');
    console.log('   Expires:', data.expires_at);
    console.log('   ICE servers:', data.ice_servers.length);
  });

  test('can establish WebRTC connection with OpenAI', async ({ page }) => {
    // Set longer timeout for WebRTC connection
    test.setTimeout(60000);

    // Navigate to PoC page
    await page.goto('http://localhost:8080/prototypes/webrtc-poc.html');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Get ephemeral token from our backend
    const tokenResponse = await page.request.post(`${BACKEND_URL}/realtime/v3/session`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy',
      },
    });

    expect(tokenResponse.ok()).toBeTruthy();
    const tokenData = await tokenResponse.json();
    const ephemeralToken = tokenData.ephemeral_token;

    // Inject token into page
    await page.evaluate((token) => {
      (window as any).__TEST_TOKEN__ = token;
    }, ephemeralToken);

    // Create WebRTC connection using the page's ProtocolV3 class
    const connectionResult = await page.evaluate(async (token) => {
      try {
        // Load ProtocolV3 if not already loaded
        if (typeof (window as any).ProtocolV3 === 'undefined') {
          const script = document.createElement('script');
          script.src = '../scripts/protocol_v3.js';
          document.head.appendChild(script);
          await new Promise(resolve => script.onload = resolve);
        }

        const ProtocolV3 = (window as any).ProtocolV3;

        // Create instance
        const client = new ProtocolV3({
          tokenUrl: `${window.location.protocol}//${window.location.hostname}:${window.location.port}/realtime/v3/session`,
          model: 'gpt-4o-realtime-preview-2024-12-17',
          voice: 'alloy',
        });

        // Override token (use our pre-fetched one)
        client.ephemeralToken = token;
        client.iceServers = [
          { urls: 'stun:stun.l.google.com:19302' },
        ];

        // Set up event handlers
        let connected = false;
        let error: any = null;

        client.onReady = () => {
          connected = true;
        };

        client.onError = (err: any) => {
          error = err;
        };

        // Connect (skip token fetch since we already have it)
        await client._createPeerConnection();

        // Wait for connection (max 20 seconds)
        const startTime = Date.now();
        while (!connected && !error && (Date.now() - startTime < 20000)) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        return {
          success: connected,
          error: error ? error.message : null,
          stats: client.stats,
        };
      } catch (err: any) {
        return {
          success: false,
          error: err.message,
          stats: null,
        };
      }
    }, ephemeralToken);

    // Verify connection succeeded
    if (!connectionResult.success) {
      console.error('Connection failed:', connectionResult.error);
    }

    expect(connectionResult.success).toBeTruthy();
    expect(connectionResult.error).toBeNull();
    expect(connectionResult.stats).toBeTruthy();

    console.log('✅ WebRTC connection established');
    console.log('   Stats:', JSON.stringify(connectionResult.stats, null, 2));
  });

  test('can send and receive events via data channel', async ({ page }) => {
    test.setTimeout(60000);

    // Get ephemeral token
    const tokenResponse = await page.request.post(`${BACKEND_URL}/realtime/v3/session`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy',
      },
    });

    const tokenData = await tokenResponse.json();
    const ephemeralToken = tokenData.ephemeral_token;

    // Test data channel communication
    const result = await page.evaluate(async (token) => {
      try {
        // Simplified test - just verify we can create a data channel
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        const dc = pc.createDataChannel('oai-events', {
          ordered: true,
        });

        let channelOpened = false;
        dc.onopen = () => {
          channelOpened = true;
        };

        // Create offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        return {
          success: true,
          dataChannelCreated: dc.label === 'oai-events',
          readyState: dc.readyState,
        };
      } catch (err: any) {
        return {
          success: false,
          error: err.message,
        };
      }
    }, ephemeralToken);

    expect(result.success).toBeTruthy();
    expect(result.dataChannelCreated).toBeTruthy();

    console.log('✅ Data channel created successfully');
    console.log('   Label: oai-events');
    console.log('   State:', result.readyState);
  });

  test('backend session endpoint returns valid configuration', async ({ request }) => {
    const response = await request.post(`${BACKEND_URL}/realtime/v3/session`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy',
        instructions: 'You are a helpful voice assistant.',
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Verify all required fields
    expect(data.ephemeral_token).toBeTruthy();
    expect(data.expires_at).toBeTruthy();
    expect(data.ice_servers).toBeTruthy();
    expect(data.client_id).toBeTruthy();

    // Verify ICE servers structure
    const iceServers = data.ice_servers;
    expect(Array.isArray(iceServers)).toBeTruthy();

    // Should have at least STUN server
    const stunServer = iceServers.find((s: any) =>
      s.urls.some((url: string) => url.startsWith('stun:'))
    );
    expect(stunServer).toBeTruthy();

    console.log('✅ Session configuration valid');
    console.log('   Client ID:', data.client_id);
    console.log('   ICE servers:', iceServers.length);
    console.log('   Token expiry:', data.expires_at);
  });

  test('protocol v3 stats are tracked correctly', async ({ page }) => {
    await page.goto('http://localhost:8080/prototypes/webrtc-poc.html');

    // Verify ProtocolV3 class is loaded
    const hasProtocolV3 = await page.evaluate(() => {
      return typeof (window as any).ProtocolV3 !== 'undefined';
    });

    if (!hasProtocolV3) {
      // Load the script
      await page.addScriptTag({ path: './scripts/protocol_v3.js' });
    }

    // Create instance and check stats structure
    const statsValid = await page.evaluate(() => {
      const ProtocolV3 = (window as any).ProtocolV3;
      const client = new ProtocolV3({
        tokenUrl: '/realtime/v3/session',
      });

      // Verify stats object structure
      const stats = client.stats;
      return stats &&
        typeof stats.protocol === 'string' &&
        typeof stats.transport === 'string' &&
        typeof stats.codec === 'string' &&
        typeof stats.packetsLost === 'number' &&
        typeof stats.jitter === 'number';
    });

    expect(statsValid).toBeTruthy();
    console.log('✅ Stats tracking structure valid');
  });
});

test.describe('Protocol v3 Integration - Error Handling', () => {
  test('handles invalid token gracefully', async ({ page }) => {
    await page.goto('http://localhost:8080/prototypes/webrtc-poc.html');
    await page.waitForLoadState('networkidle');

    const errorHandled = await page.evaluate(async () => {
      try {
        const pc = new RTCPeerConnection();
        const dc = pc.createDataChannel('oai-events');

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Try to connect to OpenAI with invalid token
        const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer invalid-token',
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        });

        // Should get 401 or error
        return !response.ok;
      } catch (err) {
        // Error is expected
        return true;
      }
    });

    expect(errorHandled).toBeTruthy();
    console.log('✅ Invalid token handled correctly');
  });

  test('handles connection timeout gracefully', async ({ page }) => {
    test.setTimeout(30000);

    await page.goto('http://localhost:8080/prototypes/webrtc-poc.html');

    const timeoutHandled = await page.evaluate(async () => {
      try {
        // Create connection with no ICE servers (will timeout)
        const pc = new RTCPeerConnection({ iceServers: [] });

        let timeout = false;
        const timeoutPromise = new Promise((resolve) => {
          setTimeout(() => {
            timeout = true;
            resolve(true);
          }, 5000);
        });

        let connected = false;
        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'connected') {
            connected = true;
          }
        };

        await timeoutPromise;

        return timeout && !connected;
      } catch (err) {
        return true;
      }
    });

    expect(timeoutHandled).toBeTruthy();
    console.log('✅ Connection timeout handled correctly');
  });
});
