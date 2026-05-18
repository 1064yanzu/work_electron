/**
 * 日志导出 handler
 *
 * - `logs_get_info`：返回当前日志根目录、最近几个子目录的字节统计，让 UI 显示概要。
 * - `logs_reveal`：在系统文件管理器里打开日志根目录。
 * - `logs_export`：弹出 Save 对话框，把日志根目录打成 zip 写到用户指定路径。
 *
 * 设计取舍：
 * - 默认导出最近 7 天的日志（避免历史 100MB+ 全打进去拖慢）。可由参数指定 `days = 0` 导全部。
 * - 写文件用 archiver 流式打包，不会把整个目录加载进内存。
 */
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import archiver from "archiver";
import { app, dialog, type IpcMainInvokeEvent, shell } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { Logger } from "../../logging/types";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function getLogDirectory(): string {
	if (app.isPackaged) {
		return path.join(app.getPath("userData"), "logs");
	}
	return path.join(process.cwd(), "logs");
}

async function pathExists(p: string): Promise<boolean> {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

/** 递归统计目录字节数（用于日志概览展示） */
async function sumDirectorySize(dir: string): Promise<number> {
	let total = 0;
	let entries: Array<{ name: string; isDirectory: boolean }> = [];
	try {
		const raw = await fs.readdir(dir, { withFileTypes: true });
		entries = raw.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		try {
			if (entry.isDirectory) {
				total += await sumDirectorySize(full);
			} else {
				const st = await fs.stat(full);
				total += st.size;
			}
		} catch {
			// 忽略权限/被占用的文件
		}
	}
	return total;
}

/** 列出日志根目录下的子目录（按名字降序，最新优先） */
async function listLogSubdirs(root: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(root, { withFileTypes: true });
		return entries
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
			.sort((a, b) => b.localeCompare(a));
	} catch {
		return [];
	}
}

function defaultExportFilename(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	const platform =
		process.platform === "darwin"
			? "mac"
			: process.platform === "win32"
				? "win"
				: process.platform;
	return `ipo-workbench-logs-${platform}-${stamp}.zip`;
}

function appMetadataJson(extra: Record<string, unknown> = {}): string {
	return JSON.stringify(
		{
			exported_at: new Date().toISOString(),
			app_name: app.getName(),
			app_version: app.getVersion(),
			electron: process.versions.electron,
			chrome: process.versions.chrome,
			node: process.versions.node,
			platform: process.platform,
			arch: process.arch,
			os_release: os.release(),
			...extra,
		},
		null,
		2,
	);
}

export function createLogsHandlers(deps: { logger: Logger }) {
	const { logger } = deps;

	const logs_get_info: Handler<"logs_get_info"> = async () => {
		const root = getLogDirectory();
		const exists = await pathExists(root);
		if (!exists) {
			return {
				root,
				exists: false,
				total_bytes: 0,
				subdir_count: 0,
				latest_subdirs: [],
			};
		}
		const subdirs = await listLogSubdirs(root);
		const total = await sumDirectorySize(root);
		return {
			root,
			exists: true,
			total_bytes: total,
			subdir_count: subdirs.length,
			latest_subdirs: subdirs.slice(0, 5),
		};
	};

	const logs_reveal: Handler<"logs_reveal"> = async () => {
		const root = getLogDirectory();
		const exists = await pathExists(root);
		if (!exists) {
			try {
				await fs.mkdir(root, { recursive: true });
			} catch (err) {
				return {
					success: false,
					path: root,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}
		const error = await shell.openPath(root);
		if (error) {
			return { success: false, path: root, error };
		}
		return { success: true, path: root };
	};

	const logs_export: Handler<"logs_export"> = async (_event, input) => {
		const root = getLogDirectory();
		const exists = await pathExists(root);
		if (!exists) {
			return { canceled: false, path: "", bytes: 0, error: "LOGS_DIR_MISSING" };
		}

		// 确定要打包哪些子目录
		const days = typeof input?.days === "number" ? input.days : 7;
		const allSubdirs = await listLogSubdirs(root);
		// 子目录名形如 "2026-05-14" 或 "2026-05-14-12"，按字典序降序就是时间倒序
		const subdirsToInclude =
			days > 0 ? allSubdirs.slice(0, Math.max(days, 1) * 24) : allSubdirs;

		// 弹出保存对话框
		const defaultName = defaultExportFilename();
		const result = await dialog.showSaveDialog({
			title: "导出日志",
			defaultPath: path.join(app.getPath("downloads"), defaultName),
			filters: [{ name: "ZIP", extensions: ["zip"] }],
		});
		if (result.canceled || !result.filePath) {
			return { canceled: true, path: "", bytes: 0 };
		}
		const target = result.filePath;

		// 流式打包
		try {
			await new Promise<void>((resolve, reject) => {
				const output = createWriteStream(target);
				const archive = archiver("zip", { zlib: { level: 9 } });
				let settled = false;
				const done = (err?: unknown) => {
					if (settled) return;
					settled = true;
					if (err) reject(err);
					else resolve();
				};
				output.on("close", () => done());
				output.on("error", (err) => done(err));
				archive.on("error", (err) => done(err));
				archive.on("warning", (warn) => {
					if ((warn as { code?: string }).code === "ENOENT") return;
					logger.warn({
						scope: "logs_export",
						msg: "archiver warning",
						error: warn instanceof Error ? warn.message : String(warn),
					});
				});

				archive.pipe(output);

				// 写入应用元信息，方便排查时知道来源版本
				archive.append(
					appMetadataJson({
						days_range: days,
						included_subdirs: subdirsToInclude.length,
					}),
					{ name: "app-info.json" },
				);

				// 根目录里的日志文件（crash.log、.app-audit.json 等）单独加进去
				archive.glob("*", {
					cwd: root,
					nodir: true,
					ignore: ["*.zip"],
				});

				// 按选中的子目录追加
				for (const sub of subdirsToInclude) {
					const abs = path.join(root, sub);
					archive.directory(abs, sub);
				}

				archive.finalize().catch((err) => done(err));
			});

			const st = await fs.stat(target);
			logger.info({
				scope: "logs_export",
				msg: "Logs exported",
				path: target,
				bytes: st.size,
				included: subdirsToInclude.length,
			});
			return { canceled: false, path: target, bytes: st.size };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.error({
				scope: "logs_export",
				msg: "Logs export failed",
				error: msg,
			});
			// 删除可能写到一半的残留文件
			try {
				await fs.unlink(target);
			} catch {
				// 忽略
			}
			return { canceled: false, path: "", bytes: 0, error: msg };
		}
	};

	const log_renderer_event: Handler<"log_renderer_event"> = async (
		_event,
		input,
	) => {
		const level = input.level === "warn" ? "warn" : "error";
		const payload: Record<string, unknown> = {
			scope: "renderer",
			msg: input.message || "(renderer event)",
		};
		if (input.source) payload.source = input.source;
		if (input.stack) payload.stack = input.stack;
		if (input.location) payload.location = input.location;
		try {
			deps.logger[level](payload);
		} catch {
			// 写日志失败不抛出
		}
		return { success: true };
	};

	return { logs_get_info, logs_reveal, logs_export, log_renderer_event };
}
