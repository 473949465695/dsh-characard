/**
 * Persona library persistence, image storage, and high-level CRUD operations.
 *
 * Data directory resolution supports both DSH and Antigravity seamlessly:
 *   1. `CHARACARD_DATA_DIR` (explicit override)
 *   2. `DSH_PROFILE_DIR` / `DSH_PROFILE` (when running inside DSH)
 *   3. `CHARACARD_PLUGIN_DATA` / `PLUGIN_DATA` (if it already contains a library)
 *   4. Existing DSH desktop profile (`~/.dsh/profiles/desktop`) if present
 *      (lets users share their existing character cards with Antigravity automatically)
 *   5. `CHARACARD_PLUGIN_DATA` / `PLUGIN_DATA` (fresh Antigravity-only install)
 *   6. Default `~/.dsh/profiles/desktop`
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  EMPTY_STATE,
  IMAGE_DIR,
  IMAGE_TYPES,
  MAX_IMAGES,
  MAX_PERSONAS,
  STATE_FILE,
  findPersona,
  normalizeImages,
  normalizePersona,
  normalizeState,
  pickFields,
  pickImage,
  sanitizeId,
} from "./schema.js";
import { parseImport, safeFileName, toCharacterCardV3 } from "./card.js";
import { EXPORT_SCHEMA } from "./schema.js";

/** Lightweight stat-keyed cache to avoid re-parsing JSON on every step when unchanged. */
let stateCache = { file: "", mtimeMs: -1, size: -1, state: null };

export function clearStateCache() {
  stateCache = { file: "", mtimeMs: -1, size: -1, state: null };
}

function cloneState(state) {
  return {
    version: state.version,
    activeId: state.activeId,
    personas: state.personas.map((persona) => ({
      ...persona,
      images: persona.images.map((image) => ({ ...image })),
    })),
  };
}

export function profileDir() {
  const explicit = process.env.CHARACARD_DATA_DIR;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const dshDir = process.env.DSH_PROFILE_DIR;
  if (typeof dshDir === "string" && dshDir.trim()) return dshDir.trim();

  const dshProfile = process.env.DSH_PROFILE;
  if (typeof dshProfile === "string" && dshProfile.trim()) {
    return path.join(os.homedir(), ".dsh", "profiles", dshProfile.trim());
  }

  const pluginData = (process.env.CHARACARD_PLUGIN_DATA || process.env.PLUGIN_DATA || "").trim();
  const defaultDsh = path.join(os.homedir(), ".dsh", "profiles", "desktop");

  if (pluginData && fs.existsSync(path.join(pluginData, STATE_FILE))) {
    return pluginData;
  }
  if (fs.existsSync(path.join(defaultDsh, STATE_FILE))) {
    return defaultDsh;
  }
  if (pluginData) {
    return pluginData;
  }
  return defaultDsh;
}

export function statePath() {
  return path.join(profileDir(), STATE_FILE);
}

export function imageDir() {
  return path.join(profileDir(), IMAGE_DIR);
}

export function imagePath(personaId, slot, ext) {
  const safeId = sanitizeId(personaId);
  if (!safeId) throw new Error("invalid persona id");
  return path.join(imageDir(), `${safeId}-${slot}.${ext}`);
}

