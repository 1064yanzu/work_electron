/**
 * TTSVoiceList — Provider 卡片内的「音色卡片网格」
 *
 * 重设计要点：
 *  - 每个音色一张卡片（取代密集列表行）
 *  - 显眼的语言标签 + 类型徽章（克隆 / 内置）
 *  - 试听按钮放在卡片右上角，hover 时显示删除按钮
 *  - 整张卡片可点击 → 设为默认音色（必要时也会一并切换默认 Provider）
 *  - 当前默认音色卡显示「默认」徽章 + accent 边框
 */
import { CheckCircle2, Loader2, PlayCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { ttsDeleteVoice, ttsVoicePreview } from "../../../../lib/api/tts";
import type { TTSVoice } from "../../../../lib/tts";
import { toast } from "../../../ui/Toast";
import { cn } from "../../../../lib/utils";

interface TTSVoiceListProps {
	providerId: string;
	state: {
		voices: TTSVoice[];
		loading: boolean;
		error: string | null;
		refresh: () => Promise<void>;
	};
	allowDelete: boolean;
	/** 当前已被设为默认的音色 id（来自 settings.default_voice_id；未选时为 null） */
	selectedVoiceId?: string | null;
	/** 是否当前 provider 就是全局默认 provider；非默认时点击卡片会同时切换 provider */
	isDefaultProvider?: boolean;
	/** 点击卡片时把该音色设为默认（同时把所属 provider 设为默认） */
	onSelectAsDefault?: (voiceId: string) => void;
	/** accent 色，默认沿用品牌橙 */
	accentColor?: string;
}

export function TTSVoiceList({
	providerId,
	state,
	allowDelete,
	selectedVoiceId,
	isDefaultProvider,
	onSelectAsDefault,
	accentColor,
}: TTSVoiceListProps) {
	const [busyVoice, setBusyVoice] = useState<string | null>(null);
	const [deletingVoice, setDeletingVoice] = useState<string | null>(null);

	const handlePreview = async (voiceId: string) => {
		setBusyVoice(voiceId);
		try {
			const result = await ttsVoicePreview({ providerId, voiceId });
			const audio = new Audio(
				`data:audio/${result.format || "mpeg"};base64,${result.audioBase64}`,
			);
			await audio.play();
		} catch (e) {
			toast.error(`试听失败：${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setBusyVoice(null);
		}
	};

	const handleDelete = async (voiceId: string) => {
		if (!confirm("确认删除这个克隆音色？此操作不可撤销。")) return;
		setDeletingVoice(voiceId);
		try {
			const result = await ttsDeleteVoice({ providerId, voiceId });
			if (result.ok) {
				toast.success("已删除");
				await state.refresh();
			} else {
				toast.error(result.error || "删除失败");
			}
		} finally {
			setDeletingVoice(null);
		}
	};

	if (state.loading) {
		return (
			<div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-cream-50 px-3 py-3 text-[12px] text-text-muted">
				<Loader2 className="h-3 w-3 animate-spin" /> 加载音色…
			</div>
		);
	}

	if (state.error) {
		return (
			<div className="rounded-xl border border-error/30 bg-error/5 px-3 py-2 text-[12px] text-error">
				加载失败：{state.error}
			</div>
		);
	}

	if (state.voices.length === 0) {
		return (
			<div className="rounded-xl border border-dashed border-border bg-cream-50 px-3 py-4 text-center text-[12px] text-text-muted">
				暂无可用音色（请先填写 API Key 或克隆新音色）
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{onSelectAsDefault && (
				<div className="flex items-center gap-1.5 text-[10.5px] text-text-muted">
					<span className="rounded-full bg-cream-200 px-1.5 py-px text-[9.5px] uppercase tracking-wider text-text-secondary">
						提示
					</span>
					<span>点击任意音色卡即可将其设为默认朗读音色</span>
				</div>
			)}
			<div className="grid max-h-[320px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
				{state.voices.map((v) => {
					const selected =
						!!isDefaultProvider &&
						!!selectedVoiceId &&
						selectedVoiceId === v.id;
					return (
						<VoiceCard
							key={v.id}
							voice={v}
							previewing={busyVoice === v.id}
							deleting={deletingVoice === v.id}
							allowDelete={allowDelete}
							selected={selected}
							accentColor={accentColor}
							onPreview={() => void handlePreview(v.id)}
							onDelete={() => void handleDelete(v.id)}
							onSelect={
								onSelectAsDefault ? () => onSelectAsDefault(v.id) : undefined
							}
						/>
					);
				})}
			</div>
		</div>
	);
}

interface VoiceCardProps {
	voice: TTSVoice;
	previewing: boolean;
	deleting: boolean;
	allowDelete: boolean;
	selected: boolean;
	accentColor?: string;
	onPreview: () => void;
	onDelete: () => void;
	onSelect?: () => void;
}

function VoiceCard({
	voice,
	previewing,
	deleting,
	allowDelete,
	selected,
	accentColor,
	onPreview,
	onDelete,
	onSelect,
}: VoiceCardProps) {
	const accent = accentColor || "var(--t-primary)";
	const interactive = !!onSelect;
	return (
		<div
			className={cn(
				"group relative flex items-center gap-3 rounded-xl border bg-surface px-3 py-2 transition-[color,background-color,border-color,box-shadow]",
				selected
					? "shadow-bai-card"
					: "border-border hover:border-cream-500 hover:shadow-bai-card",
				interactive && !selected && "cursor-pointer",
			)}
			style={
				selected
					? {
							borderColor: accent,
							backgroundColor: `${accent}0d`,
						}
					: undefined
			}
			role={interactive ? "button" : undefined}
			tabIndex={interactive ? 0 : undefined}
			onClick={interactive ? onSelect : undefined}
			onKeyDown={
				interactive
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onSelect?.();
							}
						}
					: undefined
			}
			aria-pressed={interactive ? selected : undefined}
		>
			<span
				className={cn(
					"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-semibold uppercase",
					voice.is_cloned
						? "border-violetx-500/40 bg-violetx-500/10 text-violetx-600"
						: "border-border bg-cream-100 text-text-secondary",
				)}
			>
				{voice.name.slice(0, 2)}
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-[12.5px] font-medium text-text-primary">
						{voice.name}
					</span>
					{voice.is_cloned && (
						<span className="rounded-full bg-violetx-500/10 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wider text-violetx-600">
							克隆
						</span>
					)}
					{selected && (
						<span
							className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wider"
							style={{
								backgroundColor: `${accent}1f`,
								color: accent,
							}}
						>
							<CheckCircle2 className="h-2.5 w-2.5" strokeWidth={2.2} />
							默认
						</span>
					)}
				</div>
				<div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-text-muted">
					{voice.language ? (
						<span className="rounded-md bg-cream-200 px-1.5 py-px font-mono">
							{voice.language}
						</span>
					) : (
						<span className="text-text-light">未标注语言</span>
					)}
				</div>
			</div>
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onPreview();
					}}
					disabled={previewing}
					className="rounded-md p-1.5 text-text-muted transition hover:bg-cream-200 hover:text-text-primary disabled:opacity-40"
					title="试听"
				>
					{previewing ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<PlayCircle className="h-3.5 w-3.5" />
					)}
				</button>
				{allowDelete && voice.is_cloned && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						disabled={deleting}
						className="rounded-md p-1.5 text-text-muted transition hover:bg-error/10 hover:text-error disabled:opacity-40 opacity-0 group-hover:opacity-100"
						title="删除该克隆音色"
					>
						{deleting ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Trash2 className="h-3.5 w-3.5" />
						)}
					</button>
				)}
			</div>
		</div>
	);
}
