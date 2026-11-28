/**
 * Antigravity MCP App UI for dsh-characard.
 * Built with @modelcontextprotocol/ext-apps and bundled into a single-file app.html.
 */
import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";

const FRAMES = 4;
const MAX_PAGES = 8;
const PHOTO_SLOT = 0;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const MAX = {
  name: 80,
  bio: 4000,
  likes: 1000,
  relations: 1000,
  appearance: 1000,
  userRelation: 1000,
  specialty: 500,
  style: 2000,
  rules: 4000,
};

const TEXT_ZH = {
  title: "人设 / Persona",
  subtitle: "每页四个角色框，点格子放照片、点启用即刻切换人设；一页四个填满后可翻到下一页。修改或切换后下一条回复即生效，无需重启。",
  loading: "正在读取人设……",
  loadFailed: "读取失败：",
  emptyFrame: "新建人设",
  importBtn: "导入",
  exportBtn: "导出",
  untitled: "未命名人设",
  activeBadge: "已启用",
  noneActive: "未启用人设",
  currentPrefix: "当前启用：",
  activate: "启用",
  deactivate: "关闭",
  edit: "编辑",
  del: "删除",
  confirmDelete: "确认删除",
  back: "返回",
  save: "保存",
  saving: "保存中……",
  saved: "已保存，下一条回复即按人设回复。",
  savedInactive: "已保存。此人设还未启用，启用之后才会生效。",
  deleted: "已删除。",
  name: "名字",
  namePh: "例如：薇拉（Vera）",
  likes: "喜好",
  likesPh: "甜食、冰饮、旧书、雨夜……",
  relations: "关系",
  relationsPh: "家人、朋友、熟人、仇家……",
  bio: "个人简介",
  bioPh: "身份、经历、性格、说话习惯……",
  appearance: "穿着外貌",
  appearancePh: "发色、眼睛、常穿的衣服、随身物件……",
  userRelation: "与用户关系",
  userRelationPh: "他是你的主人／同事／债主……你们怎么相处",
  specialty: "特长",
  specialtyPh: "擅长的事，例如：旧书鉴定、修理钟表、编故事",
  specialtyHint: "问到这些方面的问题时，角色会顺势来一句“正好我拿手”，再自信作答。",
  style: "说话风格",
  stylePh: "语气、口癖、句子长短、常用语气词……",
  rules: "必须遵守",
  rulesPh: "一、……\n二、……",
  enabledLabel: "启用此人设",
  thinkingLabel: "思考也用这个口吻",
  thinkingHint: "打开后，模型思考（reasoning）里的独白也换成这个人——第一人称、同样的语气词和句尾，思考用中文（跟用户语言一致），不许整段英文。",
  thinkingBadge: "思考·人设",
  counterUnit: " 字",
  importedPrefix: "已导入 ",
  importedSuffix: " 个人设。",
  importedCardNote: "识别到 Tavern 角色卡：只读取人设，背景、开场白与示例对话没有导入。",
  importFailed: "导入失败：",
  exported: "已导出为 JSON 文件。",
  copied: "已复制导出 JSON 到剪贴板。",
  copyBtn: "复制 JSON",
  exportTitle: "导出人设",
  exportFormatLabel: "选择导出格式",
  exportFormatDsh: "DSH / Antigravity 整库备份格式",
  exportFormatDshHint: "一个 JSON 文件，含全部人设和照片，用来备份、换电脑或导回本插件。",
  exportFormatV3: "Tavern 角色卡 V3（chara_card_v3）",
  exportFormatV3Hint: "单张卡标准格式，可导进 SillyTavern、Chub 等酒馆；只含人设资料，不含照片和开场白。",
  exportPick: "选择要导出的角色",
  exportConfirm: "下载 JSON",
  cancel: "取消",
  exportV3Done: "已导出角色卡：",
  addPhoto: "＋ 放照片",
  replacePhoto: "换一张",
  removePhoto: "移除照片",
  photoHint: "点格子放照片：PNG / JPG / WebP / GIF，单张不超过 4 MB。四个格子按 左上 → 右上 → 左下 → 右下 排列。",
  photoSaved: "照片已放好。",
  photoRemoved: "照片已移除。",
  photoTypeError: "格式不支持，只能用 PNG / JPG / WebP / GIF。",
  photoSizeError: "照片太大了，单张不能超过 4 MB。",
  prevPage: "上一页",
  nextPage: "下一页",
  pageFullHint: "这一页四个框填满了，才能翻到下一页。",
};

