/**
 * Agent SDK 的权限决策层。
 *
 * 从 `agentSdk.ts` 的 `agent_sdk_start` 单体闭包里外提出来的两块内容：
 *
 * 1. `resolvePermissionMode()` —— run 级的 permissionMode 决策；
 * 2. `createCanUseTool()` —— 每次工具调用前的 `canUseTool` 回调全部逻辑。
 *
 * ## canUseTool 到底在做什么
 *
 * 它名字叫"能不能用"，实际承担了四类职责，理解这点才能安全改它：
 *
 * - **闸门**：abort 后拒绝、显式 allowedTools 之外拒绝、内置 WebSearch 拒绝。
 * - **入参纠错**（占了大半代码）：非 Claude 模型经常生成空字符串可选参数、
 *   丢 `file_path`、给相对路径。这些如果原样交给 SDK 会变成一次
 *   `<tool_use_error>`，agent 通常会原地重试同一个错误调用。在这里修掉，
 *   把"模型输出质量"问题挡在工具执行之前。
 * - **人机交互**：`AskUserQuestion` 转发到前端弹卡。
 * - **红线拦截**：Bash 危险命令转成同一套弹卡（见 `dangerousCommands.ts`）。
 *
 * 默认策略仍是放行 —— 与 `permissionMode: bypassPermissions` 保持一致。
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
	AgentSdkInteractionRequestPayload,
	GetMainWindow,
} from "./eventTransformer";
import { emit } from "./eventTransformer";
import {
	guessDefaultReadableFilePath,
	resolveToolFilePathEx,
	rewritePathsDeep,
} from "./fileResolver";
import type { InteractionDecision } from "./interactionBroker";
import { interactionBroker } from "./interactionBroker";
import { mergeUpdatedToolInput } from "./modelSettingsLoader";
import { LOCAL_WEB_SEARCH_MCP_TOOL } from "./localWebSearchMcp";
import {
	buildMissingRequiredToolParamsMessage,
	getMissingRequiredToolParams,
	hasRequiredToolParamValue,
	shouldPreserveEmptyStringParam,
} from "./toolValidation";
import { detectDangerousBashCommand } from "./dangerousCommands";
import { safeJsonPreview } from "./safeJson";

/** 审批弹卡的等待上限：贴合人类操作节奏，不是网络超时。 */
const INTERACTION_TIMEOUT_MS = 5 * 60_000;

/**
 * 决定这次 run 的 permissionMode。
 *
 * 默认 `bypassPermissions`：等价于 `claude --dangerously-skip-permissions`，
 * SDK 内部不再对 Read/Write/Edit/Bash 逐条弹询问。caller 可显式覆盖（如 plan 模式）。
 * delegate 模式只在多代理运行时且非 plan 模式下生效。
 */
export function resolvePermissionMode(options: {
	requested: unknown;
	useDelegateMode: boolean;
}): { permissionMode: string; permissionModeForRun: string } {
	const permissionMode =
		typeof options.requested === "string" && options.requested.trim()
			? options.requested.trim()
			: "bypassPermissions";
	const permissionModeForRun =
		options.useDelegateMode && permissionMode !== "plan"
			? "delegate"
			: permissionMode;
	return { permissionMode, permissionModeForRun };
}

export interface CanUseToolDeps {
	runId: string;
	cwd: string;
	abortController: AbortController;
	getMainWindow: GetMainWindow;
	/** 把一行诊断信息回灌到 stderr 事件流（前端"运行日志"可见）。 */
	stderr: (data: string) => void;
	/** caller 是否显式给了 allowed_tools 数组（决定是否做工具白名单裁剪）。 */
	hasExplicitAllowedTools: boolean;
	allowedToolsForRun: string[];
	/**
	 * PreToolUse 钩子缓存的原始工具入参。
	 * SDK hooks 当前整体停用（见 agentSdk.ts 内的说明），这张表实际为空，
	 * 保留是为了 hooks 恢复后 Bash `command` 丢失的兜底路径能立刻生效。
	 */
	preToolInputByToolUseId: Map<string, Record<string, unknown>>;
}

type CanUseToolResult =
	| { behavior: "allow"; updatedInput: unknown; updatedPermissions?: unknown }
	| { behavior: "deny"; message: string; interrupt?: boolean };

/**
 * 走一次前端审批弹卡，返回用户的决定。
 *
 * `AskUserQuestion` 与危险命令拦截共用这条通道：前端已有的交互卡组件
 * 按 `toolName` 渲染，不需要为拦截场景另做一套 UI。
 */
