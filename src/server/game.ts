import {
  reject as rejectOutcome,
  type Effect,
  type GameAction,
  type GameContext,
  type GameInstance,
  type GameSeatInfo,
  type Outcome,
  type RoomPhase,
  type ViewerId,
} from '@lizardon386/game-sdk';
import { TIMING, type ColorDuelConfig } from './config.js';
import {
  buildDeck,
  canPeng,
  canPlay,
  canStack,
  changesColor,
  drawFromDeck,
  isBlack,
  isNumber,
  type Card,
  type Color,
} from './rules.js';
import { decideBotAction, type BotAction, type BotState, type Difficulty } from './bots.js';
import { normalizeSeatOptions, seatDifficulty } from './seat-options.js';

const HAND_SIZE = 7;
const SNAPSHOT_VERSION = 1;

interface PlayerState {
  seatId: string;
  hand: Card[];
  calledLast: boolean;
  mustCall: boolean;
  callDeadline: number | null;
  bot: boolean;
}

interface Challenge {
  victimId: string;
  targets: string[];
  held: Card[];
  deadline: number;
}

export interface ColorDuelSnapshot {
  version: number;
  config: ColorDuelConfig;
  players: Array<Omit<PlayerState, 'bot'>>;
  bots: string[];
  state: 'playing' | 'ended';
  deck: Card[];
  discard: Card[];
  activeColor: Color;
  turn: number;
  direction: number;
  pendingDraw: number;
  chainBlack: string[];
  pendingExtra: { seatId: string; reason: 'wild' | 'draw' } | null;
  pendingDiscard: { seatId: string; need: number } | null;
  challenge: Challenge | null;
  skipQueue: string[];
  winner: string | null;
  log: string[];
  turnStartedAt: number;
}

export class ColorDuel implements GameInstance {
  private readonly ctx: GameContext;
  private readonly config: ColorDuelConfig;

  private players: PlayerState[] = [];
  private state: 'playing' | 'ended' = 'playing';
  deck: Card[] = [];
  discard: Card[] = [];
  private activeColor: Color = 'red';
  private turn = 0;
  private direction = 1;
  private pendingDraw = 0;
  private chainBlack: string[] = [];
  private pendingExtra: { seatId: string; reason: 'wild' | 'draw' } | null = null;
  private pendingDiscard: { seatId: string; need: number } | null = null;
  private challenge: Challenge | null = null;
  private skipQueue: string[] = [];
  private winner: string | null = null;
  private log: string[] = [];
  private turnStartedAt = 0;
  private botDueAt = new Map<string, number>();

  constructor(config: ColorDuelConfig, ctx: GameContext, saved?: ColorDuelSnapshot) {
    this.ctx = ctx;
    this.config = config;
    if (saved && saved.version === SNAPSHOT_VERSION) {
      this.restore(saved);
    } else {
      this.turnStartedAt = ctx.now();
    }
  }

  private restore(saved: ColorDuelSnapshot): void {
    this.players = saved.players.map((player) => ({ ...player, bot: saved.bots.includes(player.seatId) }));
    this.state = saved.state;
    this.deck = saved.deck;
    this.discard = saved.discard;
    this.activeColor = saved.activeColor;
    this.turn = saved.turn;
    this.direction = saved.direction;
    this.pendingDraw = saved.pendingDraw;
    this.chainBlack = saved.chainBlack;
    this.pendingExtra = saved.pendingExtra;
    this.pendingDiscard = saved.pendingDiscard;
    this.challenge = saved.challenge;
    this.skipQueue = saved.skipQueue;
    this.winner = saved.winner;
    this.log = saved.log;
    // 重启后重新开窗，避免一恢复就判超时。
    this.turnStartedAt = this.ctx.now();
    if (this.challenge) this.challenge.deadline = this.ctx.now() + TIMING.challengeMs;
    for (const player of this.players) player.callDeadline = null;
    this.armBots(this.ctx.now());
  }

  snapshot(): ColorDuelSnapshot {
    const bots = this.players.filter((player) => player.bot).map((player) => player.seatId);
    return {
      version: SNAPSHOT_VERSION,
      config: this.config,
      players: this.players.map(({ seatId, hand, calledLast, mustCall, callDeadline }) => ({
        seatId,
        hand,
        calledLast,
        mustCall,
        callDeadline,
      })),
      bots,
      state: this.state,
      deck: this.deck,
      discard: this.discard,
      activeColor: this.activeColor,
      turn: this.turn,
      direction: this.direction,
      pendingDraw: this.pendingDraw,
      chainBlack: this.chainBlack,
      pendingExtra: this.pendingExtra,
      pendingDiscard: this.pendingDiscard,
      challenge: this.challenge,
      skipQueue: this.skipQueue,
      winner: this.winner,
      log: this.log,
      turnStartedAt: this.turnStartedAt,
    };
  }

