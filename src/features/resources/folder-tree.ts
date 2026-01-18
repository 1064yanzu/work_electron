import type { Folder } from "../../../electron/shared/types";

export type FolderNode = Folder & { children: FolderNode[] };

export function buildFolderTree(folders: Folder[]) {
	const byId = new Map<string, FolderNode>();
	for (const f of folders) byId.set(f.id, { ...f, children: [] });

	const roots: FolderNode[] = [];
	for (const node of byId.values()) {
		const parentId = node.parent_id;
		if (parentId && byId.has(parentId)) {
			byId.get(parentId)?.children.push(node);
		} else {
			roots.push(node);
		}
	}

	const sort = (nodes: FolderNode[]) => {
		nodes.sort((a, b) => a.name.localeCompare(b.name));
		for (const n of nodes) sort(n.children);
	};
	sort(roots);

	return roots;
}
