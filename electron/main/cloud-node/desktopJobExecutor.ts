import type { DbContext } from "../db/client";
import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { CloudNodeConfigStore } from "./configStore";
import { DEFAULT_CLOUD_NODE_CONFIG } from "./defaults";
import type { AppErrorCode } from "./types";
import {
	collectFullBackupPayload,
	importBackupPayload,
} from "../services/backupPayload";

type ApplyResult =
	| { success: true; result: Record<string, unknown> }
	| { success: false; error_code: AppErrorCode; error_message: string };

type BackupResult =
	| { success: true; result: { backup_id: string; path: string; size: number } }
	| { success: false; error_code: AppErrorCode; error_message: string };

type RestoreResult =
	| { success: true; result: { backup_id: string; restored: true } }
	| { success: false; error_code: AppErrorCode; error_message: string };

function stringifyConfigValue(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value ?? null);
	} catch {
		return String(value);
	}
}

export class DesktopJobExecutor {
	private readonly cloudNodeConfigStore: CloudNodeConfigStore;

	constructor(private readonly db: DbContext) {
		this.cloudNodeConfigStore = new CloudNodeConfigStore(db);
	}

	getCapabilities(): string[] {
		return [
			"agent.run",
			"agent.abort",
			"interaction.resolve",
			"config.apply:model.active",
			"config.apply:cloud.node",
			"config.apply:config.*",
			"backup.start:local-json",
			"backup.restore:local-json",
			"migration.pull:session",
			"migration.pull:resource",
			"settings.domain:models",
			"settings.domain:prompts",
			"settings.domain:imagegen",
			"settings.domain:agent",
			"settings.domain:skills",
			"settings.domain:mcp",
			"settings.domain:remote-control",
			"settings.domain:general",
			"settings.domain:performance",
			"settings.domain:data-sync",
			"settings.domain:artifacts",
		];
	}

	private async ensureBackupDir(): Promise<string> {
		const dir = path.join(app.getPath("userData"), "cloud-node-backups");
		await fs.mkdir(dir, { recursive: true });
		return dir;
	}

	private buildBackupId(ts = Date.now()): string {
		return `backup_${new Date(ts)
			.toISOString()
			.replace(/[-:T.Z]/g, "")
			.slice(0, 14)}.json`;
	}

	async startBackup(): Promise<BackupResult> {
		try {
			const dir = await this.ensureBackupDir();
			const payload = await collectFullBackupPayload(this.db);
			const content = JSON.stringify(payload, null, 2);
			const backupId = this.buildBackupId();
			const filePath = path.join(dir, backupId);
			await fs.writeFile(filePath, content, "utf-8");
			const stat = await fs.stat(filePath);
			return {
				success: true,
				result: {
					backup_id: backupId,
					path: filePath,
					size: stat.size,
				},
			};
		} catch (error) {
			return {
				success: false,
				error_code: "CAPABILITY_NOT_AVAILABLE",
				error_message:
					error instanceof Error ? error.message : "本地备份执行失败",
			};
		}
	}

	async restoreBackup(input: { backupId?: string }): Promise<RestoreResult> {
		try {
			const dir = await this.ensureBackupDir();
			let backupId = String(input.backupId || "").trim();
			if (!backupId) {
				const files = await fs.readdir(dir);
				const candidates = files
					.filter((name) => /^backup_\d{14}\.json$/.test(name))
					.sort()
					.reverse();
				if (candidates.length === 0) {
					return {
						success: false,
						error_code: "NOT_FOUND",
						error_message: "没有可恢复的本地备份文件",
					};
				}
				backupId = candidates[0];
			}

			const target = path.join(dir, backupId);
			const raw = await fs.readFile(target, "utf-8");
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			await importBackupPayload(
				this.db,
				parsed,
				{ overwrite: true, clearAllFirst: true },
				console,
			);
			return {
				success: true,
				result: {
					backup_id: backupId,
					restored: true,
				},
			};
		} catch (error) {
			return {
				success: false,
				error_code: "CAPABILITY_NOT_AVAILABLE",
				error_message:
					error instanceof Error ? error.message : "本地恢复执行失败",
			};
		}
	}

	async applyConfig(input: {
		scope: string;
		data: Record<string, unknown>;
	}): Promise<ApplyResult> {
		const scope = String(input.scope || "").trim();
		if (!scope) {
			return {
				success: false,
				error_code: "VALIDATION_FAILED",
				error_message: "scope 不能为空",
			};
		}

		if (scope === "model.active") {
			const model = String(input.data.model || "").trim();
			if (!model) {
				return {
					success: false,
					error_code: "VALIDATION_FAILED",
					error_message: "model 不能为空",
				};
			}
			await this.db.client.execute({
				sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
				args: ["active_model", model, Date.now()],
			});
			return {
				success: true,
				result: {
					scope,
					model,
				},
			};
		}

		if (scope === "cloud.node") {
			const current = await this.cloudNodeConfigStore.load();
			const next = {
				...current,
				enabled:
					typeof input.data.enabled === "boolean"
						? input.data.enabled
						: current.enabled,
				relayUrl:
					typeof input.data.relayUrl === "string"
						? input.data.relayUrl
						: current.relayUrl,
				nodeName:
					typeof input.data.nodeName === "string"
						? input.data.nodeName
						: current.nodeName,
				heartbeatSec:
					typeof input.data.heartbeatSec === "number"
						? input.data.heartbeatSec
						: current.heartbeatSec,
				routingMode:
					typeof input.data.routingMode === "string"
						? (input.data.routingMode as
								| "cloud_only"
								| "prefer_desktop"
								| "auto")
						: current.routingMode,
				nodeId:
					typeof input.data.nodeId === "string"
						? input.data.nodeId
						: current.nodeId,
				nodeToken:
					typeof input.data.nodeToken === "string"
						? input.data.nodeToken
						: current.nodeToken,
			};
			await this.cloudNodeConfigStore.save({
				...DEFAULT_CLOUD_NODE_CONFIG,
				...next,
			});
			return {
				success: true,
				result: {
					scope,
				},
			};
		}

		if (scope.startsWith("config.")) {
			const key = scope.slice("config.".length).trim();
			if (!key) {
				return {
					success: false,
					error_code: "VALIDATION_FAILED",
					error_message: "config key 不能为空",
				};
			}
			const value = stringifyConfigValue(
				"value" in input.data ? input.data.value : input.data,
			);
			await this.db.client.execute({
				sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
				args: [key, value, Date.now()],
			});
			return {
				success: true,
				result: {
					scope,
					key,
				},
			};
		}

		return {
			success: false,
			error_code: "CAPABILITY_NOT_AVAILABLE",
			error_message: `scope=${scope} 当前桌面节点暂不支持`,
		};
	}
}
