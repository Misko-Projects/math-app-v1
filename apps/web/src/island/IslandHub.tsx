// The island, the child's home while a session runs (05 §2–§3, 06 §2; #22 part 1).
//
// - The map is the kit's island scene drawn from `foldIsland`: the land that is open, the stones
//   already laid and the buildings that stand. It is still: no camera, day lighting.
// - Requests (04 §6.3): the planner's requests as speech bubbles over their residents. A bubble
//   shows what the request makes (its material, once per unit); the speaker under it says the
//   resident's line and the material's name. The first request is the recommended one and pulses.
//   A tap on a bubble goes straight into its workshop (05 §2: the first problem within 10 s).
// - Back from a request, what it made is shown beside the Storehouse, where it already is
//   (`material.produced`), and the island plans again, so the next bubbles reflect what was just
//   played (02 §5.4).
// - The Storehouse button opens the family's piles (`Storehouse`).
// - Building (05 §6; part 2, `build/`): the Build button opens the recipe cards; a new building
//   then asks for one of the highlighted plots, and a build or an upgrade plays its construction
//   step (skippable). While a plot is chosen or a building goes up, the requests step aside.
// - The Numbered Road (05 §3): the next stone waits at the road's end. A tap on it (or on its
//   button) lays it for one stone from the Storehouse, and the walk counts on to it aloud.
//
// Wind-down (04 §6.4, 05 §8): no item is ever in progress here, so the session ends at once with
// the signal's reason and the sunset plays; one that came during a request plays on return.

import type { ChildProfile, PlannedRequest, Recipe } from '@number-island/shared';
import {
  BigButton,
  BuildingArtView,
  buildingArtFor,
  HORIZON_Y,
  HomeButton,
  IconButton,
  IslandScene,
  icons,
  landCrop,
  materialArtFor,
  Pebbling,
  PlacedBuilding,
  pebblingFromResident,
  plotBox,
  ReplayButton,
  SCENE_H,
  SCENE_W,
  Sheet,
  SpeechBubble,
  useNarrationText,
  useSpeech,
} from '@number-island/ui';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAppServices } from '@/app/AppServices';
import { devFlag } from '@/app/devFlag';
import { recordDiagnostic } from '@/app/diagnostics';
import { ChildAvatar } from '@/app/picker/ChildAvatar';
import type { WindDownReason } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';
import { useInventory, useIsland } from '@/data/hooks';
import { HoldToOpen } from '@/parent/HoldToOpen';
import type { GateHeldState } from '@/parent/ParentGateScreen';
import { childContext } from '@/runner/childContext';
import { remediationQueue } from '@/runner/remediationQueue';
import { loadRunner, useRaise } from '@/runner/useRequestRunner';
import { workshopFor } from '@/workshops/registry';
import { HammerIcon, StoneChip } from './build/BuildIcons';
import { offeredPlots, PlotTargets, useSceneMap } from './build/PlotTargets';
import { useIslandBuild } from './build/useIslandBuild';
import { firstProblem } from './firstProblem';
import { useHub } from './hub';
import { isRemediation, planIslandRequests } from './planRequests';
import { Storehouse } from './Storehouse';

const BuildSheet = lazy(() => import('./build/BuildSheet'));

/** The narrowest view of the map, in scene units: the sandbar fills the screen on day one. */
const MIN_VIEW_W = 800;

const units = (recipe: Recipe) =>
  Object.entries(recipe).flatMap(([id, n]) => Array.from({ length: n ?? 0 }, () => id));

