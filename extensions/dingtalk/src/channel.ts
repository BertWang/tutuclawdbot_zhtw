/**
 * DingTalk channel plugin implementation
 * 
 * This is a simplified implementation that can be extended later.
 */

import {
  getChatChannelMeta,
  DEFAULT_ACCOUNT_ID,
  type ChannelDock,
  type ChannelPlugin,
  type ClawdbotConfig,
} from "clawdbot/plugin-sdk";

import type { DingtalkConfig, DingtalkAccount, DingtalkMessageEvent } from "./config.js";
import { sendMessageViaWebhook, sendMessage, sendDirectMessage } from "./api.js";
import { DingtalkStreamClient } from "./stream-client.js";
import { getDingtalkRuntime } from "./runtime.js";

const meta = getChatChannelMeta("dingtalk");

/**
 * 解析钉钉账户配置
 */
function resolveDingtalkAccount(params: {
  cfg: ClawdbotConfig;
  accountId?: string;
}): DingtalkAccount {
  const { cfg, accountId = DEFAULT_ACCOUNT_ID } = params;
  const channelConfig = cfg.channels?.["dingtalk"] as DingtalkConfig | undefined;

  if (!channelConfig) {
    return {
      accountId,
      enabled: false,
      config: {} as DingtalkConfig,
      credentialSource: "none",
    };
  }

  // 检查凭证来源
  let credentialSource: "config" | "env" | "none" = "none";
  if (channelConfig.clientId && channelConfig.clientSecret) {
    credentialSource = "config";
  } else if (process.env.DINGTALK_CLIENT_ID && process.env.DINGTALK_CLIENT_SECRET) {
    credentialSource = "env";
  }

  // 合并环境变量配置
  const config: DingtalkConfig = {
    ...channelConfig,
    clientId: channelConfig.clientId || process.env.DINGTALK_CLIENT_ID || "",
    clientSecret: channelConfig.clientSecret || process.env.DINGTALK_CLIENT_SECRET || "",
    robotCode: channelConfig.robotCode || process.env.DINGTALK_ROBOT_CODE,
  };

  return {
    accountId,
    enabled: channelConfig.enabled !== false,
    config,
    credentialSource,
  };
}

/**
 * 渠道 Dock 定义
 */
export const dingtalkDock: ChannelDock = {
  id: "dingtalk",
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    media: true,
    threads: false,
    blockStreaming: true,
  },
  outbound: { textChunkLimit: 4000 },
  config: {
    resolveAllowFrom: ({ cfg, accountId }: { cfg: unknown; accountId?: string }) =>
      (resolveDingtalkAccount({ cfg: cfg as ClawdbotConfig, accountId }).config.dm?.allowFrom ?? [])
        .map((entry: string) => String(entry)),
    formatAllowFrom: ({ allowFrom }: { allowFrom: string[] }) =>
      allowFrom.map((entry: string) => String(entry).trim()).filter(Boolean),
  },
  groups: {
    resolveRequireMention: ({ cfg, groupId }: { cfg: unknown; groupId: string }) => {
      const account = resolveDingtalkAccount({ cfg: cfg as ClawdbotConfig });
      const groups = account.config.groups ?? {};
      const groupConfig = groups[groupId] ?? groups["*"];
      return groupConfig?.requireMention ?? true;
    },
  },
};

// 用于存储会话的 Session Webhook
const sessionWebhooks = new Map<string, { webhook: string; expiresAt: number }>();

/**
 * 渠道插件定义
 */
