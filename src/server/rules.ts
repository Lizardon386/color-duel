/**
 * 变色对决规则层：牌堆、牌型、合法性与罚值，全是纯函数。
 * 服务端是唯一权威，客户端只拿这些结果做“能不能点”的即时反馈。
 */

export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number] | 'wild';

export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2'
  | 'wild' | 'wild4' | 'wild6' | 'wild10' | 'skipall' | 'flush';

export interface Card {
  id: string;
  color: Color;
  value: CardValue;
}

export interface Rules {
  stack: boolean;
  contest: boolean;
  extend: boolean;
  merciless: boolean;
  peng: boolean;
  cap: number;
  noTurnTimer: boolean;
}

export const CAP_OPTIONS = [20, 30, 40] as const;
export const DECK_VERSION = 3;

export const DEFAULT_RULES: Rules = {
  stack: true,
  contest: true,
  extend: true,
  merciless: true,
  peng: true,
  cap: 20,
  noTurnTimer: false,
};

export function normalizeRules(input: Record<string, unknown> | undefined = {}): Rules {
  const r: Rules = { ...DEFAULT_RULES };
  for (const key of ['stack', 'contest', 'extend', 'merciless', 'peng', 'noTurnTimer'] as const) {
    if (input[key] !== undefined) r[key] = Boolean(input[key]);
  }
  const cap = Number(input.cap);
  if ((CAP_OPTIONS as readonly number[]).includes(cap)) r.cap = cap;
  else if (input.cap !== undefined) r.cap = CAP_OPTIONS[0];
  if (!r.stack) r.contest = false;
  if (!r.merciless) r.cap = 0;
  return r;
}

export const PENALTY: Partial<Record<CardValue, number>> = {
  draw2: 2,
  wild4: 4,
  wild6: 6,
  wild10: 10,
};

export const isBlack = (card: Card): boolean => card.color === 'wild';
export const isPenalty = (card: Card): boolean => PENALTY[card.value] !== undefined;
export const penaltyOf = (card: Card): number => PENALTY[card.value] ?? 0;
export const isNumber = (card: Card): boolean => /^[0-9]$/.test(card.value);
export const changesColor = (card: Card): boolean =>
  isBlack(card) && ['wild', 'wild4', 'wild6', 'wild10'].includes(card.value);

export type Random = () => number;

let deckSeq = 0;
let refillSeq = 0;

function card(color: Color, value: CardValue, tag: number, index: number): Card {
  return { id: `d${tag}-${color}-${value}-${index}`, color, value };
}

/** 牌堆抽空后补的牌必须全局唯一，不能重建整副牌（否则 id 会和手里的牌撞号）。 */
export function syntheticCard(): Card {
  return { id: `refill-${refillSeq++}`, color: 'wild', value: 'wild' };
}

export function shuffle<T>(arr: readonly T[], rng: Random = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function buildDeck(rules: Rules = DEFAULT_RULES, rng: Random = Math.random): Card[] {
  const tag = ++deckSeq;
  let index = 0;
  const deck: Card[] = [];
  const push = (color: Color, value: CardValue) => deck.push(card(color, value, tag, index++));
  for (const color of COLORS) {
    for (let n = 0; n <= 9; n++) {
      push(color, String(n) as CardValue);
      push(color, String(n) as CardValue);
    }
    for (const action of ['skip', 'reverse', 'draw2'] as const) {
      push(color, action);
      push(color, action);
    }
    if (rules.extend) {
      push(color, 'flush');
      push(color, 'flush');
    }
  }
  const pushBlack = (value: CardValue) => {
    for (let i = 0; i < 8; i++) push('wild', value);
  };
  pushBlack('wild');
  pushBlack('wild4');
  if (rules.extend) pushBlack('skipall');
  if (rules.merciless) {
    pushBlack('wild6');
    pushBlack('wild10');
  }
  return shuffle(deck, rng);
}

export function canPlay(play: Card, top: Card, activeColor: Color): boolean {
  if (isBlack(play)) return true;
  if (play.color === activeColor) return true;
  return play.value === top.value && top.value !== 'flush';
}

export function canStack(play: Card, pendingDraw: number, activeColor: Color): boolean {
  if (!isPenalty(play)) return false;
  if (penaltyOf(play) < pendingDraw) return false;
  return isBlack(play) || play.color === activeColor;
}

/** 碰：只能碰数字牌，且颜色和数字都要和顶牌一致。 */
export function canPeng(handCard: Card, top: Card): boolean {
  if (!isNumber(top) || top.color === 'wild') return false;
  return handCard.color === top.color && handCard.value === top.value && isNumber(handCard);
}

export interface PileState {
  deck: Card[];
  discard: Card[];
}

export function drawFromDeck(state: PileState, count = 1, rng: Random = Math.random): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      const keepTop = state.discard.slice(-1)[0];
      const recycle = state.discard.slice(0, -1);
      state.deck = shuffle(recycle, rng);
      state.discard = keepTop ? [keepTop] : [];
      if (state.deck.length === 0) {
        drawn.push(syntheticCard());
        continue;
      }
    }
    drawn.push(state.deck.pop()!);
  }
  return drawn;
}
