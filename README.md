# wxrank-mcp

wxrank 微信公众号数据 MCP Server，技术栈 `TypeScript + Zod`，已封装 12 个可直接调用的 MCP tools。

## 1. MCP 安装与接入（npm 方式）

### 环境要求

- Node.js >= 20
- pnpm >= 9（推荐 10+）

### 作为 npm 包接入 MCP（推荐）

发布到 npm 后，MCP 客户端里直接使用 `npx` 启动：

```json
{
  "mcpServers": {
    "wxrank": {
      "command": "npx",
      "args": ["-y", "wxrank-mcp"],
      "env": {
        "WXRANK_API_KEY": "你的wxrank密钥"
      }
    }
  }
}
```

如果你后续发布的是 scope 包名（比如 `@your-scope/wxrank-mcp`），把 `args` 改成：

```json
{
  "mcpServers": {
    "wxrank": {
      "command": "npx",
      "args": ["-y", "@your-scope/wxrank-mcp"],
      "env": {
        "WXRANK_API_KEY": "你的wxrank密钥"
      }
    }
  }
}
```

### 本地开发安装（仅开发者）

```bash
pnpm install
pnpm build
```

本地调试时也可以用 `node` 指向构建产物：

```json
{
  "mcpServers": {
    "wxrank-local": {
      "command": "node",
      "args": ["/Users/vincent/Documents/workspace/code/personal/baobao/wxrank-mcp/dist/index.js"],
      "env": {
        "WXRANK_API_KEY": "你的wxrank密钥"
      }
    }
  }
}
```

可选环境变量：

- `WXRANK_KEY`：`WXRANK_API_KEY` 的别名
- `WXRANK_BASE_URL`：默认 `http://data.wxrank.com`

## 2. 使用文档

### 本地运行

开发模式：

```bash
pnpm dev
```

生产模式：

```bash
pnpm build
pnpm start
```

### 常用调用方式

- 推荐把密钥放在 MCP 配置 `env` 里，这样调用 tool 时可以不传 `key`
- 若你想显式传密钥，所有工具也都支持 `key` 参数

### 快速验证（冒烟测试）

注意：以下会真实请求 wxrank 并消耗积分。

```bash
# 方式1：使用环境变量
export WXRANK_API_KEY="你的key"
pnpm run smoke

# 方式2：命令行传参
pnpm run smoke -- --key "你的key" --wxid "gh_3037fb937d57"
```

可选参数：

- `--base-url`：接口域名，默认 `http://data.wxrank.com`
- `--month`：用于 `artlist`，格式 `YYYYMM`，默认当前月份

## 3. 工具列表与作用

1. `wxrank_get_article_metrics`
   作用：获取单篇文章的阅读、点赞、在看、分享、收藏等互动数据。  
   对应接口：`/weixin/getrk`

2. `wxrank_get_account_posts`
   作用：按微信号/原始ID获取公众号推文列表（长链）。  
   对应接口：`/weixin/getps`

3. `wxrank_search_accounts`
   作用：按关键词搜索公众号列表。  
   对应接口：`/weixin/getsu`

4. `wxrank_search_articles`
   作用：按关键词搜索搜一搜文章，支持排序和分页。  
   对应接口：`/weixin/getso`

5. `wxrank_get_article_content`
   作用：解析文章内容页，返回文章基础信息、正文文本、HTML 等。  
   对应接口：`/weixin/artinfo`

6. `wxrank_get_article_comments`
   作用：获取文章留言（一级留言/回复列表两种模式）。  
   对应接口：`/weixin/getcm`

7. `wxrank_get_original_id_by_biz`
   作用：根据 `biz` 反查公众号原始ID。  
   对应接口：`/weixin/getinfo`

8. `wxrank_get_account_info_by_biz`
   作用：根据 `biz` 获取公众号基本资料。  
   对应接口：`/weixin/getbiz`

9. `wxrank_get_article_page_data`
   作用：获取文章内容页数据（含阅读等核心指标）。  
   对应接口：`/weixin/artdata`

10. `wxrank_get_account_posts_by_biz`
    作用：根据 `biz` 获取推文列表（短链模式）。  
    对应接口：`/weixin/getpc`

11. `wxrank_get_daily_hot_articles`
    作用：获取每日爆文离线列表，支持按日期、月份、分类、阅读区间等筛选。  
    对应接口：`/weixin/artlist`

12. `wxrank_get_remaining_score`
    作用：查询当前账号剩余积分。  
    对应接口：`/weixin/score`

## 4. 质量检查

```bash
pnpm run format
pnpm run lint
pnpm run typecheck
# 或
pnpm run check
```
