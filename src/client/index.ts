import type { GameActions } from '@lizardon386/game-sdk/client';
import { COLOR_META, createCard, isBlack } from './cards.js';
import { Dialogs } from './dialogs.js';
import { sfx, soundEnabled, toggleSound } from './sfx.js';
import styles from './styles.css';
import type { Card, ClientView, PlayerView, RevealPayload } from './types.js';

const PENALTY: Record<string, number> = { draw2: 2, wild4: 4, wild6: 6, wild10: 10 };
const CHANGERS = ['wild', 'wild4', 'wild6', 'wild10'];

interface Refs {
  root: HTMLElement;
  turnChip: HTMLElement;
  colorChip: HTMLElement;
  dirChip: HTMLElement;
  penaltyChip: HTMLElement;
  logBtn: HTMLButtonElement;
  soundBtn: HTMLButtonElement;
  seats: HTMLElement;
  draw: HTMLButtonElement;
  drawCount: HTMLElement;
  discard: HTMLElement;
  handWrap: HTMLElement;
  hand: HTMLElement;
  actDraw: HTMLButtonElement;
  actPeng: HTMLButtonElement;
  actCall: HTMLButtonElement;
  actEnd: HTMLButtonElement;
  actResult: HTMLButtonElement;
  actRematch: HTMLButtonElement;
  log: HTMLElement;
  logList: HTMLElement;
  toasts: HTMLElement;
}

let refs: Refs | null = null;
let dialogs: Dialogs | null = null;
let actions: GameActions | null = null;
let view: ClientView | null = null;
let timer: number | null = null;

let callDeadline = 0;
let lastTopId = '';
let lastTurn: string | null = null;
let lastPhase: string | null = null;
let lastMyCount = 0;
let lastPending = 0;
let lastWinner: string | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function injectStyles(): void {
  if (document.getElementById('cd-styles')) return;
  const style = document.createElement('style');
  style.id = 'cd-styles';
  style.textContent = styles;
  document.head.append(style);
}

function send(name: string, payload?: unknown): void {
  actions?.send(name, payload);
}

function meOf(current: ClientView): PlayerView | undefined {
  const seatId = actions?.seatId() ?? null;
  if (!seatId) return undefined;
  return current.players.find((player) => player.seatId === seatId);
}

function canPlayLocal(card: Card, current: ClientView): boolean {
  const top = current.topCard;
  if (!top) return false;
  if (current.pendingDraw > 0) {
    if (!current.rules.stack) return false;
    const penalty = PENALTY[card.value];
    if (!penalty || penalty < current.pendingDraw) return false;
    return card.color === 'wild' || card.color === current.activeColor;
  }
  if (card.color === 'wild') return true;
  if (card.color === current.activeColor) return true;
  return card.value === top.value && top.value !== 'flush';
}

