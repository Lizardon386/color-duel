import test from 'node:test';
import assert from 'node:assert/strict';
import colorDuel from '../dist-ts/server/index.js';
import { C, act, currentSeat, errorsOf, effectsOf, makeGame, player, resetTable } from './harness.mjs';

function started(options) {
  const setup = makeGame(options);
  const result = setup.start();
  assert.ok(Array.isArray(result), 'begin 应当成功');
  return setup;
}

test('开局：每人 7 张，顶牌不是黑色，视角裁剪正确', () => {
  const { game } = started({ roles: ['host', 'player'] });
  assert.equal(game.state, 'playing');
  assert.equal(game.players.length, 2);
  for (const item of game.players) assert.equal(item.hand.length, 7);
  assert.notEqual(game.discard.at(-1).color, 'wild');

  const a = game.serialize('s1');
  const b = game.serialize(null);
  assert.equal(Array.isArray(a.players.find((item) => item.seatId === 's1').hand), true);
  assert.equal(a.players.find((item) => item.seatId === 's2').hand, undefined);
  assert.equal(b.players.every((item) => item.hand === undefined), true);
});

test('出牌：同色可出，非法牌被拒，不是自己的回合被拒', () => {
  const { game } = started({ roles: ['host', 'player'] });
  resetTable(game, { top: C('top', 'red', '3'), hands: { s1: [C('a', 'red', '5'), C('b', 'blue', '9')], s2: [C('c', 'blue', '2')] }, turn: 's1' });
  assert.equal(errorsOf(act(game, 's1', 'play', { cardId: 'b' })).length, 1);
  assert.equal(effectsOf(act(game, 's1', 'play', { cardId: 'a' })).length, 0);
  assert.equal(game.discard.at(-1).id, 'a');
  assert.equal(currentSeat(game), 's2');
  assert.equal(errorsOf(act(game, 's1', 'play', { cardId: 'b' }))[0].payload.text, '还没轮到你');
});

test('变色牌：必须选色，不占出牌权，可再出一张或结束回合', () => {
  const { game } = started({ roles: ['host', 'player'] });
  resetTable(game, {
    top: C('top', 'red', '3'),
    hands: { s1: [C('w', 'wild', 'wild'), C('g', 'green', '5'), C('r', 'red', '4')], s2: [C('x', 'blue', '2')] },
    turn: 's1',
  });
  assert.equal(errorsOf(act(game, 's1', 'play', { cardId: 'w' })).length, 1);
  assert.equal(effectsOf(act(game, 's1', 'play', { cardId: 'w', color: 'green' })).length, 0);
  assert.equal(game.activeColor, 'green');
  assert.equal(game.pendingExtra.seatId, 's1');
  assert.equal(errorsOf(act(game, 's1', 'play', { cardId: 'r' })).length, 1);
  assert.equal(effectsOf(act(game, 's1', 'play', { cardId: 'g' })).length, 0);
  assert.equal(currentSeat(game), 's2');
  assert.equal(game.pendingExtra, null);
});

test('摸牌：摸过一张后不能再摸，摸到的牌可立刻打出', () => {
  const { game } = started({ roles: ['host', 'player'] });
  resetTable(game, { top: C('top', 'red', '9'), hands: { s1: [C('a', 'blue', '1')], s2: [C('b', 'blue', '2')] }, turn: 's1' });
  game.deck = [C('draw1', 'red', '5')];
  assert.equal(effectsOf(act(game, 's1', 'draw')).length, 0);
  assert.equal(game.pendingExtra.reason, 'draw');
  assert.equal(errorsOf(act(game, 's1', 'draw')).length, 1);
  assert.equal(effectsOf(act(game, 's1', 'play', { cardId: 'draw1' })).length, 0);
  assert.equal(currentSeat(game), 's2');
});

