/**
 * Skills Marketplace IPC Handlers
 *
 * 命令组：
 *   skills_marketplace_list_sources  —— 取已配置的源 + 镜像 + 自动检查开关
 *   skills_marketplace_set_sources   —— 写入用户配置（合并写）
 *   skills_marketplace_search        —— 聚合多源结果，附带 installed 标记
 *   skills_marketplace_install       —— 下载安装，进度走事件 skill-install-progress
 *   skills_marketplace_uninstall     —— 卸载（删目录 + 索引条目 + 关闭 enabled）
 *   skills_marketplace_check_updates —— 启动时调，比 version
 *   skills_marketplace_test_mirror   —— 测速，给设置面板用
 *   skills_marketplace_preview       —— 安装前预览 SKILL.md（前 50 行）
 */

import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { net } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import {
	installEntry,
	uninstallByName,
} from "../../skills-marketplace/installer";
import {
	getInstalledRecord,
	loadLocalIndex,
} from "../../skills-marketplace/localIndex";
import {
	DEFAULT_MIRROR_TEMPLATES,
	type MirrorTemplate,
	deriveMirrorUrls,
	parseGithubRawUrl,
	testMirrors,
} from "../../skills-marketplace/mirrorRouter";
import {
	DEFAULT_SOURCES,
	aggregateSearch,
	fetchSourceEntries,
} from "../../skills-marketplace/registry";
import type {
	MarketplaceEntry,
	MarketplaceSource,
} from "../../skills-marketplace/types";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

const KEY_SOURCES = "skills.marketplace.sources";
const KEY_MIRRORS = "skills.marketplace.mirrors";
const KEY_AUTO = "skills.marketplace.auto_check";

async function readJsonConfig<T>(
	db: DbContext,
	key: string,
): Promise<T | null> {
	const rows = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: [key],
	});
	if (rows.rows.length === 0) return null;
	const v = rows.rows[0].value as string;
	if (!v) return null;
	try {
		return JSON.parse(v) as T;
	} catch {
		return null;
	}
}

async function writeConfig(db: DbContext, key: string, value: string) {
	const ts = Date.now();
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [key, value, ts],
	});
}

async function loadSources(db: DbContext): Promise<MarketplaceSource[]> {
	const persisted = await readJsonConfig<MarketplaceSource[]>(db, KEY_SOURCES);
	if (persisted && Array.isArray(persisted) && persisted.length > 0) {
		// 温和迁移：把已弃用的默认源（skills-sh / tencent-skillhub）剔除，
		// 并补齐新版 DEFAULT_SOURCES 中尚未出现在用户配置里的官方源。
		// 用户自定义的 source（id 不在 DEFAULT_SOURCES 内）一律保留。
		const deprecatedIds = new Set(["skills-sh", "tencent-skillhub"]);
		const defaultIds = new Set(DEFAULT_SOURCES.map((s) => s.id));
		let migrated = persisted.filter((s) => !deprecatedIds.has(s.id));
		const existingIds = new Set(migrated.map((s) => s.id));
		const missing = DEFAULT_SOURCES.filter((s) => !existingIds.has(s.id));
		const changed = missing.length > 0 || migrated.length !== persisted.length;
		if (changed) {
			migrated = [...migrated, ...missing];
			await writeConfig(db, KEY_SOURCES, JSON.stringify(migrated));
		}
		// 兼容旧用户：若 anthropic-official URL 仍然指向旧路径，也无需更正——目前路径未变
		void defaultIds;
		return migrated;
	}
	// 首次启动：写入默认源并返回
	await writeConfig(db, KEY_SOURCES, JSON.stringify(DEFAULT_SOURCES));
	return DEFAULT_SOURCES;
}

async function loadMirrors(db: DbContext): Promise<MirrorTemplate[]> {
	const persisted = await readJsonConfig<MirrorTemplate[]>(db, KEY_MIRRORS);
	if (persisted && Array.isArray(persisted) && persisted.length > 0) {
		return persisted;
	}
	await writeConfig(db, KEY_MIRRORS, JSON.stringify(DEFAULT_MIRROR_TEMPLATES));
	return DEFAULT_MIRROR_TEMPLATES;
}

async function loadAutoCheck(db: DbContext): Promise<boolean> {
	const rows = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: [KEY_AUTO],
	});
	if (rows.rows.length === 0) return true;
	const v = String(rows.rows[0].value ?? "1");
	return v === "1" || v === "true";
}

