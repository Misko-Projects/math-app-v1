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
// - The island is the family's (05 §3; part 3, `shared/`): every child's avatar stands in the
//   corner, a building carries the badge of who placed it and a shared project the badges of who
//   gave to it, and a child whose placement lost its plots to a sibling's earlier one is told once.
// - Building (05 §6; part 2, `building/`): the Build button opens the recipe cards; a new building
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
  HomeButton,
  IconButton,
  IslandScene,
  icons,
  materialArtFor,
  Pebbling,
  PlacedBuilding,
  pebblingFromResident,
  plotBox,
  ReplayButton,
  Sheet,
  SpeechBubble,
  useNarrationText,
  useSpeech,
} from '@number-island/ui';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate } from 'react-router';
import { useAppServices } from '@/app/AppServices';
import { devFlag } from '@/app/devFlag';
import { recordDiagnostic } from '@/app/diagnostics';
import { ChildAvatar } from '@/app/picker/ChildAvatar';
import type { WindDownReason } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';
import { ensureGradePlacement } from '@/data/gradePlacement';
import { useInventory, useIsland, useProfiles } from '@/data/hooks';
import { HoldToOpen } from '@/parent/HoldToOpen';
import type { GateHeldState } from '@/parent/ParentGateScreen';
import { childContext } from '@/runner/childContext';
import { remediationQueue } from '@/runner/remediationQueue';
import { loadRunner, useRaise } from '@/runner/useRequestRunner';
import { workshopFor } from '@/workshops/registry';
import { HammerIcon, StoneChip } from './building/BuildIcons';
import { offeredPlots, PlotTargets, useSceneMap } from './building/PlotTargets';
import { useIslandBuild } from './building/useIslandBuild';
import { useDecorate } from './decorate/useDecorate';
import { firstProblem } from './firstProblem';
import { useHub } from './hub';
import { landBox, roomCrop, useIslandRoom } from './layout';
import {
  type IslandNameChoice,
  islandNames,
  markWelcomed,
  namedAs,
  nameIsland,
  welcomeDue,
} from './naming/names';
import {
  type IslandPlan,
  isRemediation,
  planIslandRequests,
  warmupDue,
  withWarmup,
} from './planRequests';
import { Storehouse } from './Storehouse';
import {
  BuildingBadges,
  displacedFor,
  displacedKeys,
  FamilyAvatars,
  familyMembers,
  makersOf,
  markDisplacedTold,
} from './shared/family';

const BuildSheet = lazy(() => import('./building/BuildSheet'));
// Decorate mode, the decor on the map and the naming step load when they are first needed.
const DecorTray = lazy(() => import('./decorate/DecorTray'));
const DecorDrag = lazy(() =>
  import('./decorate/DecorTray').then((m) => ({ default: m.DecorDrag })),
);
const DecorLayer = lazy(() => import('./decorate/DecorLayer'));
const NameSheet = lazy(() => import('./naming/NameSheet'));

/** The decorate button's picture: a flower in a pot. */
function FlowerIcon({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M24 26v12" stroke="#3f7d3a" strokeWidth={4} strokeLinecap="round" />
      <g fill="#e76f51" stroke="#243b53" strokeWidth={2}>
        <circle cx={24} cy={10} r={6} />
        <circle cx={15} cy={17} r={6} />
        <circle cx={33} cy={17} r={6} />
        <circle cx={19} cy={26} r={6} />
        <circle cx={29} cy={26} r={6} />
      </g>
      <circle cx={24} cy={19} r={5} fill="#e9c46a" stroke="#243b53" strokeWidth={2} />
      <path d="M14 36h20l-3 9H17Z" fill="#b5651d" stroke="#243b53" strokeWidth={2} />
    </svg>
  );
}