  acceptsSnapshot(snapshot: unknown): boolean {
    return (snapshot as { version?: unknown } | null)?.version === SNAPSHOT_VERSION;
  }

  // ---------- 视图 ----------

  serialize(viewer: ViewerId): unknown {
    const now = this.ctx.now();
    const me = viewer === null ? undefined : this.players.find((player) => player.seatId === viewer);
    const current = this.currentPlayer();
    const challenge = this.challenge;
    const turnTimerOff = this.turnTimerOff();
    return {
      phase: this.state,
      rules: this.config,
      cap: this.config.cap,
      activeColor: this.activeColor,
      direction: this.direction,
      pendingDraw: this.pendingDraw,
      winner: this.winner,
      currentSeatId: this.state === 'playing' ? current?.seatId ?? null : null,
      turnTimeoutMs: this.turnTimeoutMs(),
      lastCallMs: TIMING.lastCallMs,
      challengeMs: TIMING.challengeMs,
      freePlayOf: this.pendingExtra?.seatId ?? null,
      skipQueue: this.skipQueue,
      pendingDiscard: this.pendingDiscard,
      mustDiscardNow: this.pendingDiscard && this.pendingDiscard.seatId === viewer ? this.pendingDiscard.need : 0,
      topCard: this.discard[this.discard.length - 1] ?? null,
      deckCount: this.deck.length,
      log: this.log.slice(-15),
      peng: me ? this.pengOptions(me.seatId) : [],
      challenge: challenge
        ? {
            victimId: challenge.victimId,
            heldCount: challenge.held.length,
            deadlineInMs: Math.max(0, challenge.deadline - now),
            targets: challenge.targets.map((seatId) => ({ seatId, name: this.nameOf(seatId) })),
          }
        : null,
      canStackNow: this.canStackNow(viewer),
      mustFacePenalty: this.mustFacePenalty(viewer),
      noTurnTimer: turnTimerOff,
      deadlineInMs:
        this.state === 'playing' && !turnTimerOff ? Math.max(0, this.turnStartedAt + this.turnTimeoutMs() - now) : null,
      players: this.players.map((player) => ({
        seatId: player.seatId,
        name: this.nameOf(player.seatId),
        role: this.ctx.seat(player.seatId)?.role ?? 'player',
        cardCount: player.hand.length,
        connected: this.ctx.seat(player.seatId)?.connected ?? false,
        options: this.seatOptionsFor(player.seatId),
        calledLast: player.calledLast,
        mustCall: player.mustCall,
        callDeadlineInMs: player.mustCall && player.callDeadline ? Math.max(0, player.callDeadline - now) : null,
        hand: player.seatId === viewer ? player.hand : undefined,
      })),
      viewer: viewer ?? null,
    };
  }

  // ---------- 生命周期 ----------

  begin(): Outcome {
    if (!this.syncPlayers()) return rejectOutcome('至少需要 2 名玩家');
    this.deal();
    return [];
  }

  /** 按平台当前座位重建参与者；房主在结束后加/减座位时也能正确重开。 */
  private syncPlayers(): boolean {
    const seats = this.ctx
      .seats()
      .filter((seat) => seat.role !== 'spectator')
      .sort((a, b) => a.slot - b.slot);
    if (seats.length < 2) return false;
    const existing = new Map(this.players.map((player) => [player.seatId, player]));
    this.players = seats.map(
      (seat) =>
        existing.get(seat.seatId) ?? {
          seatId: seat.seatId,
          hand: [],
          calledLast: false,
          mustCall: false,
          callDeadline: null,
          bot: seat.role === 'ai',
        },
    );
    for (const player of this.players) player.bot = this.ctx.seat(player.seatId)?.role === 'ai';
    return true;
  }

  private deal(): void {
    const now = this.ctx.now();
    this.deck = buildDeck(this.config, () => this.ctx.random());
    this.discard = [];
    this.state = 'playing';
    this.turn = 0;
    this.direction = 1;
    this.pendingDraw = 0;
    this.chainBlack = [];
    this.pendingExtra = null;
    this.pendingDiscard = null;
    this.challenge = null;
    this.skipQueue = [];
    this.winner = null;
    this.log = [];
    this.botDueAt.clear();
    for (const player of this.players) {
      player.hand = this.deck.splice(0, HAND_SIZE);
      player.calledLast = false;
      player.mustCall = false;
      player.callDeadline = null;
    }
    let first = this.deck.pop();
    while (first && isBlack(first)) {
      this.deck.unshift(first);
      first = this.deck.pop();
    }
    this.discard.push(first!);
    this.activeColor = first!.color;
    this.applyFirstCard(first!);
    this.turnStartedAt = now;
    this.pushLog('对局开始');
    this.armBots(now);
  }

