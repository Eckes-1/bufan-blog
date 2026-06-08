# Bufan Blog

一个动态个人博客雏形：包含沉浸式前台、文章详情弹窗、搜索筛选、点赞评论，以及可进行文章 CRUD 的博客管理后台。项目不依赖外部框架，使用 Node.js 原生 HTTP 服务和 JSON 文件持久化，适合作为继续接入数据库、登录系统和部署流水线的起点。

## 功能亮点

- **动态前台**：首页通过 `/api/profile` 和 `/api/posts` 实时读取数据，而不是构建期生成静态 HTML。
- **互动体验**：支持分类筛选、即时搜索、阅读弹窗、阅读进度条、主题切换、点赞和评论。
- **管理后台**：访问 `/admin` 后可新建、编辑、删除文章，并管理发布状态、精选状态、分类、标签、摘要与封面。
- **视觉动效**：玻璃拟态、星云背景、滚动揭示、旋转光环、悬浮卡片、磁吸按钮和鼠标光晕。
- **可迁移数据层**：当前数据保存在 `data/blogs.json`，API 边界清晰，后续可替换为 SQLite、PostgreSQL 或其他数据库。

## 快速开始

```bash
npm start
```

启动后打开：

- 前台：http://localhost:3000
- 后台：http://localhost:3000/admin

默认后台演示令牌是 `bufan-admin`。生产环境请设置环境变量：

```bash
ADMIN_TOKEN="your-strong-token" npm start
```

## 测试

```bash
npm test
```

## 项目结构

```text
server.js            # HTTP 服务、静态资源服务、动态 API 与后台 API
data/blogs.json      # 个人资料、文章、点赞、评论等持久化数据
public/index.html    # 前台页面
public/admin.html    # 管理后台页面
public/styles.css    # 全站视觉、动画与响应式样式
public/app.js        # 前台动态交互逻辑
public/admin.js      # 后台 CRUD 交互逻辑
test/server.test.js  # API 与管理流程测试
```
