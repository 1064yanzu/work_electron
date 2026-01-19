import { Check, Edit2, Eye, FileText, PenTool } from "lucide-react";
import { useEffect, useState } from "react";
import {
	createOutputAsset,
	listOutputAssets,
	updateOutputAsset,
} from "../lib/api";
import { EVENTS, events } from "../lib/events";
import { type OutputAsset, OutputType } from "../types";

export default function OutputStage() {
	const [outputs, setOutputs] = useState<OutputAsset[]>([]);
	const [selectedOutput, setSelectedOutput] = useState<OutputAsset | null>(
		null,
	);

	// Editor State
	const [isEditing, setIsEditing] = useState(true);
	const [editorContent, setEditorContent] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [lastSaved, setLastSaved] = useState<Date | null>(null);

	const fetchOutputs = async () => {
		try {
			const data = await listOutputAssets();
			setOutputs(data);
			if (data.length > 0 && !selectedOutput) {
				const first = data[0];
				setSelectedOutput(first);
				setEditorContent(first.content);
			}
		} catch (error) {
			console.error("获取输出失败:", error);
		}
	};

	const handleCreateOutput = async () => {
		const title = prompt("请输入文章标题:");
		if (!title) return;

		try {
			const newAsset = await createOutputAsset({
				title,
				content: "# " + title + "\n\n在此开始写作...",
				output_type: OutputType.Article,
				related_notes: [],
			});
			await fetchOutputs();
			// Select the new asset
			setSelectedOutput(newAsset);
			setEditorContent(newAsset.content);
			setIsEditing(true);
		} catch (error) {
			console.error("创建文章失败:", error);
			alert("创建失败");
		}
	};

	// Auto-save functionality
	useEffect(() => {
		if (!selectedOutput || editorContent === selectedOutput.content) return;

		const timeoutId = setTimeout(async () => {
			setIsSaving(true);
			try {
				const updated = await updateOutputAsset({
					id: selectedOutput.id,
					content: editorContent,
				});

				// Update local state without triggering a re-render loop
				setOutputs((prev) =>
					prev.map((o) => (o.id === updated.id ? updated : o)),
				);
				setSelectedOutput(updated);
				setLastSaved(new Date());
			} catch (error) {
				console.error("自动保存失败:", error);
			} finally {
				setIsSaving(false);
			}
		}, 2000); // Auto-save after 2s of inactivity

		return () => clearTimeout(timeoutId);
	}, [editorContent, selectedOutput]);

	// Typewriter effect for AI content
	const typeWriterEffect = async (text: string) => {
		setIsEditing(true); // Force edit mode
		for (let i = 0; i < text.length; i++) {
			setEditorContent((prev) => prev + text.charAt(i));
			await new Promise((resolve) => setTimeout(resolve, 10)); // 10ms delay per char
		}
	};

	// Listen for AI events
	useEffect(() => {
		const unsubscribe = events.on(
			EVENTS.AI_WRITE_TO_OUTPUT,
			async (data: any) => {
				const contentToAdd = data.content;

				if (!selectedOutput) {
					// If no doc selected, create one first
					try {
						const newAsset = await createOutputAsset({
							title: "AI 生成文档 " + new Date().toLocaleTimeString(),
							content: "# AI 生成会话\n",
							output_type: OutputType.Report,
							related_notes: [],
						});
						await fetchOutputs();
						setSelectedOutput(newAsset);
						setEditorContent(newAsset.content);
						// Small delay to ensure state updates before typing
						setTimeout(() => typeWriterEffect(contentToAdd), 100);
					} catch (e) {
						console.error("AI Auto-create failed", e);
					}
				} else {
					// Append to current doc
					typeWriterEffect(contentToAdd);
				}
			},
		);

		return unsubscribe;
	}, [selectedOutput]); // Re-bind when selectedOutput changes

	// Handle switching documents
	const handleSelectOutput = (output: OutputAsset) => {
		setSelectedOutput(output);
		setEditorContent(output.content);
		setLastSaved(null); // Reset save status
	};

	useEffect(() => {
		fetchOutputs();
	}, []);

	return (
		<aside className="flex-1 bg-panel-output dark:bg-gray-900 border-l border-border dark:border-gray-700 flex flex-col h-full font-sans min-w-0">
			{/* Header */}
			<div className="p-4 border-t border-border dark:border-gray-700 bg-surface dark:bg-gray-800 flex items-center justify-between shrink-0">
				<div className="flex items-center gap-2">
					<PenTool className="w-5 h-5 text-primary" />
					<h2 className="font-serif font-medium text-sm tracking-wide text-text-secondary">
						输出舞台
					</h2>
				</div>
				<div className="flex items-center gap-2">
					{/* Status Indicator */}
					{selectedOutput && (
						<div className="text-xs text-text-muted mr-2 flex items-center gap-1">
							{isSaving ? (
								<span className="animate-pulse">保存中...</span>
							) : lastSaved ? (
								<span className="flex items-center gap-1 text-green-600">
									<Check className="w-3 h-3" /> 已保存
								</span>
							) : null}
						</div>
					)}

					{selectedOutput && (
						<button
							onClick={() => setIsEditing(!isEditing)}
							className="p-2 text-text-muted hover:text-primary hover:bg-surface rounded-full transition-all"
							title={isEditing ? "预览模式" : "编辑模式"}
						>
							{isEditing ? (
								<Eye className="w-4 h-4" />
							) : (
								<Edit2 className="w-4 h-4" />
							)}
						</button>
					)}

					<button
						onClick={handleCreateOutput}
						className="p-2 text-text-muted hover:text-primary hover:bg-surface rounded-full transition-all"
						title="新建文章"
					>
						<FileText className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Content Area */}
			<div className="flex-1 flex flex-col overflow-hidden min-h-0">
				{outputs.length === 0 ? (
					<div className="flex-1 flex items-center justify-center text-text-muted text-sm p-8 text-center">
						<div>
							<PenTool className="w-16 h-16 mx-auto mb-4 text-text-muted opacity-20" />
							<p className="mb-4 font-serif italic text-lg">暂无输出内容</p>
							<button
								onClick={handleCreateOutput}
								className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
							>
								创建第一篇草稿
							</button>
						</div>
					</div>
				) : (
					<>
						{/* Document Tabs / List */}
						<div className="flex border-b border-border overflow-x-auto hide-scrollbar bg-surface/30 shrink-0">
							{outputs.map((output) => (
								<button
									key={output.id}
									onClick={() => handleSelectOutput(output)}
									className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
										selectedOutput?.id === output.id
											? "bg-white text-primary border-primary"
											: "text-text-secondary hover:bg-surface/50 border-transparent hover:text-primary"
									}`}
								>
									{output.title}
								</button>
							))}
						</div>

						{/* Editor / Preview Area */}
						<div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800 p-6 min-h-0">
							{selectedOutput ? (
								isEditing ? (
									<textarea
										className="w-full h-full p-4 bg-transparent border-none focus:outline-none resize-none text-text-primary dark:text-gray-100 font-mono text-sm leading-relaxed"
										value={editorContent}
										onChange={(e) => setEditorContent(e.target.value)}
										placeholder="开始写作..."
									/>
								) : (
									<div className="h-full overflow-y-auto p-8">
										<article className="prose prose-stone prose-headings:font-serif prose-p:font-serif prose-p:text-text-primary prose-headings:text-text-primary max-w-none">
											<h1 className="text-3xl font-serif text-text-primary mb-2">
												{selectedOutput.title}
											</h1>
											<div className="flex items-center gap-2 text-xs text-text-muted mb-8 not-prose border-b border-border pb-4">
												<span className="uppercase tracking-wider font-medium">
													{selectedOutput.output_type}
												</span>
												<span className="text-border">•</span>
												<span>v{selectedOutput.version}</span>
												<span className="text-border">•</span>
												<span>
													{new Date(
														selectedOutput.updated_at,
													).toLocaleDateString()}
												</span>
											</div>
											<div className="whitespace-pre-wrap text-lg leading-relaxed font-serif text-text-primary">
												{selectedOutput.content}
											</div>
										</article>
									</div>
								)
							) : (
								<div className="h-full flex items-center justify-center text-text-muted font-serif italic">
									请选择一篇文档
								</div>
							)}
						</div>
					</>
				)}
			</div>
		</aside>
	);
}
