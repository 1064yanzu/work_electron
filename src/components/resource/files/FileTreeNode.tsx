import { useEffect, useRef, type KeyboardEvent } from "react";
import {
	ChevronDown,
	ChevronRight,
	File,
	Folder,
	FolderOpen,
} from "lucide-react";
import { cn } from "../../../lib/utils";

export interface FileEntry {
	path: string;
	name: string;
	isDir: boolean;
	size?: number;
	mtimeMs?: number;
}

interface FileTreeNodeProps {
	entry: FileEntry;
	level: number;
	isExpanded: boolean;
	isSelected: boolean;
	isRenaming: boolean;
	onToggle: (entry: FileEntry) => void;
	onSelect: (entry: FileEntry) => void;
	onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
	onRenameSubmit: (entry: FileEntry, nextName: string) => void;
	onRenameCancel: () => void;
}

export function FileTreeNode({
	entry,
	level,
	isExpanded,
	isSelected,
	isRenaming,
	onToggle,
	onSelect,
	onContextMenu,
	onRenameSubmit,
	onRenameCancel,
}: FileTreeNodeProps) {
	const indent = `${Math.max(0.5, level * 0.75 + 0.5)}rem`;

	if (isRenaming) {
		return (
			<div
				className="flex items-center w-full px-2 py-1.5"
				style={{ paddingLeft: indent }}
			>
				<span className="w-4 h-4 mr-1 flex items-center justify-center shrink-0 text-text-light">
					{entry.isDir ? (
						isExpanded ? (
							<ChevronDown className="w-3.5 h-3.5" />
						) : (
							<ChevronRight className="w-3.5 h-3.5" />
						)
					) : (
						<span className="w-1.5" />
					)}
				</span>
				<span className="mr-2 shrink-0 text-text-light">
					{entry.isDir ? (
						<Folder className="w-4 h-4 text-terracotta/80" />
					) : (
						<File className="w-4 h-4 text-text-light" />
					)}
				</span>
				<InlineRenameInput
					initialValue={entry.name}
					onSubmit={(value) => onRenameSubmit(entry, value)}
					onCancel={onRenameCancel}
				/>
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={() => {
				onSelect(entry);
				onToggle(entry);
			}}
			onContextMenu={(e) => onContextMenu(e, entry)}
			className={cn(
				"flex items-center w-full px-2 py-1.5 text-left group transition-colors text-sm",
				isSelected ? "bg-warm-200/80" : "hover:bg-warm-200/50",
			)}
			style={{ paddingLeft: indent }}
		>
			<span className="w-4 h-4 mr-1 flex items-center justify-center shrink-0 text-text-light group-hover:text-text-secondary dark:group-hover:text-text-light">
				{entry.isDir ? (
					isExpanded ? (
						<ChevronDown className="w-3.5 h-3.5" />
					) : (
						<ChevronRight className="w-3.5 h-3.5" />
					)
				) : (
					<span className="w-1.5" />
				)}
			</span>
			<span className="mr-2 shrink-0 text-text-light group-hover:text-text-muted">
				{entry.isDir ? (
					isExpanded ? (
						<FolderOpen className="w-4 h-4 text-terracotta/80" />
					) : (
						<Folder className="w-4 h-4 text-terracotta/80" />
					)
				) : (
					<File className="w-4 h-4 text-text-light" />
				)}
			</span>
			<span
				className={cn(
					"truncate",
					entry.isDir ? "text-text-primary" : "text-text-secondary",
				)}
			>
				{entry.name}
			</span>
		</button>
	);
}

interface InlineCreateRowProps {
	level: number;
	type: "file" | "folder";
	onSubmit: (name: string) => void;
	onCancel: () => void;
}

/** 在某个目录下方插入的"新建中"行（占位输入框，不绑定到具体 entry）。 */
export function InlineCreateRow({
	level,
	type,
	onSubmit,
	onCancel,
}: InlineCreateRowProps) {
	const indent = `${Math.max(0.5, level * 0.75 + 0.5)}rem`;
	return (
		<div
			className="flex items-center w-full px-2 py-1.5"
			style={{ paddingLeft: indent }}
		>
			<span className="w-4 h-4 mr-1 shrink-0" />
			<span className="mr-2 shrink-0 text-text-light">
				{type === "folder" ? (
					<Folder className="w-4 h-4 text-terracotta/80" />
				) : (
					<File className="w-4 h-4 text-text-light" />
				)}
			</span>
			<InlineRenameInput
				initialValue=""
				placeholder={type === "folder" ? "新建文件夹..." : "新建文件..."}
				onSubmit={onSubmit}
				onCancel={onCancel}
			/>
		</div>
	);
}

interface InlineRenameInputProps {
	initialValue: string;
	placeholder?: string;
	onSubmit: (value: string) => void;
	onCancel: () => void;
}

function InlineRenameInput({
	initialValue,
	placeholder,
	onSubmit,
	onCancel,
}: InlineRenameInputProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.focus();
		if (initialValue) {
			const dotIdx = initialValue.lastIndexOf(".");
			if (dotIdx > 0) {
				el.setSelectionRange(0, dotIdx);
			} else {
				el.select();
			}
		}
	}, [initialValue]);

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			const value = (e.target as HTMLInputElement).value.trim();
			if (value) onSubmit(value);
			else onCancel();
		} else if (e.key === "Escape") {
			e.preventDefault();
			onCancel();
		}
		e.stopPropagation();
	};

	return (
		<input
			ref={inputRef}
			type="text"
			defaultValue={initialValue}
			placeholder={placeholder}
			onKeyDown={handleKeyDown}
			onBlur={(e) => {
				const value = e.target.value.trim();
				if (value && value !== initialValue) onSubmit(value);
				else onCancel();
			}}
			className="flex-1 min-w-0 px-1.5 py-0.5 text-sm bg-surface border border-primary/40 rounded outline-none focus:ring-2 focus:ring-primary/30"
		/>
	);
}
