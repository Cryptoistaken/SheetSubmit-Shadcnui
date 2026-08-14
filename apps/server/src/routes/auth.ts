// Auth routes — ported from the old server (API contract unchanged).
import { Router } from "express";
import { TG_BOT_TOKEN as BOT_TOKEN } from "../config/env";
import { generateToken } from "../lib/ids";
import { delKey, getJSON, redis, setJSON, setJSONex } from "../services/redis";
import { tg } from "../services/telegram";
import { getSessionId, invalidateSession, isAdmin } from "../middleware/auth";

export const authRouter = Router();

// Telegram login callback (device/login link → session cookie)
authRouter.get("/telegram", async (req, res) => {
  const token = String(req.query.token || "");
  if (!token) {
    res.status(400).send("Missing token");
    return;
  }
  console.log("[Auth] login callback with token=" + token.slice(0, 8) + "...");

  const loginData = await getJSON<{ chatId: string; did?: string }>("login:" + token);
  if (!loginData) {
    console.log("[Auth] invalid token");
    res.status(400).send("Invalid or expired token");
    return;
  }

  console.log("[Auth] login for chatId=" + loginData.chatId);
  let userInfo: { id: string; firstName: string; lastName: string; username: string; fileId: string | null } | null = null;
  try {
    const chatRes = await tg("getChat", { chat_id: loginData.chatId });
    if (chatRes.ok && chatRes.result) {
      userInfo = {
        id: loginData.chatId,
        firstName: chatRes.result.first_name || "",
        lastName: chatRes.result.last_name || "",
        username: chatRes.result.username || "",
        fileId: null,
      };
      try {
        const photosRes = await tg("getUserProfilePhotos", { user_id: loginData.chatId, limit: 1 });
        if (photosRes.ok && photosRes.result && photosRes.result.photos.length > 0) {
          userInfo.fileId = photosRes.result.photos[0][photosRes.result.photos[0].length - 1].file_id;
        }
      } catch {
        // ignore photo lookup failure
      }
    }
  } catch {
    // ignore getChat failure
  }

  if (!userInfo) {
    console.log("[Auth] failed to get user info");
    res.status(500).send("Failed to get user info");
    return;
  }

  console.log("[Auth] user=" + (userInfo.username || userInfo.firstName) + " id=" + userInfo.id);

  const existing = (await getJSON<Record<string, unknown>>("user:" + userInfo.id)) || {};
  const merged: Record<string, unknown> = {
    id: userInfo.id,
    firstName: userInfo.firstName,
    lastName: userInfo.lastName,
    username: userInfo.username,
    fileId: userInfo.fileId || existing.fileId || null,
    lastLogin: Date.now(),
  };
  await setJSON("user:" + userInfo.id, merged);
  await redis.sadd("ss:userIds", String(userInfo.id));

  const sessionId = generateToken();
  await setJSONex("session:" + sessionId, { userId: userInfo.id }, 2592000000);
  await delKey("login:" + token);

  if (loginData.did && /^[A-Za-z0-9-]{8,64}$/.test(loginData.did)) {
    await setJSONex("device:" + loginData.did, { sessionId }, 3600000);
    console.log("[Auth] session bound to device " + loginData.did.slice(0, 8) + "...");
  }

  res.setHeader("Set-Cookie", "session=" + sessionId + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000");
  console.log("[Auth] session created, redirecting");

  void tg("sendMessage", {
    chat_id: loginData.chatId,
    text:
      "<b>Login Successful</b>\n\nHey @" + (userInfo.username || userInfo.firstName) +
      ", you are signed in to SheetSubmit.\n\nIf this was not you, contact the admin immediately.",
    parse_mode: "HTML",
  });

  res.redirect("/");
});

// Serve the Telegram profile photo for a user
authRouter.get("/photo/:userId", async (req, res) => {
  const user = await getJSON<{ fileId?: string }>("user:" + req.params.userId);
  if (!user || !user.fileId) {
    res.status(404).end();
    return;
  }
  try {
    const fileRes = await tg("getFile", { file_id: user.fileId });
    if (fileRes.ok && fileRes.result) {
      res.redirect("https://api.telegram.org/file/bot" + BOT_TOKEN + "/" + fileRes.result.file_path);
    } else {
      res.status(404).end();
    }
  } catch {
    res.status(500).end();
  }
});

authRouter.get("/logout", async (req, res) => {
  const sessionId = getSessionId(req);
  console.log("[Auth] logout session=" + (sessionId ? sessionId.slice(0, 8) + "..." : "none"));
  if (sessionId) {
    await delKey("session:" + sessionId);
    invalidateSession(sessionId);
  }
  res.setHeader("Set-Cookie", "session=; Path=/; HttpOnly; Max-Age=0");
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    res.json(null);
    return;
  }
  const session = await getJSON<{ userId: string | number }>("session:" + sessionId);
  if (!session) {
    console.log("[Auth] me: session expired");
    res.json(null);
    return;
  }
  const user = await getJSON<Record<string, any>>("user:" + session.userId);
  if (user) {
    user.photoUrl = user.fileId ? "/api/auth/photo/" + user.id : null;
    user.isAdmin = isAdmin(user.id);
  }
  console.log(
    "[Auth] me: user=" + (user ? user.username || user.firstName || user.id : "null") +
    " admin=" + (user ? user.isAdmin : false),
  );
  res.json(user || null);
});

// Device login poll (used by the Android WebView app)
authRouter.get("/device", async (req, res) => {
  const did = String(req.query.token || "").trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(did)) {
    res.json({ ok: false });
    return;
  }
  const info = await getJSON<{ sessionId?: string }>("device:" + did);
  if (!info || !info.sessionId) {
    res.json({ ok: false });
    return;
  }
  await delKey("device:" + did);
  console.log("[Auth] device " + did.slice(0, 8) + "... picked up session");
  res.json({ ok: true, sessionId: info.sessionId });
});
