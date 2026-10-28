import test from 'node:test';
import assert from 'node:assert/strict';
import { allCardIds, makeGame } from './harness.mjs';

test('机器人自走：1 真人 + 3 电脑能打完一局，牌不重复', () => {
  const setup = makeGame({ roles: ['host', 'ai', 'ai', 'ai'], seed: 7 });
  setup.start();
  const game = setup.game;
  let ticks = 0;
  let tops = new Set();
  let pushedTicks = 0;
  let duplicates = 0;

  while (game.state === 'playing' && ticks < 40000) {
    const effects = game.tick(setup.now());
    if (effects.length) pushedTicks += 1;
    if (game.discard.length) tops.add(game.discard.at(-1).id);
    if (ticks % 10 === 0) {
      const ids = allCardIds(game);
      if (new Set(ids).size !== ids.length) duplicates += 1;
    }
    setup.advance(250);
    ticks += 1;
  }

  assert.equal(game.state, 'ended', `对局未收敛，ticks=${ticks}`);
  assert.ok(game.winner, '应当有获胜者');
  assert.equal(duplicates, 0, '牌 id 出现重复');
  assert.ok(tops.size > 5, `顶牌变化过少：${tops.size}`);
  assert.ok(pushedTicks > 0, '机器人动作必须产生 effect，否则平台不会 fanout');
  assert.ok(game.log.length <= 50);
});

test('规则全关也能打完，牌堆 120 张', () => {
  const setup = makeGame({
    roles: ['host', 'ai', 'ai'],
    seed: 11,
    raw: { stack: false, contest: false, extend: false, merciless: false, peng: false },
  });
  setup.start();
  const game = setup.game;
  assert.equal(game.deck.length + game.players.reduce((sum, item) => sum + item.hand.length, 0) + 1, 120);

  let ticks = 0;
  while (game.state === 'playing' && ticks < 40000) {
    game.tick(setup.now());
    setup.advance(250);
    ticks += 1;
  }
  assert.equal(game.state, 'ended', `对局未收敛，ticks=${ticks}`);
});

test('PVE 回合时限 15 秒，开 noTurnTimer 后不下发截止时间', () => {
  const setup = makeGame({ roles: ['host', 'ai'], seed: 3 });
  setup.start();
  const view = setup.game.serialize('s1');
  assert.equal(view.turnTimeoutMs, 15000);
  assert.ok(typeof view.deadlineInMs === 'number');

  const idle = makeGame({ roles: ['host', 'ai'], seed: 3, raw: { noTurnTimer: true } });
  idle.start();
  const idleView = idle.game.serialize('s1');
  assert.equal(idleView.noTurnTimer, true);
  assert.equal(idleView.deadlineInMs, null);
});

test('PVP 回合时限 60 秒，且 noTurnTimer 只对带电脑位的房间生效', () => {
  const pvp = makeGame({ roles: ['host', 'player'], seed: 5, raw: { noTurnTimer: true } });
  pvp.start();
  const view = pvp.game.serialize('s1');
  assert.equal(view.turnTimeoutMs, 60000);
  assert.equal(view.noTurnTimer, false);
  assert.ok(typeof view.deadlineInMs === 'number');
});
