/**
 * MascotPackagingFooter — 自定义桌宠的「打包规范 + 模版下载」入口
 *
 * 替代旧版 MascotSettings 内被堆砌在选择器卡片底部的密集 hint。
 * 单独抽出来后，三类信息有清晰的视觉分级：标题、要点、快速动作。
 */
import { Download, ExternalLink, FileCode2 } from "lucide-react";

interface MascotPackagingFooterProps {
	onDownloadTemplate: () => void;
}

export function MascotPackagingFooter({
	onDownloadTemplate,
}: MascotPackagingFooterProps) {
	return (
		<div className="rounded-2xl border border-dashed border-cream-500/60 bg-cream-50 p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-start gap-2.5">
					<span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary">
						<FileCode2 className="h-3.5 w-3.5" strokeWidth={1.6} />
					</span>
					<div className="min-w-0">
						<div className="text-[13px] font-semibold text-text-primary">
							打包你自己的桌宠
						</div>
						<p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
							支持 zip 包（pet.json + 17 张 PNG），或直接读取{" "}
							<code className="rounded bg-cream-200 px-1 py-0.5 font-mono text-[10.5px]">
								~/.codex/pets/&lt;id&gt;
							</code>{" "}
							与{" "}
							<code className="rounded bg-cream-200 px-1 py-0.5 font-mono text-[10.5px]">
								hatch-pet/runs/&lt;id&gt;
							</code>{" "}
							目录。缺失的 hero / accent 颜色会自动从 spritesheet 派生。
						</p>
					</div>
				</div>
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					<a
						href="https://github.com/anthropics/claude-code/blob/main/docs/custom-mascot-pack.md"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[11.5px] font-medium text-text-secondary transition hover:border-cream-500 hover:text-text-primary"
					>
						<ExternalLink className="h-3 w-3" strokeWidth={1.8} />
						打包规范
					</a>
					<button
						type="button"
						onClick={onDownloadTemplate}
						className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground transition hover:opacity-90"
					>
						<Download className="h-3 w-3" strokeWidth={1.8} />
						下载 pet.json 模版
					</button>
				</div>
			</div>
		</div>
	);
}
