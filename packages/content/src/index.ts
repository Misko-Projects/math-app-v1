// @number-island/content: the YAML → dist compiler and its compiler checks (03 §9).
// Runtime consumers read `packages/content/dist/*.json` (fetched, never bundled; 02 §6). The
// engine and tools may import the helpers below; nothing here imports the engine (02 §2).

export {
  autoLesson,
  type CompiledContent,
  type CompiledGraph,
  type CompileResult,
  type ContentManifest,
  compileContent,
  DIST_FILES,
  deriveWi,
  type StandardsIndex,
} from './compile/compile';
export {
  type Expr,
  ExprError,
  evaluate as evaluateConstraint,
  identifiers as constraintIdentifiers,
  parseExpr as parseConstraint,
} from './compile/expr';
export type { ContentFiles } from './compile/load';
export { lineClips, parseLine, SLOT_TYPES, type Slot, type SlotType } from './compile/narration';
export {
  type CheckId,
  COMPILER_CHECKS,
  type Diagnostic,
  formatDiagnostic,
  type Severity,
} from './diagnostics';
export {
  DISTRACTOR_FORMATS,
  FORMAT_SUPPORT,
  type FormatSupport,
  formatRendersRepresentation,
} from './formats';
export { SITUATION_FAMILIES, type StoryContext } from './schema/source';
export { validateContent } from './validate';
