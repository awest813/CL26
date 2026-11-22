import { makeRng, seedToNumber } from './rng.ts';

/**
 * The postgame press conference. A reporter asks about the game you just played, and you
 * answer in one of three tones. Each answer has a small, stated effect, so the choice is a
 * trade, not flavor alone:
 *   humble  - boosters like it: AD pressure eases.
 *   bold    - prospects notice: next week's recruiting gets a lift, but it raises expectations.
 *   focus   - the locker room gets back to work: team fatigue eases a little.
 * Pure and deterministic: the same game always gets the same question and quotes.
 */

export type PressTone = 'humble' | 'bold' | 'focus';

export interface PressContext {
  /** Stable id for the game (week and opponent), used to seed the wording and to record the answer. */
  gameKey: string;
  won: boolean;
  userScore: number;
  oppScore: number;
  opponentName: string;
  /** The opponent's poll rank, when ranked. */
  opponentRank: number | null;
  /** Trophy name when it was a rivalry game. */
  rivalryTrophy?: string | null;
  /** Consecutive results ending with this game: +3 is three straight wins, -2 two straight losses. */
  streak: number;
  /** Went to overtime. */
  overtime?: boolean;
}

export interface PressEffect {
  /** Change to AD pressure (negative eases it). */
  adPressure: number;
  /** Multiplier on next week's recruiting interest gains (1 is none). */
  recruitingBuzz: number;
  /** Change to team fatigue (negative is fresher). */
  fatigue: number;
}

export interface PressAnswer {
  tone: PressTone;
  label: string;
  quote: string;
  effect: PressEffect;
  /** The effect in words, for the button. */
  effectLine: string;
}

export interface PressConference {
  question: string;
  /** True for a rivalry game or a ranked opponent: answers count half again as much. */
  bigStage: boolean;
  answers: PressAnswer[];
}

/** A rivalry or a ranked opponent puts more cameras in the room. */
export const BIG_STAGE_SCALE = 1.5;

const BASE_EFFECTS: Record<'win' | 'loss', Record<PressTone, PressEffect>> = {
  win: {
    humble: { adPressure: -0.2, recruitingBuzz: 1, fatigue: 0 },
    bold: { adPressure: 0.15, recruitingBuzz: 1.06, fatigue: 0 },
    focus: { adPressure: 0, recruitingBuzz: 1, fatigue: -1 },
  },
  loss: {
    humble: { adPressure: -0.4, recruitingBuzz: 1, fatigue: 0 },
    bold: { adPressure: 0.4, recruitingBuzz: 1.04, fatigue: 0 },
    focus: { adPressure: 0, recruitingBuzz: 1, fatigue: -1 },
  },
};

function pick<T>(rng: () => number, options: T[]): T {
  return options[Math.floor(rng() * options.length) % options.length];
}

function scaled(effect: PressEffect, scale: number): PressEffect {
  return {
    adPressure: Math.round(effect.adPressure * scale * 100) / 100,
    recruitingBuzz: Math.round((1 + (effect.recruitingBuzz - 1) * scale) * 1000) / 1000,
    fatigue: Math.round(effect.fatigue * scale * 10) / 10,
  };
}

/** "AD pressure -0.2", "Recruiting +6% next week · AD pressure +0.15", ... */
export function describePressEffect(effect: PressEffect): string {
  const parts: string[] = [];
  if (effect.recruitingBuzz !== 1) parts.push(`Recruiting +${Math.round((effect.recruitingBuzz - 1) * 100)}% next week`);
  if (effect.adPressure !== 0) parts.push(`AD pressure ${effect.adPressure > 0 ? '+' : ''}${effect.adPressure}`);
  if (effect.fatigue !== 0) parts.push(`Fatigue ${effect.fatigue > 0 ? '+' : ''}${effect.fatigue}`);
  return parts.join(' · ');
}

