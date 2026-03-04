#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

type RequestMethod = "GET" | "POST";
type JsonRecord = Record<string, unknown>;

type WxrankApiResponse = {
  code: number;
  msg?: string;
  data?: unknown;
  [key: string]: unknown;
};

const server = new McpServer({
  name: "wxrank-mcp",
  version: "1.0.0",
});

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const keyInputSchema = z
  .string()
  .min(1)
  .optional()
  .describe("可选。若不传，自动读取环境变量 WXRANK_API_KEY 或 WXRANK_KEY。");

const wxrankOutputSchema = {
  code: z.number().describe("wxrank 接口状态码，0 表示成功。"),
  msg: z.string().optional().describe("wxrank 返回说明，例如“剩余875积分”。"),
  data: z.unknown().optional().describe("wxrank 返回数据体。"),
};

function resolveApiKey(toolKey?: string): string {
  const key = toolKey ?? process.env.WXRANK_API_KEY ?? process.env.WXRANK_KEY;
  if (!key) {
    throw new Error("缺少 API Key：请在工具参数传 key，或设置环境变量 WXRANK_API_KEY/WXRANK_KEY。");
  }

  return key;
}

function stripUndefined(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function buildTextResult(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function parsePossiblyDirtyJson(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch (firstError) {
    let changed = false;
    const sanitized = Array.from(rawText)
      .filter((char) => {
        const code = char.charCodeAt(0);
        const isInvalidControl = code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d;
        if (isInvalidControl) {
          changed = true;
          return false;
        }
        return true;
      })
      .join("");
    if (sanitized === rawText) {
      throw firstError;
    }
    if (!changed) {
      throw firstError;
    }
    return JSON.parse(sanitized);
  }
}

async function requestWxrank(
  endpoint: string,
  params: JsonRecord,
  method: RequestMethod = "POST",
): Promise<WxrankApiResponse> {
  const baseUrl = process.env.WXRANK_BASE_URL ?? "http://data.wxrank.com";
  const url = new URL(endpoint, baseUrl);

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const init: RequestInit = { method, headers };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  } else {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(params);
  }

  const response = await fetch(url, init);
  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(
      `wxrank 请求失败（HTTP ${response.status} ${response.statusText}）：${rawText.slice(0, 500)}`,
    );
  }

  let parsed: unknown = null;
  try {
    parsed = parsePossiblyDirtyJson(rawText);
  } catch {
    throw new Error(`wxrank 响应不是合法 JSON：${rawText.slice(0, 500)}`);
  }

  if (!parsed || typeof parsed !== "object" || !("code" in parsed)) {
    throw new Error(`wxrank 返回结构不符合预期：${buildTextResult(parsed)}`);
  }

  return parsed as WxrankApiResponse;
}

async function callWxrankWithKey(
  endpoint: string,
  input: JsonRecord & { key?: string | undefined },
  method: RequestMethod = "POST",
): Promise<WxrankApiResponse> {
  const { key, ...rest } = input;
  const payload = stripUndefined({
    key: resolveApiKey(typeof key === "string" ? key : undefined),
    ...rest,
  });
  return requestWxrank(endpoint, payload, method);
}

function toToolResult(response: WxrankApiResponse) {
  return {
    content: [{ type: "text" as const, text: buildTextResult(response) }],
    structuredContent: response,
  };
}

