// @number-island/narration: the build-time narration renderer (07 §3). See cli.ts for the commands.
export * from './audio';
export * from './config';
export * from './cost';
export * from './encode';
export * from './pipeline';
export * from './plan';
export { audioFromResponse, geminiRenderer, ttsRequestBody } from './providers/gemini';
export { kokoroRenderer } from './providers/kokoro';
export { stubRenderer } from './providers/stub';
export type { RenderContext, Renderer, TtsOutcome, TtsRequest } from './providers/types';
