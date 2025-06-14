# HTTP Signature Authentication

This fork of mcp-graphql adds support for HTTP Signature authentication, making it compatible with APIs that require signed requests (such as Remote.it GraphQL API).

## Features

- ✅ **HTTP Signature Authentication**: RFC-compliant HTTP signature generation
- ✅ **Backwards Compatibility**: Existing functionality preserved when feature is disabled
- ✅ **Flexible Configuration**: Support for both generic and provider-specific environment variables
- ✅ **Dynamic Header Generation**: Fresh signatures generated for each request
- ✅ **Comprehensive Testing**: Unit and integration tests ensure reliability

## Quick Start

### Basic Usage

Enable HTTP Signature authentication by setting environment variables:

```bash
# Enable HTTP Signature
ENABLE_HTTP_SIGNATURE=true

# Provide credentials
HTTP_SIGNATURE_KEY_ID=your-access-key-id
HTTP_SIGNATURE_SECRET=your-secret-access-key-base64

# Set your GraphQL endpoint
ENDPOINT=https://api.example.com/graphql/v1
```

### Remote.it Integration

For Remote.it GraphQL API, you can use Remote.it-specific environment variables:

```bash
ENABLE_HTTP_SIGNATURE=true
R3_ACCESS_KEY_ID=your-remoteit-access-key
R3_SECRET_ACCESS_KEY=your-remoteit-secret-key
ENDPOINT=https://api.remote.it/graphql/v1
```

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `ENABLE_HTTP_SIGNATURE` | Enable HTTP Signature authentication | No | `false` |
| `HTTP_SIGNATURE_KEY_ID` | Access key ID for signing | Yes* | - |
| `HTTP_SIGNATURE_SECRET` | Secret key (base64 encoded) | Yes* | - |
| `R3_ACCESS_KEY_ID` | Remote.it access key (fallback) | Yes* | - |
| `R3_SECRET_ACCESS_KEY` | Remote.it secret key (fallback) | Yes* | - |

*Required when `ENABLE_HTTP_SIGNATURE=true`

## How It Works

### HTTP Signature Generation

When HTTP Signature authentication is enabled, the system:

1. **Generates Headers**: Creates standard HTTP headers (Date, Host, Content-Type)
2. **Creates Signing String**: Combines request method, path, and headers
3. **Signs Request**: Uses HMAC-SHA256 to sign the string with your secret key
4. **Adds Authorization**: Includes the signature in the Authorization header

### Example Signature

```
Authorization: Signature keyId="your-key-id",algorithm="hmac-sha256",headers="(request-target) host date content-type",signature="base64-signature"
Date: Wed, 15 Jan 2025 10:30:00 GMT
Content-Type: application/json
Host: api.remote.it
```

### Backwards Compatibility

When `ENABLE_HTTP_SIGNATURE=false` (default), the system works exactly like the original mcp-graphql:

```bash
# Traditional usage (no HTTP Signature)
ENDPOINT=https://api.example.com/graphql
HEADERS='{"Authorization": "Bearer your-token"}'
```

## Testing

Run the test suite to verify HTTP Signature functionality:

```bash
# Install test dependencies
bun install

# Run unit tests
bun test

# Run tests with coverage
bun run test:coverage

# Run only HTTP Signature tests
bun test tests/http-signature.test.ts

# Run integration tests
bun test tests/integration.test.ts
```

### Test Coverage

The test suite covers:

- ✅ HTTP Signature generation with various configurations
- ✅ Environment variable handling (generic and Remote.it-specific)
- ✅ Header parsing and merging
- ✅ Integration with MCP server
- ✅ Backwards compatibility scenarios
- ✅ Error handling for missing credentials

## Real-World Example

### Remote.it Device Monitoring

```bash
# Set Remote.it credentials
export R3_ACCESS_KEY_ID="your-remoteit-access-key"
export R3_SECRET_ACCESS_KEY="your-remoteit-secret-key"
export ENABLE_HTTP_SIGNATURE=true
export ENDPOINT="https://api.remote.it/graphql/v1"

# Start MCP server
bun src/index.ts
```

Then use with an MCP client:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "query-graphql",
    "arguments": {
      "query": "{ login { email devices(size: 10) { items { id name state } } } }"
    }
  }
}
```

## Implementation Details

### Security Considerations

- **Base64 Encoding**: Secret keys should be base64 encoded in environment variables
- **Signature Freshness**: New signatures generated for each request with current timestamp
- **Algorithm**: Uses HMAC-SHA256 for cryptographic signing
- **Headers**: Signs request-target, host, date, and content-type headers

### Error Handling

The system gracefully handles various error scenarios:

- **Missing Credentials**: Falls back to regular headers with console warning
- **Invalid Base64**: Provides clear error messages
- **Network Issues**: Standard HTTP error handling
- **Authentication Failures**: Returns detailed error responses

### Performance

- **Minimal Overhead**: Signature generation adds ~1ms per request
- **No External Dependencies**: Uses Node.js built-in crypto module
- **Memory Efficient**: No persistent state or caching

## Contributing

### Development Setup

```bash
# Clone the repository
git clone https://github.com/tokmakoff/mcp-graphql.git
cd mcp-graphql

# Install dependencies
bun install

# Run in development mode
bun run dev

# Run tests
bun test

# Build for production
bun run build
```

### Adding Tests

When adding new features:

1. Add unit tests in `tests/http-signature.test.ts`
2. Add integration tests in `tests/integration.test.ts`
3. Ensure test coverage remains above 80%
4. Test both success and failure scenarios

### Code Style

- Use TypeScript for type safety
- Follow existing code patterns
- Add JSDoc comments for public functions
- Maintain backwards compatibility

## Troubleshooting

### Common Issues

#### "Forbidden" Errors

```
Error: GraphQL request failed: Forbidden
```

**Solutions:**
- Verify your access key ID and secret are correct
- Ensure secret is properly base64 encoded
- Check that `ENABLE_HTTP_SIGNATURE=true`
- Confirm the endpoint URL is correct

#### Missing Credentials Warning

```
HTTP Signature authentication enabled but credentials not found in environment
```

**Solutions:**
- Set `HTTP_SIGNATURE_KEY_ID` and `HTTP_SIGNATURE_SECRET`
- Or set `R3_ACCESS_KEY_ID` and `R3_SECRET_ACCESS_KEY`
- Verify environment variables are exported

#### Invalid Base64 Errors

**Solutions:**
- Encode your secret key: `echo -n "your-secret" | base64`
- Verify the base64 string has no newlines or spaces

### Debug Mode

Enable debug logging by adding console.log statements or use the built-in debug output:

```bash
# The system automatically logs signature generation details
# Check stderr output for debug information
```

## License

This project maintains the same license as the original mcp-graphql project.

## Acknowledgments

- Original mcp-graphql project by [blurrah](https://github.com/blurrah/mcp-graphql)
- HTTP Signature specification [draft-cavage-http-signatures](https://tools.ietf.org/id/draft-cavage-http-signatures-12.html)
- Remote.it API documentation for authentication examples