/**
 * MarketplaceCard —— 市场单个 skill 卡片
 */

import {
	BadgeCheck,
	Download,
	Eye,
	ExternalLink,
	Loader2,
	ShieldAlert,
	Trash2,
	Users,
} from "lucide-react";
import { useState } from "react";
import {
	skillsMarketplaceStore,
	type InstallProgressState,
} from "../../lib/skillsMarketplaceStore";
import type { MarketplaceEntry } from "../../lib/config";
import { cn } from "../../lib/utils";
import { confirmDialog } from "../ui/ConfirmDialog";

interface Props {
	entry: MarketplaceEntry;
	progress?: InstallProgressState;
}

const TRUST_META: Record<
	NonNullable<MarketplaceEntry["trust"]>,
	{ label: string; icon: typeof BadgeCheck; tone: string }
> = {
	official: {
		label: "官方",
		icon: BadgeCheck,
		tone: "bg-success/8 text-success dark:bg-success/10 dark:text-success",
	},
	community: {
		label: "社区",
		icon: Users,
		tone: "bg-focus/8 text-focus dark:bg-focus/10 dark:text-focus",
	},
	custom: {
		label: "自定义源",
		icon: ShieldAlert,
		tone: "bg-peach-100 text-amber-700 dark:bg-peach-500/10 dark:text-amber-300",
	},
};

function phaseToLabel(p: InstallProgressState["phase"]) {
	switch (p) {
		case "queued":
			return "排队中";
		case "resolving":
			return "解析中";
		case "downloading":
			return "下载中";
		case "extracting":
			return "解压中";
		case "verifying":
			return "校验中";
		case "writing":
			return "写入中";
		case "done":
			return "已完成";
		case "error":
			return "失败";
	}
}

