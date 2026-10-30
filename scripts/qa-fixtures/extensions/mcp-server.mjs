// Offline stdio MCP server for headed QA. stdout contains JSON-RPC only.
import readline from 'node:readline';
const mode = process.argv[2] ?? 'normal';
const input = readline.createInterface({ input: process.stdin });
const respond = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
input.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id === undefined) return;
  if (message.method === 'initialize') respond(message.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'Offline QA MCP', version: '1.0.0' } });
  else if (message.method === 'tools/list') {
    if (mode === 'malformed') process.stdout.write('invalid JSON fixture\n');
    else if (mode === 'hang') return;
    else respond(message.id, { tools: [{ name: 'qa_echo', title: '离线 MCP 回声', description: '返回合成文本，不连接网络', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, scopes: ['mcp.connect'] }] });
  } else if (message.method === 'tools/call') respond(message.id, { content: [{ type: 'text', text: 'MCP 离线回声：' + String(message.params?.arguments?.text ?? '') }] });
  else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unknown fixture method' } }) + '\n');
});
input.on('close', () => { process.exitCode = 0; });
