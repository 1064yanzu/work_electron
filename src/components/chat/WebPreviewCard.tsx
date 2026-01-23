import { ExternalLink, Eye, EyeOff, Code, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

// 提取最后 N 行代码用于终端预览
function getLastLines(code: string, n: number = 3): string {
	return code.trim().split('\n').slice(-n).join('\n');
}

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
	const [open, setOpen] = useState(false);

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
				s = s.replace(/^\s*export\s+default\s+function\s+([A-Za-z_$][\w$]*)/m, (_m, name) => {
					return `function ${name}`;
				});
				s = s.replace(/^\s*export\s+default\s+class\s+([A-Za-z_$][\w$]*)/m, (_m, name) => {
					return `class ${name}`;
				});
				s = s.replace(/^\s*export\s+default\s+/m, "window.__default = ");
				s = s.replace(/^\s*export\s+(const|let|var)\s+/gm, "$1 ");
				s = s.replace(/^\s*export\s+function\s+/gm, "function ");
				s = s.replace(/^\s*export\s+class\s+/gm, "class ");
				s = s.replace(/^\s*export\s*\{[\s\S]*?\}\s*;?\s*$/gm, "");
				if (/window\.__default\s*=/.test(s)) return s;
				if (/\bfunction\s+App\s*\(/.test(s) || /\bclass\s+App\b/.test(s) || /\bconst\s+App\s*=/.test(s) || /\blet\s+App\s*=/.test(s) || /\bvar\s+App\s*=/.test(s)) {
					return `${s}\nwindow.__default = typeof App !== "undefined" ? App : undefined;`;
				}
				return `${s}\nwindow.__default = typeof App !== "undefined" ? App : undefined;`;
			})();

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

			const doc = `<!doctype html>
<html>
  <head>
${baseHead}${style}
  </head>
  <body>
${body}
  </body>
</html>`;
			return doc;
		}

		const hasHtmlTag = /<html[\s>]/i.test(htmlPart);
		const doc = hasHtmlTag
			? htmlPart
			: `<!doctype html>
<html>
  <head>
${baseHead}${style}
  </head>
  <body>
${htmlPart}
  </body>
</html>`;
		const withJs = jsPart.trim()
			? doc.replace("</body>", `<script>${jsPart}</script></body>`)
			: doc;
		return withJs;
	}, [kind, html, jsx, css, js]);

	const handleOpenExternal = () => {
		const blob = new Blob([srcDoc], { type: "text/html" });
		const url = URL.createObjectURL(blob);
		window.open(url, "_blank", "noopener,noreferrer");
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	};

	return (
		<div className="group/card rounded-2xl border border-zinc-200/80 dark:border-zinc-700/50 bg-gradient-to-br from-white to-zinc-50/50 dark:from-zinc-900/90 dark:to-zinc-900/60 backdrop-blur-xl shadow-lg shadow-zinc-900/5 dark:shadow-zinc-950/20 overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-zinc-900/10 dark:hover:shadow-zinc-950/30 hover:border-zinc-300/80 dark:hover:border-zinc-600/50">
			{/* 头部 */}
			<div className="relative px-4 py-3 flex items-center justify-between gap-3 bg-gradient-to-r from-zinc-50/80 to-transparent dark:from-zinc-800/40 dark:to-transparent border-b border-zinc-200/60 dark:border-zinc-700/40 backdrop-blur-sm">
				{/* 左侧:图标 + 信息 */}
				<div className="flex items-center gap-3 min-w-0 flex-1">
					{/* 图标容器 - 增强渐变和阴影 */}
					<div
						className={`relative flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl transition-all duration-500 ${isStreaming
								? 'bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 shadow-lg shadow-amber-500/40 dark:shadow-amber-500/30'
								: 'bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 shadow-lg shadow-blue-500/40 dark:shadow-blue-500/30'
							}`}
					>
						{/* 光晕效果 */}
						<div className={`absolute inset-0 rounded-xl blur-md opacity-50 ${isStreaming ? 'bg-amber-400' : 'bg-blue-500'
							}`} />

						{/* 图标 */}
						<div className="relative z-10">
							{isStreaming ? (
								<Sparkles className="w-5 h-5 text-white animate-pulse" />
							) : (
								<Code className="w-5 h-5 text-white" />
							)}
						</div>
					</div>

					{/* 标题信息 */}
					<div className="min-w-0 flex-1">
						<div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate tracking-tight">
							{title}
						</div>
						<div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
							<span className="font-medium">
								{kind === "react" ? "React" : "HTML"}
							</span>
							{css?.trim() && (
								<>
									<span className="text-zinc-300 dark:text-zinc-600">•</span>
									<span>CSS</span>
								</>
							)}
							{kind === "html" && js?.trim() && (
								<>
									<span className="text-zinc-300 dark:text-zinc-600">•</span>
									<span>JavaScript</span>
								</>
							)}
						</div>
					</div>
				</div>

				{/* 右侧:操作按钮 */}
				{!isStreaming && (
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							onClick={() => setOpen((v) => !v)}
							className="group/btn h-9 px-3 rounded-xl flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white/80 dark:bg-zinc-800/80 hover:bg-white dark:hover:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 hover:border-zinc-300 dark:hover:border-zinc-600 shadow-sm hover:shadow transition-all duration-200"
						>
							{open ? (
								<>
									<EyeOff className="w-4 h-4 transition-transform duration-200 group-hover/btn:scale-110" />
									<span>收起</span>
								</>
							) : (
								<>
									<Eye className="w-4 h-4 transition-transform duration-200 group-hover/btn:scale-110" />
									<span>预览</span>
								</>
							)}
						</button>
						<button
							type="button"
							onClick={handleOpenExternal}
							className="group/btn h-9 px-3 rounded-xl flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white/80 dark:bg-zinc-800/80 hover:bg-white dark:hover:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 hover:border-zinc-300 dark:hover:border-zinc-600 shadow-sm hover:shadow transition-all duration-200"
							title="新窗口打开"
						>
							<ExternalLink className="w-4 h-4 transition-transform duration-200 group-hover/btn:scale-110" />
							<span>打开</span>
						</button>
					</div>
				)}
			</div>

			{/* 内容区 */}
			{isStreaming ? (
				// 流式状态:显示终端风格预览
				<div className="p-5">
					{(() => {
						const code = kind === "html" ? (html || "") : (jsx || "");
						const hasContent = code.trim().length > 0;

						if (!hasContent) {
							// 生成中,无内容
							return (
								<div className="flex items-center justify-center gap-3 py-8 min-h-[100px]">
									<div className="relative">
										<div className="w-6 h-6 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
										<div className="absolute inset-0 w-6 h-6 border-3 border-amber-400/20 rounded-full animate-ping" />
									</div>
									<span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 animate-pulse">
										生成中...
									</span>
								</div>
							);
						}

						// 显示终端预览
						const lastLines = getLastLines(code, 3);
						return (
							<>
								{/* 终端预览 - 优化样式 */}
								<div className="relative rounded-xl overflow-hidden border border-zinc-200/60 dark:border-zinc-700/60 shadow-inner bg-gradient-to-br from-zinc-50 to-zinc-100/80 dark:from-zinc-950 dark:to-zinc-900/80">
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

								{/* 预览按钮 */}
								<button
									type="button"
									onClick={() => setOpen((v) => !v)}
									className="group/btn mt-3 h-10 px-4 rounded-xl flex items-center gap-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
								>
									<Eye className="w-4 h-4 transition-transform duration-200 group-hover/btn:scale-110" />
									<span>预览效果</span>
								</button>
							</>
						);
					})()}
				</div>
			) : (
				// 完成状态:显示 iframe 预览
				open && (
					<div className="border-t border-zinc-200/60 dark:border-zinc-700/40 bg-white dark:bg-zinc-950 animate-in slide-in-from-top-2 duration-300">
						<iframe
							title="preview"
							sandbox="allow-scripts"
							srcDoc={srcDoc}
							className="w-full h-[400px] bg-white"
						/>
					</div>
				)
			)}
		</div>
	);
}