/** Atomic write with unique temp name and Windows EPERM/EBUSY fallback. */
function atomicWriteFile(file, content, options) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    fs.writeFileSync(temporary, content, options);
    try {
      fs.renameSync(temporary, file);
    } catch (error) {
      // On Windows, a concurrent reader or antivirus scan can briefly lock rename over target.
      if (error && (error.code === "EPERM" || error.code === "EBUSY" || error.code === "EACCES")) {
        fs.copyFileSync(temporary, file);
        try {
          fs.unlinkSync(temporary);
        } catch {
          /* best effort cleanup */
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {
      /* already removed */
    }
    throw error;
  }
}

export function readState() {
  const file = statePath();
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      clearStateCache();
      return { ...EMPTY_STATE, personas: [] };
    }
    throw error;
  }

  if (
    stateCache.state &&
    stateCache.file === file &&
    stateCache.mtimeMs === stat.mtimeMs &&
    stateCache.size === stat.size
  ) {
    return cloneState(stateCache.state);
  }

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
    const needsUpgrade =
      parsed === null ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.personas) ||
      Number(parsed.version) !== 3;
    if (needsUpgrade) {
      try {
        return writeState(state);
      } catch {
        return state;
      }
    }
    stateCache = { file, mtimeMs: stat.mtimeMs, size: stat.size, state: cloneState(state) };
    return state;
  } catch {
    return { ...EMPTY_STATE, personas: [] };
  }
}

export function writeState(state) {
  const file = statePath();
  const next = normalizeState(state);
  const payload = `${JSON.stringify(next, null, 2)}\n`;
  atomicWriteFile(file, payload, { encoding: "utf8", mode: 0o600 });
  try {
    const stat = fs.statSync(file);
    stateCache = { file, mtimeMs: stat.mtimeMs, size: stat.size, state: cloneState(next) };
  } catch {
    clearStateCache();
  }
  return next;
}

export function removeImageFile(personaId, slot, ext) {
  try {
    fs.unlinkSync(imagePath(personaId, slot, ext));
  } catch (error) {
    if (!error || error.code !== "ENOENT") console.warn("[dsh-characard] cannot remove an image:", error);
  }
}

export function saveImage(persona, slot, ext, bytes) {
  const target = imagePath(persona.id, slot, ext);
  atomicWriteFile(target, bytes, { mode: 0o600 });
  for (const previous of persona.images) {
    if (previous.slot !== slot || previous.ext === ext) continue;
    removeImageFile(persona.id, slot, previous.ext);
  }
  persona.images = normalizeImages([
    ...persona.images.filter((entry) => entry.slot !== slot),
    { slot, ext, size: bytes.length },
  ]);
}

export function dropImage(persona, slot) {
  for (const entry of persona.images) {
    if (entry.slot === slot) removeImageFile(persona.id, slot, entry.ext);
  }
  persona.images = persona.images.filter((entry) => entry.slot !== slot);
}

export function dropAllImages(personaId, images) {
  for (const entry of images) removeImageFile(personaId, entry.slot, entry.ext);
}

/** `{ slot, dataUrl }` for the browser; missing files are skipped. */
export function imageViews(persona) {
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

export function imageExports(persona) {
  return imageViews(persona).map((view) => ({ slot: view.slot, dataUrl: view.dataUrl }));
}

export function importImages(persona, rawImages) {
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

/** Builds a browser/UI view of state. Set `includeImages: false` for lightweight payloads. */
export function viewOf(state, { includeImages = true } = {}) {
  return {
    version: 3,
    activeId: state.activeId,
    personas: state.personas.map((persona) => ({
      ...persona,
      images: includeImages
        ? imageViews(persona)
        : persona.images.map((entry) => ({ slot: entry.slot, ext: entry.ext, size: entry.size })),
    })),
  };
}

// --- High-level transactional operations shared by DSH HTTP routes & Antigravity MCP ---

export function savePersonaOp(body) {
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
      return { ok: false, status: 400, message: `at most ${MAX_PERSONAS} personas` };
    }
    const created = normalizePersona({ ...fields, updatedAt: new Date().toISOString() });
    personaId = created.id;
    state.personas = [...state.personas, created];
    if (state.personas.length === 1) state.activeId = personaId;
  }
  return { ok: true, personaId, state: writeState(state) };
}

export function activatePersonaOp(id, enabled) {
  const state = readState();
  const targetId = typeof id === "string" ? id : "";
  if (!findPersona(state, targetId)) {
    return { ok: false, status: 404, message: "persona not found" };
  }
  state.activeId = enabled === false ? (state.activeId === targetId ? null : state.activeId) : targetId;
  return { ok: true, state: writeState(state) };
}

