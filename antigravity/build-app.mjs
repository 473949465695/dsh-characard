/**
 * Bundles `antigravity/app-src.js` (+ @modelcontextprotocol/ext-apps) and styles
 * into a single self-contained `antigravity/app.html` for Antigravity MCP Apps.
 *
 * Run: node antigravity/build-app.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "app-src.js");
const OUT = path.join(HERE, "app.html");

const CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: var(--color-background-primary, #ffffff);
  color: var(--color-text-primary, #1f1f1f);
  font-family: var(--font-sans, system-ui, -apple-system, "Segoe UI", sans-serif);
  font-size: 14px;
  line-height: 1.55;
}
.cc-root { max-width: 720px; margin: 0 auto; padding: 16px 18px 28px; }
.cc-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.cc-title { margin: 0; font-size: 18px; font-weight: 700; }
.cc-pill {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border-primary, #d9d9d9);
  background: var(--color-background-secondary, #f6f6f6);
  color: var(--color-text-secondary, #6b6b6b);
}
.cc-pill-on {
  border-color: var(--color-border-success, #2e9e5b);
  color: var(--color-text-success, #2e9e5b);
}
.cc-sub { margin: 0 0 14px; color: var(--color-text-secondary, #6b6b6b); font-size: 13px; }
.cc-muted { color: var(--color-text-secondary, #6b6b6b); }
.cc-card {
  width: 100%;
  max-width: 580px;
  padding: 10px;
  border: 1px solid var(--color-border-primary, #e2e2e2);
  border-radius: 12px;
  background: var(--color-background-secondary, #fafafa);
}
.cc-board { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cc-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 176px;
  overflow: hidden;
  border: 1px solid var(--color-border-primary, #dcdcdc);
  border-radius: 10px;
  background: var(--color-background-primary, #ffffff);
  color: var(--color-text-primary, #1f1f1f);
  font: inherit;
  text-align: left;
}
.cc-frame-on {
  border-color: var(--color-border-success, #2e9e5b);
  box-shadow: inset 0 0 0 1px var(--color-border-success, #2e9e5b);
}
.cc-frame-new {
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-style: dashed;
  color: var(--color-text-secondary, #6b6b6b);
  cursor: pointer;
}
.cc-frame-new:hover { border-color: var(--color-ring-primary, #4d6bfe); color: var(--color-ring-primary, #4d6bfe); }
.cc-plus { font-size: 20px; line-height: 1; }
.cc-thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 124px;
  overflow: hidden;
  cursor: pointer;
  background: var(--color-background-tertiary, #f2f3f5);
  color: var(--color-text-secondary, #8c8c8c);
}
.cc-thumb:hover { color: var(--color-ring-primary, #4d6bfe); }
.cc-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
.cc-photo-empty { font-size: 13px; }
.cc-photo-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--color-border-primary, #d9d9d9);
  background: var(--color-background-primary, #ffffff);
  color: var(--color-text-secondary, #6b6b6b);
  cursor: pointer;
  font-size: 15px;
  line-height: 20px;
}
.cc-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  font-size: 11px;
  line-height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--color-background-primary, #ffffff);
  border: 1px solid var(--color-border-success, #2e9e5b);
  color: var(--color-text-success, #2e9e5b);
}
.cc-frame-body { display: flex; align-items: center; gap: 6px; padding: 8px; }
.cc-frame-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; font-size: 13px; }
.cc-tag {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--color-border-primary, #c9c9c9);
  color: var(--color-text-secondary, #6b6b6b);
}
.cc-frame-actions { display: flex; gap: 4px; flex-shrink: 0; }
.cc-chip {
  appearance: none;
  border: 1px solid var(--color-border-primary, #d9d9d9);
  background: var(--color-background-primary, #ffffff);
  color: var(--color-text-primary, #1f1f1f);
  border-radius: 6px;
  padding: 2px 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.cc-chip:hover { border-color: var(--color-ring-primary, #4d6bfe); }
.cc-chip-on { border-color: var(--color-border-success, #2e9e5b); color: var(--color-text-success, #2e9e5b); }
.cc-pager, .cc-toolbar, .cc-actions { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
.cc-page-of { margin: 0 4px; color: var(--color-text-secondary, #6b6b6b); font-variant-numeric: tabular-nums; }
.cc-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-primary, #d9d9d9);
  background: var(--color-background-secondary, #ffffff);
  color: var(--color-text-primary, #1f1f1f);
  border-radius: 8px;
  padding: 6px 12px;
  font: inherit;
  cursor: pointer;
}
.cc-btn:hover { border-color: var(--color-ring-primary, #4d6bfe); }
.cc-btn:disabled { opacity: 0.5; cursor: default; }
.cc-primary { background: #4d6bfe; border-color: #4d6bfe; color: #ffffff; }
.cc-primary:hover { filter: brightness(1.06); }
.cc-ghost { background: transparent; }
.cc-danger { color: var(--color-text-danger, #d03050); border-color: var(--color-border-danger, #d03050); }
.cc-file { display: none; }
.cc-hint { margin: 8px 0 0; font-size: 12px; color: var(--color-text-secondary, #6b6b6b); }
.cc-hint-inline { display: block; margin-top: 4px; font-size: 12px; color: var(--color-text-secondary, #6b6b6b); }
.cc-editor-head { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; }
.cc-toggle { display: inline-flex; gap: 8px; align-items: center; color: var(--color-text-secondary, #6b6b6b); cursor: pointer; }
.cc-field { display: block; margin-bottom: 12px; }
.cc-label { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px; font-weight: 600; font-size: 13px; }
.cc-counter { font-weight: 400; font-size: 12px; color: var(--color-text-secondary, #6b6b6b); }
.cc-input, .cc-textarea, .cc-select {
  display: block;
  width: 100%;
  font: inherit;
  color: var(--color-text-primary, #1f1f1f);
  background: var(--color-background-secondary, #ffffff);
  border: 1px solid var(--color-border-primary, #d9d9d9);
  border-radius: 8px;
  padding: 8px 10px;
}
.cc-input:focus, .cc-textarea:focus, .cc-select:focus { outline: 2px solid var(--color-ring-primary, #4d6bfe); outline-offset: -1px; }
.cc-textarea { resize: vertical; }
.cc-switch {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 4px 0 14px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-primary, #d9d9d9);
  border-radius: 10px;
  background: var(--color-background-secondary, #fafafa);
  cursor: pointer;
}
.cc-switch-on { border-color: var(--color-ring-primary, #4d6bfe); }
.cc-switch-input { margin-top: 3px; flex-shrink: 0; }
.cc-switch-body { display: flex; flex-direction: column; gap: 2px; }
.cc-switch-title { font-weight: 600; }
.cc-switch-hint { font-size: 12px; color: var(--color-text-secondary, #6b6b6b); }
.cc-msg { margin: 12px 0 0; font-size: 13px; }
.cc-msg-ok { color: var(--color-text-success, #2e9e5b); }
.cc-msg-err { color: var(--color-text-danger, #d03050); }
.cc-modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.42);
}
.cc-modal-card {
  width: 100%;
  max-width: 440px;
  padding: 18px;
  border-radius: 12px;
  background: var(--color-background-primary, #ffffff);
  border: 1px solid var(--color-border-primary, #e2e2e2);
  color: var(--color-text-primary, #1f1f1f);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
}
.cc-modal-title { margin: 0 0 4px; font-size: 15px; }
.cc-modal-sub { margin: 0 0 12px; font-size: 12px; color: var(--color-text-secondary, #6b6b6b); }
.cc-radio { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 12px; cursor: pointer; }
.cc-radio input { margin-top: 3px; }
.cc-radio-main { display: block; font-weight: 600; }
.cc-radio-hint { display: block; font-size: 12px; color: var(--color-text-secondary, #6b6b6b); }
.cc-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
@media (max-width: 460px) {
  .cc-board { grid-template-columns: 1fr; }
}
`;

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2022"],
  write: false,
});

const js = result.outputFiles[0].text.replace(/<\/script>/gi, "<\\/script>");
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>人设 / Persona</title>
<style>${CSS}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js}</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, "utf8");
console.log(`Built ${OUT} (${Buffer.byteLength(html, "utf8")} bytes)`);
