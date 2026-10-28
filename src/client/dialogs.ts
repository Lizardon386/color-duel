import { createCard, COLOR_META } from './cards.js';
import type { Card, ClientView, Color, PlayerView, RevealPayload } from './types.js';

type Send = (name: string, payload?: unknown) => void;

export class Dialogs {
  private readonly host: HTMLElement;
  private readonly send: Send;
  private overlay: HTMLElement | null = null;
  private kind: string | null = null;
  private picked = new Set<string>();
  private discardNeed = 0;
  private challengeDeadline: number | null = null;
  private challengeTitle: HTMLElement | null = null;
  private dismissedResult: string | null = null;

  constructor(host: HTMLElement, send: Send) {
    this.host = host;
    this.send = send;
  }

  close(): void {
    if (this.kind === 'result') {
      const winner = this.host.dataset.resultKey ?? '';
      this.dismissedResult = winner;
    }
    this.overlay?.remove();
    this.overlay = null;
    this.kind = null;
    this.picked.clear();
    this.discardNeed = 0;
    this.challengeDeadline = null;
    this.challengeTitle = null;
  }

  isOpen(kind?: string): boolean {
    return kind ? this.kind === kind : this.kind !== null;
  }

  private open(kind: string): { overlay: HTMLElement; panel: HTMLElement } {
    this.close();
    this.kind = kind;
    const overlay = document.createElement('div');
    overlay.className = 'cd-overlay';
    const panel = document.createElement('div');
    panel.className = 'cd-panel';
    overlay.append(panel);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay && kind !== 'discard' && kind !== 'challenge') this.close();
    });
    this.host.append(overlay);
    this.overlay = overlay;
    return { overlay, panel };
  }

  openColor(onPick: (color: Color) => void): void {
    const { panel } = this.open('color');
    const title = document.createElement('h3');
    title.textContent = '选择颜色';
    const hint = document.createElement('p');
    hint.textContent = '黑色牌会改变生效颜色，由下一家接着出。';
    const grid = document.createElement('div');
    grid.className = 'cd-colors';
    for (const color of ['red', 'yellow', 'green', 'blue'] as const) {
      const button = document.createElement('button');
      button.className = color;
      button.textContent = COLOR_META[color].name;
      button.onclick = () => {
        this.close();
        onPick(color);
      };
      grid.append(button);
    }
    const cancel = document.createElement('button');
    cancel.className = 'cd-btn ghost';
    cancel.textContent = '取消';
    cancel.onclick = () => this.close();
    panel.append(title, hint, grid, cancel);
    (grid.querySelector('button') as HTMLElement | null)?.focus();
  }

  openSwap(
    opponents: PlayerView[],
    onPick: (seatId: string) => void,
    onSkip: () => void,
  ): void {
    const { panel } = this.open('swap');
    const title = document.createElement('h3');
    title.textContent = '7 · 指定换手';
    const hint = document.createElement('p');
    hint.textContent = '可以强制和一名玩家交换手牌，也可以不换直接出。';
    const list = document.createElement('div');
    list.className = 'cd-pick';
    for (const opponent of opponents) {
      const button = document.createElement('button');
      button.textContent = opponent.name;
      const small = document.createElement('small');
      small.textContent = `${opponent.cardCount} 张`;
      button.append(small);
      button.onclick = () => {
        this.close();
        onPick(opponent.seatId);
      };
      list.append(button);
    }
    const skip = document.createElement('button');
    skip.className = 'cd-btn';
    skip.textContent = '不交换，直接出';
    skip.onclick = () => {
      this.close();
      onSkip();
    };
    panel.append(title, hint, list, skip);
    (list.querySelector('button') ?? skip).focus?.();
  }

  sync(view: ClientView, me: PlayerView | undefined, isSpectator: boolean): void {
    if (isSpectator) {
      if (this.kind && this.kind !== 'reveal') this.close();
      return;
    }
    if (view.challenge && me && view.challenge.victimId === me.seatId) {
      if (this.kind !== 'challenge') this.buildChallenge(view);
      return;
    }
    if (this.kind === 'challenge') this.close();

    if (view.mustDiscardNow > 0 && me?.hand) {
      if (this.kind !== 'discard' || this.discardNeed !== view.mustDiscardNow) {
        this.buildDiscard(view, me);
      }
      return;
    }
    if (this.kind === 'discard') this.close();

    if (view.phase === 'ended') {
      const key = `${view.winner ?? ''}:${view.players.map((p) => p.cardCount).join(',')}`;
      if (this.kind !== 'result' && this.dismissedResult !== key) this.buildResult(view, me);
      return;
    }
    if (this.kind === 'result') this.close();
  }

  private buildChallenge(view: ClientView): void {
    const challenge = view.challenge!;
    const { panel } = this.open('challenge');
    const title = document.createElement('h3');
    title.textContent = '要质疑谁？';
    this.challengeTitle = title;
    const hint = document.createElement('p');
    hint.textContent = `你刚吃下 ${challenge.heldCount} 张罚牌，还没进手。质疑前看不到对方手牌；确认后才摊牌并给出结果。`;
    const rule = document.createElement('p');
    rule.textContent = '质疑成立：他罚抽 6 张；质疑失败：你再多罚 4 张。';
    const list = document.createElement('div');
    list.className = 'cd-pick';
    for (const target of challenge.targets) {
      const button = document.createElement('button');
      button.textContent = `质疑 ${target.name}`;
      button.onclick = () => {
        this.send('contest', { targetId: target.seatId });
        this.close();
      };
      list.append(button);
    }
    const accept = document.createElement('button');
    accept.className = 'cd-btn';
    accept.textContent = '放弃质疑，直接收牌';
    accept.onclick = () => {
      this.send('accept');
      this.close();
    };
    panel.append(title, hint, rule, list, accept);
    this.challengeDeadline = performance.now() + challenge.deadlineInMs;
    (list.querySelector('button') ?? accept).focus?.();
  }

  private buildDiscard(view: ClientView, me: PlayerView): void {
    const need = view.mustDiscardNow;
    this.discardNeed = need;
    this.picked = new Set();
    const { panel } = this.open('discard');
    const title = document.createElement('h3');
    title.textContent = '弃牌到手牌上限';
    const hint = document.createElement('p');
    hint.textContent = `手上 ${me.hand!.length} 张，超过上限 ${view.cap}，必须弃 ${need} 张才能交出台面。弃掉的牌会洗回牌堆。`;
    const pool = document.createElement('div');
    pool.className = 'cd-reveal';
    const confirm = document.createElement('button');
    confirm.className = 'cd-btn primary';
    const render = () => {
      pool.replaceChildren();
      for (const card of me.hand!) {
        const element = createCard(card);
        if (this.picked.has(card.id)) element.classList.add('selected');
        element.onclick = () => {
          if (this.picked.has(card.id)) this.picked.delete(card.id);
          else if (this.picked.size < need) this.picked.add(card.id);
          render();
        };
        element.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            element.click();
          }
        };
        pool.append(element);
      }
      confirm.disabled = this.picked.size !== need;
      confirm.textContent =
        this.picked.size === need ? `确认弃掉 ${need} 张` : `再选 ${need - this.picked.size} 张`;
    };
    confirm.onclick = () => {
      if (this.picked.size !== need) return;
      this.send('discard', { cardIds: [...this.picked] });
      this.close();
    };
    render();
    panel.append(title, hint, pool, confirm);
  }

  private buildResult(view: ClientView, me: PlayerView | undefined): void {
    const { panel } = this.open('result');
    const key = `${view.winner ?? ''}:${view.players.map((p) => p.cardCount).join(',')}`;
    this.host.dataset.resultKey = key;
    const winner = view.players.find((player) => player.seatId === view.winner);
    const title = document.createElement('h3');
    title.textContent = view.winner && view.winner === me?.seatId ? '你赢了' : '本局结束';
    const hint = document.createElement('p');
    hint.textContent = winner ? `${winner.name} 先出完手牌。` : '在线人数不足，对局提前结束。';
    const table = document.createElement('table');
    table.className = 'cd-table';
    table.innerHTML = '<tr><th>玩家</th><th>剩余手牌</th></tr>';
    for (const player of view.players) {
      const row = document.createElement('tr');
      if (player.seatId === me?.seatId) row.className = 'me';
      const name = document.createElement('td');
      name.textContent = `${player.name}${player.role === 'ai' ? '（电脑）' : ''}`;
      const count = document.createElement('td');
      count.textContent = String(player.cardCount);
      row.append(name, count);
      table.append(row);
    }
    const row = document.createElement('div');
    row.className = 'row';
    if (me?.role === 'host') {
      const again = document.createElement('button');
      again.className = 'cd-btn primary';
      again.textContent = '再来一局';
      again.onclick = () => {
        this.send('rematch');
        this.close();
      };
      row.append(again);
    }
    const close = document.createElement('button');
    close.className = 'cd-btn';
    close.textContent = '看看牌桌';
    close.onclick = () => this.close();
    row.append(close);
    panel.append(title, hint, table, row);
  }

  showResult(view: ClientView, me: PlayerView | undefined): void {
    this.buildResult(view, me);
  }

  showReveal(payload: RevealPayload): void {
    const { panel } = this.open('reveal');
    const title = document.createElement('h3');
    title.textContent = payload.success ? '质疑成功' : '质疑失败';
    const hint = document.createElement('p');
    hint.textContent = payload.success
      ? `${payload.targetName} 当时还有能出的牌，罚抽 6 张。`
      : `${payload.targetName} 当时确实没有能出的牌，你多罚 4 张。`;
    const hand = document.createElement('div');
    hand.className = 'cd-reveal';
    const winnable = payload.hand.filter(
      (card) => card.color === 'wild' || card.color === payload.activeColor,
    );
    for (const card of payload.hand) {
      const element = createCard(card);
      if (winnable.some((item) => item.id === card.id)) element.classList.add('cheat');
      hand.append(element);
    }
    if (!payload.hand.length) {
      const empty = document.createElement('p');
      empty.textContent = '空手';
      hand.append(empty);
    }
    const ok = document.createElement('button');
    ok.className = 'cd-btn primary';
    ok.textContent = '知道了';
    ok.onclick = () => this.close();
    panel.append(title, hint, hand, ok);
    ok.focus();
  }

  tick(now: number): void {
    if (this.kind !== 'challenge' || !this.challengeDeadline || !this.challengeTitle) return;
    const left = Math.max(0, Math.ceil((this.challengeDeadline - now) / 1000));
    this.challengeTitle.textContent = `要质疑谁？· 剩 ${left}s`;
  }
}
