/**
 * Design 模块 barrel — 主进程内部消费入口
 */

export {
	BUILTIN_DESIGN_DIRECTIONS,
	getDirection,
	renderDirectionSpec,
	type DesignDirection,
} from "./directions";

export {
	getDesignLibraryRoot,
	getDesignBuiltinSkillsRoot,
	getDesignTemplatesRoot,
	getDesignFramesRoot,
} from "./resourcePaths";

export {
	ensureDesignsRoot,
	getDesignsRoot,
	getSessionDir,
	createSessionDir,
	deleteSessionDir,
	listSessionFiles,
	getMainArtifactPath,
	copySessionDirTo,
} from "./designsDir";

export {
	DISCOVERY_FORM_SCHEMA,
	renderDiscoveryAnswers,
	inferModeFromAnswers,
	type DiscoveryFormSchema,
	type DiscoveryField,
	type DiscoveryFieldOption,
	type DiscoveryFieldType,
	type DiscoveryAnswers,
} from "./discoveryForm";

export { composeDesignSystemPrompt } from "./systemPromptBuilder";

export {
	exportHtmlInline,
	exportHtmlProject,
	exportPdf,
	exportScreenshots,
	exportZip,
	exportMarkdown,
	type DesignExportFormat,
	type DesignBreakpoint,
	type ExportOptions,
	type ExportContext,
	type ExportResult,
} from "./exportEngine";

export {
	scanDesignSystems,
	getDesignSystem,
	type DesignSystemSummary,
} from "./systemRegistry";

export { runCritique, type CritiqueResult } from "./criticEngine";

export {
	bootstrapDesignBuiltinSkills,
	listBuiltinSkills,
	getTemplateHtml,
	BUILTIN_DESIGN_SKILLS_SOURCE_ID,
} from "./builtinSkillsBootstrap";

export {
	listSkillSummaries,
	getSkillResourceMap,
	getFrameSource,
	type DesignSkillSummary,
	type DesignSkillResourceMap,
	type DesignSkillTweak,
} from "./skillsRegistry";
