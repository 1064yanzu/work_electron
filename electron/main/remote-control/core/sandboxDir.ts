import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

function normalizeSessionKey(raw: string): string {
	const value = String(raw || "").trim();
	if (!value) {
		throw new Error("remote session id is required for sandbox");
	}
	if (value.includes("\0")) {
		throw new Error("remote session id contains invalid null byte");
	}
	return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);
}

export async function ensureRemoteSessionSandboxDir(
	sessionId: string,
): Promise<string> {
	const key = normalizeSessionKey(sessionId);
	const root = path.join(app.getPath("userData"), "agent-sandboxes");
	const dir = path.join(root, key);
	await fs.mkdir(dir, { recursive: true });
	return dir;
}
