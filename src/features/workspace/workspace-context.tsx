import { createContext, useContext, useMemo, useState } from "react";

export type WorkspaceDocKind = "source" | "output";
export type WorkspaceDoc = { kind: WorkspaceDocKind; id: string };
export type WorkspaceOpenDoc = WorkspaceDoc & { title: string };

type WorkspaceState = {
	projectId: string | null;
	folderId: string | null;
	activeDoc: WorkspaceDoc | null;
	openDocs: WorkspaceOpenDoc[];
	setProjectId: (id: string | null) => void;
	setFolderId: (id: string | null) => void;
	openDoc: (doc: WorkspaceOpenDoc) => void;
	closeDoc: (doc: WorkspaceDoc) => void;
};

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
	const [projectId, setProjectId] = useState<string | null>(null);
	const [folderId, setFolderId] = useState<string | null>(null);
	const [activeDoc, setActiveDoc] = useState<WorkspaceDoc | null>(null);
	const [openDocs, setOpenDocs] = useState<WorkspaceOpenDoc[]>([]);

	const value = useMemo<WorkspaceState>(
		() => ({
			projectId,
			folderId,
			activeDoc,
			openDocs,
			setProjectId: (id) => {
				setProjectId(id);
				setFolderId(null);
				setActiveDoc(null);
				setOpenDocs([]);
			},
			setFolderId: (id) => {
				setFolderId(id);
				setActiveDoc(null);
				setOpenDocs([]);
			},
			openDoc: (doc) => {
				setOpenDocs((prev) => {
					const exists = prev.some(
						(d) => d.kind === doc.kind && d.id === doc.id,
					);
					if (exists) return prev;
					return [...prev, doc];
				});
				setActiveDoc({ kind: doc.kind, id: doc.id });
			},
			closeDoc: (doc) => {
				setOpenDocs((prev) => {
					const next = prev.filter(
						(d) => !(d.kind === doc.kind && d.id === doc.id),
					);
					setActiveDoc((cur) => {
						if (!cur) return cur;
						if (cur.kind !== doc.kind || cur.id !== doc.id) return cur;
						const fallback = next.length ? next[next.length - 1] : undefined;
						return fallback ? { kind: fallback.kind, id: fallback.id } : null;
					});
					return next;
				});
			},
		}),
		[activeDoc, folderId, openDocs, projectId],
	);

	return (
		<WorkspaceContext.Provider value={value}>
			{children}
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace() {
	const ctx = useContext(WorkspaceContext);
	if (!ctx)
		throw new Error("useWorkspace must be used within WorkspaceProvider");
	return ctx;
}
