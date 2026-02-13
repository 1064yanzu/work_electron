import { useQuery } from "@tanstack/react-query";
import { listFolders } from "../api/sources";
import type { Folder } from "../../types";
import { queryKeys } from "./keys";

export function useFoldersQuery(projectId?: string | null) {
	return useQuery<Folder[]>({
		queryKey: queryKeys.folders(projectId),
		queryFn: () => listFolders(projectId),
	});
}
