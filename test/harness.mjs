import { normalizeConfig } from '../dist-ts/server/config.js';
import { normalizeSeatOptions } from '../dist-ts/server/seat-options.js';
import colorDuel from '../dist-ts/server/index.js';

export const C = (id, color, value) => ({ id, color, value });

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeats(roles) {
  return roles.map((role, index) => ({
    seatId: `s${index + 1}`,
    slot: index + 1,
    name: role === 'ai' ? `电脑${index}` : `玩家${index + 1}`,
    role,
    team: null,
    ready: true,
    connected: role !== 'ai',
    options: normalizeSeatOptions(role, index + 1, undefined),
  }));
}

export function makeGame({ roles = ['host', 'ai', 'ai', 'ai'], raw = {}, seed = 1, startAt = 1000 } = {}) {
  const seats = makeSeats(roles);
  const random = mulberry32(seed);
  let now = startAt;
  const ctx = {
    roomCode: 'TEST',
    config: normalizeConfig(raw),
    now: () => now,
    random,
    seats: () => seats.map((seat) => ({ ...seat })),
    seat: (seatId) => seats.find((seat) => seat.seatId === seatId),
  };
  const game = colorDuel.create(normalizeConfig(raw), ctx);
  return {
    game,
    seats,
    ctx,
    now: () => now,
    advance: (ms) => {
      now += ms;
      return now;
    },
    start() {
      return game.begin();
    },
  };
}

export function player(game, seatId) {
  return game.players.find((item) => item.seatId === seatId);
}

let fillerSeq = 0;

/** 把牌桌固定到一个可控状态，避免开局顶牌随机影响断言。 */
export function resetTable(game, { top, color = top.color, hands = {}, turn = 0 } = {}) {
  game.state = 'playing';
  game.winner = null;
  game.discard = [top];
  game.activeColor = color;
  game.direction = 1;
  game.pendingDraw = 0;
  game.chainBlack = [];
  game.pendingExtra = null;
  game.pendingDiscard = null;
  game.challenge = null;
  game.skipQueue = [];
  game.turn = typeof turn === 'number' ? turn : game.players.findIndex((item) => item.seatId === turn);
  game.turnStartedAt = game.ctx.now();
  game.botDueAt.clear();
  game.deck = Array.from({ length: 120 }, (_, index) => C(`f${fillerSeq++}-${index}`, 'green', '8'));
  for (const item of game.players) {
    item.hand = hands[item.seatId] ? hands[item.seatId].slice() : [C(`keep-${fillerSeq++}-${item.seatId}`, 'blue', '9')];
    item.calledLast = false;
    item.mustCall = false;
    item.callDeadline = null;
  }
  return game;
}

export function setHand(game, seatId, hand) {
  player(game, seatId).hand = hand;
}

export function setTurn(game, seatId) {
  game.turn = game.players.findIndex((item) => item.seatId === seatId);
}

export function currentSeat(game) {
  return game.players[game.turn % game.players.length]?.seatId ?? null;
}

export function topOf(game, card, color = card.color) {
  game.discard = [card];
  game.activeColor = color;
}

export function act(game, seatId, name, payload) {
  return game.handle({ name, payload }, seatId);
}

export function effectsOf(result) {
  return Array.isArray(result) ? result : [];
}

export function errorsOf(result) {
  return effectsOf(result).filter((effect) => effect.kind === 'toSeat' && effect.name === 'error');
}

export function allCardIds(game) {
  return [
    ...game.players.flatMap((item) => item.hand.map((card) => card.id)),
    ...game.discard.map((card) => card.id),
    ...game.deck.map((card) => card.id),
    ...(game.challenge ? game.challenge.held.map((card) => card.id) : []),
  ];
}
