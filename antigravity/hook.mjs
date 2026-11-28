/**
 * Antigravity lifecycle hook for dsh-characard (`SessionStart` & `PreInvocation`).
 *
 * Responsibilities:
 *   1. On `SessionStart`, injects the active persona's prompt text as a system message.
 *   2. On `PreInvocation`, tracks the per-conversation persona fingerprint so that
 *      editing, switching, or disabling a persona mid-conversation takes effect on the
 *      very next reply without starting a new session.
 *   3. When the active persona has `thinking: true`, injects the compact in-character
 *      thinking reminder on step 1 and every 8 invocations (`reminderDue`).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readState } from "../src/store.js";
import { promptFingerprint, promptText, reminderDue, thinkingReminder } from "../src/prompt.js";

const MAX_TRACKED_SESSIONS = 64;

function sessionStorePath() {
  const base = (process.env.CHARACARD_PLUGIN_DATA || process.env.PLUGIN_DATA || "").trim() || os.tmpdir();
  return path.join(base, "characard-hook-sessions.json");
}

function loadSessions(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveSessions(file, sessions) {
  const entries = Object.entries(sessions);
  const pruned =
    entries.length > MAX_TRACKED_SESSIONS
      ? Object.fromEntries(entries.sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0)).slice(0, MAX_TRACKED_SESSIONS))
      : sessions;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(pruned), { encoding: "utf8", mode: 0o600 });
    try {
      fs.renameSync(tmp, file);
    } catch {
      fs.copyFileSync(tmp, file);
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

export function evaluateHook(payload, { state = readState(), sessionFile = sessionStorePath() } = {}) {
  const event = String((payload && payload.hookEventName) || "PreInvocation");
  const conversationId = String((payload && payload.conversationId) || "__default__");
  const invocationNum = payload && typeof payload.invocationNum === "number" ? payload.invocationNum : undefined;

  const prompt = promptText(state);
  const fingerprint = promptFingerprint(prompt);
  const sessions = loadSessions(sessionFile);
  const previous = sessions[conversationId];
  const injectSteps = [];

  if (event === "SessionStart") {
    if (prompt) {
      injectSteps.push({ systemMessage: { systemMessage: prompt } });
    }
    sessions[conversationId] = { fingerprint, ts: Date.now() };
    saveSessions(sessionFile, sessions);
    return injectSteps.length > 0 ? { injectSteps } : {};
  }

  // PreInvocation: inject if never injected in this session, or if persona changed/disabled.
  const prevFp = previous ? previous.fingerprint : undefined;
  let updatedSession = false;

  if (prevFp === undefined) {
    if (prompt) {
      injectSteps.push({ systemMessage: { systemMessage: prompt } });
    }
    sessions[conversationId] = { fingerprint, ts: Date.now() };
    updatedSession = true;
  } else if (prevFp !== fingerprint) {
    if (prompt) {
      injectSteps.push({
        systemMessage: {
          systemMessage: `【人设已更新】当前启用的人设已切换或修改，请从下一条回复开始严格按照以下最新设定执行：\n\n${prompt}`,
        },
      });
    } else {
      injectSteps.push({
        systemMessage: {
          systemMessage: "【人设已关闭】用户已关闭当前角色人设。请从下一条回复开始退出角色扮演，恢复正常的默认助手身份与语气。",
        },
      });
    }
    sessions[conversationId] = { fingerprint, ts: Date.now() };
    updatedSession = true;
  }

  if (updatedSession) {
    saveSessions(sessionFile, sessions);
  }

  // Periodic in-character thinking reminder when `thinking: true`.
  const reminder = thinkingReminder(state);
  if (reminder && reminderDue(invocationNum)) {
    injectSteps.push({ systemMessage: { systemMessage: reminder } });
  }

  return injectSteps.length > 0 ? { injectSteps } : {};
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  const payload = raw ? JSON.parse(raw) : {};
  const result = evaluateHook(payload);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((error) => {
    console.error("[dsh-characard hook]", error);
    process.stdout.write("{}\n");
    process.exit(0);
  });
}
