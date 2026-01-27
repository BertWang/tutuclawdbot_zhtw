import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk";
import { emptyPluginConfigSchema } from "clawdbot/plugin-sdk";

import { dingtalkPlugin, dingtalkDock } from "./src/channel.js";
import { setDingtalkRuntime } from "./src/runtime.js";

const plugin = {
  id: "dingtalk",
  name: "DingTalk",
  description: "Clawdbot DingTalk channel plugin (Stream mode)",
  configSchema: emptyPluginConfigSchema(),
  register(api: ClawdbotPluginApi) {
    setDingtalkRuntime(api.runtime);
    api.registerChannel({ plugin: dingtalkPlugin, dock: dingtalkDock });
  },
};

export default plugin;
