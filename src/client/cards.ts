import type { Card, Color } from './types.js';

export const COLOR_META: Record<Color, { name: string; glyph: string }> = {
  red: { name: '红', glyph: '▲' },
  yellow: { name: '黄', glyph: '●' },
  green: { name: '绿', glyph: '■' },
  blue: { name: '蓝', glyph: '★' },
  wild: { name: '黑', glyph: '◆' },
};

export const VALUE_TEXT: Record<string, string> = {
  skip: '跳',
  reverse: '反',
  draw2: '+2',
  wild: '变',
  wild4: '+4',
  wild6: '+6',
  wild10: '+10',
  skipall: '跳全',
  flush: '甩',
};

const VALUE_TAG: Record<string, string> = {
  '0': '全员换手',
  '7': '可换手',
  flush: '弃同色',
  skipall: '全体跳过',
  wild4: '先反转',
};

/** 手牌挤在一起时用的短标签，保证不被下一张牌压掉。 */
const VALUE_TAG_SHORT: Record<string, string> = {
  '0': '全换',
  '7': '换手',
  flush: '弃色',
  skipall: '全跳',
  wild4: '反转',
};

export const isBlack = (card: Card): boolean => card.color === 'wild';

export function cardLabel(card: Card): string {
  const value = VALUE_TEXT[card.value] ?? card.value;
  return `${COLOR_META[card.color]?.name ?? ''} ${value}`.trim();
}

export function createCard(card: Card): HTMLElement {
  const element = document.createElement('div');
  element.className = `cd-card cd-${card.color}`;
  element.dataset.id = card.id;
  element.setAttribute('role', 'button');
  element.tabIndex = 0;
  element.setAttribute('aria-label', cardLabel(card));

  const face = document.createElement('div');
  face.className = 'cd-face';
  const value = document.createElement('span');
  value.className = 'cd-value';
  value.textContent = VALUE_TEXT[card.value] ?? card.value;
  face.append(value);

  const glyph = document.createElement('span');
  glyph.className = 'cd-glyph';
  glyph.textContent = COLOR_META[card.color]?.glyph ?? '';

  const top = document.createElement('span');
  top.className = 'cd-corner cd-tl';
  top.textContent = VALUE_TEXT[card.value] ?? card.value;

  element.append(face, glyph, top);

  const tag = VALUE_TAG[card.value];
  if (tag) {
    const badge = document.createElement('span');
    badge.className = 'cd-tag';
    const full = document.createElement('span');
    full.className = 'cd-tag-full';
    full.textContent = tag;
    const short = document.createElement('span');
    short.className = 'cd-tag-short';
    short.textContent = VALUE_TAG_SHORT[card.value] ?? tag;
    badge.append(full, short);
    element.append(badge);
  }
  return element;
}
