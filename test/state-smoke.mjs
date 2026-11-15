/**
 * Headless state-machine smoke test for the host half.
 * Run:  node test/state-smoke.mjs
 */
import assert from "node:assert/strict";
import { __test } from "../index.js";

const { normalizeState, parseImport, promptText, normalizeImages } = __test;

function personas(state) {
  return state.personas.map((persona) => persona.name);
}

// --- version 1 migration: one flat persona with enabled:true becomes active.
{
  const state = normalizeState({ enabled: true, name: "薇拉", description: "吸血鬼", style: "懒散", rules: "" });
  assert.equal(state.version, 3);
  assert.equal(state.personas.length, 1);
  assert.equal(state.activeId, state.personas[0].id);
  assert.equal(state.personas[0].bio, "吸血鬼");
  const text = promptText(state);
  assert.match(text, /## 人设（Persona）/);
  assert.match(text, /薇拉/);
  assert.match(text, /吸血鬼/);
}

// --- version 1 with enabled:false stays inactive.
{
  const state = normalizeState({ enabled: false, name: "薇拉", description: "吸血鬼" });
  assert.equal(state.activeId, null);
  assert.equal(promptText(state), "");
}

// --- version 2: several personas, only the active one reaches the prompt.
{
  const state = normalizeState({
    version: 2,
    activeId: "b",
    personas: [
      { id: "a", name: "甲", description: "第一个人设" },
      { id: "b", name: "乙", description: "第二个人设" },
    ],
  });
  assert.deepEqual(personas(state), ["甲", "乙"]);
  const text = promptText(state);
  assert.match(text, /乙/);
  assert.match(text, /第二个人设/);
  assert.doesNotMatch(text, /甲/);
  assert.doesNotMatch(text, /第一个人设/);
}

// --- version 3: the split fields all reach the prompt, in order.
{
  const state = normalizeState({
    version: 3,
    activeId: "n",
    personas: [
      {
        id: "n",
        name: "薇拉",
        likes: "甜食",
        relations: "旧书店的熟客",
        bio: "开旧书店的吸血鬼",
        appearance: "旧外套",
        userRelation: "主人兼老朋友",
        specialty: "旧书鉴定",
        style: "懒散",
        rules: "不要回怼",
      },
    ],
  });
  const text = promptText(state);
  for (const fragment of ["个人简介", "喜好", "人际关系", "穿着外貌", "与用户的关系", "特长", "说话风格", "必须遵守"]) {
    assert.ok(text.includes(fragment), `prompt misses ${fragment}`);
  }
  for (const value of ["甜食", "旧书店的熟客", "开旧书店的吸血鬼", "旧外套", "主人兼老朋友", "旧书鉴定", "懒散", "不要回怼"]) {
    assert.ok(text.includes(value), `prompt misses ${value}`);
  }
  // The specialty block tells the character to own the topic.
  assert.match(text, /正好我拿手/);
  // Section order inside the prompt.
  const order = ["个人简介", "喜好", "人际关系", "穿着外貌", "与用户的关系", "特长", "说话风格", "必须遵守"];
  const positions = order.map((label) => text.indexOf(label));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
}

// --- a persona without a specialty gets no "正好我拿手" nudge.
{
  const state = normalizeState({ activeId: "a", personas: [{ id: "a", name: "甲", bio: "只写简介" }] });
  assert.doesNotMatch(promptText(state), /正好我拿手/);
}

// --- images: at most four slots, known formats only, slot order kept.
{
  const images = normalizeImages([
    { slot: 3, ext: "png", size: 10 },
    { slot: 0, ext: "jpg", size: 20 },
    { slot: 0, ext: "gif", size: 30 },
    { slot: 9, ext: "png" },
    { slot: 1, ext: "bmp" },
    { slot: "2", ext: "webp", size: 5 },
  ]);
  assert.deepEqual(images.map((image) => [image.slot, image.ext]), [[0, "jpg"], [2, "webp"], [3, "png"]]);
}

// --- dangling activeId means "nobody active".
{
  const state = normalizeState({ version: 3, activeId: "missing", personas: [{ id: "a", name: "甲", bio: "x" }] });
  assert.equal(state.activeId, null);
  assert.equal(promptText(state), "");
}

// --- an active persona with only a name still says nothing.
{
  const state = normalizeState({ version: 3, activeId: "a", personas: [{ id: "a", name: "甲" }] });
  assert.equal(promptText(state), "");
}

// --- caps are clamped, ids generated, at most 4 frames × 8 pages = 32 kept.
{
  const long = "x".repeat(10000);
  const state = normalizeState({ personas: [{ name: long, specialty: "y".repeat(900) }, { name: "b" }] });
  assert.equal(state.personas[0].name.length, 80);
  assert.equal(state.personas[0].specialty.length, 500);
  assert.equal(state.personas[0].bio.length, 0);
  assert.ok(state.personas.every((persona) => typeof persona.id === "string" && persona.id.length > 0));
  const many = normalizeState({ personas: Array.from({ length: 40 }, (_, index) => ({ name: `p${index}` })) });
  assert.equal(many.personas.length, 32);
}

// --- import shapes.
{
  const bundle = {
    schema: "dsh-persona/v2",
    exportedAt: "2026-01-01T00:00:00.000Z",
    personas: [
      { id: "a", name: "甲", bio: "d1", specialty: "修钟", images: [{ slot: 0, dataUrl: "data:image/png;base64,AAAA" }] },
      { id: "b", name: "乙", description: "d2" },
    ],
  };
  const imported = parseImport(bundle);
  assert.equal(imported.length, 2);
  assert.equal(imported[0].persona.name, "甲");
  assert.equal(imported[0].persona.bio, "d1");
  assert.notEqual(imported[0].persona.id, "a"); // ids are reassigned on import
  assert.equal(imported[0].images.length, 1);
  assert.equal(imported[1].persona.bio, "d2");
  assert.deepEqual(parseImport(JSON.stringify(bundle)).map((entry) => entry.persona.name), ["甲", "乙"]);
  assert.equal(parseImport({ name: "单独", bio: "x" }).length, 1);
  assert.equal(parseImport("not json"), undefined);
  assert.equal(parseImport({ hello: "world" }), undefined);
  assert.equal(parseImport({ personas: [] }), undefined);
}

// --- Tavern character cards: persona sections only, background and greeting skipped.
{
  const card = {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      name: "音葵",
      description: [
        "角色名称：音葵",
        "性别：女",
        "",
        "一、外貌系统",
        "浅灰长发，浅绿瞳孔。",
        "",
        "二、穿搭系统",
        "水手服配战术手套。",
        "",
        "三、性格系统",
        "外向外壳，内心怕孤独。",
        "",
        "四、说话方式",
        "轻松口语，常带「～」。",
        "",
        "五、背景与动机系统",
        "过往事件一：不该导入的背景。",
        "",
        "六、人际关系与对{{user}}的态度",
        "人际关系网：",
        "- 雪乃是队长。",
        "对{{user}}的真实情感：",
        "很信赖老师。",
        "",
        "七、其他补充",
        "喜欢的事物：",
        "解谜、稻荷寿司。",
        "讨厌的事物：",
        "太久独处。",
        "特殊技能 / 能力：",
        "- 远距离穿透射击。",
      ].join("\n"),
      personality: "外向外壳，内心怕孤独。",
      scenario: "开场白之外的背景，不该导入。",
      first_mes: "这是一段开场白，不该导入。",
      mes_example: "{{user}}: 你好\n{{char}}: 嗨～",
      system_prompt: "",
      tags: ["Blue Archive"],
      character_book: { entries: [] },
    },
  };
  const [{ persona, converted }] = parseImport(card);
  assert.equal(converted, "opentavern");
  assert.equal(persona.name, "音葵");
  assert.match(persona.bio, /音葵/);
  assert.match(persona.bio, /外向外壳/);
  assert.match(persona.appearance, /浅灰长发/);
  assert.match(persona.appearance, /水手服配战术手套/);
  assert.match(persona.style, /轻松口语/);
  assert.match(persona.relations, /雪乃是队长/);
  assert.match(persona.userRelation, /很信赖老师/);
  assert.match(persona.likes, /喜欢：/);
  assert.match(persona.likes, /讨厌：/);
  assert.match(persona.specialty, /远距离穿透射击/);
  const fields = [
    persona.bio,
    persona.appearance,
    persona.style,
    persona.relations,
    persona.userRelation,
    persona.likes,
    persona.specialty,
    persona.rules,
  ];
  for (const value of fields) {
    assert.ok(!value.includes("不该导入"), "background or greeting leaked into the persona");
    assert.ok(!value.includes("{{user}}") && !value.includes("{{char}}"), "template tokens leaked");
  }
  assert.equal(parseImport(JSON.stringify(card))[0].persona.name, "音葵");

  // A flat `chara_card_v1` card (no numbered sections) lands in the bio.
  const flat = parseImport({ name: "旧卡", description: "只有一段描述。", personality: "安静。" });
  assert.equal(flat.length, 1);
  assert.match(flat[0].persona.bio, /只有一段描述/);
  assert.match(flat[0].persona.bio, /安静/);

  // Cards are recognised, plain persona files are not mistaken for cards.
  assert.equal(parseImport({ hello: "world" }), undefined);
  assert.equal(parseImport({ name: "单独", bio: "x" }).length, 1);
}

