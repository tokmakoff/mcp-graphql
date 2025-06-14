/**
 * Test suite for HTTP Signature authentication functionality
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  generateHttpSignatureHeaders, 
  getHttpSignatureConfig, 
  generateHeaders,
  parseAndMergeHeaders
} from '../src/helpers/headers.js';

describe('HTTP Signature Authentication', () => {
  const mockConfig = {
    keyId: 'test-key-id',
    secret: 'dGVzdC1zZWNyZXQtYmFzZTY0', // 'test-secret-base64' in base64
    endpoint: 'https://api.example.com/graphql/v1',
    algorithm: 'hmac-sha256',
    headers: ['(request-target)', 'host', 'date', 'content-type']
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock Date to ensure consistent timestamps in tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateHttpSignatureHeaders', () => {
    test('should generate correct headers with HTTP Signature', () => {
      const headers = generateHttpSignatureHeaders(mockConfig);

      expect(headers).toHaveProperty('Authorization');
      expect(headers).toHaveProperty('Date');
      expect(headers).toHaveProperty('Content-Type', 'application/json');
      expect(headers).toHaveProperty('Host', 'api.example.com');

      expect(headers.Authorization).toContain('Signature keyId="test-key-id"');
      expect(headers.Authorization).toContain('algorithm="hmac-sha256"');
      expect(headers.Authorization).toContain('headers="(request-target) host date content-type"');
      expect(headers.Authorization).toMatch(/signature="[A-Za-z0-9+/=]+"/);
    });

    test('should use custom method and path', () => {
      const headers = generateHttpSignatureHeaders(mockConfig, 'PUT', '/custom/path');

      // Verify that headers are generated with custom method and path
      expect(headers).toHaveProperty('Authorization');
      expect(headers.Authorization).toContain('Signature keyId="test-key-id"');
    });

    test('should handle different algorithms', () => {
      const configWithAlgorithm = {
        ...mockConfig,
        algorithm: 'hmac-sha512'
      };

      const headers = generateHttpSignatureHeaders(configWithAlgorithm);
      expect(headers.Authorization).toContain('algorithm="hmac-sha512"');
    });

    test('should handle custom headers to sign', () => {
      const configWithCustomHeaders = {
        ...mockConfig,
        headers: ['(request-target)', 'host', 'date']
      };

      const headers = generateHttpSignatureHeaders(configWithCustomHeaders);
      expect(headers.Authorization).toContain('headers="(request-target) host date"');
    });
  });

  describe('getHttpSignatureConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should return config from generic environment variables', () => {
      process.env.HTTP_SIGNATURE_KEY_ID = 'generic-key';
      process.env.HTTP_SIGNATURE_SECRET = 'generic-secret';

      const config = getHttpSignatureConfig('https://api.example.com/graphql');

      expect(config).toEqual({
        keyId: 'generic-key',
        secret: 'generic-secret',
        endpoint: 'https://api.example.com/graphql',
        algorithm: 'hmac-sha256',
        headers: ['(request-target)', 'host', 'date', 'content-type']
      });
    });

    test('should fallback to Remote.it-specific environment variables', () => {
      process.env.R3_ACCESS_KEY_ID = 'remoteit-key';
      process.env.R3_SECRET_ACCESS_KEY = 'remoteit-secret';

      const config = getHttpSignatureConfig('https://api.remote.it/graphql/v1');

      expect(config).toEqual({
        keyId: 'remoteit-key',
        secret: 'remoteit-secret',
        endpoint: 'https://api.remote.it/graphql/v1',
        algorithm: 'hmac-sha256',
        headers: ['(request-target)', 'host', 'date', 'content-type']
      });
    });

    test('should prefer generic variables over Remote.it-specific', () => {
      process.env.HTTP_SIGNATURE_KEY_ID = 'generic-key';
      process.env.HTTP_SIGNATURE_SECRET = 'generic-secret';
      process.env.R3_ACCESS_KEY_ID = 'remoteit-key';
      process.env.R3_SECRET_ACCESS_KEY = 'remoteit-secret';

      const config = getHttpSignatureConfig('https://api.example.com/graphql');

      expect(config?.keyId).toBe('generic-key');
      expect(config?.secret).toBe('generic-secret');
    });

    test('should return null when no credentials available', () => {
      delete process.env.HTTP_SIGNATURE_KEY_ID;
      delete process.env.HTTP_SIGNATURE_SECRET;
      delete process.env.R3_ACCESS_KEY_ID;
      delete process.env.R3_SECRET_ACCESS_KEY;

      const config = getHttpSignatureConfig('https://api.example.com/graphql');

      expect(config).toBeNull();
    });
  });

  describe('parseAndMergeHeaders', () => {
    const baseHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'test-client'
    };

    test('should merge object headers', () => {
      const inputHeaders = {
        'Authorization': 'Bearer token',
        'X-Custom': 'value'
      };

      const result = parseAndMergeHeaders(baseHeaders, inputHeaders);

      expect(result).toEqual({
        'Content-Type': 'application/json',
        'User-Agent': 'test-client',
        'Authorization': 'Bearer token',
        'X-Custom': 'value'
      });
    });

    test('should parse JSON string headers', () => {
      const inputHeaders = '{"Authorization": "Bearer token", "X-Custom": "value"}';

      const result = parseAndMergeHeaders(baseHeaders, inputHeaders);

      expect(result).toEqual({
        'Content-Type': 'application/json',
        'User-Agent': 'test-client',
        'Authorization': 'Bearer token',
        'X-Custom': 'value'
      });
    });

    test('should handle undefined input headers', () => {
      const result = parseAndMergeHeaders(baseHeaders, undefined);

      expect(result).toEqual(baseHeaders);
    });

    test('should throw error for invalid JSON', () => {
      const invalidJson = '{"invalid": json}';

      expect(() => parseAndMergeHeaders(baseHeaders, invalidJson))
        .toThrow('Invalid headers JSON');
    });

    test('should allow input headers to override base headers', () => {
      const inputHeaders = {
        'Content-Type': 'application/xml'
      };

      const result = parseAndMergeHeaders(baseHeaders, inputHeaders);

      expect(result['Content-Type']).toBe('application/xml');
    });
  });

  describe('generateHeaders', () => {
    const originalEnv = process.env;
    const endpoint = 'https://api.remote.it/graphql/v1';
    const baseHeaders = { 'User-Agent': 'test-client' };

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should generate HTTP Signature headers when enabled', () => {
      process.env.HTTP_SIGNATURE_KEY_ID = 'test-key';
      process.env.HTTP_SIGNATURE_SECRET = 'test-secret';

      const headers = generateHeaders(endpoint, baseHeaders, undefined, true);

      expect(headers).toHaveProperty('Authorization');
      expect(headers).toHaveProperty('Date');
      expect(headers).toHaveProperty('Content-Type', 'application/json');
      expect(headers).toHaveProperty('Host', 'api.remote.it');
      expect(headers).toHaveProperty('User-Agent', 'test-client');
    });

    test('should return regular headers when HTTP Signature disabled', () => {
      const inputHeaders = { 'Authorization': 'Bearer token' };

      const headers = generateHeaders(endpoint, baseHeaders, inputHeaders, false);

      expect(headers).toEqual({
        'User-Agent': 'test-client',
        'Authorization': 'Bearer token'
      });
      expect(headers).not.toHaveProperty('Date');
      expect(headers).not.toHaveProperty('Host');
    });

    test('should merge additional headers with HTTP Signature headers', () => {
      process.env.HTTP_SIGNATURE_KEY_ID = 'test-key';
      process.env.HTTP_SIGNATURE_SECRET = 'test-secret';
      const inputHeaders = { 'X-Custom': 'value' };

      const headers = generateHeaders(endpoint, baseHeaders, inputHeaders, true);

      expect(headers).toHaveProperty('Authorization'); // From HTTP Signature
      expect(headers).toHaveProperty('X-Custom', 'value'); // From input
      expect(headers).toHaveProperty('User-Agent', 'test-client'); // From base
    });

    test('should handle missing credentials gracefully', () => {
      delete process.env.HTTP_SIGNATURE_KEY_ID;
      delete process.env.HTTP_SIGNATURE_SECRET;

      // Mock console.error to avoid noise in test output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const headers = generateHeaders(endpoint, baseHeaders, undefined, true);

      expect(consoleSpy).toHaveBeenCalledWith(
        'HTTP Signature authentication enabled but credentials not found in environment'
      );
      expect(headers).toEqual(baseHeaders);

      consoleSpy.mockRestore();
    });
  });

  describe('Real-world signature generation', () => {
    // Test with actual Remote.it-style credentials (using test values)
    test('should generate correct signature for Remote.it API', () => {
      // Use real crypto for this test
      vi.unmock('crypto');
      
      const realConfig = {
        keyId: 'TEST_KEY_ID',
        secret: 'VEVTVF9TRUNSRVRfS0VZ', // 'TEST_SECRET_KEY' in base64
        endpoint: 'https://api.remote.it/graphql/v1',
        algorithm: 'hmac-sha256',
        headers: ['(request-target)', 'host', 'date', 'content-type']
      };

      const headers = generateHttpSignatureHeaders(realConfig);

      // Verify structure
      expect(headers.Authorization).toMatch(/^Signature keyId="TEST_KEY_ID",algorithm="hmac-sha256",headers="\(request-target\) host date content-type",signature="[A-Za-z0-9+/=]+"$/);
      expect(headers.Date).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Host).toBe('api.remote.it');

      // Verify signature is deterministic for same timestamp
      const headers2 = generateHttpSignatureHeaders(realConfig);
      expect(headers.Authorization).toBe(headers2.Authorization);
    });
  });

  describe('Integration scenarios', () => {
    test('should work with Remote.it environment variables', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        R3_ACCESS_KEY_ID: 'REMOTE_IT_KEY',
        R3_SECRET_ACCESS_KEY: 'UkVNT1RFX0lUX1NFQ1JFVA==' // 'REMOTE_IT_SECRET' in base64
      };

      const headers = generateHeaders(
        'https://api.remote.it/graphql/v1',
        {},
        undefined,
        true
      );

      expect(headers).toHaveProperty('Authorization');
      expect(headers.Authorization).toContain('keyId="REMOTE_IT_KEY"');

      process.env = originalEnv;
    });

    test('should maintain backwards compatibility', () => {
      const headers = generateHeaders(
        'https://api.example.com/graphql',
        { 'Content-Type': 'application/json' },
        { 'Authorization': 'Bearer legacy-token' },
        false // HTTP Signature disabled
      );

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer legacy-token'
      });
    });
  });
});