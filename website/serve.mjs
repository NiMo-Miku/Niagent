import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformLocalNavigation } from './tools/local-navigation.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'mirror-manifest.json'), 'utf8'));
const host = '127.0.0.1';
const port = Number(process.env.QQ_AGENT_SITE_PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg', '.webm': 'video/webm' };

function json(res, status, value, head = false) {
  const data = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': types['.json'], 'Content-Length': data.length, 'Cache-Control': 'no-store' });
  res.end(head ? undefined : data);
}

export const server = http.createServer(async (req, res) => {
  const head = req.method === 'HEAD';
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    // Local preview has no forwarding path and never sends submissions to production.
    if (!['GET', 'HEAD'].includes(req.method)) {
      return json(res, 405, { ok: false, error: '本地预览使用数据快照，登录、发布、点赞和管理操作需要连接后端。' });
    }
    if (pathname === '/' || pathname === '/qq-agent') {
      res.writeHead(302, { Location: '/qq-agent/' });
      return res.end();
    }
    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }
    if (pathname === '/api/community/captcha-config') {
      return json(res, 200, { ok: true, enabled: false }, head);
    }
    if (pathname === '/api/community/auth/whoami') {
      return json(res, 200, { ok: false, user: null, error: '当前为本地预览' }, head);
    }
    let filename;
    const key = manifest.api[pathname];
    const prompt = /^\/api\/community\/personas\/([A-Za-z0-9_-]+)\/prompt$/.exec(pathname);
    if (key) filename = path.join(root, 'snapshots', key + '.json');
    else if (prompt) filename = path.join(root, 'snapshots/persona-prompts', prompt[1] + '.json');
    else if (pathname === '/local-preview.js') filename = path.join(root, 'local-preview.js');
    else if (pathname.startsWith('/api/') || pathname.startsWith('/qq-agent/api/')) {
      return json(res, 501, { ok: false, error: '此功能需要后端服务；本地版目前提供页面和公开数据快照。' }, head);
    } else if (pathname.startsWith('/qq-agent/')) {
      if (pathname.includes('\\') || pathname.split('/').includes('..')) return json(res, 400, { ok: false }, head);
      filename = path.resolve(root, '.' + pathname);
      const siteRoot = path.join(root, 'qq-agent');
      if (filename !== siteRoot && !filename.startsWith(siteRoot + path.sep)) return json(res, 403, { ok: false }, head);
      if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    } else return json(res, 404, { ok: false, error: '文件不存在' }, head);

    const info = await stat(filename);
    if (!info.isFile()) return json(res, 404, { ok: false, error: '文件不存在' }, head);
    if (['plugins', 'skills', 'personas'].includes(key)) {
      const data = JSON.parse(await readFile(filename, 'utf8'));
      for (const item of data.items || []) {
        if (/^\/api\/community\/(plugins|skills|personas)\/[^/?#]+\/download$/.test(item.downloadUrl || '')) {
          item.downloadUrl = 'https://kondius.cn' + item.downloadUrl;
        }
      }
      return json(res, 200, data, head);
    }
    const ext = path.extname(filename).toLowerCase();
    const headers = { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff' };
    if (ext === '.html' || (ext === '.js' && filename.includes(`${path.sep}qa3${path.sep}`))) {
      let text = await readFile(filename, 'utf8');
      // Resolve the original site's absolute attachment URLs against this local copy.
      text = text.replaceAll('https://kondius.cn/qq-agent/comment/', '/qq-agent/comment/');
      if (ext === '.js' && /^core(?:\.[a-f0-9]+)?\.js$/.test(path.basename(filename))) text = transformLocalNavigation(text);
      if (ext === '.html' && !pathname.startsWith('/qq-agent/lab/')) text = text.replace('</head>', '<script src="/local-preview.js"></script>\n</head>');
      const data = Buffer.from(text);
      res.writeHead(200, { ...headers, 'Content-Length': data.length });
      return res.end(head ? undefined : data);
    }
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = match && match[1] ? Number(match[1]) : 0;
      let end = match && match[2] ? Number(match[2]) : info.size - 1;
      if (match && !match[1] && match[2]) { start = Math.max(0, info.size - Number(match[2])); end = info.size - 1; }
      if (!match || start > end || start >= info.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
        return res.end();
      }
      end = Math.min(end, info.size - 1);
      res.writeHead(206, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${info.size}`,
        'Content-Length': end - start + 1 });
      if (head) return res.end();
      return createReadStream(filename, { start, end }).on('error', () => res.destroy()).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': info.size, 'Accept-Ranges': 'bytes' });
    if (head) return res.end();
    createReadStream(filename).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    if (res.headersSent) return res.destroy();
    json(res, error.code === 'ENOENT' ? 404 : error instanceof URIError ? 400 : 500,
      { ok: false, error: error.code === 'ENOENT' ? '本地文件不存在' : '本地预览无法读取文件' }, head);
  }
});

server.listen(port, host, () => console.log(`QQ Agent 本地网页：http://${host}:${server.address().port}/qq-agent/\n按 Ctrl+C 停止。`));
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，可设置 QQ_AGENT_SITE_PORT 后重试。` : error.message);
  process.exitCode = 1;
});