const TEXT_EN = {
  title: "Persona Cards",
  subtitle: "Four character frames per page. Click a frame for its photo, toggle one on to use it. Fill all four to turn the page. Changes apply on the next reply without restarting.",
  loading: "Loading personas…",
  loadFailed: "Load failed: ",
  emptyFrame: "New persona",
  importBtn: "Import",
  exportBtn: "Export",
  untitled: "Untitled persona",
  activeBadge: "Active",
  noneActive: "No active persona",
  currentPrefix: "Active: ",
  activate: "Turn on",
  deactivate: "Turn off",
  edit: "Edit",
  del: "Delete",
  confirmDelete: "Confirm delete",
  back: "Back",
  save: "Save",
  saving: "Saving…",
  saved: "Saved. The next reply follows this persona.",
  savedInactive: "Saved. This persona is off — turn it on to use it.",
  deleted: "Deleted.",
  name: "Name",
  namePh: "e.g. Vera",
  likes: "Likes",
  likesPh: "Sweets, iced drinks, old books, rainy nights…",
  relations: "Relations",
  relationsPh: "Family, friends, acquaintances, enemies…",
  bio: "Biography",
  bioPh: "Identity, history, temperament, speech habits…",
  appearance: "Appearance",
  appearancePh: "Hair, eyes, usual clothes, keepsakes…",
  userRelation: "Bond with the user",
  userRelationPh: "Master / colleague / friend… and how you get along",
  specialty: "Specialties",
  specialtyPh: "e.g. appraising old books, fixing clocks, storytelling",
  specialtyHint: "When asked about these, the character responds with confidence as their specialty.",
  style: "Voice",
  stylePh: "Tone, verbal tics, sentence rhythm, favourite particles…",
  rules: "Rules",
  rulesPh: "1. …\n2. …",
  enabledLabel: "Active",
  thinkingLabel: "In-character thinking",
  thinkingHint: "When on, reasoning stays in this character's voice and matches the user's language (prompt-level).",
  thinkingBadge: "thinking",
  counterUnit: " chars",
  importedPrefix: "Imported ",
  importedSuffix: " persona(s).",
  importedCardNote: "Tavern card detected: persona only — background, greeting and example dialogue skipped.",
  importFailed: "Import failed: ",
  exported: "Exported as JSON.",
  copied: "Copied exported JSON to clipboard.",
  copyBtn: "Copy JSON",
  exportTitle: "Export persona",
  exportFormatLabel: "Choose format",
  exportFormatDsh: "Plugin backup format (DSH / Antigravity)",
  exportFormatDshHint: "One JSON file with every persona and photo for backup or transfer.",
  exportFormatV3: "Tavern character card V3 (chara_card_v3)",
  exportFormatV3Hint: "Standard single-card format for SillyTavern / Chub (persona fields only).",
  exportPick: "Character to export",
  exportConfirm: "Download JSON",
  cancel: "Cancel",
  exportV3Done: "Exported card: ",
  addPhoto: "＋ Add photo",
  replacePhoto: "Replace",
  removePhoto: "Remove photo",
  photoHint: "Click a frame to set its photo: PNG / JPG / WebP / GIF, up to 4 MB.",
  photoSaved: "Photo saved.",
  photoRemoved: "Photo removed.",
  photoTypeError: "Unsupported format — use PNG / JPG / WebP / GIF.",
  photoSizeError: "Photo is larger than 4 MB.",
  prevPage: "Previous",
  nextPage: "Next",
  pageFullHint: "Fill all four frames on this page to turn the page.",
};

let dict = /^zh/i.test(String(navigator.language || "")) ? TEXT_ZH : TEXT_EN;
const t = (key) => dict[key] ?? key;

const state = {
  phase: "loading",
  personas: [],
  activeId: null,
  page: 0,
  editing: null, // null | "new" | personaId
  form: null,
  confirmDelete: false,
  busy: false,
  message: null,
  exporting: false,
  exportFormat: "dsh",
  exportTarget: "",
};

const app = new App({ name: "dsh-characard", version: "2.0.0" }, {});
const rootEl = document.getElementById("root");

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val === undefined || val === null || val === false) continue;
    if (key === "className") node.className = val;
    else if (key.startsWith("on") && typeof val === "function") node.addEventListener(key.slice(2).toLowerCase(), val);
    else if (key in node && key !== "list") node[key] = val;
    else node.setAttribute(key, val === true ? "" : String(val));
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
  return node;
}

