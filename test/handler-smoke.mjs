// End-to-end smoke test for the DSH host half: drives the real HTTP route
// handlers in an isolated temporary profile directory (never touches user data).
// Run: node test/handler-smoke.mjs [path-to-card.json]
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "dsh-characard-handler-"));
process.env.DSH_PROFILE_DIR = tempDir;

const { apply } = await import("../index.js");
const realCardPath = process.argv[2] || "";

function collectRoutes() {
  const routes = [];
  const ctx = {
    inject(_names, callback) {
      callback({
        effect(run) {
          run();
          return () => {};
        },
        systemPrompt: { section: () => () => {} },
        webServer: {
          register(route) {
            routes.push(route);
            return () => {};
          },
        },
      });
    },
  };
  apply(ctx);
  return new Map(routes.map((route) => [route.path.replace(/^\/api\/dsh-characard\//, ""), route.handler]));
}

function fakeRequest(body) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body), "utf8")];
  return {
    method: "POST",
    headers: { host: "127.0.0.1:24406", "content-type": "application/json" },
    socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() {
      for (const chunk of payload) yield chunk;
    },
  };
}

async function call(handler, body) {
  const response = {
    status: 0,
    headers: undefined,
    payload: "",
    headersSent: false,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(payload) {
      this.payload = payload;
    },
  };
  await handler(fakeRequest(body), response);
  assert.ok(response.status, "handler answered");
  return { status: response.status, body: JSON.parse(response.payload) };
}

const PN =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAe/wF1nD+1AAAAAElFTkSuQmCC";

const routes = collectRoutes();
for (const name of ["get", "save", "activate", "delete", "image", "image-remove", "import", "export"]) {
  assert.ok(routes.has(name), `route ${name} registered`);
}

try {
  const initial = await call(routes.get("get"));
  assert.equal(initial.status, 200);
  assert.equal(initial.body.ok, true);
  assert.equal(initial.body.value.version, 3);
  assert.equal(initial.body.value.personas.length, 0);

  // POST-only guard.
  const wrongMethod = { ...fakeRequest({}), method: "GET" };
  const response = { status: 0, headersSent: false, writeHead(s) { this.status = s; this.headersSent = true; }, end() {} };
  await routes.get("get")(wrongMethod, response);
  assert.equal(response.status, 405, "GET is refused");

  // Save (create), photo, activate.
  const saved = await call(routes.get("save"), {
    name: "冒烟测试人设",
    bio: "测试用。",
    likes: "喜欢安静。",
    specialty: "测试。",
  });
  assert.equal(saved.status, 200);
  const tempId = saved.body.personaId;
  assert.ok(tempId, "save returns personaId");
  assert.equal(saved.body.value.personas.length, 1);

  // Reject bogus image header disguised as PNG.
  const fakePng = await call(routes.get("image"), {
    id: tempId,
    slot: 1,
    dataUrl: "data:image/png;base64,bm90IGEgcG5n",
  });
  assert.equal(fakePng.status, 400, "invalid PNG magic bytes rejected");

  const photo = await call(routes.get("image"), { id: tempId, slot: 1, dataUrl: PN });
  assert.equal(photo.status, 200);
  const withPhoto = photo.body.value.personas.find((persona) => persona.id === tempId);
  assert.equal(withPhoto.images.length, 1);
  assert.equal(withPhoto.images[0].slot, 1);

  const activated = await call(routes.get("activate"), { id: tempId, enabled: true });
  assert.equal(activated.status, 200);
  assert.equal(activated.body.value.activeId, tempId);

  const exported = await call(routes.get("export"));
  assert.equal(exported.status, 200);
  assert.equal(exported.body.format, "dsh");
  assert.match(exported.body.fileName, /^dsh-characards-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(exported.body.value.schema, "dsh-persona/v2");
  const tempExport = exported.body.value.personas.find((persona) => persona.id === tempId);
  assert.ok(tempExport, "export includes the temporary persona");
  assert.equal(tempExport.images.length, 1);
  assert.ok(tempExport.images[0].dataUrl.startsWith("data:image/png;base64,"));

  const cardExport = await call(routes.get("export"), { format: "v3", id: tempId });
  assert.equal(cardExport.status, 200);
  assert.equal(cardExport.body.format, "chara_card_v3");
  assert.equal(cardExport.body.value.spec, "chara_card_v3");
  assert.match(cardExport.body.value.data.description, /一、个人简介/);
  assert.match(cardExport.body.value.data.description, /六、特长/);
  assert.equal(cardExport.body.value.data.first_mes, "");

  const fallback = await call(routes.get("export"), { format: "v3", id: "p_does_not_exist" });
  assert.equal(fallback.status, 200);
  assert.equal(fallback.body.value.data.name, "冒烟测试人设");

  if (realCardPath && existsSync(realCardPath)) {
    const card = JSON.parse(readFileSync(realCardPath, "utf8"));
    const imported = await call(routes.get("import"), { data: card, mode: "append" });
    assert.equal(imported.status, 200);
    assert.equal(imported.body.converted, "opentavern");
  }

  const removed = await call(routes.get("delete"), { id: tempId });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.value.personas.length, 0);

  console.log("handler smoke ok");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
