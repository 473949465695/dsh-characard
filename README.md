# dsh-characard

DSH 人设插件：在 **设置 → 人设** 里维护一个**人设库**，可以保存多份人设、按需要启用其中一份；启用或修改后，模型从**下一条回复开始**就按这份人设作答（即时生效，无需重启）。

> A character-card manager for [DeepSeek Harness](https://github.com/deepseek-ai) (DSH): a paged 2×2 board of character frames in **Settings → Persona**, one active persona at a time, live system-prompt injection without a restart, plus Tavern/SillyTavern `chara_card_v1/v2/v3` import and `chara_card_v3` export.

## 安装（本地包）

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
- **Client 半边**注册一个 `settings.section` 页面，通过仅限本机回环地址的 `POST /api/dsh-characard/{get,save,activate,delete,image,image-remove,import,export}` 读写（不接受跨站请求，不返回 CORS 头）。

## 从旧版本升级

- v1 是单人设文件（`{ enabled, name, description, style, rules }`）：读取时自动迁移成一个人设、启用状态保持不变。
- v2 是多人设但只有一整块「人设资料」：读取时 `description` 自动落到 **个人简介** 一栏，其他分栏留空，之后可以在编辑页自己拆开填。
- 文件在第一次读取时改写成 v3 结构，旧数据不会丢；超过 32 份的部分保留在文件里但页面只接前 32 份。

## 卸载

在插件管理里停用/移除 `dsh-characard` 后，可顺手删除 `dsh-persona.json` 和 `dsh-persona-images/`（不含其他数据）。

## 文件

- `index.js` — Host 半边：人设库存储、启用状态、系统提示注入、照片落盘、回环桥
- `client.js` — Client 半边：设置页「人设」（四格角色框 + 编辑页 + 导入导出）
- `cordis.patch.yml` — bundle 插入条目（id `dsh-characard`）
- `locale/{zh,en}.json` — 插件列表里的标题与说明
- `icon.svg` — 插件列表里的图标（角色卡轮廓）
- 设置导航里「人设」那一行的图标由 `client.js` 注册到 `settings.section.icon` 槽（id 必须是 `persona`，线条图标跟随主题文字色）；不注册时面板会退回默认的齿轮图标。
- `test/` — 无浏览器冒烟测试：`node test/state-smoke.mjs`、`node test/render-smoke.mjs`、`test/bridge-check.ps1`（本机回环桥端到端，需要 DSH 正在运行）