export const dingtalkPlugin: ChannelPlugin<DingtalkAccount> = {
  id: "dingtalk",
  meta: { ...meta },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: true,
    nativeCommands: false,
    blockStreaming: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1000, idleMs: 800 },
  },
  reload: { configPrefixes: ["channels.dingtalk"] },
  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount: (cfg: unknown, accountId?: string) =>
      resolveDingtalkAccount({ cfg: cfg as ClawdbotConfig, accountId }),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account: DingtalkAccount) => account.credentialSource !== "none",
    describeAccount: (account: DingtalkAccount) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.credentialSource !== "none",
      credentialSource: account.credentialSource,
    }),
    resolveAllowFrom: ({ cfg, accountId }: { cfg: unknown; accountId?: string }) =>
      (resolveDingtalkAccount({ cfg: cfg as ClawdbotConfig, accountId }).config.dm?.allowFrom ?? [])
        .map((entry: string) => String(entry)),
    formatAllowFrom: ({ allowFrom }: { allowFrom: string[] }) =>
      allowFrom.map((entry: string) => String(entry).trim()).filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ account }: { account: DingtalkAccount }) => ({
      policy: account.config.dm?.policy ?? "open",
      allowFrom: account.config.dm?.allowFrom ?? [],
      allowFromPath: "channels.dingtalk.dm.",
      approveHint: "钉钉用户 ID",
      normalizeEntry: (raw: string) => raw.trim(),
    }),
    collectWarnings: ({ account }: { account: DingtalkAccount }) => {
      const warnings: string[] = [];
      const groupPolicy = account.config.groupPolicy ?? "open";
      if (groupPolicy === "open") {
        warnings.push(
          `- 钉钉群: groupPolicy="open" 允许任何群触发（@ 触发）。建议设置 channels.dingtalk.groupPolicy="allowlist"。`
        );
      }
      if (account.config.dm?.policy === "open") {
        warnings.push(
          `- 钉钉私聊对所有人开放。建议设置 channels.dingtalk.dm.policy="pairing" 或 "allowlist"。`
        );
      }
      return warnings;
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, groupId }: { cfg: unknown; groupId: string }) => {
      const account = resolveDingtalkAccount({ cfg: cfg as ClawdbotConfig });
      const groups = account.config.groups ?? {};
      const groupConfig = groups[groupId] ?? groups["*"];
      return groupConfig?.requireMention ?? true;
    },
  },
  messaging: {
    normalizeTarget: (target: string | null | undefined) => target?.trim() || null,
    targetResolver: {
      looksLikeId: (raw: string) => Boolean(raw?.trim()),
      hint: "<conversationId>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text: string, limit: number) =>
      getDingtalkRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    resolveTarget: ({ to, allowFrom, mode }: { to?: string; allowFrom?: string[]; mode?: string }) => {
      const trimmed = to?.trim() ?? "";
      if (trimmed) {
        return { ok: true as const, to: trimmed };
      }
      const allowList = (allowFrom ?? [])
        .map((entry: string) => String(entry).trim())
        .filter((entry: string) => entry && entry !== "*");
      if (allowList.length > 0) {
        return { ok: true as const, to: allowList[0] };
      }
      if (mode === "implicit" || mode === "heartbeat") {
        return { ok: false as const, error: "没有指定目标，请设置 channels.dingtalk.dm.allowFrom" };
      }
      return { ok: false as const, error: "请指定钉钉会话 ID" };
    },
    sendText: async ({ cfg, to, text, accountId }: { cfg: unknown; to: string; text: string; accountId?: string }) => {
      const account = resolveDingtalkAccount({ cfg: cfg as ClawdbotConfig, accountId });
      
      // 优先使用 Session Webhook（更快，且保证在同一会话）
      const sessionKey = `dingtalk:${to}`;
      const cached = sessionWebhooks.get(sessionKey);
      if (cached && cached.expiresAt > Date.now()) {
        await sendMessageViaWebhook({ sessionWebhook: cached.webhook, text });
        return { channel: "dingtalk", messageId: "", chatId: to };
      }

      // 回退到 OpenAPI
      const isDirectMessage = !to.includes("cid");
      if (isDirectMessage) {
        const result = await sendDirectMessage({ config: account.config, userId: to, text });
        return { channel: "dingtalk", messageId: result.messageId, chatId: to };
      } else {
        const result = await sendMessage({ config: account.config, conversationId: to, text });
        return { channel: "dingtalk", messageId: result.messageId, chatId: to };
      }
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts: Array<{ accountId?: string; enabled?: boolean; configured?: boolean; clientId?: string; clientSecret?: string }>) =>
      accounts.flatMap((entry) => {
        const accountId = String(entry.accountId ?? DEFAULT_ACCOUNT_ID);
        const enabled = entry.enabled !== false;
        const configured = entry.configured === true;
        if (!enabled || !configured) return [];
        const issues: Array<{ channel: string; accountId: string; kind: string; message: string; fix: string }> = [];
        if (!entry.clientId) {
          issues.push({
            channel: "dingtalk",
            accountId,
            kind: "config",
            message: "钉钉 clientId 未配置",
            fix: "设置 channels.dingtalk.clientId 或 DINGTALK_CLIENT_ID 环境变量",
          });
        }
        if (!entry.clientSecret) {
          issues.push({
            channel: "dingtalk",
            accountId,
            kind: "config",
            message: "钉钉 clientSecret 未配置",
            fix: "设置 channels.dingtalk.clientSecret 或 DINGTALK_CLIENT_SECRET 环境变量",
          });
        }
        return issues;
      }),
    buildChannelSummary: ({ snapshot }: { snapshot: Record<string, unknown> }) => ({
      configured: snapshot.configured ?? false,
      credentialSource: snapshot.credentialSource ?? "none",
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }: { account: DingtalkAccount; runtime?: Record<string, unknown> }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.credentialSource !== "none",
      credentialSource: account.credentialSource,
      clientId: account.config.clientId ? "***" : undefined,
      robotCode: account.config.robotCode,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
      dmPolicy: account.config.dm?.policy ?? "open",
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account as DingtalkAccount;
      const config = account.config;

      if (!config.clientId || !config.clientSecret) {
        throw new Error("钉钉 clientId 和 clientSecret 必须配置");
      }

      ctx.log?.info(`[dingtalk] 启动 Stream 客户端`);

      const streamClient = new DingtalkStreamClient({
        config,
        onMessage: async (event: DingtalkMessageEvent) => {
          await handleIncomingMessage(ctx, account, event);
        },
        onError: (error: Error) => {
          ctx.log?.error(`[dingtalk] Stream 错误: ${error.message}`);
          ctx.setStatus({
            accountId: account.accountId,
            lastError: error.message,
          });
        },
        onConnect: () => {
          ctx.log?.info(`[dingtalk] Stream 已连接`);
        },
        onDisconnect: () => {
          ctx.log?.warn(`[dingtalk] Stream 已断开`);
        },
      });

      await streamClient.start();

      ctx.setStatus({
        accountId: account.accountId,
        running: true,
        lastStartAt: Date.now(),
        lastError: null,
      });

      return () => {
        streamClient.disconnect();
        ctx.setStatus({
          accountId: account.accountId,
          running: false,
          lastStopAt: Date.now(),
        });
      };
    },
  },
};

