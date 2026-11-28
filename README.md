# dsh-characard

**Antigravity & DeepSeek Harness (DSH) 双平台角色卡人设插件**：维护一个最多 32 份人设的角色库（2×2 分页角色框 + 角色照片 + Tavern V1/V2/V3 导入导出），同一时间启用一份人设，修改或切换后**下一条回复即生效，无需重启**。

> A dual-host character-card manager for **Google Antigravity** (native Plugin + MCP App UI + Lifecycle Hooks) and **DeepSeek Harness (DSH)**: a paged 2×2 board of character frames, one active persona at a time, live system-prompt injection without a restart, optional in-character thinking, plus Tavern/SillyTavern `chara_card_v1/v2/v3` import and `chara_card_v3` export.

## 在 Antigravity 中安装与使用

本仓库根目录即为标准 Antigravity 插件（含 `plugin.json`、`mcp_config.json`、`hooks.json`、`skills/persona/SKILL.md` 及自包含单文件 MCP App `antigravity/app.html`，**运行期零外部 npm 依赖**，只需本机安装 Node.js）：

### 安装方式

```powershell
# 方式一：直接克隆到 Antigravity 全局插件目录（自动发现，无需额外注册）
git clone https://github.com/473949465695/dsh-characard.git "$env:USERPROFILE\.gemini\config\plugins\dsh-characard"

# 方式二：通过 Antigravity CLI 安装
agy plugin install https://github.com/473949465695/dsh-characard
```

### 使用方式

- **侧边栏 / 侧栏 `+` 菜单**：直接点 **人设 / Persona** 打开交互式 2×2 角色卡管理面板（自动适配 Antigravity 亮/暗主题，支持新建、编辑、传照片、一键启用/关闭、Tavern 角色卡导入与导出）。
- **对话内直接操作**：直接说「打开人设面板」「列出我的人设」「切换到某某角色」「关闭当前人设」，Agent 会调用 `open_personas` / `list_personas` / `get_active_persona` / `switch_persona` 工具处理。
- **即时生效与思考口吻**：通过 `SessionStart` + `PreInvocation` 生命周期 Hook 自动注入当前启用人设；会话中途切换、修改或关闭人设时，下一轮调用立即更新。开启「思考也用这个口吻」后，按第 1 步起每 8 步自动注入简短提醒。
- **自动共享 DSH 人设库**：如果本机已存在 `~/.dsh/profiles/desktop/dsh-persona.json`，Antigravity 会自动共用该人设库与照片目录，无需重复导入；纯 Antigravity 用户则自动存储在插件专属的 `PLUGIN_DATA` 目录中（亦可通过环境变量 `CHARACARD_DATA_DIR` 指定）。

## 在 DSH 中安装（本地包）

在 DSH 里用插件管理器安装本目录（`plugin_manager` → `install_bundle`，路径指向本目录）。安装后：

1. 打开 **设置**（侧边栏底部齿轮）→ 左侧新增 **人设** 一页（在「模型」与「智能体预设」之间）；
2. 点一个 **空格子**（＋ 新建人设）→ 填名字和资料 → **保存**，回到卡片；
3. 点格子里的照片区放一张角色图；点 **编辑** 改内容；
4. 进编辑页打开 **启用此人设**（或列表里点 **启用**）。**同一时间只有一份人设是启用的**，启用时会自动关掉另一份；再点「关闭」就谁都不启用。

## 从 GitHub 安装

```powershell
# 1. 克隆到 DSH 工作区（任意目录都行，插件管理器认绝对路径）
git clone https://github.com/<you>/dsh-characard.git C:\path\to\workspace\dsh-characard
```

2. 在 DSH 里让 agent 或插件管理器执行 `plugin_manager → install_bundle`，路径指向克隆下来的目录；
3. 页面刷新一次（F5）；之后每次更新代码，重新 `install_bundle` 或停用/启用一次即可加载新版（Host 半边的改动可能要重启 DSH）。

> 依赖：DSH 本体。插件不引入任何 npm 依赖，只用 Node 内置模块和 DSH 的 Cordis 服务（`systemPrompt`、`webServer`、`settings.section` 等）。

## 角色框与翻页

- 白色卡片里 2×2 四格，按 **左上 → 右上 → 左下 → 右下** 的顺序摆，一格里一份人设。
- **一页四个框填满之后才能翻到下一页**；翻过去就是另外四个人设（第 2 页的四个框一开始是空的）。随时可以点 **上一页** 翻回来。
- 最多 8 页，也就是 **最多 32 份人设**。
- 每格可以放 **一张** 角色照片：点照片区选图，已有照片时右上角 **×** 移除；点照片区可以换图。
- 支持 **PNG / JPG / WebP / GIF**，单张不超过 **4 MB**（页面上也有这句提示）。
- 当前启用的那份，格子上有 **已启用** 标记；**编辑** 打开编辑页。
- 照片存在 `$DSH_PROFILE_DIR/dsh-persona-images/`，导出时以 data URL 内嵌进 JSON，导入时还原成文件。

## 编辑页

编辑页只有文字资料，没有图片区（照片放在卡片格子里）：

