/**
 * Antigravity MCP App server for dsh-characard (zero external runtime dependencies).
 *
 * Speaks MCP JSON-RPC 2.0 over stdio (newline-delimited JSON) and serves:
 *   - UI resource `ui://dsh-characard/app.html` (`text/html;profile=mcp-app`)
 *   - Model + UI entrypoint tool `open_personas` (inline, side pane `+`, and sidebar)
 *   - Model tools `list_personas`, `get_active_persona`, `switch_persona`
 *   - App-only CRUD tools (`app_*`, visibility: ["app"]) for the interactive UI
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { FRAMES_PER_PAGE, MAX_PAGES, activePersona, findPersona } from "../src/schema.js";
import {
  activatePersonaOp,
  deletePersonaOp,
  exportPersonasOp,
  imageViews,
  importPersonasOp,
  profileDir,
  readState,
  removeImageOp,
  savePersonaOp,
  setImageOp,
  viewOf,
} from "../src/store.js";
import { promptText } from "../src/prompt.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP_URI = "ui://dsh-characard/app.html";
export const APP_MIME = "text/html;profile=mcp-app";
const SERVER_INFO = Object.freeze({ name: "dsh-characard", version: "2.0.0" });

const APP_ONLY_META = Object.freeze({ ui: { visibility: ["app"] } });

export const TOOLS = Object.freeze([
  {
    name: "open_personas",
    title: "人设 / Persona",
    description:
      "Open the interactive Character Card (Persona) board UI to create, edit, upload photos, switch active persona, or import/export Tavern cards.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer", minimum: 0, maximum: MAX_PAGES - 1, description: "Optional 0-based page index." },
      },
      additionalProperties: false,
    },
    _meta: {
      ui: { resourceUri: APP_URI },
      "com.google.antigravity/ui": {
        entrypoints: [
          { type: "aux_pane", title: "人设 / Persona" },
          { type: "global", title: "人设 / Persona" },
        ],
      },
    },
  },
  {
    name: "list_personas",
    title: "List Personas",
    description: "List all saved character personas in the library and show which one is currently active.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_active_persona",
    title: "Get Active Persona",
    description: "Return the currently active persona's details and rendered system prompt text.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "switch_persona",
    title: "Switch Active Persona",
    description:
      "Activate a saved persona by id or name (only one persona is active at a time), or turn off all personas with enabled=false.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Persona id to activate or deactivate." },
        name: { type: "string", description: "Persona name to match if id is omitted." },
        enabled: { type: "boolean", description: "Set false to turn off the active persona. Defaults to true." },
      },
      additionalProperties: false,
    },
  },
  // --- App-only tools (hidden from the model; called by the UI iframe) ---
  {
    name: "app_get_state",
    title: "Get Persona Board State",
    description: "Read the persona library and load photos for the requested page.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer", minimum: 0, maximum: MAX_PAGES - 1 },
      },
      additionalProperties: false,
    },
    _meta: APP_ONLY_META,
  },
  {
    name: "app_save_persona",
    title: "Save Persona",
    description: "Create or update a persona.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        bio: { type: "string" },
        likes: { type: "string" },
        relations: { type: "string" },
        appearance: { type: "string" },
        userRelation: { type: "string" },
        specialty: { type: "string" },
        style: { type: "string" },
        rules: { type: "string" },
        thinking: { type: "boolean" },
        page: { type: "integer" },
      },
    },
    _meta: APP_ONLY_META,
  },
  {
    name: "app_activate_persona",
    title: "Activate Persona",
    description: "Turn a persona on or off.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        enabled: { type: "boolean" },
        page: { type: "integer" },
      },
      required: ["id"],
    },
    _meta: APP_ONLY_META,
  },
  {
    name: "app_delete_persona",
    title: "Delete Persona",
    description: "Delete a persona and its photos.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        page: { type: "integer" },
      },
      required: ["id"],
    },
    _meta: APP_ONLY_META,
  },
  {
    name: "app_set_image",
    title: "Set Persona Photo",
    description: "Save a base64 photo for a persona slot.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        slot: { type: "integer" },
        dataUrl: { type: "string" },
        page: { type: "integer" },
      },
      required: ["id", "slot", "dataUrl"],
    },
    _meta: APP_ONLY_META,
  },
  {
    name: "app_remove_image",
    title: "Remove Persona Photo",
    description: "Remove a persona's photo from a slot.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        slot: { type: "integer" },
        page: { type: "integer" },
      },
      required: ["id", "slot"],
    },
    _meta: APP_ONLY_META,
  },
  {
    name: "app_import",
    title: "Import Personas",
    description: "Import a DSH bundle or Tavern chara_card_v1/v2/v3 JSON.",
    inputSchema: {
      type: "object",
      properties: {
        data: {},
        mode: { type: "string", enum: ["append", "replace"] },
        page: { type: "integer" },
      },
      required: ["data"],
    },
    _meta: APP_ONLY_META,
  },
  {
    name: "app_export",
    title: "Export Personas",
    description: "Export the library (DSH format) or a single Tavern V3 character card.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["dsh", "v3"] },
        id: { type: "string" },
      },
    },
    _meta: APP_ONLY_META,
  },
]);

/** Builds a page-scoped UI view so photo payloads never bloat large libraries. */
function pagedViewOf(state, page = 0) {
  const safePage = Number.isInteger(page) && page >= 0 && page < MAX_PAGES ? page : 0;
  const start = safePage * FRAMES_PER_PAGE;
  const end = start + FRAMES_PER_PAGE;
  return {
    version: 3,
    activeId: state.activeId,
    dataDir: profileDir(),
    page: safePage,
    personas: state.personas.map((persona, index) => ({
      ...persona,
      images:
        index >= start && index < end
          ? imageViews(persona)
          : persona.images.map((entry) => ({ slot: entry.slot, ext: entry.ext, size: entry.size })),
    })),
  };
}

