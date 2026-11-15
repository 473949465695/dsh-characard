// End-to-end smoke test for the host half: it drives the real HTTP route
// handlers (the same functions `webServer.register` receives) without DSH.
// Run: node test/handler-smoke.mjs [path-to-card.json]
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { apply } from "../index.js";

const here = dirname(fileURLToPath(import.meta.url));
const stateFile = join(process.env.DSH_PROFILE_DIR || join(process.env.USERPROFILE || "", ".dsh", "profiles", "desktop"), "dsh-persona.json");
const backup = existsSync(stateFile) ? readFileSync(stateFile, "utf8") : null;
const realCardPath = process.argv[2] || "C:\\Users\\冯至纯\\Downloads\\天神山音葵_Tenjin_yama_Otogi__card.json";

function collectRoutes() {
  const routes = [];
  const ctx = {
    inject(names, callback) {
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

const PN = "data:image/png;base64,"
  + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAe/wF1nD+1AAAAAElFTkSuQmCC";

const routes = collectRoutes();
for (const name of ["get", "save", "activate", "delete", "image", "image-remove", "import", "export"]) {
  assert.ok(routes.has(name), `route ${name} registered`);
}

try {
  const initial = await call(routes.get("get"));
  assert.equal(initial.status, 200);
  assert.equal(initial.body.ok, true);
  assert.equal(initial.body.value.version, 3);
  const baseCount = initial.body.value.personas.length;
  const baseActive = initial.body.value.activeId;
  console.log(`get: version=3 count=${baseCount} active=${baseCount > 0}`);

  // POST-only and loopback guards.
  const wrongMethod = { ...fakeRequest({}), method: "GET" };
  const response = { status: 0, headersSent: false, writeHead(s) { this.status = s; this.headersSent = true; }, end() {} };
  await routes.get("get")(wrongMethod, response);
  assert.equal(response.status, 405, "GET is refused");
  console.log("guard: POST-only enforced");

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
  assert.equal(saved.body.value.personas.length, baseCount + 1);
  console.log(`save: newId=${tempId} count=${saved.body.value.personas.length}`);

  const photo = await call(routes.get("image"), { id: tempId, slot: 1, dataUrl: PN });
  assert.equal(photo.status, 200);
  const withPhoto = photo.body.value.personas.find((persona) => persona.id === tempId);
  assert.equal(withPhoto.images.length, 1);
  assert.equal(withPhoto.images[0].slot, 1);
  console.log("image: stored second frame slot");

  const activated = await call(routes.get("activate"), { id: tempId, enabled: true });
  assert.equal(activated.status, 200);
  assert.equal(activated.body.value.activeId, tempId);
  console.log("activate: switched");

  const exported = await call(routes.get("export"));
  assert.equal(exported.status, 200);
  assert.equal(exported.body.format, "dsh");
  assert.match(exported.body.fileName, /^dsh-characards-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(exported.body.value.schema, "dsh-persona/v2");
  const tempExport = exported.body.value.personas.find((persona) => persona.id === tempId);
  assert.ok(tempExport, "export includes the temporary persona");
  assert.equal(tempExport.images.length, 1);
  assert.equal(tempExport.images[0].slot, 1);
  assert.ok(tempExport.images[0].dataUrl.startsWith("data:image/png;base64,"));
  console.log("export: photo embedded");

  // V3 card export: one card, numbered persona sections, no greeting.
  const cardExport = await call(routes.get("export"), { format: "v3", id: tempId });
  assert.equal(cardExport.status, 200);
  assert.equal(cardExport.body.format, "chara_card_v3");
  assert.match(cardExport.body.fileName, /\.chara_card_v3\.json$/);
  assert.equal(cardExport.body.value.spec, "chara_card_v3");
  assert.equal(cardExport.body.value.spec_version, "3.0");
  assert.equal(cardExport.body.value.data.name, "冒烟测试人设");
  assert.match(cardExport.body.value.data.description, /一、个人简介/);
  assert.match(cardExport.body.value.data.description, /六、特长/);
  assert.equal(cardExport.body.value.data.first_mes, "");
  assert.ok(!cardExport.body.value.data.description.includes("冒烟测试人设"), "name is not repeated inside the sections");
  // An unknown id falls back to the active persona instead of failing.
  const fallback = await call(routes.get("export"), { format: "v3", id: "p_does_not_exist" });
  assert.equal(fallback.status, 200);
  assert.equal(fallback.body.value.data.name, "冒烟测试人设");
  console.log(`export v3: file=${cardExport.body.fileName} desc=${cardExport.body.value.data.description.length}`);

  // Tavern card import through the real handler.
  let importedId = null;
  if (existsSync(realCardPath)) {
    const card = JSON.parse(readFileSync(realCardPath, "utf8"));
    const imported = await call(routes.get("import"), { data: card, mode: "append" });
    assert.equal(imported.status, 200, JSON.stringify(imported.body));
    assert.equal(imported.body.converted, "opentavern", "card detected");
    const importedPersona = imported.body.value.personas.find(
      (persona) => persona.name === card.data.name,
    );
    assert.ok(importedPersona, "imported persona named from the card");
    importedId = importedPersona.id;
    assert.ok(importedPersona.bio.length > 200, "bio filled from the card");
    assert.ok(importedPersona.style.length > 100, "style filled from the card");
    assert.ok(!/{{user}}|{{char}}/.test(JSON.stringify(importedPersona)), "no token leakage");
    const text = JSON.stringify(importedPersona);
    assert.ok(!text.includes("开场白"), "greeting not imported");
    console.log(`import: converted=${imported.body.converted} name=${importedPersona.name.slice(0, 12)} bio=${importedPersona.bio.length} style=${importedPersona.style.length}`);
  } else {
    console.log(`import: skipped (card not found at ${realCardPath})`);
  }

  // Clean up: delete only the personas this test created, never the user's library.
  const created = [tempId];
  if (typeof importedId === "string") created.push(importedId);
  for (const id of created) {
    const removed = await call(routes.get("delete"), { id });
    assert.equal(removed.status, 200, `delete ${id}`);
  }
  if (baseActive) {
    const restored = await call(routes.get("activate"), { id: baseActive, enabled: true });
    assert.equal(restored.status, 200);
  }
  const final = await call(routes.get("get"));
  assert.equal(final.body.value.personas.length, baseCount);
  assert.equal(final.body.value.activeId, baseActive);
  console.log(`cleanup: count=${final.body.value.personas.length}`);
  console.log("handler smoke ok");
} finally {
  if (backup !== null) writeFileSync(stateFile, backup, "utf8");
}