  private applyFirstCard(first: Card): void {
    switch (first.value) {
      case 'skip':
        this.advanceTurn();
        break;
      case 'reverse':
        this.direction *= -1;
        break;
      case 'skipall': {
        const current = this.currentPlayer();
        this.skipQueue = this.players.filter((player) => player.seatId !== current?.seatId).map((p) => p.seatId);
        this.pushLog(`起手 ${this.nameOf(current?.seatId)} 被跳过`);
        this.advanceTurn(1);
        break;
      }
      case 'draw2': {
        const player = this.currentPlayer();
        if (player) {
          player.hand.push(...drawFromDeck(this, 2, () => this.ctx.random()));
          this.pushLog(`${this.nameOf(player.seatId)} 起手罚抽 2 张`);
        }
        this.advanceTurn();
        break;
      }
      default:
        break;
    }
  }

  onSeatJoin(seat: GameSeatInfo): Effect[] {
    if (this.state !== 'playing') return [];
    if (seat.role === 'spectator') return [];
    return [];
  }

  onSeatLeave(seat: GameSeatInfo, phase: RoomPhase): Effect[] {
    if (phase === 'lobby') return [];
    const index = this.players.findIndex((player) => player.seatId === seat.seatId);
    if (index < 0) return [];
    this.players.splice(index, 1);
    this.botDueAt.delete(seat.seatId);
    this.forget(seat.seatId);
    if (this.state === 'ended') return [];
    if (this.players.length < 2) {
      this.state = 'ended';
      this.winner = null;
      this.pushLog('在线人数不足，对局终止');
      return [];
    }
    if (index < this.turn) this.turn -= 1;
    this.turn = ((this.turn % this.players.length) + this.players.length) % this.players.length;
    this.advanceTurn(0);
    return [];
  }

  onTimeout(_seat: GameSeatInfo): Effect[] {
    return [];
  }

  dispose(): void {
    this.botDueAt.clear();
  }

  // ---------- 动作入口 ----------

  handle(action: GameAction, by: string): Outcome {
    const player = this.players.find((item) => item.seatId === by);
    if (action.name === 'rematch') {
      const seat = this.ctx.seat(by);
      if (this.state !== 'ended') return rejectOutcome('这一局还没结束');
      if (seat?.role !== 'host') return rejectOutcome('只有房主能再来一局');
      if (!this.syncPlayers()) return rejectOutcome('至少需要 2 名玩家');
      this.deal();
      return [];
    }
    if (!player) return rejectOutcome('你不在对局座位上');
    const payload = (action.payload ?? {}) as Record<string, unknown>;
    switch (action.name) {
      case 'play':
        return this.play(player, str(payload.cardId), str(payload.color) as Color | undefined, str(payload.swapWith));
      case 'draw':
        return this.draw(player);
      case 'peng':
        return this.peng(player, Array.isArray(payload.cardIds) ? payload.cardIds.map(String) : []);
      case 'endturn':
        return this.endTurn(player);
      case 'lastcall':
        return this.callLast(player);
      case 'report':
        return this.report(player, str(payload.targetId));
      case 'contest':
        return this.contest(player, str(payload.targetId));
      case 'accept':
        return this.accept(player);
      case 'discard':
        return this.discardToCap(player, Array.isArray(payload.cardIds) ? payload.cardIds.map(String) : []);
      default:
        return rejectOutcome('未知动作', 'BADMSG');
    }
  }

  private play(player: PlayerState, cardId: string | undefined, color: Color | undefined, swapWith: string | undefined): Outcome {
    if (this.state !== 'playing') return this.fail(player, '对局已结束');
    if (this.challenge) return this.fail(player, '质疑结算中，请稍候');
    if (this.pendingDiscard) return this.fail(player, `等待 ${this.nameOf(this.pendingDiscard.seatId)} 弃牌`);
    if (this.currentPlayer()?.seatId !== player.seatId) return this.fail(player, '还没轮到你');
    const index = player.hand.findIndex((card) => card.id === cardId);
    if (index < 0) return this.fail(player, '手牌中没有这张牌');
    const card = player.hand[index]!;

    let swapTarget: PlayerState | null = null;
    if (card.value === '7' && this.config.extend && swapWith) {
      swapTarget = this.playerById(swapWith) ?? null;
      if (!swapTarget) return this.fail(player, '交换对象不在房间中');
      if (swapTarget.seatId === player.seatId) return this.fail(player, '不能和自己交换');
    }

    if (this.pendingDraw > 0) {
      if (!this.config.stack) return this.fail(player, '本局未开启接龙，只能吃下罚牌');
      if (!canStack(card, this.pendingDraw, this.activeColor)) return this.fail(player, '罚链中只能接更大的罚牌');
    } else if (!this.legalNow(card)) {
      return this.fail(player, '不合法规则，无法出这张牌');
    }

    if (changesColor(card)) {
      if (!color || !['red', 'yellow', 'green', 'blue'].includes(color)) return this.fail(player, '请选择颜色');
      this.activeColor = color;
    } else if (!isBlack(card)) {
      this.activeColor = card.color;
    }

    player.hand.splice(index, 1);
    if (card.value === 'flush' && this.config.extend) {
      const dumped = player.hand.filter((x) => x.color === card.color);
      player.hand = player.hand.filter((x) => x.color !== card.color);
      this.discard.push(...dumped, card);
      if (dumped.length) this.pushLog(`${this.nameOf(player.seatId)} 甩色，一并弃掉 ${dumped.length} 张${this.colorName(card.color)}`);
    } else {
      this.discard.push(card);
    }
    player.calledLast = false;

    if (card.value === '0' && this.config.extend) this.rotateHands();
    if (swapTarget) this.swapHands(player, swapTarget);

    if (this.checkSizes()) return [];

    if (card.value === 'wild') {
      this.pendingExtra = { seatId: player.seatId, reason: 'wild' };
      this.pushLog(`${this.nameOf(player.seatId)} 变为${this.colorName(this.activeColor)}，可继续出牌`);
      return [];
    }

    this.resolveEffect(card, player);
    return [];
  }

