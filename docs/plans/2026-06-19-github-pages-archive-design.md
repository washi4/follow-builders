# GitHub Pages 摘要归档设计

## 目标

在现有 Telegram 推送之外，增加一个可公开浏览的 GitHub Pages 归档页，让用户可以按日期查看历史摘要。

## 方案概览

保留现有主链路不变：
1. `generate-feed.js` 继续更新 feed。
2. `prepare-digest.js` 继续组装输入 JSON。
3. `remix-digest.js` 使用百炼生成最终摘要。
4. `deliver.js` 继续负责 Telegram 推送。

在此基础上新增一条并行输出：
1. 同一份摘要 JSON 再生成一份静态 HTML。
2. HTML 按日期归档。
3. GitHub Pages 发布该静态站点。

## 页面结构

采用两层结构：

### 首页
- 按日期倒序列出每日摘要
- 显示当天更新时间
- 点击进入当天详情页

### 每日详情页
- 顶部显示日期和更新时间
- 下面分为 X / Blogs / Podcasts 三个区块
- 每条内容保留标题、要点和原始链接
- 保持手机端可读性，避免复杂交互

## 数据流

建议将页面生成和 Telegram 推送复用同一份中间结果，避免双写内容：

1. `prepare-digest.js` 输出准备好的 JSON。
2. `remix-digest.js` 生成最终摘要文本。
3. 额外的页面生成器基于同一 JSON 产出 HTML。
4. GitHub Action 同时：
   - 发送 Telegram
   - 更新 Pages 输出目录

这样 Telegram 和网页展示会保持一致。

## 发布方式

优先使用 `docs/` 目录 + GitHub Pages：
- 最简单
- 不需要额外分支
- 适合按日期归档的静态内容

GitHub Action 可以在每次生成摘要后更新 `docs/` 下的静态文件并提交到主分支，再由 Pages 发布。

## 风险与约束

- 需要确保页面生成和 Telegram 文本使用同一份输入，避免内容不一致。
- 页面应保持纯静态，避免引入额外交互层。
- 归档页只做浏览，不承担摘要生成逻辑。

## 下一步

如果要继续实现，建议先补一个静态页面生成脚本，再把 GitHub Pages 发布接到现有 Action 上。
