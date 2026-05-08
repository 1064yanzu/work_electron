import {
	ChevronDown,
	ChevronRight,
	Database,
	Eye,
	EyeOff,
	Loader2,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type Memory,
	type MemoryCategory,
	memoryStore,
} from "../../../lib/agent/memoryStore";
import { toast } from "../../ui/Toast";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsButton,
	SettingsCardSection,
	SettingsPageContainer,
	SettingsTextInput,
} from "../ui/SettingsPrimitives";
import { cn } from "../../../lib/utils";
import { MEMORY_CATEGORY_STYLES } from "./memory/categoryConfig";
import { MemoryAddInline } from "./memory/MemoryAddInline";
import { MemoryItemRow } from "./memory/MemoryItemRow";
import { MemoryStatsGrid } from "./memory/MemoryStatsGrid";

export function MemorySettings() {
	const [memories, setMemories] = useState<Memory[]>([]);
	const [loading, setLoading] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [stats, setStats] = useState<{
		total: number;
		byCategory: Record<string, number>;
	} | null>(null);

	// 新增表单
	const [showAddForm, setShowAddForm] = useState(false);
	const [newKey, setNewKey] = useState("");
	const [newContent, setNewContent] = useState("");
	const [newCategory, setNewCategory] = useState<MemoryCategory>("fact");

	// 编辑
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editContent, setEditContent] = useState("");

	// 上下文预览
	const [showContextPreview, setShowContextPreview] = useState(false);
	const [contextPreview, setContextPreview] = useState("");
	const [contextLoading, setContextLoading] = useState(false);

	// 折叠
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);

	// 清空确认
	const [showClearConfirm, setShowClearConfirm] = useState(false);

	const loadMemories = useCallback(async (query?: string) => {
		setLoading(true);
		try {
			const q = query?.trim() || "all";
			const result = await memoryStore.searchMemories(q, 50);
			setMemories(result);
		} catch {
			toast.error("加载记忆失败");
		} finally {
			setLoading(false);
		}
	}, []);

	const loadStats = useCallback(async () => {
		try {
			const result = await memoryStore.getStats();
			setStats(result);
		} catch {
			// 静默
		}
	}, []);

	useEffect(() => {
		void loadMemories();
		void loadStats();
	}, [loadMemories, loadStats]);

	const handleSearch = () => {
		void loadMemories(searchQuery);
	};

	const handleAdd = async () => {
		if (!newKey.trim() || !newContent.trim()) {
			toast.warning("请填写完整的记忆标识和内容");
			return;
		}
		try {
			await memoryStore.addMemory(
				newKey.trim(),
				newContent.trim(),
				newCategory,
			);
			toast.success("记忆已添加");
			setNewKey("");
			setNewContent("");
			setNewCategory("fact");
			setShowAddForm(false);
			void loadMemories(searchQuery);
			void loadStats();
		} catch {
			toast.error("添加记忆失败");
		}
	};

	const handleUpdate = async (id: string) => {
		if (!editContent.trim()) return;
		try {
			await memoryStore.updateMemory(id, editContent.trim());
			toast.success("记忆已更新");
			setEditingId(null);
			void loadMemories(searchQuery);
		} catch {
			toast.error("更新记忆失败");
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await memoryStore.deleteMemory(id);
			toast.success("记忆已删除");
			setMemories((prev) => prev.filter((m) => m.id !== id));
			void loadStats();
		} catch {
			toast.error("删除记忆失败");
		}
	};

	const handleClearAll = async () => {
		try {
			const result = await memoryStore.clearAll();
			toast.success(`已清空 ${result.deleted} 条记忆`);
			setMemories([]);
			setShowClearConfirm(false);
			void loadStats();
		} catch {
			toast.error("清空记忆失败");
		}
	};

	const handlePreviewContext = async () => {
		const next = !showContextPreview;
		setShowContextPreview(next);
		if (next) {
			setContextLoading(true);
			try {
				const result = await memoryStore.getMemoryContext();
				setContextPreview(
					result.context ||
						"（当前无记忆数据，Agent 启动时不会注入记忆上下文）",
				);
			} catch {
				setContextPreview("加载失败");
			} finally {
				setContextLoading(false);
			}
		}
	};

	const toggleGroup = (category: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(category)) {
				next.delete(category);
			} else {
				next.add(category);
			}
			return next;
		});
	};

	const groupedMemories = useMemo(() => {
		const groups = new Map<MemoryCategory, Memory[]>();
		for (const m of memories) {
			const cat = m.category;
			if (!groups.has(cat)) {
				groups.set(cat, []);
			}
			groups.get(cat)!.push(m);
		}
		return groups;
	}, [memories]);

	return (
		<SettingsPageContainer contentClassName="max-w-4xl space-y-6">
			<SettingsPanelHeader
				icon={Database}
				title="Agent 记忆"
				description="管理 Agent 的长期记忆，启动时会按相关性注入到上下文，让助手记住偏好与历史结论。"
				actions={
					<div className="flex items-center gap-2">
						{memories.length > 0 && (
							<SettingsButton
								variant="danger"
								icon={Trash2}
								onClick={() => setShowClearConfirm(true)}
							>
								清空
							</SettingsButton>
						)}
						<SettingsButton
							variant={showAddForm ? "secondary" : "primary"}
							icon={showAddForm ? X : Plus}
							onClick={() => setShowAddForm((v) => !v)}
						>
							{showAddForm ? "取消" : "添加记忆"}
						</SettingsButton>
					</div>
				}
			/>

			{/* 顶部统计 */}
			{stats && stats.total > 0 && <MemoryStatsGrid stats={stats} />}

			{/* 搜索 + 预览 */}
			<div className="rounded-2xl border border-border bg-surface px-4 py-3 shadow-bai-card">
				<div className="flex gap-2">
					<div className="flex-1">
						<SettingsTextInput
							value={searchQuery}
							onChange={(value) => setSearchQuery(value)}
							onKeyDown={(e) => e.key === "Enter" && handleSearch()}
							placeholder="按 key 或内容搜索…"
							prefix={<Search className="h-3.5 w-3.5" strokeWidth={1.8} />}
						/>
					</div>
					<SettingsButton variant="secondary" onClick={handleSearch}>
						搜索
					</SettingsButton>
					<SettingsButton
						variant={showContextPreview ? "primary" : "secondary"}
						icon={showContextPreview ? EyeOff : Eye}
						onClick={handlePreviewContext}
						title="预览注入到 Agent 的记忆上下文"
					>
						{showContextPreview ? "收起预览" : "预览"}
					</SettingsButton>
				</div>

				{/* 上下文预览 */}
				{showContextPreview && (
					<div className="mt-3 animate-in slide-in-from-top-2 duration-200">
						<div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-text-muted">
							<Eye className="h-3 w-3" strokeWidth={1.6} />
							Agent 启动时注入的记忆上下文
						</div>
						{contextLoading ? (
							<div className="flex items-center gap-2 rounded-xl border border-border bg-cream-50 px-4 py-3 text-[12px] text-text-light">
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
								加载中…
							</div>
						) : (
							<pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-cream-50 p-3 font-mono text-[11.5px] leading-relaxed text-text-secondary">
								{contextPreview}
							</pre>
						)}
					</div>
				)}
			</div>

			{/* 添加表单 */}
			{showAddForm && (
				<MemoryAddInline
					newKey={newKey}
					newContent={newContent}
					newCategory={newCategory}
					onKeyChange={setNewKey}
					onContentChange={setNewContent}
					onCategoryChange={setNewCategory}
					onSave={handleAdd}
					onCancel={() => setShowAddForm(false)}
				/>
			)}

			{/* 清空确认 */}
			{showClearConfirm && (
				<ClearConfirmDialog
					count={stats?.total ?? memories.length}
					onConfirm={handleClearAll}
					onCancel={() => setShowClearConfirm(false)}
				/>
			)}

			{/* 记忆列表 */}
			{loading ? (
				<div className="flex items-center justify-center py-12 text-text-light">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					<span className="text-[13px]">加载中…</span>
				</div>
			) : memories.length === 0 ? (
				<EmptyState />
			) : (
				<div className="space-y-3">
					{Array.from(groupedMemories.entries()).map(([category, items]) => (
						<MemoryGroup
							key={category}
							category={category}
							memories={items}
							collapsed={collapsedGroups.has(category)}
							onToggle={() => toggleGroup(category)}
							editingId={editingId}
							editContent={editContent}
							onEditStart={(id, content) => {
								setEditingId(id);
								setEditContent(content);
							}}
							onEditCancel={() => setEditingId(null)}
							onEditChange={setEditContent}
							onEditSave={(id) => handleUpdate(id)}
							onDelete={handleDelete}
						/>
					))}
				</div>
			)}
		</SettingsPageContainer>
	);
}