function emptyForm() {
  return {
    name: "",
    bio: "",
    likes: "",
    relations: "",
    appearance: "",
    userRelation: "",
    specialty: "",
    style: "",
    rules: "",
    thinking: false,
  };
}

function formOf(persona) {
  const next = emptyForm();
  if (!persona) return next;
  for (const key of Object.keys(next)) {
    next[key] = key === "thinking" ? persona.thinking === true : persona[key] || "";
  }
  return next;
}

function photoOf(persona) {
  if (!persona || !Array.isArray(persona.images)) return "";
  const hit = persona.images.find((img) => img && img.slot === PHOTO_SLOT && typeof img.dataUrl === "string");
  return hit ? hit.dataUrl : "";
}

function adopt(payload) {
  const value = payload && payload.value ? payload.value : payload;
  if (!value || !Array.isArray(value.personas)) return;
  state.personas = value.personas;
  state.activeId = value.activeId || null;
  const maxPage = Math.max(0, Math.ceil(state.personas.length / FRAMES) - 1);
  if (state.page > maxPage && state.personas.length % FRAMES !== 0) {
    state.page = maxPage;
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("cannot read file"));
    reader.readAsDataURL(file);
  });
}

async function callTool(name, args = {}) {
  const res = await app.callServerTool({ name, arguments: { ...args, page: state.page } });
  const sc = res && res.structuredContent;
  if (res && res.isError) {
    throw new Error((sc && sc.message) || (res.content && res.content[0] && res.content[0].text) || "Tool error");
  }
  if (sc && sc.ok === false) {
    throw new Error(sc.message || "Operation failed");
  }
  return sc || {};
}

async function runBusy(work) {
  state.busy = true;
  render();
  try {
    await work();
  } catch (error) {
    state.message = { kind: "error", text: String((error && error.message) || error) };
  } finally {
    state.busy = false;
    render();
  }
}

async function refreshPage(targetPage = state.page) {
  state.page = targetPage;
  await runBusy(async () => {
    const data = await callTool("app_get_state", { page: targetPage });
    adopt(data);
    state.phase = "ready";
  });
}

function openEditor(idOrNew) {
  state.editing = idOrNew;
  const persona = idOrNew === "new" ? null : state.personas.find((p) => p.id === idOrNew);
  state.form = formOf(persona);
  state.confirmDelete = false;
  state.message = null;
  render();
}

function renderFrame(persona, index) {
  if (!persona) {
    return el(
      "button",
      {
        className: "cc-frame cc-frame-new",
        type: "button",
        disabled: state.busy,
        onClick: () => openEditor("new"),
      },
      el("span", { className: "cc-plus" }, "＋"),
      el("span", {}, t("emptyFrame")),
    );
  }
  const active = persona.id === state.activeId;
  const photo = photoOf(persona);
  const fileInput = el("input", {
    className: "cc-file",
    type: "file",
    accept: IMAGE_TYPES.join(","),
    disabled: state.busy,
    onChange: async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      if (!IMAGE_TYPES.includes(file.type)) {
        state.message = { kind: "error", text: t("photoTypeError") };
        render();
        return;
      }
      if (file.size > IMAGE_MAX_BYTES) {
        state.message = { kind: "error", text: t("photoSizeError") };
        render();
        return;
      }
      await runBusy(async () => {
        const dataUrl = await readAsDataUrl(file);
        const res = await callTool("app_set_image", { id: persona.id, slot: PHOTO_SLOT, dataUrl });
        adopt(res);
        state.message = { kind: "ok", text: t("photoSaved") };
      });
    },
  });

  return el(
    "div",
    { className: active ? "cc-frame cc-frame-on" : "cc-frame" },
    active ? el("span", { className: "cc-badge" }, t("activeBadge")) : null,
    el(
      "label",
      { className: "cc-thumb", title: photo ? t("replacePhoto") : t("addPhoto") },
      photo
        ? el("img", { className: "cc-photo", src: photo, alt: persona.name || "" })
        : el("span", { className: "cc-photo-empty" }, t("addPhoto")),
      fileInput,
      photo
        ? el(
            "button",
            {
              className: "cc-photo-remove",
              type: "button",
              title: t("removePhoto"),
              onClick: async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await runBusy(async () => {
                  const res = await callTool("app_remove_image", { id: persona.id, slot: PHOTO_SLOT });
                  adopt(res);
                  state.message = { kind: "ok", text: t("photoRemoved") };
                });
              },
            },
            "×",
          )
        : null,
    ),
    el(
      "div",
      { className: "cc-frame-body" },
      el("span", { className: "cc-frame-name", title: persona.name || t("untitled") }, persona.name || t("untitled")),
      persona.thinking ? el("span", { className: "cc-tag", title: t("thinkingLabel") }, t("thinkingBadge")) : null,
      el(
        "div",
        { className: "cc-frame-actions" },
        el(
          "button",
          {
            className: active ? "cc-chip cc-chip-on" : "cc-chip",
            type: "button",
            disabled: state.busy,
            onClick: () =>
              runBusy(async () => {
                const res = await callTool("app_activate_persona", { id: persona.id, enabled: !active });
                adopt(res);
                state.message = null;
              }),
          },
          active ? t("deactivate") : t("activate"),
        ),
        el(
          "button",
          {
            className: "cc-chip",
            type: "button",
            disabled: state.busy,
            onClick: () => openEditor(persona.id),
          },
          t("edit"),
        ),
      ),
    ),
  );
}

