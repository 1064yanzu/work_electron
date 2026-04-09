import {
	Brain,
	Edit3,
	Loader2,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	type Memory,
	type MemoryCategory,
	memoryStore,
} from "../../../lib/agent/memoryStore";
import { toast } from "../../ui/Toast";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import { SettingsPageContainer } from "../ui/SettingsPrimitives";

const CATEGORY_LABELS: Record<MemoryCategory, { label: string; color: string }> = {
	preference: { label: "偏好", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
	fact: { label: "事实", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
	task_result: { label: "历史结果", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
	user_habit: { label: "习惯", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
};

const CATEGORY_OPTIONS: { value: MemoryCategory; label: string }[] = [
	{ value: "preference", label: "偏好" },
	{ value: "fact", label: "事实" },
	{ value: "task_result", label: "历史结果" },
	{ value: "user_habit", label: "习惯" },
];

export function MemorySettings() {
	const [memories, setMemories] = useState<Memory[]>([]);
	const [loading, setLoading] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	// 新增记忆表单
	const [showAddForm, setShowAddForm] = useState(false);
	const [newKey, setNewKey] = useState("");
	const [newContent, setNewContent] = useState("");
	const [newCategory, setNewCategory] = useState<MemoryCategory>("fact");

	// 编辑记忆
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editContent, setEditContent] = useState("");

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

	useEffect(() => {
		loadMemories();
	}, [loadMemories]);

	const handleSearch = () => {
		loadMemories(searchQuery);
	};

	const handleAdd = async () => {
		if (!newKey.trim() || !newContent.trim()) {
			toast.warning("请填写完整的记忆标识和内容");
			return;
		}
		try {
			await memoryStore.addMemory(newKey.trim(), newContent.trim(), newCategory);
			toast.success("记忆添加成功");
			setNewKey("");
			setNewContent("");
			setNewCategory("fact");
			setShowAddForm(false);
			loadMemories(searchQuery);
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
		} catch {
			toast.error("删除记忆失败");
		}
	};

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={Brain}
				title="Agent 记忆"
				description="管理 Agent 的长期记忆，记忆会在 Agent 启动时自动注入上下文以提供个性化体验。"
				actions={
					<button
						onClick={() => setShowAddForm(!showAddForm)}
						className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors cursor-pointer"
					>
						{showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
						{showAddForm ? "取消" : "添加记忆"}
					</button>
				}
			/>

			{/* 搜索栏 */}
			<div className="flex gap-2">
				<div className="flex-1 relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleSearch()}
						placeholder="搜索记忆..."
						className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
					/>
				</div>
				<button
					onClick={handleSearch}
					className="px-4 py-2 text-sm font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors cursor-pointer"
				>
					搜索
				</button>
			</div>

			{/* 添加表单 */}
			{showAddForm && (
				<div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
					<div className="flex gap-3">
						<div className="flex-1">
							<label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
								标识 (Key)
							</label>
							<input
								type="text"
								value={newKey}
								onChange={(e) => setNewKey(e.target.value)}
								placeholder="如: user_writing_style"
								className="w-full px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
							/>
						</div>
						<div className="w-32">
							<label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
								类别
							</label>
							<select
								value={newCategory}
								onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
								className="w-full px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
							>
								{CATEGORY_OPTIONS.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</div>
					</div>
					<div>
						<label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
							内容
						</label>
						<textarea
							value={newContent}
							onChange={(e) => setNewContent(e.target.value)}
							placeholder="记忆的具体内容..."
							rows={3}
							className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none transition-colors"
						/>
					</div>
					<div className="flex justify-end">
						<button
							onClick={handleAdd}
							className="px-4 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors cursor-pointer"
						>
							保存
						</button>
					</div>
				</div>
			)}

			{/* 记忆列表 */}
			{loading ? (
				<div className="flex items-center justify-center py-12 text-zinc-400">
					<Loader2 className="w-5 h-5 animate-spin mr-2" />
					加载中...
				</div>
			) : memories.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 text-zinc-400 dark:text-zinc-500">
					<Brain className="w-10 h-10 mb-3 opacity-40" />
					<p className="text-sm">暂无记忆数据</p>
					<p className="text-xs mt-1">Agent 会在使用过程中自动积累记忆</p>
				</div>
			) : (
				<div className="space-y-2">
					{memories.map((memory) => (
						<MemoryItem
							key={memory.id}
							memory={memory}
							isEditing={editingId === memory.id}
							editContent={editContent}
							onEditStart={() => {
								setEditingId(memory.id);
								setEditContent(memory.content);
							}}
							onEditCancel={() => setEditingId(null)}
							onEditChange={setEditContent}
							onEditSave={() => handleUpdate(memory.id)}
							onDelete={() => handleDelete(memory.id)}
						/>
					))}
				</div>
			)}
		</SettingsPageContainer>
	);
}

// 单条记忆行组件
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
	const cat = CATEGORY_LABELS[memory.category];
	const dateStr = new Date(memory.updatedAt).toLocaleDateString("zh-CN");

	return (
		<div className="group rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
			<div className="flex items-start justify-between gap-3">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1.5">
						<span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${cat.color}`}>
							{cat.label}
						</span>
						<span className="text-xs font-mono text-zinc-400 dark:text-zinc-500 truncate">
							{memory.key}
						</span>
						<span className="text-[10px] text-zinc-300 dark:text-zinc-600">
							{dateStr}
						</span>
					</div>
					{isEditing ? (
						<div className="space-y-2">
							<textarea
								value={editContent}
								onChange={(e) => onEditChange(e.target.value)}
								rows={3}
								className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none transition-colors"
							/>
							<div className="flex gap-2 justify-end">
								<button
									onClick={onEditCancel}
									className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
								>
									取消
								</button>
								<button
									onClick={onEditSave}
									className="px-3 py-1 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-md transition-colors cursor-pointer"
								>
									保存
								</button>
							</div>
						</div>
					) : (
						<p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
							{memory.content}
						</p>
					)}
				</div>
				{!isEditing && (
					<div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
						<button
							onClick={onEditStart}
							className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"
							title="编辑"
						>
							<Edit3 className="w-3.5 h-3.5" />
						</button>
						<button
							onClick={onDelete}
							className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors cursor-pointer"
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