export function IslandHub({
  child,
  index,
  onWindDown,
}: {
  child: ChildProfile;
  index: number;
  onWindDown: (reason: WindDownReason) => void;
}) {
  const { say } = useSpeech();
  const text = useNarrationText();
  const navigate = useNavigate();
  const raise = useRaise();
  const { store, content, audio } = useAppServices();
  const { session, controller, windDown } = useSession();
  const hub = useHub();
  const island = useIsland();
  const inventory = useInventory();
  const sessionId = session?.sessionId ?? '';
  const budgetMinutes = session?.budgetMinutes ?? 0;
  const { gameData, graph } = content.store;
  const [requests, setRequests] = useState<PlannedRequest[] | null>(null);
  const [storehouseOpen, setStorehouseOpen] = useState(false);
  // Counts the builds of this visit: the island plans again after each (a new workshop or a new
  // resident changes what the planner may use).
  const [builds, setBuilds] = useState(0);
  const build = useIslandBuild(
    child,
    useCallback(() => setBuilds((n) => n + 1), []),
  );
  const sceneBox = useRef<HTMLDivElement>(null);

  // The island waits for a request that is still being written (the child just left it).
  const idle = hub.picked === null;
  const made = hub.result ? units(hub.result.materials) : [];
  // What the island is busy with: choosing a plot, or a building going up.
  const busy = build.placing !== null || build.construction !== null;
  // The requests step aside for it, and for the walk along the road, which they would cover.
  const aside = busy || build.counting !== null;
  const line = build.placing
    ? 'ui.build.place'
    : build.construction
      ? 'ui.build.working'
      : made.length > 0
        ? 'ui.island.made'
        : 'ui.island.hello';

  // The guide speaks once per visit: the greeting, or what the request just made.
  const greeted = useRef(false);
  useEffect(() => {
    if (!idle || greeted.current) return;
    greeted.current = true;
    say(line);
  }, [idle, line, say]);

  // The wind-down hook: no item is ever in progress here, so end now and show the sunset.
  useEffect(
    () =>
      controller.onWindDown((reason, s) => {
        if (s.sessionId !== sessionId) return;
        onWindDown(reason);
        void controller.end(reason).catch((e) => recordDiagnostic('session.end', e));
      }),
    [controller, sessionId, onWindDown],
  );
  // The signal fires once. When it came while the child was in a workshop (which lets the
  // current item finish, 04 §6.4), the session is already winding down when this page returns.
  const pendingWindDown = useRef(windDown);
  useEffect(() => {
    const reason = pendingWindDown.current;
    if (reason === null || sessionId === '') return;
    pendingWindDown.current = null;
    onWindDown(reason);
    void controller.end(reason).catch((e) => recordDiagnostic('session.end', e));
  }, [controller, sessionId, onWindDown]);

  // The plan: when the island opens, and again after each request (`planKey` changes).
  const planKey = `${hub.result?.requestId ?? ''}:${builds}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: planKey re-plans after a request or a build
  useEffect(() => {
    if (!idle || sessionId === '') return;
    let alive = true;
    (async () => {
      const engine = await import('@number-island/engine');
      const state = await store.skillStates(child.id);
      if (!state) throw new Error(`Island: no learner state for ${child.id}`);
      const remediation = remediationQueue.peek(child.id);
      const planned = planIslandRequests(engine, {
        child: childContext(child, await store.childSettings(child.id)),
        state,
        graph,
        gameData,
        island: await store.island(),
        now: store.now(),
        minutes: Math.max(1, Math.ceil(budgetMinutes - controller.activeMs() / 60_000)),
        ...(remediation ? { remediation } : {}),
      });
      if (planned.length === 0) throw new Error('Island: the plan holds nothing to play');
      // A queued remediation the plan could not offer is dropped, as before the island chose.
      if (remediation && !planned.some(isRemediation)) remediationQueue.take(child.id);
      if (!alive) return;
      setRequests(planned);
      // Fetched ahead, so a tapped request never waits for its workshop (05 §2).
      void loadRunner().catch(() => {});
      for (const r of planned)
        void workshopFor(r.workshopId)
          .load()
          .catch(() => {});
    })().catch(raise);
    return () => {
      alive = false;
    };
  }, [idle, planKey, sessionId, budgetMinutes, child, store, graph, gameData, controller, raise]);

  const pick = (request: PlannedRequest) => {
    if (hub.picked) return;
    firstProblem.tapped();
    audio.stop();
    if (isRemediation(request)) remediationQueue.take(child.id);
    hub.pick(request);
    navigate(`/play/${child.id}/workshop/${request.workshopId}`);
  };

  const materialOf = (id: string) => gameData.materials.find((m) => m.id === id);
  const hear = (request: PlannedRequest) => {
    const names = Object.keys(request.reward.materials).flatMap((id) => materialOf(id)?.name ?? []);
    // One line, said now: it replaces what is being said (phrases would otherwise wait their
    // turn), and whatever is said next (another speaker, a button's name) replaces all of it.
    audio.cancelSpeech();
    void audio
      .sayPhrases([{ id: request.narration }, ...names.map((id) => ({ id }))])
      .catch(() => {});
  };

  const goHome = async () => {
    try {
      await controller.end('child-exit');
    } catch (e) {
      recordDiagnostic('session.end', e);
    }
    navigate('/', { replace: true });
  };

  const rings = island?.ringsUnlocked ?? 1;
  const crop = useMemo(() => {
    const land = landCrop(gameData.island, rings);
    const w = Math.max(land.w, MIN_VIEW_W);
    const h = w / (SCENE_W / SCENE_H);
    return {
      x: land.x + land.w / 2 - w / 2,
      y: Math.max(HORIZON_Y, land.y + land.h / 2 - h / 2),
      w,
      h,
    };
  }, [gameData.island, rings]);
  // The road: the stones laid and, when one can be laid, the next one as its target. While a
  // plot is chosen the next stone steps aside, so its target takes no tap meant for a plot.
  const roadTo = build.next && !busy ? build.next.n : (island?.roadLength ?? 0);
  const road = useMemo(
    () => gameData.island.road.filter((s) => s.n <= roadTo),
    [gameData.island.road, roadTo],
  );
  const sceneMap = useSceneMap(sceneBox, crop);
  const targets = useMemo(
    () =>
      build.placing
        ? offeredPlots(build.placing.anchors, build.placing.building.footprint, sceneMap)
        : [],
    [build.placing, sceneMap],
  );
  const plotMarkers = useMemo(
    () =>
      build.placing
        ? targets.map((t) => ({ plot: t.plot, footprint: build.placing?.building.footprint }))
        : [],
    [build.placing, targets],
  );
  // Where the building going up stands, in CSS px, for the construction step's picture.
  const site = (() => {
    if (!build.construction || !sceneMap) return null;
    const b = plotBox(build.construction.plot, build.construction.footprint);
    return sceneMap.point(b.x + b.w / 2, b.y);
  })();
  const buildings = Object.entries(island?.buildings ?? {})
    .map(([instanceId, b]) => ({
      instanceId,
      ...b,
      art: gameData.buildings.find((d) => d.id === b.buildingId)?.art,
    }))
    .sort((a, b) => a.plot[1] - b.plot[1] || a.plot[0] - b.plot[0]);

  const picture = (id: string, key: string | number, size: number) => {
    const Icon = materialArtFor(materialOf(id)?.art ?? '');
    return Icon ? <Icon key={key} size={size} /> : null;
  };

  return (
    <div className="relative h-dvh min-h-[600px] w-full overflow-hidden" data-testid="child-home">
      <main className="absolute inset-0">
        {/* The next stone's tap target is art (`data-hit="next"`); its accessible control is the
            road button under the Storehouse. */}
        <div
          ref={sceneBox}
          className="absolute inset-0 overflow-hidden"
          onPointerUp={(e) => {
            if ((e.target as Element).closest?.('[data-hit="next"]')) build.layStone();
          }}
        >
          <IslandScene
            className="absolute inset-0 size-full"
            fit="fill"
            island={{ rings: gameData.island.rings, road }}
            ringsUnlocked={rings}
            roadLength={island?.roadLength ?? 0}
            counting={build.counting}
            plotMarkers={plotMarkers}
            crop={crop}
            title="The island, seen from above, in a calm sea."
          >
            {buildings.map((b) => {
              const id = b.art?.replace(/^building\//, '');
              return b.art && buildingArtFor(b.art) && id ? (
                <PlacedBuilding
                  key={b.instanceId}
                  id={id as Parameters<typeof PlacedBuilding>[0]['id']}
                  plot={b.plot}
                  stage={b.level}
                />
              ) : null;
            })}
          </IslandScene>
          {build.placing ? <PlotTargets targets={targets} onPick={build.place} /> : null}
          {build.construction ? (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
              style={site ?? { left: '50%', top: '50%' }}
              data-testid="construction"
              data-instance={build.construction.instanceId}
            >
              <span
                className="motion-loop flex size-20 items-center justify-center rounded-full bg-paper/95 shadow-soft ring-4 ring-sunshine"
                style={{ animation: 'var(--animate-pulse-soft)' }}
              >
                <HammerIcon size={56} />
              </span>
            </div>
          ) : null}
        </div>
        {/* Top left: Home (back to "Who is playing?") and who is playing. */}
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] z-10 flex items-center gap-4">
          <HomeButton onPress={() => void goHome()} />
          <div className="flex items-center gap-3 rounded-pill bg-paper/90 py-2 pr-6 pl-2 shadow-soft ring-4 ring-sand-deep">
            <ChildAvatar
              name={child.name}
              avatar={child.avatar}
              index={index}
              className="size-16"
            />
            <span className="max-w-[12rem] truncate font-body text-[1.5rem] font-bold text-ink">
              {child.name}
            </span>
          </div>
        </div>
        {/* Top right: the Storehouse, and what the last request brought to it. */}
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10 flex flex-col items-end gap-3">
          <IconButton
            label="game.building.storehouse"
            icon={<BuildingArtView id="storehouse" stage={1} size={64} />}
            tone="cloud"
            onPress={() => setStorehouseOpen(true)}
            data={{ 'data-testid': 'storehouse-open' }}
          />
          <IconButton
            label="ui.build.open"
            icon={<HammerIcon size={56} />}
            tone="cloud"
            disabled={busy || !build.ready}
            onPress={build.openSheet}
            data={{ 'data-testid': 'build-open' }}
          />
          {build.next ? (
            <IconButton
              label="ui.road.next"
              icon={
                // Wider than the button's icon box, and centred on it.
                <span className="flex" style={{ flex: 'none', margin: -10 }}>
                  <StoneChip n={build.next.n} />
                </span>
              }
              tone="cloud"
              disabled={busy}
              onPress={build.layStone}
              data={{
                'data-testid': 'road-next',
                'data-stone': String(build.next.n),
                'data-affordable': String(build.hasStone),
              }}
            />
          ) : null}
          {made.length > 0 && !aside ? (
            <div
              className="flex max-w-[15rem] flex-wrap items-center justify-end gap-1 rounded-[20px] bg-paper/95 px-3 py-2 shadow-soft ring-4 ring-sunshine"
              role="img"
              aria-label={text('ui.island.made')}
              data-testid="arrived"
              data-count={made.length}
            >
              {made.map((id, i) => picture(id, i, 40))}
            </div>
          ) : null}
        </div>
        <div className="pointer-events-none relative flex items-center justify-center gap-5 px-4 pt-[calc(max(1rem,env(safe-area-inset-top))+6.25rem)] *:pointer-events-auto">
          <SpeechBubble say={line} tail="none" showText />
          <ReplayButton onPress={() => say(line)} />
        </div>
        {/* The requests: a bubble over each resident, the recommended one first. They lie above
            the parent gate's hint, which opens over this row on a narrow screen: a request and
            its speaker stay whole targets while the hint shows. */}
        {busy ? (
          <div className="absolute inset-x-0 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+5rem)] z-30 flex justify-center">
            {build.placing ? (
              <BigButton
                label="ui.btn.close"
                icon={<icons.CloseIcon />}
                tone="cloud"
                onPress={build.cancelPlacing}
              />
            ) : (
              <BigButton
                label="ui.build.skip"
                icon={<icons.ArrowIcon />}
                tone="cloud"
                onPress={build.skipConstruction}
              />
            )}
          </div>
        ) : null}
        {requests && !aside ? (
          <ul
            className="absolute inset-x-0 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+5rem)] pointer-events-none z-20 flex items-end justify-center gap-6 px-4"
            aria-label={text('ui.island.requests')}
            data-testid="requests"
          >
            {requests.map((request, i) => {
              const resident = gameData.residents.find((r) => r.id === request.residentId);
              const made = units(request.reward.materials);
              const names = Object.keys(request.reward.materials).flatMap((id) => {
                const m = materialOf(id);
                return m ? text(m.name) : [];
              });
              const label = [
                ...(resident ? [resident.name] : []),
                text(request.narration, request.vars),
                ...names,
              ].join(' ');
              return (
                <li key={request.id} className="pointer-events-auto relative">
                  <button
                    type="button"
                    className="flex min-w-[13.5rem] cursor-pointer flex-col items-start gap-5 rounded-[28px] p-1 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    aria-label={label}
                    data-request={request.id}
                    data-recommended={i === 0 ? 'true' : undefined}
                    onClick={() => pick(request)}
                  >
                    <SpeechBubble recommended={i === 0} tail="bottom">
                      <span className="flex min-h-[48px] max-w-[13rem] flex-wrap items-center justify-center gap-1">
                        {made.length > 0 ? (
                          made.map((id, n) => picture(id, n, 44))
                        ) : (
                          <icons.CrateIcon width={48} height={48} />
                        )}
                      </span>
                    </SpeechBubble>
                    {resident ? (
                      <Pebbling
                        {...pebblingFromResident(resident)}
                        pose={i === 0 ? 'wave' : 'idle'}
                        size={112}
                      />
                    ) : null}
                  </button>
                  {/* Beside the resident, in the card's free corner. */}
                  <span className="absolute right-0 bottom-0">
                    <ReplayButton caption={false} onPress={() => hear(request)} />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {devFlag() && (
          <Link
            to={`/play/${child.id}/pier?browse`}
            className="absolute bottom-4 left-4 rounded-pill bg-paper/90 px-4 py-2 font-body text-[1rem] text-ink underline"
          >
            Content browser (dev)
          </Link>
        )}
      </main>
      <footer className="absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))]">
        <HoldToOpen
          onOpen={() =>
            navigate('/parent', { state: { gateHeldAt: Date.now() } satisfies GateHeldState })
          }
        />
      </footer>
      {/* Loaded when it is first opened, and kept: closing returns the focus as any sheet does. */}
      {build.sheetUsed ? (
        <Suspense fallback={null}>
          <BuildSheet
            open={build.sheetOpen}
            onClose={build.closeSheet}
            cards={build.cards}
            gameData={gameData}
            mode={child.grade === 'K' ? 'ten-frames' : 'base-ten'}
            onBuy={build.buy}
          />
        </Suspense>
      ) : null}
      <Sheet
        open={storehouseOpen}
        onClose={() => setStorehouseOpen(false)}
        label="game.building.storehouse"
        placement="center"
      >
        {inventory ? (
          <Storehouse
            gameData={gameData}
            inventory={inventory}
            mode={child.grade === 'K' ? 'ten-frames' : 'base-ten'}
            empty={
              <div className="flex items-center gap-5">
                <SpeechBubble say="ui.island.empty" tail="none" showText />
              </div>
            }
          />
        ) : null}
      </Sheet>
    </div>
  );
}
