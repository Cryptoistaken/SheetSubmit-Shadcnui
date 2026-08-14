// Telegram bot — ported from the old server (webhook on public URL, long-poll fallback).
import { APP_URL, TG_BOT_TOKEN } from "../config/env";
import { generateToken } from "../lib/ids";
import { delKey, getJSON, setJSON, setJSONex } from "./redis";

const TG_API = "https://api.telegram.org/bot" + TG_BOT_TOKEN;

export let botUsername = "";

interface TgJson {
  ok: boolean;
  result?: any;
  description?: string;
  error_code?: number;
}

export async function tg(method: string, body?: unknown): Promise<TgJson> {
  const bodyStr = body !== undefined ? JSON.stringify(body).slice(0, 200) : "(no body)";
  console.log("[Bot] tg." + method + " body=" + bodyStr);
  const opts: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(TG_API + "/" + method, opts);
  const json = (await res.json()) as TgJson;
  if (json.ok) {
    console.log("[Bot] tg." + method + " → ok=" + json.ok);
  } else {
    console.log(
      "[Bot] tg." + method + " → ok=" + json.ok +
      " error_code=" + json.error_code + " description=\"" + json.description + "\"",
    );
  }
  return json;
}

interface TgUpdate {
  update_id: number;
  message?: { chat: { id: number }; text?: string; message_id?: number };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id?: number };
  };
}

export async function handleBotUpdate(update: TgUpdate): Promise<void> {
  console.log(
    "[Bot] update id=" + update.update_id +
    " from=" + (update.message ? update.message.chat.id : update.callback_query ? update.callback_query.message?.chat.id : "?"),
  );
  if (update.message && update.message.text) {
    const msg = update.message;
    const text = msg.text!;
    if (text === "/start" || text.startsWith("/start ")) {
      const payload = (text.split(" ")[1] || "").trim();
      if (payload.indexOf("login_") === 0) {
        const did = payload.slice(6);
        if (/^[A-Za-z0-9-]{8,64}$/.test(did)) {
          await setJSONex("didchat:" + msg.chat.id, { did }, 900000);
          console.log("[Bot] device login requested chatId=" + msg.chat.id + " did=" + did.slice(0, 8) + "...");
        }
      }
      await tg("sendMessage", {
        chat_id: msg.chat.id,
        text: "Welcome to Sheet Submit. Tap the button below to log in:",
        reply_markup: {
          inline_keyboard: [[{ text: "Login", callback_data: "login" }]],
        },
      });
    } else if (text === "/myid") {
      await tg("sendMessage", { chat_id: msg.chat.id, text: "Your Telegram ID: " + msg.chat.id });
    }
  }
  if (update.callback_query) {
    const cb = update.callback_query;
    if (cb.data === "login" && cb.message) {
      const token = generateToken();
      let url = APP_URL + "/api/auth/telegram?token=" + token;
      const loginReq: Record<string, unknown> = { chatId: cb.message.chat.id };
      const didChat = await getJSON<{ did: string }>("didchat:" + cb.message.chat.id);
      if (didChat && didChat.did) {
        loginReq.did = didChat.did;
        url += "&device=" + didChat.did;
        await delKey("didchat:" + cb.message.chat.id);
      }
      await setJSONex("login:" + token, loginReq, 900000);
      await tg("editMessageText", {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: "Login link ready:",
        reply_markup: {
          inline_keyboard: [
            [{ text: "Open URL", url }],
            [{ text: "Copy URL", copy_text: { text: url } }],
          ],
        },
      });
      await tg("answerCallbackQuery", { callback_query_id: cb.id });
    }
  }
}

// Start the bot: set webhook when a public URL exists, else long-poll locally.
export async function startBot(): Promise<void> {
  try {
    const info = await tg("getMe");
    if (!info.ok) throw new Error("getMe failed");
    botUsername = info.result.username;
    console.log("[Bot] @" + botUsername + " id=" + info.result.id);
    await setJSON("bot:info", { username: botUsername });

    const hasPublicUrl = !!(process.env.RAILWAY_PUBLIC_DOMAIN || process.env.APP_URL);
    let usingWebhook = false;
    if (hasPublicUrl) {
      const webhookUrl = APP_URL + "/webhook/tg";
      const result = await tg("setWebhook", { url: webhookUrl, allowed_updates: ["message", "callback_query"] });
      if (result.ok) {
        usingWebhook = true;
        console.log("[Bot] Webhook set to " + webhookUrl);
      } else {
        console.log("[Bot] Webhook failed, falling back to polling: " + (result.description || ""));
      }
    }

    if (!usingWebhook) {
      await tg("deleteWebhook");
      console.log("[Bot] No public URL, using long-polling");
      let pollingOffset = 0;
      const poll = async (): Promise<void> => {
        try {
          const data = await tg("getUpdates", { offset: pollingOffset, timeout: 30, allowed_updates: ["message", "callback_query"] });
          if (data.ok && data.result) {
            if (data.result.length > 0) console.log("[Bot] received " + data.result.length + " update(s)");
            for (const update of data.result as TgUpdate[]) {
              pollingOffset = update.update_id + 1;
              await handleBotUpdate(update);
            }
          }
        } catch (e) {
          console.error("[Bot] Poll err:", (e as Error).message);
        }
        setTimeout(poll, 2000);
      };
      poll();
    }
  } catch (e) {
    console.error("[Bot] init error:", (e as Error).message);
    setTimeout(() => {
      void startBot();
    }, 10000);
  }
}

export function isBotEnabled(): boolean {
  return !!TG_BOT_TOKEN;
}