test('接龙与质疑：待罚累加、质疑成功揭示手牌并罚对方 6 张', () => {
  const { game } = started({ roles: ['host', 'player', 'player'] });
  resetTable(game, {
    top: C('top', 'red', '3'),
    hands: {
      s1: [C('w6', 'wild', 'wild6'), C('a', 'red', '9')],
      s2: [C('d2', 'blue', 'draw2'), C('b', 'green', '2')],
      s3: [C('c', 'green', '4')],
    },
    turn: 's1',
  });
  act(game, 's1', 'play', { cardId: 'w6', color: 'red' });
  assert.equal(game.pendingDraw, 6);
  assert.equal(errorsOf(act(game, 's2', 'play', { cardId: 'd2' })).length, 1);
  assert.equal(effectsOf(act(game, 's2', 'draw')).length, 0);
  assert.ok(game.challenge);
  assert.equal(game.challenge.held.length, 6);
  assert.deepEqual(game.challenge.targets, ['s1']);

  const view = game.serialize('s2');
  assert.equal(view.challenge.targets[0].hand, undefined);
  assert.equal(view.challenge.heldCount, 6);

  const result = act(game, 's2', 'contest', { targetId: 's1' });
  const reveal = effectsOf(result).find((effect) => effect.name === 'reveal');
  assert.ok(reveal);
  assert.equal(reveal.payload.success, true);
  assert.equal(reveal.payload.hand.some((card) => card.id === 'a'), true);
  assert.equal(player(game, 's1').hand.length, 1 + 6);
  assert.equal(player(game, 's2').hand.length, 2 + 6);
  assert.equal(game.challenge, null);
});

test('质疑失败：对方确实没牌可出，质疑者多罚 4 张', () => {
  const { game } = started({ roles: ['host', 'player'] });
  resetTable(game, {
    top: C('top', 'red', '3'),
    hands: {
      s1: [C('w4', 'wild', 'wild4'), C('a', 'blue', '9')],
      s2: [C('b', 'green', '2')],
    },
    turn: 's1',
  });
  act(game, 's1', 'play', { cardId: 'w4', color: 'red' });
  act(game, 's2', 'draw');
  assert.ok(game.challenge);
  const result = act(game, 's2', 'contest', { targetId: 's1' });
  const reveal = effectsOf(result).find((effect) => effect.name === 'reveal');
  assert.equal(reveal.payload.success, false);
  assert.equal(player(game, 's1').hand.length, 1);
  assert.equal(player(game, 's2').hand.length, 1 + 4 + 4);
});

test('碰：同色同数抢回合，两张可一起碰', () => {
  const { game } = started({ roles: ['host', 'player', 'player'] });
  resetTable(game, {
    top: C('top', 'red', '5'),
    hands: {
      s1: [C('a', 'blue', '1')],
      s2: [C('p1', 'red', '5'), C('p2', 'red', '5'), C('b', 'green', '2')],
      s3: [C('c', 'green', '4')],
    },
    turn: 's1',
  });
  assert.deepEqual(game.serialize('s2').peng.sort(), ['p1', 'p2']);
  assert.equal(effectsOf(act(game, 's2', 'peng', { cardIds: ['p1', 'p2'] })).length, 0);
  assert.equal(player(game, 's2').hand.length, 1);
  assert.equal(game.discard.length, 3);
  assert.equal(currentSeat(game), 's3');
});

test('甩色：其余同色牌一起进废牌堆，顶牌仍是甩色牌', () => {
  const { game } = started({ roles: ['host', 'player'] });
  resetTable(game, {
    top: C('top', 'red', '3'),
    hands: {
      s1: [C('fl', 'red', 'flush'), C('r1', 'red', '1'), C('r2', 'red', '2'), C('b', 'blue', '9')],
      s2: [C('x', 'green', '2')],
    },
    turn: 's1',
  });
  act(game, 's1', 'play', { cardId: 'fl' });
  assert.deepEqual(player(game, 's1').hand.map((card) => card.id), ['b']);
  assert.equal(game.discard.at(-1).id, 'fl');
  assert.equal(game.discard.length, 4);
  assert.equal(player(game, 's1').mustCall, true);
});

