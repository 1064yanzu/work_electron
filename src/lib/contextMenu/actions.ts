import type { ContextMenuItem } from "../../components/ui/ContextMenu";

export type MenuBuilder<T> = (ctx: T) => ContextMenuItem[];

export function buildProjectContextMenu(ctx: {
	onOpen: () => void;
	onRename: () => void;
	onToggleArchive: () => void;
	onDelete: () => void;
	onReveal: () => void;
	isArchived: boolean;
}): ContextMenuItem[] {
	return [
		{ label: "打开项目", onClick: ctx.onOpen },
		{ label: "重命名", onClick: ctx.onRename },
		{
			label: ctx.isArchived ? "取消归档" : "归档项目",
			onClick: ctx.onToggleArchive,
		},
		{ label: "在文件管理器中显示", onClick: ctx.onReveal },
		{ separator: true, label: "" as string, onClick: () => {} },
		{ label: "删除项目", onClick: ctx.onDelete, danger: true },
	];
}

export function buildDocumentTabContextMenu(ctx: {
	onClose: () => void;
	onCloseOthers: () => void;
	onCloseRight: () => void;
	onCopyPath?: () => void;
	onMove?: () => void;
	onDelete?: () => void;
}): ContextMenuItem[] {
	const items: ContextMenuItem[] = [
		{ label: "关闭", onClick: ctx.onClose },
		{ label: "关闭其他", onClick: ctx.onCloseOthers },
		{ label: "关闭右侧", onClick: ctx.onCloseRight },
	];
	if (ctx.onCopyPath)
		items.push({ label: "复制文档路径", onClick: ctx.onCopyPath });
	if (ctx.onMove) items.push({ label: "移动到...", onClick: ctx.onMove });
	if (ctx.onDelete)
		items.push({ label: "删除文档", onClick: ctx.onDelete, danger: true });
	return items;
}

export function buildFileItemContextMenu(ctx: {
	onOpen: () => void;
	onRename?: () => void;
	onMove?: () => void;
	onCopyPath?: () => void;
	onReveal?: () => void;
	onSetTags?: () => void;
	onSetGlobal?: () => void;
	onSetProject?: () => void;
	onDelete?: () => void;
	canSetScope?: boolean;
}): ContextMenuItem[] {
	const items: ContextMenuItem[] = [{ label: "打开", onClick: ctx.onOpen }];
	if (ctx.onRename) items.push({ label: "重命名", onClick: ctx.onRename });
	if (ctx.onMove) items.push({ label: "移动到...", onClick: ctx.onMove });
	if (ctx.onCopyPath)
		items.push({ label: "复制路径", onClick: ctx.onCopyPath });
	if (ctx.onReveal)
		items.push({ label: "在文件管理器中显示", onClick: ctx.onReveal });
	if (ctx.onSetTags) items.push({ label: "标签管理", onClick: ctx.onSetTags });
	if (ctx.canSetScope && ctx.onSetGlobal) {
		items.push({ label: "设为全局可见", onClick: ctx.onSetGlobal });
	}
	if (ctx.canSetScope && ctx.onSetProject) {
		items.push({ label: "设为项目内可见", onClick: ctx.onSetProject });
	}
	if (ctx.onDelete)
		items.push({ label: "删除", onClick: ctx.onDelete, danger: true });
	return items;
}

export function buildFolderItemContextMenu(ctx: {
	onCreateFile: () => void;
	onCreateSubFolder: () => void;
	onRename: () => void;
	onMove: () => void;
	onReveal?: () => void;
	onDelete: () => void;
}): ContextMenuItem[] {
	const items: ContextMenuItem[] = [
		{ label: "新建文件", onClick: ctx.onCreateFile },
		{ label: "新建子文件夹", onClick: ctx.onCreateSubFolder },
		{ separator: true, label: "" as string, onClick: () => {} },
		{ label: "重命名", onClick: ctx.onRename },
		{ label: "移动到...", onClick: ctx.onMove },
	];
	if (ctx.onReveal) {
		items.push({ label: "在文件管理器中显示", onClick: ctx.onReveal });
	}
	items.push(
		{ separator: true, label: "" as string, onClick: () => {} },
		{ label: "删除文件夹", onClick: ctx.onDelete, danger: true },
	);
	return items;
}

export function buildSessionContextMenu(ctx: {
	onOpen: () => void;
	onRename: () => void;
	onTogglePin: () => void;
	onExport: () => void;
	onDelete: () => void;
	pinned?: boolean;
}): ContextMenuItem[] {
	return [
		{ label: "打开会话", onClick: ctx.onOpen },
		{ label: "重命名", onClick: ctx.onRename },
		{ label: ctx.pinned ? "取消置顶" : "置顶", onClick: ctx.onTogglePin },
		{ label: "导出 Markdown", onClick: ctx.onExport },
		{ label: "删除会话", onClick: ctx.onDelete, danger: true },
	];
}

export function buildLinkContextMenu(ctx: {
	onOpen: () => void;
	onCopy: () => void;
	onSaveGlobal: () => void;
	onSaveProject: () => void;
	onRemove?: () => void;
}): ContextMenuItem[] {
	const items: ContextMenuItem[] = [
		{ label: "打开链接", onClick: ctx.onOpen },
		{ label: "复制链接", onClick: ctx.onCopy },
		{ label: "保存到全局", onClick: ctx.onSaveGlobal },
		{ label: "保存到当前项目", onClick: ctx.onSaveProject },
	];
	if (ctx.onRemove) {
		items.push({ label: "从列表移除", onClick: ctx.onRemove, danger: true });
	}
	return items;
}

export function buildEditorBlankContextMenu(ctx: {
	onCreate: () => void;
	onPaste: () => void;
	onRefresh: () => void;
}): ContextMenuItem[] {
	return [
		{ label: "新建文档", onClick: ctx.onCreate },
		{ label: "粘贴", onClick: ctx.onPaste },
		{ label: "刷新文档列表", onClick: ctx.onRefresh },
	];
}