| 字段 | 含义 | 上限 |
| --- | --- | --- |
| 名字 | 人设的名字，写在提示开头 | 80 字 |
| 喜好 | 喜欢的东西、讨厌的东西 | 1000 字 |
| 关系 | 和其他人的关系（家人、朋友、仇家……） | 1000 字 |
| 个人简介 | 身份、经历、性格 | 4000 字 |
| 穿着外貌 | 发色、眼睛、常穿的衣服、随身物件 | 1000 字 |
| 与用户关系 | 和用户是什么关系、怎么相处 | 1000 字 |
| 特长 | 擅长的事；被问到时角色会顺势说「正好我拿手」 | 500 字 |
| 说话风格 | 句式、语气、口头禅 | 2000 字 |
| 必须遵守 | 禁忌、称呼、事实边界 | 4000 字 |

超出上限会按上限截断保存。**删除** 要点两次确认，同时删掉它的照片。

九个文字栏下面还有一个开关 **思考也用这个口吻**：

- 打开并保存后，系统提示里会多出一小节「思考方式」，要求模型在**思考（reasoning）**里也用这个人的口吻——第一人称、同样的语气词和句尾，别用分析报告那种腔调；**思考的语言跟用户一致（中文用户就用中文思考，不许整段英文）**，只有代码、命令、日志、报错原文保留英文；同时不许在思考里自称 AI、复述设定或跟用户对话。
- 光靠那一节不够牢：它只在最前面出现一次，一轮跑几十步之后模型就当远房历史了。所以还**在请求尾部补一条短提醒**——每轮第 1 步一条，之后每 8 步补一条。聊天里它显示成一行折叠的注入提示，不是用户气泡。
- 它按人设各存各的（跟着「保存」一起提交，不用单独点），列表的卡片格子上会出现一个小标记 **思考·人设**。
- 只是提示词层面的**请求**，模型偶尔会跑回原来的调子；也不会改写已经产生的思考文本。判断力不受影响——小节的最后一条明确要求：该核实的事实照核实，该说不知道的照说不知道。
- 导出时这个开关跟着一起写进 JSON（Tavern V3 卡是单卡标准格式，没有这个字段，所以不带）。

## 导入 / 导出

**导出**会弹出一个对话框，先选格式再下载：

| 格式 | 文件 | 内容 |
| --- | --- | --- |
| DSH 插件格式 | `dsh-characards-YYYY-MM-DD.json` | 整库一个文件：全部人设 + 照片（data URL 内嵌），用来备份或换电脑 |
| Tavern 角色卡 V3 | `<角色名>.chara_card_v3.json` | 只导出选中的那一张（默认当前启用的），标准 `chara_card_v3`，能导进 SillyTavern / Chub 等酒馆 |

V3 卡只含八个人设字段，按 `一、个人简介` 到 `八、必须遵守` 分节写进 `description`；**不含**照片、开场白、示例对话和世界书。导出的卡再导回本插件时八个人设字段能原样还原。

DSH 插件格式的文件长这样（JSON，不是 txt）：

```json
{
  "schema": "dsh-persona/v2",
  "exportedAt": "2026-11-14T05:00:00.000Z",
  "personas": [
    {
      "id": "p_xxx",
      "name": "名字",
      "bio": "个人简介",
      "likes": "喜好",
      "relations": "关系",
      "appearance": "穿着外貌",
      "userRelation": "与用户关系",
      "specialty": "特长",
      "style": "说话风格",
      "rules": "必须遵守",
      "images": [{ "slot": 0, "dataUrl": "data:image/png;base64,..." }],
      "active": true
    }
  ]
}
```

导入时接受：上述导出文件、`{ "personas": [...] }`、单个 `{ "name": ..., "bio": ... }` 对象，或它们的 JSON 字符串；旧的 `description` 字段会自动当作 `bio`。导入会重新分配 id、追加到库里（超过 32 份后多余的不再收），不会覆盖已有的人设。

### 导入 Tavern 角色卡（SillyTavern / Opentavern）

也可以直接导入 Tavern 角色卡 JSON（`chara_card_v1` / `v2` / `v3`，即 `{ "spec": "chara_card_v3", "data": { ... } }` 或扁平的 v1 结构）。导入时**只取人设本身**，按卡里的分节自动分栏：

| 卡里的内容 | 落到 |
| --- | --- |
| `name` | 名字 |
| 描述开头的「角色名称 / 性别 / 年龄 / 职业 / 种族」 | 个人简介 |
| 「外貌系统」「穿搭系统」等分节 | 穿着外貌 |
| 「性格系统」等分节 | 个人简介 |
| 「说话方式」等分节 | 说话风格 |
| 「必须遵守」「规则」「禁忌」等分节 | 必须遵守 |
| 「人际关系」分节 | 关系；提到 `{{user}}` / 老师 / 主人的部分 → 与用户关系 |
| 「其他补充」里的「喜欢 / 讨厌」 | 喜好 |
| 「其他补充」里的「特殊技能 / 能力」 | 特长 |
| `personality`（描述里没写过时） | 个人简介 |

