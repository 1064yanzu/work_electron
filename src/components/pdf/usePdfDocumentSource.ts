import { useEffect, useState } from "react";
import { safeInvoke } from "../../lib/tauriBridge";

/** react-pdf `Document` 组件 `file` prop 可接受的两种本地/远程数据形态。 */
export type PdfDocumentSource = string | { data: Uint8Array };

interface ReadFileBytesResult {
	data: Uint8Array;
	size: number;
	mtime_ms: number;
	path: string;
}

function isRemoteSource(src: string): boolean {
	return (
		src.startsWith("http://") ||
		src.startsWith("https://") ||
		src.startsWith("data:") ||
		src.startsWith("blob:")
	);
}

/**
 * 统一的 PDF 文档字节加载逻辑，供 `PdfEngine` / `PdfViewer` 共用。
 *
 * - 远程 / data: / blob: URL：直接把字符串透传给 `Document.file`，交给 react-pdf 自行拉取。
 * - 本地磁盘文件：通过 `read_file_bytes_safe` IPC 直接拿到结构化克隆传输的 `Uint8Array`，
 *   彻底消灭旧实现里「`read_file_safe` 返回 base64 字符串 + 渲染端 `atob` 逐字节解码」的开销，
 *   对几十上百 MB 的大体积 PDF 能显著降低加载耗时与内存占用（省去一次 base64 编解码 + 一次
 *   逐字符 JS 循环）。
 */
export function usePdfDocumentSource(srcPath: string): {
	documentSource: PdfDocumentSource | null;
	error: string | null;
} {
	const [documentSource, setDocumentSource] =
		useState<PdfDocumentSource | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setDocumentSource(null);
		setError(null);

		if (isRemoteSource(srcPath)) {
			setDocumentSource(srcPath);
			return;
		}

		(async () => {
			try {
				const result = await safeInvoke<ReadFileBytesResult>(
					"read_file_bytes_safe",
					{ payload: { path: srcPath } },
				);
				if (cancelled) return;
				const bytes = result?.data;
				if (!bytes || bytes.byteLength === 0) {
					throw new Error("PDF 内容为空");
				}
				// 结构化克隆理论上会直接还原为 Uint8Array，这里做一次防御性兜底。
				setDocumentSource({
					data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
				});
			} catch (e) {
				if (cancelled) return;
				setError(e instanceof Error ? e.message : String(e));
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [srcPath]);

	return { documentSource, error };
}
