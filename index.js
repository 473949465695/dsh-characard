/**
 * dsh-characard — DSH host half.
 *
 * Thin Cordis adapter over the shared modular core in `./src/`:
 *   - injects the active persona into `systemPrompt.section`
 *   - appends periodic in-character thinking reminders in `agent/pre-step`
 *   - exposes the loopback-only HTTP bridge (`/api/dsh-characard/*`) for `client.js`
 */
import {
  BRIDGE,
  EMPTY_STATE,
  MAX_BODY_BYTES,
  MAX_IMAGE_BODY_BYTES,
  MAX_IMPORT_BODY_BYTES,
  TEXT_FIELDS,
  normalizeImages,
  normalizeState,
} from "./src/schema.js";
import {
  activatePersonaOp,
  deletePersonaOp,
  exportPersonasOp,
  importPersonasOp,
  readState,
  removeImageOp,
  savePersonaOp,
  setImageOp,
  viewOf,
} from "./src/store.js";
import { promptText, reminderDue, reminderMessage, thinkingReminder } from "./src/prompt.js";
import { cardDescription, fromCharacterCard, parseImport, toCharacterCardV3 } from "./src/card.js";

function isLoopbackRequest(request) {
  const address = request.socket && request.socket.remoteAddress;
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
  const rawHost = request.headers ? request.headers.host : undefined;
  if (typeof rawHost !== "string" || !rawHost) return false;
  let host;
  try {
    host = new URL(`http://${rawHost}`);
  } catch {
    return false;
  }
  const hostname = host.hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "::1" && hostname !== "[::1]") {
    return false;
  }
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !origin) return true;
  try {
    return new URL(origin).host === host.host;
  } catch {
    return false;
  }
}

function writeJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  response.end(payload);
}

async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) return undefined;
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed !== null && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function replyState(response, state, extra = {}) {
  writeJson(response, 200, { ok: true, ...extra, value: viewOf(state), active: Boolean(promptText(state)) });
}

function replyOp(response, result, extra = {}) {
  if (!result.ok) {
    writeJson(response, result.status || 400, { ok: false, message: result.message });
    return;
  }
  replyState(response, result.state, extra);
}

function guarded(handler) {
  return async (request, response) => {
    if (!isLoopbackRequest(request)) {
      writeJson(response, 403, { ok: false, message: "loopback requests only" });
      return;
    }
    if (request.method !== "POST") {
      writeJson(response, 405, { ok: false, message: "POST only" });
      return;
    }
    try {
      await handler(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[dsh-characard] bridge failure:", error);
      if (!response.headersSent) writeJson(response, 500, { ok: false, message });
    }
  };
}

function badBody(response) {
  writeJson(response, 400, { ok: false, message: "malformed JSON body" });
}

function makeRoutes() {
  return [
    {
      kind: "exact",
      path: `${BRIDGE}/get`,
      handler: guarded(async (_request, response) => {
        replyState(response, readState());
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/save`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request);
        if (body === undefined) return badBody(response);
        const result = savePersonaOp(body);
        replyOp(response, result, result.ok ? { personaId: result.personaId } : undefined);
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/activate`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request);
        if (body === undefined) return badBody(response);
        replyOp(response, activatePersonaOp(body.id, body.enabled));
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/delete`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request);
        if (body === undefined) return badBody(response);
        replyOp(response, deletePersonaOp(body.id));
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/image`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request, MAX_IMAGE_BODY_BYTES);
        if (body === undefined) return badBody(response);
        replyOp(response, setImageOp(body));
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/image-remove`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request);
        if (body === undefined) return badBody(response);
        replyOp(response, removeImageOp(body.id, body.slot));
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/import`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request, MAX_IMPORT_BODY_BYTES);
        if (body === undefined) return badBody(response);
        const result = importPersonasOp(body.data, body.mode);
        if (!result.ok) {
          writeJson(response, result.status || 400, { ok: false, message: result.message });
          return;
        }
        replyState(response, result.state, {
          imported: result.imported,
          ...(result.converted ? { converted: result.converted } : {}),
        });
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/export`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request);
        if (body === undefined) return badBody(response);
        const result = exportPersonasOp(body);
        if (!result.ok) {
          writeJson(response, result.status || 400, { ok: false, message: result.message });
          return;
        }
        writeJson(response, 200, result);
      }),
    },
  ];
}

export function apply(ctx) {
  ctx.inject(["systemPrompt"], (promptCtx) => {
    promptCtx.effect(() => {
      const dispose = promptCtx.systemPrompt.section({
        name: "persona:profile",
        order: 30,
        text: () => {
          try {
            return promptText(readState());
          } catch (error) {
            console.warn("[dsh-characard] cannot read the persona library:", error);
            return "";
          }
        },
      });
      return dispose;
    }, "persona: system prompt section");
  });

  if (typeof ctx.effect === "function" && typeof ctx.on === "function") {
    ctx.effect(() => {
      const dispose = ctx.on(
        "agent/pre-step",
        async (payload, next) => {
          const decision = await next();
          if (decision.kind !== "enter") return decision;
          let text = "";
          try {
            text = thinkingReminder(readState());
          } catch (error) {
            console.warn("[dsh-characard] cannot read the persona library:", error);
            return decision;
          }
          if (!text || !reminderDue(payload.step)) return decision;
          return { ...decision, messages: [...decision.messages, reminderMessage(text)] };
        },
        { prepend: true },
      );
      return () => dispose();
    }, "persona: thinking reminder");
  }

  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => {
      const disposers = makeRoutes().map((route) => webCtx.webServer.register(route));
      return () => {
        for (const dispose of disposers) {
          try {
            dispose();
          } catch {
            /* already gone */
          }
        }
      };
    }, "persona: settings bridge");
  });
}

/** Internal hooks for smoke tests. Not part of the plugin contract. */
export const __test = {
  normalizeState,
  parseImport,
  promptText,
  thinkingReminder,
  reminderDue,
  reminderMessage,
  normalizeImages,
  fromCharacterCard,
  toCharacterCardV3,
  cardDescription,
  EMPTY_STATE,
  TEXT_FIELDS,
};
