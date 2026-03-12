// BreadcrumbNav - 文件路径面包屑导航
// 显示文件路径的分段导航，支持点击跳转到目录

import { ChevronRight } from "lucide-react";
import { memo, useMemo } from "react";

interface BreadcrumbNavProps {
	filePath: string;
	projectPath?: string | null;
	className?: string;
}

function BreadcrumbNavInner({ filePath, projectPath, className = "" }: BreadcrumbNavProps) {
	const segments = useMemo(() => {
		let displayPath = filePath;

		// 计算相对路径
		if (projectPath) {
			const normalizedRoot = projectPath.replace(/\\/g, "/").replace(/\/$/, "");
			const normalizedPath = filePath.replace(/\\/g, "/");
			if (normalizedPath.startsWith(normalizedRoot)) {
				displayPath = normalizedPath.slice(normalizedRoot.length + 1);
			}
		}

		return displayPath.split(/[\\/]/).filter(Boolean);
	}, [filePath, projectPath]);

	if (segments.length === 0) return null;

	return (
		<nav className={`flex items-center gap-0.5 min-w-0 overflow-hidden ${className}`}>
			{segments.map((segment, idx) => {
				const isLast = idx === segments.length - 1;
				return (
					<span key={idx} className="flex items-center gap-0.5 min-w-0">
						{idx > 0 && (
							<ChevronRight className="h-3 w-3 flex-shrink-0 text-zinc-400 dark:text-zinc-600" />
						)}
						<span
							className={`truncate text-xs ${
								isLast
									? "font-medium text-zinc-800 dark:text-zinc-200"
									: "text-zinc-500 dark:text-zinc-400"
							}`}
							title={segment}
						>
							{segment}
						</span>
					</span>
				);
			})}
		</nav>
	);
}

export const BreadcrumbNav = memo(BreadcrumbNavInner);
