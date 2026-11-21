/**
 * dsh-characard — client half.
 *
 * Adds a "人设 / Persona" page to Settings. The page is a 2×2 board of four
 * character frames: each frame holds one persona and a photo you pick yourself,
 * and exactly one character can be switched on at a time. Fields live in the
 * editor behind each frame's 编辑 button; the whole board can be exported to /
 * imported from a JSON file.
 *
 * All state lives in the host half; this file only talks to the loopback bridge
 * (`/api/dsh-characard/*`) and renders with theme tokens.
 */
window.__ModuleLoader__.load({
  id: "dsh-characard",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const { useEffect, useState } = React;

    const NS = "dsh-characard";
    const FRAMES = 4;
    const MAX_PAGES = 8;
    const PHOTO_SLOT = 0;
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
    const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

    const zh = {
      nav: "人设",
      subtitle: "每页四个角色框，点格子放照片、点启用就换人设；一页四个填满后可以翻到下一页。同一时间只启用一个，保存后下一条回复即按人设回复，无需重启。",
      loading: "正在读取人设……",
      loadFailed: "读取失败，稍后再试试。",
      emptyFrame: "新建人设",
      emptyHint: "还没有人设，点上面的格子建一个吧。",
      import: "导入",
      exportLabel: "导出",
      untitled: "未命名人设",
      activeBadge: "已启用",
      activate: "启用",
      deactivate: "关闭",
      edit: "编辑",
      delete: "删除",
      confirmDelete: "确认删除",
      back: "返回",
      save: "保存",
      saving: "保存中……",
      saved: "已保存，下一条回复即按人设回复。",
      savedInactive: "已保存。此人设还未启用，启用之后才会生效。",
      deleted: "已删除。",
      saveFailed: "保存失败：",
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
      thinkingHint: "打开后，模型思考（reasoning）里的独白也换成这个人——第一人称、同样的语气词和句尾。只是提示词层面的要求，模型偶尔会跑回原来的调子。",
      thinkingBadge: "思考·人设",
      counterUnit: " 字",
      importedPrefix: "已导入 ",
      importedSuffix: " 个人设。",
      importedCardNote: "识别到 Tavern 角色卡：只读取人设，背景、开场白与示例对话没有导入。",
      importFailed: "导入失败：",
      exported: "已导出为 JSON 文件。",
      exportFailed: "导出失败：",
      deleteFailed: "删除失败：",
      addPhoto: "＋ 放照片",
      replacePhoto: "换一张",
      removePhoto: "移除照片",
      photoHint: "点格子放照片：PNG / JPG / WebP / GIF，单张不超过 4 MB。四个格子按 左上 → 右上 → 左下 → 右下 排列。",
      photoSaved: "照片已放好。",
      photoRemoved: "照片已移除。",
      photoTypeError: "格式不支持，只能用 PNG / JPG / WebP / GIF。",
      photoSizeError: "照片太大了，单张不能超过 4 MB。",
      photoFailed: "照片处理失败：",
      photoNeedsSave: "先建好并保存这个人设，再放照片。",
      prevPage: "上一页",
      nextPage: "下一页",
      pageFullHint: "这一页四个框填满了，才能翻到下一页。",
      exportTitle: "导出人设",
      exportFormatLabel: "选择导出格式",
      exportFormatDsh: "DSH 插件格式",
      exportFormatDshHint: "一个 JSON 文件，含全部人设和照片，用来备份、换电脑或导回这个插件。",
      exportFormatV3: "Tavern 角色卡 V3（chara_card_v3）",
      exportFormatV3Hint: "单张卡的标准格式，能导进 SillyTavern、Chub 等酒馆；只含人设资料，不含照片、开场白和示例对话。",
      exportPick: "选择要导出的角色",
      exportConfirm: "导出",
      cancel: "取消",
      exportV3Done: "已导出角色卡：",
      exportV3Failed: "导出角色卡失败：",
    };

    const en = {
      nav: "Persona",
      subtitle: "Four character frames per page: click a frame to set its photo, switch one on to use it. Fill all four to turn the page. Only one is active at a time, and the next reply follows it — no restart.",
      loading: "Loading personas…",
      loadFailed: "Could not load personas. Try again in a moment.",
      emptyFrame: "New persona",
      emptyHint: "No personas yet. Click a frame above to create one.",
      import: "Import",
      exportLabel: "Export",
      untitled: "Untitled persona",
      activeBadge: "Active",
      activate: "Turn on",
      deactivate: "Turn off",
      edit: "Edit",
      delete: "Delete",
      confirmDelete: "Confirm delete",
      back: "Back",
      save: "Save",
      saving: "Saving…",
      saved: "Saved. The next reply follows this persona.",
      savedInactive: "Saved. This persona is off — turn it on to use it.",
      deleted: "Deleted.",
      saveFailed: "Save failed: ",
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
      userRelationPh: "Master / colleague / creditor… and how you two get along",
      specialty: "Specialties",
      specialtyPh: "Things the character is good at, e.g. appraising old books, fixing clocks, spinning stories",
      specialtyHint: "When a question touches these, the character says something like “just my line of work” and answers with confidence.",
      style: "Voice",
      stylePh: "Tone, verbal tics, sentence length, favourite particles…",
      rules: "Rules",
      rulesPh: "1. …\n2. …",
      enabledLabel: "Active",
      thinkingLabel: "In-character thinking",
      thinkingHint: "When on, the model's reasoning monologue uses this character too: first person, the same particles and sentence endings. Prompt-level only — it may slip back now and then.",
      thinkingBadge: "thinking",
      counterUnit: " chars",
      importedPrefix: "Imported ",
      importedSuffix: " persona(s).",
      importedCardNote: "Tavern card detected: persona only — background, greeting and example dialogue were skipped.",
      importFailed: "Import failed: ",
      exported: "Exported as a JSON file.",
      exportFailed: "Export failed: ",
      deleteFailed: "Delete failed: ",
      addPhoto: "＋ Add photo",
      replacePhoto: "Replace",
      removePhoto: "Remove photo",
      photoHint: "Click a frame to set its photo: PNG / JPG / WebP / GIF, up to 4 MB each. Frames run top-left → top-right → bottom-left → bottom-right.",
      photoSaved: "Photo saved.",
      photoRemoved: "Photo removed.",
      photoTypeError: "Unsupported format — use PNG / JPG / WebP / GIF.",
      photoSizeError: "That photo is too large; keep it under 4 MB.",
      photoFailed: "Photo failed: ",
      photoNeedsSave: "Create and save the persona first, then set its photo.",
      prevPage: "Previous",
      nextPage: "Next",
      pageFullHint: "Fill all four frames on this page to turn the page.",
      exportTitle: "Export persona",
      exportFormatLabel: "Choose a format",
      exportFormatDsh: "DSH plugin format",
      exportFormatDshHint: "One JSON file with every persona and photo — for backup, moving machines, or importing back here.",
      exportFormatV3: "Tavern character card V3 (chara_card_v3)",
      exportFormatV3Hint: "A single card in the standard format, importable by SillyTavern, Chub and friends; persona data only — no photo, greeting or example dialogue.",
      exportPick: "Character to export",
      exportConfirm: "Export",
      cancel: "Cancel",
      exportV3Done: "Character card exported: ",
      exportV3Failed: "Card export failed: ",
    };

    const CSS = `
.dshp-root { max-width: 760px; padding: 4px 0 24px; color: var(--dsw-alias-label-primary, #1f1f1f); font-size: 14px; line-height: 1.6; }
.dshp-sub { margin: 0 0 16px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.dshp-muted { color: var(--dsw-alias-label-secondary, #6b6b6b); }
.dshp-toolbar { display: flex; gap: 8px; align-items: center; margin: 12px 0 0; flex-wrap: wrap; }
.dshp-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l1, #d9d9d9); background: var(--dsw-alias-bg-layer-2, #ffffff); color: var(--dsw-alias-label-primary, #1f1f1f); border-radius: 8px; padding: 6px 12px; font: inherit; cursor: pointer; }
.dshp-btn:hover { border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dshp-btn:disabled { opacity: .55; cursor: default; }
.dshp-primary { background: var(--dsw-alias-brand-primary, #4d6bfe); border-color: var(--dsw-alias-brand-primary, #4d6bfe); color: #ffffff; }
.dshp-ghost { background: transparent; }
.dshp-danger { color: var(--dsw-alias-state-error-primary, #d03050); }
.dshp-file { display: none; }
.dshp-card { width: 100%; max-width: 560px; box-sizing: border-box; padding: 10px; border: 1px solid var(--dsw-alias-border-l1, #e3e3e3); border-radius: 12px; background: #ffffff; box-shadow: 0 1px 2px rgba(0, 0, 0, .05); }
.dshp-board { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.dshp-pager { display: flex; gap: 8px; align-items: center; margin: 10px 0 0; }
.dshp-page-of { margin: 0 4px; color: var(--dsw-alias-label-secondary, #6b6b6b); font-variant-numeric: tabular-nums; }
.dshp-frame { position: relative; display: flex; flex-direction: column; box-sizing: border-box; min-height: 168px; padding: 0; overflow: hidden; border: 1px solid var(--dsw-alias-border-l1, #e3e3e3); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fafafa); color: var(--dsw-alias-label-primary, #1f1f1f); font: inherit; text-align: left; }
.dshp-frame-on { border-color: var(--dsw-alias-state-success-primary, #2e9e5b); box-shadow: inset 0 0 0 1px var(--dsw-alias-state-success-primary, #2e9e5b); }
.dshp-thumb { position: relative; display: flex; align-items: center; justify-content: center; flex: 1; min-height: 120px; overflow: hidden; cursor: pointer; background: var(--dsw-alias-bg-layer-2, #ffffff); color: var(--dsw-alias-label-secondary, #9a9a9a); }
.dshp-thumb:hover { color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dshp-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
.dshp-photo-empty { font-size: 13px; }
.dshp-photo-remove { position: absolute; top: 6px; right: 6px; z-index: 2; width: 24px; height: 24px; padding: 0; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1, #d9d9d9); background: var(--dsw-alias-bg-overlay, #ffffff); color: var(--dsw-alias-label-secondary, #6b6b6b); cursor: pointer; font-size: 15px; line-height: 20px; }
.dshp-frame-body { display: flex; align-items: center; gap: 6px; padding: 8px; }
.dshp-frame-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.dshp-frame-actions { display: flex; gap: 4px; flex-shrink: 0; }
.dshp-frame-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l1, #d9d9d9); background: var(--dsw-alias-bg-layer-2, #ffffff); color: var(--dsw-alias-label-primary, #1f1f1f); border-radius: 6px; padding: 2px 8px; font: inherit; font-size: 12px; cursor: pointer; }
.dshp-frame-btn:hover { border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dshp-frame-btn-on { border-color: var(--dsw-alias-state-success-primary, #2e9e5b); color: var(--dsw-alias-state-success-primary, #2e9e5b); }
.dshp-frame-badge { position: absolute; top: 6px; left: 6px; z-index: 2; font-size: 12px; line-height: 18px; padding: 0 8px; border-radius: 999px; background: var(--dsw-alias-bg-overlay, #ffffff); border: 1px solid var(--dsw-alias-state-success-primary, #2e9e5b); color: var(--dsw-alias-state-success-primary, #2e9e5b); }
.dshp-frame-new { align-items: center; justify-content: center; gap: 6px; border-style: dashed; color: var(--dsw-alias-label-secondary, #6b6b6b); cursor: pointer; }
.dshp-frame-new:hover { border-color: var(--dsw-alias-brand-primary, #4d6bfe); color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dshp-editor-head { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin: 0 0 12px; flex-wrap: wrap; }
.dshp-toggle { display: inline-flex; gap: 8px; align-items: center; color: var(--dsw-alias-label-secondary, #6b6b6b); cursor: pointer; }
.dshp-field { display: block; margin: 0 0 14px; }
.dshp-label { display: flex; justify-content: space-between; gap: 8px; margin: 0 0 6px; font-weight: 600; }
.dshp-counter { font-weight: 400; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.dshp-input, .dshp-textarea { display: block; width: 100%; box-sizing: border-box; font: inherit; color: var(--dsw-alias-label-primary, #1f1f1f); background: var(--dsw-alias-bg-layer-2, #ffffff); border: 1px solid var(--dsw-alias-border-l1, #d9d9d9); border-radius: 8px; padding: 8px 10px; }
.dshp-input:focus, .dshp-textarea:focus { outline: 2px solid var(--dsw-alias-brand-primary, #4d6bfe); outline-offset: -1px; }
.dshp-textarea { resize: vertical; }
.dshp-hint { margin: 8px 0 0; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.dshp-hint-inline { margin: 4px 0 0; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.dshp-actions { display: flex; gap: 8px; align-items: center; margin-top: 4px; flex-wrap: wrap; }
.dshp-switch { display: flex; gap: 10px; align-items: flex-start; margin: 2px 0 16px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1, #d9d9d9); border-radius: 10px; background: var(--dsw-alias-bg-layer-1, #fafafa); cursor: pointer; }
.dshp-switch-on { border-color: var(--dsw-alias-brand-primary, #4d6bfe); background: var(--dsw-alias-bg-layer-2, #ffffff); }
.dshp-switch-input { margin: 3px 0 0; flex-shrink: 0; }
.dshp-switch-body { display: flex; flex-direction: column; gap: 2px; }
.dshp-switch-title { font-weight: 600; }
.dshp-switch-hint { font-size: 12px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.dshp-frame-tag { flex-shrink: 0; font-size: 11px; line-height: 16px; padding: 0 6px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, #c9c9c9); color: var(--dsw-alias-label-secondary, #6b6b6b); }
.dshp-msg { margin: 12px 0 0; }
.dshp-msg-ok { color: var(--dsw-alias-state-success-primary, #2e9e5b); }
.dshp-msg-error { color: var(--dsw-alias-state-error-primary, #d03050); }
.dshp-modal { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, .35); }
.dshp-modal-card { width: 100%; max-width: 440px; box-sizing: border-box; padding: 18px; border-radius: 12px; background: var(--dsw-alias-bg-base, #ffffff); border: 1px solid var(--dsw-alias-border-l1, #e3e3e3); box-shadow: 0 10px 30px rgba(0, 0, 0, .18); color: var(--dsw-alias-label-primary, #1f1f1f); }
.dshp-modal-title { margin: 0 0 4px; font-size: 15px; }
.dshp-modal-sub { margin: 0 0 12px; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.dshp-radio { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 12px; cursor: pointer; }
.dshp-radio input { margin: 3px 0 0; }
.dshp-radio-main { display: block; font-weight: 600; }
.dshp-radio-hint { display: block; font-size: 12px; color: var(--dsw-alias-label-secondary, #6b6b6b); }
.dshp-modal-field { margin: 0 0 4px; }
.dshp-select { display: block; width: 100%; box-sizing: border-box; font: inherit; color: var(--dsw-alias-label-primary, #1f1f1f); background: var(--dsw-alias-bg-layer-2, #ffffff); border: 1px solid var(--dsw-alias-border-l1, #d9d9d9); border-radius: 8px; padding: 8px 10px; }
.dshp-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin: 16px 0 0; }
`;

    function bridgeUrl(action) {
      try {
        return new URL(`/api/dsh-characard/${action}`, document.baseURI).pathname;
      } catch {
        return `/api/dsh-characard/${action}`;
      }
    }

    async function post(action, body) {
      const response = await fetch(bridgeUrl(action), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(body || {}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.ok !== true) {
        const reason = (data && data.message) || `HTTP ${response.status}`;
        throw new Error(reason);
      }
      return data;
    }

    function count(t, n, max) {
      return `${n} / ${max}${t("counterUnit")}`;
    }

    function readAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("cannot read the file"));
        reader.readAsDataURL(file);
      });
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
      if (!persona) return emptyForm();
      const next = emptyForm();
      for (const key of Object.keys(next)) {
        next[key] = key === "thinking" ? persona.thinking === true : persona[key] || "";
      }
      return next;
    }

    function photoOf(persona) {
      if (!persona || !Array.isArray(persona.images)) return "";
      const entry = persona.images.find((image) => image && image.slot === PHOTO_SLOT && typeof image.dataUrl === "string");
      return entry ? entry.dataUrl : "";
    }

    function field(t, labelKey, counterText, control, hintKey) {
      return h(
        "label",
        { className: "dshp-field" },
        h(
          "span",
          { className: "dshp-label" },
          h("span", null, t(labelKey)),
          counterText ? h("span", { className: "dshp-counter" }, counterText) : null,
        ),
        control,
        hintKey ? h("span", { className: "dshp-hint-inline" }, t(hintKey)) : null,
      );
    }

    /** One of the four character frames on the board. */
    function Frame(props) {
      const { t, persona, active, busy, onOpen, onPickPhoto, onRemovePhoto } = props;
      if (!persona) {
        return h(
          "button",
          { className: "dshp-frame dshp-frame-new", type: "button", disabled: busy, onClick: onOpen },
          h("span", { className: "dshp-cell-plus" }, "＋"),
          h("span", null, t("emptyFrame")),
        );
      }
      const photo = photoOf(persona);
      return h(
        "div",
        { className: active ? "dshp-frame dshp-frame-on" : "dshp-frame" },
        active ? h("span", { className: "dshp-frame-badge" }, t("activeBadge")) : null,
        h(
          "label",
          { className: "dshp-thumb", title: photo ? t("replacePhoto") : t("addPhoto") },
          photo ? h("img", { className: "dshp-photo", src: photo, alt: "" }) : h("span", { className: "dshp-photo-empty" }, t("addPhoto")),
          h("input", {
            className: "dshp-file",
            type: "file",
            accept: "image/png,image/jpeg,image/webp,image/gif",
            disabled: busy,
            onChange: (event) => {
              const input = event.target;
              const file = input.files && input.files[0];
              if (input) input.value = "";
              if (file) onPickPhoto(persona.id, file);
            },
          }),
          photo
            ? h(
                "button",
                {
                  className: "dshp-photo-remove",
                  type: "button",
                  title: t("removePhoto"),
                  onClick: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemovePhoto(persona.id);
                  },
                },
                "×",
              )
            : null,
        ),
        h(
          "div",
          { className: "dshp-frame-body" },
          h("span", { className: "dshp-frame-name" }, persona.name || t("untitled")),
          persona.thinking ? h("span", { className: "dshp-frame-tag", title: t("thinkingLabel") }, t("thinkingBadge")) : null,
          h(
            "div",
            { className: "dshp-frame-actions" },
            h(
              "button",
              { className: active ? "dshp-frame-btn dshp-frame-btn-on" : "dshp-frame-btn", type: "button", disabled: busy, onClick: onOpen },
              t("edit"),
            ),
          ),
        ),
      );
    }

    /** Edit one persona (or a fresh one when `persona` is null). */
    function PersonaEditor(props) {
      const { t, persona, active, busy, onSave, onActivate, onBack, onDelete } = props;
      const [form, setForm] = useState(formOf(persona));
      const [confirming, setConfirming] = useState(false);

      const set = (key) => (event) => {
        const value = event.target.value;
        setForm((current) => ({ ...current, [key]: value }));
      };

      const existing = Boolean(persona && persona.id);
      const head = h(
        "div",
        { className: "dshp-editor-head" },
        h("button", { className: "dshp-btn dshp-ghost", type: "button", onClick: onBack }, `← ${t("back")}`),
        existing
          ? h(
              "label",
              { className: "dshp-toggle" },
              h("input", {
                type: "checkbox",
                checked: Boolean(active),
                disabled: busy,
                onChange: (event) => onActivate(event.target.checked),
              }),
              h("span", null, t("enabledLabel")),
            )
          : null,
      );

      // The thinking switch rides along with the save call: it is a per-persona
      // setting, not something that needs its own request.
      const thinkingBox = h(
        "label",
        { className: form.thinking ? "dshp-switch dshp-switch-on" : "dshp-switch" },
        h("input", {
          className: "dshp-switch-input",
          type: "checkbox",
          checked: Boolean(form.thinking),
          disabled: busy,
          onChange: (event) => {
            const checked = event.target.checked;
            setForm((current) => ({ ...current, thinking: checked }));
          },
        }),
        h(
          "span",
          { className: "dshp-switch-body" },
          h("span", { className: "dshp-switch-title" }, t("thinkingLabel")),
          h("span", { className: "dshp-switch-hint" }, t("thinkingHint")),
        ),
      );

      const textarea = (key, rows, placeholderKey) =>
        h("textarea", {
          className: "dshp-textarea",
          rows,
          value: form[key],
          placeholder: t(placeholderKey),
          disabled: busy,
          onChange: set(key),
        });

      return h(
        "div",
        { className: "dshp-root" },
        head,
        field(
          t,
          "name",
          count(t, form.name.length, MAX.name),
          h("input", { className: "dshp-input", type: "text", value: form.name, placeholder: t("namePh"), disabled: busy, onChange: set("name") }),
        ),
        field(t, "likes", count(t, form.likes.length, MAX.likes), textarea("likes", 3, "likesPh")),
        field(t, "relations", count(t, form.relations.length, MAX.relations), textarea("relations", 3, "relationsPh")),
        field(t, "bio", count(t, form.bio.length, MAX.bio), textarea("bio", 6, "bioPh")),
        field(t, "appearance", count(t, form.appearance.length, MAX.appearance), textarea("appearance", 3, "appearancePh")),
        field(t, "userRelation", count(t, form.userRelation.length, MAX.userRelation), textarea("userRelation", 3, "userRelationPh")),
        field(t, "specialty", count(t, form.specialty.length, MAX.specialty), textarea("specialty", 2, "specialtyPh"), "specialtyHint"),
        field(t, "style", count(t, form.style.length, MAX.style), textarea("style", 3, "stylePh")),
        field(t, "rules", count(t, form.rules.length, MAX.rules), textarea("rules", 5, "rulesPh")),
        thinkingBox,
        h(
          "div",
          { className: "dshp-actions" },
          h(
            "button",
            { className: "dshp-btn dshp-primary", type: "button", disabled: busy, onClick: () => onSave(form) },
            busy ? t("saving") : t("save"),
          ),
          existing
            ? h(
                "button",
                {
                  className: "dshp-btn dshp-danger",
                  type: "button",
                  disabled: busy,
                  onClick: () => (confirming ? onDelete() : setConfirming(true)),
                },
                confirming ? t("confirmDelete") : t("delete"),
              )
            : null,
        ),
      );
    }

    function PersonaSection(props) {
      const t = props.t;
      const [phase, setPhase] = useState("loading");
      const [data, setData] = useState({ personas: [], activeId: null });
      const [editing, setEditing] = useState(null); // null = board, "new" = draft, else persona id
      const [page, setPage] = useState(0);
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState(null);
      const [exporting, setExporting] = useState(false);
      const [exportFormat, setExportFormat] = useState("dsh");
      const [exportTarget, setExportTarget] = useState("");

      const adopt = (payload) => {
        const value = (payload && payload.value) || {};
        setData({ personas: Array.isArray(value.personas) ? value.personas : [], activeId: value.activeId || null });
      };

      useEffect(() => {
        let alive = true;
        post("get", {})
          .then((payload) => {
            if (!alive) return;
            adopt(payload);
            setPhase("ready");
          })
          .catch(() => {
            if (!alive) return;
            setPhase("ready");
            setMessage({ kind: "error", text: t("loadFailed") });
          });
        return () => {
          alive = false;
        };
      }, []);

      const run = async (work) => {
        setBusy(true);
        try {
          await work();
        } catch (error) {
          setMessage({ kind: "error", text: String((error && error.message) || error) });
        } finally {
          setBusy(false);
        }
      };

      const save = (form) =>
        run(async () => {
          const editingId = editing && editing !== "new" ? editing : null;
          const payload = await post("save", editingId ? { ...form, id: editingId } : { ...form });
          adopt(payload);
          setEditing(null);
          setMessage({ kind: "ok", text: payload.active ? t("saved") : t("savedInactive") });
        });

      const activate = (id, enabled) =>
        run(async () => {
          const payload = await post("activate", { id, enabled });
          adopt(payload);
          setMessage(null);
        });

      const remove = (id) =>
        run(async () => {
          const payload = await post("delete", { id });
          adopt(payload);
          const count = payload && payload.value && Array.isArray(payload.value.personas) ? payload.value.personas.length : 0;
          const lastPage = Math.max(0, Math.ceil(count / FRAMES) - 1);
          if (page > lastPage) setPage(lastPage);
          setEditing(null);
          setMessage({ kind: "ok", text: t("deleted") });
        });

      const setPhoto = (id, file) => {
        if (!file) return Promise.resolve();
        if (!IMAGE_TYPES.includes(file.type)) {
          setMessage({ kind: "error", text: t("photoTypeError") });
          return Promise.resolve();
        }
        if (file.size > IMAGE_MAX_BYTES) {
          setMessage({ kind: "error", text: t("photoSizeError") });
          return Promise.resolve();
        }
        return run(async () => {
          try {
            const dataUrl = await readAsDataUrl(file);
            const payload = await post("image", { id, slot: PHOTO_SLOT, dataUrl });
            adopt(payload);
            setMessage({ kind: "ok", text: t("photoSaved") });
          } catch (error) {
            setMessage({ kind: "error", text: `${t("photoFailed")}${(error && error.message) || error}` });
          }
        });
      };

      const removePhoto = (id) => {
        if (!id) return;
        return run(async () => {
          const payload = await post("image-remove", { id, slot: PHOTO_SLOT });
          adopt(payload);
          setMessage({ kind: "ok", text: t("photoRemoved") });
        });
      };

      const pickFile = async (event) => {
        const input = event.target;
        const file = input.files && input.files[0];
        if (input) input.value = "";
        if (!file) return;
        setBusy(true);
        try {
          const text = await file.text();
          const payload = await post("import", { data: text });
          adopt(payload);
          const note = payload.converted === "opentavern" ? `${t("importedCardNote")} ` : "";
          setMessage({ kind: "ok", text: `${note}${t("importedPrefix")}${payload.imported}${t("importedSuffix")}` });
        } catch (error) {
          setMessage({ kind: "error", text: `${t("importFailed")}${(error && error.message) || error}` });
        } finally {
          setBusy(false);
        }
      };

      const openExport = () => {
        setExportFormat("dsh");
        setExportTarget(data.activeId || (data.personas[0] ? data.personas[0].id : ""));
        setExporting(true);
      };

      const closeExport = () => setExporting(false);

      // Esc closes the export dialog; the key listener only exists while it is open.
      useEffect(() => {
        if (!exporting) return undefined;
        if (typeof document.addEventListener !== "function") return undefined;
        const onKey = (event) => {
          if (event && event.key === "Escape") setExporting(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [exporting]);

      const exportNow = () =>
        run(async () => {
          const wantsCard = exportFormat === "v3";
          const payload = await post("export", wantsCard ? { format: "v3", id: exportTarget } : {});
          const fallback = wantsCard ? `character.chara_card_v3.json` : `dsh-characards-${new Date().toISOString().slice(0, 10)}.json`;
          const blob = new Blob([`${JSON.stringify(payload.value, null, 2)}\n`], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = payload.fileName || fallback;
          if (typeof link.click === "function") link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          setExporting(false);
          const target = data.personas.find((entry) => entry.id === exportTarget);
          setMessage({
            kind: "ok",
            text: wantsCard ? `${t("exportV3Done")}${(target && target.name) || t("untitled")}` : t("exported"),
          });
        });

      const subtitle = h("p", { className: "dshp-sub" }, t("subtitle"));

      let body;
      if (phase === "loading") {
        body = h("p", { className: "dshp-muted" }, t("loading"));
      } else if (editing === "new" || data.personas.some((persona) => persona.id === editing)) {
        const persona = editing === "new" ? null : data.personas.find((entry) => entry.id === editing);
        body = h(PersonaEditor, {
          key: editing,
          t,
          persona,
          active: Boolean(persona && persona.id === data.activeId),
          busy,
          onSave: save,
          onActivate: (enabled) => activate(editing, enabled),
          onBack: () => setEditing(null),
          onDelete: () => remove(editing),
        });
      } else {
        const start = page * FRAMES;
        const pagePersonas = data.personas.slice(start, start + FRAMES);
        const pageCount = Math.max(1, Math.ceil(data.personas.length / FRAMES));
        const pageShown = Math.max(pageCount, page + 1);
        const full = pagePersonas.length === FRAMES;
        const canNext = full && page + 1 < MAX_PAGES;
        const frames = [];
        for (let index = 0; index < FRAMES; index += 1) {
          const persona = pagePersonas[index] || null;
          frames.push(
            h(Frame, {
              key: persona ? persona.id : `empty-${start + index}`,
              t,
              persona,
              active: Boolean(persona && persona.id === data.activeId),
              busy,
              onOpen: () => setEditing(persona ? persona.id : "new"),
              onPickPhoto: setPhoto,
              onRemovePhoto: removePhoto,
            }),
          );
        }

        body = h(
          "div",
          null,
          h("div", { className: "dshp-card" }, h("div", { className: "dshp-board" }, frames)),
          h(
            "div",
            { className: "dshp-pager" },
            h(
              "button",
              { className: "dshp-btn", type: "button", disabled: busy || page === 0, onClick: () => setPage(Math.max(0, page - 1)) },
              t("prevPage"),
            ),
            h("span", { className: "dshp-page-of" }, `${page + 1} / ${pageShown}`),
            h(
              "button",
              {
                className: "dshp-btn",
                type: "button",
                disabled: busy || !canNext,
                title: canNext ? "" : t("pageFullHint"),
                onClick: () => setPage(page + 1),
              },
              t("nextPage"),
            ),
          ),
          h("p", { className: "dshp-hint" }, t("photoHint")),
          h(
            "div",
            { className: "dshp-toolbar" },
            h(
              "label",
              { className: "dshp-btn" },
              t("import"),
              h("input", { className: "dshp-file", type: "file", accept: ".json,application/json", disabled: busy, onChange: pickFile }),
            ),
            h("button", { className: "dshp-btn", type: "button", disabled: busy || data.personas.length === 0, onClick: openExport }, t("exportLabel")),
          ),
        );
      }

      const exportDialog = !exporting
        ? null
        : h(
            "div",
            {
              className: "dshp-modal",
              role: "dialog",
              "aria-modal": "true",
              "aria-label": t("exportTitle"),
              onClick: (event) => {
                if (event && event.target === event.currentTarget) closeExport();
              },
            },
            h(
              "div",
              { className: "dshp-modal-card" },
              h("h2", { className: "dshp-modal-title" }, t("exportTitle")),
              h("p", { className: "dshp-modal-sub" }, t("exportFormatLabel")),
              h(
                "label",
                { className: "dshp-radio" },
                h("input", {
                  type: "radio",
                  name: "dshp-export-format",
                  value: "dsh",
                  checked: exportFormat === "dsh",
                  onChange: () => setExportFormat("dsh"),
                }),
                h(
                  "span",
                  null,
                  h("span", { className: "dshp-radio-main" }, t("exportFormatDsh")),
                  h("span", { className: "dshp-radio-hint" }, t("exportFormatDshHint")),
                ),
              ),
              h(
                "label",
                { className: "dshp-radio" },
                h("input", {
                  type: "radio",
                  name: "dshp-export-format",
                  value: "v3",
                  checked: exportFormat === "v3",
                  onChange: () => setExportFormat("v3"),
                }),
                h(
                  "span",
                  null,
                  h("span", { className: "dshp-radio-main" }, t("exportFormatV3")),
                  h("span", { className: "dshp-radio-hint" }, t("exportFormatV3Hint")),
                ),
              ),
              exportFormat === "v3"
                ? h(
                    "label",
                    { className: "dshp-field dshp-modal-field" },
                    h("span", { className: "dshp-label" }, t("exportPick")),
                    h(
                      "select",
                      {
                        className: "dshp-select",
                        value: exportTarget,
                        disabled: busy,
                        onChange: (event) => setExportTarget(event.target.value),
                      },
                      data.personas.map((persona) =>
                        h("option", { key: persona.id, value: persona.id }, persona.name || t("untitled")),
                      ),
                    ),
                  )
                : null,
              h(
                "div",
                { className: "dshp-modal-foot" },
                h("button", { className: "dshp-btn", type: "button", onClick: closeExport }, t("cancel")),
                h(
                  "button",
                  {
                    className: "dshp-btn dshp-primary",
                    type: "button",
                    disabled: busy || (exportFormat === "v3" && !exportTarget),
                    onClick: exportNow,
                  },
                  t("exportConfirm"),
                ),
              ),
            ),
          );

      return h(
        "div",
        null,
        subtitle,
        body,
        message
          ? h("p", { className: message.kind === "ok" ? "dshp-msg dshp-msg-ok" : "dshp-msg dshp-msg-error", role: "status" }, message.text)
          : null,
        exportDialog,
      );
    }

    // Line-art "character card" glyph for the settings navigation row
    // (`settings.section.icon`). Owner props: { size, active }.
    function PersonaGlyph(props) {
      const size = props && Number.isFinite(props.size) ? props.size : 16;
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.6,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          focusable: "false",
        },
        h("rect", { x: 3.75, y: 2.75, width: 16.5, height: 18.5, rx: 3.25 }),
        h("circle", { cx: 12, cy: 9.4, r: 2.55 }),
        h("path", { d: "M7.9 15.6c.75-1.85 2.25-2.9 4.1-2.9s3.35 1.05 4.1 2.9" }),
        h("path", { d: "M8.9 18.7h6.2" }),
      );
    }

    function installStyles(ctx) {
      ctx.effect(() => {
        if (document.querySelector('[data-plugin-css="dsh_characard/section.css"]')) return () => {};
        const style = document.createElement("style");
        style.setAttribute("data-plugin", "dsh-characard");
        style.setAttribute("data-plugin-css", "dsh_characard/section.css");
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => {
          style.remove();
        };
      }, "persona: settings styles");
    }

    function makeTranslator(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "persona: locale");
      let bound;
      try {
        bound = ctx.locale.bind(NS);
      } catch {
        bound = undefined;
      }
      const local = typeof navigator !== "undefined" && /^zh/i.test(String(navigator.language || "")) ? zh : en;
      return (key) => {
        if (typeof bound === "function") {
          const value = bound(key);
          if (value !== undefined && value !== null && value !== key) return value;
        }
        const fallback = local[key];
        return fallback === undefined ? key : fallback;
      };
    }

    return {
      inject: ["slots", "locale"],
      apply(ctx) {
        installStyles(ctx);
        const t = makeTranslator(ctx);
        ctx.slots.inject("settings.section", () => {
          const dispose = ctx.slots.register(
            {
              name: "settings.section",
              id: "persona",
              order: 35,
              label: () => t("nav"),
              locale: NS,
              inject: () => ({ t }),
            },
            () => h(PersonaSection, { t }),
          );
          return typeof dispose === "function" ? dispose : () => {};
        });
        ctx.slots.inject("settings.section.icon", () => {
          const dispose = ctx.slots.register({ name: "settings.section.icon", id: "persona", order: 35 }, PersonaGlyph);
          return typeof dispose === "function" ? dispose : () => {};
        });
      },
    };
  },
});
