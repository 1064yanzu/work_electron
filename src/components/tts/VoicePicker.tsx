/**
 * VoicePicker — 通用音色选择下拉
 *
 * Props:
 *   - providerId: 必填；不同 provider 的音色集合不同
 *   - value: 当前音色 id（null 表示「跟随上层默认」）
 *   - onChange: 选中后的回调
 *   - allowInherit: 是否允许「跟随全局默认」选项（场景级覆盖时用）
 */
import { Loader2, PlayCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { ttsDeleteVoice, ttsVoicePreview } from "../../lib/api/tts";
import { useTTSVoices } from "../../lib/tts";
import { settingsInputClass } from "../Settings/ui/SettingsPrimitives";
import { toast } from "../ui/Toast";

interface VoicePickerProps {
	providerId: string;
	value: string | null;
	onChange: (voiceId: string | null) => void;
	allowInherit?: boolean;
	allowDelete?: boolean;
	onAfterDelete?: () => void;
	className?: string;
	disabled?: boolean;
}

let previewAudio: HTMLAudioElement | null = null;

async function previewVoice(providerId: string, voiceId: string) {
	try {
		if (previewAudio) {
			previewAudio.pause();
			previewAudio.src = "";
		}
		const result = await ttsVoicePreview({ providerId, voiceId });
		previewAudio = new Audio(
			`data:audio/${result.format || "mpeg"};base64,${result.audioBase64}`,
		);
		await previewAudio.play();
	} catch (e) {
		toast.error(`试听失败：${e instanceof Error ? e.message : String(e)}`);
	}
}

export function VoicePicker({
	providerId,
	value,
	onChange,
	allowInherit = false,
	allowDelete = false,
	onAfterDelete,
	className,
	disabled,
}: VoicePickerProps) {
	const { voices, loading, capabilities, error } = useTTSVoices(providerId);
	const [busyVoice, setBusyVoice] = useState<string | null>(null);

	const handleDelete = async (voiceId: string) => {
		setBusyVoice(voiceId);
		try {
			const result = await ttsDeleteVoice({ providerId, voiceId });
			if (result.ok) {
				toast.success("已删除该克隆音色");
				if (value === voiceId) onChange(null);
				onAfterDelete?.();
			} else {
				toast.error(result.error || "删除失败");
			}
		} finally {
			setBusyVoice(null);
		}
	};

	return (
		<div className={`flex flex-col gap-2 ${className || ""}`}>
			<div className="flex items-center gap-2">
				<select
					value={value ?? ""}
					disabled={disabled || loading}
					onChange={(e) =>
						onChange(e.target.value === "" ? null : e.target.value)
					}
					className={`${settingsInputClass} flex-1`}
				>
					{allowInherit && <option value="">跟随上层默认</option>}
					{voices.map((v) => (
						<option key={v.id} value={v.id}>
							{v.name}
							{v.is_cloned ? "（克隆）" : ""}
							{v.language ? ` · ${v.language}` : ""}
						</option>
					))}
					{voices.length === 0 && !loading && (
						<option value="" disabled>
							（暂无可用音色）
						</option>
					)}
				</select>

				{value && (
					<button
						type="button"
						onClick={() => previewVoice(providerId, value)}
						disabled={disabled || loading}
						className="rounded-md border border-border bg-surface px-2 py-1.5 text-text-muted hover:text-text-primary hover:border-primary/40 transition-colors"
						title="试听"
					>
						<PlayCircle className="w-4 h-4" />
					</button>
				)}

				{allowDelete &&
					capabilities?.deleteVoice &&
					value &&
					voices.find((v) => v.id === value)?.is_cloned && (
						<button
							type="button"
							onClick={() => void handleDelete(value)}
							disabled={busyVoice === value}
							className="rounded-md border border-border bg-surface px-2 py-1.5 text-text-muted hover:text-error hover:border-error/40 transition-colors"
							title="删除该克隆音色"
						>
							{busyVoice === value ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Trash2 className="w-4 h-4" />
							)}
						</button>
					)}
			</div>

			{loading && (
				<div className="flex items-center gap-1.5 text-xs text-text-muted">
					<Loader2 className="w-3 h-3 animate-spin" />
					加载音色…
				</div>
			)}
			{error && (
				<div className="text-xs text-error">音色加载失败：{error}</div>
			)}
		</div>
	);
}
