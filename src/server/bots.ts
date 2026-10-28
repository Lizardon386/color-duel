import {
  PENALTY,
  canPeng,
  canStack,
  changesColor,
  isBlack,
  isNumber,
  type Card,
  type Color,
  type Random,
  type Rules,
} from './rules.js';

export const DIFFICULTIES = ['easy', 'normal', 'cold'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '简单的敌人',
  normal: '中等的敌人',
  cold: '冷酷的敌人',
};

export interface BotPlayer {
  seatId: string;
  hand: Card[];
  calledLast?: boolean;
  mustCall?: boolean;
}

export interface BotState {
  rules: Rules;
  state: 'playing' | 'ended';
  discard: Card[];
  activeColor: Color;
  direction: number;
  pendingDraw: number;
  pendingExtra: { seatId: string; reason: 'wild' | 'draw' } | null;
  pendingDiscard: { seatId: string; need: number } | null;
  challenge: { victimId: string; targets: string[] } | null;
  players: BotPlayer[];
  currentSeatId(): string | null;
}

export type BotAction =
  | { type: 'discard'; cardIds: string[] }
  | { type: 'accept' }
  | { type: 'contest'; targetId: string }
  | { type: 'lastcall' }
  | { type: 'peng'; cardIds: string[] }
  | { type: 'play'; cardId: string; color?: Color; swapWith?: string }
  | { type: 'draw' }
  | { type: 'endturn' };

const rnd = (rng: Random) => rng();

function legalCards(state: BotState, player: BotPlayer): Card[] {
  const top = state.discard[state.discard.length - 1];
  if (!top) return [];
  if (state.pendingDraw > 0) {
    if (!state.rules.stack) return [];
    return player.hand.filter((card) => canStack(card, state.pendingDraw, state.activeColor));
  }
  return player.hand.filter((card) => canPlayLocal(card, state, top));
}

function canPlayLocal(card: Card, state: BotState, top: Card): boolean {
  if (isBlack(card)) return true;
  if (card.color === state.activeColor) return true;
  return card.value === top.value && top.value !== 'flush';
}

function scoreCard(state: BotState, player: BotPlayer, card: Card): number {
  let score = 0;
  if (player.hand.length === 1) return 1000;
  if (card.value === 'flush') {
    const dumped = player.hand.filter((x) => x.color === card.color && x.id !== card.id).length;
    score += 60 + dumped * 25;
  }
  const penalty = PENALTY[card.value];
  if (penalty) score += 40 + penalty * 3;
  if (card.value === 'skip') score += 30;
  if (card.value === 'reverse') score += 22;
  if (card.value === 'wild') score -= 25;
  if (isBlack(card) && !penalty) score -= 10;
  if (isNumber(card)) {
    score += Number(card.value);
    const sameColor = player.hand.filter((x) => x.color === card.color).length;
    if (card.color === state.activeColor && sameColor > 3) score -= 15;
  }
  return score;
}

function chooseColorForWild(state: BotState, player: BotPlayer): Color {
  const count: Record<string, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const card of player.hand) if (count[card.color] !== undefined) count[card.color]! += 1;
  let best: Color = state.activeColor === 'wild' ? 'red' : state.activeColor;
  let bestCount = -1;
  for (const [color, value] of Object.entries(count)) {
    if (value > bestCount) {
      bestCount = value;
      best = color as Color;
    }
  }
  return best;
}