**不导入**：`scenario`（背景/时间线）、`first_mes` / `alternate_greetings`（开场白）、`mes_example`（示例对话）、`character_book`（世界书）、`tags`、`creator_notes` 等。`{{user}}` / `{{char}}` 会替换成「用户」和角色名。每个分节超长时按字段上限截断，并尽量给每一节都留一段开头。

## 它是怎么生效的

- **Host 半边**把人设库存成 `$DSH_PROFILE_DIR/dsh-persona.json`（默认 `%USERPROFILE%\.dsh\profiles\<profile>\dsh-persona.json`，权限 0600），不写进 `cordis.patch.yml`，改人设不会动 profile 配置。
- 包名从 `dsh-persona` 改成 `dsh-characard` 之后，**存储文件名故意保留旧名字**（`dsh-persona.json`、`dsh-persona-images/`，导出格式 `dsh-persona/v2`）：里面放的是你的角色和照片，换名会让它们变成孤儿，所以数据层不动，只有包身份、Client 模块 id 和回环桥路径跟着新包名走。
- 每次为新消息组装系统提示时，Host 从磁盘读一次库，把**当前启用的那一份**通过 `systemPrompt.section` 拼成 `## 人设（Persona）` 一节，按「个人简介 / 喜好 / 人际关系 / 穿着外貌 / 与用户的关系 / 特长 / 说话风格 / 必须遵守」分块。没有任何人设启用（或启用的人设为空）时不插入这一节。
- 写了「特长」时，这一节会额外提醒角色：用户问到这些本事时，顺着来一句「正好我拿手」，再自信作答。
- 那份人设打开了 **思考也用这个口吻** 时，这一节末尾再拼一小节「思考方式」，要求思考过程也保持同一个人、同一套语气、同一种语言（跟用户一致，不许整段英文），但不许在思考里自称 AI、复述设定或跟用户对话；没打开时一个字都不多写。
- 光靠系统提示不够：一节提示只在最前面出现过一次，一轮里跑几十步之后模型就把它当远房历史了。所以开了这个开关的人设还会**在请求尾部补一条短提醒**（`agent/pre-step` 里追加一条 `<system-reminder>` 的 user 消息，来源标记 `dsh-characard`，聊天里显示成一行折叠的注入提示，不会变成用户气泡）。第一条在每轮第 1 步，之后每 8 步补一次（`REMINDER_EVERY`）；两次之间消息列表不变，前缀还能照常命中缓存。关掉开关就一条都不加。
- **Client 半边**注册一个 `settings.section` 页面，通过仅限本机回环地址的 `POST /api/dsh-characard/{get,save,activate,delete,image,image-remove,import,export}` 读写（不接受跨站请求，不返回 CORS 头）。

## 从旧版本升级

- v1 是单人设文件（`{ enabled, name, description, style, rules }`）：读取时自动迁移成一个人设、启用状态保持不变。
- v2 是多人设但只有一整块「人设资料」：读取时 `description` 自动落到 **个人简介** 一栏，其他分栏留空，之后可以在编辑页自己拆开填。
- 文件在第一次读取时改写成 v3 结构，旧数据不会丢；超过 32 份的部分保留在文件里但页面只接前 32 份。

## 卸载

在插件管理里停用/移除 `dsh-characard` 后，可顺手删除 `dsh-persona.json` 和 `dsh-persona-images/`（不含其他数据）。

## 文件

- `plugin.json` / `mcp_config.json` / `hooks.json` / `assets/logo.svg` / `skills/persona/SKILL.md` — Antigravity 原生插件清单、MCP App 服务配置、生命周期 Hook、图标与 Skill
- `src/` — 共享核心模块（零外部依赖）：
  - `src/schema.js` — 常量、字段上限、安全 ID 校验、图片魔数校验与状态规范化
  - `src/store.js` — 跨平台数据目录解析、`stat` 缓存读取、原子写入、图片落盘与事务操作
  - `src/prompt.js` — 系统提示拼装、思考口吻提醒与指纹变更检测
  - `src/card.js` — Tavern `chara_card_v1/v2/v3` 与 DSH 备份格式转换
- `antigravity/` — Antigravity 适配层：`hook.mjs`（会话与轮次注入）、`mcp-server.mjs`（零依赖 MCP App 服务端）、`app-src.js` / `build-app.mjs` / `app.html`（基于 `@modelcontextprotocol/ext-apps` 打包的单文件交互界面）
- `index.js` — DSH Host 半边适配器（Cordis 服务与本机回环桥）
- `client.js` — DSH Client 半边：设置页「人设」（四格角色框 + 编辑页 + 导入导出）
- `cordis.patch.yml` — DSH bundle 插入条目（id `dsh-characard`）
- `locale/{zh,en}.json` — DSH 插件列表里的标题与说明
- `icon.svg` — DSH 插件列表里的图标（角色卡轮廓）
- `test/` — 无浏览器冒烟测试：`npm test`（依次运行 `state-smoke.mjs`、`handler-smoke.mjs`、`render-smoke.mjs`、`antigravity-smoke.mjs`）与 `test/bridge-check.ps1`
