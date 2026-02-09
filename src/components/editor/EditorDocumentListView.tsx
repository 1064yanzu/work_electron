import { useMemo, useState } from "react";
import type { OutputAsset } from "../../types";
import { DocumentEmptyState } from "./list/DocumentEmptyState";
import { DocumentGridCard } from "./list/DocumentGridCard";
import { DocumentListBulkBar } from "./list/DocumentListBulkBar";
import { DocumentListHeader } from "./list/DocumentListHeader";
import { DocumentListSearchBar } from "./list/DocumentListSearchBar";
import {
	type DocumentViewMode,
	getOutputTypeLabel,
} from "./list/documentListMeta";
import { DocumentRowItem } from "./list/DocumentRowItem";

interface EditorDocumentListViewProps {
	onBack?: () => void;
	outputs: OutputAsset[];
	viewMode: DocumentViewMode;
	onToggleViewMode: () => void;
	isManaging: boolean;
	onToggleManaging: () => void;
	selectedForManageCount: number;
	isAllSelected: boolean;
	onToggleSelectAll: () => void;
	onRequestBulkDeleteConfirm: () => void;
	isBulkDeleting: boolean;
	onCreateNew: () => void | Promise<void>;
	onSelectOutput: (output: OutputAsset) => void | Promise<void>;
	isSelectedForManage: (id: string) => boolean;
	onToggleManageSelection: (id: string) => void;
}

export function EditorDocumentListView({
	onBack,
	outputs,
	viewMode,
	onToggleViewMode,
	isManaging,
	onToggleManaging,
	selectedForManageCount,
	isAllSelected,
	onToggleSelectAll,
	onRequestBulkDeleteConfirm,
	isBulkDeleting,
	onCreateNew,
	onSelectOutput,
	isSelectedForManage,
	onToggleManageSelection,
}: EditorDocumentListViewProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const normalizedQuery = searchQuery.trim().toLowerCase();

	const filteredOutputs = useMemo(() => {
		if (!normalizedQuery) return outputs;
		return outputs.filter((output) => {
			const title = (output.title || "").toLowerCase();
			const type = getOutputTypeLabel(output.output_type).toLowerCase();
			const tags = (output.tags || []).join(" ").toLowerCase();
			return (
				title.includes(normalizedQuery) ||
				type.includes(normalizedQuery) ||
				tags.includes(normalizedQuery)
			);
		});
	}, [normalizedQuery, outputs]);

	return (
		<div className="flex flex-col h-full editor-shell doc-surface">
			<DocumentListHeader
				onBack={onBack}
				totalCount={outputs.length}
				viewMode={viewMode}
				onToggleViewMode={onToggleViewMode}
				isManaging={isManaging}
				onToggleManaging={onToggleManaging}
				onCreateNew={onCreateNew}
			/>

			<div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6 scrollbar-hide space-y-4">
				{outputs.length > 0 ? (
					<DocumentListSearchBar
						query={searchQuery}
						onChangeQuery={setSearchQuery}
						totalCount={outputs.length}
						filteredCount={filteredOutputs.length}
					/>
				) : null}

				{isManaging && outputs.length > 0 ? (
					<DocumentListBulkBar
						selectedCount={selectedForManageCount}
						isAllSelected={isAllSelected}
						onToggleSelectAll={onToggleSelectAll}
						onDeleteSelected={onRequestBulkDeleteConfirm}
						isBulkDeleting={isBulkDeleting}
					/>
				) : null}

				{outputs.length === 0 ? (
					<DocumentEmptyState
						mode="empty"
						onCreateNew={onCreateNew}
						onClearSearch={() => setSearchQuery("")}
					/>
				) : filteredOutputs.length === 0 ? (
					<DocumentEmptyState
						mode="search_empty"
						onCreateNew={onCreateNew}
						onClearSearch={() => setSearchQuery("")}
					/>
				) : viewMode === "grid" ? (
					<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
						{filteredOutputs.map((output) => (
							<DocumentGridCard
								key={output.id}
								output={output}
								isManaging={isManaging}
								checked={isSelectedForManage(output.id)}
								onToggleManageSelection={onToggleManageSelection}
								onOpen={onSelectOutput}
							/>
						))}
					</div>
				) : (
					<div className="space-y-3">
						{filteredOutputs.map((output) => (
							<DocumentRowItem
								key={output.id}
								output={output}
								isManaging={isManaging}
								checked={isSelectedForManage(output.id)}
								onToggleManageSelection={onToggleManageSelection}
								onOpen={onSelectOutput}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
