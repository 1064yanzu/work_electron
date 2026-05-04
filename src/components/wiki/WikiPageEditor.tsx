/**
 * Wiki 页面编辑器 - 创建/编辑 Wiki 页面的对话框
 */
import { useState, useEffect } from "react";
import { X, Save, Tag } from "lucide-react";

interface WikiPageEditorProps {
	mode: "create" | "edit";
	initialData?: {
		title: string;
		content: string;
		summary: string;
		tags: string[];
		page_type?: string;
	};
	onSave: (data: {
		title: string;
		content: string;
		summary: string;
		tags: string[];
		page_type: string;
	}) => void;
	onCancel: () => void;
}

const PAGE_TYPES = [
	{ value: "entity", label: "实体", desc: "工具、产品、人物、组织" },
	{ value: "concept", label: "概念", desc: "方法论、理论、原理、模式" },
	{ value: "summary", label: "摘要", desc: "对文档的结构化摘要" },
	{ value: "workflow", label: "流程", desc: "操作流程、步骤、SOP" },
];

export function WikiPageEditor({
	mode,
	initialData,
	onSave,
	onCancel,
}: WikiPageEditorProps) {
	const [title, setTitle] = useState(initialData?.title || "");
	const [content, setContent] = useState(initialData?.content || "");
	const [summary, setSummary] = useState(initialData?.summary || "");
	const [tagInput, setTagInput] = useState("");
	const [tags, setTags] = useState<string[]>(initialData?.tags || []);
	const [pageType, setPageType] = useState(initialData?.page_type || "entity");

	useEffect(() => {
		if (initialData) {
			setTitle(initialData.title);
			setContent(initialData.content);
			setSummary(initialData.summary);
			setTags(initialData.tags);
			setPageType(initialData.page_type || "entity");
		}
	}, [initialData]);

	const handleAddTag = () => {
		const tag = tagInput.trim();
		if (tag && !tags.includes(tag)) {
			setTags([...tags, tag]);
			setTagInput("");
		}
	};

	const handleRemoveTag = (tag: string) => {
		setTags(tags.filter((t) => t !== tag));
	};

	const handleSave = () => {
		if (!title.trim()) return;
		onSave({
			title: title.trim(),
			content: content.trim(),
			summary: summary.trim(),
			tags,
			page_type: pageType,
		});
	};

	return (
		<div className="flex flex-col h-full bg-surface">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-border">
				<h3 className="text-sm font-semibold text-text-primary">
					{mode === "create" ? "新建知识页面" : "编辑知识页面"}
				</h3>
				<div className="flex items-center gap-2">
					<button
						onClick={handleSave}
						disabled={!title.trim()}
						className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
					>
						<Save className="w-3.5 h-3.5" />
						保存
					</button>
					<button
						onClick={onCancel}
						className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Body */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{/* Title */}
				<div>
					<label className="block text-xs font-medium text-text-muted mb-1.5">
						标题
					</label>
					<input
						type="text"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="知识页面标题"
						className="w-full px-3 py-2 text-sm bg-warm-50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
						autoFocus
					/>
				</div>

				{/* Summary */}
				<div>
					<label className="block text-xs font-medium text-text-muted mb-1.5">
						摘要
					</label>
					<input
						type="text"
						value={summary}
						onChange={(e) => setSummary(e.target.value)}
						placeholder="一句话概括（可选）"
						className="w-full px-3 py-2 text-sm bg-warm-50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
					/>
				</div>

				{/* Page Type */}
				<div>
					<label className="block text-xs font-medium text-text-muted mb-1.5">
						页面类型
					</label>
					<div className="flex flex-wrap gap-2">
						{PAGE_TYPES.map((pt) => (
							<button
								key={pt.value}
								type="button"
								onClick={() => setPageType(pt.value)}
								className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
									pageType === pt.value
										? "border-primary bg-primary/10 text-primary font-medium"
										: "border-border text-text-muted hover:border-cream-400 dark:hover:border-cream-500"
								}`}
								title={pt.desc}
							>
								{pt.label}
							</button>
						))}
					</div>
				</div>

				{/* Content */}
				<div className="flex-1">
					<label className="block text-xs font-medium text-text-muted mb-1.5">
						内容（支持 Markdown）
					</label>
					<textarea
						value={content}
						onChange={(e) => setContent(e.target.value)}
						placeholder="在此输入知识内容..."
						className="w-full min-h-[280px] px-3 py-2 text-sm font-mono leading-relaxed bg-warm-50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors resize-y"
					/>
				</div>

				{/* Tags */}
				<div>
					<label className="block text-xs font-medium text-text-muted mb-1.5">
						标签
					</label>
					<div className="flex flex-wrap gap-1.5 mb-2">
						{tags.map((tag) => (
							<span
								key={tag}
								className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-md"
							>
								<Tag className="w-3 h-3" />
								{tag}
								<button
									onClick={() => handleRemoveTag(tag)}
									className="ml-0.5 hover:text-error transition-colors"
								>
									<X className="w-3 h-3" />
								</button>
							</span>
						))}
					</div>
					<div className="flex gap-2">
						<input
							type="text"
							value={tagInput}
							onChange={(e) => setTagInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleAddTag();
								}
							}}
							placeholder="添加标签后回车"
							className="flex-1 px-3 py-1.5 text-sm bg-warm-50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
