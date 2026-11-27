// Practice Pier (05 §4): the plain workshop that hosts every format. One request, played item by
// item through the TaskRunner the app passes in (02 §5.6) on the screen every workshop shares
// (`../play/RequestPlay`): the island's request arrives through the workshop host
// (`PierWorkshop`), the dev content browser's through `/play/:childId/pier`.
//
// `?browse` with the dev flag (`localStorage['ni.dev'] = '1'`) opens the content browser instead:
// pick any skill and play one item of each of its templates.

import type { ChildProfile, PlannedRequest } from '@number-island/shared';
import { HomeButton } from '@number-island/ui';
import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { ChildUi, useAppServices } from '@/app/AppServices';
import { devFlag } from '@/app/devFlag';
import type { ActiveSession } from '@/app/session/SessionController';
import { useSession } from '@/app/session/SessionProvider';
import { useProfiles } from '@/data/hooks';
import { useRequestRunner } from '@/runner/useRequestRunner';
import { PlayFrame } from '../play/PlayScreen';
import { RequestPlay } from '../play/RequestPlay';
import {
  type BrowsePick,
  browseRequest,
  browseSkills,
  pierLesson,
  pierMisfit,
  pierPlayable,
} from './pierRequest';

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function PierPage() {
  const { childId = '' } = useParams();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const profiles = useProfiles();
  const { session } = useSession();
  const [browsing, setBrowsing] = useState<BrowsePick | null>(null);
  if (profiles === undefined) return null;
  const child = profiles.find((p) => sameId(p.id, childId));
  // Only a started session plays here, like the child home.
  if (!child || session === null || !sameId(session.childId, childId)) {
    return <Navigate to="/" replace />;
  }
  const home = () => navigate(`/play/${child.id}`, { replace: true });
  // The island's requests come through the workshop host; this page is the dev content browser.
  if (!query.has('browse') || !devFlag()) return <Navigate to={`/play/${child.id}`} replace />;
  return (
    <ChildUi ageMode={child.grade === 'K' ? 'k' : 'g1-up'} guide={child.guide}>
      {browsing === null ? (
        <ContentBrowser onPick={setBrowsing} onLeave={home} />
      ) : (
        <BrowsedRequest
          key={`${browsing.skillId}:${browsing.templateId}:${browsing.lesson === true}`}
          child={child}
          session={session}
          pick={browsing}
          onLeave={() => setBrowsing(null)}
        />
      )}
    </ChildUi>
  );
}

/** The content browser's pick as a request, with its own runner. */
function BrowsedRequest({
  child,
  session,
  pick,
  onLeave,
}: {
  child: ChildProfile;
  session: ActiveSession;
  pick: BrowsePick;
  onLeave: () => void;
}) {
  const { store, content } = useAppServices();
  // One request per mount: the seeds come from the clock once.
  const [request] = useState<PlannedRequest>(() =>
    browseRequest(content.store.graph, pick, store.now() % 1_000_000),
  );
  const runner = useRequestRunner(child, session, request);
  return runner && <RequestPlay runner={runner} onLeave={onLeave} />;
}

/** The dev content browser: every skill with templates. A skill plays one item of each of its templates; a template chip plays that template alone. */
function ContentBrowser({
  onPick,
  onLeave,
}: {
  onPick: (pick: BrowsePick) => void;
  onLeave: () => void;
}) {
  const { content } = useAppServices();
  const graph = content.store.graph;
  const skills = useMemo(() => browseSkills(graph), [graph]);
  const [filter, setFilter] = useState('');
  const shown = skills.filter((s) =>
    `${s.skillId} ${graph.skills[s.skillId]?.name ?? ''} ${s.templates.map((t) => t.format).join(' ')}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  const chip =
    'min-h-11 rounded-pill border-[3px] border-sand-deep bg-paper px-3 font-body text-[1rem] text-ink disabled:opacity-60';
  return (
    <PlayFrame
      testId="pier-browser"
      top={
        <>
          <HomeButton onPress={onLeave} />
          <h1 className="font-display text-[1.75rem] font-bold text-ink">Content browser (dev)</h1>
          <label className="ml-auto flex items-center gap-3 font-body text-[1.125rem] text-ink">
            Find
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-12 w-64 rounded-pill border-[3px] border-sand-deep bg-paper px-4"
            />
          </label>
        </>
      }
    >
      <ul className="grid content-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(22rem,1fr))]">
        {shown.map((s) => (
          <li
            key={s.skillId}
            className="flex flex-col gap-2 rounded-card border-[3px] border-sand-deep bg-paper/60 p-3"
          >
            <button
              type="button"
              disabled={!s.templates.some(pierPlayable)}
              onClick={() => onPick({ skillId: s.skillId, templateId: null })}
              className="min-h-11 text-left font-body text-[1.125rem] font-bold text-ink underline disabled:no-underline disabled:opacity-60"
            >
              {s.skillId} {graph.skills[s.skillId]?.name}
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`${chip} font-bold`}
                disabled={!pierLesson(graph, s.skillId)}
                title={pierLesson(graph, s.skillId) ? undefined : 'no lesson the pier can show'}
                onClick={() => onPick({ skillId: s.skillId, templateId: null, lesson: true })}
              >
                Lesson ({graph.skills[s.skillId]?.lesson.mode})
              </button>
              {s.templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={chip}
                  disabled={!pierPlayable(t)}
                  title={pierMisfit(t) ?? undefined}
                  onClick={() => onPick({ skillId: s.skillId, templateId: t.id })}
                >
                  {t.id.slice(s.skillId.length + 1)} {t.format} ({t.tier})
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </PlayFrame>
  );
}