export function decideBotAction(
  state: BotState,
  player: BotPlayer,
  difficulty: Difficulty,
  rng: Random,
): BotAction | null {
  if (state.state !== 'playing') return null;
  const roll = rnd(rng);

  if (state.pendingDiscard && state.pendingDiscard.seatId === player.seatId) {
    const rank = (card: Card) => (isBlack(card) ? 0 : isNumber(card) ? Number(card.value) + 1 : 0.5);
    const sorted = [...player.hand].sort((a, b) => rank(b) - rank(a));
    return { type: 'discard', cardIds: sorted.slice(0, state.pendingDiscard.need).map((card) => card.id) };
  }

  if (state.challenge && state.challenge.victimId === player.seatId) {
    const targets = state.challenge.targets
      .map((seatId) => state.players.find((p) => p.seatId === seatId))
      .filter((p): p is BotPlayer => Boolean(p));
    if (!targets.length || difficulty === 'easy') return { type: 'accept' };
    const sureLosers = targets.filter(
      (target) => !target.hand.some((card) => isBlack(card) || card.color === state.activeColor),
    );
    if (sureLosers.length) return { type: 'contest', targetId: sureLosers[0]!.seatId };
    if (difficulty === 'normal' && roll < 0.35) return { type: 'contest', targetId: targets[0]!.seatId };
    return { type: 'accept' };
  }

  if (state.pendingExtra && state.pendingExtra.seatId === player.seatId) {
    // 打出变色牌或摸牌后仍持有回合；先按正常流程尝试出牌，出不了再结束回合。
  }

  const hand = player.hand;
  if (hand.length === 1 && !state.challenge) {
    // 报牌由 game 在窗口内驱动，bot 该报就报（简单档偶尔忘）
    if (player.mustCall && !player.calledLast && (difficulty === 'easy' ? roll < 0.55 : true)) {
      return { type: 'lastcall' };
    }
  }

  if (state.rules.peng && state.pendingDraw === 0 && !state.challenge) {
    const top = state.discard[state.discard.length - 1];
    const current = state.currentSeatId();
    if (top && isNumber(top) && current && current !== player.seatId) {
      const hits = hand.filter((card) => canPeng(card, top));
      if (hits.length) {
        const want = difficulty === 'cold' ? 1 : difficulty === 'normal' ? 0.6 : 0.3;
        if (roll < want) return { type: 'peng', cardIds: hits.slice(0, 2).map((card) => card.id) };
      }
    }
  }

  const current = state.currentSeatId();
  if (!current || current !== player.seatId) return null;
  if (state.challenge || state.pendingDiscard) return null;

  const legal = legalCards(state, player);
  const extra = state.pendingExtra && state.pendingExtra.seatId === player.seatId;

  if (state.pendingDraw > 0) {
    if (legal.length && difficulty !== 'easy') {
      const best = legal.reduce((a, b) => (PENALTY[b.value]! > PENALTY[a.value]! ? b : a));
      return {
        type: 'play',
        cardId: best.id,
        color: changesColor(best) ? chooseColorForWild(state, player) : undefined,
      };
    }
    return { type: 'draw' };
  }

  if (legal.length) {
    let pick: Card;
    if (difficulty === 'cold') pick = legal.reduce((a, b) => (scoreCard(state, player, b) > scoreCard(state, player, a) ? b : a));
    else if (difficulty === 'normal') pick = legal[Math.floor(roll * legal.length)]!;
    else {
      const numbers = legal.filter((card) => isNumber(card));
      const pool = numbers.length && roll < 0.7 ? numbers : legal;
      pick = pool[Math.floor(roll * pool.length)]!;
    }
    const action: BotAction = { type: 'play', cardId: pick.id };
    if (changesColor(pick)) action.color = chooseColorForWild(state, player);
    if (pick.value === '7' && state.rules.extend) {
      const foes = state.players.filter((p) => p.seatId !== player.seatId);
      if (foes.length) {
        if (difficulty === 'cold') {
          const poorest = foes.reduce((a, b) => (b.hand.length < a.hand.length ? b : a));
          if (hand.length > poorest.hand.length + 3) action.swapWith = poorest.seatId;
        } else if (roll < (difficulty === 'normal' ? 0.5 : 0.25)) {
          action.swapWith = foes[Math.floor(roll * foes.length)]!.seatId;
        }
      }
    }
    return action;
  }

  if (extra) return { type: 'endturn' };
  return { type: 'draw' };
}
