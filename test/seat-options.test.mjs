import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSeatOptions } from '@lizardon386/game-sdk';
import colorDuel from '../dist-ts/server/index.js';
import {
  SEAT_OPTIONS,
  defaultSeatColor,
  normalizeSeatOptions,
} from '../dist-ts/server/seat-options.js';
import { C, makeGame, resetTable } from './harness.mjs';

test('seatOptions 声明通过 SDK 校验，字段角色正确', () => {
  const result = parseSeatOptions(SEAT_OPTIONS);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  assert.equal(colorDuel.seatOptions, SEAT_OPTIONS);
  assert.equal(typeof colorDuel.normalizeSeatOptions, 'function');

  const difficulty = SEAT_OPTIONS.fields.find((field) => field.key === 'difficulty');
  assert.deepEqual(difficulty.roles, ['ai']);
  assert.equal(difficulty.default, 'normal');
  const color = SEAT_OPTIONS.fields.find((field) => field.key === 'color');
  assert.deepEqual(color.roles, ['host', 'player', 'ai']);
  assert.ok(color.options.every((option) => typeof option.color === 'string' && option.color.startsWith('#')));
});

test('normalizeSeatOptions：按槽位循环默认色，AI 默认 normal，非法值回落', () => {
  assert.deepEqual(normalizeSeatOptions('host', 1, undefined), { color: 'red' });
  assert.deepEqual(normalizeSeatOptions('player', 2, undefined), { color: 'yellow' });
  assert.deepEqual(normalizeSeatOptions('ai', 3, undefined), { difficulty: 'normal', color: 'green' });
  assert.deepEqual(normalizeSeatOptions('ai', 4, { difficulty: 'cold', color: 'blue' }), { difficulty: 'cold', color: 'blue' });
  assert.deepEqual(normalizeSeatOptions('host', 5, { color: 'blue' }), { color: 'blue' });
  assert.deepEqual(normalizeSeatOptions('ai', 6, { difficulty: 'bogus', color: 'bogus' }), { difficulty: 'normal', color: 'yellow' });
  assert.deepEqual(normalizeSeatOptions('spectator', 901, { difficulty: 'cold', color: 'blue' }), {});
  assert.equal(defaultSeatColor(1), 'red');
  assert.equal(defaultSeatColor(4), 'blue');
  assert.equal(defaultSeatColor(5), 'red');
});

test('serialize 带出每座颜色/难度，resume 后仍保留', () => {
  const setup = makeGame({ roles: ['host', 'player', 'ai'], seed: 3 });
  const seats = Object.fromEntries(setup.seats.map((seat) => [seat.seatId, seat]));
  seats.s1.options = { color: 'red' };
  seats.s2.options = { color: 'yellow' };
  seats.s3.options = { color: 'blue', difficulty: 'cold' };
  setup.start();

  const view = setup.game.serialize('s1');
  const options = Object.fromEntries(view.players.map((player) => [player.seatId, player.options]));
  assert.deepEqual(options.s1, { color: 'red' });
  assert.deepEqual(options.s2, { color: 'yellow' });
  assert.deepEqual(options.s3, { color: 'blue', difficulty: 'cold' });
  assert.equal(view.rules.difficulty, undefined);

  const snap = setup.game.snapshot();
  const resumed = colorDuel.resume(snap, setup.ctx);
  const resumedView = resumed.serialize('s1');
  const resumedOptions = Object.fromEntries(resumedView.players.map((player) => [player.seatId, player.options]));
  assert.deepEqual(resumedOptions.s3, { color: 'blue', difficulty: 'cold' });
});

function calledLastAfterTick(difficulty) {
  const setup = makeGame({ roles: ['host', 'ai'], seed: 21 });
  const aiSeat = setup.seats.find((seat) => seat.role === 'ai');
  aiSeat.options = { difficulty, color: 'blue' };
  setup.start();
  resetTable(setup.game, {
    top: C('top-red-5', 'red', '5'),
    hands: { s1: [C('h1', 'red', '7')], s2: [C('a1', 'blue', '3')] },
    turn: 's2',
  });
  const ai = setup.game.players.find((player) => player.seatId === 's2');
  ai.mustCall = true;
  ai.callDeadline = setup.now() + 5000;
  setup.ctx.random = () => 0.9;
  setup.advance(1000);
  setup.game.tick(setup.now());
  setup.advance(1000);
  setup.game.tick(setup.now());
  return ai.calledLast;
}

test('每座 AI 难度：同一受控局面 easy 不报牌、cold 报牌', () => {
  assert.equal(calledLastAfterTick('easy'), false);
  assert.equal(calledLastAfterTick('cold'), true);
});
