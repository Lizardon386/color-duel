import type { SeatOptionsSpec, SeatRole } from '@lizardon386/game-sdk';
import { DIFFICULTIES, type Difficulty } from './bots.js';

export const SEAT_COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type SeatColor = (typeof SEAT_COLORS)[number];

const COLOR_HEX: Record<SeatColor, string> = {
  red: '#ef4444',
  yellow: '#f59e0b',
  green: '#22c55e',
  blue: '#3b82f6',
};

/** 头像底纹，纯 CSS 绘制，不需要图片资源。 */
export const SEAT_AVATARS = ['plain', 'dot', 'stripe', 'check', 'ring', 'ray', 'cross'] as const;
export type SeatAvatar = (typeof SEAT_AVATARS)[number];

const AVATAR_LABELS: Record<SeatAvatar, string> = {
  plain: '素',
  dot: '圆点',
  stripe: '斜纹',
  check: '格子',
  ring: '同心',
  ray: '放射',
  cross: '网纹',
};

export const SEAT_OPTIONS: SeatOptionsSpec = {
  fields: [
    {
      key: 'difficulty',
      type: 'enum',
      label: '电脑强度',
      description: '仅电脑位可设；每个电脑位独立。',
      roles: ['ai'],
      default: 'easy',
      options: [
        { value: 'easy', label: '简单' },
        { value: 'normal', label: '中等' },
        { value: 'cold', label: '冷酷' },
      ],
    },
    {
      key: 'color',
      type: 'enum',
      label: '座位颜色',
      description: '显示在座位条上，便于区分玩家。',
      roles: ['host', 'player', 'ai'],
      default: 'red',
      options: [
        { value: 'red', label: '红', color: COLOR_HEX.red },
        { value: 'yellow', label: '黄', color: COLOR_HEX.yellow },
        { value: 'green', label: '绿', color: COLOR_HEX.green },
        { value: 'blue', label: '蓝', color: COLOR_HEX.blue },
      ],
    },
    {
      key: 'avatar',
      type: 'enum',
      label: '头像花纹',
      description: '显示在座位头像上，纯装饰。',
      roles: ['host', 'player', 'ai'],
      default: 'plain',
      options: SEAT_AVATARS.map((value) => ({ value, label: AVATAR_LABELS[value] })),
    },
  ],
};

export function isSeatColor(value: unknown): value is SeatColor {
  return typeof value === 'string' && (SEAT_COLORS as readonly string[]).includes(value);
}

export function isSeatAvatar(value: unknown): value is SeatAvatar {
  return typeof value === 'string' && (SEAT_AVATARS as readonly string[]).includes(value);
}

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

export function defaultSeatColor(slot: number): SeatColor {
  const index = (Math.max(1, slot) - 1) % SEAT_COLORS.length;
  return SEAT_COLORS[index]!;
}

/** 默认花纹按座位轮转，同一桌的人默认就不重样。 */
export function defaultSeatAvatar(slot: number): SeatAvatar {
  const index = (Math.max(1, slot) - 1) % SEAT_AVATARS.length;
  return SEAT_AVATARS[index]!;
}

/** 平台建座与改选项都会调用；先按角色给默认值，再用合法的 raw 覆盖。 */
export function normalizeSeatOptions(
  role: SeatRole,
  slot: number,
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (role === 'ai') options.difficulty = 'easy';
  if (role !== 'spectator') {
    options.color = defaultSeatColor(slot);
    options.avatar = defaultSeatAvatar(slot);
  }
  if (role === 'ai' && isDifficulty(raw?.difficulty)) options.difficulty = raw.difficulty;
  if (role !== 'spectator' && isSeatColor(raw?.color)) options.color = raw.color;
  if (role !== 'spectator' && isSeatAvatar(raw?.avatar)) options.avatar = raw.avatar;
  return options;
}

export function seatDifficulty(raw: Record<string, unknown> | undefined): Difficulty {
  return isDifficulty(raw?.difficulty) ? raw.difficulty : 'easy';
}

export function seatColor(raw: Record<string, unknown> | undefined, slot: number): SeatColor {
  return isSeatColor(raw?.color) ? raw.color : defaultSeatColor(slot);
}
