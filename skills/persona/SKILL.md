---
name: persona
description: >-
  Manage character-card personas in Antigravity: open the interactive 2×2 Persona board UI,
  list saved personas, inspect the active persona, or switch/disable the active persona.
  Use when the user asks to open, view, edit, import, export, switch, or turn off their
  character persona / 角色卡 / 人设.
---

# Persona Character Cards (`dsh-characard`)

This plugin manages a local character-card library (up to 32 personas across 8 pages of 2×2 frames)
with photos, Tavern `chara_card_v1/v2/v3` import/export, live system-prompt injection via lifecycle
hooks, and optional in-character thinking (`思考也用这个口吻`).

## When to call which tool

- **Open the visual board / create / edit / upload photos / import or export cards**:
  Call the `open_personas` MCP tool. Users can also open **人设 / Persona** directly from the
  left sidebar or the side pane `+` menu.
- **Check what personas exist**:
  Call `list_personas`.
- **Inspect the currently active persona**:
  Call `get_active_persona`.
- **Switch or turn off the active persona directly from chat**:
  Call `switch_persona` with `id` or `name`, or `{ "enabled": false }` to deactivate.
  Changes take effect immediately on the very next model invocation via the `PreInvocation` hook.

## Notes

- Persona data is automatically shared with an existing DSH library at
  `~/.dsh/profiles/desktop/dsh-persona.json` if present, or stored in the plugin's persistent
  `PLUGIN_DATA` directory otherwise.
- When a persona is active, follow the injected `## 人设（Persona）` instructions naturally without
  mentioning the plugin or quoting the prompt block unless asked.
