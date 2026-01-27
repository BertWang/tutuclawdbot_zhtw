/**
 * DingTalk OpenAPI client
 */

import type { DingtalkConfig } from "./config.js";

const DINGTALK_OPENAPI_BASE = "https://api.dingtalk.com";

interface AccessTokenCache {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, AccessTokenCache>();

/**
 * 获取钉钉 Access Token
 */
export async function getAccessToken(config: DingtalkConfig): Promise<string> {
  const cacheKey = `${config.clientId}`;
  const cached = tokenCache.get(cacheKey);
  
  // 如果缓存有效（提前5分钟过期）
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }

  const response = await fetch(`${DINGTALK_OPENAPI_BASE}/v1.0/oauth2/accessToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      appKey: config.clientId,
      appSecret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get DingTalk access token: ${response.status} ${error}`);
  }

  const data = await response.json() as { accessToken: string; expireIn: number };
  const token = data.accessToken;
  const expiresAt = Date.now() + data.expireIn * 1000;

  tokenCache.set(cacheKey, { token, expiresAt });
  return token;
}

/**
 * 发送钉钉消息（通过 Session Webhook）
 */
export async function sendMessageViaWebhook(params: {
  sessionWebhook: string;
  text: string;
}): Promise<void> {
  const { sessionWebhook, text } = params;

  const response = await fetch(sessionWebhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      msgtype: "text",
      text: {
        content: text,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send DingTalk message: ${response.status} ${error}`);
  }
}

/**
 * 发送钉钉消息（通过 OpenAPI）
 */
export async function sendMessage(params: {
  config: DingtalkConfig;
  conversationId: string;
  text: string;
}): Promise<{ messageId: string }> {
  const { config, conversationId, text } = params;
  const accessToken = await getAccessToken(config);

  // 使用机器人发送消息到群
  const response = await fetch(`${DINGTALK_OPENAPI_BASE}/v1.0/robot/groupMessages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": accessToken,
    },
    body: JSON.stringify({
      robotCode: config.robotCode,
      openConversationId: conversationId,
      msgKey: "sampleText",
      msgParam: JSON.stringify({ content: text }),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send DingTalk message: ${response.status} ${error}`);
  }

  const data = await response.json() as { processQueryKey?: string };
  return { messageId: data.processQueryKey || "" };
}

/**
 * 发送钉钉单聊消息
 */
export async function sendDirectMessage(params: {
  config: DingtalkConfig;
  userId: string;
  text: string;
}): Promise<{ messageId: string }> {
  const { config, userId, text } = params;
  const accessToken = await getAccessToken(config);

  const response = await fetch(`${DINGTALK_OPENAPI_BASE}/v1.0/robot/oToMessages/batchSend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": accessToken,
    },
    body: JSON.stringify({
      robotCode: config.robotCode,
      userIds: [userId],
      msgKey: "sampleText",
      msgParam: JSON.stringify({ content: text }),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send DingTalk direct message: ${response.status} ${error}`);
  }

  const data = await response.json() as { processQueryKey?: string };
  return { messageId: data.processQueryKey || "" };
}
