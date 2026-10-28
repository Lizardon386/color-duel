import { DIFFICULTIES, type Difficulty } from './bots.js';
import { normalizeRules, type Rules } from './rules.js';

export interface ColorDuelConfig extends Rules {
  difficulty: Difficulty;
}

export const DEFAULT_CONFIG: ColorDuelConfig = { ...normalizeRules(undefined), difficulty: 'normal' };

export function normalizeConfig(raw: Record<string, unknown> | undefined): ColorDuelConfig {
  // 表单字段 key 用连字符（rule-config 约束），内部状态沿用 camelCase。
  const rules = normalizeRules({ ...raw, noTurnTimer: raw?.['no-turn-timer'] ?? raw?.noTurnTimer });
  const difficulty = (DIFFICULTIES as readonly string[]).includes(String(raw?.difficulty))
    ? (raw!.difficulty as Difficulty)
    : 'normal';
  return { ...rules, difficulty };
}

export const TIMING = {
  lastCallMs: 5000,
  challengeMs: 10000,
  pvpTurnMs: 60000,
  pveTurnMs: 15000,
  botDelayMs: 650,
} as const;
