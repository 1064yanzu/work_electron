/**
 * MarketplaceCard —— 市场单个 skill 卡片（紧凑横排）
 */

import {
	BadgeCheck,
	Download,
	ExternalLink,
	Eye,
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
		tone: "text-success",
	},
	community: {
		label: "社区",
		icon: Users,
		tone: "text-focus",
	},
	custom: {
		label: "自定义",
		icon: ShieldAlert,
		tone: "text-amber-600 dark:text-amber-400",
	},
};

const PHASE_LABEL: Record<InstallProgressState["phase"], string> = {
	queued: "排队",
	resolving: "解析",
	downloading: "下载",
	extracting: "解压",
	verifying: "校验",
	writing: "写入",
	done: "完成",
	error: "失败",
};

/** 基于名称生成稳定的 hue（0-360），用于头像彩色背景 */
function nameToHue(name: string): number {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash << 5) - hash + name.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash) % 360;
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

	const initial = (entry.displayName || entry.name).slice(0, 1).toUpperCase();
	const hue = nameToHue(entry.name);

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

	const host = (() => {
		try {
			return entry.rawSourceUrl ? new URL(entry.rawSourceUrl).host : null;
		} catch {
			return null;
		}
	})();

	return (
		<div
			className={cn(
				"group relative rounded-xl transition-all",
				"bg-surface dark:bg-cream-900/30",
				"ring-1 ring-cream-300/60 dark:ring-cream-500/20",
				"hover:ring-cream-400/80 dark:hover:ring-cream-500/40 hover:shadow-bai-card",
				previewing && "ring-cream-400 dark:ring-cream-500/40 shadow-bai-card",
			)}
		>
			{/* 主行 */}
			<div className="flex items-start gap-3 px-3 py-2.5">
				{/* 头像 — 单字符 serif，淡彩背景；trust 用小角标在右下 */}
				<div className="relative shrink-0">
					<div
						className="w-9 h-9 rounded-lg flex items-center justify-center font-serif text-[15px] font-semibold"
						style={{
							backgroundColor: `oklch(0.92 0.04 ${hue})`,
							color: `oklch(0.45 0.12 ${hue})`,
						}}
					>
						{initial}
					</div>
					<span
						className={cn(
							"absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full",
							"bg-surface dark:bg-cream-900",
							"flex items-center justify-center",
							"ring-1 ring-cream-200 dark:ring-cream-800",
							trust.tone,
						)}
						title={trust.label}
					>
						<TrustIcon className="w-2.5 h-2.5" strokeWidth={2.5} />
					</span>
				</div>

				{/* 主体 */}
				<div className="flex-1 min-w-0 pt-px">
					<div className="flex items-baseline gap-1.5 min-w-0">
						<span className="text-[12.5px] font-semibold text-text-primary truncate">
							{entry.displayName || entry.name}
						</span>
						{entry.version && (
							<span className="text-[10px] text-text-light font-mono shrink-0">
								v{entry.version.replace(/^v/, "")}
							</span>
						)}
						{entry.installed && (
							<span className="text-[9.5px] font-medium text-success tracking-wide uppercase shrink-0">
								已装
							</span>
						)}
					</div>
					<p className="text-[11px] text-text-muted mt-0.5 line-clamp-2 leading-snug">
						{entry.description || "（暂无描述）"}
					</p>
					<div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-light min-w-0">
						{entry.author && (
							<span className="truncate max-w-[40%]">{entry.author}</span>
						)}
						{entry.author && (entry.license || host) && (
							<span className="text-text-light/50">·</span>
						)}
						{entry.license && (
							<span className="font-mono shrink-0">{entry.license}</span>
						)}
						{entry.license && host && (
							<span className="text-text-light/50">·</span>
						)}
						{host && (
							<span className="font-mono truncate" title={entry.rawSourceUrl}>
								{host}
							</span>
						)}
					</div>
				</div>

				{/* 操作区 */}
				<div className="flex flex-col items-end gap-1.5 shrink-0">
					{entry.installed ? (
						<button
							type="button"
							onClick={handleUninstall}
							disabled={!!installing}
							className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-text-secondary hover:text-error hover:bg-error/8 transition disabled:opacity-50"
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
								"inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition shrink-0",
								installing
									? "bg-cream-200 text-text-muted cursor-not-allowed"
									: "bg-primary text-primary-foreground hover:bg-primary-hover",
							)}
						>
							{installing ? (
								<>
									<Loader2 className="w-3 h-3 animate-spin" />
									{PHASE_LABEL[progress?.phase ?? "queued"]}
								</>
							) : (
								<>
									<Download className="w-3 h-3" />
									安装
								</>
							)}
						</button>
					)}

					{/* hover 才显示的次操作 */}
					<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
						<button
							type="button"
							onClick={handlePreview}
							className="p-1 rounded text-text-light hover:text-text-secondary hover:bg-cream-200/70"
							title="预览 SKILL.md"
						>
							<Eye className="w-3 h-3" />
						</button>
						{entry.homepage && (
							<a
								href={entry.homepage}
								target="_blank"
								rel="noreferrer"
								className="p-1 rounded text-text-light hover:text-text-secondary hover:bg-cream-200/70"
								title="打开主页"
							>
								<ExternalLink className="w-3 h-3" />
							</a>
						)}
					</div>
				</div>
			</div>

			{/* 进度条 */}
			{progress && progress.phase !== "done" && (
				<div className="px-3 pb-2.5 -mt-0.5">
					<div className="h-[3px] rounded-full bg-cream-200/80 dark:bg-cream-800/50 overflow-hidden">
						<div
							className={cn(
								"h-full transition-all duration-200 ease-out",
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
								"mt-1 text-[10px] truncate",
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
				<div className="mx-3 mb-2.5 rounded-lg bg-cream-200/50 dark:bg-cream-800/30 p-2.5 max-h-56 overflow-auto animate-fade-in">
					{previewError ? (
						<p className="text-[11px] text-error">{previewError}</p>
					) : previewText === null ? (
						<p className="text-[11px] text-text-light flex items-center gap-1">
							<Loader2 className="w-3 h-3 animate-spin" />
							加载中…
						</p>
					) : (
						<pre className="text-[10.5px] leading-relaxed text-text-secondary whitespace-pre-wrap font-mono">
							{previewText || "（SKILL.md 内容为空）"}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}
