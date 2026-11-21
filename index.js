/**
 * dsh-characard — host half.
 *
 * Owns two things:
 *   1. the persona library (a small JSON file inside the DSH profile directory,
 *      with character images stored as files next to it),
 *   2. the projection of the *active* persona into every model step
 *      (`systemPrompt.section`), plus a loopback-only HTTP bridge the Settings
 *      page uses to read and write the library.
 *
 * Only one persona is active at a time (`activeId`). The prompt text is
 * re-read from disk on every prompt assembly, so a save or a switch takes
 * effect on the next reply. No restart required.
 *
 * State layout (version 3):
 *   { version: 3, activeId: string | null,
 *     personas: [{ id, name, bio, likes, relations, appearance, userRelation,
 *                  specialty, style, rules, images, updatedAt }] }
 *
 * The Settings board shows four character frames per page and up to eight
 * pages, so the library holds at most `FRAMES_PER_PAGE * MAX_PAGES` personas.
 * `images` keeps the frame photo (`slot: 0`); the bytes live in
 * `<profile>/dsh-persona-images/`. Older files (version 1 and 2) are migrated
 * on read, `description` becomes `bio`, so an existing setup keeps working
 * after the upgrade.
 *
 * The state file and the image directory keep their original `dsh-persona`
 * names on purpose: they hold the user's characters and photos, so renaming
 * them would orphan an existing library. Only the package identity, the client
 * module id and the HTTP bridge follow the package name.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const BRIDGE = "/api/dsh-characard";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_IMAGE_BODY_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_BODY_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const PROMPT_MAX_CHARS = 9000;
const FRAMES_PER_PAGE = 4;
const MAX_PAGES = 8;
const MAX_PERSONAS = FRAMES_PER_PAGE * MAX_PAGES;
const MAX_IMAGES = 4;
const STATE_FILE = "dsh-persona.json";
const IMAGE_DIR = "dsh-persona-images";
const EXPORT_SCHEMA = "dsh-persona/v2";

const IMAGE_TYPES = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
});

/** Per-field caps, in characters. A save clamps instead of rejecting. */
const LIMITS = Object.freeze({
  name: 80,
  bio: 4000,
  likes: 1000,
  relations: 1000,
  appearance: 1000,
  userRelation: 1000,
  specialty: 500,
  style: 2000,
  rules: 4000,
});

/** Fields that carry persona text (everything but `name`). */
const TEXT_FIELDS = Object.freeze([
  "bio",
  "likes",
  "relations",
  "appearance",
  "userRelation",
  "specialty",
  "style",
  "rules",
]);

const EMPTY_PERSONA = Object.freeze({
  name: "",
  bio: "",
  likes: "",
  relations: "",
  appearance: "",
  userRelation: "",
  specialty: "",
  style: "",
  rules: "",
  /**
   * Per-persona switch: also write the reasoning/thinking text in character.
   * It is a prompt-level request, not a rewrite — the model writes its own
   * thinking, so this can only ask it to keep the voice, not guarantee it.
   */
  thinking: false,
});

const EMPTY_STATE = Object.freeze({
  version: 3,
  activeId: null,
  personas: [],
});

function profileDir() {
  const configured = process.env.DSH_PROFILE_DIR;
  if (typeof configured === "string" && configured.trim()) return configured;
  const profile = process.env.DSH_PROFILE;
  if (typeof profile === "string" && profile.trim()) {
    return path.join(os.homedir(), ".dsh", "profiles", profile);
  }
  return path.join(os.homedir(), ".dsh", "profiles", "desktop");
}

function statePath() {
  return path.join(profileDir(), STATE_FILE);
}

function imageDir() {
  return path.join(profileDir(), IMAGE_DIR);
}

