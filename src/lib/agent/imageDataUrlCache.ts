import { safeInvoke } from "../tauriBridge";

type CacheEntry = {
	promise: Promise<string>;
	bytes: number;
};

const MAX_CACHE_SIZE = 50;
const MAX_CACHE_BYTES = 100 * 1024 * 1024; // 100MB

// Map 的迭代顺序保持插入顺序：命中时 delete+set 把 key 移到末尾，淘汰时从 keys().next() 取最旧。
const cache = new Map<string, CacheEntry>();
let totalBytes = 0;

function evictIfNeeded() {
	while (
		cache.size > 0 &&
		(cache.size > MAX_CACHE_SIZE || totalBytes > MAX_CACHE_BYTES)
	) {
		const oldest = cache.keys().next().value;
		if (oldest === undefined) break;
		const entry = cache.get(oldest);
		if (entry) totalBytes -= entry.bytes;
		cache.delete(oldest);
	}
}

function touch(key: string) {
	const entry = cache.get(key);
	if (!entry) return;
	cache.delete(key);
	cache.set(key, entry);
}

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
	if (hit) {
		touch(path);
		return hit.promise;
	}

	const entry: CacheEntry = { promise: Promise.resolve(""), bytes: 0 };
	entry.promise = (async () => {
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
		const dataUrl = `data:${mimeType};base64,${result.content}`;

		// promise resolve 后再把字节数登记到 entry，并触发一次淘汰
		const existing = cache.get(path);
		if (existing === entry) {
			entry.bytes = dataUrl.length;
			totalBytes += dataUrl.length;
			evictIfNeeded();
		}

		return dataUrl;
	})();

	cache.set(path, entry);

	// 失败时把 entry 从 cache 移除，避免缓存住一个永远 reject 的 promise
	entry.promise.catch(() => {
		const existing = cache.get(path);
		if (existing === entry) {
			totalBytes -= entry.bytes;
			cache.delete(path);
		}
	});

	return entry.promise;
}

export function clearImageDataUrlCache(path?: string) {
	if (path) {
		const entry = cache.get(path);
		if (entry) totalBytes -= entry.bytes;
		cache.delete(path);
		return;
	}
	cache.clear();
	totalBytes = 0;
}
