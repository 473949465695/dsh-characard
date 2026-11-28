/**
 * Schema constants, field caps, and pure normalization helpers for dsh-characard.
 * Shared across the DSH host, Antigravity MCP server, Antigravity hooks, and tests.
 */
import { randomUUID } from "node:crypto";

export const BRIDGE = "/api/dsh-characard";
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_IMAGE_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_BODY_BYTES = 32 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const PROMPT_MAX_CHARS = 9000;
export const FRAMES_PER_PAGE = 4;
export const MAX_PAGES = 8;
export const MAX_PERSONAS = FRAMES_PER_PAGE * MAX_PAGES;
export const MAX_IMAGES = 4;
export const STATE_FILE = "dsh-persona.json";
export const IMAGE_DIR = "dsh-persona-images";
export const EXPORT_SCHEMA = "dsh-persona/v2";

export const IMAGE_TYPES = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
});

/** Per-field caps, in characters. Saves clamp instead of rejecting. */
export const LIMITS = Object.freeze({
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

/** Fields that carry persona prose (everything except `name`). */
export const TEXT_FIELDS = Object.freeze([
  "bio",
  "likes",
  "relations",
  "appearance",
  "userRelation",
  "specialty",
  "style",
  "rules",
]);

export const EMPTY_PERSONA = Object.freeze({
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
   * Prompt-level request, not a post-hoc rewrite.
   */
  thinking: false,
});

export const EMPTY_STATE = Object.freeze({
  version: 3,
  activeId: null,
  personas: [],
});

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function newId() {
  return `p_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

/** Ensures persona ids are always filesystem-safe (prevents path traversal in image paths). */
export function sanitizeId(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return SAFE_ID_RE.test(trimmed) ? trimmed : "";
}

export function clampString(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function normalizeImages(input) {
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

export function normalizePersona(input) {
  const source = input !== null && typeof input === "object" ? input : {};
  const next = { ...EMPTY_PERSONA };
  for (const key of Object.keys(LIMITS)) next[key] = clampString(source[key], LIMITS[key]);
  // Version 1 and 2 called the free-form block `description`; it becomes `bio`.
  if (!next.bio && typeof source.description === "string") next.bio = clampString(source.description, LIMITS.bio);
  next.id = sanitizeId(source.id) || newId();
  // A switch, not text: anything other than literal `true` means off.
  next.thinking = source.thinking === true;
  next.images = normalizeImages(source.images);
  next.updatedAt = typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : "";
  return next;
}

export function normalizeState(input) {
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
    // Version 1: one flat persona with an `enabled` flag.
    raw = [{ ...source, id: "p_legacy" }];
  }
  const personas = raw.slice(0, MAX_PERSONAS).map(normalizePersona);
  // Deduplicate ids so corrupted state cannot confuse lookups.
  const seenIds = new Set();
  for (const persona of personas) {
    if (seenIds.has(persona.id)) persona.id = newId();
    seenIds.add(persona.id);
  }
  let activeId = null;
  if (typeof source.activeId === "string" && personas.some((persona) => persona.id === source.activeId)) {
    activeId = source.activeId;
  } else if (!Array.isArray(source.personas) && raw.length === 1 && source.enabled === true) {
    activeId = personas[0].id;
  }
  return { version: 3, activeId, personas };
}

export function pickFields(body) {
  const picked = {};
  if (body === null || typeof body !== "object") return picked;
  for (const key of Object.keys(LIMITS)) {
    if (typeof body[key] === "string") picked[key] = body[key];
  }
  // Missing `thinking` keeps the existing stored boolean on update.
  if (typeof body.thinking === "boolean") picked.thinking = body.thinking;
  return picked;
}

export function findPersona(state, id) {
  return state.personas.find((persona) => persona.id === id);
}

export function activePersona(state) {
  if (!state.activeId) return undefined;
  return findPersona(state, state.activeId);
}

export function personaText(persona) {
  return TEXT_FIELDS.map((field) => persona[field].trim()).join("");
}

/** Validates image magic bytes against the claimed extension. */
export function hasValidImageHeader(ext, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 4) return false;
  switch (ext) {
    case "png":
      return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    case "jpg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "gif":
      return bytes.length >= 6 && bytes.subarray(0, 4).toString("ascii") === "GIF8";
    case "webp":
      return (
        bytes.length >= 12 &&
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WEBP"
      );
    default:
      return false;
  }
}

export function pickImage(body) {
  if (body === null || typeof body !== "object") return undefined;
  const slot = Number(body.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_IMAGES) return undefined;
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl.trim() : "";
  const match = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return { slot, error: "expected a base64 data URL" };
  const ext = Object.keys(IMAGE_TYPES).find((key) => IMAGE_TYPES[key] === match[1].toLowerCase());
  if (!ext) return { slot, error: "supported formats: PNG, JPG, WebP, GIF" };
  const cleaned = match[2].replace(/\s+/g, "");
  const bytes = Buffer.from(cleaned, "base64");
  if (bytes.length === 0) return { slot, error: "empty image" };
  if (bytes.length > MAX_IMAGE_BYTES) return { slot, error: "image is larger than 4 MB" };
  if (!hasValidImageHeader(ext, bytes)) return { slot, error: `image content does not match ${ext.toUpperCase()}` };
  return { slot, ext, bytes };
}