  private draw(player: PlayerState): Outcome {
    if (this.state !== 'playing') return this.fail(player, '对局已结束');
    if (this.challenge) return this.fail(player, '质疑结算中，请稍候');
    if (this.pendingDiscard) return this.fail(player, `等待 ${this.nameOf(this.pendingDiscard.seatId)} 弃牌`);
    if (this.currentPlayer()?.seatId !== player.seatId) return this.fail(player, '还没轮到你');

    if (this.pendingDraw > 0) return this.takePenalty(player);
    if (this.pendingExtra?.seatId === player.seatId && this.pendingExtra.reason === 'draw') {
      return this.fail(player, '摸过一张了，出牌或结束回合');
    }
    const drawn = drawFromDeck(this, 1, () => this.ctx.random());
    player.hand.push(...drawn);
    this.pushLog(`${this.nameOf(player.seatId)} 摸了 1 张牌`);
    this.pendingExtra = { seatId: player.seatId, reason: 'draw' };
    this.checkSizes();
    this.turnStartedAt = this.ctx.now();
    return [];
  }

  private takePenalty(player: PlayerState): Outcome {
    const amount = this.pendingDraw;
    const held = drawFromDeck(this, amount, () => this.ctx.random());
    const targets = this.config.contest
      ? this.chainBlack.filter((seatId) => seatId !== player.seatId && Boolean(this.playerById(seatId)))
      : [];
    this.pendingDraw = 0;
    if (targets.length > 0) {
      this.chainBlack = [];
      this.challenge = {
        victimId: player.seatId,
        targets,
        held,
        deadline: this.ctx.now() + TIMING.challengeMs,
      };
      this.pushLog(`${this.nameOf(player.seatId)} 摸走 ${amount} 张罚牌，可指定一人质疑`);
      return [];
    }
    this.chainBlack = [];
    player.hand.push(...held);
    this.pushLog(`${this.nameOf(player.seatId)} 摸走 ${amount} 张罚牌`);
    this.checkSizes();
    this.advanceTurn();
    return [];
  }

  private peng(player: PlayerState, cardIds: string[]): Outcome {
    if (this.state !== 'playing') return this.fail(player, '对局已结束');
    if (!this.config.peng) return this.fail(player, '本局未开启碰');
    if (this.pendingDiscard) return this.fail(player, '等待弃牌结算');
    if (this.pendingDraw > 0) return this.fail(player, '罚链进行中不能碰');
    if (this.challenge) return this.fail(player, '质疑结算中，请稍候');
    const top = this.discard[this.discard.length - 1];
    if (!top || !isNumber(top)) return this.fail(player, '只有数字牌能被碰');
    if (this.currentPlayer()?.seatId === player.seatId) return this.fail(player, '已经轮到你了，直接出牌即可');

    const ids = [...new Set(cardIds.filter(Boolean))];
    if (ids.length === 0 || ids.length > 2) return this.fail(player, '碰只能出 1~2 张相同的牌');

    const cards: Card[] = [];
    for (const id of ids) {
      const card = player.hand.find((item) => item.id === id);
      if (!card) return this.fail(player, '手牌中没有这张牌');
      if (!canPeng(card, top)) return this.fail(player, '碰的牌必须与顶牌颜色数字都相同');
      cards.push(card);
    }
    if (cards.length === 2 && (cards[0]!.color !== cards[1]!.color || cards[0]!.value !== cards[1]!.value)) {
      return this.fail(player, '两张一起碰需要两张完全相同');
    }

    const at = this.players.findIndex((item) => item.seatId === player.seatId);
    if (at >= 0) this.turn = at;
    this.pushLog(`${this.nameOf(player.seatId)} 碰! 抢下回合`);
    for (const card of cards) {
      player.hand.splice(player.hand.findIndex((item) => item.id === card.id), 1);
      this.discard.push(card);
    }
    player.calledLast = false;
    if (cards[0]!.value === '0') this.rotateHands();
    if (this.checkSizes()) return [];
    this.advanceTurn();
    return [];
  }

