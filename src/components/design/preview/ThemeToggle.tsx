/**
 * Dark/Light 切换：在 iframe 外层包一层 `color-scheme`，让 design HTML 内
 * 使用 `prefers-color-scheme: dark` 的查询自动响应。这对绝大部分 AI 生成的
 * 设计稿已经够用（它们的 CSS 里普遍会写 `@media (prefers-color-scheme: dark)`）。
 *
 * 注意：本组件只负责 UI 状态切换；具体的样式注入由父组件用 className/dataset 控制。
 */
import { Moon, Sun } from "lucide-react";

interface ThemeToggleProps {
	value: "light" | "dark";
	onChange: (v: "light" | "dark") => void;
}

export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
	return (
		<div className="inline-flex items-center rounded-full bg-bg-surface border border-border p-0.5">
			<button
				type="button"
				onClick={() => onChange("light")}
				aria-pressed={value === "light"}
				className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] transition-colors ${
					value === "light"
						? "bg-background text-text-primary shadow-sm"
						: "text-text-muted hover:text-text-primary"
				}`}
				title="Light"
			>
				<Sun className="w-3 h-3" strokeWidth={1.8} />
				Light
			</button>
			<button
				type="button"
				onClick={() => onChange("dark")}
				aria-pressed={value === "dark"}
				className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] transition-colors ${
					value === "dark"
						? "bg-background text-text-primary shadow-sm"
						: "text-text-muted hover:text-text-primary"
				}`}
				title="Dark"
			>
				<Moon className="w-3 h-3" strokeWidth={1.8} />
				Dark
			</button>
		</div>
	);
}