test('0 号牌全员换手，7 号牌交换；非法交换对象不产生副作用', () => {
  const zero = started({ roles: ['host', 'player', 'player'] });
  resetTable(zero.game, {
    top: C('top', 'red', '3'),
    hands: {
      s1: [C('z', 'red', '0'), C('ka', 'blue', '9')],
      s2: [C('b1', 'green', '2')],
      s3: [C('c1', 'blue', '7'), C('c2', 'yellow', '4')],
    },
    turn: 's1',
  });
  act(zero.game, 's1', 'play', { cardId: 'z' });
  assert.deepEqual(player(zero.game, 's2').hand.map((card) => card.id), ['ka']);
  assert.deepEqual(player(zero.game, 's3').hand.map((card) => card.id), ['b1']);
  assert.deepEqual(player(zero.game, 's1').hand.map((card) => card.id).sort(), ['c1', 'c2']);

  const seven = started({ roles: ['host', 'player'] });
  resetTable(seven.game, {
    top: C('top', 'red', '8'),
    hands: { s1: [C('s7', 'red', '7'), C('ka', 'blue', '9')], s2: [C('m1', 'green', '6')] },
    turn: 's1',
  });
  const bad = act(seven.game, 's1', 'play', { cardId: 's7', swapWith: 'nope' });
  assert.equal(errorsOf(bad).length, 1);
  assert.equal(player(seven.game, 's1').hand.length, 2);
  assert.equal(seven.game.discard.length, 1);
  act(seven.game, 's1', 'play', { cardId: 's7', swapWith: 's2' });
  assert.deepEqual(player(seven.game, 's1').hand.map((card) => card.id), ['m1']);
  assert.deepEqual(player(seven.game, 's2').hand.map((card) => card.id), ['ka']);
});

test('跳过所有人：其他人各跳一次，出牌者再来一回合', () => {
  const { game } = started({ roles: ['host', 'player', 'player'] });
  resetTable(game, {
    top: C('top', 'red', '3'),
    hands: { s1: [C('sa', 'wild', 'skipall'), C('r5', 'red', '5'), C('ka', 'blue', '9')], s2: [C('b', 'green', '2')], s3: [C('c', 'green', '4')] },
    turn: 's1',
  });
  act(game, 's1', 'play', { cardId: 'sa' });
  assert.equal(currentSeat(game), 's1');
  assert.equal(game.skipQueue.length, 0);
  act(game, 's1', 'play', { cardId: 'r5' });
  assert.equal(currentSeat(game), 's2');
});

test('报牌：5 秒窗口、主动报牌、被对手判罚、超时只罚一次', () => {
  const called = started({ roles: ['host', 'player'] });
  resetTable(called.game, {
    top: C('top', 'red', '3'),
    hands: { s1: [C('a', 'red', '5'), C('b', 'red', '6')], s2: [C('c', 'blue', '1')] },
    turn: 's1',
  });
  act(called.game, 's1', 'play', { cardId: 'a' });
  assert.equal(player(called.game, 's1').mustCall, true);
  act(called.game, 's1', 'lastcall');
  assert.equal(player(called.game, 's1').mustCall, false);
  assert.equal(player(called.game, 's1').calledLast, true);

  const reported = started({ roles: ['host', 'player'] });
  resetTable(reported.game, {
    top: C('top', 'red', '3'),
    hands: { s1: [C('a', 'red', '5'), C('b', 'red', '6')], s2: [C('c', 'blue', '1')] },
    turn: 's1',
  });
  act(reported.game, 's1', 'play', { cardId: 'a' });
  act(reported.game, 's2', 'report', { targetId: 's1' });
  assert.equal(player(reported.game, 's1').hand.length, 3);
  assert.equal(player(reported.game, 's1').mustCall, false);

  const expired = started({ roles: ['host', 'player'] });
  resetTable(expired.game, {
    top: C('top', 'red', '3'),
    hands: { s1: [C('a', 'red', '5'), C('b', 'red', '6')], s2: [C('c', 'blue', '1')] },
    turn: 's1',
  });
  expired.game.turnStartedAt = expired.now();
  act(expired.game, 's1', 'play', { cardId: 'a' });
  expired.advance(6000);
  expired.game.tick(expired.now());
  expired.game.tick(expired.now() + 60000);
  assert.equal(player(expired.game, 's1').hand.length, 3);
});