function build(host: HTMLElement): void {
  injectStyles();
  const root = el('div', 'cd-root');

  const status = el('div', 'cd-status');
  const turnChip = el('span', 'cd-chip turn');
  const colorChip = el('span', 'cd-chip');
  const dirChip = el('span', 'cd-chip');
  const penaltyChip = el('span', 'cd-chip penalty');
  const spacer = el('span', 'spacer');
  const logBtn = el('button', 'cd-icon-btn');
  logBtn.type = 'button';
  logBtn.title = '操作记录';
  logBtn.setAttribute('aria-label', '操作记录');
  logBtn.textContent = '记录';
  const soundBtn = el('button', 'cd-icon-btn');
  soundBtn.type = 'button';
  soundBtn.title = '音效开关';
  soundBtn.setAttribute('aria-label', '音效开关');
  soundBtn.textContent = soundEnabled() ? '🔊' : '🔇';
  status.append(turnChip, colorChip, dirChip, penaltyChip, spacer, logBtn, soundBtn);

  const main = el('div', 'cd-main');
  const seats = el('div', 'cd-seats');
  const center = el('div', 'cd-center');
  const draw = el('button', 'cd-draw');
  draw.type = 'button';
  draw.setAttribute('aria-label', '摸一张牌');
  for (let i = 0; i < 3; i++) draw.append(el('span', 'back'));
  const drawCount = el('span', 'cd-draw-count');
  draw.append(drawCount);
  const discard = el('div', 'cd-discard');
  center.append(draw, discard);
  main.append(seats, center);

  const handWrap = el('div', 'cd-hand-wrap');
  const hand = el('div', 'cd-hand');
  handWrap.append(hand);

  const actionBar = el('div', 'cd-actions');
  const actDraw = el('button', 'cd-btn primary');
  const actPeng = el('button', 'cd-btn');
  const actCall = el('button', 'cd-btn danger');
  const actEnd = el('button', 'cd-btn ghost');
  const actResult = el('button', 'cd-btn');
  const actRematch = el('button', 'cd-btn primary');
  for (const button of [actDraw, actPeng, actCall, actEnd, actResult, actRematch]) button.type = 'button';
  actDraw.textContent = '摸牌';
  actPeng.textContent = '碰！';
  actCall.textContent = '只剩一张！';
  actEnd.textContent = '结束回合';
  actResult.textContent = '看结果';
  actRematch.textContent = '再来一局';
  actionBar.append(actDraw, actPeng, actCall, actEnd, actResult, actRematch);

  const log = el('div', 'cd-log');
  log.hidden = true;
  const logTitle = el('h4');
  logTitle.textContent = '操作记录';
  const logList = el('ol');
  log.append(logTitle, logList);

  const toasts = el('div', 'cd-toasts');

  root.append(status, main, handWrap, actionBar, log, toasts);
  host.append(root);

  refs = {
    root,
    turnChip,
    colorChip,
    dirChip,
    penaltyChip,
    logBtn,
    soundBtn,
    seats,
    draw,
    drawCount,
    discard,
    handWrap,
    hand,
    actDraw,
    actPeng,
    actCall,
    actEnd,
    actResult,
    actRematch,
    log,
    logList,
    toasts,
  };

  dialogs = new Dialogs(root, send);

  logBtn.onclick = () => {
    if (!refs) return;
    refs.log.hidden = !refs.log.hidden;
  };
  soundBtn.onclick = () => {
    if (!refs) return;
    refs.soundBtn.textContent = toggleSound() ? '🔊' : '🔇';
  };
  draw.onclick = () => {
    if (!view || draw.disabled) return;
    send('draw');
  };
  actDraw.onclick = () => {
    if (!view || actDraw.disabled) return;
    send('draw');
  };
  actPeng.onclick = () => {
    if (!view?.peng.length) return;
    send('peng', { cardIds: view.peng.slice(0, 2) });
  };
  actCall.onclick = () => send('lastcall');
  actEnd.onclick = () => send('endturn');
  actResult.onclick = () => {
    if (view) dialogs?.showResult(view, meOf(view));
  };
  actRematch.onclick = () => send('rematch');

  startTicker();
  resize(host);
}

function resize(host: HTMLElement): void {
  if (!refs) return;
  const width = host.clientWidth || 640;
  const height = host.clientHeight || 360;
  const size = Math.max(40, Math.min(108, Math.floor(Math.min(width / 9.2, height / 5.2))));
  refs.root.style.setProperty('--cd-cw', `${size}px`);
}

function startTicker(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = window.setInterval(() => {
    if (!view || !refs) return;
    const now = performance.now();
    const me = meOf(view);
    if (me?.mustCall && !me.calledLast) {
      const left = callDeadline ? Math.max(0, callDeadline - now) : (me.callDeadlineInMs ?? 0);
      refs.actCall.textContent = `只剩一张！${(left / 1000).toFixed(1)}s`;
      refs.actCall.classList.toggle('danger', left < 2000);
    }
    dialogs?.tick(now);
  }, 120);
}

function toast(text: string, warn = false): void {
  if (!refs) return;
  const node = el('div', `cd-toast${warn ? ' warn' : ''}`);
  node.textContent = text;
  refs.toasts.append(node);
  while (refs.toasts.children.length > 3) refs.toasts.firstElementChild?.remove();
  window.setTimeout(() => node.remove(), 2200);
}

