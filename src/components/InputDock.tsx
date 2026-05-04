import {
	AlignLeft,
	FileText,
	Globe,
	Image as ImageIcon,
	Layers,
	Link,
	Mic,
	Plus,
	Search,
	Settings,
	Type,
	Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	createSource,
	fetchUrlContent,
	listSources,
	searchSources,
	uploadFileContent,
} from "../lib/api";
import { workspaceStore } from "../lib/workspaceStore";
import { type Source, SourceType } from "../types";
import { Modal } from "./ui/Modal";
import { toast } from "./ui/Toast";

interface InputDockProps {
	onOpenSettings: () => void;
}

export default function InputDock({ onOpenSettings }: InputDockProps) {
	const [sources, setSources] = useState<Source[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	// Modal State
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<"web" | "text" | "file">("web");
	const [newSourceTitle, setNewSourceTitle] = useState("");
	const [newSourceContent, setNewSourceContent] = useState(""); // URL or Text content
	const [selectedFile, setSelectedFile] = useState<File | null>(null);

	const fetchSources = async () => {
		try {
			setIsLoading(true);
			const data = await listSources();
			setSources(data);
		} catch (error) {
			console.error("获取来源失败:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleSearch = async (query: string) => {
		setSearchQuery(query);
		if (!query.trim()) {
			fetchSources();
			return;
		}
		try {
			setIsLoading(true);
			const data = await searchSources({ keyword: query });
			setSources(data);
		} catch (error) {
			console.error("搜索来源失败:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleCreateSource = async () => {
		if (!newSourceTitle.trim()) {
			toast.warning("请输入标题");
			return;
		}

		try {
			const project_id =
				workspaceStore.getState().currentProjectId || undefined;
			const currentFolderId = workspaceStore.getState().currentFolderId;
			const folder_id =
				currentFolderId && currentFolderId !== "__unassigned__"
					? currentFolderId
					: undefined;
			if (activeTab === "web") {
				// URL 抓取
				if (!newSourceContent.trim()) {
					toast.warning("请输入 URL");
					return;
				}
				await fetchUrlContent({
					url: newSourceContent,
					title: newSourceTitle,
					tags: [],
					project_id,
					folder_id,
				});
			} else if (activeTab === "text") {
				// 文本导入
				await createSource({
					title: newSourceTitle,
					kind: SourceType.Text,
					tags: [],
					project_id,
					folder_id,
				});
			} else if (activeTab === "file") {
				// 文件上传（当前为文本内容模拟）
				if (!newSourceContent.trim()) {
					toast.warning("请输入文件内容");
					return;
				}
				await uploadFileContent({
					title: newSourceTitle,
					content: newSourceContent,
					file_type: "txt",
					tags: [],
					project_id,
					folder_id,
				});
			}

			setIsAddModalOpen(false);
			setNewSourceTitle("");
			setNewSourceContent("");
			setSelectedFile(null);
			fetchSources();
		} catch (error) {
			console.error("创建来源失败:", error);
			toast.error(
				`创建来源失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	useEffect(() => {
		fetchSources();
	}, []);

	const getIconForSource = (kind: SourceType) => {
		switch (kind) {
			case SourceType.Web:
				return <Globe className="w-4 h-4" />;
			case SourceType.Audio:
				return <Mic className="w-4 h-4" />;
			case SourceType.Document:
				return <FileText className="w-4 h-4" />;
			case SourceType.Text:
				return <Type className="w-4 h-4" />;
			case SourceType.Image:
				return <ImageIcon className="w-4 h-4" />;
			default:
				return <FileText className="w-4 h-4" />;
		}
	};

	return (
		<aside className="flex-1 border-r border-cream-300 dark:border-cream-500 bg-cream-100 dark:bg-cream-800 flex flex-col h-full font-sans min-w-0">
			{/* Header */}
			<div className="px-4 py-3.5 border-b border-cream-300 dark:border-cream-500 flex items-center gap-2 shrink-0">
				<Layers className="w-4 h-4 text-text-secondary" strokeWidth={1.5} />
				<h2 className="font-semibold text-[13px] tracking-[-0.01em] text-text-primary">
					输入码头
				</h2>
			</div>

			{/* Search */}
			<div className="px-3 py-3 border-b border-cream-300 dark:border-cream-500 shrink-0">
				<div className="relative">
					<Search
						className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
						strokeWidth={1.5}
					/>
					<input
						type="text"
						placeholder="搜索来源..."
						value={searchQuery}
						onChange={(e) => handleSearch(e.target.value)}
						className="w-full pl-9 pr-3.5 py-2 text-[13px] bg-cream-50 dark:bg-cream-900 border border-cream-400 dark:border-cream-500 rounded-full focus:outline-none focus:ring-2 focus:ring-cream-400/40 focus:border-cream-500 text-text-primary placeholder:text-text-muted transition-all"
					/>
				</div>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
				{isLoading ? (
					<div className="text-center py-8 text-text-muted text-sm">
						加载中...
					</div>
				) : sources.length === 0 ? (
					<div className="text-center py-8 text-text-muted text-sm">
						暂无数据
					</div>
				) : (
					sources.map((source) => (
						<div
							key={source.id}
							className="p-3 bg-cream-50 dark:bg-cream-900 rounded-2xl border border-cream-400 dark:border-cream-500 shadow-bai-card hover:border-cream-500 hover:shadow-bai-pop transition-all cursor-pointer group"
						>
							<div className="flex items-start justify-between mb-1.5 gap-2">
								<div className="font-medium text-[13px] tracking-[-0.005em] text-text-primary line-clamp-2">
									{source.title}
								</div>
								<span className="text-text-muted shrink-0 group-hover:text-text-primary transition-colors">
									{getIconForSource(source.kind)}
								</span>
							</div>
							<div className="flex items-center justify-between text-[11px] text-text-muted">
								<span className="capitalize">
									{source.kind === "web"
										? "网页"
										: source.kind === "text"
											? "文本"
											: source.kind}
								</span>
								<span className="tabular-nums">
									{new Date(source.created_at).toLocaleDateString()}
								</span>
							</div>
							{source.url && (
								<div
									className="mt-2 text-[11px] text-text-secondary truncate hover:text-text-primary"
									title={source.url}
								>
									{source.url}
								</div>
							)}
						</div>
					))
				)}
			</div>

			{/* Footer Actions */}
			<div className="p-3 border-t border-cream-300 dark:border-cream-500 shrink-0 space-y-2">
				<button
					onClick={() => setIsAddModalOpen(true)}
					className="w-full py-2.5 px-4 bg-cream-900 dark:bg-cream-50 text-cream-50 dark:text-cream-900 rounded-full hover:bg-cream-800 dark:hover:bg-cream-100 transition-all text-[13px] font-medium flex items-center justify-center gap-2"
				>
					<Plus className="w-4 h-4" strokeWidth={1.5} />
					新增来源
				</button>

				<button
					onClick={onOpenSettings}
					className="w-full py-2 px-4 flex items-center justify-center gap-2 text-text-muted hover:text-text-primary transition-colors text-[12px]"
				>
					<Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
					设置与统计
				</button>
			</div>

			{/* Add Source Modal */}
			<Modal
				isOpen={isAddModalOpen}
				onClose={() => setIsAddModalOpen(false)}
				title="新增输入来源"
			>
				<div className="space-y-6">
					{/* Tabs */}
					<div className="flex p-1 bg-cream-100 dark:bg-cream-800 rounded-full border border-cream-300 dark:border-cream-500">
						<button
							onClick={() => setActiveTab("web")}
							className={`flex-1 flex items-center justify-center gap-2 py-2 text-[13px] font-medium rounded-full transition-all ${
								activeTab === "web"
									? "bg-cream-50 dark:bg-cream-900 text-text-primary shadow-bai-card"
									: "text-text-secondary hover:text-text-primary"
							}`}
						>
							<Link className="w-4 h-4" strokeWidth={1.5} />
							网页
						</button>
						<button
							onClick={() => setActiveTab("text")}
							className={`flex-1 flex items-center justify-center gap-2 py-2 text-[13px] font-medium rounded-full transition-all ${
								activeTab === "text"
									? "bg-cream-50 dark:bg-cream-900 text-text-primary shadow-bai-card"
									: "text-text-secondary hover:text-text-primary"
							}`}
						>
							<AlignLeft className="w-4 h-4" strokeWidth={1.5} />
							文本
						</button>
						<button
							onClick={() => setActiveTab("file")}
							className={`flex-1 flex items-center justify-center gap-2 py-2 text-[13px] font-medium rounded-full transition-all ${
								activeTab === "file"
									? "bg-cream-50 dark:bg-cream-900 text-text-primary shadow-bai-card"
									: "text-text-secondary hover:text-text-primary"
							}`}
						>
							<Upload className="w-4 h-4" strokeWidth={1.5} />
							文件
						</button>
					</div>

					{/* Fields */}
					<div className="space-y-4">
						<div>
							<label className="block text-[11px] font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
								标题
							</label>
							<input
								type="text"
								value={newSourceTitle}
								onChange={(e) => setNewSourceTitle(e.target.value)}
								className="w-full px-3.5 py-2 bg-cream-50 dark:bg-cream-900 border border-cream-400 dark:border-cream-500 rounded-full focus:outline-none focus:ring-2 focus:ring-cream-400/40 focus:border-cream-500 text-text-primary text-[13px]"
								placeholder="例如：React 官方文档"
							/>
						</div>

						{activeTab === "web" && (
							<div>
								<label className="block text-[11px] font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
									URL 链接
								</label>
								<input
									type="url"
									value={newSourceContent}
									onChange={(e) => setNewSourceContent(e.target.value)}
									className="w-full px-3.5 py-2 bg-cream-50 dark:bg-cream-900 border border-cream-400 dark:border-cream-500 rounded-full focus:outline-none focus:ring-2 focus:ring-cream-400/40 focus:border-cream-500 text-text-primary text-[13px] font-mono"
									placeholder="https://..."
								/>
							</div>
						)}

						{activeTab === "text" && (
							<div>
								<label className="block text-[11px] font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
									文本内容
								</label>
								<textarea
									value={newSourceContent}
									onChange={(e) => setNewSourceContent(e.target.value)}
									rows={6}
									className="w-full px-3.5 py-2.5 bg-cream-50 dark:bg-cream-900 border border-cream-400 dark:border-cream-500 rounded-2xl focus:outline-none focus:ring-2 focus:ring-cream-400/40 focus:border-cream-500 text-text-primary text-[13px] resize-none"
									placeholder="在此粘贴文本..."
								/>
							</div>
						)}

						{activeTab === "file" && (
							<div>
								<label className="block text-[11px] font-medium text-text-secondary mb-1.5 uppercase tracking-wide">
									选择文件
								</label>
								<div
									className="border border-dashed border-cream-400 dark:border-cream-500 rounded-2xl p-8 text-center hover:bg-cream-100 dark:hover:bg-cream-800 transition-colors cursor-pointer group relative"
									onClick={() =>
										document.getElementById("file-upload")?.click()
									}
								>
									<input
										id="file-upload"
										type="file"
										accept=".pdf,.docx,.doc,.txt,.md,.mp3,.wav,.m4a"
										className="hidden"
										onChange={async (e) => {
											const file = e.target.files?.[0];
											if (file) {
												setSelectedFile(file);
												if (!newSourceTitle) {
													setNewSourceTitle(file.name);
												}
												// Read file content
												const reader = new FileReader();
												reader.onload = (event) => {
													const content = event.target?.result as string;
													setNewSourceContent(content);
												};
												reader.readAsText(file);
											}
										}}
									/>
									{selectedFile ? (
										<div>
											<FileText
												className="w-8 h-8 text-text-primary mx-auto mb-3"
												strokeWidth={1.5}
											/>
											<div className="text-[13px] text-text-primary font-medium">
												{selectedFile.name}
											</div>
											<p className="text-[11px] text-text-muted mt-1 tabular-nums">
												{(selectedFile.size / 1024).toFixed(2)} KB
											</p>
										</div>
									) : (
										<div>
											<Upload
												className="w-8 h-8 text-text-muted mx-auto mb-3 group-hover:text-text-primary transition-colors"
												strokeWidth={1.5}
											/>
											<div className="text-[13px] text-text-secondary">
												<span className="text-text-primary font-medium">
													点击上传
												</span>{" "}
												或拖拽文件至此
											</div>
											<p className="text-[11px] text-text-muted mt-1">
												支持 PDF, Word, Markdown, 文本, 音频
											</p>
										</div>
									)}
								</div>
							</div>
						)}
					</div>

					{/* Footer */}
					<div className="flex justify-end pt-2">
						<button
							onClick={handleCreateSource}
							className="px-5 py-2 bg-cream-900 dark:bg-cream-50 text-cream-50 dark:text-cream-900 rounded-full hover:bg-cream-800 dark:hover:bg-cream-100 transition-colors text-[13px] font-medium"
						>
							导入来源
						</button>
					</div>
				</div>
			</Modal>
		</aside>
	);
}
