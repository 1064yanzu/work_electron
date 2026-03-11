import { Eye, Code, X, Maximize2, Download } from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { managedModeStore } from "../../lib/managedModeStore";
import { useAgentStoreSelector } from "../../lib/agent/store";
import { debugUiLog } from "../../lib/debug/uiDebug";

// -----------------------------------------------------------------------------
// 0. 工具函数
// -----------------------------------------------------------------------------
function downloadFile(content: string, filename: string) {
	const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// 1. 流式终端预览组件 (原有逻辑)
// -----------------------------------------------------------------------------
function TerminalPreview({ code }: { code: string }) {
	const lastLines = useMemo(() => {
		return code.trim().split("\n").slice(-3).join("\n");
	}, [code]);

	return (
		<div className="rounded-xl overflow-hidden border border-zinc-200/60 dark:border-zinc-700/60 shadow-inner bg-gradient-to-br from-zinc-50 to-zinc-100/80 dark:from-zinc-950 dark:to-zinc-900/80">
			{/* 终端头部装饰 */}
			<div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100/80 dark:bg-zinc-900/80 border-b border-zinc-200/60 dark:border-zinc-800/60">
				<div className="w-2.5 h-2.5 rounded-full bg-red-500/80 shadow-sm" />
				<div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 shadow-sm" />
				<div className="w-2.5 h-2.5 rounded-full bg-green-500/80 shadow-sm" />
			</div>

			{/* 终端内容 */}
			<div className="p-4 font-mono text-xs min-h-[100px]">
				<div className="flex items-start gap-2.5">
					<span className="text-emerald-600 dark:text-emerald-400 font-bold flex-shrink-0 select-none">
						$
					</span>
					<div className="flex-1 text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
						{lastLines}
						<span className="inline-block w-0.5 h-4 ml-1 bg-emerald-600 dark:bg-emerald-400 animate-pulse align-middle rounded-full" />
					</div>
				</div>
			</div>
		</div>
	);
}

// -----------------------------------------------------------------------------
// 2. 入口卡片组件 (完成态 - 轻量级)
// -----------------------------------------------------------------------------
function EntryCard({
	title,
	kind,
	onOpen,
	onDownload,
}: {
	title: string;
	kind: "html" | "react";
	onOpen: (mode: "preview" | "code") => void;
	onDownload: () => void;
}) {
	return (
		<div
			className="group flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all duration-200 cursor-pointer"
			onClick={() => onOpen("preview")}
		>
			{/* 左侧信息 */}
			<div className="flex items-center gap-3">
				<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-blue-500 dark:text-blue-400 group-hover:scale-110 transition-transform duration-200">
					{kind === "react" ? (
						<Code className="w-5 h-5" />
					) : (
						<Eye className="w-5 h-5" />
					)}
				</div>
				<div>
					<div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
						{title}
					</div>
					<div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
						点击查看详情
					</div>
				</div>
			</div>

			{/* 右侧操作 */}
			<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onDownload();
					}}
					className="p-2 rounded-lg text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
					title="下载代码"
				>
					<Download className="w-4 h-4" />
				</button>
				<div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onOpen("code");
					}}
					className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800"
					title="查看代码"
				>
					<Code className="w-4 h-4" />
				</button>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onOpen("preview");
					}}
					className="p-2 rounded-lg text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
					title="预览"
				>
					<Maximize2 className="w-4 h-4" />
				</button>
			</div>
		</div>
	);
}

