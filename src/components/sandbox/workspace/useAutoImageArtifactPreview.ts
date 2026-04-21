import { useCallback, useEffect, useRef } from "react";
import type { ExecutionGraphSource } from "../graph/types";

interface UseAutoImageArtifactPreviewArgs {
	graphSource: ExecutionGraphSource | null;
	sandboxDir?: string;
	isExecuting: boolean;
	openArtifactInPreview: (filePath: string) => Promise<void> | void;
}

function normalizePathLike(value: string): string {
	let path = String(value || "").trim();
	path = path.replace(/^file:\/\//i, "");
	path = path.replace(/^["'`<]+|["'`>]+$/g, "");
	path = path.split("#")[0]?.split("?")[0] || path;
	try {
		path = decodeURIComponent(path);
	} catch {}
	return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function isPreviewableLocalPath(value: string, sandboxDir?: string): boolean {
	const path = normalizePathLike(value);
	if (!path) return false;
	if (path.startsWith("data:image/")) return false;
	if (path.startsWith("http://") || path.startsWith("https://")) return false;
	if (sandboxDir) {
		const root = normalizePathLike(sandboxDir).replace(/\/+$/, "");
		if (!path.startsWith(root)) return false;
	}
	return true;
}

export function useAutoImageArtifactPreview({
	graphSource,
	sandboxDir,
	isExecuting,
	openArtifactInPreview,
}: UseAutoImageArtifactPreviewArgs) {
	const seenImagePathsByTaskRef = useRef<Map<string, Set<string>>>(new Map());
	const manualTakeoverTaskIdRef = useRef<string | null>(null);
	const activeTaskId = graphSource?.id || null;

	useEffect(() => {
		if (!activeTaskId) {
			manualTakeoverTaskIdRef.current = null;
			return;
		}
		if (
			manualTakeoverTaskIdRef.current &&
			manualTakeoverTaskIdRef.current !== activeTaskId
		) {
			manualTakeoverTaskIdRef.current = null;
		}
	}, [activeTaskId]);

	const requestAutoPreview = useCallback(
		(filePath: string): boolean => {
			if (!isExecuting || !graphSource?.id) return false;
			const taskId = graphSource.id;
			if (manualTakeoverTaskIdRef.current === taskId) return false;
			const normalized = normalizePathLike(filePath);
			if (!isPreviewableLocalPath(normalized, sandboxDir)) return false;
			void Promise.resolve(openArtifactInPreview(normalized));
			return true;
		},
		[graphSource, isExecuting, openArtifactInPreview, sandboxDir],
	);

	useEffect(() => {
		if (!graphSource || !isExecuting) return;
		const taskId = graphSource.id;
		if (!taskId) return;
		if (manualTakeoverTaskIdRef.current === taskId) return;

		const currentSeen =
			seenImagePathsByTaskRef.current.get(taskId) || new Set<string>();
		const imagePaths = graphSource.artifacts
			.map((artifact) => String(artifact.url || "").trim())
			.filter((path) => isPreviewableLocalPath(path, sandboxDir));

		const unseen = imagePaths.filter((path) => !currentSeen.has(path));
		for (const path of imagePaths) currentSeen.add(path);
		seenImagePathsByTaskRef.current.set(taskId, currentSeen);

		if (unseen.length === 0) return;
		const latest = unseen[unseen.length - 1];
		if (!latest) return;
		requestAutoPreview(latest);
	}, [graphSource, isExecuting, requestAutoPreview, sandboxDir]);

	const markUserManualSelection = useCallback(() => {
		if (!activeTaskId) return;
		manualTakeoverTaskIdRef.current = activeTaskId;
	}, [activeTaskId]);

	return {
		markUserManualSelection,
		requestAutoPreview,
	};
}