function render(current: ClientView): void {
  if (!refs) return;
  const me = meOf(current);
  const spectator = !me;
  const myTurn = current.phase === 'playing' && current.currentSeatId === me?.seatId;
  const hasPlayable = Boolean(me?.hand?.some((card) => canPlayLocal(card, current)));
  const facingPenalty = Boolean(myTurn && current.pendingDraw > 0 && !current.canStackNow);

  detect(current, me);

  refs.turnChip.textContent = '';
  if (current.phase === 'ended') {
    const winner = current.players.find((player) => player.seatId === current.winner);
    refs.turnChip.textContent = winner ? `本局结束 · ${winner.name} 获胜` : '本局结束';
  } else if (myTurn) {
    refs.turnChip.textContent = '轮到你';
  } else {
    const currentPlayer = current.players.find((player) => player.seatId === current.currentSeatId);
    refs.turnChip.textContent = spectator ? '观战中' : `轮到 ${currentPlayer?.name ?? '…'}`;
  }

  refs.colorChip.textContent = `生效 ${COLOR_META[current.activeColor]?.name ?? ''}${COLOR_META[current.activeColor]?.glyph ?? ''}`;
  refs.colorChip.style.borderColor = colorValue(current.activeColor);

  refs.dirChip.textContent = current.direction === 1 ? '顺序 →' : '逆序 ←';
  refs.dirChip.hidden = current.phase !== 'playing';

  refs.penaltyChip.hidden = current.pendingDraw <= 0;
  refs.penaltyChip.textContent = `待罚 +${current.pendingDraw}`;

  callDeadline = me?.callDeadlineInMs ? performance.now() + me.callDeadlineInMs : 0;

  renderSeats(current, me);
  renderCenter(current, me, myTurn, hasPlayable, facingPenalty);
  renderHand(current, me, myTurn);
  renderActions(current, me, myTurn, hasPlayable, facingPenalty);
  renderLog(current);
  dialogs?.sync(current, me, spectator);
}

function detect(current: ClientView, me: PlayerView | undefined): void {
  const topId = current.topCard?.id ?? '';
  if (lastTopId && topId && topId !== lastTopId) {
    if (current.pendingDraw > lastPending || (current.topCard && isBlack(current.topCard))) sfx.chain();
    else sfx.play();
  }
  if (me && lastMyCount && me.cardCount > lastMyCount) sfx.draw();
  if (current.currentSeatId !== lastTurn && current.currentSeatId === me?.seatId) sfx.turn();
  if (current.phase === 'ended' && lastPhase !== 'ended') {
    if (current.winner === me?.seatId) sfx.win();
    else sfx.lose();
  }
  lastTopId = topId;
  lastTurn = current.currentSeatId;
  lastPhase = current.phase;
  lastMyCount = me?.cardCount ?? 0;
  lastPending = current.pendingDraw;
  lastWinner = current.winner;
}

function colorValue(color: string): string {
  return (
    { red: '#d64545', yellow: '#e0b02a', green: '#2f9e57', blue: '#2f6fd0', wild: '#cfd8dc' }[color] ??
    'transparent'
  );
}

const SEAT_COLOR_HEX: Record<string, string> = {
  red: '#ef4444',
  yellow: '#f59e0b',
  green: '#22c55e',
  blue: '#3b82f6',
};

