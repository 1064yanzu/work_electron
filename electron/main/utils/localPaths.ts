import os from "node:os";
import path from "node:path";

export function normalizeLocalPathInput(p: string): string {
	const raw = String(p ?? "").trim();
	if (!raw) return "";
	if (raw.includes("\0")) throw new Error("路径非法");

	// 拒绝 http/https URL（不能当作本地文件路径处理）
	if (raw.startsWith("http://") || raw.startsWith("https://")) {
		throw new Error(`不支持远程 URL 路径: ${raw.substring(0, 100)}...`);
	}

	// Support "file://..." (common when UI passes file URLs).
	if (raw.startsWith("file://")) {
		try {
			const u = new URL(raw);
			if (u.protocol === "file:") {
				let p = decodeURIComponent(u.pathname);
				// `file:///C:/a.png` -> `/C:/a.png` (trim the leading slash)
				if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1);
				return p;
			}
		} catch {
			// Fall through to other normalizations.
		}
	}

	// Support "asset://..." (Tauri-like asset scheme; treat as local file path)
	if (raw.startsWith("asset://")) {
		try {
			const u = new URL(raw);
			let p = decodeURIComponent(u.pathname);
			if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1);
			return p;
		} catch {
			// Fall through to other normalizations.
		}
	}

	// Support "~" and "~/" (common in CLI contexts).
	if (raw === "~") return os.homedir();
	if (raw.startsWith("~/") || raw.startsWith("~\\")) {
		return path.join(os.homedir(), raw.slice(2));
	}

	// Resolve relative paths to absolute
	if (!path.isAbsolute(raw)) {
		return path.resolve(raw);
	}

	return raw;
}

export function requireAbsoluteLocalPath(p: string): string {
	const normalized = normalizeLocalPathInput(p);
	if (!path.isAbsolute(normalized)) {
		throw new Error(`路径必须是绝对路径: ${p} -> ${normalized}`);
	}
	return normalized;
}