function newId() {
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function clampString(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function imagePath(personaId, slot, ext) {
  return path.join(imageDir(), `${personaId}-${slot}.${ext}`);
}

function normalizeImages(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const images = [];
  for (const entry of input) {
    if (entry === null || typeof entry !== "object") continue;
    const slot = Number(entry.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_IMAGES || seen.has(slot)) continue;
    const ext = typeof entry.ext === "string" ? entry.ext.toLowerCase() : "";
    if (!IMAGE_TYPES[ext]) continue;
    seen.add(slot);
    images.push({ slot, ext, size: Number(entry.size) || 0 });
  }
  return images.sort((left, right) => left.slot - right.slot);
}

function normalizePersona(input) {
  const source = input !== null && typeof input === "object" ? input : {};
  const next = { ...EMPTY_PERSONA };
  for (const key of Object.keys(LIMITS)) next[key] = clampString(source[key], LIMITS[key]);
  // Version 1 and 2 called the free-form block `description`; it becomes the bio.
  if (!next.bio && typeof source.description === "string") next.bio = clampString(source.description, LIMITS.bio);
  next.id = typeof source.id === "string" && source.id ? source.id : newId();
  // A switch, not text: anything but a literal `true` means off.
  next.thinking = source.thinking === true;
  next.images = normalizeImages(source.images);
  next.updatedAt = typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : "";
  return next;
}

function normalizeState(input) {
  const source = input !== null && typeof input === "object" ? input : {};
  let raw = [];
  if (Array.isArray(source.personas)) {
    raw = source.personas;
  } else if (
    typeof source.name === "string" ||
    typeof source.description === "string" ||
    typeof source.bio === "string" ||
    typeof source.style === "string" ||
    typeof source.rules === "string"
  ) {
    // version 1: one flat persona with an `enabled` flag. The fixed id keeps
    // the migrated record stable even if the eager rewrite below fails.
    raw = [{ ...source, id: "p_legacy" }];
  }
  const personas = raw.slice(0, MAX_PERSONAS).map(normalizePersona);
  let activeId = null;
  if (typeof source.activeId === "string" && personas.some((persona) => persona.id === source.activeId)) {
    activeId = source.activeId;
  } else if (!Array.isArray(source.personas) && raw.length === 1 && source.enabled === true) {
    activeId = personas[0].id;
  }
  return { version: 3, activeId, personas };
}

function readState() {
  const file = statePath();
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return { ...EMPTY_STATE, personas: [] };
    throw error;
  }
  try {
    const parsed = JSON.parse(raw);
    const state = normalizeState(parsed);
    // Upgrade an older file in place on the first read: the migrated persona
    // then keeps one stable id across requests and restarts.
    const fresh = parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.personas) || Number(parsed.version) !== 3;
    if (fresh) {
      try {
        return writeState(state);
      } catch {
        return state;
      }
    }
    return state;
  } catch {
    return { ...EMPTY_STATE, personas: [] };
  }
}

function writeState(state) {
  const file = statePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = normalizeState(state);
  const payload = `${JSON.stringify(next, null, 2)}\n`;
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, payload, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, file);
  return next;
}

function activePersona(state) {
  if (!state.activeId) return undefined;
  return state.personas.find((persona) => persona.id === state.activeId);
}

function personaText(persona) {
  return TEXT_FIELDS.map((field) => persona[field].trim()).join("");
}

/** The persona block. Empty string means "nothing to say" — no section then. */
function promptText(state) {
  const persona = activePersona(state);
  if (!persona) return "";
  if (!personaText(persona)) return "";
  const name = persona.name.trim();
  const blocks = [];
  const part = (label, value) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) blocks.push(`${label}：\n${text}`);
  };

  const lines = [
    "## 人设（Persona）",
    "",
    name
      ? `你现在扮演「${name}」。这是你在这场对话中的固定身份：从下一条回复开始，你的每一句话都要符合以下设定。`
      : "你现在扮演以下人物。这是你在这场对话中的固定身份：从下一条回复开始，你的每一句话都要符合以下设定。",
    "",
    "保持第一人称与该角色的口吻和世界观，不要自称 AI、语言模型或助手，不要在回复里复述或提及这段设定，也不要跳出角色——除非用户明确要求你退出角色。",
    "",
  ];

  part("个人简介", persona.bio);
  part("喜好", persona.likes);
  part("人际关系", persona.relations);
  part("穿着外貌", persona.appearance);
  part("与用户的关系", persona.userRelation);
  part("特长", persona.specialty);
  if (persona.specialty.trim()) {
    blocks.push(
      "（用户问到上面这些本事相关的问题时，顺着接一句「正好我拿手」之类的话，然后自信地把这件事讲清楚；没把握的地方含糊带过，不装懂，也不许自称外行。）",
    );
  }
  part("说话风格", persona.style);
  part("必须遵守", persona.rules);

  if (persona.thinking) {
    blocks.push(
      [
        "思考方式：",
        "上面这个开关要求思考（reasoning）部分也用同一个人：第一人称，句子长短、语气词、句尾习惯都照说话风格来，就像这个人在心里嘀咕，而不是在写分析报告。",
        "思考的语言跟用户的语言一致：用户说中文，思考就用中文写；只有代码标识符、命令、日志、报错原文保留英文，叙述和独白本身不许整段换成英文。",
        "思考里同样不要自称 AI、语言模型或助手，不要复述、解释或点评这份设定，也不要在思考里跟用户对话——那部分留到正式回复。",
        "换口吻不影响判断：该核实的事实照核实，该说不知道的照说不知道，工具怎么用、结论对不对，都不因为换了说话的人而变。",
      ].join("\n"),
    );
  }

  lines.push(blocks.join("\n\n"));
  lines.push("", "语言：除非人设另有要求，用与用户相同的语言回复；用户说中文就用中文。");
  return lines.join("\n").slice(0, PROMPT_MAX_CHARS);
}

