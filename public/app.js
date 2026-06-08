const state = { posts: [], categories: [], query: '', category: 'all' };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const formatNumber = value => new Intl.NumberFormat('zh-CN', { notation: value > 999 ? 'compact' : 'standard' }).format(value);
const formatDate = value => new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value));

async function api(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error((await response.json()).error || '请求失败');
  return response.json();
}

function renderProfile(profile) {
  $('#profileBio').textContent = profile.bio;
  $('#heroTags').innerHTML = profile.heroTags.map(tag => `<span class="tag">${tag}</span>`).join('');
  document.title = `${profile.name} Blog · ${profile.title}`;
}

function renderStats() {
  $('#postCount').textContent = state.posts.length;
  $('#viewCount').textContent = formatNumber(state.posts.reduce((sum, post) => sum + post.views, 0));
  $('#likeCount').textContent = formatNumber(state.posts.reduce((sum, post) => sum + post.likes, 0));
  $('#commentCount').textContent = state.posts.reduce((sum, post) => sum + post.commentsCount, 0);
}

function renderFilters() {
  $('#categoryFilters').innerHTML = ['all', ...state.categories].map(category => `
    <button type="button" class="filter ${category === state.category ? 'active' : ''}" data-category="${category}">${category === 'all' ? '全部' : category}</button>
  `).join('');
}

function postCard(post) {
  return `
    <article class="post-card reveal" data-slug="${post.slug}">
      <div class="post-cover" style="background-image:url('${post.cover}')"></div>
      <div class="post-body">
        <div class="post-meta"><span>${post.category}</span><span>${formatDate(post.createdAt)} · ${post.readingMinutes} 分钟</span></div>
        <h3>${post.title}</h3>
        <p>${post.excerpt}</p>
        <div class="tag-row">${post.tags.map(tag => `<span class="tag">#${tag}</span>`).join('')}</div>
        <div class="card-actions">
          <button class="button primary" type="button" data-open="${post.slug}">阅读文章</button>
          <button class="button ghost" type="button" data-like="${post.slug}">♥ ${post.likes}</button>
          <span class="tag">👁 ${formatNumber(post.views)}</span>
        </div>
      </div>
    </article>`;
}

function renderPosts() {
  const grid = $('#postsGrid');
  grid.innerHTML = state.posts.length ? state.posts.map(postCard).join('') : '<p class="hero-lead">没有找到匹配的文章。</p>';
  observeReveal();
}

async function loadPosts() {
  const params = new URLSearchParams({ q: state.query, category: state.category });
  const data = await api(`/api/posts?${params}`);
  state.posts = data.posts;
  state.categories = data.categories;
  renderStats();
  renderFilters();
  renderPosts();
}

function paragraphs(text) {
  return text.split(/\n+/).filter(Boolean).map(item => `<p>${item}</p>`).join('');
}

async function openPost(slug) {
  const post = await api(`/api/posts/${slug}`);
  $('#dialogContent').innerHTML = `
    <div class="dialog-hero" style="background-image:url('${post.cover}')">
      <p class="eyebrow">${post.category}</p>
      <h2>${post.title}</h2>
      <p>${post.excerpt}</p>
    </div>
    <div class="dialog-body">
      ${paragraphs(post.content)}
      <div class="tag-row">${post.tags.map(tag => `<span class="tag">#${tag}</span>`).join('')}</div>
      <form class="comment-form" data-comment-form="${post.slug}">
        <input name="author" placeholder="你的名字">
        <input name="message" placeholder="写一句评论..." required>
        <button class="button primary" type="submit">发送</button>
      </form>
      <div>${(post.comments || []).map(comment => `<div class="comment"><strong>${comment.author}</strong> · ${formatDate(comment.createdAt)}<br>${comment.message}</div>`).join('') || '<p class="comment">还没有评论，来抢沙发。</p>'}</div>
    </div>`;
  $('#postDialog').showModal();
  await loadPosts();
}

async function likePost(slug, button) {
  button.disabled = true;
  const result = await api(`/api/posts/${slug}/like`, { method: 'POST' });
  button.textContent = `♥ ${result.likes}`;
  await loadPosts();
}

function observeReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.12 });
  $$('.reveal').forEach(item => observer.observe(item));
}

function bindInteractions() {
  $('#themeToggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  });
  $('#searchInput').addEventListener('input', event => {
    state.query = event.target.value;
    clearTimeout(window.searchTimer);
    window.searchTimer = setTimeout(loadPosts, 180);
  });
  document.addEventListener('click', event => {
    const filter = event.target.closest('[data-category]');
    if (filter) { state.category = filter.dataset.category; loadPosts(); }
    const open = event.target.closest('[data-open]');
    if (open) openPost(open.dataset.open);
    const like = event.target.closest('[data-like]');
    if (like) likePost(like.dataset.like, like);
    if (event.target.matches('[data-close]')) $('#postDialog').close();
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-comment-form]');
    if (!form) return;
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form));
    await api(`/api/posts/${form.dataset.commentForm}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    openPost(form.dataset.commentForm);
  });
  document.addEventListener('mousemove', event => {
    $('.cursor-glow').style.left = `${event.clientX}px`;
    $('.cursor-glow').style.top = `${event.clientY}px`;
  });
  window.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    $('#readProgress').style.width = `${Math.min(100, (scrollY / max) * 100)}%`;
  });
  $$('.magnetic').forEach(button => button.addEventListener('mousemove', event => {
    const rect = button.getBoundingClientRect();
    button.style.transform = `translate(${(event.clientX - rect.left - rect.width / 2) * .08}px, ${(event.clientY - rect.top - rect.height / 2) * .08}px)`;
  }));
  $$('.magnetic').forEach(button => button.addEventListener('mouseleave', () => button.style.transform = ''));
}

async function boot() {
  document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark';
  bindInteractions();
  observeReveal();
  renderProfile(await api('/api/profile'));
  await loadPosts();
}

boot().catch(error => {
  $('#postsGrid').innerHTML = `<p class="hero-lead">加载失败：${error.message}</p>`;
});
