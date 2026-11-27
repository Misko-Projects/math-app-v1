import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

const GuideContext = createContext<string | null | undefined>(undefined);

/** The playing child's guide (`ChildProfile.guide`), for every screen under the child's route. */
export function GuideProvider({
  guide,
  children,
}: {
  guide: string | null | undefined;
  children: ReactNode;
}) {
  return <GuideContext.Provider value={guide}>{children}</GuideContext.Provider>;
}

/** The playing child's guide id; undefined outside a child's route (draws the first guide). */
export function useGuide(): string | null | undefined {
  return useContext(GuideContext);
}
