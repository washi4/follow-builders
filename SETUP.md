# Setup — 我的 follow-builders 骨架

这份文档记录了把这个 skill 改造成"你自己的混合自建版"的配置方式。
设计原则：**零成本**，博客+播客自己抓（免费独立），X 数据白嫖作者 feed。

---

## 架构总览

```
你的 fork（GitHub Actions，每天免费跑）
   ├─ generate-feed.js 抓博客（HTML 爬虫，免费，已独立）✅
   ├─ generate-feed.js 抓播客（缺 POD2TXT_API_KEY，自动跳过）
   └─ generate-feed.js 抓 X（缺 X_BEARER_TOKEN，自动跳过）
        ↓ 生成 feed-blogs.json（你的）
        ↓ feed-x.json / feed-podcasts.json 仍是作者版本

prepare-digest.js（本地 agent 跑）
   ├─ 博客 feed：优先你的 fork，没有就回退作者
   ├─ 播客 feed：优先你的 fork，没有就回退作者
   └─ X feed：优先你的 fork，没有就回退作者
        ↓ 输出 JSON，由 LLM remix 成摘要
```

**关键设计**：每个 feed 独立回退。你 fork 没抓的，自动用作者的，摘要不断档。

---

## 一次性配置（fork 之后）

### 1. 指向你的 fork

在 `~/.follow-builders/config.json`（或环境变量）里设置你的 fork 仓库：

```bash
# 方式 A：环境变量（推荐，改一处生效）
echo 'export FB_FORK_REPO=你的用户名/follow-builders' >> ~/.zshrc
source ~/.zshrc

# 方式 B：config.json（如果已存在）
# 在 config.json 加一行："forkRepo": "你的用户名/follow-builders"
```

不设置的话，所有 feed 都回退到作者仓库（等同白嫖模式，博客自建不生效）。

### 2. 启用 GitHub Actions

fork 后默认 Actions 是**关闭**的，需要手动开：
1. 打开你的 fork 仓库 → **Actions** 标签页
2. 点绿色按钮 **"I understand my workflows, go ahead and enable them"**
3. 之后每天 06:17 UTC（北京时间 14:17）自动跑一次

> Public 仓库 Actions 免费、无分钟限制。**建议 fork 设为 public**。
> 如果设 private，每月 2000 免费 minutes（实际只用 ~90，够用）。

### 3. 验证 Actions 跑通

Actions 页面 → **Generate Feeds** workflow → 右侧 **Run workflow** → 选 `all` → 运行。
跑完后看 commit 历史，应该有 `chore: update feeds [skip ci]`，且你的仓库里
`feed-blogs.json` 有内容（X/podcast 因为没配 key 会跳过，属正常）。

---

## 后续加自己的数据源

### 🟢 加博客（免费，立刻见效，最推荐）

`config/default-sources.json` 的 `blogs` 数组加一条：
```json
{
  "name": "博客名",
  "type": "scrape",
  "indexUrl": "https://example.com/blog",
  "articleBaseUrl": "https://example.com/blog/",
  "fetchMethod": "http"
}
```

然后在 `scripts/generate-feed.js` 写两个函数（仿照 `parseAnthropicEngineeringIndex`
和 `extractAnthropicArticleContent`）：
- `parseXxxIndex(html)` — 从索引页提取文章链接列表
- `extractXxxContent(html)` — 从文章页提取正文

并在 `fetchBlogContent` 里加一个分支判断（`if (blog.indexUrl.includes("example.com"))`）。
提交后 GitHub Actions 会自动抓。

### 🟡 换播客转录源（中等工作量，去掉对 pod2txt 的依赖）

现状：播客转录依赖作者的 `POD2TXT_API_KEY`，你 fork 没这个 key，播客 feed
回退作者版本（仍能用，只是不算你独立）。

想独立的话，改 `fetchPod2txtTranscript`，换成 **YouTube 字幕**（免费稳定）：
代码里已有 `fetchYouTubeVideos` / `parseYouTubeFeed` 骨架，扩展成抓 transcript 即可。
大部分 AI 播客都同步发 YouTube。

### 🔴 X 数据（保持白嫖作者）

X 官方 API 2026 已改为 pay-per-use（约 $5/月），不在零成本范围内。
继续回退作者 feed 是最优分工——作者付了钱，你白嫖一个 HTTP 请求。

---

## 改摘要风格

`prompts/` 下 5 个 markdown 直接编辑，或放到 `~/.follow-builders/prompts/`
覆盖（优先级：用户自定义 > 远程 > 本地默认）。

---

## 排查

| 现象 | 原因 | 处理 |
|------|------|------|
| Actions 没自动跑 | fork 默认禁用 Actions | Actions 页手动 enable |
| feed-blogs.json 是空的 | 首次跑时所有文章已被作者 state 标记为 seen | 删掉你 fork 的 `state-feed.json`，重跑 |
| 摘要里 X 内容是旧的 | 作者 feed 未更新，或网络问题 | 检查 `stats.feedSources` 字段看数据来源 |
| 想完全用作者数据 | 没设 `FB_FORK_REPO` | 设了才会优先读你的 fork |