function questionFor(context: PressContext, rng: () => number): string {
  const { won, userScore, oppScore, opponentName, opponentRank, rivalryTrophy, streak, overtime } = context;
  const margin = Math.abs(userScore - oppScore);
  const score = `${Math.max(userScore, oppScore)}-${Math.min(userScore, oppScore)}`;
  const ranked = opponentRank ? `No. ${opponentRank} ${opponentName}` : opponentName;
  if (rivalryTrophy) {
    return won
      ? pick(rng, [`The ${rivalryTrophy} stays with you after ${score}. What does this rivalry mean to this group?`, `You take the ${rivalryTrophy}. How long will you let them enjoy this one?`])
      : pick(rng, [`You lose the ${rivalryTrophy}, ${score}. How does that sit with you?`, `${opponentName} takes the ${rivalryTrophy}. What do you say to your seniors?`]);
  }
  if (overtime) {
    return won
      ? `A sudden-death winner against ${ranked}. What was the message before overtime?`
      : `${ranked} wins it in overtime. What separates a game like that?`;
  }
  if (won && opponentRank) return pick(rng, [`A ${score} win over ${ranked}. Is this team for real?`, `You beat ${ranked}, ${score}. Does this change your ceiling?`]);
  if (!won && opponentRank && margin <= 2) return `Right there with ${ranked} and it slips away, ${score}. What's missing?`;
  if (won && streak >= 3) return pick(rng, [`That's ${streak} straight. What's clicking right now?`, `${streak} wins in a row. Are you worried about a letdown?`]);
  if (!won && streak <= -3) return pick(rng, [`That's ${-streak} straight losses. What has to change?`, `${-streak} in a row now. Is your job on the line?`]);
  if (won && margin >= 8) return pick(rng, [`A ${score} rout of ${opponentName}. Did you empty the bench too late?`, `${score} over ${opponentName}. Anything you didn't like?`]);
  if (!won && margin >= 8) return pick(rng, [`${opponentName} ran away with it, ${score}. Where did it go wrong?`, `A ${score} loss. Was this team ready to play?`]);
  if (won && margin <= 1) return `A one-goal game against ${opponentName}. Lucky or good?`;
  if (!won && margin <= 1) return `One goal short against ${opponentName}. What's the takeaway?`;
  return won
    ? pick(rng, [`A ${score} win over ${opponentName}. What did you like?`, `${score} over ${opponentName}. Where does this team go from here?`])
    : pick(rng, [`A ${score} loss to ${opponentName}. What did you see?`, `${opponentName} wins ${score}. What do you take from it?`]);
}

const QUOTES: Record<'win' | 'loss', Record<PressTone, { label: string; quotes: string[] }>> = {
  win: {
    humble: { label: 'Credit the players', quotes: ['"That one belongs to the guys in that locker room. They did the work."', '"Our seniors set the tone all week. I just tried to stay out of the way."'] },
    bold: { label: 'Talk up the program', quotes: ['"We can play with anybody in the country. People are going to find that out."', '"This is what our program looks like now. Get used to it."'] },
    focus: { label: 'One game at a time', quotes: ['"We\'ll enjoy it tonight. Tomorrow it\'s film and the next opponent."', '"Nice win. Doesn\'t count for anything next week."'] },
  },
  loss: {
    humble: { label: 'Take the blame', quotes: ['"That\'s on me. I didn\'t have them ready, and I\'ll fix it."', '"Put that one on the coaching staff. The guys competed."'] },
    bold: { label: 'Promise a response', quotes: ['"Nobody in this conference is going to want to see us next week."', '"Mark it down: this team will be better for it, and soon."'] },
    focus: { label: 'Move on', quotes: ['"Flush it. We\'re back on the field at seven tomorrow."', '"One game. We learn from it and we move on."'] },
  },
};

/** The press conference after a game: the question, and three answers with their effects. */
export function buildPressConference(context: PressContext): PressConference {
  const rng = makeRng(seedToNumber(`${context.gameKey}:press`));
  const result = context.won ? 'win' : 'loss';
  const bigStage = Boolean(context.rivalryTrophy) || context.opponentRank != null;
  const scale = bigStage ? BIG_STAGE_SCALE : 1;
  const question = questionFor(context, rng);
  const answers = (['humble', 'bold', 'focus'] as PressTone[]).map((tone) => {
    const effect = scaled(BASE_EFFECTS[result][tone], scale);
    return {
      tone,
      label: QUOTES[result][tone].label,
      quote: pick(rng, QUOTES[result][tone].quotes),
      effect,
      effectLine: describePressEffect(effect),
    };
  });
  return { question, bigStage, answers };
}

/** Consecutive results ending with the latest: positive for wins, negative for losses. */
export function resultStreak(resultsOldestFirst: boolean[]): number {
  if (resultsOldestFirst.length === 0) return 0;
  const last = resultsOldestFirst[resultsOldestFirst.length - 1];
  let count = 0;
  for (let i = resultsOldestFirst.length - 1; i >= 0 && resultsOldestFirst[i] === last; i -= 1) count += 1;
  return last ? count : -count;
}
