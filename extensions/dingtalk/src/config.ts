/**
 * DingTalk channel configuration types
 */

export interface DingtalkConfig {
  /** 是否启用钉钉渠道 */
  enabled?: boolean;

  /** 钉钉应用 Client ID (AppKey) */
  clientId: string;

  /** 钉钉应用 Client Secret (AppSecret) */
  clientSecret: string;

  /** 钉钉机器人 Robot Code */
  robotCode?: string;

  /** DM 策略配置 */
  dm?: {
    /** DM 访问策略: open=开放, pairing=配对, allowlist=白名单 */
    policy?: "open" | "pairing" | "allowlist";
    /** 允许私聊的用户 ID 列表 */
    allowFrom?: string[];
  };

  /** 群配置 */
  groups?: {
    [groupIdOrName: string]: {
      /** 是否需要 @ 触发 */
      requireMention?: boolean;
      /** 是否启用 */
      enabled?: boolean;
    };
  };

  /** 群策略: open=开放, allowlist=白名单 */
  groupPolicy?: "open" | "allowlist";
}

export interface DingtalkAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  config: DingtalkConfig;
  credentialSource: "config" | "env" | "none";
}

/**
 * 钉钉消息事件数据结构
 */
export interface DingtalkMessageEvent {
  /** 消息 ID */
  msgId: string;
  /** 消息类型 */
  msgtype: string;
  /** 会话 ID */
  conversationId: string;
  /** 会话类型: 1=单聊, 2=群聊 */
  conversationType: "1" | "2";
  /** 发送者企业内部 ID */
  senderStaffId?: string;
  /** 发送者 Union ID */
  senderId: string;
  /** 发送者昵称 */
  senderNick: string;
  /** 发送者企业 ID */
  senderCorpId?: string;
  /** 会话标题（群名） */
  conversationTitle?: string;
  /** 是否在 @ 列表中 */
  isInAtList?: boolean;
  /** 文本消息内容 */
  text?: {
    content: string;
  };
  /** 创建时间戳 */
  createAt?: number;
  /** 机器人代码 */
  robotCode?: string;
  /** Session Webhook */
  sessionWebhook?: string;
  /** Session Webhook 过期时间 */
  sessionWebhookExpiredTime?: number;
}