/**
 * 处理入站消息
 */
async function handleIncomingMessage(
  ctx: Parameters<NonNullable<ChannelPlugin["gateway"]>["startAccount"]>[0],
  account: DingtalkAccount,
  event: DingtalkMessageEvent
): Promise<void> {
  const isGroup = event.conversationType === "2";
  const userId = event.senderStaffId || event.senderId;
  const text = event.text?.content?.trim() || "";

  // 忽略空消息
  if (!text) return;

  // 群消息检查 @ 触发
  if (isGroup) {
    const requireMention = dingtalkPlugin.groups?.resolveRequireMention?.({
      cfg: ctx.cfg,
      groupId: event.conversationId,
    }) ?? true;
    
    if (requireMention && !event.isInAtList) {
      return;
    }
  }

  // 缓存 Session Webhook 用于快速回复
  if (event.sessionWebhook && event.sessionWebhookExpiredTime) {
    const sessionKey = `dingtalk:${event.conversationType}:${event.conversationId}`;
    sessionWebhooks.set(sessionKey, {
      webhook: event.sessionWebhook,
      expiresAt: event.sessionWebhookExpiredTime,
    });
  }

  ctx.setStatus({
    accountId: account.accountId,
    lastInboundAt: Date.now(),
  });

  // 处理入站消息
  await ctx.runtime.gateway.processInbound({
    channel: "dingtalk",
    accountId: account.accountId,
    sessionKey: `dingtalk:${event.conversationType}:${event.conversationId}`,
    from: userId,
    fromName: event.senderNick,
    chatId: event.conversationId,
    chatType: isGroup ? "group" : "direct",
    messageId: event.msgId,
    text,
    timestamp: event.createAt ?? Date.now(),
    // 存储 Session Webhook 用于回复
    replyContext: event.sessionWebhook
      ? {
          sessionWebhook: event.sessionWebhook,
          expiresAt: event.sessionWebhookExpiredTime,
        }
      : undefined,
  });
}