test('手牌上限：超限必须先弃到上限才能交回合，弃牌数量必须精确', () => {
  const { game } = started({ roles: ['host', 'player'], raw: { cap: 20 } });
  const bigHand = Array.from({ length: 22 }, (_, index) => C(`h${index}`, index % 2 ? 'red' : 'yellow', String(index % 10)));
  resetTable(game, { top: C('top', 'red', '3'), hands: { s1: bigHand, s2: [C('c', 'blue', '1')] }, turn: 's1' });
  game.advanceTurn(1);
  assert.deepEqual(game.pendingDiscard, { seatId: 's1', need: 2 });
  assert.equal(errorsOf(act(game, 's1', 'discard', { cardIds: ['h0'] })).length, 1);
  assert.equal(effectsOf(act(game, 's1', 'discard', { cardIds: ['h0', 'h1'] })).length, 0);
  assert.equal(player(game, 's1').hand.length, 20);
  assert.equal(currentSeat(game), 's2');
});

test('回合超时：人类挂机自动摸一张并轮转', () => {
  const { game } = started({ roles: ['host', 'player'] });
  resetTable(game, { top: C('top', 'red', '3'), hands: { s1: [C('a', 'blue', '1')], s2: [C('b', 'blue', '2')] }, turn: 's1' });
  game.tick(62000);
  assert.equal(player(game, 's1').hand.length, 2);
  assert.equal(currentSeat(game), 's2');
});

test('座位离开：剩一人时对局终止；玩家离开后回合索引不越界', () => {
  const setup = started({ roles: ['host', 'player', 'player'] });
  setup.game.onSeatLeave(setup.ctx.seat('s3'), 'playing');
  assert.equal(setup.game.players.length, 2);
  setup.game.onSeatLeave(setup.ctx.seat('s2'), 'playing');
  assert.equal(setup.game.state, 'ended');
  assert.equal(setup.game.winner, null);
});

test('存档恢复：手牌、牌堆、回合与规则都还原，版本不符拒绝', () => {
  const setup = started({ roles: ['host', 'player'], raw: { cap: 30 } });
  resetTable(setup.game, { top: C('top', 'red', '3'), hands: { s1: [C('a', 'red', '5'), C('ka', 'blue', '9')], s2: [C('b', 'blue', '2')] }, turn: 's1' });
  const snapshot = setup.game.snapshot();
  const restored = colorDuel.resume(snapshot, setup.ctx);
  assert.equal(restored.state, 'playing');
  assert.equal(restored.activeColor, setup.game.activeColor);
  assert.deepEqual(player(restored, 's1').hand, player(setup.game, 's1').hand);
  assert.equal(player(restored, 's2').hand.length, 1);
  assert.equal(colorDuel.acceptsSnapshot(snapshot), true);
  assert.equal(colorDuel.acceptsSnapshot({ version: 99 }), false);
});

test('结束后有人离座：再来一局按当前座位重建，不发幽灵座位', () => {
  const setup = started({ roles: ['host', 'player', 'player'] });
  const { game } = setup;
  resetTable(game, {
    top: C('top', 'red', '3'),
    hands: { s1: [C('a', 'red', '5')], s2: [C('b', 'blue', '2')], s3: [C('c', 'green', '4')] },
    turn: 's1',
  });
  act(game, 's1', 'play', { cardId: 'a' });
  assert.equal(game.state, 'ended');
  const seat3 = setup.ctx.seat('s3');
  setup.seats.splice(2, 1);
  game.onSeatLeave(seat3, 'playing');
  assert.equal(game.players.length, 2);
  game.handle({ name: 'rematch' }, 's1');
  assert.equal(game.players.length, 2);
  assert.deepEqual(game.players.map((player) => player.hand.length), [7, 7]);
  assert.equal(game.state, 'playing');
});

test('再来一局：只有房主能重开，重开后重新发牌', () => {
  const { game, ctx } = started({ roles: ['host', 'player'] });
  resetTable(game, { top: C('top', 'red', '3'), hands: { s1: [C('a', 'red', '5')], s2: [C('b', 'blue', '2')] }, turn: 's1' });
  act(game, 's1', 'play', { cardId: 'a' });
  assert.equal(game.state, 'ended');
  assert.equal(game.winner, 's1');
  const denied = game.handle({ name: 'rematch' }, 's2');
  assert.equal(Array.isArray(denied), false);
  const ok = game.handle({ name: 'rematch' }, 's1');
  assert.ok(Array.isArray(ok));
  assert.equal(game.state, 'playing');
  assert.equal(player(game, 's1').hand.length, 7);
  assert.equal(ctx.seat('s1').role, 'host');
});
