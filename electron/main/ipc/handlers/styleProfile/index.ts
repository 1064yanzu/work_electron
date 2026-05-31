/**
 * styleProfile/index.ts — barrel export
 */
export { createStyleProfileCrudHandlers } from "./crud";
export { createStyleSampleHandlers } from "./samples";
export { createStyleAnalyzerHandlers } from "./analyzer";
export { createStyleAnalysisCrudHandlers } from "./analysisCrud";
export { createStyleRendererHandlers } from "./renderer";
export { createStyleFeedbackHandlers } from "./feedback";
export { getActiveStylePrompt } from "./styleProfileInjector";
