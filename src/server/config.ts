import { normalizeRules, type Rules } from './rules.js';

export type ColorDuelConfig = Rules;

export const DEFAULT_CONFIG: ColorDuelConfig = normalizeRules(undefined);

export function normalizeConfig(raw: Record<string, unknown> | undefined): ColorDuelConfig {
  // 表单字段 key 用连字符（rule-config 约束），内部状态沿用 camelCase。
  return normalizeRules({ ...raw, noTurnTimer: raw?.['no-turn-timer'] ?? raw?.noTurnTimer });
}

export const TIMING = {
  lastCallMs: 5000,
  challengeMs: 10000,
  pvpTurnMs: 60000,
  pveTurnMs: 15000,
  botDelayMs: 650,
} as const;
