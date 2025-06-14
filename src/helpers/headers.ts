import * as httpSignature from 'http-signature';
import * as crypto from 'crypto';

/**
 * HTTP Signature authentication configuration
 */
interface HttpSignatureConfig {
  keyId: string;
  secret: string;
  endpoint: string;
  algorithm?: string;
  headers?: string[];
}

/**
 * Generate HTTP Signature headers for authenticated API access
 * @param config - HTTP Signature configuration
 * @param method - HTTP method (default: POST)
 * @param path - URL path (defaults to parsed from endpoint)
 * @returns Headers with HTTP Signature authentication
 */
export function generateHttpSignatureHeaders(
  config: HttpSignatureConfig,
  method: string = 'POST',
  path?: string
): Record<string, string> {
  const url = new URL(config.endpoint);
  const host = url.hostname;
  const urlPath = path || url.pathname;
  const date = new Date().toUTCString();
  
  // Create a proper request object for http-signature library
  const mockRequest = {
    method: method.toUpperCase(),
    url: urlPath,
    headers: {
      'host': host,
      'date': date,
      'content-type': 'application/json'
    },
    // Add the required methods that http-signature expects
    getHeader: function(name: string) {
      return this.headers[name.toLowerCase()];
    },
    setHeader: function(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    }
  } as any;

  // Default to Remote.it-compatible settings if not specified
  const algorithm = config.algorithm || 'hmac-sha256';
  const headersToSign = config.headers || ['(request-target)', 'host', 'date', 'content-type'];

  // Generate signature manually (exactly like our working test script)
  const signingString = headersToSign.map(header => {
    if (header === '(request-target)') {
      return `(request-target): ${method.toLowerCase()} ${urlPath}`;
    }
    return `${header}: ${mockRequest.headers[header]}`;
  }).join('\n');
  
  // Create signature exactly like our working script
  const secretBuffer = Buffer.from(config.secret, 'base64');
  const signature = crypto.createHmac('sha256', secretBuffer)
    .update(signingString)
    .digest('base64');
    
  // Create Authorization header exactly like our working script
  const authorization = `Signature keyId="${config.keyId}",algorithm="${algorithm}",headers="${headersToSign.join(' ')}",signature="${signature}"`;

  return {
    'Authorization': authorization,
    'Date': date,
    'Content-Type': 'application/json',
    'Host': host
  };
}

/**
 * Check if endpoint requires Remote.it authentication (for backwards compatibility)
 * @param endpoint - GraphQL endpoint URL
 * @returns True if endpoint is Remote.it API
 */
export function isRemoteItEndpoint(endpoint: string): boolean {
  return endpoint.includes('api.remote.it') && endpoint.includes('graphql');
}

/**
 * Extract HTTP Signature credentials from environment
 * Supports both generic and Remote.it-specific environment variables
 * @param endpoint - GraphQL endpoint URL
 * @returns HTTP Signature configuration or null if not available
 */
export function getHttpSignatureConfig(endpoint: string): HttpSignatureConfig | null {
  // Try generic HTTP Signature environment variables first
  let keyId = process.env.HTTP_SIGNATURE_KEY_ID;
  let secret = process.env.HTTP_SIGNATURE_SECRET;
  
  // Fall back to Remote.it-specific environment variables for backwards compatibility
  if (!keyId || !secret) {
    keyId = process.env.R3_ACCESS_KEY_ID;
    secret = process.env.R3_SECRET_ACCESS_KEY;
  }
  
  if (!keyId || !secret) {
    return null;
  }
  
  return {
    keyId,
    secret,
    endpoint,
    // Default to Remote.it settings for compatibility
    algorithm: 'hmac-sha256',
    headers: ['(request-target)', 'host', 'date', 'content-type']
  };
}

/**
 * Parse and merge headers from various sources
 * @param configHeaders - Default headers from configuration
 * @param inputHeaders - Headers provided by the user (string or object)
 * @returns Merged headers object
 */
export function parseAndMergeHeaders(
  configHeaders: Record<string, string>,
  inputHeaders?: string | Record<string, string>
): Record<string, string> {
  // Parse headers if they're provided as a string
  let parsedHeaders: Record<string, string> = {};
  
  if (typeof inputHeaders === 'string') {
    try {
      parsedHeaders = JSON.parse(inputHeaders);
    } catch (e) {
      throw new Error(`Invalid headers JSON: ${e}`);
    }
  } else if (inputHeaders) {
    parsedHeaders = inputHeaders;
  }
  
  // Merge with config headers (config headers are overridden by input headers)
  return { ...configHeaders, ...parsedHeaders };
}

/**
 * Generate headers for GraphQL request with optional HTTP Signature support
 * @param endpoint - GraphQL endpoint URL
 * @param configHeaders - Default headers from configuration
 * @param inputHeaders - Headers provided by the user
 * @param enableHttpSignature - Whether HTTP Signature authentication is enabled
 * @returns Headers ready for GraphQL request
 */
export function generateHeaders(
  endpoint: string,
  configHeaders: Record<string, string>,
  inputHeaders?: string | Record<string, string>,
  enableHttpSignature: boolean = false
): Record<string, string> {
  // Only use HTTP Signature auth if explicitly enabled
  if (enableHttpSignature) {
    const httpSignatureConfig = getHttpSignatureConfig(endpoint);
    
    if (httpSignatureConfig) {
      // Generate HTTP Signature headers
      const signatureHeaders = generateHttpSignatureHeaders(httpSignatureConfig);
      
      // Merge with any additional headers (signature headers take precedence)
      const additionalHeaders = parseAndMergeHeaders(configHeaders, inputHeaders);
      
      return {
        ...additionalHeaders,
        ...signatureHeaders
      };
    } else {
      console.error('HTTP Signature authentication enabled but credentials not found in environment');
      console.error('Set HTTP_SIGNATURE_KEY_ID and HTTP_SIGNATURE_SECRET, or R3_ACCESS_KEY_ID and R3_SECRET_ACCESS_KEY');
    }
  }
  
  // Default behavior - no HTTP Signature authentication
  return parseAndMergeHeaders(configHeaders, inputHeaders);
}