export function MarketplaceCard({ entry, progress }: Props) {
	const [previewing, setPreviewing] = useState(false);
	const [previewText, setPreviewText] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);

	const trust = TRUST_META[entry.trust] ?? TRUST_META.custom;
	const TrustIcon = trust.icon;
	const installing =
		progress && progress.phase !== "done" && progress.phase !== "error";
	const failed = progress?.phase === "error";

	const handleInstall = async () => {
		await skillsMarketplaceStore.install(entry.id);
	};

	const handleUninstall = async () => {
		const ok = await confirmDialog.danger(
			`确定卸载技能 "${entry.name}"？`,
			"卸载技能",
		);
		if (!ok) return;
		await skillsMarketplaceStore.uninstall(entry.name);
	};

	const handlePreview = async () => {
		if (previewText !== null || previewError) {
			setPreviewing((v) => !v);
			return;
		}
		setPreviewing(true);
		try {
			const r = await skillsMarketplaceStore.preview(entry.id);
			if (r.error) setPreviewError(r.error);
			else setPreviewText(r.skillMd ?? "");
		} catch (e) {
			setPreviewError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<div
			className={cn(
				"group rounded-2xl border border-border/60 bg-surface/60",
				"hover:border-primary/40 hover:shadow-sm transition-all",
				"px-4 py-3 flex flex-col gap-2",
			)}
		>
			<div className="flex items-start gap-3">
				<div
					className={cn(
						"w-10 h-10 rounded-xl shrink-0 flex items-center justify-center",
						"bg-warm-200/70 text-text-secondary text-base font-semibold",
					)}
				>
					{(entry.displayName || entry.name).slice(0, 1).toUpperCase()}
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="text-[13.5px] font-medium text-text-primary truncate">
							{entry.displayName || entry.name}
						</span>
						{entry.version && (
							<span className="text-[10.5px] text-text-light font-mono px-1.5 py-0.5 rounded-md bg-warm-200/60">
								v{entry.version.replace(/^v/, "")}
							</span>
						)}
						<span
							className={cn(
								"inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-md font-medium",
								trust.tone,
							)}
						>
							<TrustIcon className="w-3 h-3" />
							{trust.label}
						</span>
						{entry.installed && (
							<span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-success/8 text-success dark:bg-success/10 dark:text-success">
								已安装
								{entry.installedVersion ? ` · v${entry.installedVersion}` : ""}
							</span>
						)}
					</div>
					<p className="text-[12px] text-text-muted mt-1 line-clamp-2 leading-relaxed">
						{entry.description || "（暂无描述）"}
					</p>
					<div className="flex items-center gap-2 mt-1.5 text-[10.5px] text-text-light flex-wrap">
						{entry.author && <span>作者: {entry.author}</span>}
						{entry.license && <span>许可: {entry.license}</span>}
						{entry.rawSourceUrl && (
							<span
								className="font-mono truncate max-w-[16ch]"
								title={entry.rawSourceUrl}
							>
								{new URL(entry.rawSourceUrl).host}
							</span>
						)}
					</div>
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<button
						type="button"
						onClick={handlePreview}
						className="p-1.5 rounded-md text-text-light hover:text-text-secondary hover:bg-black/5 dark:hover:bg-surface/10"
						title="预览 SKILL.md"
					>
						<Eye className="w-3.5 h-3.5" />
					</button>
					{entry.homepage && (
						<a
							href={entry.homepage}
							target="_blank"
							rel="noreferrer"
							className="p-1.5 rounded-md text-text-light hover:text-text-secondary hover:bg-black/5 dark:hover:bg-surface/10"
							title="打开主页"
						>
							<ExternalLink className="w-3.5 h-3.5" />
						</a>
					)}
					{entry.installed ? (
						<button
							type="button"
							onClick={handleUninstall}
							disabled={!!installing}
							className="px-2.5 py-1 rounded-md text-[11.5px] font-medium border border-border/60 text-text-secondary hover:text-error hover:border-[rgba(181,51,51,0.32)] dark:hover:border-red-500/40 transition-colors flex items-center gap-1"
						>
							<Trash2 className="w-3 h-3" />
							卸载
						</button>
					) : (
						<button
							type="button"
							onClick={handleInstall}
							disabled={!!installing}
							className={cn(
								"px-2.5 py-1 rounded-md text-[11.5px] font-medium flex items-center gap-1 transition-colors",
								installing
									? "bg-warm-200 text-text-muted cursor-not-allowed"
									: "bg-primary text-white hover:bg-primary/90",
							)}
						>
							{installing ? (
								<>
									<Loader2 className="w-3 h-3 animate-spin" />
									{phaseToLabel(progress?.phase ?? "queued")}
								</>
							) : (
								<>
									<Download className="w-3 h-3" />
									安装
								</>
							)}
						</button>
					)}
				</div>
			</div>

			{/* 进度条 */}
			{progress && progress.phase !== "done" && (
				<div className="mt-1">
					<div className="h-1 rounded-full bg-warm-200/70 overflow-hidden">
						<div
							className={cn(
								"h-full transition-all",
								failed ? "bg-error" : "bg-primary",
							)}
							style={{
								width: `${Math.max(2, Math.min(100, progress.percent))}%`,
							}}
						/>
					</div>
					{(progress.message || progress.error) && (
						<p
							className={cn(
								"mt-1 text-[10.5px]",
								failed ? "text-error" : "text-text-light",
							)}
						>
							{progress.error || progress.message}
						</p>
					)}
				</div>
			)}

			{/* 预览面板 */}
			{previewing && (
				<div className="mt-1 rounded-lg border border-border/60 bg-warm-200/40 dark:bg-surface/20 p-3 max-h-64 overflow-auto">
					{previewError ? (
						<p className="text-[11px] text-error">{previewError}</p>
					) : previewText === null ? (
						<p className="text-[11px] text-text-light flex items-center gap-1">
							<Loader2 className="w-3 h-3 animate-spin" />
							加载中…
						</p>
					) : (
						<pre className="text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap font-mono">
							{previewText || "（SKILL.md 内容为空）"}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}
