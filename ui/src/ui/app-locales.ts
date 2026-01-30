import type { ClawdbotApp } from "./app";
import { setLocale as setLocaleGlobal } from "./locales";
import { saveSettings } from "./storage";

export function setLocale(state: Pick<ClawdbotApp, "settings" | "applySettings">, locale: "en" | "zh-TW") {
    const next = { ...state.settings, locale };
    saveSettings(next);
    setLocaleGlobal(locale);
    state.applySettings(next);
}