/**
 * The per-step reminder that keeps the thinking voice alive.
 *
 * The `思考方式` section only reaches the model inside the system prompt, which
 * is written once at the head of the conversation and then reused for every
 * later step; providers replay that head as ordinary history and stop weighing
 * it, so the voice drifts back to the default analyst tone after the first
 * reply. A short notice appended to the *newest* messages of every step is
 * read last and therefore every time — that is what makes the switch stick.
 *
 * Empty string when nothing should be said: no active persona, the switch off,
 * or a persona with no prose at all.
 */
function thinkingReminder(state) {
  const persona = activePersona(state);
  if (!persona || persona.thinking !== true) return "";
  if (!personaText(persona)) return "";
  const name = persona.name.trim();
  const who = name ? `「${name}」` : "当前人设";
  const body = [
    `接下来的思考（reasoning）也用${who}的口吻写：第一人称，句子短，语气词和句尾照说话风格，像这个人在心里嘀咕。`,
    "思考用中文写（用户用什么语言就用什么语言），只有代码、命令、日志、报错原文保留英文；不要整段英文思考。",
    "不要写成「用户要求……」「我需要检查……」「让我看看……」那种分析报告腔；思考里不自称 AI 或助手，不复述、不点评设定，不在思考里跟用户说话。",
    "该核实的事实照核实，该说不知道的照说不知道，判断力不因为换口吻而变。",
  ].join("");
  return `<system-reminder>\n${body}\n</system-reminder>`;
}

/**
 * Whether this step gets a reminder.
 *
 * The first step of a turn is the important one, and a long turn can run a
 * hundred steps — one reminder at the head of it is as buried as the system
 * prompt by the time the last step asks for its reasoning. So the reminder
 * repeats: step 1, then every {@link REMINDER_EVERY} steps. Between the two the
 * message list is stable, so the prompt prefix stays cacheable.
 */
const REMINDER_EVERY = 8;

function reminderDue(step) {
  if (typeof step !== "number" || !Number.isFinite(step) || step < 1) return true;
  return (step - 1) % REMINDER_EVERY === 0;
}

/** A compact user-role notice carrying {@link thinkingReminder}. */
function reminderMessage(text) {
  return {
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "dsh-characard", form: "notice", summary: "思考口吻" },
  };
}

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

function refuse(request, response, status, body) {
  writeJson(response, status, body);
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

function pickFields(body) {
  const picked = {};
  for (const key of Object.keys(LIMITS)) {
    if (typeof body[key] === "string") picked[key] = body[key];
  }
  // The thinking switch travels with the same save call; a missing key keeps
  // whatever the stored persona already had.
  if (typeof body.thinking === "boolean") picked.thinking = body.thinking;
  return picked;
}

function pickImage(body) {
  if (body === null || typeof body !== "object") return undefined;
  const slot = Number(body.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_IMAGES) return undefined;
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const match = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return { slot, error: "expected a base64 data URL" };
  const ext = Object.keys(IMAGE_TYPES).find((key) => IMAGE_TYPES[key] === match[1]);
  if (!ext) return { slot, error: "supported formats: PNG, JPG, WebP, GIF" };
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) return { slot, error: "empty image" };
  if (bytes.length > MAX_IMAGE_BYTES) return { slot, error: "image is larger than 4 MB" };
  return { slot, ext, bytes };
}