  private endTurn(player: PlayerState): Outcome {
    if (this.state !== 'playing') return this.fail(player, '对局已结束');
    if (this.currentPlayer()?.seatId !== player.seatId) return this.fail(player, '还没轮到你');
    if (this.pendingExtra?.seatId !== player.seatId) return this.fail(player, '现在不能结束回合');
    this.pushLog(`${this.nameOf(player.seatId)} 结束回合`);
    this.advanceTurn();
    return [];
  }

  private callLast(player: PlayerState): Outcome {
    if (player.hand.length !== 1) return this.fail(player, '你还有多于 1 张牌');
    player.calledLast = true;
    player.mustCall = false;
    player.callDeadline = null;
    this.pushLog(`${this.nameOf(player.seatId)} 报了剩一张!`);
    return [];
  }

  private report(by: PlayerState, targetId: string | undefined): Outcome {
    if (this.state !== 'playing') return this.fail(by, '对局已结束');
    const target = targetId ? this.playerById(targetId) : undefined;
    if (!target) return this.fail(by, '判罚无效');
    if (target.seatId === by.seatId) return this.fail(by, '不能判罚自己');
    if (target.hand.length !== 1 || target.calledLast) return this.fail(by, '判罚无效');
    target.hand.push(...drawFromDeck(this, 2, () => this.ctx.random()));
    target.mustCall = false;
    target.callDeadline = null;
    this.pushLog(`${this.nameOf(target.seatId)} 未报牌，被判罚抽 2 张`);
    return [];
  }

  private contest(player: PlayerState, targetId: string | undefined): Outcome {
    if (!this.challenge) return this.fail(player, '没有可质疑的窗口');
    if (this.challenge.victimId !== player.seatId) return this.fail(player, '只有吃罚牌的人能质疑');
    const target = targetId ? this.playerById(targetId) : undefined;
    if (!target || !this.challenge.targets.includes(target.seatId)) {
      return this.fail(player, '只能质疑打过黑色罚牌的玩家');
    }
    const hasPlayable = target.hand.some((card) => isBlack(card) || card.color === this.activeColor);
    const handSnapshot = target.hand.slice();
    const reveal = {
      targetId: target.seatId,
      targetName: this.nameOf(target.seatId),
      hand: handSnapshot,
      activeColor: this.activeColor,
    };
    if (!hasPlayable) {
      this.pushLog(`质疑失败：${reveal.targetName} 确实没有可出的牌`);
      this.resolveChallenge({ success: false });
    } else {
      this.pushLog(`质疑成功：${reveal.targetName} 手上留有${this.colorName(this.activeColor)}色牌，罚抽 6 张`);
      this.resolveChallenge({ success: true, attackerId: target.seatId });
    }
    return [
      {
        kind: 'toSeat',
        seatId: player.seatId,
        name: 'reveal',
        payload: { success: hasPlayable, ...reveal },
      },
    ];
  }

  private accept(player: PlayerState): Outcome {
    if (!this.challenge) return this.fail(player, '没有待处理的质疑窗口');
    if (this.challenge.victimId !== player.seatId) return this.fail(player, '只有吃罚牌的人能选择');
    this.resolveChallenge(null);
    return [];
  }

  private discardToCap(player: PlayerState, cardIds: string[]): Outcome {
    if (this.state !== 'playing') return this.fail(player, '对局已结束');
    if (!this.pendingDiscard) return this.fail(player, '现在不需要弃牌');
    if (this.pendingDiscard.seatId !== player.seatId) return this.fail(player, '不是你的弃牌阶段');
    const need = this.pendingDiscard.need;
    const ids = [...new Set(cardIds.filter(Boolean))];
    if (ids.length !== need) return this.fail(player, `需要正好弃 ${need} 张`);
    const cards: Card[] = [];
    for (const id of ids) {
      const card = player.hand.find((item) => item.id === id);
      if (!card) return this.fail(player, '手牌中没有这张牌');
      cards.push(card);
    }
    player.hand = player.hand.filter((card) => !ids.includes(card.id));
    this.deck.push(...cards);
    shuffleTail(this.deck, cards.length, () => this.ctx.random());
    this.pendingDiscard = null;
    this.pushLog(`${this.nameOf(player.seatId)} 弃掉 ${cards.length} 张牌，回到上限 ${this.config.cap}`);
    if (this.checkSizes()) return [];
    this.advanceTurn();
    return [];
  }

  // ---------- 规则内部 ----------

  private legalNow(card: Card): boolean {
    const top = this.discard[this.discard.length - 1];
    if (!top) return false;
    if (this.pendingDraw > 0) return canStack(card, this.pendingDraw, this.activeColor);
    return canPlay(card, top, this.activeColor);
  }

