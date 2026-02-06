import { useEffect, useMemo, useState } from "react";
import type { SandboxFile } from "../../../lib/managedModeStore";

interface UseArtifactNavigatorArgs {
	artifactFiles: SandboxFile[];
	selectedFile: SandboxFile | null;
}

export function useArtifactNavigator({
	artifactFiles,
	selectedFile,
}: UseArtifactNavigatorArgs) {
	const [recentArtifactIds, setRecentArtifactIds] = useState<string[]>([]);

	const artifactById = useMemo(() => {
		const map = new Map<string, SandboxFile>();
		for (const artifact of artifactFiles) map.set(artifact.id, artifact);
		return map;
	}, [artifactFiles]);

	useEffect(() => {
		if (!selectedFile) return;
		if (!artifactById.has(selectedFile.id)) return;
		setRecentArtifactIds((prev) => {
			const next = [
				selectedFile.id,
				...prev.filter((id) => id !== selectedFile.id),
			];
			return next.slice(0, 6);
		});
	}, [selectedFile, artifactById]);

	const recentArtifacts = useMemo(
		() =>
			recentArtifactIds
				.map((id) => artifactById.get(id))
				.filter(Boolean) as SandboxFile[],
		[artifactById, recentArtifactIds],
	);

	const selectedArtifactIndex = useMemo(
		() =>
			selectedFile
				? artifactFiles.findIndex((artifact) => artifact.id === selectedFile.id)
				: -1,
		[artifactFiles, selectedFile],
	);

	const totalArtifacts = artifactFiles.length;

	const selectNeighborId = (step: 1 | -1): string | null => {
		if (totalArtifacts === 0) return null;
		const start = selectedArtifactIndex >= 0 ? selectedArtifactIndex : 0;
		const next = (start + step + totalArtifacts) % totalArtifacts;
		return artifactFiles[next]?.id || null;
	};

	return {
		recentArtifacts,
		selectedArtifactIndex,
		totalArtifacts,
		selectNeighborId,
	};
}