function renderEditor() {
  const existing = state.editing && state.editing !== "new";
  const active = existing && state.editing === state.activeId;
  const form = state.form;

  const makeField = (key, rows, phKey, hintKey) => {
    const counter = el("span", { className: "cc-counter" }, `${form[key].length} / ${MAX[key]}${t("counterUnit")}`);
    const control =
      rows === 1
        ? el("input", {
            className: "cc-input",
            type: "text",
            value: form[key],
            placeholder: t(phKey),
            disabled: state.busy,
            onInput: (e) => {
              form[key] = e.target.value;
              counter.textContent = `${form[key].length} / ${MAX[key]}${t("counterUnit")}`;
            },
          })
        : el("textarea", {
            className: "cc-textarea",
            rows,
            value: form[key],
            placeholder: t(phKey),
            disabled: state.busy,
            onInput: (e) => {
              form[key] = e.target.value;
              counter.textContent = `${form[key].length} / ${MAX[key]}${t("counterUnit")}`;
            },
          });

    return el(
      "label",
      { className: "cc-field" },
      el("span", { className: "cc-label" }, el("span", {}, t(key)), counter),
      control,
      hintKey ? el("span", { className: "cc-hint-inline" }, t(hintKey)) : null,
    );
  };

  return el(
    "div",
    { className: "cc-editor" },
    el(
      "div",
      { className: "cc-editor-head" },
      el(
        "button",
        {
          className: "cc-btn cc-ghost",
          type: "button",
          onClick: () => {
            state.editing = null;
            state.confirmDelete = false;
            render();
          },
        },
        `← ${t("back")}`,
      ),
      existing
        ? el(
            "label",
            { className: "cc-toggle" },
            el("input", {
              type: "checkbox",
              checked: active,
              disabled: state.busy,
              onChange: (e) =>
                runBusy(async () => {
                  const res = await callTool("app_activate_persona", { id: state.editing, enabled: e.target.checked });
                  adopt(res);
                }),
            }),
            el("span", {}, t("enabledLabel")),
          )
        : null,
    ),
    makeField("name", 1, "namePh"),
    makeField("likes", 3, "likesPh"),
    makeField("relations", 3, "relationsPh"),
    makeField("bio", 6, "bioPh"),
    makeField("appearance", 3, "appearancePh"),
    makeField("userRelation", 3, "userRelationPh"),
    makeField("specialty", 2, "specialtyPh", "specialtyHint"),
    makeField("style", 3, "stylePh"),
    makeField("rules", 5, "rulesPh"),
    el(
      "label",
      { className: form.thinking ? "cc-switch cc-switch-on" : "cc-switch" },
      el("input", {
        className: "cc-switch-input",
        type: "checkbox",
        checked: Boolean(form.thinking),
        disabled: state.busy,
        onChange: (e) => {
          form.thinking = e.target.checked;
          render();
        },
      }),
      el(
        "span",
        { className: "cc-switch-body" },
        el("span", { className: "cc-switch-title" }, t("thinkingLabel")),
        el("span", { className: "cc-switch-hint" }, t("thinkingHint")),
      ),
    ),
    el(
      "div",
      { className: "cc-actions" },
      el(
        "button",
        {
          className: "cc-btn cc-primary",
          type: "button",
          disabled: state.busy,
          onClick: () =>
            runBusy(async () => {
              const payload = existing ? { ...form, id: state.editing } : { ...form };
              const res = await callTool("app_save_persona", payload);
              adopt(res);
              state.editing = null;
              state.message = { kind: "ok", text: res.active ? t("saved") : t("savedInactive") };
            }),
        },
        state.busy ? t("saving") : t("save"),
      ),
      existing
        ? el(
            "button",
            {
              className: "cc-btn cc-danger",
              type: "button",
              disabled: state.busy,
              onClick: () => {
                if (!state.confirmDelete) {
                  state.confirmDelete = true;
                  render();
                  return;
                }
                runBusy(async () => {
                  const res = await callTool("app_delete_persona", { id: state.editing });
                  adopt(res);
                  state.editing = null;
                  state.confirmDelete = false;
                  state.message = { kind: "ok", text: t("deleted") };
                });
              },
            },
            state.confirmDelete ? t("confirmDelete") : t("del"),
          )
        : null,
    ),
  );
}

