import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, normalize} from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const distMode = process.env.SERVE_DIST === '1';
const explicitRoot = process.env.SERVE_ROOT ? resolve(process.env.SERVE_ROOT) : null;
const primaryRoot = explicitRoot || (distMode ? resolve(projectRoot, 'dist') : projectRoot);
const publicRoot = !explicitRoot && !distMode ? resolve(projectRoot, 'public') : null;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';

const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png',
  '.gz':'application/gzip', '.bin':'application/octet-stream', '.wasm':'application/wasm', '.md':'text/markdown; charset=utf-8',
};

function safeResolve(root, pathname) {
  const file = resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}/`) && !file.startsWith(`${root}\\`)) throw new Error('bad path');
  return file;
}

async function regularFile(file) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://local');
    let pathname = decodeURIComponent(u.pathname);
    if (pathname === '/') pathname = '/index.html';
    pathname = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');

    let file = safeResolve(primaryRoot, pathname);
    if (!(await regularFile(file)) && publicRoot) {
      const publicFile = safeResolve(publicRoot, pathname);
      if (await regularFile(publicFile)) file = publicFile;
    }

    // SPA fallback is only for navigation-like routes. Missing data/assets must
    // remain 404 so fetch(...).json()/gzip loaders never receive index.html.
    if (!(await regularFile(file))) {
      const extension = extname(pathname);
      if (!extension || extension === '.html') {
        const index = safeResolve(primaryRoot, '/index.html');
        if (await regularFile(index)) file = index;
      }
    }

    if (!(await regularFile(file))) {
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store'});
      res.end(`Not found: ${pathname}`);
      return;
    }

    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control':'no-store',
      'Cross-Origin-Opener-Policy':'same-origin',
      'Cross-Origin-Embedder-Policy':'require-corp',
      'Cross-Origin-Resource-Policy':'same-origin',
      'X-Content-Type-Options':'nosniff',
    });
    res.end(data);
  } catch (error) {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    res.end(String(error));
  }
});

server.listen(port, host, () => {
  const overlay = publicRoot ? ` + public overlay ${publicRoot}` : '';
  console.log(`http://${host}:${port} (${primaryRoot}${overlay})`);
});