function renderSeats(current: ClientView, me: PlayerView | undefined): void {
  if (!refs) return;
  refs.seats.replaceChildren();
  for (const player of current.players) {
    const seat = el('div', 'cd-seat');
    if (player.seatId === current.currentSeatId && current.phase === 'playing') seat.classList.add('active');
    if (player.seatId === me?.seatId) seat.classList.add('me');
    if (player.role !== 'ai' && !player.connected) seat.classList.add('offline');
    if (player.cardCount === 1) seat.classList.add('one');

    const color = player.options?.color;
    if (color) seat.style.setProperty('--cd-seat-color', SEAT_COLOR_HEX[color] ?? colorValue(color));

    const name = el('span', 'cd-seat-name');
    name.textContent = player.name;
    const meta = el('div', 'cd-seat-meta');
    const count = el('span', 'cd-count');
    count.textContent = String(player.cardCount);
    meta.append(count);

    const skip = (current.skipQueue ?? []).includes(player.seatId);
    if (player.mustCall && !player.calledLast && player.cardCount === 1) {
      meta.append(tag('未报牌', 'warn'));
    } else if (skip) {
      meta.append(tag('被跳过', 'skip'));
    } else if (player.role === 'ai') {
      meta.append(tag('电脑', 'bot'));
    } else if (!player.connected) {
      meta.append(tag('离线', 'off'));
    }
    seat.append(name, meta);
    refs.seats.append(seat);
  }
}

function tag(text: string, kind: string): HTMLElement {
  const node = el('span', `cd-seat-tag ${kind}`);
  node.textContent = text;
  return node;
}

function renderCenter(
  current: ClientView,
  me: PlayerView | undefined,
  myTurn: boolean,
  hasPlayable: boolean,
  facingPenalty: boolean,
): void {
  if (!refs) return;
  const canDraw =
    myTurn &&
    !current.challenge &&
    current.mustDiscardNow === 0 &&
    !facingPenalty &&
    (current.pendingDraw > 0 || (current.freePlayOf !== me?.seatId && !hasPlayable));
  refs.draw.disabled = !canDraw;
  refs.draw.classList.toggle('can-draw', canDraw);
  refs.draw.title = canDraw ? (current.pendingDraw > 0 ? `吃下 +${current.pendingDraw}` : '摸一张牌') : '现在不能摸牌';
  refs.drawCount.textContent = `${current.deckCount} 张`;

  const top = current.topCard;
  const topId = top?.id ?? '';
  if (refs.discard.dataset.top !== topId) {
    refs.discard.dataset.top = topId;
    refs.discard.replaceChildren();
    if (top) {
      const card = createCard(top);
      card.classList.add('pop');
      refs.discard.append(card);
      if (isBlack(top)) {
        const ring = el('div', 'cd-ring');
        ring.style.setProperty('--cd-ring', colorValue(current.activeColor));
        refs.discard.append(ring);
      }
    }
  }
}

function renderHand(current: ClientView, me: PlayerView | undefined, myTurn: boolean): void {
  if (!refs) return;
  if (!me || !me.hand) {
    refs.hand.replaceChildren();
    const empty = el('div', 'cd-hand-empty');
    empty.textContent = '观战中 · 看不到玩家手牌';
    refs.hand.append(empty);
    return;
  }
  const ids = new Set(me.hand.map((card) => card.id));
  for (const child of [...refs.hand.children]) {
    if (child instanceof HTMLElement && child.dataset.id && !ids.has(child.dataset.id)) child.remove();
  }
  const existing = new Map<string, HTMLElement>();
  for (const child of [...refs.hand.children]) {
    if (child instanceof HTMLElement && child.dataset.id) existing.set(child.dataset.id, child);
  }

  for (const card of me.hand) {
    let element = existing.get(card.id);
    if (!element) {
      element = createCard(card);
      element.classList.add('deal');
      element.onclick = () => tapCard(card);
      element.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          tapCard(card);
        }
      };
    }
    const playable =
      myTurn && !current.challenge && current.mustDiscardNow === 0 && canPlayLocal(card, current);
    element.classList.toggle('playable', playable);
    element.classList.toggle('dim', !playable);
    element.classList.toggle('pengable', current.peng.includes(card.id));
    const label = `${COLOR_META[card.color]?.name ?? ''} ${card.value}${playable ? '，可以出' : '，现在出不了'}`;
    element.setAttribute('aria-label', label);
    refs.hand.append(element);
  }
}

