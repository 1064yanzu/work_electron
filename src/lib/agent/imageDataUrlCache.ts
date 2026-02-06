import { safeInvoke } from "../tauriBridge";

type CacheEntry = {
	promise: Promise<string>;
};

const cache = new Map<string, CacheEntry>();

function guessImageMimeType(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase() || "png";
	const mimeTypes: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
		bmp: "image/bmp",
	};
	return mimeTypes[ext] || "image/png";
}

export function getImageDataUrl(inputPath: string): Promise<string> {
	if (typeof inputPath === "string" && inputPath.startsWith("data:image/")) {
		return Promise.resolve(inputPath);
	}

	// URL 解码路径，处理 react-markdown 可能的 URL 编码（如 %20 -> 空格）
	const path = (() => {
		try {
			return decodeURIComponent(inputPath);
		} catch {
			return inputPath;
		}
	})();

	const hit = cache.get(path);
	if (hit) return hit.promise;

	const promise = (async () => {
		const result = await safeInvoke<{ content: string; encoding: string }>(
			"read_file_safe",
			{
				payload: {
					path,
					encoding: "base64",
				},
			},
		);

		if (!result?.content) {
			throw new Error("图片内容为空");
		}

		const mimeType = guessImageMimeType(path);
		return `data:${mimeType};base64,${result.content}`;
	})();

	cache.set(path, { promise });
	return promise;
}

export function clearImageDataUrlCache(path?: string) {
	if (path) {
		cache.delete(path);
		return;
	}
	cache.clear();
}
