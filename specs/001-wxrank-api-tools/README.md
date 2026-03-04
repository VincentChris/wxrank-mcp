---
status: complete
created: 2026-03-04
priority: high
tags:
  - mcp
  - wxrank
  - api
created_at: 2026-03-04T14:23:17.525219Z
updated_at: 2026-03-04T14:37:11.113792Z
completed_at: 2026-03-04T14:37:11.113792Z
transitions:
  - status: complete
    at: 2026-03-04T14:37:11.113792Z
---

# 实现 wxrank 12 个 MCP tools（TypeScript + Zod）

> **Status**: complete · **Priority**: high · **Created**: 2026-03-04

## Overview

为 wxrank 微信公众号数据平台实现 MCP Server，覆盖用户提供的 12 个 ShowDoc 接口。

目标：

- 以 `TypeScript + Zod` 实现稳定、可组合的工具层
- 为每个接口提供独立 tool，统一输入校验与错误处理
- 满足项目约束：`pnpm` 管理依赖，`oxlint + oxfmt` 作为代码质量门禁

接口来源（ShowDoc page_id）：

- 11133589262825168 `/weixin/getrk`
- 10443033518139228 `/weixin/getps`
- 11237245421816827 `/weixin/getsu`
- 11231390880949074 `/weixin/getso`
- 11558501783383049 `/weixin/artinfo`
- 11558939511765045 `/weixin/getcm`
- 11558548757005308 `/weixin/getinfo`
- 11558807527291160 `/weixin/getbiz`
- 11559057185115206 `/weixin/artdata`
- 11558736212306816 `/weixin/getpc`
- 11558648128103099 `/weixin/artlist`
- 11234130303288760 `/weixin/score`

## Design

架构方案：

- 使用 `@modelcontextprotocol/sdk` 的 `McpServer` + `StdioServerTransport`
- 所有工具统一通过 `requestWxrank` 发起 HTTP 请求
- 输入层通过 Zod 做参数校验；输出统一为 `{ code, msg, data }`
- API key 支持两种来源：
  - tool 参数 `key`
  - 环境变量 `WXRANK_API_KEY` / `WXRANK_KEY`

关键实现点：

- `callWxrankWithKey`：统一注入 key，减少每个 tool 的重复逻辑
- `stripUndefined`：清理未传字段，避免污染请求体
- `wxrank_get_article_comments`：兼容一级留言与回复模式（`content_id + max_reply_id`）
- `wxrank_get_daily_hot_articles`：增加 `min_read_num <= max_read_num` 约束校验

实现文件：

- `src/index.ts`：MCP 服务、12 个 tool 注册、请求封装、运行入口
- `package.json`：脚本与依赖（pnpm + oxlint + oxfmt + ts）
- `tsconfig.json`：严格模式编译配置
- `README.md`：运行说明与 tool 映射

## Plan

- [x] 用 `lean-spec init` 初始化项目规范目录
- [x] 拉取并解析 12 个 ShowDoc 接口文档内容
- [x] 创建并完善实现 spec（本文件）
- [x] 搭建 TypeScript MCP 服务骨架
- [x] 实现 12 个 wxrank 接口 tools
- [x] 接入 `pnpm` 脚本、`oxlint`、`oxfmt`
- [x] 完成 `format + lint + typecheck + build` 验证

## Test

- [x] `pnpm run format` 通过
- [x] `pnpm run lint` 通过（0 warning / 0 error）
- [x] `pnpm run typecheck` 通过
- [x] `pnpm run build` 通过
- [x] `node dist/index.js` 可启动并输出 `wxrank MCP server is running on stdio.`

## Notes

补充说明：

- ShowDoc 页面本身为 SPA 壳，直接抓页面拿不到接口正文；通过
  `https://www.showdoc.com.cn/server/index.php?s=/api/page/info`
  携带 `item_id + page_id + Referer` 可拿到完整文档内容。
- wxrank 大多数接口支持 GET/POST；当前实现默认使用 POST JSON，
  积分查询 `/weixin/score` 使用 GET。
