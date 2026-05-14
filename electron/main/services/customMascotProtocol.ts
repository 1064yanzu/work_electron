/**
 * mascot:// protocol — 让渲染层 <img src="mascot://<pet-id>/<slot>.<ext>"> 直接加载
 * 自定义桌宠资源。
 *
 * 安全模型：
 * - pet-id 只允许 [a-z0-9-]
 * - slot 必须在白名单（17 个 PNG slot + atlas + loading + spritesheet）
 * - 路径 normalize 后必须仍在 custom-mascots/<pet-id>/ 下
 *
 * 性能：直接走 fs.readFile + Response，可被 chromium 缓存（带 ETag/Last-Modified）。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { getCustomMascotsRootDir } from "./customMascotService";
import { createLogger } from "../logging/logger";

const ALLOWED_SLOTS = new Set<string>([
	"hero",
	"emotion-happy",
	"emotion-thinking",
	"emotion-focus",
	"emotion-surprise",
	"emotion-sad",
	"emotion-sleepy",
	"state-greet",
	"state-organize",
	"state-remind",
	"state-done",
	"empty-404",
	"empty-no-data",
	"empty-error",
	"onboarding-1",
	"onboarding-2",
	"onboarding-3",
]);

interface ResolvedRequest {
	filePath: string;
	mime: string;
}

function resolveMascotRequest(url: string): ResolvedRequest | null {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "mascot:") return null;

		// mascot://<id>/<slot>.<ext>
		// 在 URL 解析里，host = id；pathname = /<slot>.<ext>
		const id = parsed.hostname;
		if (!id || !/^[a-z0-9-]+$/.test(id)) return null;

		const rawPath = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
		if (!rawPath || rawPath.includes("/") || rawPath.includes("\\")) {
			// 不允许多层子路径
			return null;
		}

		const dot = rawPath.lastIndexOf(".");
		if (dot < 1) return null;
		const stem = rawPath.slice(0, dot);
		const ext = rawPath.slice(dot + 1).toLowerCase();

		// 合法形态：
		//   - 白名单 slot + .png
		//   - atlas + .webp
		//   - spritesheet + .webp / .png（codex 兼容）
		//   - loading + .mp4
		if (ALLOWED_SLOTS.has(stem)) {
			if (ext !== "png") return null;
		} else if (stem === "atlas") {
			if (ext !== "webp") return null;
		} else if (stem === "spritesheet") {
			if (ext !== "webp" && ext !== "png") return null;
		} else if (stem === "loading") {
			if (ext !== "mp4") return null;
		} else {
			return null;
		}

		const root = getCustomMascotsRootDir();
		const filePath = path.normalize(path.join(root, id, rawPath));
		// 二次确认 normalize 后仍在 root 下
		const rel = path.relative(root, filePath);
		if (rel.startsWith("..") || path.isAbsolute(rel)) return null;

		const mime =
			ext === "png"
				? "image/png"
				: ext === "webp"
					? "image/webp"
					: ext === "mp4"
						? "video/mp4"
						: "application/octet-stream";

		return { filePath, mime };
	} catch {
		return null;
	}
}

/**
 * 在 app.whenReady() 之前调用：声明 protocol 特权（让 service worker / fetch 可用）
 *
 * 注意：必须在 app.whenReady() 之前调用，否则 chromium 不会承认 protocol 特权。
 */
export function registerMascotProtocolPrivileges(): void {
	protocol.registerSchemesAsPrivileged([
		{
			scheme: "mascot",
			privileges: {
				standard: true,
				secure: true,
				supportFetchAPI: true,
				stream: true,
				bypassCSP: false,
				corsEnabled: true,
			},
		},
	]);
}

/**
 * 在 app.whenReady() 之后调用：注册实际的 handler
 */
export function registerMascotProtocolHandler(): void {
	const logger = createLogger();

	protocol.handle("mascot", async (request) => {
		const resolved = resolveMascotRequest(request.url);
		if (!resolved) {
			return new Response("Bad request", { status: 400 });
		}
		try {
			const stat = await fs.stat(resolved.filePath);
			if (!stat.isFile()) {
				return new Response("Not found", { status: 404 });
			}
			// 用 file:// 转换让 net.fetch 流式响应（避免一次性 readFile 大文件占内存）
			// 用 pathToFileURL 而非手拼，能正确处理 Windows 盘符（C:\ → file:///C:/）
			// 与路径中的特殊字符编码。
			const fileUrl = pathToFileURL(resolved.filePath).toString();
			const response = await net.fetch(fileUrl);
			// 覆写 mime（file:// 默认探测可能不准，比如 .webp）
			return new Response(response.body, {
				status: response.status,
				headers: {
					"Content-Type": resolved.mime,
					"Cache-Control": "no-cache",
				},
			});
		} catch (err) {
			logger.warn({
				msg: "mascot:// protocol error",
				url: request.url,
				error: err instanceof Error ? err.message : String(err),
			});
			return new Response("Not found", { status: 404 });
		}
	});
}
