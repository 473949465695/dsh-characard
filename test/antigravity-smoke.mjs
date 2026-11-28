/**
 * Comprehensive smoke test for Antigravity integration + bug-fix regressions:
 *   - Antigravity SessionStart & PreInvocation hooks (live switch, deactivate, thinking reminder)
 *   - Antigravity MCP App JSON-RPC server (initialize, tools/list, tools/call, resources/read)
 *   - Security & reliability regressions (path-traversal ID sanitization, orphan-image cap slicing,
 *     bundleCardBlocks tiny cap safety, magic-byte validation)
 *
 * Run: node test/antigravity-smoke.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-characard-agy-"));
process.env.CHARACARD_DATA_DIR = tempDir;
process.env.CHARACARD_PLUGIN_DATA = tempDir;

const { normalizePersona, pickImage } = await import("../src/schema.js");
const { bundleCardBlocks } = await import("../src/card.js");
const { clearStateCache, imageDir, importPersonasOp, savePersonaOp, activatePersonaOp, readState } = await import("../src/store.js");
const { evaluateHook } = await import("../antigravity/hook.mjs");
const { APP_MIME, APP_URI, handleJsonRpc } = await import("../antigravity/mcp-server.mjs");

const PN =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAe/wF1nD+1AAAAAElFTkSuQmCC";

try {
  // 1. Security regression: path traversal IDs are rejected & regenerated safely.
  {
    const bad = normalizePersona({ id: "../../evil", name: "测试" });
    assert.ok(!bad.id.includes(".."));
    assert.ok(!bad.id.includes("/"));
    assert.match(bad.id, /^[A-Za-z0-9_-]+$/);
  }

  // 2. Regression: bundleCardBlocks never loops on max <= 1.
  {
    assert.equal(bundleCardBlocks(["abcdef"], 0), "");
    assert.equal(bundleCardBlocks(["abcdef"], 1), "…");
    assert.ok(bundleCardBlocks(["aaaaaa", "bbbbbb"], 10).length <= 10);
  }

  // 3. Regression: pickImage checks magic bytes.
  {
    const bad = pickImage({ slot: 0, dataUrl: "data:image/png;base64,aGVsbG8=" });
    assert.ok(bad.error, "spoofed PNG header rejected");
    const good = pickImage({ slot: 0, dataUrl: PN });
    assert.equal(good.ext, "png");
    assert.ok(Buffer.isBuffer(good.bytes));
  }

  // 4. Antigravity Hook lifecycle: SessionStart -> PreInvocation -> live switch -> deactivate -> thinking reminder.
  {
    const sessionFile = path.join(tempDir, "sessions.json");
    const s1 = savePersonaOp({ name: "薇拉", bio: "旧书店老板", style: "懒散", thinking: true });
    assert.equal(s1.ok, true);
    const id1 = s1.personaId;

    // SessionStart injects full persona prompt.
    const startRes = evaluateHook(
      { hookEventName: "SessionStart", conversationId: "conv-1" },
      { state: readState(), sessionFile },
    );
    assert.equal(startRes.injectSteps.length, 1);
    assert.match(startRes.injectSteps[0].systemMessage.systemMessage, /薇拉/);

    // PreInvocation step 1: persona unchanged, but thinking reminder fires on step 1.
    const step1 = evaluateHook(
      { hookEventName: "PreInvocation", conversationId: "conv-1", invocationNum: 1 },
      { state: readState(), sessionFile },
    );
    assert.equal(step1.injectSteps.length, 1);
    assert.match(step1.injectSteps[0].systemMessage.systemMessage, /<system-reminder>/);

    // PreInvocation step 2: unchanged & not reminder-due -> empty object `{}`.
    const step2 = evaluateHook(
      { hookEventName: "PreInvocation", conversationId: "conv-1", invocationNum: 2 },
      { state: readState(), sessionFile },
    );
    assert.deepEqual(step2, {});

    // PreInvocation step 9: cadence repeats -> thinking reminder fires again.
    const step9 = evaluateHook(
      { hookEventName: "PreInvocation", conversationId: "conv-1", invocationNum: 9 },
      { state: readState(), sessionFile },
    );
    assert.equal(step9.injectSteps.length, 1);
    assert.match(step9.injectSteps[0].systemMessage.systemMessage, /<system-reminder>/);

    // Switch persona mid-conversation -> PreInvocation immediately injects updated persona!
    const s2 = savePersonaOp({ name: "老周", bio: "木匠", thinking: false });
    activatePersonaOp(s2.personaId, true);
    const switched = evaluateHook(
      { hookEventName: "PreInvocation", conversationId: "conv-1", invocationNum: 3 },
      { state: readState(), sessionFile },
    );
    assert.equal(switched.injectSteps.length, 1);
    assert.match(switched.injectSteps[0].systemMessage.systemMessage, /人设已更新/);
    assert.match(switched.injectSteps[0].systemMessage.systemMessage, /老周/);

    // Turn off persona mid-conversation -> PreInvocation injects deactivation notice!
    activatePersonaOp(s2.personaId, false);
    const off = evaluateHook(
      { hookEventName: "PreInvocation", conversationId: "conv-1", invocationNum: 4 },
      { state: readState(), sessionFile },
    );
    assert.equal(off.injectSteps.length, 1);
    assert.match(off.injectSteps[0].systemMessage.systemMessage, /人设已关闭/);

    // Subsequent step while off -> nothing injected.
    const quiet = evaluateHook(
      { hookEventName: "PreInvocation", conversationId: "conv-1", invocationNum: 5 },
      { state: readState(), sessionFile },
    );
    assert.deepEqual(quiet, {});

    // Re-activate id1 for MCP tests below.
    activatePersonaOp(id1, true);
  }

  // 5. Antigravity MCP App JSON-RPC protocol tests.
  {
    const init = handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
    assert.equal(init.result.protocolVersion, "2025-03-26");
    assert.ok(init.result.capabilities.tools);
    assert.ok(init.result.capabilities.resources);

    // Notifications produce null.
    assert.equal(handleJsonRpc({ jsonrpc: "2.0", method: "notifications/initialized" }), null);

    const list = handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const openTool = list.result.tools.find((tool) => tool.name === "open_personas");
    assert.ok(openTool, "open_personas tool declared");
    assert.equal(openTool._meta.ui.resourceUri, APP_URI);
    assert.equal(openTool._meta["com.google.antigravity/ui"].entrypoints.length, 2);

    const appOnly = list.result.tools.find((tool) => tool.name === "app_save_persona");
    assert.deepEqual(appOnly._meta.ui.visibility, ["app"]);

    // Resources list & read returns self-contained HTML with MCP App MIME type.
    const resList = handleJsonRpc({ jsonrpc: "2.0", id: 3, method: "resources/list" });
    assert.equal(resList.result.resources[0].uri, APP_URI);
    assert.equal(resList.result.resources[0].mimeType, APP_MIME);

    const resRead = handleJsonRpc({ jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: APP_URI } });
    assert.equal(resRead.result.contents[0].mimeType, APP_MIME);
    assert.match(resRead.result.contents[0].text, /<!DOCTYPE html>/i);
    assert.ok(resRead.result.contents[0].text.length < 10 * 1024 * 1024);

    // Tool calls: open_personas, switch_persona, app_get_state.
    const opened = handleJsonRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "open_personas", arguments: {} } });
    assert.equal(opened.result.structuredContent.ok, true);
    assert.equal(opened.result.structuredContent.value.personas.length, 2);

    const switched = handleJsonRpc({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "switch_persona", arguments: { name: "老周" } },
    });
    assert.match(switched.result.content[0].text, /老周/);
  }

  // 6. Regression: import capacity cap does not write orphan images for dropped personas.
  {
    clearStateCache();
    const bulk = Array.from({ length: 35 }, (_, i) => ({
      name: `角色${i}`,
      bio: `简介${i}`,
      images: [{ slot: 0, dataUrl: PN }],
    }));
    const res = importPersonasOp({ personas: bulk }, "replace");
    assert.equal(res.ok, true);
    assert.equal(res.imported, 32, "reports actually imported count (capped at 32)");
    assert.equal(res.state.personas.length, 32);
    const files = fs.readdirSync(imageDir());
    assert.equal(files.length, 32, "no orphan images written beyond capacity");
  }

  console.log("antigravity smoke ok");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