async function requestUserDecision(
	deps: CanUseToolDeps,
	params: {
		toolName: string;
		toolInput: Record<string, unknown>;
		toolUseId: string;
		agentId?: string;
		description?: string;
		decisionReason?: string;
		blockedPath?: string;
		suggestions?: unknown[];
		scope?: AgentSdkInteractionRequestPayload["scope"];
	},
): Promise<InteractionDecision> {
	const requestId = randomUUID();
	const request: AgentSdkInteractionRequestPayload = {
		requestId,
		toolName: params.toolName,
		toolInput: params.toolInput,
		toolUseId: params.toolUseId,
		agentId: params.agentId,
		description: params.description,
		decisionReason: params.decisionReason,
		blockedPath: params.blockedPath,
		suggestions: params.suggestions,
		scope: params.scope,
		expiresAt: Date.now() + INTERACTION_TIMEOUT_MS,
	};
	emit(deps.getMainWindow, {
		runId: deps.runId,
		type: "interaction_request",
		request,
	});
	return await interactionBroker.createRequest(
		deps.runId,
		requestId,
		INTERACTION_TIMEOUT_MS,
	);
}

export function createCanUseTool(deps: CanUseToolDeps) {
	const {
		cwd,
		abortController,
		stderr,
		hasExplicitAllowedTools,
		allowedToolsForRun,
		preToolInputByToolUseId,
	} = deps;

	return async (
		toolName: string,
		toolInput: any,
		extra: any,
	): Promise<CanUseToolResult> => {
		console.log(
			`[canUseTool] Tool='${toolName}', AgentID='${(extra as any)?.agentID || "main"}', Input=${safeJsonPreview(toolInput || {}, 200)}`,
		);
		if (abortController.signal.aborted || extra?.signal?.aborted) {
			return { behavior: "deny", message: "aborted" };
		}

		const isLocalWebSearchTool =
			toolName === LOCAL_WEB_SEARCH_MCP_TOOL || toolName === "web_search";
		if (
			hasExplicitAllowedTools &&
			!isLocalWebSearchTool &&
			!allowedToolsForRun.includes(toolName)
		) {
			return { behavior: "deny", message: `Tool disabled: ${toolName}` };
		}

		let rewrittenInput: Record<string, unknown> =
			toolInput && typeof toolInput === "object"
				? { ...(toolInput as Record<string, unknown>) }
				: {};
		const toolLower = String(toolName || "").toLowerCase();
		if (toolLower === "websearch") {
			return {
				behavior: "deny",
				message: `内置 WebSearch 在当前供应商下会返回伪搜索文本，请改用 ${LOCAL_WEB_SEARCH_MCP_TOOL} 获取真实搜索结果。`,
			};
		}

		const currentToolUseId =
			typeof extra?.toolUseID === "string"
				? String(extra.toolUseID).trim()
				: "";
		const preToolInput =
			currentToolUseId && preToolInputByToolUseId.has(currentToolUseId)
				? preToolInputByToolUseId.get(currentToolUseId)
				: undefined;
		if (
			toolLower === "bash" &&
			typeof rewrittenInput.command !== "string" &&
			preToolInput &&
			typeof preToolInput.command === "string" &&
			preToolInput.command.trim()
		) {
			rewrittenInput = {
				...preToolInput,
				...rewrittenInput,
				command: preToolInput.command,
			};
			stderr(
				`[agent_sdk] Restored missing Bash command from PreToolUse cache (toolUseId=${currentToolUseId})`,
			);
		}

		// 通用清洗：移除空字符串参数（如 pages: ""、pattern: "" 等）。
		// 非 Claude 模型经常为可选参数生成空字符串，导致 SDK 内部校验失败。
		{
			const keysToRemove: string[] = [];
			for (const [k, v] of Object.entries(rewrittenInput)) {
				if (v === "") {
					if (shouldPreserveEmptyStringParam(toolName, k)) continue;
					keysToRemove.push(k);
				}
			}
			if (keysToRemove.length > 0) {
				for (const k of keysToRemove) delete rewrittenInput[k];
				stderr(
					`[canUseTool] Stripped empty params from ${toolName}: ${keysToRemove.join(", ")}`,
				);
			}
		}

		// Read 缺 file_path 时，自动猜一个 cwd 下可读的文件
		if (
			toolLower === "read" &&
			!hasRequiredToolParamValue(rewrittenInput, {
				name: "file_path",
				aliases: ["path", "file"],
			})
		) {
			const guessed = await guessDefaultReadableFilePath(cwd);
			if (guessed) {
				stderr(
					`[agent_sdk] Auto-filled Read file_path='${guessed}' (missing in tool input)`,
				);
				rewrittenInput = { ...rewrittenInput, file_path: guessed };
			}
		}

		const missingRequired = getMissingRequiredToolParams(
			toolName,
			rewrittenInput,
		);
		if (missingRequired.length > 0) {
			const message = buildMissingRequiredToolParamsMessage(
				toolName,
				missingRequired,
			);
			stderr(`[canUseTool] Denied invalid ${toolName}: ${message}`);
			return { behavior: "deny", message };
		}

		// 文件工具相对路径 → 绝对路径解析（仅纠错，不再做沙盒围栏）。
		// 与 Claude Code CLI 一致：把权限决策交给 permissionMode (bypassPermissions)
		// 与 OS 文件权限，主进程不再做路径黑名单。
		if (
			(toolLower === "read" ||
				toolLower === "glob" ||
				toolLower === "grep" ||
				toolLower === "write" ||
				toolLower === "edit") &&
			toolInput &&
			typeof toolInput === "object"
		) {
			const inputAny = rewrittenInput as Record<string, unknown>;
			const key =
				typeof inputAny.file_path === "string"
					? "file_path"
					: typeof inputAny.path === "string"
						? "path"
						: typeof inputAny.file === "string"
							? "file"
							: null;
			if (key) {
				const rawPath = String(inputAny[key] || "").trim();
				if (rawPath) {
					const resolved = await resolveToolFilePathEx({
						cwd,
						rawPath,
						allowGlobal: true,
					});
					if (resolved && resolved.path !== rawPath) {
						stderr(
							`[agent_sdk] Resolved ${toolName} path '${rawPath}' -> '${resolved.path}'`,
						);
						rewrittenInput = {
							...inputAny,
							[key]: resolved.path,
							file_path: resolved.path,
						};
					} else if (
						!resolved &&
						(toolLower === "write" || toolLower === "edit") &&
						!path.isAbsolute(rawPath)
					) {
						// 写操作的目标不存在是正常情况（新建文件）：
						// 把相对路径补成绝对路径，让 SDK 自然处理。
						const absRaw = path.join(cwd, rawPath);
						rewrittenInput = {
							...inputAny,
							[key]: absRaw,
							file_path: absRaw,
						};
					}
				}
			}
		}

		// Skill 工具路径重写
		if (
			toolLower === "skill" &&
			rewrittenInput &&
			typeof rewrittenInput === "object"
		) {
			const rewritten = await rewritePathsDeep({ cwd, value: rewrittenInput });
			if (rewritten !== rewrittenInput) {
				stderr("[agent_sdk] Auto-rewrote Skill input paths within cwd");
				rewrittenInput = rewritten as Record<string, unknown>;
			}
		}

		// Bash 红线：只拦"跑了没法回退"的模式，其余一律放行。
		// 命中后不 deny，而是让用户在弹卡上拍板——模型确实可能有正当理由，
		// 直接拒绝会让 agent 陷入"反复重试同一条被拒命令"的死循环。
		if (toolLower === "bash") {
			const danger = detectDangerousBashCommand(rewrittenInput.command);
			if (danger) {
				const commandText = String(rewrittenInput.command ?? "");
				stderr(
					`[canUseTool] Dangerous Bash pattern '${danger.rule}' detected, escalating to user approval: ${commandText.slice(0, 300)}`,
				);
				const decision = await requestUserDecision(deps, {
					toolName: "Bash",
					toolInput: rewrittenInput,
					toolUseId: currentToolUseId,
					agentId:
						typeof extra?.agentID === "string" ? extra.agentID : undefined,
					description: `高风险命令需要确认：${commandText.slice(0, 200)}`,
					decisionReason: danger.reason,
					scope: {
						insideSandbox: false,
						destructiveLevel: "dangerous",
						reason: danger.reason,
					},
				});
				if (decision.behavior !== "allow") {
					return {
						behavior: "deny",
						message:
							decision.message ||
							`用户拒绝执行该高风险命令（${danger.rule}）。请换一种不具破坏性的做法。`,
						interrupt: decision.interrupt,
					};
				}
				return {
					behavior: "allow",
					updatedInput: mergeUpdatedToolInput(
						rewrittenInput,
						decision.updatedInput,
					),
					updatedPermissions: Array.isArray(decision.updatedPermissions)
						? decision.updatedPermissions
						: undefined,
				};
			}
		}

		// AskUserQuestion — 始终转发到前端弹卡。
		if (toolName === "AskUserQuestion") {
			if (typeof extra?.agentID === "string" && extra.agentID.trim()) {
				stderr(
					`[agent_sdk] AskUserQuestion triggered inside subagent agentID='${extra.agentID}', forwarding to UI`,
				);
			}
			const decision = await requestUserDecision(deps, {
				toolName,
				toolInput: rewrittenInput,
				toolUseId: typeof extra?.toolUseID === "string" ? extra.toolUseID : "",
				agentId: typeof extra?.agentID === "string" ? extra.agentID : undefined,
				description:
					typeof extra?.description === "string"
						? extra.description
						: undefined,
				decisionReason:
					typeof extra?.decisionReason === "string"
						? extra.decisionReason
						: undefined,
				blockedPath:
					typeof extra?.blockedPath === "string"
						? extra.blockedPath
						: undefined,
				suggestions: Array.isArray(extra?.suggestions)
					? extra.suggestions
					: undefined,
			});
			if (decision.behavior === "allow") {
				return {
					behavior: "allow",
					updatedInput: mergeUpdatedToolInput(
						rewrittenInput,
						decision.updatedInput,
					),
					updatedPermissions: Array.isArray(decision.updatedPermissions)
						? decision.updatedPermissions
						: undefined,
				};
			}
			return {
				behavior: "deny",
				message: decision.message || "User denied AskUserQuestion",
				interrupt: decision.interrupt,
			};
		}

		// 其余工具：默认放行（与 permissionMode=bypassPermissions 行为一致）。
		return { behavior: "allow", updatedInput: rewrittenInput };
	};
}
