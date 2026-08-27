import { WIN_HABITATS, WIN_POPULATION, WIN_SOLS } from '../sim/constants.ts';
import type { GameOver } from '../sim/types.ts';
import { restartColony } from '../state/actions.ts';
import { useStore } from '../state/store.ts';

/**
 * The end of a colony — a loss or the win.
 *
 * The only full-screen, click-blocking element in the app, which is justified by there being
 * nothing left to click behind it: the loop has stopped and the simulation returns the same
 * state forever. It mounts only once `gameOver` is set, so nothing in a live colony is ever
 * covered by it.
 */

const CAUSE_HEADLINE: Readonly<Record<GameOver['cause'], string>> = {
  oxygen: 'The air ran out',
  depopulated: 'Nobody is left',
  victory: 'The colony has taken root',
};

const CAUSE_DETAIL: Readonly<Record<GameOver['cause'], string>> = {
  oxygen:
    'The last of the oxygen was breathed. Suffocation is immediate; there is no rationing it.',
  depopulated: 'The colony went without for too long, and the last colonist died with it.',
  victory: `${WIN_SOLS} sols survived, ${WIN_HABITATS} habitats standing, ${WIN_POPULATION} colonists fed. Mars is inhabited now.`,
};

const CAUSE_LABEL: Readonly<Record<GameOver['cause'], string>> = {
  oxygen: 'Colony lost',
  depopulated: 'Colony lost',
  victory: 'Colony won',
};

export function GameOverOverlay() {
  const gameOver = useStore((state) => state.ui.gameOver);
  const survivalScore = useStore((state) => state.ui.survivalScore);
  const buildingCount = useStore((state) => state.ui.buildingCount);

  if (gameOver === null) return null;

  const isVictory = gameOver.cause === 'victory';

  return (
    <div
      data-testid="game-over"
      className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
    >
      <div
        className={
          isVictory
            ? 'w-80 rounded-lg border border-[#7FD98A]/40 bg-gradient-to-b from-white/[0.06] to-black/60 p-5 shadow-2xl shadow-black/60'
            : 'w-80 rounded-lg border border-[#EF5350]/40 bg-gradient-to-b from-white/[0.06] to-black/60 p-5 shadow-2xl shadow-black/60'
        }
      >
        <div
          className={
            isVictory
              ? 'text-[10px] uppercase tracking-[0.2em] text-[#7FD98A]'
              : 'text-[10px] uppercase tracking-[0.2em] text-[#EF5350]'
          }
        >
          {CAUSE_LABEL[gameOver.cause]}
        </div>
        <h1 className="mt-1 text-xl text-white/95">{CAUSE_HEADLINE[gameOver.cause]}</h1>
        <p className="mt-2 text-[11px] leading-snug text-white/50">
          {CAUSE_DETAIL[gameOver.cause]}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-white/45">Survived</dt>
            <dd className="font-mono text-sm tabular-nums text-white/95">{gameOver.sol} sols</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-white/45">Built</dt>
            <dd className="font-mono text-sm tabular-nums text-white/95">{buildingCount}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-white/45">Final</dt>
            <dd className="font-mono text-sm tabular-nums text-white/95">
              {survivalScore.toFixed(0)}%
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => restartColony(Math.floor(Date.now() % 100000))}
          className="mt-4 w-full rounded border border-[#4FC3F7]/40 bg-[#4FC3F7]/15 px-2 py-2 text-xs text-[#BEE7FA] hover:bg-[#4FC3F7]/25"
        >
          Start a new colony
        </button>
      </div>
    </div>
  );
}
