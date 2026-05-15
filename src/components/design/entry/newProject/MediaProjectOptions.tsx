/**
 * MediaProjectOptions — 媒体生成参数
 *
 * 子分段（image / video / audio）+ provider 下拉 + 比例 chip + 时长输入
 * 字段直接复用 DesignSessionMetadata.media_* 命名
 */
import { Image as ImageIcon, Video, Music } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	designMediaProviders,
	type DesignMediaProvider,
} from "../../../../lib/api/design";
import { RadioCardGroup, type RadioCardItem } from "../../../ui/RadioCard";
import { Select } from "../../../ui/Select";
import { cn } from "../../../../lib/utils";

export type MediaKind = "image" | "video" | "audio";

interface MediaProjectOptionsProps {
	kind: MediaKind;
	onKindChange: (v: MediaKind) => void;
	provider: string;
	onProviderChange: (v: string) => void;
	aspect: string;
	onAspectChange: (v: string) => void;
	durationSec: number;
	onDurationChange: (v: number) => void;
}

const KIND_ITEMS: RadioCardItem<MediaKind>[] = [
	{
		value: "image",
		label: "图片",
		icon: <ImageIcon className="w-3.5 h-3.5" strokeWidth={1.7} />,
	},
	{
		value: "video",
		label: "视频",
		icon: <Video className="w-3.5 h-3.5" strokeWidth={1.7} />,
	},
	{
		value: "audio",
		label: "音频",
		icon: <Music className="w-3.5 h-3.5" strokeWidth={1.7} />,
	},
];

const ASPECT_BY_KIND: Record<MediaKind, string[]> = {
	image: ["1:1", "16:9", "9:16", "3:4", "4:3"],
	video: ["16:9", "9:16", "1:1"],
	audio: [],
};

export function MediaProjectOptions({
	kind,
	onKindChange,
	provider,
	onProviderChange,
	aspect,
	onAspectChange,
	durationSec,
	onDurationChange,
}: MediaProjectOptionsProps) {
	const [providers, setProviders] = useState<DesignMediaProvider[]>([]);
	const [loadingProviders, setLoadingProviders] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const list = await designMediaProviders();
				if (cancelled) return;
				setProviders(list);
			} catch (err) {
				console.warn("[MediaProjectOptions] providers failed", err);
			} finally {
				if (!cancelled) setLoadingProviders(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// 当前 kind 下可用的 provider
	const filteredProviders = useMemo(() => {
		const mediaKindMatch = (k: MediaKind) =>
			k === "audio" ? ["audio", "music"] : [k];
		const needs = mediaKindMatch(kind);
		return providers.filter((p) => p.kinds.some((k) => needs.includes(k)));
	}, [providers, kind]);

	// 切换 kind 时自动选首个可用 provider（若当前 provider 不再可用）
	useEffect(() => {
		if (filteredProviders.length === 0) return;
		const stillValid = filteredProviders.some((p) => p.id === provider);
		if (!stillValid) onProviderChange(filteredProviders[0].id);
	}, [filteredProviders, provider, onProviderChange]);

	// 切换 kind 时，校验当前 aspect 是否仍合法；不合法则换成首项
	useEffect(() => {
		const list = ASPECT_BY_KIND[kind];
		if (list.length > 0 && !list.includes(aspect)) {
			onAspectChange(list[0]);
		}
	}, [kind, aspect, onAspectChange]);

	const aspectList = ASPECT_BY_KIND[kind];
	const providerOptions = filteredProviders.map((p) => ({
		value: p.id,
		label: p.requires_key ? `${p.label}（需 API Key）` : p.label,
	}));

	return (
		<div className="flex flex-col gap-3">
			{/* 子分段 */}
			<RadioCardGroup<MediaKind>
				value={kind}
				onChange={onKindChange}
				items={KIND_ITEMS}
				size="sm"
				layout="horizontal"
				accent="action"
				columns={3}
				aria-label="选择媒体类型"
			/>

			{/* Provider */}
			<div className="flex flex-col gap-1.5">
				<label className="text-[11.5px] font-medium text-text-muted">
					Provider
				</label>
				<Select
					variant="inline"
					options={providerOptions}
					value={provider}
					onChange={(e) => onProviderChange(e.target.value)}
					placeholder={loadingProviders ? "加载中…" : "选择 provider"}
					aria-label="Provider"
				/>
				{!loadingProviders && filteredProviders.length === 0 && (
					<div className="text-[11px] text-text-light">
						当前没有可用的 {kind} provider，请在「设置 → AI Provider」配置。
					</div>
				)}
			</div>

			{/* 比例 chip（图/视频） */}
			{aspectList.length > 0 && (
				<div className="flex flex-col gap-1.5">
					<label className="text-[11.5px] font-medium text-text-muted">
						比例
					</label>
					<div className="flex flex-wrap gap-1.5">
						{aspectList.map((a) => {
							const active = a === aspect;
							return (
								<button
									key={a}
									type="button"
									onClick={() => onAspectChange(a)}
									className={cn(
										"px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-all duration-150",
										active
											? "border-[#D96C46] bg-[#D96C46]/10 text-[#A8482B] dark:text-[#F2C4A8]"
											: "border-cream-300 bg-cream-50 text-text-secondary hover:bg-cream-100",
									)}
								>
									{a}
								</button>
							);
						})}
					</div>
				</div>
			)}

			{/* 时长（视频 / 音频） */}
			{kind !== "image" && (
				<div className="flex flex-col gap-1.5">
					<label className="text-[11.5px] font-medium text-text-muted">
						时长（秒）
					</label>
					<input
						type="number"
						min={1}
						max={60}
						step={1}
						value={durationSec}
						onChange={(e) => {
							const n = Number(e.target.value);
							if (Number.isFinite(n))
								onDurationChange(Math.max(1, Math.min(60, Math.round(n))));
						}}
						className={cn(
							"w-full px-3 py-2 text-[13px]",
							"bg-cream-50 dark:bg-cream-900",
							"border border-cream-300 dark:border-cream-500",
							"rounded-xl text-text-primary",
							"focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/40",
						)}
					/>
				</div>
			)}
		</div>
	);
}
