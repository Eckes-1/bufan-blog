const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'bufan-admin';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'blogs.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

async function readDatabase() {
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeDatabase(data) {
  await fs.writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function sanitizePost(post, includeDrafts = false) {
  if (!includeDrafts && !post.published) return null;
  const words = `${post.title} ${post.excerpt} ${post.content}`.trim().split(/\s+/).filter(Boolean).length;
  return {
    ...post,
    readingMinutes: Math.max(1, Math.ceil(words / 260)),
    commentsCount: post.comments?.length || 0
  };
}

function requireAdmin(req, res) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    sendError(res, 401, '需要有效的后台令牌。默认演示令牌是 bufan-admin，可通过 ADMIN_TOKEN 环境变量修改。');
    return false;
  }
  return true;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('JSON 格式无效'));
      }
    });
    req.on('error', reject);
  });
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || `post-${Date.now()}`;
}

function normalizePost(input, existing = {}) {
  const now = new Date().toISOString();
  const title = String(input.title || existing.title || '未命名文章').trim();
  return {
    id: existing.id || crypto.randomUUID(),
    title,
    slug: slugify(input.slug || existing.slug || title),
    category: String(input.category || existing.category || '未分类').trim(),
    excerpt: String(input.excerpt || existing.excerpt || '').trim(),
    content: String(input.content || existing.content || '').trim(),
    cover: String(input.cover || existing.cover || '').trim(),
    tags: Array.isArray(input.tags) ? input.tags.map(tag => String(tag).trim()).filter(Boolean) : (existing.tags || []),
    featured: Boolean(input.featured ?? existing.featured),
    published: Boolean(input.published ?? existing.published),
    views: Number(existing.views || 0),
    likes: Number(existing.likes || 0),
    createdAt: existing.createdAt || now,
    updatedAt: now,
    comments: existing.comments || []
  };
}

async function handleApi(req, res, url) {
  const data = await readDatabase();

  if (req.method === 'GET' && url.pathname === '/api/profile') {
    return sendJson(res, 200, data.profile);
  }

  if (req.method === 'GET' && url.pathname === '/api/posts') {
    const includeDrafts = url.searchParams.get('admin') === 'true' && requireAdmin(req, res);
    if (url.searchParams.get('admin') === 'true' && !includeDrafts) return;
    const query = (url.searchParams.get('q') || '').toLowerCase();
    const category = url.searchParams.get('category') || 'all';
    const posts = data.posts
      .map(post => sanitizePost(post, includeDrafts))
      .filter(Boolean)
      .filter(post => category === 'all' || post.category === category)
      .filter(post => !query || `${post.title} ${post.excerpt} ${post.tags.join(' ')}`.toLowerCase().includes(query))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, 200, { posts, categories: [...new Set(data.posts.map(post => post.category))] });
  }

  const postMatch = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (req.method === 'GET' && postMatch) {
    const post = data.posts.find(item => item.slug === postMatch[1] || item.id === postMatch[1]);
    if (!post || !post.published) return sendError(res, 404, '文章不存在或尚未发布');
    post.views = Number(post.views || 0) + 1;
    await writeDatabase(data);
    return sendJson(res, 200, sanitizePost(post, true));
  }

  const reactMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/like$/);
  if (req.method === 'POST' && reactMatch) {
    const post = data.posts.find(item => item.slug === reactMatch[1] || item.id === reactMatch[1]);
    if (!post) return sendError(res, 404, '文章不存在');
    post.likes = Number(post.likes || 0) + 1;
    post.updatedAt = new Date().toISOString();
    await writeDatabase(data);
    return sendJson(res, 200, { likes: post.likes });
  }

  const commentMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
  if (req.method === 'POST' && commentMatch) {
    const post = data.posts.find(item => item.slug === commentMatch[1] || item.id === commentMatch[1]);
    if (!post) return sendError(res, 404, '文章不存在');
    const body = await parseBody(req);
    const author = String(body.author || '匿名读者').trim().slice(0, 24);
    const message = String(body.message || '').trim().slice(0, 500);
    if (!message) return sendError(res, 400, '评论内容不能为空');
    const comment = { id: crypto.randomUUID(), author, message, createdAt: new Date().toISOString() };
    post.comments = [comment, ...(post.comments || [])];
    post.updatedAt = new Date().toISOString();
    await writeDatabase(data);
    return sendJson(res, 201, comment);
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/posts') {
    if (!requireAdmin(req, res)) return;
    const body = await parseBody(req);
    const post = normalizePost(body);
    data.posts.unshift(post);
    await writeDatabase(data);
    return sendJson(res, 201, sanitizePost(post, true));
  }

  const adminPostMatch = url.pathname.match(/^\/api\/admin\/posts\/([^/]+)$/);
  if (adminPostMatch) {
    if (!requireAdmin(req, res)) return;
    const index = data.posts.findIndex(item => item.id === adminPostMatch[1] || item.slug === adminPostMatch[1]);
    if (index === -1) return sendError(res, 404, '文章不存在');

    if (req.method === 'PUT') {
      const body = await parseBody(req);
      const updated = normalizePost(body, data.posts[index]);
      data.posts[index] = updated;
      await writeDatabase(data);
      return sendJson(res, 200, sanitizePost(updated, true));
    }

    if (req.method === 'DELETE') {
      const [removed] = data.posts.splice(index, 1);
      await writeDatabase(data);
      return sendJson(res, 200, { deleted: removed.id });
    }
  }

  return sendError(res, 404, 'API 路由不存在');
}

async function serveStatic(req, res, url) {
  const routeFile = url.pathname === '/' ? 'index.html' : url.pathname === '/admin' ? 'admin.html' : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.normalize(path.join(PUBLIC_DIR, routeFile));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendError(res, 403, '禁止访问');

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'content-type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(file);
  } catch (error) {
    if (!path.extname(filePath)) {
      const index = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'content-type': MIME_TYPES['.html'] });
      return res.end(index);
    }
    sendError(res, 404, '页面或资源不存在');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    sendError(res, 500, error.message || '服务器内部错误');
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Bufan Blog is running at http://localhost:${PORT}`);
    console.log(`Admin demo token: ${ADMIN_TOKEN}`);
  });
}

module.exports = { server, readDatabase, writeDatabase, DATA_FILE };
