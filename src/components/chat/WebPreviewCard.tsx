import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";

export function WebPreviewCard({
	kind,
	html,
	jsx,
	css,
	js,
	title = "前端预览",
}: {
	kind: "html" | "react";
	html?: string;
	jsx?: string;
	css?: string;
	js?: string;
	title?: string;
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
		<div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-sm shadow-sm overflow-hidden">
			<div className="px-3 py-2 flex items-center justify-between gap-2">
				<div className="min-w-0">
					<div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">
						{title}
					</div>
					<div className="text-[11px] text-zinc-400 truncate">
						{kind === "react" ? "React" : "HTML"}
						{css?.trim() ? " + CSS" : ""}
						{kind === "html" && js?.trim() ? " + JS" : ""}
					</div>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setOpen((v) => !v)}
						className="h-8 px-2 rounded-xl flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
					>
						{open ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
						{open ? "收起" : "预览"}
					</button>
					<button
						type="button"
						onClick={handleOpenExternal}
						className="h-8 px-2 rounded-xl flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
						title="新窗口打开"
					>
						<ExternalLink className="w-4 h-4" />
						打开
					</button>
				</div>
			</div>
			{open && (
				<div className="border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-950">
					<iframe
						title="preview"
						sandbox="allow-scripts"
						srcDoc={srcDoc}
						className="w-full h-[360px] bg-white"
					/>
				</div>
			)}
		</div>
	);
}
