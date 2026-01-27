/**
 * DingTalk Stream client wrapper
 */

import { DWClient, EventAck, type DWClientDownStream } from "dingtalk-stream";
import type { DingtalkConfig, DingtalkMessageEvent } from "./config.js";

export type MessageHandler = (event: DingtalkMessageEvent) => Promise<void>;

export interface StreamClientOptions {
  config: DingtalkConfig;
  onMessage: MessageHandler;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * 钉钉 Stream 客户端封装
 */
export class DingtalkStreamClient {
  private client: DWClient | null = null;
  private options: StreamClientOptions;
  private running = false;

  constructor(options: StreamClientOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    const { config, onMessage, onError, onConnect, onDisconnect } = this.options;

    this.client = new DWClient({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    // 注册机器人消息回调
    this.client.registerCallbackListener(
      "/v1.0/im/bot/messages/get",
      (event: DWClientDownStream) => {
        (async () => {
          try {
            const data = JSON.parse(event.data) as DingtalkMessageEvent;
            await onMessage(data);
          } catch (err) {
            onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        })();
      }
    );

    // 注册全局事件监听
    this.client.registerAllEventListener((event: DWClientDownStream) => {
      return { status: EventAck.SUCCESS };
    });

    // 注册连接状态事件
    this.client.on("connect", () => {
      this.running = true;
      onConnect?.();
    });

    this.client.on("disconnect", () => {
      this.running = false;
      onDisconnect?.();
    });

    await this.client.connect();
  }

  disconnect(): void {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.client = null;
    }
    this.running = false;
    this.options.onDisconnect?.();
  }

  isRunning(): boolean {
    return this.running;
  }
}
