import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DragAndDropImportItemStatus =
	| "pending"
	| "importing"
	| "success"
	| "error";
export type DragAndDropQueueStatus = "idle" | "importing";

export interface DragAndDropImportItem<TResult = unknown> {
	id: string;
	path: string;
	name: string;
	ext: string;
	status: DragAndDropImportItemStatus;
	progress: number;
	result?: TResult;
	error?: string;
}

export interface DragAndDropPosition {
	x: number;
	y: number;
}

export interface UseDragAndDropImportOptions {
	enabled?: boolean;
	dedupe?: boolean;
	maxQueue?: number;
	accept?: (path: string) => boolean;
	timeoutMs?: number;
}

function createQueueItemId(): string {
	if (
		typeof globalThis.crypto !== "undefined" &&
		"randomUUID" in globalThis.crypto
	) {
		return globalThis.crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFileNameFromPath(path: string): string {
	return path.split(/[\\/]/).pop() || path;
}

function getFileExt(name: string): string {
	const idx = name.lastIndexOf(".");
	if (idx <= 0 || idx === name.length - 1) return "";
	return name.slice(idx + 1).toLowerCase();
}

function runWithTimeoutAndAbort<T>(
	promise: Promise<T>,
	options: {
		timeoutMs?: number;
		signal?: AbortSignal;
	},
): Promise<T> {
	const { timeoutMs, signal } = options;

	const hasTimeout =
		typeof timeoutMs === "number" &&
		Number.isFinite(timeoutMs) &&
		timeoutMs > 0;
	const hasSignal = Boolean(signal);
	if (!hasTimeout && !hasSignal) return promise;

	return new Promise<T>((resolve, reject) => {
		let settled = false;

		const cleanupFns: Array<() => void> = [];

		const cleanup = () => {
			while (cleanupFns.length > 0) {
				const fn = cleanupFns.pop();
				try {
					fn?.();
				} catch {}
			}
		};

		const settle = (type: "resolve" | "reject", value: any) => {
			if (settled) return;
			settled = true;
			cleanup();
			if (type === "resolve") resolve(value);
			else reject(value);
		};

		if (signal) {
			if (signal.aborted) {
				settle("reject", new Error("导入已取消"));
				return;
			}

			const onAbort = () => {
				settle("reject", new Error("导入已取消"));
			};
			signal.addEventListener("abort", onAbort, { once: true });
			cleanupFns.push(() => signal.removeEventListener("abort", onAbort));
		}

		if (hasTimeout) {
			const timer = window.setTimeout(() => {
				settle("reject", new Error("导入超时"));
			}, timeoutMs);
			cleanupFns.push(() => window.clearTimeout(timer));
		}

		promise.then(
			(value) => settle("resolve", value),
			(err) => settle("reject", err),
		);
	});
}

export function useDragAndDropImport<TResult = unknown>(
	options: UseDragAndDropImportOptions = {},
) {
	const {
		enabled = true,
		dedupe = true,
		maxQueue = 64,
		accept,
		timeoutMs = 180_000,
	} = options;

	const [isDragging, setIsDragging] = useState(false);
	const [dragPosition, setDragPosition] = useState<DragAndDropPosition | null>(
		null,
	);

	const [queue, setQueue] = useState<Array<DragAndDropImportItem<TResult>>>([]);
	const [queueStatus, setQueueStatus] =
		useState<DragAndDropQueueStatus>("idle");

	const cancelRef = useRef(false);
	const abortRef = useRef<AbortController | null>(null);
	const dragCounterRef = useRef(0);

	const resolveFilePath = useCallback((file: File): string => {
		const electronApi =
			typeof window !== "undefined" ? window.electronAPI : undefined;
		if (electronApi && typeof electronApi.getPathForFile === "function") {
			try {
				const p = electronApi.getPathForFile(file);
				if (p) return p;
			} catch {}
		}
		const legacyPath = (file as unknown as { path?: string }).path;
		return legacyPath || "";
	}, []);

	const enqueuePaths = useCallback(
		(paths: string[]) => {
			const cleanPaths = paths
				.map((p) => p?.trim())
				.filter((p): p is string => Boolean(p));

			if (cleanPaths.length === 0) return;

			setQueue((prev) => {
				const existing = dedupe
					? new Set(prev.map((i) => i.path))
					: new Set<string>();
				const next: Array<DragAndDropImportItem<TResult>> = [...prev];

				for (const path of cleanPaths) {
					if (accept && !accept(path)) continue;
					if (dedupe && existing.has(path)) continue;
					if (next.length >= maxQueue) break;

					const name = getFileNameFromPath(path);
					const ext = getFileExt(name);

					next.push({
						id: createQueueItemId(),
						path,
						name,
						ext,
						status: "pending",
						progress: 0,
					});

					existing.add(path);
				}

				return next;
			});
		},
		[accept, dedupe, maxQueue],
	);

	const clearQueue = useCallback(() => {
		setQueue([]);
	}, []);

	const removeItem = useCallback((id: string) => {
		setQueue((prev) => prev.filter((i) => i.id !== id));
	}, []);

	const cancelImport = useCallback(() => {
		cancelRef.current = true;
		abortRef.current?.abort();
	}, []);

	const startImport = useCallback(
		async (importer: (path: string) => Promise<TResult>) => {
			if (queueStatus === "importing") return;
			cancelRef.current = false;
			const controller = new AbortController();
			abortRef.current = controller;
			setQueueStatus("importing");

			try {
				const pendingItems = queue.filter((i) => i.status === "pending");

				for (const pendingItem of pendingItems) {
					if (cancelRef.current) break;

					setQueue((prev) =>
						prev.map((qItem) => {
							if (qItem.id !== pendingItem.id) return qItem;
							return {
								...qItem,
								status: "importing",
								progress: 0.1,
								error: undefined,
							};
						}),
					);

					const currentPath = pendingItem.path;
					if (!currentPath) continue;

					try {
						const result = await runWithTimeoutAndAbort(importer(currentPath), {
							timeoutMs,
							signal: controller.signal,
						});
						setQueue((prev) =>
							prev.map((qItem) =>
								qItem.id === pendingItem.id
									? { ...qItem, status: "success", progress: 1, result }
									: qItem,
							),
						);
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						setQueue((prev) =>
							prev.map((qItem) =>
								qItem.id === pendingItem.id
									? { ...qItem, status: "error", progress: 1, error: message }
									: qItem,
							),
						);

						if (cancelRef.current) break;
					}
				}
			} finally {
				abortRef.current = null;
				setQueueStatus("idle");
			}
		},
		[queue, queueStatus, timeoutMs],
	);

	const summary = useMemo(() => {
		const total = queue.length;
		const pending = queue.filter((i) => i.status === "pending").length;
		const importing = queue.filter((i) => i.status === "importing").length;
		const success = queue.filter((i) => i.status === "success").length;
		const error = queue.filter((i) => i.status === "error").length;
		return { total, pending, importing, success, error };
	}, [queue]);

	useEffect(() => {
		if (!enabled) return;

		const isFileDrag = (e: DragEvent) => {
			const types = e.dataTransfer?.types;
			if (!types) return false;
			for (let i = 0; i < types.length; i += 1) {
				if (types[i] === "Files") return true;
			}
			return false;
		};

		const onDragEnter = (e: DragEvent) => {
			if (!isFileDrag(e)) return;
			e.preventDefault();
			dragCounterRef.current += 1;
			setIsDragging(true);
			setDragPosition({ x: e.clientX, y: e.clientY });
		};

		const onDragOver = (e: DragEvent) => {
			if (!isFileDrag(e)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
			setIsDragging(true);
			setDragPosition({ x: e.clientX, y: e.clientY });
		};

		const onDragLeave = (e: DragEvent) => {
			if (!isFileDrag(e)) return;
			dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
			if (dragCounterRef.current === 0) {
				setIsDragging(false);
				setDragPosition(null);
			}
		};

		const onDrop = (e: DragEvent) => {
			e.preventDefault();
			dragCounterRef.current = 0;
			setIsDragging(false);
			setDragPosition({ x: e.clientX, y: e.clientY });

			const files = Array.from(e.dataTransfer?.files ?? []);
			if (files.length === 0) return;

			const paths = files
				.map((f) => resolveFilePath(f))
				.filter((p): p is string => Boolean(p));

			if (paths.length === 0) return;

			enqueuePaths(paths);
		};

		const onDragEnd = () => {
			dragCounterRef.current = 0;
			setIsDragging(false);
			setDragPosition(null);
		};

		window.addEventListener("dragenter", onDragEnter);
		window.addEventListener("dragover", onDragOver);
		window.addEventListener("dragleave", onDragLeave);
		window.addEventListener("drop", onDrop);
		window.addEventListener("dragend", onDragEnd);

		return () => {
			window.removeEventListener("dragenter", onDragEnter);
			window.removeEventListener("dragover", onDragOver);
			window.removeEventListener("dragleave", onDragLeave);
			window.removeEventListener("drop", onDrop);
			window.removeEventListener("dragend", onDragEnd);
			dragCounterRef.current = 0;
		};
	}, [enabled, enqueuePaths, resolveFilePath]);

	return {
		isDragging,
		dragPosition,
		queue,
		queueStatus,
		summary,
		enqueuePaths,
		clearQueue,
		removeItem,
		startImport,
		cancelImport,
	};
}
