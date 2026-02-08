import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

const CURRENT_DB_FILE = "db.sqlite";
const LEGACY_APP_DIR = "com.ipo.workbench";
const LEGACY_OVERRIDE_FILE = "db_path_override.json";

function readOverridePath(overrideFilePath: string): string | null {
	try {
		if (!fs.existsSync(overrideFilePath)) return null;
		const raw = fs.readFileSync(overrideFilePath, "utf-8");
		const parsed = JSON.parse(raw) as { db_path?: unknown };
		if (typeof parsed.db_path !== "string") return null;
		const dbPath = parsed.db_path.trim();
		if (!dbPath || !path.isAbsolute(dbPath)) return null;
		return dbPath;
	} catch {
		return null;
	}
}

function resolveDatabaseOverridePath(userDataDir: string): string | null {
	const appDataDir = app.getPath("appData");
	const candidates = [
		path.join(userDataDir, LEGACY_OVERRIDE_FILE),
		path.join(appDataDir, LEGACY_APP_DIR, LEGACY_OVERRIDE_FILE),
	];
	for (const filePath of candidates) {
		const overridePath = readOverridePath(filePath);
		if (overridePath) {
			return overridePath;
		}
	}
	return null;
}

export function getDatabaseFilePath() {
	const userDataDir = app.getPath("userData");
	const overridePath = resolveDatabaseOverridePath(userDataDir);
	if (overridePath) {
		return overridePath;
	}
	return path.join(userDataDir, CURRENT_DB_FILE);
}