  private resolveEffect(card: Card, by: PlayerState): void {
    switch (card.value) {
      case 'skip':
        this.pushLog(`${this.nameOf(this.nextPlayer()?.seatId)} 被跳过`);
        this.advanceTurn(2);
        break;
      case 'reverse':
        if (this.players.length === 2) {
          this.direction *= -1;
          this.advanceTurn(2);
        } else {
          this.direction *= -1;
          this.advanceTurn(1);
        }
        break;
      case 'draw2':
        this.openChain(2, by, false);
        break;
      case 'wild4':
        if (this.config.extend) this.direction *= -1;
        this.openChain(4, by, true);
        break;
      case 'wild6':
        this.openChain(6, by, true);
        break;
      case 'wild10':
        this.openChain(10, by, true);
        break;
      case 'skipall': {
        this.skipQueue = this.players.filter((player) => player.seatId !== by.seatId).map((p) => p.seatId);
        this.pushLog(`${this.nameOf(by.seatId)} 打出跳过所有人，自己再来一回合`);
        this.advanceTurn(1);
        break;
      }
      default:
        this.advanceTurn(1);
    }
  }

  private openChain(amount: number, by: PlayerState, isBlackCard: boolean): void {
    this.pendingDraw = Math.max(this.pendingDraw, amount);
    if (isBlackCard && !this.chainBlack.includes(by.seatId)) this.chainBlack.push(by.seatId);
    this.pushLog(`${this.nameOf(by.seatId)} 打出 +${amount}，待罚 ${this.pendingDraw} 张`);
    this.advanceTurn(1);
  }

  private advanceTurn(steps = 1): void {
    if (!this.players.length) return;
    if (this.config.cap > 0 && !this.pendingDiscard) {
      const leaving = this.currentPlayer();
      if (leaving && leaving.hand.length > this.config.cap) {
        this.pendingDiscard = { seatId: leaving.seatId, need: leaving.hand.length - this.config.cap };
        this.pushLog(
          `${this.nameOf(leaving.seatId)} 手牌 ${leaving.hand.length} 张超过上限 ${this.config.cap}，需弃 ${this.pendingDiscard.need} 张`,
        );
        return;
      }
    }
    for (let i = 0; i < steps; i++) {
      this.turn = (this.turn + this.direction + this.players.length) % this.players.length;
    }
    let guard = 0;
    while (this.players.length && guard < this.players.length * 3) {
      const current = this.currentPlayer();
      if (current && this.skipQueue.includes(current.seatId)) {
        this.skipQueue = this.skipQueue.filter((seatId) => seatId !== current.seatId);
        this.pushLog(`${this.nameOf(current.seatId)} 被跳过`);
        this.turn = (this.turn + this.direction + this.players.length) % this.players.length;
        guard++;
        continue;
      }
      break;
    }
    if (this.state === 'playing') this.turnStartedAt = this.ctx.now();
    this.pendingExtra = null;
  }

  private checkSizes(): boolean {
    const emptied = this.players.find((player) => player.hand.length === 0);
    if (emptied) {
      this.state = 'ended';
      this.winner = emptied.seatId;
      this.pushLog(`${this.nameOf(emptied.seatId)} 获胜!`);
      return true;
    }
    const now = this.ctx.now();
    for (const player of this.players) {
      if (player.hand.length !== 1) {
        if (player.hand.length > 1) {
          player.mustCall = false;
          player.callDeadline = null;
        }
        continue;
      }
      if (!player.calledLast && !player.mustCall) {
        player.mustCall = true;
        player.callDeadline = now + TIMING.lastCallMs;
      }
    }
    return false;
  }

  private rotateHands(): void {
    if (this.players.length < 2) return;
    const n = this.players.length;
    const old = this.players.map((player) => player.hand);
    for (let i = 0; i < n; i++) {
      const to = (i + this.direction + n) % n;
      this.players[to]!.hand = old[i]!;
    }
    this.pushLog('0 号牌：所有人把手牌交给下家');
  }

  private swapHands(player: PlayerState, other: PlayerState): void {
    const mine = player.hand;
    player.hand = other.hand;
    other.hand = mine;
    this.pushLog(`${this.nameOf(player.seatId)} 与 ${this.nameOf(other.seatId)} 交换了手牌`);
  }

  private resolveChallenge(outcome: { success: boolean; attackerId?: string } | null): void {
    const challenge = this.challenge;
    if (!challenge) return;
    const victim = this.playerById(challenge.victimId);
    if (outcome?.success) {
      const attacker = outcome.attackerId ? this.playerById(outcome.attackerId) : undefined;
      if (attacker) attacker.hand.push(...drawFromDeck(this, 6, () => this.ctx.random()));
    } else if (outcome && outcome.success === false) {
      if (victim) victim.hand.push(...drawFromDeck(this, 4, () => this.ctx.random()));
    }
    if (victim) victim.hand.push(...challenge.held);
    this.challenge = null;
    if (victim) this.checkSizes();
    this.advanceTurn();
  }

