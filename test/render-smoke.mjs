/**
 * Headless render + interaction smoke test for the client half.
 * Run:  node test/render-smoke.mjs
 *
 * The client module is evaluated in a node:vm sandbox with a tiny React
 * stand-in (hooks + function components), a fake DOM for the style tag, and a
 * fetch stub backed by a fake persona library. It then drives the page the way
 * a user would: look at the four character frames, edit a persona, check the
 * split fields, go back, create a persona from an empty frame, flip the active
 * character.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "..", "client.js"), "utf8");

const SHOT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

function createHarness({ language }) {
  let definition = null;
  const styleTags = [];
  const fetchCalls = [];
  const downloads = [];
  const exportCalls = [];
  class BlobStub {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
    }
  }
  class URLStub extends URL {
    static createObjectURL() {
      return "blob:stub";
    }
    static revokeObjectURL() {}
  }
  let library = {
    version: 3,
    activeId: "p1",
    personas: [
      {
        id: "p1",
        name: "薇拉",
        bio: "吸血鬼，夜里开着旧书店。",
        likes: "甜食、冰饮。",
        relations: "熟客。",
        appearance: "旧外套。",
        userRelation: "主人兼老朋友。",
        specialty: "旧书鉴定。",
        style: "懒散，语气词多。",
        rules: "别自称 AI。",
        images: [{ slot: 0, dataUrl: SHOT }],
        updatedAt: "",
      },
      {
        id: "p2",
        name: "老周",
        bio: "退休的木匠，话不多。",
        likes: "",
        relations: "",
        appearance: "",
        userRelation: "",
        specialty: "",
        style: "简短。",
        rules: "",
        images: [],
        updatedAt: "",
      },
    ],
  };

  const jsonResponse = (payload) => ({
    ok: true,
    status: 200,
    json: async () => payload,
  });

  const fetchStub = async (url, init) => {
    const action = String(url).split("/").pop();
    fetchCalls.push(action);
    const body = init && init.body ? JSON.parse(init.body) : {};
    if (action === "get") return jsonResponse({ ok: true, value: library, active: Boolean(library.activeId) });
    if (action === "activate") {
      library = { ...library, activeId: body.enabled === false ? null : body.id };
      return jsonResponse({ ok: true, value: library, active: Boolean(library.activeId) });
    }
    if (action === "save") {
      const id = body.id || `p_new_${library.personas.length}`;
      const personas = library.personas.some((persona) => persona.id === id)
        ? library.personas.map((persona) => (persona.id === id ? { ...persona, ...body, id } : persona))
        : [...library.personas, { ...body, id, images: [] }];
      library = { ...library, personas, activeId: library.activeId || id };
      return jsonResponse({ ok: true, personaId: id, value: library, active: Boolean(library.activeId) });
    }
    if (action === "image") {
      const personas = library.personas.map((persona) =>
        persona.id === body.id ? { ...persona, images: [{ slot: body.slot, dataUrl: body.dataUrl }] } : persona,
      );
      library = { ...library, personas };
      return jsonResponse({ ok: true, value: library, active: Boolean(library.activeId) });
    }
    if (action === "image-remove") {
      const personas = library.personas.map((persona) =>
        persona.id === body.id ? { ...persona, images: (persona.images || []).filter((entry) => entry.slot !== body.slot) } : persona,
      );
      library = { ...library, personas };
      return jsonResponse({ ok: true, value: library, active: Boolean(library.activeId) });
    }
    if (action === "export") {
      if (body.format === "v3") {
        const persona = library.personas.find((entry) => entry.id === body.id) || library.personas[0];
        const fileName = `${persona.name}.chara_card_v3.json`;
        exportCalls.push({ format: "v3", id: body.id, fileName });
        return jsonResponse({
          ok: true,
          format: "chara_card_v3",
          fileName,
          value: { spec: "chara_card_v3", spec_version: "3.0", data: { name: persona.name, description: "一、个人简介" } },
        });
      }
      exportCalls.push({ format: "dsh", fileName: "dsh-characards-2026-01-01.json" });
      return jsonResponse({
        ok: true,
        format: "dsh",
        fileName: "dsh-characards-2026-01-01.json",
        value: { schema: "dsh-persona/v2", personas: library.personas.map((persona) => ({ name: persona.name })) },
      });
    }
    throw new Error(`unexpected bridge call: ${action}`);
  };

  // --- tiny React -------------------------------------------------------
  let currentInstance = null;
  let dirty = false;
  const instances = new Map();
  const pendingEffects = [];

  const React = {
    createElement(type, props, ...children) {
      const next = { ...(props || {}) };
      if (children.length === 1) next.children = children[0];
      else if (children.length > 1) next.children = children;
      const element = { type, props: next };
      if (props && props.key !== undefined) element.key = props.key;
      return element;
    },
    useState(initial) {
      const instance = currentInstance;
      if (!instance) throw new Error("useState outside a component");
      const index = instance.cursor++;
      if (!(index in instance.hooks)) {
        instance.hooks[index] = typeof initial === "function" ? initial() : initial;
      }
      const setState = (next) => {
        const value = typeof next === "function" ? next(instance.hooks[index]) : next;
        if (Object.is(value, instance.hooks[index])) return;
        instance.hooks[index] = value;
        dirty = true;
      };
      return [instance.hooks[index], setState];
    },
    useEffect(fn) {
      const instance = currentInstance;
      if (!instance) throw new Error("useEffect outside a component");
      const index = instance.cursor++;
      if (!instance.ranEffects) {
        instance.pending = instance.pending || [];
        instance.pending.push({ index, fn });
      }
    },
  };

  const documentStub = {
    baseURI: "http://127.0.0.1:24406/",
    querySelector: () => null,
    head: {
      appendChild(tag) {
        styleTags.push(tag);
        return tag;
      },
    },
    createElement: (tag) => ({
      tag,
      attributes: {},
      textContent: "",
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      click() {
        if (this.tag === "a") downloads.push(this.download);
      },
      remove() {
        const at = styleTags.indexOf(this);
        if (at >= 0) styleTags.splice(at, 1);
      },
    }),
  };

  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(value) {
          definition = value;
        },
      },
    },
    document: documentStub,
    navigator: { language },
    fetch: fetchStub,
    Blob: BlobStub,
    console,
    URL: URLStub,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  assert.ok(definition && typeof definition.factory === "function", "client module did not register");
  const exports = definition.factory((name) => {
    if (name === "react") return React;
    throw new Error(`unexpected require(${name})`);
  });
  assert.equal(typeof exports.apply, "function", "client module has no apply()");

  const registered = [];
  const ctx = {
    effect(fn) {
      fn();
    },
    slots: {
      inject(_key, callback) {
        callback();
      },
      register(options, component) {
        registered.push({ options, component });
        return () => {};
      },
    },
    locale: {
      register() {},
      bind() {
        return (key) => key;
      },
    },
  };
  exports.apply(ctx);
  const sectionEntry = registered.find((entry) => entry.options.name === "settings.section");
  const iconEntry = registered.find((entry) => entry.options.name === "settings.section.icon");
  assert.ok(sectionEntry, "expected a settings.section registration");
  assert.ok(iconEntry, "expected a settings.section.icon registration");
  assert.equal(iconEntry.options.id, "persona", "the icon must be addressed by the section id");
  assert.equal(registered.length, 2, "expected exactly two slot registrations");

  const glyph = iconEntry.component({ size: 16, active: true });
  assert.equal(glyph.type, "svg", "the nav icon must be an svg");
  assert.equal(glyph.props.width, 16);
  assert.equal(glyph.props.height, 16);
  assert.equal(glyph.props.viewBox, "0 0 24 24");
  assert.equal(glyph.props.stroke, "currentColor", "the nav icon must follow the row colour");
  const glyphParts = normalizeChildren(glyph.props.children);
  assert.ok(glyphParts.some((part) => part && part.type === "rect"), "the icon must draw a card frame");
  assert.ok(glyphParts.some((part) => part && part.type === "circle"), "the icon must draw a portrait head");

  const Section = sectionEntry.component;

  function normalizeChildren(children) {
    const list = [];
    const push = (value) => {
      if (Array.isArray(value)) value.forEach(push);
      else if (value !== null && value !== undefined && value !== false && value !== true) list.push(value);
    };
    push(children);
    return list;
  }

  function renderNode(element, key) {
    if (element === null || element === undefined || element === false) return null;
    if (Array.isArray(element)) return element.map((child, index) => renderNode(child, `${key}#${index}`));
    if (typeof element === "string" || typeof element === "number") return { text: String(element) };
    if (typeof element !== "object") return null;
    const { type, props } = element;
    if (typeof type === "string") {
      const children = normalizeChildren(props.children).map((child, index) => renderNode(child, `${key}.${index}`));
      return { kind: "host", type, props, children };
    }
    if (typeof type === "function") {
      const elementKey = element.key === undefined ? null : element.key;
      let instance = instances.get(key);
      if (!instance || instance.type !== type || instance.key !== elementKey) {
        instance = { type, key: elementKey, hooks: [], cursor: 0, ranEffects: false };
        instances.set(key, instance);
      }
      const previous = currentInstance;
      currentInstance = instance;
      instance.cursor = 0;
      let output;
      try {
        output = type(props);
      } finally {
        currentInstance = previous;
      }
      const node = renderNode(output, `${key}/out`);
      instance.ranEffects = true;
      if (instance.pending) {
        const pending = instance.pending;
        instance.pending = null;
        for (const effect of pending) pendingEffects.push(effect.fn);
      }
      return node;
    }
    return null;
  }

  let rootElement = null;
  function renderRoot() {
    rootElement = renderNode(Section({ t: (key) => key }), "root");
    while (pendingEffects.length > 0) {
      const fn = pendingEffects.shift();
      fn();
    }
  }

  async function settle() {
    for (let round = 0; round < 40; round += 1) {
      if (!dirty) {
        await new Promise((resolve) => setTimeout(resolve, 3));
        if (!dirty) return;
      }
      dirty = false;
      renderRoot();
    }
    throw new Error("render did not settle");
  }

  return {
    renderRoot,
    settle,
    fetchCalls,
    styleTags,
    downloads,
    exportCalls,
    getRoot: () => rootElement,
    getLibrary: () => library,
  };
}

function textOf(node) {
  if (!node) return "";
  if (node.text !== undefined) return node.text;
  let out = "";
  for (const child of node.children || []) out += textOf(child);
  return out;
}

function collect(node, predicate, found = []) {
  if (!node) return found;
  if (predicate(node)) found.push(node);
  for (const child of node.children || []) collect(child, predicate, found);
  return found;
}

function hasClass(node, name) {
  return node.kind === "host" && typeof node.props.className === "string" && node.props.className.split(" ").includes(name);
}

function button(root, label) {
  const matches = collect(root, (node) => node.kind === "host" && node.props && typeof node.props.onClick === "function" && textOf(node).trim().includes(label));
  assert.ok(matches.length > 0, `no button labelled ${label}`);
  return matches[0];
}

function click(node) {
  node.props.onClick({ target: { value: "", files: [] }, preventDefault() {}, stopPropagation() {} });
}

function allText(root) {
  return textOf(root);
}

function inputByPlaceholder(root, placeholder) {
  return collect(root, (node) => node.kind === "host" && node.type === "input" && node.props.placeholder === placeholder)[0];
}

function frames(root) {
  return collect(root, (node) => hasClass(node, "dshp-frame"));
}

// --- zh flow ------------------------------------------------------------
{
  const harness = createHarness({ language: "zh-CN" });
  harness.renderRoot();
  await harness.settle();

  let root = harness.getRoot();
  let text = allText(root);
  assert.match(text, /薇拉/);
  assert.match(text, /老周/);
  assert.match(text, /已启用/);
  assert.match(text, /导入/);
  assert.match(text, /导出/);
  assert.equal(harness.styleTags.length, 1, "styles installed once");
  assert.deepEqual(harness.fetchCalls, ["get"]);

  // --- export dialog: pick a format, then export the library or a single card.
  click(button(root, "导出"));
  await harness.settle();
  root = harness.getRoot();
  text = allText(root);
  let dialog = collect(root, (node) => hasClass(node, "dshp-modal"))[0];
  assert.ok(dialog, "export opens a dialog");
  assert.equal(dialog.props.role, "dialog");
  assert.match(text, /DSH 插件格式/);
  assert.match(text, /chara_card_v3/);
  assert.equal(
    collect(dialog, (node) => node.kind === "host" && node.type === "select").length,
    0,
    "the library format needs no character picker",
  );
  const radios = collect(dialog, (node) => node.kind === "host" && node.type === "input" && node.props.type === "radio");
  assert.equal(radios.length, 2);
  radios[1].props.onChange({ target: { checked: true } });
  await harness.settle();
  root = harness.getRoot();
  dialog = collect(root, (node) => hasClass(node, "dshp-modal"))[0];
  const picker = collect(dialog, (node) => node.kind === "host" && node.type === "select")[0];
  assert.ok(picker, "the card format offers a character picker");
  assert.equal(picker.props.value, "p1");
  const confirm = collect(dialog, (node) => node.kind === "host" && node.props && typeof node.props.onClick === "function" && textOf(node).trim() === "导出")[0];
  assert.ok(confirm, "the dialog has its own export button");
  click(confirm);
  await harness.settle();
  assert.deepEqual(harness.exportCalls[0], { format: "v3", id: "p1", fileName: "薇拉.chara_card_v3.json" });
  assert.deepEqual(harness.downloads, ["薇拉.chara_card_v3.json"]);
  root = harness.getRoot();
  assert.equal(collect(root, (node) => hasClass(node, "dshp-modal")).length, 0, "the dialog closes after exporting");
  assert.match(allText(root), /已导出角色卡：薇拉/);

  // library format: one JSON file for every persona
  click(button(root, "导出"));
  await harness.settle();
  root = harness.getRoot();
  dialog = collect(root, (node) => hasClass(node, "dshp-modal"))[0];
  const confirmAll = collect(dialog, (node) => node.kind === "host" && node.props && typeof node.props.onClick === "function" && textOf(node).trim() === "导出")[0];
  click(confirmAll);
  await harness.settle();
  assert.deepEqual(harness.exportCalls[1], { format: "dsh", fileName: "dsh-characards-2026-01-01.json" });
  assert.deepEqual(harness.downloads[1], "dsh-characards-2026-01-01.json");

  // cancel closes the dialog without exporting
  click(button(harness.getRoot(), "导出"));
  await harness.settle();
  root = harness.getRoot();
  const cancel = collect(root, (node) => node.kind === "host" && node.props && typeof node.props.onClick === "function" && textOf(node).trim() === "取消")[0];
  click(cancel);
  await harness.settle();
  assert.equal(collect(harness.getRoot(), (node) => hasClass(node, "dshp-modal")).length, 0);
  assert.equal(harness.exportCalls.length, 2);
  root = harness.getRoot();

  // board: exactly four frames, two of them occupied, two empty "+ 新建人设"
  let board = frames(root);
  assert.equal(board.length, 4, "board has four character frames");
  const emptyFrames = collect(root, (node) => hasClass(node, "dshp-frame-new"));
  assert.equal(emptyFrames.length, 2);
  assert.match(text, /新建人设/);
  const pagerStart = collect(root, (node) => hasClass(node, "dshp-pager"))[0];
  assert.match(textOf(pagerStart), /1 \/ 1/);
  const nextLocked = collect(pagerStart, (node) => node.kind === "host" && textOf(node).trim() === "下一页")[0];
  assert.equal(nextLocked.props.disabled, true, "page turns only when all four frames are filled");

  // the occupied frame with a photo renders the image; file input only accepts images
  const shots = collect(root, (node) => node.kind === "host" && node.type === "img");
  assert.equal(shots.length, 1, "the saved photo is rendered");
  assert.equal(shots[0].props.src, SHOT);
  const photoInputs = collect(root, (node) => node.kind === "host" && node.type === "input" && node.props.type === "file" && node.props.accept && node.props.accept.startsWith("image/"));
  assert.equal(photoInputs.length, 2, "one file picker per occupied frame");
  assert.match(text, /PNG \/ JPG \/ WebP \/ GIF/);
  assert.match(text, /4 MB/);

  // open the first character for editing: six split fields + voice + rules, no photo picker inside
  click(button(root, "编辑"));
  await harness.settle();
  root = harness.getRoot();
  text = allText(root);
  for (const label of ["名字", "喜好", "关系", "个人简介", "穿着外貌", "与用户关系", "特长", "说话风格", "必须遵守"]) {
    assert.match(text, new RegExp(label));
  }
  assert.match(text, /正好我拿手/);
  assert.equal(inputByPlaceholder(root, "例如：薇拉（Vera）").props.value, "薇拉");
  const editorPhotoInputs = collect(root, (node) => node.kind === "host" && node.type === "input" && node.props.type === "file" && node.props.accept && node.props.accept.startsWith("image/"));
  assert.equal(editorPhotoInputs.length, 0, "the editor does not own the frame photo");

  // the thinking switch lives in the editor and waits for the save call
  const switchBox = collect(root, (node) => hasClass(node, "dshp-switch"))[0];
  assert.ok(switchBox, "the editor offers the thinking switch");
  assert.match(textOf(switchBox), /思考也用这个口吻/);
  const switchInput = collect(switchBox, (node) => node.kind === "host" && node.type === "input" && node.props.type === "checkbox")[0];
  assert.ok(switchInput, "the switch is a checkbox");
  assert.equal(switchInput.props.checked, false, "thinking starts off");
  const callsBeforeSwitch = harness.fetchCalls.length;
  switchInput.props.onChange({ target: { checked: true } });
  await harness.settle();
  root = harness.getRoot();
  const switchAfter = collect(root, (node) => hasClass(node, "dshp-switch"))[0];
  const switchInputAfter = collect(switchAfter, (node) => node.kind === "host" && node.props && node.props.type === "checkbox")[0];
  assert.equal(switchInputAfter.props.checked, true, "the switch flips locally");
  assert.equal(harness.fetchCalls.length, callsBeforeSwitch, "flipping the switch does not call the bridge on its own");
  assert.match(switchAfter.props.className, /dshp-switch-on/);

  // saving carries the switch to the host and tags the frame
  click(button(root, "保存"));
  await harness.settle();
  assert.equal(harness.getLibrary().personas[0].thinking, true, "the save stored the switch");
  assert.equal(harness.getLibrary().personas[1].thinking, undefined, "the other persona is untouched");
  root = harness.getRoot();
  assert.equal(frames(root).length, 4);
  assert.match(allText(root), /思考·人设/);

  // switch the active character from the editor toggle
  click(button(root, "编辑"));
  await harness.settle();
  root = harness.getRoot();
  const toggle = collect(root, (node) => node.kind === "host" && node.type === "input" && node.props.type === "checkbox")[0];
  assert.ok(toggle, "editor shows the active toggle");
  assert.equal(toggle.props.checked, true);
  click(button(root, "返回"));
  await harness.settle();
  root = harness.getRoot();
  // second frame's 编辑 opens 老周, who is off
  const editButtons = collect(root, (node) => hasClass(node, "dshp-frame-btn") && textOf(node).trim().includes("编辑"));
  assert.equal(editButtons.length, 2);
  click(editButtons[1]);
  await harness.settle();
  root = harness.getRoot();
  assert.equal(inputByPlaceholder(root, "例如：薇拉（Vera）").props.value, "老周");
  const offToggle = collect(root, (node) => node.kind === "host" && node.type === "input" && node.props.type === "checkbox")[0];
  assert.equal(offToggle.props.checked, false);
  offToggle.props.onChange({ target: { checked: true } });
  await harness.settle();
  assert.equal(harness.getLibrary().activeId, "p2");

  // back, then create a persona from an empty frame
  root = harness.getRoot();
  click(button(root, "返回"));
  await harness.settle();
  root = harness.getRoot();
  click(collect(root, (node) => hasClass(node, "dshp-frame-new"))[0]);
  await harness.settle();
  root = harness.getRoot();
  text = allText(root);
  assert.match(text, /0 \/ 1000 字/);
  assert.match(text, /0 \/ 4000 字/);
  assert.equal(inputByPlaceholder(root, "例如：薇拉（Vera）").props.value, "");
  const deleteButtons = collect(root, (node) => node.kind === "host" && node.props && typeof node.props.onClick === "function" && textOf(node).trim() === "删除");
  assert.equal(deleteButtons.length, 0, "a fresh persona has no delete button");
  // saving returns to the board and adds the persona
  click(button(root, "保存"));
  await harness.settle();
  assert.equal(harness.getLibrary().personas.length, 3);
  root = harness.getRoot();
  assert.equal(frames(root).length, 4);
  assert.equal(collect(root, (node) => hasClass(node, "dshp-frame-new")).length, 1);

  // fill the fourth frame too, then the page turns
  click(collect(root, (node) => hasClass(node, "dshp-frame-new"))[0]);
  await harness.settle();
  root = harness.getRoot();
  click(button(root, "保存"));
  await harness.settle();
  assert.equal(harness.getLibrary().personas.length, 4);
  root = harness.getRoot();
  assert.equal(collect(root, (node) => hasClass(node, "dshp-frame-new")).length, 0, "page one is full");
  let pager = collect(root, (node) => hasClass(node, "dshp-pager"))[0];
  assert.match(textOf(pager), /1 \/ 1/);
  let nextButton = collect(pager, (node) => node.kind === "host" && textOf(node).trim() === "下一页")[0];
  assert.equal(nextButton.props.disabled, false, "a full page can turn");
  click(nextButton);
  await harness.settle();
  root = harness.getRoot();
  pager = collect(root, (node) => hasClass(node, "dshp-pager"))[0];
  assert.match(textOf(pager), /2 \/ 2/);
  assert.equal(collect(root, (node) => hasClass(node, "dshp-frame-new")).length, 4, "page two starts empty");
  const prevButton = collect(pager, (node) => node.kind === "host" && textOf(node).trim() === "上一页")[0];
  click(prevButton);
  await harness.settle();
  root = harness.getRoot();
  pager = collect(root, (node) => hasClass(node, "dshp-pager"))[0];
  assert.match(textOf(pager), /1 \/ 1/);
  assert.match(allText(root), /薇拉/);
}

// --- en flow ------------------------------------------------------------
{
  const harness = createHarness({ language: "en-US" });
  harness.renderRoot();
  await harness.settle();
  const text = allText(harness.getRoot());
  assert.match(text, /Import/);
  assert.match(text, /Export/);
  assert.match(text, /Active/);
  assert.match(text, /New persona/);
  assert.equal(harness.styleTags.length, 1);
}

console.log("render smoke ok");
