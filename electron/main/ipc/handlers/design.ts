/**
 * Design 模块 IPC handler
 *
 * 设计上「后端不直接启动 Agent SDK」——design_submit_discovery 只负责：
 *   1. 创建工作目录 + 写 design_sessions 行
 *   2. 拼 system prompt（identity + anti-slop + answers + direction + mode + critique）
 *   3. 返回 launch_payload 给渲染端
 *
 * 渲染端拿到 launch_payload 后紧接着 invoke("agent_sdk_start", launch_payload) 启动；
 * SDK 运行完后再回调 design_finalize_session 把主交付物入库为 output_asset。
 *
 * 这样：不依赖跨 handler 内部 invoke，不破坏现有 agent_sdk_start 的事件流契约。
 */

import { randomUUID } from "node:crypto";
import path from "node:path";
import { app, dialog, type IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type {
	DesignSession,
	DesignExportTarget,
	OutputAsset,
} from "../../../shared/types";
import type { DbContext } from "../../db/client";
import {
	BUILTIN_DESIGN_DIRECTIONS,
	DISCOVERY_FORM_SCHEMA,
	composeDesignSystemPrompt,
	copySessionDirTo,
	createSessionDir,
	deleteSessionDir,
	exportHtmlInline,
	exportHtmlProject,
	exportMarkdown,
	exportPdf,
	exportScreenshots,
	exportZip,
	getMainArtifactPath,
	getTemplateHtml,
	inferModeFromAnswers,
	listBuiltinSkills,
	listSessionFiles,
	listSkillSummaries,
	getSkillResourceMap,
	runCritique,
	scanDesignSystems,
} from "../../design";
import { extractBrand, writeBrandSpec } from "../../design/brandExtract";
import {
	listMediaProviders,
	runMediaJob,
	listMediaHistory,
	ensureMediaSchema,
} from "../../design/media";
import { runRegistry } from "./agentSdk/runRegistry";

const MODE_TO_SKILLS: Record<string, string[]> = {
	"web-prototype": ["ipo-web-prototype", "ipo-design-review"],
	"mobile-mockup": ["ipo-mobile-mockup", "ipo-design-review"],
	"pitch-deck": ["ipo-pitch-deck", "ipo-design-review"],
	poster: ["ipo-poster", "ipo-design-review"],
};

function resolveSkillsForMode(
	mode: string | undefined,
	override?: string[],
): string[] {
	if (Array.isArray(override) && override.length > 0) return override;
	if (!mode) return ["ipo-web-prototype", "ipo-design-review"];
	return MODE_TO_SKILLS[mode] ?? ["ipo-web-prototype", "ipo-design-review"];
}
import { syncOutputToVault } from "../../storage/sync";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function parseJson<T>(value: unknown, fallback: T): T {
	if (typeof value !== "string" || !value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

function rowToSession(row: Record<string, unknown>): DesignSession {
	return {
		id: String(row.id ?? ""),
		title: String(row.title ?? "未命名设计"),
		status: String(row.status ?? "draft") as DesignSession["status"],
		work_dir: String(row.work_dir ?? ""),
		discovery_answers: parseJson(row.discovery_answers, undefined as never),
		direction_id: (row.direction_id as string | null) ?? undefined,
		system_id: (row.system_id as string | null) ?? undefined,
		mode: (row.mode as string | null) ?? undefined,
		brand_spec: parseJson(row.brand_spec, undefined as never),
		critique_scores: parseJson(row.critique_scores, undefined as never),
		output_asset_id: (row.output_asset_id as string | null) ?? undefined,
		sdk_session_id: (row.sdk_session_id as string | null) ?? undefined,
		last_export: parseJson(row.last_export, undefined as never),
		created_at: Number(row.created_at ?? Date.now()),
		updated_at: Number(row.updated_at ?? Date.now()),
	};
}

async function loadSession(db: DbContext, id: string): Promise<DesignSession | null> {
	const r = await db.client.execute({
		sql: "SELECT * FROM design_sessions WHERE id = ?",
		args: [id],
	});
	if (r.rows.length === 0) return null;
	return rowToSession(r.rows[0] as Record<string, unknown>);
}

async function loadOutputAsset(db: DbContext, id: string | undefined | null): Promise<OutputAsset | undefined> {
	if (!id) return undefined;
	const r = await db.client.execute({
		sql: "SELECT * FROM output_assets WHERE id = ?",
		args: [id],
	});
	if (r.rows.length === 0) return undefined;
	const row = r.rows[0] as Record<string, unknown>;
	let related_notes: string[] = [];
	try {
		related_notes = JSON.parse((row.related_notes as string) || "[]");
	} catch {
		related_notes = [];
	}
	return {
		id: row.id as string,
		title: row.title as string,
		content: row.content as string,
		output_type: row.output_type as OutputAsset["output_type"],
		related_notes,
		scope: (row.scope as OutputAsset["scope"]) || "global",
		tags: (() => {
			try {
				return JSON.parse((row.tags as string) || "[]");
			} catch {
				return [];
			}
		})(),
		storage_path: (row.storage_path as string | undefined) ?? undefined,
		is_deleted: Number(row.is_deleted ?? 0) === 1,
		project_id: (row.project_id as string | undefined) ?? undefined,
		version: (row.version as number) || 1,
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
	};
}

async function resolveExportTargetDir(
	target: DesignExportTarget,
): Promise<{ dir: string; label: string; kind: string }> {
	switch (target.kind) {
		case "path": {
			if (!target.path) throw new Error("缺少导出路径");
			return { dir: target.path, label: target.path, kind: "path" };
		}
		case "current-thread": {
			if (!target.thread_path) {
				throw new Error("当前线程不可用，请先在 Threads 选一个线程");
			}
			const dir = path.join(target.thread_path, "designs");
			return { dir, label: dir, kind: "current-thread" };
		}
		case "thread": {
			if (!target.thread_path) throw new Error("缺少线程路径");
			const dir = path.join(target.thread_path, "designs");
			return { dir, label: dir, kind: "thread" };
		}
		case "folder": {
			if (!target.folder_path) throw new Error("缺少文件夹路径");
			return { dir: target.folder_path, label: target.folder_path, kind: "folder" };
		}
		case "save-dialog": {
			const result = await dialog.showOpenDialog({
				title: "选择导出目标文件夹",
				defaultPath: app.getPath("desktop"),
				properties: ["openDirectory", "createDirectory"],
			});
			if (result.canceled || result.filePaths.length === 0) {
				throw new Error("已取消导出");
			}
			return {
				dir: result.filePaths[0],
				label: result.filePaths[0],
				kind: "save-dialog",
			};
		}
		default:
			throw new Error(`不支持的导出目标：${(target as { kind?: string }).kind}`);
	}
}

export function createDesignHandlers(db: DbContext) {
	const now = () => Date.now();

	const list_directions: Handler<"design_list_directions"> = async () => {
		return BUILTIN_DESIGN_DIRECTIONS;
	};

	const list_sessions: Handler<"design_list_sessions"> = async (_event, input) => {
		const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
		const offset = Math.max(input?.offset ?? 0, 0);
		const r = await db.client.execute({
			sql: "SELECT * FROM design_sessions ORDER BY updated_at DESC LIMIT ? OFFSET ?",
			args: [limit, offset],
		});
		return r.rows.map((row) => rowToSession(row as Record<string, unknown>));
	};

	const get_discovery_form: Handler<"design_get_discovery_form"> = async () => {
		return DISCOVERY_FORM_SCHEMA;
	};

	const start_session: Handler<"design_start_session"> = async (_event, input) => {
		const id = randomUUID();
		const title = (input?.title?.trim() || "未命名设计").slice(0, 80);
		const workDir = await createSessionDir(id);
		const ts = now();
		await db.client.execute({
			sql: `INSERT INTO design_sessions (id, title, status, work_dir, discovery_answers, direction_id, system_id, mode, brand_spec, critique_scores, output_asset_id, sdk_session_id, last_export, created_at, updated_at)
			      VALUES (?, ?, 'draft', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
			args: [id, title, workDir, ts, ts],
		});
		return {
			session_id: id,
			work_dir: workDir,
			discovery_form: DISCOVERY_FORM_SCHEMA,
		};
	};

	const submit_discovery: Handler<"design_submit_discovery"> = async (_event, input) => {
		const session = await loadSession(db, input.session_id);
		if (!session) throw new Error(`Design session not found: ${input.session_id}`);

		const mode = input.mode || inferModeFromAnswers(input.answers);
		const directionId =
			input.direction_id || (typeof input.answers?.tone === "string" ? String(input.answers.tone) : "modern-minimal");
		const systemId = input.system_id;

		const systemPrompt = await composeDesignSystemPrompt({
			answers: input.answers,
			directionId,
			systemId,
			mode,
		});

		const ts = now();
		await db.client.execute({
			sql: `UPDATE design_sessions SET
				discovery_answers = ?,
				direction_id = ?,
				system_id = ?,
				mode = ?,
				status = 'running',
				updated_at = ?
				WHERE id = ?`,
			args: [
				JSON.stringify(input.answers ?? {}),
				directionId ?? null,
				systemId ?? null,
				mode,
				ts,
				input.session_id,
			],
		});

		const launchPrompt =
			"请按上述发现答卷与方向规格开始生成设计稿。最终输出 `index.html`，必要时写入 `./assets/`。完成后给出 5 维自检报告。";

		const skills = resolveSkillsForMode(mode, input.skills);

		return {
			session_id: input.session_id,
			launch_payload: {
				prompt: launchPrompt,
				model: input.model,
				cwd: session.work_dir,
				system_prompt: systemPrompt,
				skills,
				permission_mode: "acceptEdits",
				allowed_tools: undefined,
			},
		};
	};

	const get_session: Handler<"design_get_session"> = async (_event, input) => {
		const session = await loadSession(db, input.session_id);
		if (!session) throw new Error(`Design session not found: ${input.session_id}`);

		const output_asset = await loadOutputAsset(db, session.output_asset_id);
		let files: string[] = [];
		try {
			const entries = await listSessionFiles(session.id);
			files = entries.filter((e) => !e.is_dir).map((e) => e.relative);
		} catch {
			files = [];
		}
		return { ...session, output_asset, files };
	};

	const update_session: Handler<"design_update_session"> = async (_event, input) => {
		const existing = await loadSession(db, input.session_id);
		if (!existing) throw new Error(`Design session not found: ${input.session_id}`);

		const fields: string[] = [];
		const args: (string | number | null)[] = [];

		if (input.title !== undefined) {
			fields.push("title = ?");
			args.push(input.title.slice(0, 200));
		}
		if (input.status !== undefined) {
			fields.push("status = ?");
			args.push(input.status);
		}
		if (input.sdk_session_id !== undefined) {
			fields.push("sdk_session_id = ?");
			args.push(input.sdk_session_id ?? null);
		}
		if (input.critique_scores !== undefined) {
			fields.push("critique_scores = ?");
			args.push(JSON.stringify(input.critique_scores ?? null));
		}
		if (input.brand_spec !== undefined) {
			fields.push("brand_spec = ?");
			args.push(JSON.stringify(input.brand_spec ?? null));
		}
		if (input.last_export !== undefined) {
			fields.push("last_export = ?");
			args.push(JSON.stringify(input.last_export ?? null));
		}
		if (fields.length === 0) {
			return await loadSession(db, input.session_id)!.then((s) => s!);
		}
		fields.push("updated_at = ?");
		args.push(Date.now());
		args.push(input.session_id);
		await db.client.execute({
			sql: `UPDATE design_sessions SET ${fields.join(", ")} WHERE id = ?`,
			args,
		});
		const session = await loadSession(db, input.session_id);
		if (!session) throw new Error("Update failed");
		return session;
	};

	const finalize_session: Handler<"design_finalize_session"> = async (_event, input) => {
		const session = await loadSession(db, input.session_id);
		if (!session) throw new Error(`Design session not found: ${input.session_id}`);

		const mainPath = await getMainArtifactPath(session.id);
		if (!mainPath) {
			throw new Error("当前会话工作目录里没有 HTML 文件，无法收纳为输出资产");
		}

		const fs = await import("node:fs/promises");
		let htmlContent = "";
		try {
			htmlContent = await fs.readFile(mainPath, "utf-8");
		} catch {
			htmlContent = "";
		}

		// 限制单行入库 5MB，否则只存摘要 + storage_path
		const MAX_INLINE = 5 * 1024 * 1024;
		const content =
			htmlContent.length > MAX_INLINE
				? htmlContent.slice(0, 2000) + `\n<!-- truncated; full file at ${mainPath} -->`
				: htmlContent;

		const ts = Date.now();
		const outputId = session.output_asset_id || randomUUID();

		if (session.output_asset_id) {
			await db.client.execute({
				sql: `UPDATE output_assets SET title = ?, content = ?, storage_path = ?, version = version + 1, updated_at = ? WHERE id = ?`,
				args: [session.title, content, mainPath, ts, outputId],
			});
		} else {
			await db.client.execute({
				sql: `INSERT INTO output_assets (id, title, content, output_type, scope, tags, related_notes, storage_path, project_id, version, created_at, updated_at)
				      VALUES (?, ?, ?, 'design', 'global', '[]', '[]', ?, NULL, 1, ?, ?)`,
				args: [outputId, session.title, content, mainPath, ts, ts],
			});
		}

		await syncOutputToVault(db, outputId);

		await db.client.execute({
			sql: `UPDATE design_sessions SET output_asset_id = ?, status = 'done', sdk_session_id = COALESCE(?, sdk_session_id), updated_at = ? WHERE id = ?`,
			args: [outputId, input.sdk_session_id ?? null, ts, session.id],
		});

		const updated = await loadSession(db, session.id);
		const output_asset = await loadOutputAsset(db, outputId);
		return { ...(updated as DesignSession), output_asset };
	};

	const delete_session: Handler<"design_delete_session"> = async (_event, input) => {
		const session = await loadSession(db, input.session_id);
		if (!session) return { success: true };

		if (input.delete_output && session.output_asset_id) {
			await db.client.execute({
				sql: `UPDATE output_assets SET is_deleted = 1, updated_at = ? WHERE id = ?`,
				args: [Date.now(), session.output_asset_id],
			});
		}
		if (input.delete_work_dir !== false) {
			await deleteSessionDir(session.id);
		}
		await db.client.execute({
			sql: "DELETE FROM design_sessions WHERE id = ?",
			args: [session.id],
		});
		return { success: true };
	};

	const reveal_work_dir: Handler<"design_reveal_work_dir"> = async (_event, input) => {
		const session = await loadSession(db, input.session_id);
		if (!session) throw new Error(`Design session not found: ${input.session_id}`);
		const { shell } = await import("electron");
		shell.openPath(session.work_dir);
		return { success: true };
	};

	const list_export_targets: Handler<"design_list_export_targets"> = async (_event, input) => {
		return {
			current_thread: input?.current_thread_path
				? {
						id: input.current_thread_id ?? "",
						title: input.current_thread_title ?? "当前线程",
						path: input.current_thread_path,
					}
				: undefined,
			recent_threads: input?.recent_threads ?? [],
			recent_folders: input?.recent_folders ?? [],
		};
	};

	const export_session: Handler<"design_export"> = async (_event, input) => {
		const session = await loadSession(db, input.session_id);
		if (!session) throw new Error(`Design session not found: ${input.session_id}`);

		const ctx = {
			session_id: session.id,
			session_title: session.title,
			mode: session.mode ?? undefined,
			direction_id: session.direction_id ?? undefined,
			system_id: session.system_id ?? undefined,
			discovery_answers: session.discovery_answers,
			critique_scores: session.critique_scores,
		};

		const targetResolved = await resolveExportTargetDir(input.target);

		let result: { paths: string[] };
		switch (input.format) {
			case "html-inline":
				result = await exportHtmlInline(ctx, targetResolved.dir);
				break;
			case "html-project":
				result = await exportHtmlProject(ctx, targetResolved.dir, input.options);
				break;
			case "pdf":
				result = await exportPdf(ctx, targetResolved.dir, input.options);
				break;
			case "screenshots":
				result = await exportScreenshots(ctx, targetResolved.dir, input.options);
				break;
			case "zip":
				result = await exportZip(ctx, targetResolved.dir, input.options);
				break;
			case "markdown":
				result = await exportMarkdown(ctx, targetResolved.dir);
				break;
			default:
				throw new Error(`不支持的导出格式：${input.format}`);
		}

		const ts = Date.now();
		const lastExport = {
			format: input.format,
			target_kind: targetResolved.kind,
			target_label: targetResolved.label,
			paths: result.paths,
			timestamp: ts,
		};
		await db.client.execute({
			sql: `UPDATE design_sessions SET last_export = ?, updated_at = ? WHERE id = ?`,
			args: [JSON.stringify(lastExport), ts, session.id],
		});

		return {
			paths: result.paths,
			target_kind: targetResolved.kind,
			target_label: targetResolved.label,
		};
	};

	const finish_to_thread: Handler<"design_finish_to_thread"> = async (_event, input) => {
		const session = await loadSession(db, input.session_id);
		if (!session) throw new Error(`Design session not found: ${input.session_id}`);

		const threadPath = input.thread_path;
		if (!threadPath) {
			throw new Error("未指定线程目录；请先在 Threads 选一个线程或新建线程");
		}

		const subfolderName = (input.subfolder_name?.trim() || session.title || "design")
			.replace(/[\\/:*?"<>|]/g, "-")
			.slice(0, 80);
		const designsDir = path.join(threadPath, "designs", subfolderName);
		await copySessionDirTo(session.id, designsDir);

		const ts = Date.now();
		const lastExport = {
			format: "html-project",
			target_kind: "current-thread",
			target_label: designsDir,
			paths: [designsDir],
			timestamp: ts,
		};
		await db.client.execute({
			sql: `UPDATE design_sessions SET last_export = ?, updated_at = ? WHERE id = ?`,
			args: [JSON.stringify(lastExport), ts, session.id],
		});

		return { thread_path: threadPath, copied_to: designsDir };
	};

	const list_systems: Handler<"design_list_systems"> = async () => {
		const systems = await scanDesignSystems();
		return systems;
	};

	const run_critique: Handler<"design_run_critique"> = async (_event, input) => {
		const session = await loadSession(db, input.session_id);
		if (!session) throw new Error(`Design session not found: ${input.session_id}`);
		const result = await runCritique(db, {
			sessionId: session.id,
			model: input.model,
			gateMode: input.gate_mode === true,
		});
		// 回写 design_sessions
		await db.client.execute({
			sql: `UPDATE design_sessions SET critique_scores = ?, updated_at = ? WHERE id = ?`,
			args: [JSON.stringify(result), Date.now(), session.id],
		});
		return result;
	};

	const list_builtin_skills: Handler<"design_list_builtin_skills"> = async () => {
		// 优先用新 resource-map 扫描器（带 od.tweaks / group / default_frame）；
		// 旧 listBuiltinSkills 作为 fallback，确保旧 SKILL.md（没 od:）也能列出。
		const fromRegistry = await listSkillSummaries();
		if (fromRegistry.length > 0) return fromRegistry;
		return await listBuiltinSkills();
	};

	const get_skill_resource_map: Handler<"design_get_skill_resource_map"> = async (
		_event,
		input,
	) => {
		return await getSkillResourceMap(input.skill_id);
	};

	const get_template: Handler<"design_get_template"> = async (_event, input) => {
		return await getTemplateHtml(input.template_id);
	};

	const extract_brand: Handler<"design_extract_brand"> = async (_event, input) => {
		const session = await loadSession(db, input.session_id);
		if (!session) throw new Error(`Design session not found: ${input.session_id}`);
		const spec = await extractBrand(input.url);
		const brandSpecPath = await writeBrandSpec(session.work_dir, spec);
		return {
			brand_spec_path: brandSpecPath,
			site_name: spec.site_name,
			colors: spec.colors,
			fonts: spec.fonts,
			logo_url: spec.logo_url,
			favicon_url: spec.favicon_url,
		};
	};

	const apply_tweak: Handler<"design_apply_tweak"> = async (_event, input) => {
		const run = runRegistry.get(input.run_id);
		if (!run) return { success: false, error: "Run not found" };
		if (!run.alive || !run.pushController || run.pushController.closed) {
			return { success: false, error: "Run is not alive" };
		}
		const value =
			typeof input.tweak_value === "number"
				? input.tweak_value.toFixed(2)
				: String(input.tweak_value);
		const message =
			`请把 \`${input.tweak_name}\` 调整为 \`${value}\`，` +
			"只改与该 tweak 直接相关的样式，保留整体布局与色板。完成后用一行话报告改了什么。";
		try {
			run.pushController.push({
				type: "user",
				message: { role: "user", content: message },
				parent_tool_use_id: null,
			} as unknown);
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e instanceof Error ? e.message : String(e),
			};
		}
	};

	const apply_annotation: Handler<"design_apply_annotation"> = async (
		_event,
		input,
	) => {
		const run = runRegistry.get(input.run_id);
		if (!run) return { success: false, error: "Run not found" };
		if (!run.alive || !run.pushController || run.pushController.closed) {
			return { success: false, error: "Run is not alive" };
		}
		const message =
			"基于 Inspector 标注，请对以下选择器对应的元素做修改：\n" +
			`- selector: \`${input.selector}\`\n` +
			`- note: ${input.note}\n` +
			"只改该元素与其直接子节点的样式/文案；保留其他部分。";
		try {
			run.pushController.push({
				type: "user",
				message: { role: "user", content: message },
				parent_tool_use_id: null,
			} as unknown);
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e instanceof Error ? e.message : String(e),
			};
		}
	};

	const media_providers: Handler<"design_media_providers"> = async () => {
		return listMediaProviders();
	};

	const media_generate: Handler<"design_media_generate"> = async (_event, input) => {
		return await runMediaJob(db, {
			session_id: input.session_id,
			provider: input.provider,
			kind: input.kind,
			prompt: input.prompt,
			options: input.options,
		});
	};

	const media_history: Handler<"design_media_history"> = async (_event, input) => {
		return await listMediaHistory(db, {
			session_id: input?.session_id,
			limit: input?.limit,
		});
	};

	// 启动时确保 media 表已建好（异步即可，失败不影响其他功能）
	void ensureMediaSchema(db).catch(() => undefined);

	return {
		design_list_directions: list_directions,
		design_list_sessions: list_sessions,
		design_get_discovery_form: get_discovery_form,
		design_start_session: start_session,
		design_submit_discovery: submit_discovery,
		design_get_session: get_session,
		design_update_session: update_session,
		design_finalize_session: finalize_session,
		design_delete_session: delete_session,
		design_reveal_work_dir: reveal_work_dir,
		design_list_export_targets: list_export_targets,
		design_export: export_session,
		design_finish_to_thread: finish_to_thread,
		design_list_systems: list_systems,
		design_run_critique: run_critique,
		design_list_builtin_skills: list_builtin_skills,
		design_get_skill_resource_map: get_skill_resource_map,
		design_get_template: get_template,
		design_extract_brand: extract_brand,
		design_apply_tweak: apply_tweak,
		design_apply_annotation: apply_annotation,
		design_media_providers: media_providers,
		design_media_generate: media_generate,
		design_media_history: media_history,
	};
}