function summarizeState(state) {
  const active = activePersona(state);
  if (state.personas.length === 0) {
    return "人设库目前为空。可在人设面板中新建角色卡或导入 Tavern / DSH JSON。";
  }
  const activeDesc = active
    ? `当前启用：「${active.name || "未命名人设"}」(${active.id})${active.thinking ? " [思考·人设]" : ""}`
    : "当前未启用任何人设";
  const lines = state.personas.map((p, idx) => {
    const flag = p.id === state.activeId ? " [已启用]" : "";
    const think = p.thinking ? " [思考·人设]" : "";
    return `${idx + 1}. ${p.name || "未命名人设"} (${p.id})${flag}${think}`;
  });
  return `${activeDesc}\n共 ${state.personas.length} 份人设：\n${lines.join("\n")}`;
}

function okResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent !== undefined ? { structuredContent } : {}),
  };
}

function errResult(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { ok: false, message },
  };
}

export function loadAppHtml() {
  const override = (process.env.CHARACARD_APP_HTML || "").trim();
  const target = override || path.join(HERE, "app.html");
  return fs.readFileSync(target, "utf8");
}

export function callTool(name, rawArgs = {}) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  const page = Number.isInteger(args.page) ? args.page : 0;

  switch (name) {
    case "open_personas": {
      const state = readState();
      // Keep trajectory structuredContent compact (< 1 MiB); UI fetches page photos via `app_get_state`.
      return okResult(summarizeState(state), {
        ok: true,
        value: viewOf(state, { includeImages: false }),
        dataDir: profileDir(),
        active: Boolean(promptText(state)),
        page,
      });
    }

    case "list_personas": {
      const state = readState();
      return okResult(summarizeState(state), {
        ok: true,
        activeId: state.activeId,
        personas: state.personas.map((p) => ({
          id: p.id,
          name: p.name,
          thinking: p.thinking,
          active: p.id === state.activeId,
          updatedAt: p.updatedAt,
        })),
      });
    }

    case "get_active_persona": {
      const state = readState();
      const active = activePersona(state);
      const prompt = promptText(state);
      if (!active) {
        return okResult("当前未启用任何人设。", { ok: true, active: false, persona: null, prompt: "" });
      }
      return okResult(prompt || `当前启用人设「${active.name || "未命名"}」（暂无正文内容）。`, {
        ok: true,
        active: Boolean(prompt),
        persona: { ...active, images: active.images.map((i) => ({ slot: i.slot, ext: i.ext, size: i.size })) },
        prompt,
      });
    }

    case "switch_persona": {
      const state = readState();
      if (args.enabled === false) {
        if (!state.activeId) {
          return okResult("当前本就未启用任何人设。", { ok: true, activeId: null });
        }
        const res = activatePersonaOp(state.activeId, false);
        if (!res.ok) return errResult(res.message);
        return okResult("已关闭当前人设，下一条回复起恢复默认状态。", { ok: true, activeId: null });
      }
      let target = typeof args.id === "string" && args.id ? findPersona(state, args.id) : undefined;
      if (!target && typeof args.name === "string" && args.name.trim()) {
        const needle = args.name.trim().toLowerCase();
        target =
          state.personas.find((p) => p.name.trim().toLowerCase() === needle) ||
          state.personas.find((p) => p.name.trim().toLowerCase().includes(needle));
      }
      if (!target) {
        return errResult("未找到匹配的人设，请先用 list_personas 查看已有角色。");
      }
      const res = activatePersonaOp(target.id, true);
      if (!res.ok) return errResult(res.message);
      return okResult(`已启用人设「${target.name || "未命名人设"}」(${target.id})，从下一条回复开始生效。`, {
        ok: true,
        activeId: res.state.activeId,
        name: target.name,
      });
    }

    case "app_get_state": {
      const state = readState();
      return okResult("ok", { ok: true, value: pagedViewOf(state, page), active: Boolean(promptText(state)) });
    }

    case "app_save_persona": {
      const res = savePersonaOp(args);
      if (!res.ok) return errResult(res.message);
      return okResult("saved", {
        ok: true,
        personaId: res.personaId,
        value: pagedViewOf(res.state, page),
        active: Boolean(promptText(res.state)),
      });
    }

    case "app_activate_persona": {
      const res = activatePersonaOp(args.id, args.enabled);
      if (!res.ok) return errResult(res.message);
      return okResult("updated", {
        ok: true,
        value: pagedViewOf(res.state, page),
        active: Boolean(promptText(res.state)),
      });
    }

    case "app_delete_persona": {
      const res = deletePersonaOp(args.id);
      if (!res.ok) return errResult(res.message);
      return okResult("deleted", {
        ok: true,
        value: pagedViewOf(res.state, page),
        active: Boolean(promptText(res.state)),
      });
    }

    case "app_set_image": {
      const res = setImageOp(args);
      if (!res.ok) return errResult(res.message);
      return okResult("photo saved", {
        ok: true,
        value: pagedViewOf(res.state, page),
        active: Boolean(promptText(res.state)),
      });
    }

    case "app_remove_image": {
      const res = removeImageOp(args.id, args.slot);
      if (!res.ok) return errResult(res.message);
      return okResult("photo removed", {
        ok: true,
        value: pagedViewOf(res.state, page),
        active: Boolean(promptText(res.state)),
      });
    }

    case "app_import": {
      const res = importPersonasOp(args.data, args.mode);
      if (!res.ok) return errResult(res.message);
      return okResult("imported", {
        ok: true,
        imported: res.imported,
        ...(res.converted ? { converted: res.converted } : {}),
        value: pagedViewOf(res.state, page),
        active: Boolean(promptText(res.state)),
      });
    }

    case "app_export": {
      const res = exportPersonasOp({ format: args.format, id: args.id });
      if (!res.ok) return errResult(res.message);
      return okResult("exported", res);
    }

    default:
      return errResult(`Unknown tool: ${name}`);
  }
}

