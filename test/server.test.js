const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { server, DATA_FILE } = require('../server');

let baseUrl;
let originalData;

test.before(async () => {
  originalData = await fs.readFile(DATA_FILE, 'utf8');
  await new Promise(resolve => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await fs.writeFile(DATA_FILE, originalData);
  await new Promise(resolve => server.close(resolve));
});

test('serves public profile and published posts', async () => {
  const profile = await fetch(`${baseUrl}/api/profile`).then(response => response.json());
  assert.equal(profile.name, 'Bufan');

  const posts = await fetch(`${baseUrl}/api/posts`).then(response => response.json());
  assert.ok(posts.posts.length >= 3);
  assert.ok(posts.posts.every(post => post.published));
  assert.ok(posts.categories.includes('工程实践'));
});

test('requires admin token for draft-aware content management', async () => {
  const denied = await fetch(`${baseUrl}/api/posts?admin=true`);
  assert.equal(denied.status, 401);

  const allowed = await fetch(`${baseUrl}/api/posts?admin=true`, { headers: { 'x-admin-token': 'bufan-admin' } });
  assert.equal(allowed.status, 200);
});

test('creates, updates, likes, comments, and deletes a post', async () => {
  const headers = { 'content-type': 'application/json', 'x-admin-token': 'bufan-admin' };
  const created = await fetch(`${baseUrl}/api/admin/posts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: '测试动态文章',
      slug: 'test-dynamic-post',
      category: '测试',
      excerpt: '用于验证动态接口',
      content: '第一段\n第二段',
      tags: ['测试'],
      published: true,
      featured: false
    })
  }).then(response => response.json());
  assert.equal(created.slug, 'test-dynamic-post');

  const liked = await fetch(`${baseUrl}/api/posts/${created.slug}/like`, { method: 'POST' }).then(response => response.json());
  assert.equal(liked.likes, 1);

  const comment = await fetch(`${baseUrl}/api/posts/${created.slug}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author: '测试者', message: '很好用' })
  }).then(response => response.json());
  assert.equal(comment.author, '测试者');

  const updated = await fetch(`${baseUrl}/api/admin/posts/${created.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ title: '测试动态文章 Updated', published: false })
  }).then(response => response.json());
  assert.equal(updated.published, false);
  assert.equal(updated.likes, 1);

  const removed = await fetch(`${baseUrl}/api/admin/posts/${created.id}`, { method: 'DELETE', headers }).then(response => response.json());
  assert.equal(removed.deleted, created.id);
});