function tapCard(card: Card): void {
  if (!view) return;
  const me = meOf(view);
  if (!me?.hand) return;
  const myTurn = view.phase === 'playing' && view.currentSeatId === me.seatId;
  const playable = myTurn && !view.challenge && view.mustDiscardNow === 0 && canPlayLocal(card, view);
  if (!playable) {
    toast('现在不能出这张牌', true);
    sfx.bad();
    return;
  }
  if (card.value === '7' && view.rules.extend) {
    const opponents = view.players.filter((player) => player.seatId !== me.seatId);
    dialogs?.openSwap(
      opponents,
      (seatId) => send('play', { cardId: card.id, swapWith: seatId }),
      () => send('play', { cardId: card.id }),
    );
    return;
  }
  if (CHANGERS.includes(card.value)) {
    dialogs?.openColor((color) => send('play', { cardId: card.id, color }));
    return;
  }
  send('play', { cardId: card.id });
}

function renderActions(
  current: ClientView,
  me: PlayerView | undefined,
  myTurn: boolean,
  hasPlayable: boolean,
  facingPenalty: boolean,
): void {
  if (!refs) return;
  const spectator = !me;
  const canDraw =
    myTurn &&
    !current.challenge &&
    current.mustDiscardNow === 0 &&
    !facingPenalty &&
    (current.pendingDraw > 0 || (current.freePlayOf !== me?.seatId && !hasPlayable));

  refs.actDraw.hidden = spectator;
  refs.actDraw.disabled = !canDraw;
  refs.actDraw.textContent = current.pendingDraw > 0 ? `吃下 +${current.pendingDraw}` : '摸牌';
  refs.actDraw.title = canDraw
    ? ''
    : current.challenge
      ? '质疑结算中'
      : current.mustDiscardNow > 0
        ? '先弃牌'
        : facingPenalty
          ? '接不住罚牌，只能吃下'
          : !myTurn
            ? '还没轮到你'
            : current.freePlayOf === me?.seatId
              ? '改色后继续出牌或结束回合'
              : '手上还有能出的牌';

  refs.actPeng.hidden = spectator || current.peng.length === 0;
  refs.actPeng.textContent = current.peng.length > 1 ? '碰 ×2' : '碰！';

  refs.actCall.hidden = spectator || !me?.mustCall || me.calledLast;
  if (!refs.actCall.hidden) {
    const left = me?.callDeadlineInMs ?? 0;
    refs.actCall.textContent = `只剩一张！${(left / 1000).toFixed(1)}s`;
  }

  refs.actEnd.hidden = spectator || !(myTurn && current.freePlayOf === me?.seatId);

  refs.actResult.hidden = current.phase !== 'ended';
  refs.actRematch.hidden = current.phase !== 'ended' || me?.role !== 'host';

  if (spectator) {
    refs.actResult.hidden = current.phase !== 'ended';
    refs.actRematch.hidden = true;
  }
}

function renderLog(current: ClientView): void {
  if (!refs) return;
  refs.logList.replaceChildren();
  for (const line of current.log.slice(-12)) {
    const item = el('li');
    item.textContent = line;
    refs.logList.append(item);
  }
  refs.logList.scrollTop = refs.logList.scrollHeight;
}

function teardown(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  refs?.root.remove();
  refs = null;
  dialogs = null;
  view = null;
  lastTopId = '';
  lastTurn = null;
  lastPhase = null;
  lastMyCount = 0;
  lastPending = 0;
  lastWinner = null;
}

const client = {
  mount(host: HTMLElement, rawView: unknown, gameActions: GameActions): void {
    actions = gameActions;
    const current = rawView as ClientView | null;
    if (!current || typeof current !== 'object') return;
    if (!refs || refs.root.parentElement !== host) {
      teardown();
      build(host);
    }
    view = current;
    if (refs) resize(host);
    render(current);
  },
  unmount(): void {
    teardown();
    actions = null;
  },
  onEvent(event: { name: string; payload?: unknown }): void {
    if (event.name === 'error') {
      const text = (event.payload as { text?: string } | undefined)?.text;
      toast(text ?? '操作失败', true);
      sfx.bad();
      return;
    }
    if (event.name === 'reveal') {
      dialogs?.showReveal(event.payload as RevealPayload);
    }
  },
};

export default client;
