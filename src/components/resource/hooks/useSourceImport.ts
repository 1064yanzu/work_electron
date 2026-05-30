// 文件导入 Hook - 拖拽导入文件逻辑

import { useCallback, useEffect, useMemo, useRef } from "react";
import { importLocalFiles } from "../../../lib/api";
import { workspaceStore } from "../../../lib/workspaceStore";
import {
	useDragAndDropImport,
	type DragAndDropRejectInfo,
} from "../../../hooks/useDragAndDropImport";
import { toast } from "../../ui/Toast";
import type { SourceDetail } from "../../../types";

interface UseSourceImportOptions {
	fetchSources: () => Promise<void>;
	/** 是否启用全局窗口拖拽监听，仅在资料库视图激活时应为 true */
	enabled?: boolean;
}

export function useSourceImport({ fetchSources, enabled = true }: UseSourceImportOptions) {
	const importSupportedExts = useMemo(
		() =>
			new Set([
				// === 文本 / 标记 / 配置 ===
				"txt",
				"md",
				"markdown",
				"mdx",
				"rst",
				"adoc",
				"asciidoc",
				"org",
				"tex",
				"json",
				"jsonl",
				"ndjson",
				"yaml",
				"yml",
				"toml",
				"xml",
				"csv",
				"tsv",
				"log",
				"conf",
				"cfg",
				"ini",
				"env",
				"properties",
				"htaccess",
				"plist",
				// === 文档 ===
				"pdf",
				"doc",
				"docx",
				"odt",
				"rtf",
				"pages",
				"epub",
				"mobi",
				"azw",
				"azw3",
				"kfx",
				"fb2",
				"djvu",
				"cbz",
				"cbr",
				// === HTML ===
				"html",
				"htm",
				"xhtml",
				"mhtml",
				"webarchive",
				// === 演示 / 表格 ===
				"ppt",
				"pptx",
				"key",
				"odp",
				"xls",
				"xlsx",
				"numbers",
				"ods",
				// === 图片 ===
				"png",
				"jpg",
				"jpeg",
				"gif",
				"webp",
				"bmp",
				"tif",
				"tiff",
				"svg",
				"ico",
				"heic",
				"heif",
				"avif",
				"raw",
				"psd",
				// === 音频 ===
				"mp3",
				"wav",
				"m4a",
				"aac",
				"flac",
				"ogg",
				"oga",
				"wma",
				"opus",
				"aiff",
				"alac",
				// === 视频 ===
				"mp4",
				"mov",
				"avi",
				"mkv",
				"webm",
				"wmv",
				"flv",
				"m4v",
				"mpeg",
				"mpg",
				"3gp",
				// === 代码 / 脚本 ===
				"js",
				"mjs",
				"cjs",
				"ts",
				"tsx",
				"jsx",
				"py",
				"pyw",
				"go",
				"rs",
				"java",
				"kt",
				"kts",
				"scala",
				"groovy",
				"c",
				"cc",
				"cpp",
				"cxx",
				"h",
				"hh",
				"hpp",
				"hxx",
				"m",
				"mm",
				"swift",
				"rb",
				"php",
				"sh",
				"bash",
				"zsh",
				"fish",
				"ps1",
				"bat",
				"cmd",
				"sql",
				"graphql",
				"gql",
				"proto",
				"thrift",
				"lua",
				"r",
				"jl",
				"dart",
				"vue",
				"svelte",
				"astro",
				"erl",
				"ex",
				"exs",
				"elm",
				"clj",
				"cljs",
				"hs",
				"ml",
				"fs",
				"fsx",
				"vb",
				"pl",
				"pm",
				"d",
				"nim",
				"zig",
				"v",
				"sol",
				// === 样式 ===
				"css",
				"scss",
				"sass",
				"less",
				"styl",
				"postcss",
				// === 压缩 ===
				"zip",
				"rar",
				"7z",
				"tar",
				"gz",
				"bz2",
				"xz",
				"tgz",
				"tbz",
				"txz",
				"lzma",
				"zst",
				// === 其它 ===
				"eml",
				"msg",
				"vcf",
				"ics",
				"srt",
				"vtt",
				"ass",
				"ssa",
			]),
		[],
	);

	const acceptImportPath = useCallback(
		(path: string) => {
			const lower = path.toLowerCase();
			const idx = lower.lastIndexOf(".");
			const ext = idx >= 0 ? lower.slice(idx + 1) : "";
			return importSupportedExts.has(ext);
		},
		[importSupportedExts],
	);

	const dragImport = useDragAndDropImport<SourceDetail>({
		enabled,
		accept: acceptImportPath,
		onReject: useCallback((info: DragAndDropRejectInfo) => {
			// 给用户可见的反馈，避免「拖进去什么都没发生」的静默失败
			if (info.noFiles) {
				toast.error("没有检测到文件，请重试");
				return;
			}
			if (info.noPaths) {
				const names = info.noPaths.fileNames.slice(0, 3).join("、");
				const more =
					info.noPaths.fileNames.length > 3
						? `等 ${info.noPaths.fileNames.length} 个文件`
						: "";
				toast.error(`无法获取文件路径：${names}${more}`);
				console.error(
					"[useSourceImport] webUtils.getPathForFile 解析失败，请检查 preload",
					info.noPaths,
				);
				return;
			}
			if (info.rejectedByAccept) {
				const exts = Array.from(
					new Set(
						info.rejectedByAccept.paths.map((p: string) => {
							const idx = p.lastIndexOf(".");
							return idx >= 0 ? p.slice(idx).toLowerCase() : "(无扩展名)";
						}),
					),
				);
				const totalCount = info.rejectedByAccept.paths.length;
				toast.warning(
					`暂不支持的文件格式：${exts.join("、")}（共 ${totalCount} 个文件被跳过）`,
				);
			}
		}, []),
	});

	const autoStartEnabledRef = useRef(true);
	const prevQueueLenRef = useRef(0);

	useEffect(() => {
		if (dragImport.queue.length > prevQueueLenRef.current) {
			autoStartEnabledRef.current = true;
		}
		prevQueueLenRef.current = dragImport.queue.length;
	}, [dragImport.queue.length]);

	const importSingleFile = useCallback(async (path: string) => {
		try {
			const project_id =
				workspaceStore.getState().currentProjectId || undefined;
			const currentFolderId = workspaceStore.getState().currentFolderId;
			const folder_id =
				currentFolderId && currentFolderId !== "__unassigned__"
					? currentFolderId
					: undefined;
			const result = await importLocalFiles({
				paths: [path],
				tags: [],
				project_id,
				folder_id,
			});
			if (!result || result.length === 0) {
				throw new Error("导入失败：返回为空");
			}
			return result[0];
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(message);
		}
	}, []);

	useEffect(() => {
		if (!autoStartEnabledRef.current) return;
		if (dragImport.queueStatus !== "idle") return;
		if (dragImport.summary.pending <= 0) return;
		dragImport.startImport(importSingleFile);
	}, [
		dragImport.queueStatus,
		dragImport.summary.pending,
		dragImport.startImport,
		importSingleFile,
	]);

	const prevQueueStatusRef = useRef(dragImport.queueStatus);

	useEffect(() => {
		const prev = prevQueueStatusRef.current;
		if (prev === "importing" && dragImport.queueStatus === "idle") {
			fetchSources();
		}
		prevQueueStatusRef.current = dragImport.queueStatus;
	}, [dragImport.queueStatus, fetchSources]);

	const handleStartDragImport = useCallback(() => {
		autoStartEnabledRef.current = true;
		dragImport.startImport(importSingleFile);
	}, [dragImport.startImport, importSingleFile]);

	const handleCancelDragImport = useCallback(() => {
		autoStartEnabledRef.current = false;
		dragImport.cancelImport();
	}, [dragImport.cancelImport]);

	return {
		dragImport,
		handleStartDragImport,
		handleCancelDragImport,
	};
}