// ====================
// 内部组件
// ====================

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-cream-50 px-6 py-16 text-center">
			<div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface">
				<Database className="h-5 w-5 text-text-light" strokeWidth={1.5} />
			</div>
			<p className="text-[13px] font-medium text-text-secondary">
				暂无记忆数据
			</p>
			<p className="mt-1 max-w-[280px] text-[11.5px] leading-relaxed text-text-muted">
				Agent 会在使用过程中自动积累，你也可以点击右上角「添加记忆」手动写入。
			</p>
		</div>
	);
}

function ClearConfirmDialog({
	count,
	onConfirm,
	onCancel,
}: {
	count: number;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(181,51,51,0.28)] bg-[rgba(181,51,51,0.06)] px-4 py-3 animate-in slide-in-from-top-2 duration-200">
			<div>
				<div className="text-[13px] font-medium text-error">
					确认清空所有 {count} 条记忆
				</div>
				<div className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
					此操作不可恢复，Agent 将失去所有积累的偏好与上下文。
				</div>
			</div>
			<div className="flex gap-2">
				<SettingsButton variant="secondary" onClick={onCancel}>
					取消
				</SettingsButton>
				<SettingsButton variant="danger-solid" onClick={onConfirm}>
					确认清空
				</SettingsButton>
			</div>
		</div>
	);
}

