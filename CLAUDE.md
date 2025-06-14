# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development**: `bun dev` - Run with file watching
- **Build**: `bun run build` - Compile TypeScript and make executable
- **Test**: `bun test` or `vitest` - Run test suite
- **Test with coverage**: `bun run test:coverage` - Run tests with coverage report
- **Start built version**: `bun start` - Run the compiled version

## Architecture Overview

This is a Model Context Protocol (MCP) server that enables LLMs to interact with GraphQL APIs. The server provides two main capabilities:

1. **Schema Introspection** - Automatically discovers GraphQL schema structure
2. **Query Execution** - Executes GraphQL queries and mutations (if enabled)

### Core Structure

- `src/index.ts` - Main server entry point with MCP server setup and tool definitions
- `src/helpers/` - Utility modules:
  - `introspection.ts` - GraphQL schema introspection logic
  - `headers.ts` - HTTP header generation including HTTP Signature authentication
  - `deprecation.ts` - Command line argument deprecation warnings
  - `package.ts` - Version information utilities

### Key Features

- **Environment-based configuration** (not CLI args as of v1.0.0)
- **HTTP Signature authentication support** for secure API access
- **Mutation protection** - disabled by default for security
- **Local schema file support** as alternative to introspection
- **Zod validation** for environment variables and tool inputs

### MCP Tools Provided

1. `introspect-schema` - Returns GraphQL schema (either from file or introspection)
2. `query-graphql` - Executes GraphQL queries with optional variables

### Environment Variables

Required: `ENDPOINT` (GraphQL endpoint URL)
Optional: `HEADERS`, `ALLOW_MUTATIONS`, `NAME`, `SCHEMA`, HTTP signature auth vars

## Testing

Uses Vitest with coverage thresholds set to 80% across all metrics. Tests located in `tests/` directory include integration tests and HTTP signature authentication tests.