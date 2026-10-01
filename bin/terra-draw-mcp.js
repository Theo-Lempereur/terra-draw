#!/usr/bin/env node
// Point d'entrée du serveur MCP : lit/écrit JSON-RPC sur stdio. Ne jamais
// écrire sur stdout en dehors du transport ; les diagnostics vont sur stderr.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../src/mcp/server.js';

const server = createServer();
await server.connect(new StdioServerTransport());
console.error('terra-draw-mcp : serveur MCP prêt sur stdio.');
