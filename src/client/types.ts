export type Color = 'red' | 'yellow' | 'green' | 'blue' | 'wild';

export interface Card {
  id: string;
  color: Color;
  value: string;
}

export interface PlayerView {
  seatId: string;
  name: string;
  role: 'host' | 'player' | 'ai' | 'spectator';
  cardCount: number;
  connected: boolean;
  calledLast: boolean;
  mustCall: boolean;
  callDeadlineInMs: number | null;
  hand?: Card[];
}

export interface ChallengeView {
  victimId: string;
  heldCount: number;
  deadlineInMs: number;
  targets: Array<{ seatId: string; name: string }>;
}

export interface ClientView {
  phase: 'playing' | 'ended';
  rules: Record<string, unknown> & {
    stack: boolean;
    contest: boolean;
    extend: boolean;
    merciless: boolean;
    peng: boolean;
    cap: number;
    noTurnTimer: boolean;
    difficulty?: string;
  };
  cap: number;
  activeColor: Color;
  direction: number;
  pendingDraw: number;
  winner: string | null;
  currentSeatId: string | null;
  turnTimeoutMs: number;
  lastCallMs: number;
  challengeMs: number;
  freePlayOf: string | null;
  skipQueue: string[];
  pendingDiscard: { seatId: string; need: number } | null;
  mustDiscardNow: number;
  topCard: Card | null;
  deckCount: number;
  log: string[];
  peng: string[];
  challenge: ChallengeView | null;
  canStackNow: boolean;
  mustFacePenalty: boolean;
  noTurnTimer: boolean;
  deadlineInMs: number | null;
  players: PlayerView[];
  viewer: string | null;
}

export interface RevealPayload {
  success: boolean;
  targetId: string;
  targetName: string;
  hand: Card[];
  activeColor: Color;
}
