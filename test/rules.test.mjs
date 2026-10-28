import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGameReference, parseRuleConfig } from '@lizardon386/game-sdk';
import colorDuel, { GAME_VERSION, RULE_CONFIG } from '../dist-ts/server/index.js';
import { normalizeConfig } from '../dist-ts/server/config.js';
import {
  buildDeck,
  canPeng,
  canPlay,
  canStack,
  drawFromDeck,
  normalizeRules,
  DECK_VERSION,
} from '../dist-ts/server/rules.js';

const C = (id, color, value) => ({ id, color, value });

test('牌堆：全开 152 张，开关组合 136/120', () => {
  const all = buildDeck(normalizeRules({}));
  assert.equal(all.length, 152);
  const count = (value) => all.filter((card) => card.value === value).length;
  for (let n = 0; n <= 9; n++) assert.equal(count(String(n)), 8);
  for (const value of ['skip', 'reverse', 'draw2', 'wild', 'wild4', 'wild6', 'wild10', 'skipall', 'flush']) {
    assert.equal(count(value), 8, value);
  }
  const noExtend = buildDeck(normalizeRules({ extend: false }));
  assert.equal(noExtend.length, 136);
  assert.equal(noExtend.some((card) => card.value === 'skipall' || card.value === 'flush'), false);
  const noMerciless = buildDeck(normalizeRules({ merciless: false }));
  assert.equal(noMerciless.length, 136);
  assert.equal(noMerciless.some((card) => card.value === 'wild6' || card.value === 'wild10'), false);
  assert.equal(buildDeck(normalizeRules({ extend: false, merciless: false })).length, 120);
});

test('牌堆 id 在单副内唯一', () => {
  const deck = buildDeck(normalizeRules({}));
  assert.equal(new Set(deck.map((card) => card.id)).size, deck.length);
});

test('规则归一化：关接龙连带关质疑，关绝情无上限，非法上限回落', () => {
  assert.deepEqual(normalizeRules({ stack: false, contest: true }), {
    ...normalizeRules({}),
    stack: false,
    contest: false,
  });
  assert.equal(normalizeRules({ merciless: false, cap: 40 }).cap, 0);
  assert.equal(normalizeRules({ cap: 999 }).cap, 20);
  assert.equal(normalizeRules({ cap: '30' }).cap, 30);
});

test('canPlay：同色、同数字、黑牌万能；甩色牌不能按数字匹配', () => {
  const top = C('t', 'red', '5');
  assert.equal(canPlay(C('a', 'red', '9'), top, 'red'), true);
  assert.equal(canPlay(C('b', 'blue', '5'), top, 'red'), true);
  assert.equal(canPlay(C('c', 'blue', '9'), top, 'red'), false);
  assert.equal(canPlay(C('d', 'wild', 'wild'), top, 'red'), true);
  const flushTop = C('f', 'red', 'flush');
  assert.equal(canPlay(C('g', 'blue', 'flush'), flushTop, 'red'), false);
});

test('canStack：罚值必须不小于待罚且同色或黑色', () => {
  assert.equal(canStack(C('a', 'red', 'draw2'), 2, 'red'), true);
  assert.equal(canStack(C('b', 'blue', 'draw2'), 2, 'red'), false);
  assert.equal(canStack(C('c', 'wild', 'wild6'), 4, 'blue'), true);
  assert.equal(canStack(C('d', 'red', 'draw2'), 4, 'red'), false);
  assert.equal(canStack(C('e', 'red', '5'), 2, 'red'), false);
});

test('canPeng：颜色与数字都相同，且顶牌必须是数字牌', () => {
  const top = C('t', 'red', '5');
  assert.equal(canPeng(C('a', 'red', '5'), top), true);
  assert.equal(canPeng(C('b', 'blue', '5'), top), false);
  assert.equal(canPeng(C('c', 'red', '6'), top), false);
  assert.equal(canPeng(C('d', 'red', '5'), C('x', 'wild', 'wild')), false);
});

test('抽牌：牌堆空了会回收废牌并保留顶牌', () => {
  const state = { deck: [], discard: [C('a', 'red', '1'), C('b', 'blue', '2'), C('top', 'red', '5')] };
  const drawn = drawFromDeck(state, 2, () => 0.5);
  assert.equal(drawn.length, 2);
  assert.equal(state.discard.length, 1);
  assert.equal(state.discard[0].id, 'top');
  assert.equal(state.deck.length, 0);
});

test('抽牌：牌堆和废牌都空时补一张全局唯一的 refill 牌', () => {
  const state = { deck: [], discard: [C('top', 'red', '5')] };
  const first = drawFromDeck(state, 1, () => 0.5)[0];
  const second = drawFromDeck(state, 1, () => 0.5)[0];
  assert.match(first.id, /^refill-/);
  assert.match(second.id, /^refill-/);
  assert.notEqual(first.id, second.id);
});

test('规则版本常量存在', () => {
  assert.equal(typeof DECK_VERSION, 'number');
});

test('rule-config 声明能通过 SDK 校验，默认值能落成合法配置', () => {
  const result = parseRuleConfig(RULE_CONFIG);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  assert.equal(colorDuel.ruleConfig, RULE_CONFIG);
  const raw = Object.fromEntries(RULE_CONFIG.fields.map((field) => [field.key, field.default]));
  const config = normalizeConfig(raw);
  assert.equal(config.stack, true);
  assert.equal(config.cap, 20);
  assert.equal(config.difficulty, 'normal');
  assert.equal(normalizeConfig({ cap: '40' }).cap, 40);
  assert.equal(normalizeConfig({ difficulty: 'cold' }).difficulty, 'cold');
});

test('模块版本与 package.json 一致', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(GAME_VERSION, pkg.version);
  assert.equal(pkg.bp.id, 'color-duel');
});

test('reference 文档能通过 SDK 校验，入口文件存在', () => {
  assert.deepEqual(colorDuel.reference, { entry: 'reference.json' });
  const raw = readFileSync(new URL('../src/reference.json', import.meta.url), 'utf8');
  const result = parseGameReference(raw);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  assert.ok(result.doc.groups.length >= 8);
  assert.ok(result.doc.groups.some((group) => group.id === 'stack'));
});
