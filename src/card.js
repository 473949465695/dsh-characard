/**
 * Tavern / SillyTavern character card (chara_card_v1 / v2 / v3) conversion
 * and DSH bundle import/export helpers.
 */
import { LIMITS, MAX_PERSONAS, TEXT_FIELDS, clampString, normalizePersona } from "./schema.js";

const CARD_SECTION_ROUTES = Object.freeze([
  { field: "appearance", keywords: ["外貌", "颜值", "长相", "样貌", "外形", "身材", "体型", "感官", "视觉"] },
  { field: "appearance", keywords: ["穿搭", "服装", "衣着", "服饰", "装扮", "打扮"] },
  { field: "bio", keywords: ["个人简介", "简介", "身世", "身份"] },
  { field: "bio", keywords: ["性格", "个性", "气质", "心理", "人格"] },
  { field: "style", keywords: ["说话", "口吻", "语气", "言语", "语言", "口头", "谈吐", "台词"] },
  { field: "rules", keywords: ["必须遵守", "遵守", "规则", "禁忌", "禁止", "底线"] },
  // Background/lore is intentionally excluded from persona fields.
  { field: null, keywords: ["背景", "过往", "经历", "动机", "世界观", "时间线", "剧情"] },
  { field: "userRelation", keywords: ["与用户", "对用户", "用户关系", "主角", "对话者"] },
  { field: "relations", keywords: ["人际", "关系", "态度", "羁绊"] },
  { field: "specialty", keywords: ["特长", "技能", "擅长", "专长"] },
  { field: "likes", keywords: ["喜好", "喜欢", "爱好", "兴趣"] },
  { field: "extras", keywords: ["其他", "补充", "杂项"] },
]);

/**
 * Section titles written on `chara_card_v3` export so export -> import round trips losslessly.
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

export function replaceCardTokens(text, name) {
  return String(text || "")
    .replace(/\{\{\s*user\s*\}\}/gi, "用户")
    .replace(/\{\{\s*char(?:acter)?\s*\}\}/gi, name || "角色")
    .replace(/\{\{\s*persona\s*\}\}/gi, name || "角色");
}

export function cardDescription(persona) {
  const blocks = [];
  CARD_V3_SECTIONS.forEach(([title, field], index) => {
    const text = String(persona[field] || "").trim();
    if (!text) return;
    blocks.push(`${CHINESE_NUMERALS[index]}、${title}\n${replaceCardTokens(text, persona.name)}`);
  });
  return blocks.join("\n\n");
}

export function toCharacterCardV3(persona) {
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
      creator_notes: "由角色卡插件（dsh-characard）导出：只含人设资料，不含开场白、示例对话与世界书。",
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

export function safeFileName(name) {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || "character";
}

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

/** Joins blocks and proportionally trims each block if the field cap is exceeded. O(n) safe. */
export function bundleCardBlocks(blocks, max) {
  if (max <= 0) return "";
  const kept = blocks.filter((block) => block && block.length > 0);
  if (kept.length === 0) return "";
  const joined = kept.join("\n\n");
  if (joined.length <= max) return joined;
  if (max === 1) return "…";
  const budget = Math.max(kept.length, max - (kept.length - 1) * 2 - 1);
  const total = kept.reduce((sum, block) => sum + block.length, 0) || 1;
  const sliced = kept.map((block) => {
    const share = Math.max(Math.min(80, max), Math.floor((block.length / total) * budget));
    if (block.length <= share) return block;
    return `${block.slice(0, Math.max(1, share - 1)).trimEnd()}…`;
  });
  const text = sliced.join("\n\n");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

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

export function fromCharacterCard(value) {
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

/** Accepts an exported bundle, a bare `{ personas: [...] }`, a single persona, or a Tavern card. */
export function parseImport(payload) {
  let value = payload;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (value === null || typeof value !== "object") return undefined;
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