export function deletePersonaOp(id) {
  const targetId = typeof id === "string" ? id : "";
  const state = readState();
  const victim = findPersona(state, targetId);
  if (!victim) {
    return { ok: false, status: 404, message: "persona not found" };
  }
  dropAllImages(victim.id, victim.images);
  state.personas = state.personas.filter((persona) => persona.id !== targetId);
  if (state.activeId === targetId) state.activeId = null;
  return { ok: true, state: writeState(state) };
}

export function setImageOp(body) {
  const state = readState();
  const persona = findPersona(state, typeof body.id === "string" ? body.id : "");
  if (!persona) {
    return { ok: false, status: 404, message: "save the persona before adding images" };
  }
  const picked = pickImage(body);
  if (!picked || picked.error) {
    return { ok: false, status: 400, message: (picked && picked.error) || "invalid image" };
  }
  saveImage(persona, picked.slot, picked.ext, picked.bytes);
  persona.updatedAt = new Date().toISOString();
  return { ok: true, state: writeState(state) };
}

export function removeImageOp(id, slot) {
  const state = readState();
  const persona = findPersona(state, typeof id === "string" ? id : "");
  if (!persona) {
    return { ok: false, status: 404, message: "persona not found" };
  }
  const numericSlot = Number(slot);
  if (!Number.isInteger(numericSlot) || numericSlot < 0 || numericSlot >= MAX_IMAGES) {
    return { ok: false, status: 400, message: "invalid slot" };
  }
  dropImage(persona, numericSlot);
  persona.updatedAt = new Date().toISOString();
  return { ok: true, state: writeState(state) };
}

export function importPersonasOp(data, mode) {
  const parsed = parseImport(data);
  if (!parsed) {
    return { ok: false, status: 400, message: "unrecognized persona file" };
  }
  const state = readState();
  const normalizedMode = mode === "replace" ? "replace" : "append";
  const kept = normalizedMode === "replace" ? [] : state.personas;
  const capacity = Math.max(0, MAX_PERSONAS - kept.length);
  if (capacity === 0) {
    return { ok: false, status: 400, message: `library is full (at most ${MAX_PERSONAS} personas)` };
  }
  if (normalizedMode === "replace") {
    for (const persona of state.personas) dropAllImages(persona.id, persona.images);
  }
  // Slice BEFORE writing images to disk so dropped personas never leave orphan image files.
  const accepted = parsed.slice(0, capacity);
  const imported = accepted.map((entry) => {
    const persona = entry.persona;
    if (Array.isArray(entry.images) && entry.images.length > 0) importImages(persona, entry.images);
    return persona;
  });
  state.personas = [...kept, ...imported];
  if (normalizedMode === "replace") state.activeId = null;
  if (state.activeId && !findPersona(state, state.activeId)) state.activeId = null;
  if (!state.activeId && kept.length === 0 && state.personas.length > 0) {
    state.activeId = state.personas[0].id;
  }
  const saved = writeState(state);
  return {
    ok: true,
    imported: imported.length,
    ...(accepted.some((entry) => entry.converted === "opentavern") ? { converted: "opentavern" } : {}),
    state: saved,
  };
}

export function exportPersonasOp({ format, id } = {}) {
  const state = readState();
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "v3") {
    if (state.personas.length === 0) {
      return { ok: false, status: 400, message: "no personas to export" };
    }
    const wanted = typeof id === "string" ? id : state.activeId;
    const persona =
      state.personas.find((entry) => entry.id === wanted) ||
      state.personas.find((entry) => entry.id === state.activeId) ||
      state.personas[0];
    return {
      ok: true,
      format: "chara_card_v3",
      fileName: `${safeFileName(persona.name)}.chara_card_v3.json`,
      value: toCharacterCardV3(persona),
    };
  }
  return {
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
  };
}
