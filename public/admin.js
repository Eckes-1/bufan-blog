const adminState = { posts: [], active: null, query: '' };
const $ = selector => document.querySelector(selector);
const token = () => localStorage.getItem('adminToken') || 'bufan-admin';

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-admin-token': token(), ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 2200);
}

function formToPayload() {
  return {
    title: $('#title').value,
    slug: $('#slug').value,
    category: $('#category').value,
    cover: $('#cover').value,
    excerpt: $('#excerpt').value,
    content: $('#content').value,
    tags: $('#tags').value.split(',').map(item => item.trim()).filter(Boolean),
    published: $('#published').checked,
    featured: $('#featured').checked
  };
}

function fillForm(post = {}) {
  adminState.active = post.id || null;
  $('#postId').value = post.id || '';
  $('#title').value = post.title || '';
  $('#slug').value = post.slug || '';
  $('#category').value = post.category || '';
  $('#cover').value = post.cover || '';
  $('#excerpt').value = post.excerpt || '';
  $('#content').value = post.content || '';
  $('#tags').value = (post.tags || []).join(', ');
  $('#published').checked = Boolean(post.published);
  $('#featured').checked = Boolean(post.featured);
}

function renderStats() {
  const published = adminState.posts.filter(post => post.published).length;
  const drafts = adminState.posts.length - published;
  const views = adminState.posts.reduce((sum, post) => sum + post.views, 0);
  const likes = adminState.posts.reduce((sum, post) => sum + post.likes, 0);
  $('#adminStats').innerHTML = [
    ['总文章', adminState.posts.length], ['已发布', published], ['草稿', drafts], ['总喜欢', likes], ['总阅读', views]
  ].map(([label, value]) => `<article class="glass"><strong>${value}</strong><span>${label}</span></article>`).join('');
}

function renderPosts() {
  const query = adminState.query.toLowerCase();
  const posts = adminState.posts.filter(post => `${post.title} ${post.category} ${post.tags.join(' ')}`.toLowerCase().includes(query));
  $('#adminPosts').innerHTML = posts.map(post => `
    <article class="admin-post-item ${post.id === adminState.active ? 'active' : ''}" data-id="${post.id}">
      <span class="status-pill">${post.published ? '已发布' : '草稿'}${post.featured ? ' · 精选' : ''}</span>
      <strong>${post.title}</strong>
      <small>${post.category} · ${post.views} 阅读 · ${post.likes} 喜欢 · ${post.commentsCount} 评论</small>
    </article>`).join('') || '<p class="hero-lead">暂无内容。</p>';
}

async function loadPosts() {
  const data = await api('/api/posts?admin=true');
  adminState.posts = data.posts;
  renderStats();
  renderPosts();
  if (!adminState.active && adminState.posts[0]) fillForm(adminState.posts[0]);
}

function bindAdmin() {
  $('#tokenInput').value = token();
  $('#saveToken').addEventListener('click', () => {
    localStorage.setItem('adminToken', $('#tokenInput').value.trim());
    toast('令牌已保存');
    loadPosts().catch(error => toast(error.message));
  });
  $('#newPost').addEventListener('click', () => fillForm({ published: true }));
  $('#adminSearch').addEventListener('input', event => { adminState.query = event.target.value; renderPosts(); });
  $('#adminPosts').addEventListener('click', event => {
    const item = event.target.closest('[data-id]');
    if (!item) return;
    fillForm(adminState.posts.find(post => post.id === item.dataset.id));
    renderPosts();
  });
  $('#postForm').addEventListener('submit', async event => {
    event.preventDefault();
    const id = $('#postId').value;
    const path = id ? `/api/admin/posts/${id}` : '/api/admin/posts';
    const method = id ? 'PUT' : 'POST';
    const saved = await api(path, { method, body: JSON.stringify(formToPayload()) });
    toast('文章已保存');
    await loadPosts();
    fillForm(saved);
    renderPosts();
  });
  $('#deletePost').addEventListener('click', async () => {
    const id = $('#postId').value;
    if (!id || !confirm('确定删除当前文章吗？')) return;
    await api(`/api/admin/posts/${id}`, { method: 'DELETE' });
    toast('文章已删除');
    fillForm({});
    await loadPosts();
  });
}

bindAdmin();
loadPosts().catch(error => toast(error.message));