export function handleJsonRpc(message) {
  if (!message || typeof message !== "object") return null;
  const hasId = Object.prototype.hasOwnProperty.call(message, "id") && message.id !== undefined;
  const { id, method, params } = message;

  // Notifications carry no id and expect no reply.
  if (!hasId) return null;

  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, msg) => ({ jsonrpc: "2.0", id, error: { code, message: msg } });

  try {
    switch (method) {
      case "initialize": {
        const clientVersion = params && typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-03-26";
        return ok({
          protocolVersion: clientVersion,
          capabilities: { tools: {}, resources: {} },
          serverInfo: SERVER_INFO,
        });
      }
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: TOOLS });
      case "tools/call": {
        if (!params || typeof params.name !== "string") return fail(-32602, "missing tool name");
        return ok(callTool(params.name, params.arguments));
      }
      case "resources/list":
        return ok({
          resources: [
            {
              uri: APP_URI,
              name: "Persona Board",
              description: "Interactive 2×2 Character Card manager UI for dsh-characard.",
              mimeType: APP_MIME,
              _meta: { ui: { prefersBorder: false } },
            },
          ],
        });
      case "resources/templates/list":
        return ok({ resourceTemplates: [] });
      case "resources/read": {
        const uri = params && params.uri;
        if (uri !== APP_URI) return fail(-32602, `unknown resource: ${String(uri)}`);
        return ok({
          contents: [
            {
              uri: APP_URI,
              mimeType: APP_MIME,
              text: loadAppHtml(),
              _meta: { ui: { prefersBorder: false } },
            },
          ],
        });
      }
      case "prompts/list":
        return ok({ prompts: [] });
      default:
        return fail(-32601, `Method not found: ${String(method)}`);
    }
  } catch (error) {
    return fail(-32603, error instanceof Error ? error.message : String(error));
  }
}

function startStdioServer() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
      return;
    }
    const reply = handleJsonRpc(parsed);
    if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
  });
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  startStdioServer();
}