server.registerTool(
  "wxrank_get_article_metrics",
  {
    title: "获取文章阅读互动数据",
    description: "对应接口 /weixin/getrk。实时获取公众号文章的阅读、点赞、在看、分享、收藏等数据。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
      url: z.string().min(1).describe("公众号文章长链接。"),
      comment_id: z
        .string()
        .min(1)
        .optional()
        .describe("可选。留言ID，传入后可返回 comment_count。"),
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => toToolResult(await callWxrankWithKey("/weixin/getrk", input)),
);

server.registerTool(
  "wxrank_get_account_posts",
  {
    title: "获取公众号推文列表",
    description: "对应接口 /weixin/getps。根据微信号或原始ID实时获取公众号推文列表（长链）。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
      wxid: z.string().min(1).describe("微信号或原始ID（gh开头）。"),
      cursor: z.string().min(1).optional().describe("可选。分页游标，有效期约24小时。"),
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => toToolResult(await callWxrankWithKey("/weixin/getps", input)),
);

server.registerTool(
  "wxrank_search_accounts",
  {
    title: "搜索公众号列表",
    description: "对应接口 /weixin/getsu。按关键词实时搜索公众号。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
      keyword: z.string().min(1).describe("搜索关键词。"),
      page: z.number().int().min(1).optional().describe("可选。页码，默认1。"),
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => toToolResult(await callWxrankWithKey("/weixin/getsu", input)),
);

server.registerTool(
  "wxrank_search_articles",
  {
    title: "搜一搜文章列表",
    description: "对应接口 /weixin/getso。按关键词实时搜索搜一搜文章列表。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
      keyword: z.string().min(1).describe("搜索关键词。"),
      sort_type: z
        .union([z.literal(0), z.literal(2), z.literal(4)])
        .optional()
        .describe("可选。排序：0不限（默认）、2最新、4最热。"),
      page: z.number().int().min(1).optional().describe("可选。页码，默认1。"),
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => toToolResult(await callWxrankWithKey("/weixin/getso", input)),
);

server.registerTool(
  "wxrank_get_article_content",
  {
    title: "获取文章内容",
    description: "对应接口 /weixin/artinfo。实时获取公众号文章内容（支持长链和短链）。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
      url: z.string().min(1).describe("公众号文章链接（长链或短链）。"),
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => toToolResult(await callWxrankWithKey("/weixin/artinfo", input)),
);

server.registerTool(
  "wxrank_get_article_comments",
  {
    title: "获取文章留言",
    description:
      "对应接口 /weixin/getcm。默认返回一级留言列表；传 content_id 与 max_reply_id 时返回指定一级留言的回复列表。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
      comment_id: z.string().min(1).describe("文章留言ID。"),
      buffer: z.string().min(1).optional().describe("可选。一级留言分页游标。"),
      content_id: z
        .string()
        .min(1)
        .optional()
        .describe("可选。一级留言中的 content_id，传入后进入回复查询模式。"),
      max_reply_id: z
        .string()
        .min(1)
        .optional()
        .describe("可选。一级留言中的 reply_new.max_reply_id。"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("可选。回复列表偏移量，首页通常为0，第二页为100。"),
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => {
    const hasReplyParam = input.content_id !== undefined || input.max_reply_id !== undefined;
    if (hasReplyParam && (!input.content_id || !input.max_reply_id)) {
      throw new Error("回复查询模式下，content_id 和 max_reply_id 必须同时提供。");
    }
    return toToolResult(await callWxrankWithKey("/weixin/getcm", input));
  },
);

server.registerTool(
  "wxrank_get_original_id_by_biz",
  {
    title: "根据 biz 获取原始ID",
    description: "对应接口 /weixin/getinfo。根据 biz 获取公众号原始ID。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
      biz: z.string().min(1).describe("公众号 biz。"),
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => toToolResult(await callWxrankWithKey("/weixin/getinfo", input)),
);

server.registerTool(
  "wxrank_get_account_info_by_biz",
  {
    title: "根据 biz 获取公众号基本信息",
    description: "对应接口 /weixin/getbiz。根据 biz 查询公众号基础资料。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
      biz: z.string().min(1).describe("公众号 biz。"),
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => toToolResult(await callWxrankWithKey("/weixin/getbiz", input)),
);

server.registerTool(
  "wxrank_get_article_page_data",
  {
    title: "获取文章内容页（含阅读数）",
    description: "对应接口 /weixin/artdata。实时获取文章详情数据，包含阅读/点赞等指标。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
      url: z.string().min(1).describe("公众号文章长链接。"),
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => toToolResult(await callWxrankWithKey("/weixin/artdata", input)),
);

server.registerTool(
  "wxrank_get_account_posts_by_biz",
  {
    title: "根据 biz 获取推文列表（短链）",
    description: "对应接口 /weixin/getpc。根据 biz 获取公众号推文列表（返回短链）。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
      biz: z.string().min(1).describe("公众号 biz。"),
      begin: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("可选。开始位置，默认0。每页返回5次推文。"),
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => toToolResult(await callWxrankWithKey("/weixin/getpc", input)),
);

server.registerTool(
  "wxrank_get_daily_hot_articles",
  {
    title: "获取公众号每日爆文列表（离线）",
    description:
      "对应接口 /weixin/artlist。支持按日期、月份、公众号 biz、阅读区间、关键词和分类筛选。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
      date: z
        .string()
        .regex(/^\d{8}$/)
        .optional()
        .describe("可选。日期，格式 yyyymmdd，例如 20250401。"),
      month: z
        .string()
        .regex(/^\d{6}$/)
        .optional()
        .describe("可选。年月，格式 yyyymm，例如 202601。"),
      wx_biz: z.string().min(1).optional().describe("可选。按公众号 biz 筛选。"),
      min_read_num: z.number().int().min(0).optional().describe("可选。最低阅读数。"),
      max_read_num: z.number().int().min(0).optional().describe("可选。最高阅读数。"),
      keyword: z.string().min(1).optional().describe("可选。标题/内容关键词。"),
      wx_type: z.string().min(1).optional().describe("可选。分类，例如“时事”“科技”“教育”等。"),
      cursor: z.string().min(1).optional().describe("可选。分页游标，有效期约5分钟。"),
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => {
    if (
      input.min_read_num !== undefined &&
      input.max_read_num !== undefined &&
      input.min_read_num > input.max_read_num
    ) {
      throw new Error("min_read_num 不能大于 max_read_num。");
    }
    return toToolResult(await callWxrankWithKey("/weixin/artlist", input));
  },
);

server.registerTool(
  "wxrank_get_remaining_score",
  {
    title: "获取剩余积分",
    description: "对应接口 /weixin/score。查询当前账号剩余积分。",
    annotations: readOnlyAnnotations,
    inputSchema: {
      key: keyInputSchema,
    },
    outputSchema: wxrankOutputSchema,
  },
  async (input) => toToolResult(await callWxrankWithKey("/weixin/score", input, "GET")),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("wxrank MCP server is running on stdio.");
}

main().catch((error: unknown) => {
  console.error("Failed to start wxrank MCP server:", error);
  process.exit(1);
});