function saveImage(persona, slot, ext, bytes) {
  fs.mkdirSync(imageDir(), { recursive: true });
  const target = imagePath(persona.id, slot, ext);
  fs.writeFileSync(target, bytes, { mode: 0o600 });
  for (const previous of persona.images) {
    if (previous.slot !== slot) continue;
    if (previous.ext === ext) continue;
    removeImageFile(persona.id, slot, previous.ext);
  }
  persona.images = normalizeImages([
    ...persona.images.filter((entry) => entry.slot !== slot),
    { slot, ext, size: bytes.length },
  ]);
}

function removeImageFile(personaId, slot, ext) {
  try {
    fs.unlinkSync(imagePath(personaId, slot, ext));
  } catch (error) {
    if (!error || error.code !== "ENOENT") console.warn("[dsh-characard] cannot remove an image:", error);
  }
}

function dropImage(persona, slot) {
  for (const entry of persona.images) {
    if (entry.slot === slot) removeImageFile(persona.id, slot, entry.ext);
  }
  persona.images = persona.images.filter((entry) => entry.slot !== slot);
}

function dropAllImages(personaId, images) {
  for (const entry of images) removeImageFile(personaId, entry.slot, entry.ext);
}

/** `{ slot, dataUrl }` for the browser; missing files are skipped. */
function imageViews(persona) {
  const views = [];
  for (const entry of persona.images) {
    try {
      const bytes = fs.readFileSync(imagePath(persona.id, entry.slot, entry.ext));
      views.push({ slot: entry.slot, dataUrl: `data:${IMAGE_TYPES[entry.ext]};base64,${bytes.toString("base64")}` });
    } catch (error) {
      if (!error || error.code !== "ENOENT") console.warn("[dsh-characard] cannot read an image:", error);
    }
  }
  return views;
}

function imageExports(persona) {
  return imageViews(persona).map((view) => ({ slot: view.slot, dataUrl: view.dataUrl }));
}

/** Writes the images of an imported persona; returns its stored metadata. */
function importImages(persona, rawImages) {
  if (!Array.isArray(rawImages)) return persona.images;
  for (const entry of rawImages) {
    const picked = pickImage(entry);
    if (!picked || picked.error) continue;
    try {
      saveImage(persona, picked.slot, picked.ext, picked.bytes);
    } catch (error) {
      console.warn("[dsh-characard] cannot store an imported image:", error);
    }
  }
  return persona.images;
}

/**
 * Opentavern / SillyTavern character cards (`chara_card_v1`, `chara_card_v2`,
 * `chara_card_v3`). Only the persona itself is imported: the background and the
 * scenario, the greeting, the example dialogue and the lorebook are not part of
 * a persona, so they stay out of the six fields.
 */
const CARD_SECTION_ROUTES = Object.freeze([
  { field: "appearance", keywords: ["外貌", "颜值", "长相", "样貌", "外形", "身材", "体型", "感官", "视觉"] },
  { field: "appearance", keywords: ["穿搭", "服装", "衣着", "服饰", "装扮", "打扮"] },
  { field: "bio", keywords: ["个人简介", "简介", "身世", "身份"] },
  { field: "bio", keywords: ["性格", "个性", "气质", "心理", "人格"] },
  { field: "style", keywords: ["说话", "口吻", "语气", "言语", "语言", "口头", "谈吐", "台词"] },
  { field: "rules", keywords: ["必须遵守", "遵守", "规则", "禁忌", "禁止", "底线"] },
  // The background is deliberately not imported.
  { field: null, keywords: ["背景", "过往", "经历", "动机", "世界观", "时间线", "剧情"] },
  { field: "userRelation", keywords: ["与用户", "对用户", "用户关系", "主角", "对话者"] },
  { field: "relations", keywords: ["人际", "关系", "态度", "羁绊"] },
  { field: "specialty", keywords: ["特长", "技能", "擅长", "专长"] },
  { field: "likes", keywords: ["喜好", "喜欢", "爱好", "兴趣"] },
  { field: "extras", keywords: ["其他", "补充", "杂项"] },
]);

/**
 * Section titles this plugin writes when exporting a `chara_card_v3`, and the
 * field each one carries. Re-importing such a card drops the heading again so
 * export → import is lossless for the eight persona fields.
 */
const CARD_V3_SECTIONS = Object.freeze([
  ["个人简介", "bio"],
  ["喜好", "likes"],
  ["关系", "relations"],
  ["穿着外貌", "appearance"],
  ["与用户关系", "userRelation"],
  ["特长", "specialty"],
  ["说话方式", "style"],
  ["必须遵守", "rules"],
]);
const OWN_SECTION_TITLES = new Set(CARD_V3_SECTIONS.map(([title]) => title));
const CHINESE_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八"];

