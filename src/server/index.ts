import { stableDigest, type GameModule, type RuleConfigSpec } from '@lizardon386/game-sdk';
import { normalizeConfig, type ColorDuelConfig } from './config.js';
import { ColorDuel, type ColorDuelSnapshot } from './game.js';

export const GAME_ID = 'color-duel';
export const GAME_NAME = '变色对决';
export const GAME_VERSION = '0.1.0';

export const RULE_CONFIG: RuleConfigSpec = {
  fields: [
    {
      key: 'stack',
      type: 'boolean',
      label: '罚牌接龙',
      description: '被 +N 砸中时可用罚值不小于 N 的罚牌压回，待罚累加。',
      default: true,
    },
    {
      key: 'contest',
      type: 'boolean',
      label: '罚牌质疑',
      description: '吃下黑色罚牌后可盲选一人质疑：他有牌可出罚 6 张，否则你多罚 4 张。依赖接龙。',
      default: true,
    },
    {
      key: 'extend',
      type: 'boolean',
      label: '功能牌拓展',
      description: '加入跳过所有人、甩色、0 换手、7 换手；黑色 +4 改为先反转方向。',
      default: true,
    },
    {
      key: 'merciless',
      type: 'boolean',
      label: '绝情',
      description: '加入 +6 与 +10 重罚牌，并启用手牌上限。',
      default: true,
    },
    {
      key: 'peng',
      type: 'boolean',
      label: '碰',
      description: '顶牌是数字牌时，同色同数可以抢下回合。',
      default: true,
    },
    {
      key: 'cap',
      type: 'enum',
      label: '手牌上限',
      description: '仅在开启绝情时生效；回合结束超限必须先弃牌。',
      default: '20',
      options: [
        { value: '20', label: '20 张' },
        { value: '30', label: '30 张' },
        { value: '40', label: '40 张' },
      ],
    },
    {
      key: 'difficulty',
      type: 'enum',
      label: '电脑强度',
      description: '仅对电脑位生效。简单会漏报牌、不压罚；中等会接龙与报牌；冷酷算牌、能碰必碰。',
      default: 'normal',
      options: [
        { value: 'easy', label: '简单' },
        { value: 'normal', label: '中等' },
        { value: 'cold', label: '冷酷' },
      ],
    },
    {
      key: 'no-turn-timer',
      type: 'boolean',
      label: '关闭出牌倒计时',
      description: '仅在带电脑位的房间生效；报牌 5 秒与质疑 10 秒不受影响。',
      default: false,
    },
  ],
};

export const colorDuel: GameModule = {
  ruleConfig: RULE_CONFIG,
  reference: { entry: 'reference.json' },
  id: GAME_ID,
  name: GAME_NAME,
  version: GAME_VERSION,
  entry: 'client/client.js',
  seats: { min: 2, max: 8 },
  allowSpectate: true,
  soloFill: true,
  roles: ['host', 'player', 'ai', 'spectator'],
  normalizeConfig: (raw) => normalizeConfig(raw) as unknown as Record<string, unknown>,
  rulesHashOf: (config) => stableDigest(config),
  create: (config, ctx) => new ColorDuel(normalizeConfig(config), ctx),
  resume: (snapshot, ctx) =>
    new ColorDuel(normalizeConfig(ctx.config), ctx, snapshot as ColorDuelSnapshot),
  acceptsSnapshot: (snapshot) => (snapshot as { version?: unknown } | null)?.version === 1,
};

export type { ColorDuelConfig };

export default colorDuel;