  private forget(seatId: string): void {
    this.skipQueue = this.skipQueue.filter((item) => item !== seatId);
    this.chainBlack = this.chainBlack.filter((item) => item !== seatId);
    if (this.pendingExtra?.seatId === seatId) this.pendingExtra = null;
    if (this.pendingDiscard?.seatId === seatId) this.pendingDiscard = null;
    if (this.challenge && (this.challenge.victimId === seatId || this.challenge.targets.includes(seatId))) {
      this.resolveChallenge(null);
    }
  }

  private autoDiscard(player: PlayerState): void {
    if (!this.pendingDiscard) return;
    const need = this.pendingDiscard.need;
    const weight = (card: Card) => (isBlack(card) ? 0 : /^[0-9]$/.test(card.value) ? Number(card.value) + 1 : 0.5);
    const sorted = player.hand.slice().sort((a, b) => weight(b) - weight(a));
    const ids = sorted.slice(0, need).map((card) => card.id);
    this.pushLog(`${this.nameOf(player.seatId)} 超时未弃牌，系统代为弃 ${ids.length} 张`);
    this.discardToCap(player, ids);
  }

  private timeoutAction(): void {
    if (this.pendingDiscard) {
      const player = this.playerById(this.pendingDiscard.seatId);
      if (player) this.autoDiscard(player);
      return;
    }
    const current = this.currentPlayer();
    if (!current) return;
    if (this.challenge) {
      this.pushLog(`${this.nameOf(current.seatId)} 超时未质疑，按不质疑处理`);
      this.resolveChallenge(null);
      return;
    }
    if (this.pendingDraw > 0) {
      this.pushLog(`${this.nameOf(current.seatId)} 超时未行动，自动吃下罚牌`);
      this.takePenalty(current);
      return;
    }
    if (this.pendingExtra?.seatId === current.seatId) {
      this.pushLog(`${this.nameOf(current.seatId)} 超时，结束回合`);
      this.advanceTurn();
      return;
    }
    current.hand.push(...drawFromDeck(this, 1, () => this.ctx.random()));
    this.pushLog(`${this.nameOf(current.seatId)} 超时未行动，自动摸 1 张`);
    this.checkSizes();
    this.advanceTurn();
  }

  // ---------- 心跳：计时窗口 + 机器人 ----------

  tick(now: number): Effect[] {
    if (this.state !== 'playing') return [];
    let changed = false;

    for (const player of this.players) {
      if (player.mustCall && !player.calledLast && player.callDeadline && now > player.callDeadline) {
        player.hand.push(...drawFromDeck(this, 2, () => this.ctx.random()));
        player.mustCall = false;
        player.callDeadline = null;
        this.pushLog(`${this.nameOf(player.seatId)} 5 秒内未报牌，罚抽 2 张`);
        changed = true;
      }
    }
    if (this.challenge && now > this.challenge.deadline) {
      this.pushLog('质疑超时，按不质疑处理');
      this.resolveChallenge(null);
      changed = true;
    }

    if (!this.turnTimerOff() && !this.challenge && this.turnStartedAt && now - this.turnStartedAt > this.turnTimeoutMs()) {
      const current = this.currentPlayer();
      if (current && !current.bot) {
        this.timeoutAction();
        changed = true;
      } else if (current) {
        this.turnStartedAt = now;
      }
    }

    this.armBots(now);
    if (this.stepBots(now)) changed = true;

    return changed ? [{ kind: 'broadcast', name: 'tick', payload: {} }] : [];
  }

  private stepBots(now: number): boolean {
    for (const player of this.players) {
      if (!player.bot) continue;
      const due = this.botDueAt.get(player.seatId);
      if (due === undefined || due > now) continue;
      if (!this.botOwes(player)) {
        this.botDueAt.delete(player.seatId);
        continue;
      }
      const action = decideBotAction(this.botState(), player, this.botDifficulty(player.seatId), () => this.ctx.random());
      this.botDueAt.delete(player.seatId);
      if (!action) {
        this.botDueAt.set(player.seatId, now + TIMING.botDelayMs);
        continue;
      }
      this.applyBot(player, action);
      return true;
    }
    return false;
  }

  private applyBot(player: PlayerState, action: BotAction): void {
    const outcome = this.applyBotAction(player, action);
    const rejected = Array.isArray(outcome) && outcome.some((effect) => effect.kind === 'toSeat' && effect.name === 'error');
    if (rejected) {
      this.pushLog(`${this.nameOf(player.seatId)} 的机器人动作被拒，按超时处理`);
      this.timeoutAction();
    }
    this.armBots(this.ctx.now());
  }