// -----------------------------------------------------------------------------
// 3. 全屏模态窗组件 (详情态)
// -----------------------------------------------------------------------------
function FullScreenModal({
	isOpen,
	onClose,
	initialMode,
	title,
	srcDoc,
	codeContent,
	onDownload,
}: {
	isOpen: boolean;
	onClose: () => void;
	initialMode: "preview" | "code";
	title: string;
	srcDoc: string;
	codeContent: string;
	onDownload: () => void;
}) {
	const [viewMode, setViewMode] = useState<"preview" | "code">(initialMode);

	// ESC 关闭
	useEffect(() => {
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		if (isOpen) {
			window.addEventListener("keydown", handleEsc);
			document.body.style.overflow = "hidden"; // 禁用背景滚动
		}
		return () => {
			window.removeEventListener("keydown", handleEsc);
			document.body.style.overflow = "";
		};
	}, [isOpen, onClose]);

	// 更新初始模式
	useEffect(() => {
		if (isOpen) {
			setViewMode(initialMode);
		}
	}, [isOpen, initialMode]);

	if (!isOpen) return null;

	return createPortal(
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
			<div className="relative w-[90vw] h-[85vh] max-w-6xl bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-zinc-200 dark:border-zinc-800">
				{/* 模态窗 Header */}
				<div className="relative h-14 px-4 flex items-center justify-between gap-4 bg-zinc-50/80 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur-sm">
					{/* 左侧：标题 */}
					<div className="flex items-center gap-3 min-w-0 flex-1">
						<div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
							{title}
						</div>
					</div>

					{/* 中间：分段控制器 */}
					<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
						<div className="flex items-center p-1 rounded-lg bg-zinc-200/50 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50">
							<button
								type="button"
								onClick={() => setViewMode("code")}
								className={`
                                    flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200
                                    ${
																			viewMode === "code"
																				? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
																				: "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
																		}
                                `}
							>
								<Code className="w-3.5 h-3.5" />
								代码
							</button>
							<button
								type="button"
								onClick={() => setViewMode("preview")}
								className={`
                                    flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200
                                    ${
																			viewMode === "preview"
																				? "bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
																				: "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
																		}
                                `}
							>
								<Eye className="w-3.5 h-3.5" />
								预览
							</button>
						</div>
					</div>

					{/* 右侧：操作按钮 */}
					<div className="flex items-center justify-end flex-1 gap-2">
						<button
							onClick={onDownload}
							className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
						>
							<Download className="w-4 h-4" />
							<span>下载</span>
						</button>
						<div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
						<button
							onClick={onClose}
							className="p-2 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
						>
							<X className="w-5 h-5" />
						</button>
					</div>
				</div>

				{/* 模态窗内容区 */}
				<div className="flex-1 overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/50 relative">
					{/* 代码视图 */}
					<div
						className={`
                            absolute inset-0 transition-opacity duration-300 ease-in-out
                            ${viewMode === "code" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}
                        `}
					>
						<div className="h-full overflow-auto">
							<pre className="p-6 text-xs font-mono leading-relaxed tab-4 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 min-h-full">
								<code>{codeContent}</code>
							</pre>
						</div>
					</div>

					{/* 预览视图 */}
					<div
						className={`
                            absolute inset-0 transition-opacity duration-300 ease-in-out bg-white dark:bg-white
                            ${viewMode === "preview" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}
                        `}
					>
						<iframe
							title="preview-modal"
							sandbox="allow-scripts"
							srcDoc={srcDoc}
							className="w-full h-full border-0"
						/>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}

// -----------------------------------------------------------------------------
// 主组件: WebPreviewCard
// -----------------------------------------------------------------------------
export function WebPreviewCard({
	kind,
	html,
	jsx,
	css,
	js,
	title = "前端预览",
	isStreaming = false,
}: {
	kind: "html" | "react";
	html?: string;
	jsx?: string;
	css?: string;
	js?: string;
	title?: string;
	isStreaming?: boolean;
}) {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [modalMode, setModalMode] = useState<"preview" | "code">("preview");
	const savedHashRef = useRef<string | null>(null);

	// 获取沙盒目录
	const sandboxDir = useAgentStoreSelector(
		(state) => state.currentTask?.metadata?.sandboxDir as string | undefined,
	);

	// 下载功能
	const handleDownload = () => {
		const content = kind === "html" ? html || "" : jsx || "";
		const ext = kind === "html" ? "html" : "tsx";
		const filename = `${title.replace(/\s+/g, "_") || "code_snippet"}.${ext}`;
		downloadFile(content, filename);
	};

	// 自动保存产物到沙盒目录（去重：基于内容 hash）
	useEffect(() => {
		if (isStreaming) return; // 流式阶段不保存
		if (!sandboxDir) return; // 没有沙盒目录不保存

		const content = kind === "html" ? html || "" : jsx || "";
		if (!content.trim()) return;

		// 简单 hash 去重
		const hash = `${kind}-${content.length}-${content.slice(0, 100)}`;
		if (savedHashRef.current === hash) return;
		savedHashRef.current = hash;

		// 异步保存
		managedModeStore.saveArtifact(sandboxDir, content, kind, title).then((filePath) => {
			if (filePath) {
				debugUiLog("[WebPreviewCard] Auto-saved artifact to:", filePath);
			}
		});
	}, [isStreaming, sandboxDir, kind, html, jsx, title]);

	// 构建预览文档 (复用原有逻辑)
	const srcDoc = useMemo(() => {
		const htmlPart = String(html || "");
		const jsxPart = String(jsx || "");
		const cssPart = String(css || "");
		const jsPart = String(js || "");
		const baseHead = `
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
`;
		const style = cssPart.trim() ? `<style>${cssPart}</style>` : "";

		if (kind === "react") {
			const hasImport = /^\s*import\s/m.test(jsxPart);
			const normalized = jsxPart;
			const transformed = (() => {
				let s = normalized;
				s = s.replace(
					/^\s*export\s+default\s+function\s+([A-Za-z_$][\w$]*)/m,
					(_m, name) => {
						return `function ${name}`;
					},
				);
				s = s.replace(
					/^\s*export\s+default\s+class\s+([A-Za-z_$][\w$]*)/m,
					(_m, name) => {
						return `class ${name}`;
					},
				);
				s = s.replace(/^\s*export\s+default\s+/m, "window.__default = ");
				s = s.replace(/^\s*export\s+(const|let|var)\s+/gm, "$1 ");
				s = s.replace(/^\s*export\s+function\s+/gm, "function ");
				s = s.replace(/^\s*export\s+class\s+/gm, "class ");
				s = s.replace(/^\s*export\s*\{[\s\S]*?\}\s*;?\s*$/gm, "");
				if (/window\.__default\s*=/.test(s)) return s;
				if (
					/\bfunction\s+App\s*\(/.test(s) ||
					/\bclass\s+App\b/.test(s) ||
					/\bconst\s+App\s*=/.test(s) ||
					/\blet\s+App\s*=/.test(s) ||
					/\bvar\s+App\s*=/.test(s)
				) {
					return `${s}\nwindow.__default = typeof App !== "undefined" ? App : undefined;`;
				}
				return `${s}\nwindow.__default = typeof App !== "undefined" ? App : undefined;`;
			})();

			// ...React Template Logic...
			const body = hasImport
				? `<div style="font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; padding: 14px; color: #111827;">
  <div style="font-weight: 700; margin-bottom: 6px;">无法预览：代码包含 import</div>
  <div style="color:#6b7280;">请让模型输出一个不依赖 import 的单文件 React 组件（可用全局 React/ReactDOM）。</div>
</div>`
				: `<div id="root"></div>
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script>
setTimeout(() => {
  const ok = Boolean(window.React && window.ReactDOM && window.Babel);
  if (ok) return;
  const el = document.getElementById("root") || document.body;
  el.innerHTML = '<div style="font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; padding: 14px; color: #111827;">'
    + '<div style="font-weight:700; margin-bottom:6px;">无法加载预览依赖</div>'
    + '<div style="color:#6b7280;">需要联网从 unpkg 加载 React / Babel；或让模型输出纯 HTML/CSS/JS。</div>'
    + '</div>';
}, 1200);
</script>
<script type="text/babel">
try {
${transformed}
  const RootComp = window.__default || window.App;
  if (!RootComp) {
    throw new Error("未找到可渲染的组件：请定义 App 或 export default。");
  }
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(React.createElement(RootComp));
} catch (e) {
  const el = document.getElementById("root") || document.body;
  el.innerHTML = '<div style="font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; padding: 14px; color: #111827;">'
    + '<div style="font-weight:700; margin-bottom:6px;">预览运行失败</div>'
    + '<pre style="white-space:pre-wrap; color:#ef4444; margin:0;">' + String(e && e.message ? e.message : e) + '</pre>'
    + '</div>';
}
</script>`;

			return `<!doctype html>
<html>
  <head>${baseHead}${style}</head>
  <body>${body}</body>
</html>`;
		}

		// HTML Template
		const hasHtmlTag = /<html[\s>]/i.test(htmlPart);
		const doc = hasHtmlTag
			? htmlPart
			: `<!doctype html>
<html>
  <head>${baseHead}${style}</head>
  <body>${htmlPart}</body>
</html>`;
		return jsPart.trim()
			? doc.replace("</body>", `<script>${jsPart}</script></body>`)
			: doc;
	}, [kind, html, jsx, css, js]);

	const codeContent = kind === "html" ? html || "" : jsx || "";

	// 1. 流式阶段：显示 Loading 或 终端
	if (isStreaming) {
		const hasContent = codeContent.trim().length > 0;
		if (!hasContent) {
			// Loading 态
			return (
				<div className="flex flex-col items-center justify-center p-6 gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
					<div className="relative">
						<div className="w-5 h-5 border-2 border-zinc-200 dark:border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
					</div>
					<div className="text-xs text-zinc-400 dark:text-zinc-500 font-mono animate-pulse">
						Generating preview...
					</div>
				</div>
			);
		}
		// 终端态
		return <TerminalPreview code={codeContent} />;
	}

	// 2. 完成阶段：显示入口卡片 + 模态窗
	return (
		<>
			<EntryCard
				title={title}
				kind={kind}
				onOpen={(mode) => {
					setModalMode(mode);
					setIsModalOpen(true);
				}}
				onDownload={handleDownload}
			/>

			<FullScreenModal
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				initialMode={modalMode}
				title={title}
				srcDoc={srcDoc}
				codeContent={codeContent}
				onDownload={handleDownload}
			/>
		</>
	);
}
