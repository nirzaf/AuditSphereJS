#!/usr/bin/env node
// Minimal Model Context Protocol stdio client for the Angular CLI MCP server.
//
// Usage:
//   node scripts/angular-mcp.mjs tools-list
//   node scripts/angular-mcp.mjs call <toolName> '<jsonArgs>'
//
// The server is `ng mcp` from the workspace-pinned @angular/cli. Nothing is written by the client.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cliPath = require.resolve('@angular/cli/bin/ng.js');
const args = process.argv.slice(2);
const mode = args[0] ?? 'tools-list';

function startServer() {
  const child = spawn(process.execPath, [cliPath, 'mcp'], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let buffer = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message.id !== undefined && pending.has(message.id)) {
        const resolver = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(resolver.timer);
        resolver.resolve(message);
      }
    }
  });
  const request = (id, method, params) => new Promise((resolve, reject) => {
    const entry = { resolve, timer: undefined };
    pending.set(id, entry);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    entry.timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('MCP timeout: ' + method + (stderr ? ' | ' + stderr.slice(0, 400) : ''))); } }, method === 'tools/call' ? 180_000 : 30_000);
  });
  return { child, request, notify: (method) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'), stderr: () => stderr };
}

const server = startServer();
try {
  const init = await server.request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'auditsphere-dsh', version: '1.0.0' } });
  if (init.error) throw new Error('initialize failed: ' + JSON.stringify(init.error));
  server.notify('notifications/initialized');
  console.error('[angular-mcp] server: ' + JSON.stringify(init.result?.serverInfo ?? {}));
  if (mode === 'tools-list') {
    const list = await server.request(2, 'tools/list', {});
    const tools = (list.result?.tools ?? []).map((tool) => ({ name: tool.name, description: (tool.description ?? '').split('\n')[0], arguments: Object.keys(tool.inputSchema?.properties ?? {}) }));
    console.log(JSON.stringify(tools, null, 2));
  } else if (mode === 'call') {
    const name = args[1];
    const toolArguments = args[2] ? JSON.parse(args[2]) : {};
    const result = await server.request(2, 'tools/call', { name, arguments: toolArguments });
    console.log(JSON.stringify(result, null, 2));
  } else {
    throw new Error('Unknown mode: ' + mode);
  }
} finally {
  server.child.kill();
}
