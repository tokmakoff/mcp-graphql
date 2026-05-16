#!/usr/bin/env node

/**
 * HTTP Server Wrapper for MCP GraphQL
 * 
 * This creates a persistent HTTP server that exposes MCP functionality
 * via REST endpoints instead of stdio communication
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { z } from "zod";
import { generateHeaders } from "./helpers/headers.js";
import { introspectEndpoint, introspectLocalSchema } from "./helpers/introspection.js";
import { parse } from "graphql/language";

const EnvSchema = z.object({
	NAME: z.string().default("mcp-graphql-http"),
	ENDPOINT: z.string().url().default("http://localhost:4000/graphql"),
	PORT: z.string().default("3030").transform(val => parseInt(val, 10)),
	ALLOW_MUTATIONS: z
		.enum(["true", "false"])
		.transform((value) => value === "true")
		.default("false"),
	HEADERS: z
		.string()
		.default("{}")
		.transform((val) => {
			try {
				return JSON.parse(val);
			} catch (e) {
				throw new Error("HEADERS must be a valid JSON string");
			}
		}),
	SCHEMA: z.string().optional(),
	// HTTP Signature authentication support
	ENABLE_HTTP_SIGNATURE: z
		.enum(["true", "false"])
		.transform((value) => value === "true")
		.default("false"),
	HTTP_SIGNATURE_KEY_ID: z.string().optional(),
	HTTP_SIGNATURE_SECRET: z.string().optional(),
	// Remote.it credentials (convenience aliases)
	R3_ACCESS_KEY_ID: z.string().optional(),
	R3_SECRET_ACCESS_KEY: z.string().optional(),
});

const env = EnvSchema.parse(process.env);

// Use R3 credentials if provided (for Remote.it integration)
if (env.R3_ACCESS_KEY_ID && env.R3_SECRET_ACCESS_KEY) {
	env.HTTP_SIGNATURE_KEY_ID = env.R3_ACCESS_KEY_ID;
	env.HTTP_SIGNATURE_SECRET = env.R3_SECRET_ACCESS_KEY;
}

interface McpRequest {
	method: string;
	params?: any;
}

interface McpResponse {
	result?: any;
	error?: {
		code: number;
		message: string;
	};
}

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id: string | number;
	method: string;
	params?: any;
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: string | number;
	result?: any;
	error?: {
		code: number;
		message: string;
		data?: any;
	};
}

class HttpMcpServer {
	private async handleIntrospectSchema(): Promise<McpResponse> {
		try {
			let schema: string;
			if (env.SCHEMA) {
				schema = await introspectLocalSchema(env.SCHEMA);
			} else {
				const headers = generateHeaders(env.ENDPOINT, env.HEADERS, undefined, env.ENABLE_HTTP_SIGNATURE);
				schema = await introspectEndpoint(env.ENDPOINT, headers);
			}

			return {
				result: {
					content: [
						{
							type: "text",
							text: schema,
						},
					],
				},
			};
		} catch (error) {
			return {
				result: {
					isError: true,
					content: [
						{
							type: "text",
							text: `Failed to introspect schema: ${error}`,
						},
					],
				},
			};
		}
	}

	private async handleQueryGraphql(query: string, variables?: string): Promise<McpResponse> {
		try {
			const parsedQuery = parse(query);

			// Check if the query is a mutation
			const isMutation = parsedQuery.definitions.some(
				(def) =>
					def.kind === "OperationDefinition" && def.operation === "mutation",
			);

			if (isMutation && !env.ALLOW_MUTATIONS) {
				return {
					result: {
						isError: true,
						content: [
							{
								type: "text",
								text: "Mutations are not allowed unless you enable them in the configuration. Please use a query operation instead.",
							},
						],
					},
				};
			}
		} catch (error) {
			return {
				result: {
					isError: true,
					content: [
						{
							type: "text",
							text: `Invalid GraphQL query: ${error}`,
						},
					],
				},
			};
		}

		try {
			const headers = generateHeaders(env.ENDPOINT, env.HEADERS, undefined, env.ENABLE_HTTP_SIGNATURE);
			const response = await fetch(env.ENDPOINT, {
				method: "POST",
				headers,
				body: JSON.stringify({
					query,
					variables: variables ? JSON.parse(variables) : undefined,
				}),
			});

			if (!response.ok) {
				const responseText = await response.text();

				return {
					result: {
						isError: true,
						content: [
							{
								type: "text",
								text: `GraphQL request failed: ${response.statusText}\n${responseText}`,
							},
						],
					},
				};
			}

			const data = await response.json();

			if (data.errors && data.errors.length > 0) {
				// Contains GraphQL errors
				return {
					result: {
						isError: true,
						content: [
							{
								type: "text",
								text: `The GraphQL response has errors, please fix the query: ${JSON.stringify(
									data,
									null,
									2,
								)}`,
							},
						],
					},
				};
			}

			return {
				result: {
					content: [
						{
							type: "text",
							text: JSON.stringify(data, null, 2),
						},
					],
				},
			};
		} catch (error) {
			return {
				error: {
					code: -1,
					message: `Failed to execute GraphQL query: ${error}`,
				},
			};
		}
	}

	private async handleRequest(mcpRequest: McpRequest): Promise<McpResponse> {
		switch (mcpRequest.method) {
			case 'introspect-schema':
				return this.handleIntrospectSchema();
			
			case 'query-graphql':
				const { query, variables } = mcpRequest.params || {};
				if (!query) {
					return {
						error: {
							code: -1,
							message: 'Missing required parameter: query',
						},
					};
				}
				return this.handleQueryGraphql(query, variables);
			
			case 'health':
				return {
					result: {
						status: 'healthy',
						endpoint: env.ENDPOINT,
						httpSignature: env.ENABLE_HTTP_SIGNATURE,
						allowMutations: env.ALLOW_MUTATIONS,
					},
				};
			
			default:
				return {
					error: {
						code: -1,
						message: `Unknown method: ${mcpRequest.method}`,
					},
				};
		}
	}

	private async handleJsonRpcRequest(jsonRpcRequest: JsonRpcRequest): Promise<JsonRpcResponse> {
		try {
			// Convert JSON-RPC to MCP format
			const mcpRequest: McpRequest = {
				method: jsonRpcRequest.method,
				params: jsonRpcRequest.params
			};

			// Handle the request using existing MCP logic
			const mcpResponse = await this.handleRequest(mcpRequest);

			// Convert MCP response back to JSON-RPC format
			if (mcpResponse.error) {
				return {
					jsonrpc: '2.0',
					id: jsonRpcRequest.id,
					error: {
						code: mcpResponse.error.code,
						message: mcpResponse.error.message,
						data: mcpResponse.error
					}
				};
			}

			return {
				jsonrpc: '2.0',
				id: jsonRpcRequest.id,
				result: mcpResponse.result
			};
		} catch (error) {
			return {
				jsonrpc: '2.0',
				id: jsonRpcRequest.id,
				error: {
					code: -32603,
					message: 'Internal error',
					data: error instanceof Error ? error.message : String(error)
				}
			};
		}
	}

	private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const url = new URL(req.url || '/', `http://${req.headers.host}`);
		
		// CORS headers
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		
		if (req.method === 'OPTIONS') {
			res.writeHead(200);
			res.end();
			return;
		}

		// Health check endpoint
		if (url.pathname === '/health' && req.method === 'GET') {
			const healthResponse = await this.handleRequest({ method: 'health' });
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(healthResponse));
			return;
		}

		// Schema introspection endpoint
		if (url.pathname === '/schema' && req.method === 'GET') {
			const schemaResponse = await this.handleRequest({ method: 'introspect-schema' });
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(schemaResponse));
			return;
		}

		// GraphQL query endpoint
		if (url.pathname === '/query' && req.method === 'POST') {
			let body = '';
			req.on('data', chunk => {
				body += chunk.toString();
			});
			
			req.on('end', async () => {
				try {
					const requestData = JSON.parse(body);
					const queryResponse = await this.handleRequest({
						method: 'query-graphql',
						params: requestData,
					});
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify(queryResponse));
				} catch (error) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						error: {
							code: -1,
							message: `Invalid JSON: ${error}`,
						},
					}));
				}
			});
			return;
		}

		// JSON-RPC endpoint (tb-mcp compatible)
		if (url.pathname === '/jsonrpc' && req.method === 'POST') {
			let body = '';
			req.on('data', chunk => {
				body += chunk.toString();
			});
			
			req.on('end', async () => {
				try {
					const jsonRpcRequest = JSON.parse(body) as JsonRpcRequest;
					
					// Validate JSON-RPC format
					if (jsonRpcRequest.jsonrpc !== '2.0' || !jsonRpcRequest.method || jsonRpcRequest.id === undefined) {
						res.writeHead(400, { 'Content-Type': 'application/json' });
						res.end(JSON.stringify({
							jsonrpc: '2.0',
							id: jsonRpcRequest.id || null,
							error: {
								code: -32600,
								message: 'Invalid Request',
								data: 'Missing required JSON-RPC 2.0 fields'
							}
						}));
						return;
					}

					const jsonRpcResponse = await this.handleJsonRpcRequest(jsonRpcRequest);
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify(jsonRpcResponse));
				} catch (error) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({
						jsonrpc: '2.0',
						id: null,
						error: {
							code: -32700,
							message: 'Parse error',
							data: error instanceof Error ? error.message : String(error)
						}
					}));
				}
			});
			return;
		}

		// 404 for unknown endpoints
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({
			error: {
				code: -1,
				message: 'Not found',
			},
		}));
	}

	public start(): void {
		const server = createServer((req, res) => {
			this.handleHttpRequest(req, res).catch((error) => {
				console.error('Request handling error:', error);
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					error: {
						code: -1,
						message: 'Internal server error',
					},
				}));
			});
		});

		server.listen(env.PORT, () => {
			console.error(`Started HTTP MCP GraphQL server on port ${env.PORT}`);
			console.error(`Endpoint: ${env.ENDPOINT}`);
			console.error(`HTTP Signature: ${env.ENABLE_HTTP_SIGNATURE ? 'enabled' : 'disabled'}`);
			console.error(`Available endpoints:`);
			console.error(`  GET  /health  - Server health check`);
			console.error(`  GET  /schema  - GraphQL schema introspection`);
			console.error(`  POST /query   - Execute GraphQL query (REST)`);
			console.error(`  POST /jsonrpc - Execute GraphQL query (JSON-RPC 2.0, tb-mcp compatible)`);
		});

		// Keep the process alive
		process.on('SIGTERM', () => {
			console.error('Received SIGTERM, shutting down gracefully');
			server.close(() => {
				process.exit(0);
			});
		});

		process.on('SIGINT', () => {
			console.error('Received SIGINT, shutting down gracefully');
			server.close(() => {
				process.exit(0);
			});
		});
	}
}

async function main() {
	console.error(`Starting HTTP MCP GraphQL server...`);
	console.error(`Target endpoint: ${env.ENDPOINT}`);
	console.error(`HTTP Signature: ${env.ENABLE_HTTP_SIGNATURE ? 'enabled' : 'disabled'}`);
	
	const server = new HttpMcpServer();
	server.start();
}

main().catch((error) => {
	console.error(`Fatal error in main(): ${error}`);
	process.exit(1);
});