  private applyBotAction(player: PlayerState, action: BotAction): Outcome {
    switch (action.type) {
      case 'discard':
        return this.discardToCap(player, action.cardIds);
      case 'accept':
        return this.accept(player);
      case 'contest':
        return this.contest(player, action.targetId);
      case 'lastcall':
        return this.callLast(player);
      case 'peng':
        return this.peng(player, action.cardIds);
      case 'play':
        return this.play(player, action.cardId, action.color, action.swapWith);
      case 'draw':
        return this.draw(player);
      case 'endturn':
        return this.endTurn(player);
    }
  }

  private armBots(now: number): void {
    for (const player of this.players) {
      if (!player.bot) continue;
      if (this.botOwes(player) && !this.botDueAt.has(player.seatId)) {
        this.botDueAt.set(player.seatId, now + TIMING.botDelayMs);
      }
    }
  }

  private botOwes(player: PlayerState): boolean {
    if (this.state !== 'playing') return false;
    if (this.pendingDiscard?.seatId === player.seatId) return true;
    if (this.challenge?.victimId === player.seatId) return true;
    if (player.mustCall && !player.calledLast) return true;
    return this.currentPlayer()?.seatId === player.seatId;
  }

  private seatOptionsFor(seatId: string): Record<string, unknown> {
    const seat = this.ctx.seat(seatId);
    if (!seat) return {};
    return normalizeSeatOptions(seat.role, seat.slot, seat.options ?? {});
  }

  private botDifficulty(seatId: string): Difficulty {
    return seatDifficulty(this.ctx.seat(seatId)?.options ?? {});
  }

  private botState(): BotState {
    return {
      rules: this.config,
      state: this.state,
      discard: this.discard,
      activeColor: this.activeColor,
      direction: this.direction,
      pendingDraw: this.pendingDraw,
      pendingExtra: this.pendingExtra,
      pendingDiscard: this.pendingDiscard,
      challenge: this.challenge ? { victimId: this.challenge.victimId, targets: this.challenge.targets } : null,
      players: this.players.map((player) => ({
        seatId: player.seatId,
        hand: player.hand,
        calledLast: player.calledLast,
        mustCall: player.mustCall,
      })),
      currentSeatId: () => this.currentPlayer()?.seatId ?? null,
    };
  }

  // ---------- 小工具 ----------

  private currentPlayer(): PlayerState | null {
    if (!this.players.length) return null;
    return this.players[this.turn % this.players.length] ?? null;
  }

  private nextPlayer(): PlayerState | null {
    if (!this.players.length) return null;
    return this.players[(this.turn + this.direction + this.players.length) % this.players.length] ?? null;
  }

  private playerById(seatId: string): PlayerState | undefined {
    return this.players.find((player) => player.seatId === seatId);
  }

  private nameOf(seatId: string | undefined): string {
    if (!seatId) return '玩家';
    return this.ctx.seat(seatId)?.name ?? '玩家';
  }

  private colorName(color: Color): string {
    return { red: '红色', yellow: '黄色', green: '绿色', blue: '蓝色', wild: '黑色' }[color];
  }

  private pengOptions(seatId: string): string[] {
    if (!this.config.peng) return [];
    if (this.state !== 'playing' || this.pendingDraw > 0 || this.challenge) return [];
    const top = this.discard[this.discard.length - 1];
    if (!top || !isNumber(top)) return [];
    const player = this.playerById(seatId);
    if (!player || this.currentPlayer()?.seatId === seatId) return [];
    return player.hand.filter((card) => canPeng(card, top)).map((card) => card.id);
  }

  private canStackNow(viewer: ViewerId): boolean {
    if (this.pendingDraw <= 0 || !this.config.stack || !viewer) return false;
    const player = this.playerById(viewer);
    if (!player || this.currentPlayer()?.seatId !== viewer) return false;
    return player.hand.some((card) => canStack(card, this.pendingDraw, this.activeColor));
  }

  private mustFacePenalty(viewer: ViewerId): boolean {
    if (!viewer || this.challenge || this.pendingDraw <= 0) return false;
    if (this.currentPlayer()?.seatId !== viewer) return false;
    return !this.canStackNow(viewer);
  }

  private hasAi(): boolean {
    return this.players.some((player) => player.bot);
  }

  private turnTimerOff(): boolean {
    return this.config.noTurnTimer && this.hasAi();
  }

  private turnTimeoutMs(): number {
    return this.hasAi() ? TIMING.pveTurnMs : TIMING.pvpTurnMs;
  }

  private fail(player: PlayerState, text: string): Effect[] {
    return [{ kind: 'toSeat', seatId: player.seatId, name: 'error', payload: { text } }];
  }

  private pushLog(text: string): void {
    this.log.push(text);
    if (this.log.length > 50) this.log.shift();
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function shuffleTail(arr: Card[], count: number, rng: () => number): void {
  const start = arr.length - count;
  for (let i = arr.length - 1; i > start; i--) {
    const j = start + Math.floor(rng() * (i - start + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}