/** Builds the `description` of an exported card: one numbered section per field. */
function cardDescription(persona) {
  const blocks = [];
  CARD_V3_SECTIONS.forEach(([title, field], index) => {
    const text = String(persona[field] || "").trim();
    if (!text) return;
    blocks.push(`${CHINESE_NUMERALS[index]}、${title}\n${replaceCardTokens(text, persona.name)}`);
  });
  return blocks.join("\n\n");
}

/** `chara_card_v3` payload for one persona (persona data only, no greeting). */
function toCharacterCardV3(persona) {
  const name = String(persona.name || "").trim() || "未命名角色";
  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      name,
      description: cardDescription(persona),
      personality: "",
      scenario: "",
      first_mes: "",
      mes_example: "",
      creator_notes: "由 DSH 角色卡（dsh-characard）导出：只含人设资料，不含开场白、示例对话与世界书。",
      system_prompt: "",
      post_history_instructions: "",
      tags: [],
      creator: "dsh-characard",
      character_version: "1.0",
      extensions: {},
      group_only_greetings: [],
    },
  };
}

/** A download-safe file stem for one persona name. */
function safeFileName(name) {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || "character";
}

/** Splits a card description into `- 一、外貌系统` style sections. */
function splitNumberedSections(text) {
  const sections = [];
  const preamble = [];
  let current = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    const header = /^\s*(?:[一二三四五六七八九十]+、|\d+[.、])\s*(.+?)\s*$/.exec(line);
    if (header) {
      current = { title: header[1], lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  return {
    preamble: preamble.join("\n").trim(),
    sections: sections.map((section) => ({ title: section.title, body: section.lines.join("\n").trim() })),
  };
}

/** Splits a section into `颜值（脖子以上）：` style labelled blocks. */
function splitLabelledBlocks(text) {
  const blocks = [];
  let current = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    const label = /^\s*([^\s\-*•#][^\r\n]{0,30}?)[:：]\s*$/.exec(line);
    if (label) {
      current = { label: label[1].trim(), lines: [] };
      blocks.push(current);
      continue;
    }
    if (!current) {
      current = { label: "", lines: [] };
      blocks.push(current);
    }
    current.lines.push(line);
  }
  return blocks
    .map((block) => ({ label: block.label, body: block.lines.join("\n").trim() }))
    .filter((block) => block.body || block.label);
}

function routeCardSection(title) {
  for (const route of CARD_SECTION_ROUTES) {
    if (route.keywords.some((keyword) => title.includes(keyword))) return route.field;
  }
  return "bio";
}

function routeCardExtras(body, parts) {
  for (const block of splitLabelledBlocks(body)) {
    if (!block.body) continue;
    if (/(?:讨厌|厌恶|不喜欢)/.test(block.label)) parts.likes.push(`讨厌：${block.body}`);
    else if (/(?:喜欢|爱好|喜好|兴趣)/.test(block.label)) parts.likes.push(`喜欢：${block.body}`);
    else if (/(?:技能|能力|特长|专长|擅长|本事)/.test(block.label)) parts.specialty.push(block.body);
    else parts.bio.push(block.label ? `${block.label}\n${block.body}` : block.body);
  }
}

function routeCardRelations(body, parts) {
  const blocks = splitLabelledBlocks(body);
  const labelled = blocks.some((block) => block.label);
  for (const block of blocks) {
    if (!block.body) continue;
    const label = block.label || (labelled ? "" : block.body);
    const heading = block.label ? `${block.label}\n${block.body}` : block.body;
    if (/(?:用户|\{\{\s*user\s*\}\}|老师|主人|玩家|对话者|关系动态|态度)/.test(label)) {
      parts.userRelation.push(heading);
    } else {
      parts.relations.push(heading);
    }
  }
}

function replaceCardTokens(text, name) {
  return String(text || "")
    .replace(/\{\{\s*user\s*\}\}/gi, "用户")
    .replace(/\{\{\s*char(?:acter)?\s*\}\}/gi, name || "角色")
    .replace(/\{\{\s*persona\s*\}\}/gi, name || "角色");
}

/** Joins blocks and, when the field cap is hit, keeps a slice of every block. */
function bundleCardBlocks(blocks, max) {
  const kept = blocks.filter((block) => block && block.length > 0);
  if (kept.length === 0) return "";
  const joined = kept.join("\n\n");
  if (joined.length <= max) return joined;
  const budget = Math.max(kept.length * 80, max - (kept.length - 1) * 2 - 1);
  const total = kept.reduce((sum, block) => sum + block.length, 0) || 1;
  const sliced = kept.map((block) => {
    const share = Math.max(80, Math.floor((block.length / total) * budget));
    if (block.length <= share) return block;
    return `${block.slice(0, Math.max(1, share - 1)).trimEnd()}…`;
  });
  let text = sliced.join("\n\n");
  while (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}…`;
  return text;
}

/** Returns the card's payload, or undefined when the value is not a card. */
function characterCardData(value) {
  if (value === null || typeof value !== "object") return undefined;
  const spec = typeof value.spec === "string" ? value.spec : "";
  const wrapped = value.data;
  if (wrapped !== null && typeof wrapped === "object") {
    const named = typeof wrapped.name === "string" && typeof wrapped.description === "string";
    const marked = /^chara_card/i.test(spec) || typeof value.spec_version === "string";
    if (named && (marked || wrapped.personality !== undefined || wrapped.first_mes !== undefined)) return wrapped;
  }
  if (typeof value.name === "string" && typeof value.description === "string") {
    const looksLikeCard =
      /^chara_card/i.test(spec) ||
      value.personality !== undefined ||
      value.first_mes !== undefined ||
      value.mes_example !== undefined ||
      value.scenario !== undefined;
    if (looksLikeCard) return value;
  }
  return undefined;
}

/** Converts an Opentavern card into the six persona fields (persona only). */
function fromCharacterCard(value) {
  const data = characterCardData(value);
  if (!data) return undefined;
  const name = clampString(String(data.name || "").trim(), LIMITS.name);
  const parts = {
    bio: [],
    likes: [],
    relations: [],
    appearance: [],
    userRelation: [],
    specialty: [],
    style: [],
    rules: [],
  };
  const split = splitNumberedSections(typeof data.description === "string" ? data.description : "");
  if (split.preamble) parts.bio.push(split.preamble);
  for (const section of split.sections) {
    if (!section.body) continue;
    const route = routeCardSection(section.title);
    if (route === null) continue;
    if (route === "extras") {
      routeCardExtras(section.body, parts);
      continue;
    }
    if (route === "relations") {
      routeCardRelations(section.body, parts);
      continue;
    }
    // Our own exports carry the field name as the heading; drop it on the way
    // back so the round trip keeps the field text untouched.
    parts[route].push(OWN_SECTION_TITLES.has(section.title) ? section.body : `${section.title}\n${section.body}`);
  }
  const personality = typeof data.personality === "string" ? data.personality.trim() : "";
  if (personality) {
    const head = personality.slice(0, 24);
    if (!parts.bio.join("\n").includes(head)) parts.bio.push(`性格：${personality}`);
  }
  const draft = { name };
  for (const field of TEXT_FIELDS) {
    const blocks = parts[field].map((block) => replaceCardTokens(block, name));
    draft[field] = bundleCardBlocks(blocks, LIMITS[field]);
  }
  return draft;
}

/** Accepts an exported bundle, a bare {personas:[...]}, a single persona, or a Tavern card. */
function parseImport(payload) {
  let value = payload;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (value === null || typeof value !== "object") return undefined;
  // A character card carries `description`/`personality`; convert it first so
  // the generic "one flat persona" branch below does not swallow it.
  const card = fromCharacterCard(value);
  if (card) return [{ persona: normalizePersona({ ...card, id: undefined }), converted: "opentavern" }];
  const raw = Array.isArray(value.personas)
    ? value.personas
    : typeof value.name === "string" || typeof value.description === "string" || typeof value.bio === "string"
      ? [value]
      : Array.isArray(value) ? value : undefined;
  if (!raw) return undefined;
  const personas = raw
    .filter((entry) => entry !== null && typeof entry === "object")
    .slice(0, MAX_PERSONAS)
    .map((entry) => ({ persona: normalizePersona({ ...entry, id: undefined }), images: entry.images }));
  return personas.length > 0 ? personas : undefined;
}

function viewOf(state) {
  return {
    version: 3,
    activeId: state.activeId,
    personas: state.personas.map((persona) => ({ ...persona, images: imageViews(persona) })),
  };
}

function reply(response, state) {
  writeJson(response, 200, { ok: true, value: viewOf(state), active: Boolean(promptText(state)) });
}

function guarded(handler) {
  return async (request, response) => {
    if (!isLoopbackRequest(request)) {
      refuse(request, response, 403, { ok: false, message: "loopback requests only" });
      return;
    }
    if (request.method !== "POST") {
      refuse(request, response, 405, { ok: false, message: "POST only" });
      return;
    }
    try {
      await handler(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[dsh-characard] bridge failure:", error);
      if (!response.headersSent) refuse(request, response, 500, { ok: false, message });
    }
  };
}

function badBody(request, response) {
  refuse(request, response, 400, { ok: false, message: "malformed JSON body" });
}

function findPersona(state, id) {
  return state.personas.find((persona) => persona.id === id);
}

function makeRoutes() {
  return [
    {
      kind: "exact",
      path: `${BRIDGE}/get`,
      handler: guarded(async (request, response) => {
        reply(response, readState());
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/save`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request);
        if (body === undefined) {
          badBody(request, response);
          return;
        }
        const state = readState();
        const fields = pickFields(body);
        const id = typeof body.id === "string" && body.id ? body.id : undefined;
        let personaId;
        if (id && findPersona(state, id)) {
          personaId = id;
          state.personas = state.personas.map((persona) =>
            persona.id === id
              ? normalizePersona({ ...persona, ...fields, updatedAt: new Date().toISOString() })
              : persona,
          );
        } else {
          if (state.personas.length >= MAX_PERSONAS) {
            refuse(request, response, 400, { ok: false, message: `at most ${MAX_PERSONAS} personas` });
            return;
          }
          const created = normalizePersona({ ...fields, updatedAt: new Date().toISOString() });
          personaId = created.id;
          state.personas = [...state.personas, created];
          // First persona in an empty library becomes active right away.
          if (state.personas.length === 1) state.activeId = personaId;
        }
        const saved = writeState(state);
        writeJson(response, 200, {
          ok: true,
          personaId,
          value: viewOf(saved),
          active: Boolean(promptText(saved)),
        });
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/activate`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request);
        if (body === undefined) {
          badBody(request, response);
          return;
        }
        const state = readState();
        const id = typeof body.id === "string" ? body.id : "";
        if (!findPersona(state, id)) {
          refuse(request, response, 404, { ok: false, message: "persona not found" });
          return;
        }
        // Only one persona can be on: switching overwrites the single active id.
        state.activeId = body.enabled === false ? (state.activeId === id ? null : state.activeId) : id;
        reply(response, writeState(state));
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/delete`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request);
        if (body === undefined) {
          badBody(request, response);
          return;
        }
        const id = typeof body.id === "string" ? body.id : "";
        const state = readState();
        const victim = findPersona(state, id);
        if (!victim) {
          refuse(request, response, 404, { ok: false, message: "persona not found" });
          return;
        }
        dropAllImages(victim.id, victim.images);
        state.personas = state.personas.filter((persona) => persona.id !== id);
        if (state.activeId === id) state.activeId = null;
        reply(response, writeState(state));
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/image`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request, MAX_IMAGE_BODY_BYTES);
        if (body === undefined) {
          badBody(request, response);
          return;
        }
        const state = readState();
        const persona = findPersona(state, typeof body.id === "string" ? body.id : "");
        if (!persona) {
          refuse(request, response, 404, { ok: false, message: "save the persona before adding images" });
          return;
        }
        const picked = pickImage(body);
        if (!picked || picked.error) {
          refuse(request, response, 400, { ok: false, message: (picked && picked.error) || "invalid image" });
          return;
        }
        saveImage(persona, picked.slot, picked.ext, picked.bytes);
        persona.updatedAt = new Date().toISOString();
        reply(response, writeState(state));
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/image-remove`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request);
        if (body === undefined) {
          badBody(request, response);
          return;
        }
        const state = readState();
        const persona = findPersona(state, typeof body.id === "string" ? body.id : "");
        if (!persona) {
          refuse(request, response, 404, { ok: false, message: "persona not found" });
          return;
        }
        const slot = Number(body.slot);
        if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_IMAGES) {
          refuse(request, response, 400, { ok: false, message: "invalid slot" });
          return;
        }
        dropImage(persona, slot);
        persona.updatedAt = new Date().toISOString();
        reply(response, writeState(state));
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/import`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request, MAX_IMPORT_BODY_BYTES);
        if (body === undefined) {
          badBody(request, response);
          return;
        }
        const parsed = parseImport(body.data);
        if (!parsed) {
          refuse(request, response, 400, { ok: false, message: "unrecognized persona file" });
          return;
        }
        const state = readState();
        const mode = body.mode === "replace" ? "replace" : "append";
        const kept = mode === "replace" ? [] : state.personas;
        if (mode === "replace") {
          for (const persona of state.personas) dropAllImages(persona.id, persona.images);
        }
        const imported = parsed.map((entry) => {
          const persona = entry.persona;
          if (Array.isArray(entry.images) && entry.images.length > 0) importImages(persona, entry.images);
          return persona;
        });
        state.personas = [...kept, ...imported].slice(0, MAX_PERSONAS);
        if (mode === "replace") state.activeId = null;
        if (state.activeId && !findPersona(state, state.activeId)) state.activeId = null;
        // A first-ever import should not leave the library switched off.
        if (!state.activeId && kept.length === 0 && state.personas.length > 0) {
          state.activeId = state.personas[0].id;
        }
        const saved = writeState(state);
        writeJson(response, 200, {
          ok: true,
          imported: imported.length,
          ...(parsed.some((entry) => entry.converted === "opentavern") ? { converted: "opentavern" } : {}),
          value: viewOf(saved),
          active: Boolean(promptText(saved)),
        });
      }),
    },
    {
      kind: "exact",
      path: `${BRIDGE}/export`,
      handler: guarded(async (request, response) => {
        const body = await readJsonBody(request);
        if (body === undefined) {
          refuse(request, response, 400, { ok: false, message: "malformed JSON body" });
          return;
        }
        const state = readState();
        const stamp = new Date().toISOString().slice(0, 10);
        if (body.format === "v3") {
          if (state.personas.length === 0) {
            refuse(request, response, 400, { ok: false, message: "no personas to export" });
            return;
          }
          const wanted = typeof body.id === "string" ? body.id : state.activeId;
          const persona =
            state.personas.find((entry) => entry.id === wanted) ||
            state.personas.find((entry) => entry.id === state.activeId) ||
            state.personas[0];
          writeJson(response, 200, {
            ok: true,
            format: "chara_card_v3",
            fileName: `${safeFileName(persona.name)}.chara_card_v3.json`,
            value: toCharacterCardV3(persona),
          });
          return;
        }
        writeJson(response, 200, {
          ok: true,
          format: "dsh",
          fileName: `dsh-characards-${stamp}.json`,
          value: {
            schema: EXPORT_SCHEMA,
            exportedAt: new Date().toISOString(),
            personas: state.personas.map((persona) => ({
              id: persona.id,
              name: persona.name,
              bio: persona.bio,
              likes: persona.likes,
              relations: persona.relations,
              appearance: persona.appearance,
              userRelation: persona.userRelation,
              specialty: persona.specialty,
              style: persona.style,
              rules: persona.rules,
              thinking: persona.thinking === true,
              images: imageExports(persona),
              active: persona.id === state.activeId,
            })),
          },
        });
      }),
    },
  ];
}

export function apply(ctx) {
  ctx.inject(["systemPrompt"], (promptCtx) => {
    promptCtx.effect(() => {
      // The section text is a function: `systemPrompt.assemble()` calls it once
      // per model step, and `renderPrompt` drops sections that resolve to "".
      // Reading the library here (instead of caching it) is what makes a save or
      // a switch take effect on the very next reply without re-registering.
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

  ctx.effect(() => {
    const dispose = ctx.on("agent/pre-step", async (payload, next) => {
      const decision = await next();
      if (decision.kind !== "enter") return decision;
      let text = "";
      try {
        text = thinkingReminder(readState());
      } catch (error) {
        console.warn("[dsh-characard] cannot read the persona library:", error);
        return decision;
      }
      if (!text) return decision;
      if (!reminderDue(payload.step)) return decision;
      return { ...decision, messages: [...decision.messages, reminderMessage(text)] };
    }, { prepend: true });
    return () => dispose();
  }, "persona: thinking reminder");

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

/** Internal hooks for the render/bridge smoke tests. Not part of the plugin contract. */
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
