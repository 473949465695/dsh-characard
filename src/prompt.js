/**
 * System prompt assembly and per-step in-character thinking reminders.
 */
import { createHash, randomUUID } from "node:crypto";
import { PROMPT_MAX_CHARS, activePersona, personaText } from "./schema.js";

/** Cadence for repeating the in-character thinking reminder (step 1, 9, 17, ...). */
export const REMINDER_EVERY = 8;

/** The persona prompt block. Empty string means no active persona (nothing injected). */
export function promptText(state) {
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
 * Compact per-step reminder that keeps the thinking voice alive across long turns.
 */
export function thinkingReminder(state) {
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

export function reminderDue(step) {
  if (typeof step !== "number" || !Number.isFinite(step) || step < 1) return true;
  return (step - 1) % REMINDER_EVERY === 0;
}

/** Compact user-role notice for DSH `agent/pre-step`. */
export function reminderMessage(text) {
  return {
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "dsh-characard", form: "notice", summary: "思考口吻" },
  };
}

/** Stable fingerprint of the active persona prompt (empty string when inactive). */
export function promptFingerprint(text) {
  if (!text) return "";
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