/** The island sign's picture: a flag on a pole. */
function FlagIcon({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path d="M14 6v38" stroke="#8a5a2b" strokeWidth={5} strokeLinecap="round" />
      <path
        d="M16 8h22l-6 8 6 8H16Z"
        fill="#2a9d8f"
        stroke="#243b53"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The usual height of a request card, in px: the least the request row's place is. */
const ROW_HEIGHT = 212;

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
  const profiles = useProfiles();
  const members = useMemo(() => familyMembers(profiles ?? []), [profiles]);
  const sessionId = session?.sessionId ?? '';
  const budgetMinutes = session?.budgetMinutes ?? 0;
  const { gameData, graph } = content.store;
  const [plan, setPlan] = useState<IslandPlan | null>(null);
  const requests = plan?.requests ?? null;
  const [storehouseOpen, setStorehouseOpen] = useState(false);
  const decorate = useDecorate(child);
  const [naming, setNaming] = useState<'closed' | 'open' | 'used'>('closed');
  // Counts the builds of this visit: the island plans again after each (a new workshop or a new
  // resident changes what the planner may use).
  const [builds, setBuilds] = useState(0);
  const build = useIslandBuild(
    child,
    useCallback(() => setBuilds((n) => n + 1), []),
  );
  const sceneBox = useRef<HTMLDivElement>(null);
  const home = useRef<HTMLDivElement>(null);

  // The island waits for a request that is still being written (the child just left it).
  const idle = hub.picked === null;
  const made = hub.result ? units(hub.result.materials) : [];
  const earned = hub.result?.decor ?? [];
  // What the island is busy with: choosing a plot, or a building going up.
  const busy = build.placing !== null || build.construction !== null;
  // The requests step aside for it, for the walk along the road, which they would cover, and
  // for decorate mode, whose tray stands in their place.
  const aside = busy || build.counting !== null || decorate.open;
  // The time outside workshops (05 §8) runs while the child is on the island.
  useEffect(() => {
    hub.nonMath.arrive(controller.activeMs());
    return () => hub.nonMath.leave(controller.activeMs());
  }, [hub.nonMath, controller]);
  // The island's name, said once to each child on this device ("Welcome to … Island!").
  const [welcome, setWelcome] = useState<IslandNameChoice | null | undefined>(undefined);
  useEffect(() => {
    if (island && welcome === undefined) setWelcome(welcomeDue(gameData, island, child.id));
  }, [island, welcome, child.id, gameData]);
  // This child's placements that lost their plots to an earlier one from another device (02
  // §4.3), read when the island is: said once, on this visit, and not again on this device.
  // The line stays while one of them is still displaced: built again, it gives way.
  const [displaced, setDisplaced] = useState<string[] | null>(null);
  useEffect(() => {
    if (island && displaced === null) setDisplaced(displacedFor(island, child.id));
  }, [island, displaced, child.id]);
  const line = build.placing
    ? 'ui.build.place'
    : build.construction
      ? 'ui.build.working'
      : decorate.open && decorate.ready
        ? decorate.selected
          ? 'ui.decor.place'
          : decorate.items.some((i) => i.pos === null)
            ? 'ui.decor.pick'
            : 'ui.decor.all'
        : decorate.capped
          ? 'ui.decor.closed'
          : island && displaced?.some((key) => displacedKeys(island, child.id).includes(key))
            ? 'ui.island.displaced'
            : made.length > 0
              ? 'ui.island.made'
              : welcome
                ? welcome.welcome
                : 'ui.island.hello';

  // The guide speaks once per visit: that a building has to be placed again, what the request
  // just made, the island's name, or the greeting. Back from a request that laid a road stone
  // (Road Crew), the island counts on to that stone instead, as it does for its own button.
  const greeted = useRef(false);
  const laid = hub.result?.road;
  const { countOn } = build;
  useEffect(() => {
    if (!idle || displaced === null || welcome === undefined || greeted.current) return;
    greeted.current = true;
    if (laid !== undefined) {
      // Nothing was said: a placement warning or a welcome is still owed on a later visit.
      countOn(laid);
      return;
    }
    say(line);
    if (displaced.length > 0) markDisplacedTold(displaced);
    if (welcome && line === welcome.welcome) markWelcomed(child.id, welcome);
  }, [idle, displaced, welcome, line, say, child.id, laid, countOn]);

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
      const ctx = childContext(child, await store.childSettings(child.id));
      // The starting level from the profile's grade, written before the first plan (04 §5).
      await ensureGradePlacement(engine, store, graph, ctx);
      const state = await store.skillStates(child.id);
      if (!state) throw new Error(`Island: no learner state for ${child.id}`);
      const remediation = remediationQueue.peek(child.id);
      const planned = planIslandRequests(engine, {
        child: ctx,
        state,
        graph,
        gameData,
        island: await store.island(),
        inventory: await store.inventory(),
        now: store.now(),
        minutes: Math.max(1, Math.ceil(budgetMinutes - controller.activeMs() / 60_000)),
        ...(remediation ? { remediation } : {}),
      });
      if (planned.requests.length === 0) throw new Error('Island: the plan holds nothing to play');
      // A queued remediation the plan could not offer is dropped, as before the island chose.
      if (remediation && !planned.requests.some(isRemediation)) remediationQueue.take(child.id);
      if (!alive) return;
      setPlan(planned);
      // Fetched ahead, so a tapped request never waits for its workshop (05 §2).
      void loadRunner().catch(() => {});
      for (const r of planned.requests)
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
    // The session's easy win comes first, whichever request the child picks (04 §6.1).
    const warmup = plan?.warmup ?? null;
    if (warmupDue(warmup, hub.warmedUp)) {
      hub.markWarmedUp();
      hub.pick(withWarmup(request, warmup));
    } else hub.pick(request);
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

  const islandName = namedAs(gameData, island?.name ?? null);
  const nameChoices = islandNames(gameData);
  const rings = island?.ringsUnlocked ?? 1;
  // The land is drawn in the room the controls leave (`layout.ts`): measured again when the
  // guide's line, the requests or the columns change.
  const [rowHeight, setRowHeight] = useState(ROW_HEIGHT);
  const layout = useIslandRoom(
    home,
    `${line}:${requests?.length ?? 0}:${aside}:${rowHeight}:${build.next?.n ?? 0}:${made.length}:${island?.name ?? ''}`,
  );
  const crop = useMemo(() => {
    const land = landBox(gameData.island, rings);
    // Before the screen is laid out (and in jsdom): the land, centred.
    const size = layout?.size ?? { w: 1280, h: 800 };
    const room = layout?.room ?? { left: 0, top: 0, right: size.w, bottom: size.h };
    return roomCrop(land, room, size, MIN_VIEW_W);
  }, [gameData.island, rings, layout]);
  const rowLow = layout?.rowFits ?? true;
  // The request row's place is as tall as the cards last shown (at least the usual card), so
  // the map does not move when the requests step aside or come back.
  const drawnRow = layout?.rowHeight ?? 0;
  useEffect(() => {
    if (drawnRow > 0) setRowHeight(Math.max(ROW_HEIGHT, Math.ceil(drawnRow)));
  }, [drawnRow]);
  // The low row is centred between the corners, the raised one on the screen.
  const rowInset = rowLow && layout ? layout.rowInset : { left: 0, right: 0 };
  // The road: the stones laid and, when one can be laid, the next one as its target. While a
  // plot is chosen the next stone steps aside, so its target takes no tap meant for a plot.
  const roadTo = build.next && !busy && !decorate.open ? build.next.n : (island?.roadLength ?? 0);
  const road = useMemo(
    () => gameData.island.road.filter((s) => s.n <= roadTo),
    [gameData.island.road, roadTo],
  );
  const sceneMap = useSceneMap(sceneBox, crop);
  // The buttons that lie over the map while a plot is chosen (the corners, the guide's replay,
  // the way back), as boxes inside the scene, measured after they are laid out: the way back
  // only mounts with the placement, so it cannot be read while that render is computed.
  const [controls, setControls] = useState<
    { left: number; top: number; right: number; bottom: number }[]
  >([]);
  // What is being put on the map: a new building, or the piece of decor in hand.
  const placing = useMemo(
    () =>
      build.placing
        ? {
            id: build.placing.building.id,
            anchors: build.placing.anchors,
            footprint: build.placing.building.footprint,
          }
        : decorate.open && decorate.selected
          ? {
              id: decorate.selected.instanceId,
              anchors: decorate.anchors,
              footprint: decorate.selected.def.footprint,
            }
          : null,
    [build.placing, decorate.open, decorate.selected, decorate.anchors],
  );
  const placingId = placing?.id ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again when the map is (a resize)
  useLayoutEffect(() => {
    const scene = sceneBox.current;
    const home = scene?.closest('[data-testid="child-home"]');
    if (placingId === null || !scene || !home) return;
    const box = scene.getBoundingClientRect();
    setControls(
      Array.from(home.querySelectorAll('button'))
        .filter((b) => !b.closest('[data-testid="plot-targets"]') && !b.closest('dialog'))
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width > 0)
        .map((r) => ({
          left: r.left - box.left,
          top: r.top - box.top,
          right: r.right - box.left,
          bottom: r.bottom - box.top,
        })),
    );
  }, [placingId, sceneMap]);
  const targets = useMemo(
    () =>
      placing
        ? offeredPlots(
            placing.anchors,
            placing.footprint,
            sceneMap,
            // A point under another button of this screen takes no plot.
            (left, top) =>
              controls.some(
                (r) => left >= r.left && left <= r.right && top >= r.top && top <= r.bottom,
              ),
          )
        : [],
    [placing, sceneMap, controls],
  );
  const plotMarkers = useMemo(
    () => (placing ? targets.map((t) => ({ plot: t.plot, footprint: placing.footprint })) : []),
    [placing, targets],
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
    <div
      ref={home}
      className="relative h-dvh min-h-[600px] w-full overflow-hidden"
      data-testid="child-home"
    >
      <main className="absolute inset-0">
        {/* The next stone's tap target is art (`data-hit="next"`); its accessible control is the
            road button under the Storehouse. */}
        <div
          ref={sceneBox}
          // Its own stacking layer: what lies over the map (plot buttons, the drag layer of
          // decorate mode) stays under every control of the screen, the parent gate included.
          className="absolute inset-0 isolate overflow-hidden"
          onPointerUp={(e) => {
            if (idle && (e.target as Element).closest?.('[data-hit="next"]')) build.layStone();
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
            {decorate.items.some((i) => i.pos !== null) ? (
              <Suspense fallback={null}>
                <DecorLayer
                  items={decorate.items}
                  selected={decorate.open ? (decorate.selected?.instanceId ?? null) : null}
                />
              </Suspense>
            ) : null}
          </IslandScene>
          {island ? (
            <BuildingBadges
              map={sceneMap}
              members={members}
              gameData={gameData}
              island={island}
              buildings={buildings}
            />
          ) : null}
          {decorate.open ? (
            <Suspense fallback={null}>
              <DecorDrag
                map={sceneMap}
                items={decorate.items}
                selected={decorate.selected}
                anchors={decorate.anchors}
                onSelect={decorate.select}
                onDrop={decorate.place}
              />
            </Suspense>
          ) : null}
          {placing ? (
            <PlotTargets targets={targets} onPick={build.placing ? build.place : decorate.place} />
          ) : null}
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
        {/* The top row: Home (back to "Who is playing?"), who is playing, and the guide's line
            with its speaker, in the room left of the right column. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-10 flex items-start gap-4 pr-[calc(max(1rem,env(safe-area-inset-right))+7.5rem)] pl-[max(1rem,env(safe-area-inset-left))] *:pointer-events-auto"
          data-room="top"
        >
          <div className="flex shrink-0 items-center gap-4">
            <HomeButton onPress={() => void goHome()} />
            <div className="flex items-center gap-3 rounded-pill bg-paper/90 py-2 pr-6 pl-2 shadow-soft ring-4 ring-sand-deep">
              <ChildAvatar
                name={child.name}
                avatar={child.avatar}
                index={index}
                className="size-16"
              />
              <span className="flex max-w-[12rem] flex-col font-body text-[1.5rem] leading-tight text-ink">
                <span className="truncate font-bold">{child.name}</span>
                {islandName ? (
                  <span className="truncate" data-testid="island-name">
                    {text(islandName.say)}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
          <div
            className="flex min-w-0 flex-1 items-center justify-center gap-4"
            data-testid="island-line"
          >
            <SpeechBubble say={line} tail="none" showText />
            {/* A long line wraps in its bubble; the speaker keeps its size beside it. */}
            <span className="flex shrink-0">
              <ReplayButton onPress={() => say(line)} />
            </span>
          </div>
        </div>
        {/* The left column: Decorate, and the island's sign while the island has no name. */}
        <div
          className="absolute top-[8.5rem] left-[max(1rem,env(safe-area-inset-left))] z-10 flex flex-col items-start gap-3"
          data-room="left"
        >
          <IconButton
            label="ui.decor.open"
            icon={<FlowerIcon size={56} />}
            tone="cloud"
            disabled={busy || build.counting !== null}
            pressed={decorate.open}
            onPress={decorate.open ? decorate.done : decorate.start}
            data={{ 'data-testid': 'decor-open', 'data-capped': String(decorate.capped) }}
          />
          {island && island.name === null && nameChoices.length > 0 ? (
            <IconButton
              label="ui.island.name.open"
              icon={<FlagIcon size={56} />}
              tone="cloud"
              disabled={aside}
              onPress={() => setNaming('open')}
              data={{ 'data-testid': 'name-open' }}
            />
          ) : null}
          {devFlag() && (
            <Link
              to={`/play/${child.id}/pier?browse`}
              className="rounded-pill bg-paper/90 px-4 py-2 font-body text-[1rem] text-ink underline"
            >
              Content browser (dev)
            </Link>
          )}
        </div>
        {/* Top right: the Storehouse, and what the last request brought to it. */}
        <div
          className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10 flex flex-col items-end gap-3"
          data-room="right"
        >
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
            // Nothing is bought while a request is still being written: what it made, and the
            // road stone its workshop may be laying, are not all in the Storehouse yet.
            disabled={busy || decorate.open || !build.ready || !idle}
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
              disabled={busy || decorate.open || !idle}
              onPress={build.layStone}
              data={{
                'data-testid': 'road-next',
                'data-stone': String(build.next.n),
                'data-affordable': String(build.hasStone),
              }}
            />
          ) : null}
          {made.length + earned.length > 0 && !aside ? (
            <div
              className="flex max-w-[15rem] flex-wrap items-center justify-end gap-1 rounded-[20px] bg-paper/95 px-3 py-2 shadow-soft ring-4 ring-sunshine"
              role="img"
              aria-label={text('ui.island.made')}
              data-testid="arrived"
              data-count={made.length}
              data-decor={earned.join(' ')}
            >
              {made.map((id, i) => picture(id, i, 40))}
              {/* A piece of decor earned: it waits in decorate mode's tray. */}
              {earned.map((id, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the same decor can be earned twice
                <FlowerIcon key={`${id}-${i}`} size={40} />
              ))}
            </div>
          ) : null}
        </div>
        {/* The request row's place, kept while the requests step aside, so the map stays where
            it is: at the very bottom between the avatars and the parent gate, or above them
            where it does not fit there (portrait). */}
        <div
          className={`pointer-events-none absolute inset-x-0 ${
            rowLow
              ? 'bottom-[max(1rem,env(safe-area-inset-bottom))]'
              : 'bottom-[calc(max(1rem,env(safe-area-inset-bottom))+5rem)]'
          }`}
          style={{ height: rowHeight }}
          data-room="bottom"
          data-row={rowLow ? 'low' : 'raised'}
        />
        {/* Decorate mode's tray stands in the request row's place. */}
        {decorate.used && decorate.open ? (
          <div
            className={`absolute z-20 ${
              rowLow
                ? 'bottom-[max(1rem,env(safe-area-inset-bottom))]'
                : 'bottom-[calc(max(1rem,env(safe-area-inset-bottom))+5rem)] px-4'
            }`}
            style={{ ...rowInset, height: rowHeight }}
          >
            <Suspense fallback={null}>
              <DecorTray
                items={decorate.items}
                selected={decorate.selected}
                width={(layout?.size.w ?? 1280) - (rowLow ? rowInset.left + rowInset.right : 32)}
                onSelect={decorate.select}
                onPutAway={decorate.putAway}
                onDone={decorate.done}
              />
            </Suspense>
          </div>
        ) : null}
        {/* The requests: a bubble over each resident, the recommended one first. They lie above
            the parent gate's hint, which opens over this row on a narrow screen: a request and
            its speaker stay whole targets while the hint shows. */}
        {busy ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+5rem)] z-30 flex justify-center *:pointer-events-auto">
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
            className={`pointer-events-none absolute z-20 flex items-end justify-center gap-4 ${
              rowLow
                ? 'bottom-[max(1rem,env(safe-area-inset-bottom))]'
                : 'bottom-[calc(max(1rem,env(safe-area-inset-bottom))+5rem)] px-4'
            }`}
            style={rowInset}
            aria-label={text('ui.island.requests')}
            // The map ends above the cards as tall as they are: a request with many pictures
            // has two rows of them and is taller than the row's kept place.
            data-room="bottom"
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
        {/* Bottom left: the children of this island, clear of the requests. */}
        <div
          className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-10"
          data-room="corner"
        >
          <FamilyAvatars members={members} playing={child.id} />
        </div>
      </main>
      <footer
        className="absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))]"
        data-room="corner"
      >
        <HoldToOpen
          onOpen={() =>
            navigate('/parent', { state: { gateHeldAt: Date.now() } satisfies GateHeldState })
          }
        />
      </footer>
      {/* Loaded when it is first opened, and kept: closing returns the focus as any sheet does. */}
      {naming !== 'closed' ? (
        <Suspense fallback={null}>
          <NameSheet
            choices={nameChoices}
            open={naming === 'open'}
            onClose={() => setNaming('used')}
            onName={(name) => {
              setNaming('used');
              // The first child names it: a name that came meanwhile from a sibling stands.
              nameIsland(store, child.id, name).then((result) => {
                if (result !== 'ok') return;
                markWelcomed(child.id, name);
                audio.stop();
                say(name.welcome);
              }, raise);
            }}
          />
        </Suspense>
      ) : null}
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
            makers={makersOf(members, inventory)}
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