function renderExportModal() {
  if (!state.exporting) return null;

  const doExport = async (copyOnly) => {
    await runBusy(async () => {
      const wantsCard = state.exportFormat === "v3";
      const res = await callTool("app_export", wantsCard ? { format: "v3", id: state.exportTarget } : { format: "dsh" });
      const text = `${JSON.stringify(res.value, null, 2)}\n`;
      if (copyOnly) {
        await navigator.clipboard.writeText(text);
        state.exporting = false;
        state.message = { kind: "ok", text: t("copied") };
        return;
      }
      const fallback = wantsCard ? "character.chara_card_v3.json" : `dsh-characards-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = res.fileName || fallback;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      state.exporting = false;
      const target = state.personas.find((p) => p.id === state.exportTarget);
      state.message = {
        kind: "ok",
        text: wantsCard ? `${t("exportV3Done")}${(target && target.name) || t("untitled")}` : t("exported"),
      };
    });
  };

  return el(
    "div",
    {
      className: "cc-modal",
      role: "dialog",
      "aria-modal": "true",
      onClick: (e) => {
        if (e.target === e.currentTarget) {
          state.exporting = false;
          render();
        }
      },
    },
    el(
      "div",
      { className: "cc-modal-card" },
      el("h2", { className: "cc-modal-title" }, t("exportTitle")),
      el("p", { className: "cc-modal-sub" }, t("exportFormatLabel")),
      el(
        "label",
        { className: "cc-radio" },
        el("input", {
          type: "radio",
          name: "cc-export-fmt",
          checked: state.exportFormat === "dsh",
          onChange: () => {
            state.exportFormat = "dsh";
            render();
          },
        }),
        el("span", {}, el("span", { className: "cc-radio-main" }, t("exportFormatDsh")), el("span", { className: "cc-radio-hint" }, t("exportFormatDshHint"))),
      ),
      el(
        "label",
        { className: "cc-radio" },
        el("input", {
          type: "radio",
          name: "cc-export-fmt",
          checked: state.exportFormat === "v3",
          onChange: () => {
            state.exportFormat = "v3";
            render();
          },
        }),
        el("span", {}, el("span", { className: "cc-radio-main" }, t("exportFormatV3")), el("span", { className: "cc-radio-hint" }, t("exportFormatV3Hint"))),
      ),
      state.exportFormat === "v3"
        ? el(
            "label",
            { className: "cc-field" },
            el("span", { className: "cc-label" }, t("exportPick")),
            el(
              "select",
              {
                className: "cc-select",
                value: state.exportTarget,
                disabled: state.busy,
                onChange: (e) => {
                  state.exportTarget = e.target.value;
                },
              },
              state.personas.map((p) => el("option", { value: p.id, selected: p.id === state.exportTarget }, p.name || t("untitled"))),
            ),
          )
        : null,
      el(
        "div",
        { className: "cc-modal-foot" },
        el("button", { className: "cc-btn", type: "button", onClick: () => { state.exporting = false; render(); } }, t("cancel")),
        navigator.clipboard
          ? el("button", { className: "cc-btn", type: "button", disabled: state.busy, onClick: () => doExport(true) }, t("copyBtn"))
          : null,
        el(
          "button",
          {
            className: "cc-btn cc-primary",
            type: "button",
            disabled: state.busy || (state.exportFormat === "v3" && !state.exportTarget),
            onClick: () => doExport(false),
          },
          t("exportConfirm"),
        ),
      ),
    ),
  );
}

function renderBoard() {
  const start = state.page * FRAMES;
  const pagePersonas = state.personas.slice(start, start + FRAMES);
  const pageCount = Math.max(1, Math.ceil(state.personas.length / FRAMES));
  const pageShown = Math.max(pageCount, state.page + 1);
  const canNext = pagePersonas.length === FRAMES && state.page + 1 < MAX_PAGES;

  const frames = [];
  for (let i = 0; i < FRAMES; i += 1) {
    frames.push(renderFrame(pagePersonas[i] || null, start + i));
  }

  const importInput = el("input", {
    className: "cc-file",
    type: "file",
    accept: ".json,application/json",
    disabled: state.busy,
    onChange: async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      await runBusy(async () => {
        const text = await file.text();
        const res = await callTool("app_import", { data: text, mode: "append" });
        adopt(res);
        const note = res.converted === "opentavern" ? `${t("importedCardNote")} ` : "";
        state.message = { kind: "ok", text: `${note}${t("importedPrefix")}${res.imported}${t("importedSuffix")}` };
      });
    },
  });

  return el(
    "div",
    {},
    el("div", { className: "cc-card" }, el("div", { className: "cc-board" }, frames)),
    el(
      "div",
      { className: "cc-pager" },
      el(
        "button",
        {
          className: "cc-btn",
          type: "button",
          disabled: state.busy || state.page === 0,
          onClick: () => refreshPage(Math.max(0, state.page - 1)),
        },
        t("prevPage"),
      ),
      el("span", { className: "cc-page-of" }, `${state.page + 1} / ${pageShown}`),
      el(
        "button",
        {
          className: "cc-btn",
          type: "button",
          disabled: state.busy || !canNext,
          title: canNext ? "" : t("pageFullHint"),
          onClick: () => refreshPage(state.page + 1),
        },
        t("nextPage"),
      ),
    ),
    el("p", { className: "cc-hint" }, t("photoHint")),
    el(
      "div",
      { className: "cc-toolbar" },
      el("label", { className: "cc-btn" }, t("importBtn"), importInput),
      el(
        "button",
        {
          className: "cc-btn",
          type: "button",
          disabled: state.busy || state.personas.length === 0,
          onClick: () => {
            state.exportFormat = "dsh";
            state.exportTarget = state.activeId || (state.personas[0] ? state.personas[0].id : "");
            state.exporting = true;
            render();
          },
        },
        t("exportBtn"),
      ),
    ),
  );
}

function render() {
  const active = state.personas.find((p) => p.id === state.activeId);
  const statusPill = el(
    "span",
    { className: active ? "cc-pill cc-pill-on" : "cc-pill" },
    active ? `${t("currentPrefix")}${active.name || t("untitled")}` : t("noneActive"),
  );

  let body;
  if (state.phase === "loading") {
    body = el("p", { className: "cc-muted" }, t("loading"));
  } else if (state.editing === "new" || state.personas.some((p) => p.id === state.editing)) {
    body = renderEditor();
  } else {
    body = renderBoard();
  }

  rootEl.replaceChildren(
    el(
      "div",
      { className: "cc-root" },
      el("div", { className: "cc-header" }, el("h1", { className: "cc-title" }, t("title")), statusPill),
      el("p", { className: "cc-sub" }, t("subtitle")),
      body,
      state.message
        ? el("p", { className: state.message.kind === "ok" ? "cc-msg cc-msg-ok" : "cc-msg cc-msg-err", role: "status" }, state.message.text)
        : null,
      renderExportModal(),
    ),
  );
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.exporting) {
    state.exporting = false;
    render();
  }
});

function applyHostContext(ctx) {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles && ctx.styles.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.locale) {
    dict = /^zh/i.test(String(ctx.locale)) ? TEXT_ZH : TEXT_EN;
  }
}

// Register handlers BEFORE connect() so no host notification is missed.
app.ontoolinput = ({ arguments: args }) => {
  if (args && Number.isInteger(args.page) && args.page >= 0 && args.page < MAX_PAGES) {
    state.page = args.page;
  }
};

app.ontoolresult = (result) => {
  const sc = result && result.structuredContent;
  if (sc && sc.value) {
    adopt(sc);
    state.phase = "ready";
    render();
  }
  // Fetch photos for the current page via app-only tool.
  refreshPage(state.page);
};

app.onhostcontextchanged = (ctx) => {
  applyHostContext(ctx);
  render();
};

render();

(async () => {
  try {
    await app.connect();
    applyHostContext(app.getHostContext());
    await refreshPage(state.page);
  } catch (error) {
    state.phase = "ready";
    state.message = { kind: "error", text: `${t("loadFailed")}${(error && error.message) || error}` };
    render();
  }
})();
