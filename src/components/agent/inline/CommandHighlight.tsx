import { memo } from "react";

interface CommandHighlightProps {
	command: string;
}

/**
 * 命令行语法高亮：
 * - 第一个词：命令名（focus 色）
 * - `-` / `--` 开头：选项（error 色）
 * - `&&` / `||` / `|` / `>` / `<` / `>>`：操作符（violet）
 * - 其他：普通参数（text-secondary）
 */
export const CommandHighlight = memo(function CommandHighlight({
	command,
}: CommandHighlightProps) {
	const parts = command.split(/(\s+)/);

	return (
		<div className="font-mono text-sm">
			{parts.map((part, idx) => {
				const trimmed = part.trim();
				if (!trimmed) return <span key={idx}>{part}</span>;

				if (idx === 0) {
					return (
						<span key={idx} className="text-focus font-semibold">
							{part}
						</span>
					);
				}

				if (trimmed.startsWith("-")) {
					return (
						<span key={idx} className="text-error">
							{part}
						</span>
					);
				}

				if (["&&", "||", "|", ">", "<", ">>"].includes(trimmed)) {
					return (
						<span key={idx} className="bai-icon-violet font-semibold">
							{part}
						</span>
					);
				}

				return (
					<span key={idx} className="text-text-secondary">
						{part}
					</span>
				);
			})}
		</div>
	);
});
