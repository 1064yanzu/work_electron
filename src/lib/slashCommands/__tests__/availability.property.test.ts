/**
 * Claude Code 风格斜杠命令 —— availability 前置条件属性测试（Property 4）。
 *
 * **Validates: Requirements R3.2, R3.6, R3.8, R4.6, R14.6**
 *
 * 断言：
 * - 无 sdkSessionId 时 /compact、/fork 必须 `disabled`；
 * - 无 recentResumableSessions 时 /resume 必须 `disabled`；
 * - 无 availableModels 时 /model 必须 `disabled`；
 * - disabled.reason 长度 ≤ 120。
 */

// polyfill（通过副作用 import 优先执行，让后续 builtin 模块初始化时有 localStorage）
import "./_setup";

import assert from "node:assert/strict";
import test from "node:test";

import { compactCommand, forkCommand, resumeCommand } from "../builtin/session";
import { modelCommand } from "../builtin/runtime";
import type {
	CommandContext,
	SlashCommandsSettingsSnapshot,
} from "../types";

function baseSettings(): SlashCommandsSettingsSnapshot {
	return {
		enabled: true,
		visibility: {},
		defaultColorThemeId: "default",
		customScanEnabled: true,
	};
}

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
	return {
		activeSession: null,
		sdkSessionId: null,
		recentResumableSessions: [],
		currentModel: null,
		availableModels: [],
		planModeEnabled: false,
		permissionMode: "default",
		workspacePath: null,
		hasGitRepo: false,
		rightSidebarVisible: false,
		currentColorThemeId: "default",
		settings: baseSettings(),
		invokeSelectModel: () => undefined,
		...overrides,
	};
}

function assertDisabled(avail: ReturnType<typeof compactCommand.availability>) {
	assert.equal(avail.state, "disabled");
	if (avail.state === "disabled") {
		assert.ok(avail.reason.length > 0);
		assert.ok(
			avail.reason.length <= 120,
			`reason 过长: ${avail.reason.length}`,
		);
	}
}

test("property 4.a: /compact 无 sdkSessionId 时 disabled", () => {
	const avail = compactCommand.availability(makeCtx({ sdkSessionId: null }));
	assertDisabled(avail);
});

test("property 4.b: /fork 无 sdkSessionId 时 disabled", () => {
	const avail = forkCommand.availability(makeCtx({ sdkSessionId: null }));
	assertDisabled(avail);
});

test("property 4.c: /resume 无历史会话时 disabled", () => {
	const avail = resumeCommand.availability(
		makeCtx({ recentResumableSessions: [] }),
	);
	assertDisabled(avail);
});

test("property 4.d: /model 无可用模型时 disabled", () => {
	const avail = modelCommand.availability(makeCtx({ availableModels: [] }));
	assertDisabled(avail);
});

test("property 4.e: /compact 与 /fork 有 sdkSessionId 时 available", () => {
	const sid = "00000000-0000-0000-0000-000000000001";
	assert.equal(
		compactCommand.availability(makeCtx({ sdkSessionId: sid })).state,
		"available",
	);
	assert.equal(
		forkCommand.availability(makeCtx({ sdkSessionId: sid })).state,
		"available",
	);
});