async function setSkillEnabledHelper(
	db: DbContext,
	name: string,
	enabled: boolean,
) {
	const key = `skills.enabled.${name}`;
	const ts = Date.now();
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [key, enabled ? "1" : "0", ts],
	});
}

// 简易版本号比较（语义化版本，缺位补 0；非数字段做字符串比较）
function compareVersions(a?: string, b?: string): number {
	if (!a && !b) return 0;
	if (!a) return -1;
	if (!b) return 1;
	const ax = a.replace(/^v/i, "").split(".");
	const bx = b.replace(/^v/i, "").split(".");
	const len = Math.max(ax.length, bx.length);
	for (let i = 0; i < len; i++) {
		const ai = ax[i] ?? "0";
		const bi = bx[i] ?? "0";
		const an = Number(ai);
		const bn = Number(bi);
		if (!Number.isNaN(an) && !Number.isNaN(bn)) {
			if (an !== bn) return an - bn;
		} else {
			if (ai !== bi) return ai < bi ? -1 : 1;
		}
	}
	return 0;
}

export function createSkillsMarketplaceHandlers({
	db,
	getMainWindow,
}: {
	db: DbContext;
	getMainWindow: () => BrowserWindow | null;
}) {
	const skills_marketplace_list_sources: Handler<
		"skills_marketplace_list_sources"
	> = async () => {
		const [sources, mirrors, autoCheck] = await Promise.all([
			loadSources(db),
			loadMirrors(db),
			loadAutoCheck(db),
		]);
		return { sources, mirrors, autoCheck };
	};

	const skills_marketplace_set_sources: Handler<
		"skills_marketplace_set_sources"
	> = async (_event, input) => {
		if (input.sources) {
			await writeConfig(db, KEY_SOURCES, JSON.stringify(input.sources));
		}
		if (input.mirrors) {
			await writeConfig(db, KEY_MIRRORS, JSON.stringify(input.mirrors));
		}
		if (typeof input.autoCheck === "boolean") {
			await writeConfig(db, KEY_AUTO, input.autoCheck ? "1" : "0");
		}
		return { success: true };
	};

	const skills_marketplace_search: Handler<
		"skills_marketplace_search"
	> = async (_event, input) => {
		const [sources, mirrors] = await Promise.all([
			loadSources(db),
			loadMirrors(db),
		]);
		const enabledSources = sources.filter((s) => s.enabled);
		const { entries, errors } = await aggregateSearch(
			enabledSources,
			input.query,
			input.sourceId,
			mirrors,
		);
		const idx = await loadLocalIndex();
		const enriched = entries.map((e) => {
			const installed = idx.installed[e.name];
			return {
				...e,
				installed: !!installed,
				installedVersion: installed?.version,
			};
		});
		return { entries: enriched, errors };
	};

	const skills_marketplace_install: Handler<
		"skills_marketplace_install"
	> = async (_event, input) => {
		const [sources, mirrors] = await Promise.all([
			loadSources(db),
			loadMirrors(db),
		]);
		const enabledSources = sources.filter((s) => s.enabled);
		let target: MarketplaceEntry | null = null;
		let aggError: string | undefined;
		for (const s of enabledSources) {
			try {
				const list = await fetchSourceEntries(s, undefined, mirrors);
				const found = list.find((e) => e.id === input.entryId);
				if (found) {
					target = found;
					break;
				}
			} catch (e) {
				aggError = e instanceof Error ? e.message : String(e);
			}
		}
		if (!target) {
			return {
				success: false,
				error: aggError
					? `未找到 entry ${input.entryId}（${aggError}）`
					: `未找到 entry ${input.entryId}`,
			};
		}

		const win = getMainWindow();
		const send = (payload: unknown) => {
			try {
				win?.webContents.send("skill-install-progress", payload);
			} catch {
				// noop
			}
		};

		send({ entryId: target.id, phase: "queued", percent: 0 });

		try {
			const result = await installEntry(target, {
				mirrors,
				onProgress: ({ phase, percent, message }) => {
					send({ entryId: target?.id, phase, percent, message });
				},
			});
			// 默认启用
			await setSkillEnabledHelper(db, target.name, true);
			send({ entryId: target.id, phase: "done", percent: 100 });
			return {
				success: true,
				name: result.name,
				location: result.location,
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			send({
				entryId: target.id,
				phase: "error",
				percent: 0,
				error: msg,
			});
			return { success: false, error: msg };
		}
	};

	const skills_marketplace_uninstall: Handler<
		"skills_marketplace_uninstall"
	> = async (_event, input) => {
		const name = String(input.skillName ?? "").trim();
		if (!name) throw new Error("skillName 不能为空");
		await uninstallByName(name);
		await setSkillEnabledHelper(db, name, false);
		return { success: true };
	};

	const skills_marketplace_check_updates: Handler<
		"skills_marketplace_check_updates"
	> = async () => {
		const [sources, mirrors] = await Promise.all([
			loadSources(db),
			loadMirrors(db),
		]);
		const enabledSources = sources.filter((s) => s.enabled);
		const idx = await loadLocalIndex();
		if (Object.keys(idx.installed).length === 0) return { updates: [] };

		// 从所有启用的源拉取一遍 entries，按 name 索引
		const entryByName = new Map<string, MarketplaceEntry>();
		for (const s of enabledSources) {
			try {
				const list = await fetchSourceEntries(s, undefined, mirrors);
				for (const e of list) {
					if (!entryByName.has(e.name)) entryByName.set(e.name, e);
				}
			} catch {
				// noop
			}
		}

		const updates: Array<{
			name: string;
			currentVersion?: string;
			latestVersion?: string;
			entryId: string;
			sourceId: string;
		}> = [];
		for (const [name, rec] of Object.entries(idx.installed)) {
			const entry = entryByName.get(name);
			if (!entry) continue;
			if (compareVersions(rec.version, entry.version) < 0) {
				updates.push({
					name,
					currentVersion: rec.version,
					latestVersion: entry.version,
					entryId: entry.id,
					sourceId: entry.sourceId,
				});
			}
		}
		// 推一次事件给前端角标（即使 0 条也推，以便清掉旧角标）
		try {
			const win = getMainWindow();
			win?.webContents.send("skill-update-available", { updates });
		} catch {
			// noop
		}
		return { updates };
	};

	const skills_marketplace_test_mirror: Handler<
		"skills_marketplace_test_mirror"
	> = async () => {
		const mirrors = await loadMirrors(db);
		const results = await testMirrors(mirrors);
		return { results };
	};

	const skills_marketplace_preview: Handler<
		"skills_marketplace_preview"
	> = async (_event, input) => {
		const [sources, mirrors] = await Promise.all([
			loadSources(db),
			loadMirrors(db),
		]);
		let target: MarketplaceEntry | null = null;
		for (const s of sources.filter((x) => x.enabled)) {
			try {
				const list = await fetchSourceEntries(s, undefined, mirrors);
				const f = list.find((e) => e.id === input.entryId);
				if (f) {
					target = f;
					break;
				}
			} catch {
				// noop
			}
		}
		if (!target) return { error: "未找到 entry" };

		// 仅 GitHub 来源支持便捷预览（直接拉 SKILL.md raw）
		const a = target.artifact;
		if (a.kind !== "github") {
			return {
				error: "该来源不支持预览（仅 GitHub 来源可在线查看 SKILL.md）",
			};
		}
		const subdirPart = a.subdir ? `${a.subdir.replace(/^\/+|\/+$/g, "")}/` : "";
		const rawUrl = `https://raw.githubusercontent.com/${a.owner}/${a.repo}/${a.ref}/${subdirPart}SKILL.md`;
		const candidates = deriveMirrorUrls(rawUrl, mirrors);
		const probeCoords = parseGithubRawUrl(rawUrl);
		void probeCoords;
		let lastError: string | undefined;
		for (const u of candidates) {
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), 12_000);
			try {
				const r = await net.fetch(u, { signal: ctrl.signal });
				if (!r.ok) {
					lastError = `HTTP ${r.status}`;
					continue;
				}
				const text = await r.text();
				const head = text.split(/\r?\n/).slice(0, 80).join("\n");
				return { skillMd: head, usedUrl: u };
			} catch (e) {
				lastError = e instanceof Error ? e.message : String(e);
			} finally {
				clearTimeout(timer);
			}
		}
		return { error: lastError ?? "无法获取 SKILL.md" };
	};

	return {
		skills_marketplace_list_sources,
		skills_marketplace_set_sources,
		skills_marketplace_search,
		skills_marketplace_install,
		skills_marketplace_uninstall,
		skills_marketplace_check_updates,
		skills_marketplace_test_mirror,
		skills_marketplace_preview,
	};
}

/** 辅助：通过 name 查找已装记录（导出给其它模块复用） */
export async function findInstalledRecordByName(name: string) {
	return getInstalledRecord(name);
}