function MemoryGroup({
	category,
	memories,
	collapsed,
	onToggle,
	editingId,
	editContent,
	onEditStart,
	onEditCancel,
	onEditChange,
	onEditSave,
	onDelete,
}: {
	category: MemoryCategory;
	memories: Memory[];
	collapsed: boolean;
	onToggle: () => void;
	editingId: string | null;
	editContent: string;
	onEditStart: (id: string, content: string) => void;
	onEditCancel: () => void;
	onEditChange: (v: string) => void;
	onEditSave: (id: string) => void;
	onDelete: (id: string) => void;
}) {
	const style = MEMORY_CATEGORY_STYLES[category];
	const Icon = style.icon;

	return (
		<SettingsCardSection>
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-cream-50"
			>
				{collapsed ? (
					<ChevronRight className="h-4 w-4 text-text-light" strokeWidth={1.6} />
				) : (
					<ChevronDown className="h-4 w-4 text-text-light" strokeWidth={1.6} />
				)}
				<span
					className={cn(
						"inline-flex h-7 w-7 items-center justify-center rounded-lg",
						style.accentBg,
					)}
				>
					<Icon
						className={cn("h-3.5 w-3.5", style.accentText)}
						strokeWidth={1.8}
					/>
				</span>
				<span className="text-[13px] font-semibold text-text-primary">
					{style.label}
				</span>
				<span className="text-[11.5px] text-text-muted">
					{memories.length} 条
				</span>
			</button>
			{!collapsed && (
				<div className="border-t border-border divide-y divide-border/60">
					{memories.map((memory) => (
						<MemoryItemRow
							key={memory.id}
							memory={memory}
							isEditing={editingId === memory.id}
							editContent={editContent}
							onEditStart={() => onEditStart(memory.id, memory.content)}
							onEditCancel={onEditCancel}
							onEditChange={onEditChange}
							onEditSave={() => onEditSave(memory.id)}
							onDelete={() => onDelete(memory.id)}
						/>
					))}
				</div>
			)}
		</SettingsCardSection>
	);
}
