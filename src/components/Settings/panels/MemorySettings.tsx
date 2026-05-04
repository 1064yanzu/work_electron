import {
	BarChart3,
	Bolt,
	ChevronDown,
	ChevronRight,
	ClipboardList,
	Database,
	Edit3,
	Eye,
	Hash,
	Lightbulb,
	Link2,
	Loader2,
	type LucideIcon,
	Pin,
	Plus,
	RotateCw,
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
import Select from "../../ui/Select";
import { toast } from "../../ui/Toast";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import { SettingsPageContainer } from "../ui/SettingsPrimitives";

// ==================
// 常量
// ==================

const CATEGORY_CONFIG: Record<
	MemoryCategory,
	{ label: string; color: string; icon: LucideIcon }
> = {
	instruction: {
		label: "指令",
		color: "bg-warm-200 text-text-primary",
		icon: Bolt,
	},
	preference: {
		label: "偏好",
		color: "bg-warm-200 text-text-primary",
		icon: Lightbulb,
	},
	fact: {
		label: "事实",
		color: "bg-warm-200 text-text-primary",
		icon: Pin,
	},
	context: {
		label: "上下文",
		color: "bg-warm-200 text-text-primary",
		icon: Link2,
	},
	task_result: {
		label: "历史结果",
		color: "bg-warm-200 text-text-primary",
		icon: ClipboardList,
	},
	user_habit: {
		label: "习惯",
		color: "bg-warm-200 text-text-primary",
		icon: RotateCw,
	},
};

const CATEGORY_OPTIONS: { value: MemoryCategory; label: string }[] = [
	{ value: "instruction", label: "指令" },
	{ value: "preference", label: "偏好" },
	{ value: "fact", label: "事实" },
	{ value: "context", label: "上下文" },
	{ value: "task_result", label: "历史结果" },
	{ value: "user_habit", label: "习惯" },
];

// ==================
// 主组件
// ==================

export function MemorySettings() {
	const [memories, setMemories] = useState<Memory[]>([]);
	const [loading, setLoading] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	// 统计
	const [stats, setStats] = useState<{
		total: number;
		byCategory: Record<string, number>;
	} | null>(null);

	// 新增记忆表单
	const [showAddForm, setShowAddForm] = useState(false);
	const [newKey, setNewKey] = useState("");
	const [newContent, setNewContent] = useState("");
	const [newCategory, setNewCategory] = useState<MemoryCategory>("fact");

	// 编辑记忆
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editContent, setEditContent] = useState("");

	// 上下文预览
	const [showContextPreview, setShowContextPreview] = useState(false);
	const [contextPreview, setContextPreview] = useState("");
	const [contextLoading, setContextLoading] = useState(false);

	// 折叠状态
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);

	// 确认清空弹窗
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
			// 静默失败
		}
	}, []);

	useEffect(() => {
		loadMemories();
		loadStats();
	}, [loadMemories, loadStats]);

	const handleSearch = () => {
		loadMemories(searchQuery);
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
			toast.success("记忆添加成功");
			setNewKey("");
			setNewContent("");
			setNewCategory("fact");
			setShowAddForm(false);
			loadMemories(searchQuery);
			loadStats();
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
			loadMemories(searchQuery);
		} catch {
			toast.error("更新记忆失败");
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await memoryStore.deleteMemory(id);
			toast.success("记忆已删除");
			setMemories((prev) => prev.filter((m) => m.id !== id));
			loadStats();
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
			loadStats();
		} catch {
			toast.error("清空记忆失败");
		}
	};

	const handlePreviewContext = async () => {
		setShowContextPreview(!showContextPreview);
		if (!showContextPreview) {
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

	// 按分类分组
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
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={Database}
				title="Agent 记忆"
				description="管理 Agent 的长期记忆，记忆会在 Agent 启动时自动注入上下文以提供个性化体验。"
				actions={
					<div className="flex items-center gap-2">
						{memories.length > 0 && (
							<button
								type="button"
								onClick={() => setShowClearConfirm(true)}
								className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors cursor-pointer"
							>
								<Trash2 className="w-3.5 h-3.5" />
								清空
							</button>
						)}
						<button
							type="button"
							onClick={() => setShowAddForm(!showAddForm)}
							className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors cursor-pointer"
						>
							{showAddForm ? (
								<X className="w-3.5 h-3.5" />
							) : (
								<Plus className="w-3.5 h-3.5" />
							)}
							{showAddForm ? "取消" : "添加记忆"}
						</button>
					</div>
				}
			/>

			{/* 统计卡片 */}
			{stats && stats.total > 0 && <MemoryStatsBar stats={stats} />}

			{/* 搜索栏 + 预览按钮 */}
			<div className="flex gap-2">
				<div className="flex-1 relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleSearch()}
						placeholder="搜索记忆..."
						className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
					/>
				</div>
				<button
					type="button"
					onClick={handleSearch}
					className="px-4 py-2 text-sm font-medium bg-warm-200 hover:bg-warm-300 dark:hover:bg-cream-700 text-text-secondary rounded-lg transition-colors cursor-pointer"
				>
					搜索
				</button>
				<button
					type="button"
					onClick={handlePreviewContext}
					className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
						showContextPreview
							? "bg-primary/10 text-primary dark:bg-primary/20"
							: "bg-warm-200 hover:bg-warm-300 dark:hover:bg-cream-700 text-text-secondary"
					}`}
					title="预览注入到 Agent 的记忆上下文"
				>
					<Eye className="w-4 h-4" />
					预览
				</button>
			</div>

			{/* 上下文预览 */}
			{showContextPreview && (
				<div className="rounded-xl border border-border/70 bg-warm-50/50 p-4 animate-in slide-in-from-top-2 duration-200">
					<div className="flex items-center gap-2 mb-2">
						<Eye className="w-4 h-4 text-primary" />
						<span className="text-sm font-medium text-text-secondary">
							Agent 启动时注入的记忆上下文
						</span>
					</div>
					{contextLoading ? (
						<div className="flex items-center gap-2 py-4 text-text-light">
							<Loader2 className="w-4 h-4 animate-spin" />
							<span className="text-sm">加载中...</span>
						</div>
					) : (
						<pre className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed font-mono bg-surface rounded-lg p-3 max-h-64 overflow-y-auto border border-border">
							{contextPreview}
						</pre>
					)}
				</div>
			)}

			{/* 添加表单 */}
			{showAddForm && (
				<MemoryAddForm
					newKey={newKey}
					newContent={newContent}
					newCategory={newCategory}
					onKeyChange={setNewKey}
					onContentChange={setNewContent}
					onCategoryChange={setNewCategory}
					onSave={handleAdd}
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

			{/* 记忆列表（按分类分组） */}
			{loading ? (
				<div className="flex items-center justify-center py-12 text-text-light">
					<Loader2 className="w-5 h-5 animate-spin mr-2" />
					加载中...
				</div>
			) : memories.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 text-text-light">
					<Database className="w-10 h-10 mb-3 opacity-40" />
					<p className="text-sm">暂无记忆数据</p>
					<p className="text-xs mt-1">Agent 会在使用过程中自动积累记忆</p>
				</div>
			) : (
				<div className="space-y-4">
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

// ==================
// 统计栏组件
// ==================

function MemoryStatsBar({
	stats,
}: {
	stats: { total: number; byCategory: Record<string, number> };
}) {
	return (
		<div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-warm-50/50 border border-border/50">
			<div className="flex items-center gap-1.5 text-text-muted">
				<BarChart3 className="w-4 h-4" />
				<span className="text-sm font-medium">共 {stats.total} 条</span>
			</div>
			<div className="w-px h-4 bg-warm-300 dark:bg-cream-700" />
			{Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
				const count = stats.byCategory[key] ?? 0;
				if (count === 0) return null;
				const Icon = config.icon;
				return (
					<div key={key} className="flex items-center gap-1">
						<Icon className="w-3 h-3 text-text-secondary" strokeWidth={1.5} />
						<span className="text-xs text-text-muted">{config.label}</span>
						<span className="text-xs font-medium text-text-secondary">
							{count}
						</span>
					</div>
				);
			})}
		</div>
	);
}

// ==================
// 添加表单组件
// ==================

function MemoryAddForm({
	newKey,
	newContent,
	newCategory,
	onKeyChange,
	onContentChange,
	onCategoryChange,
	onSave,
}: {
	newKey: string;
	newContent: string;
	newCategory: MemoryCategory;
	onKeyChange: (v: string) => void;
	onContentChange: (v: string) => void;
	onCategoryChange: (v: MemoryCategory) => void;
	onSave: () => void;
}) {
	return (
		<div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
			<div className="flex gap-3">
				<div className="flex-1">
					<label className="block text-xs font-medium text-text-muted mb-1">
						标识 (Key)
					</label>
					<input
						type="text"
						value={newKey}
						onChange={(e) => onKeyChange(e.target.value)}
						placeholder="如: user_writing_style"
						className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
					/>
				</div>
				<div className="w-32">
					<label className="block text-xs font-medium text-text-muted mb-1">
						类别
					</label>
					<Select
						value={newCategory}
						onChange={(e) => onCategoryChange(e.target.value as MemoryCategory)}
						variant="compact"
					>
						{CATEGORY_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</Select>
				</div>
			</div>
			<div>
				<label className="block text-xs font-medium text-text-muted mb-1">
					内容
				</label>
				<textarea
					value={newContent}
					onChange={(e) => onContentChange(e.target.value)}
					placeholder="记忆的具体内容..."
					rows={3}
					className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none transition-colors"
				/>
			</div>
			<div className="flex justify-end">
				<button
					type="button"
					onClick={onSave}
					className="px-4 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors cursor-pointer"
				>
					保存
				</button>
			</div>
		</div>
	);
}

// ==================
// 清空确认对话框
// ==================

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
		<div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 animate-in slide-in-from-top-2 duration-200">
			<p className="text-sm text-red-700 dark:text-red-400 mb-3">
				确定要清空所有 <strong>{count}</strong> 条记忆吗？此操作不可恢复。
			</p>
			<div className="flex gap-2 justify-end">
				<button
					type="button"
					onClick={onCancel}
					className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary dark:hover:text-zinc-200 cursor-pointer"
				>
					取消
				</button>
				<button
					type="button"
					onClick={onConfirm}
					className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer"
				>
					确认清空
				</button>
			</div>
		</div>
	);
}

// ==================
// 分组组件
// ==================

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
	const config = CATEGORY_CONFIG[category];
	const Icon = config.icon;

	return (
		<div className="rounded-xl border border-border/70 overflow-hidden">
			{/* 分组标题 */}
			<button
				type="button"
				onClick={onToggle}
				className="w-full flex items-center gap-2 px-4 py-2.5 bg-warm-50/50 hover:bg-warm-200/50 transition-colors cursor-pointer"
			>
				{collapsed ? (
					<ChevronRight className="w-4 h-4 text-text-light" strokeWidth={1.5} />
				) : (
					<ChevronDown className="w-4 h-4 text-text-light" strokeWidth={1.5} />
				)}
				<Icon className="w-4 h-4 text-text-secondary" strokeWidth={1.5} />
				<span className="text-sm font-medium text-text-secondary">
					{config.label}
				</span>
				<span className="text-xs text-text-light ml-1">
					({memories.length})
				</span>
			</button>

			{/* 分组内容 */}
			{!collapsed && (
				<div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
					{memories.map((memory) => (
						<MemoryItem
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
		</div>
	);
}

// ==================
// 单条记忆组件
// ==================

function MemoryItem({
	memory,
	isEditing,
	editContent,
	onEditStart,
	onEditCancel,
	onEditChange,
	onEditSave,
	onDelete,
}: {
	memory: Memory;
	isEditing: boolean;
	editContent: string;
	onEditStart: () => void;
	onEditCancel: () => void;
	onEditChange: (v: string) => void;
	onEditSave: () => void;
	onDelete: () => void;
}) {
	const cat = CATEGORY_CONFIG[memory.category];
	const dateStr = new Date(memory.updatedAt).toLocaleDateString("zh-CN");
	const lastAccess = memory.lastAccessedAt
		? new Date(memory.lastAccessedAt).toLocaleDateString("zh-CN")
		: "未访问";

	return (
		<div className="group px-4 py-3 bg-surface hover:bg-warm-50/30 transition-colors">
			<div className="flex items-start justify-between gap-3">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1.5 flex-wrap">
						<span
							className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${cat.color}`}
						>
							{cat.label}
						</span>
						<span className="text-xs font-mono text-text-light truncate">
							{memory.key}
						</span>
						<span className="text-[10px] text-text-light">更新: {dateStr}</span>
						{memory.accessCount > 0 && (
							<span className="inline-flex items-center gap-0.5 text-[10px] text-text-light">
								<Hash className="w-2.5 h-2.5" />
								{memory.accessCount}次 · 最近: {lastAccess}
							</span>
						)}
						{memory.relevanceScore > 0.5 && (
							<span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">
								{(memory.relevanceScore * 100).toFixed(0)}%
							</span>
						)}
					</div>
					{isEditing ? (
						<div className="space-y-2">
							<textarea
								value={editContent}
								onChange={(e) => onEditChange(e.target.value)}
								rows={3}
								className="w-full px-3 py-2 text-sm bg-warm-50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none transition-colors"
							/>
							<div className="flex gap-2 justify-end">
								<button
									type="button"
									onClick={onEditCancel}
									className="px-3 py-1 text-xs text-text-muted hover:text-text-secondary dark:hover:text-text-light cursor-pointer"
								>
									取消
								</button>
								<button
									type="button"
									onClick={onEditSave}
									className="px-3 py-1 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-md transition-colors cursor-pointer"
								>
									保存
								</button>
							</div>
						</div>
					) : (
						<p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
							{memory.content}
						</p>
					)}
				</div>
				{!isEditing && (
					<div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
						<button
							type="button"
							onClick={onEditStart}
							className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-md transition-colors cursor-pointer"
							title="编辑"
						>
							<Edit3 className="w-3.5 h-3.5" />
						</button>
						<button
							type="button"
							onClick={onDelete}
							className="p-1.5 text-text-light hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors cursor-pointer"
							title="删除"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