// --- chara_card_v3 export: spec shape, numbered sections, lossless round trip.
{
  const { toCharacterCardV3 } = __test;
  const persona = {
    id: "x",
    name: "薇拉（Vera）",
    bio: "开旧书店的吸血鬼。",
    likes: "甜食、冰饮。",
    relations: "熟客。",
    appearance: "旧外套。",
    userRelation: "主人兼老朋友。",
    specialty: "旧书鉴定。",
    style: "懒散，语气词多。",
    rules: "别自称 AI。",
    images: [],
    updatedAt: "",
  };
  const card = toCharacterCardV3(persona);
  assert.equal(card.spec, "chara_card_v3");
  assert.equal(card.spec_version, "3.0");
  assert.equal(card.data.name, "薇拉（Vera）");
  assert.match(card.data.description, /一、个人简介/);
  assert.match(card.data.description, /八、必须遵守/);
  assert.equal(card.data.first_mes, "");
  assert.deepEqual(card.data.group_only_greetings, []);
  const [{ persona: back, converted }] = parseImport(card);
  assert.equal(converted, "opentavern");
  assert.equal(back.name, persona.name);
  for (const field of ["bio", "likes", "relations", "appearance", "userRelation", "specialty", "style", "rules"]) {
    assert.equal(back[field], persona[field], `round trip lost ${field}`);
  }
  // An unnamed persona still exports a card with a usable name.
  assert.ok(toCharacterCardV3({ ...persona, name: "" }).data.name.length > 0);
}

console.log("state smoke ok");
