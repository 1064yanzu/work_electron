/**
 * VoiceCloneModal — 克隆新音色弹窗
 *
 * 步骤：
 *  1. 拖拽 / 选择 1~N 段音频样本（mp3 / wav / webm / m4a）
 *  2. 命名 + 描述 + 标签（语言 / 口音 / 用途）
 *  3. 提交：上传 → 训练（监听 tts-clone-progress 事件） → 完成
 *  4. 成功后回调 onCreated
 */
import { Loader2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ttsCloneVoice } from "../../lib/api/tts";
import type { TTSCloneSample, TTSVoice } from "../../lib/tts";
import { listen } from "../../lib/tauriEventCompat";
import {
	settingsInputClass,
	SettingsField,
} from "../Settings/ui/SettingsPrimitives";
import { toast } from "../ui/Toast";
import { useFocusTrap } from "../ui/FocusTrap";

interface VoiceCloneModalProps {
	providerId: string;
	open: boolean;
	onClose: () => void;
	onCreated: (voice: TTSVoice) => void;
}

interface CloneProgressPayload {
	providerId: string;
	stage: "uploading" | "training" | "ready" | "error";
	progress: number;
	message?: string;
}

const ACCEPT = ".mp3,.wav,.m4a,.webm,.ogg,.flac";

export function VoiceCloneModal({
	providerId,
	open,
	onClose,
	onCreated,
}: VoiceCloneModalProps) {
	const trapRef = useFocusTrap<HTMLDivElement>({ onEscape: onClose });
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [language, setLanguage] = useState("zh-CN");
	const [files, setFiles] = useState<File[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [progressStage, setProgressStage] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		let unlisten: (() => void) | null = null;
		void (async () => {
			try {
				unlisten = await listen<CloneProgressPayload>(
					"tts-clone-progress",
					(e) => {
						if (e.payload.providerId !== providerId) return;
						setProgressStage(stageLabel(e.payload.stage));
						setProgress(Math.max(0, Math.min(1, e.payload.progress)));
					},
				);
			} catch {}
		})();
		return () => {
			unlisten?.();
		};
	}, [open, providerId]);

	useEffect(() => {
		if (!open) {
			setName("");
			setDescription("");
			setLanguage("zh-CN");
			setFiles([]);
			setSubmitting(false);
			setProgressStage(null);
			setProgress(0);
		}
	}, [open]);

	if (!open) return null;

	const handleFiles = (list: FileList | null) => {
		if (!list) return;
		const next = [...files];
		for (const f of Array.from(list)) {
			if (f.size === 0) continue;
			next.push(f);
		}
		setFiles(next);
	};

	const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		handleFiles(event.dataTransfer.files);
	};

	const handleSubmit = async () => {
		if (!name.trim()) {
			toast.error("请输入音色名称");
			return;
		}
		if (files.length === 0) {
			toast.error("请至少上传一段样本");
			return;
		}
		setSubmitting(true);
		setProgressStage("上传样本中…");
		setProgress(0.05);

		try {
			const samples: TTSCloneSample[] = await Promise.all(
				files.map(async (f) => ({
					filename: f.name,
					mimeType: f.type || "audio/mpeg",
					dataBase64: await fileToBase64(f),
				})),
			);

			const result = await ttsCloneVoice({
				providerId,
				name,
				description,
				labels: language ? { language } : undefined,
				samples,
			});

			if (result.ok && result.voice) {
				toast.success("克隆成功");
				onCreated(result.voice);
				onClose();
			} else {
				toast.error(result.error || "克隆失败");
			}
		} catch (e) {
			toast.error(`克隆失败：${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
			onClick={(e) => {
				if (e.target === e.currentTarget && !submitting) onClose();
			}}
			onDragEnter={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
			onDragOver={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
			onDrop={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
		>
			<div
				ref={trapRef}
				role="dialog"
				aria-modal="true"
				className="w-[520px] max-w-[92vw] rounded-2xl border border-border shadow-bai-pop animate-in fade-in zoom-in-95 duration-150"
				style={{ backgroundColor: "var(--t-bg-surface)" }}
			>
				<div className="flex items-center justify-between border-b border-border px-5 py-4">
					<h3 className="text-sm font-semibold text-text-primary">
						克隆新音色
					</h3>
					<button
						type="button"
						onClick={onClose}
						disabled={submitting}
						className="rounded-lg p-1 text-text-muted hover:bg-warm-200 hover:text-text-primary disabled:opacity-40"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
					<SettingsField label="音色名称" layout="vertical" required>
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="例如：墨鱼君·治愈男声"
							disabled={submitting}
							className={settingsInputClass}
						/>
					</SettingsField>

					<SettingsField label="描述" layout="vertical">
						<textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="可选：描述音色风格、年龄、口音等"
							disabled={submitting}
							rows={2}
							className={`${settingsInputClass} resize-none`}
						/>
					</SettingsField>

					<SettingsField label="语言" layout="horizontal">
						<select
							value={language}
							onChange={(e) => setLanguage(e.target.value)}
							disabled={submitting}
							className={settingsInputClass}
						>
							<option value="zh-CN">中文（普通话）</option>
							<option value="en-US">English (US)</option>
							<option value="en-GB">English (UK)</option>
							<option value="ja-JP">日本語</option>
							<option value="ko-KR">한국어</option>
							<option value="multi">多语言</option>
						</select>
					</SettingsField>

					<SettingsField
						label="样本音频"
						layout="vertical"
						hint="推荐每段 ≥30 秒、清晰、单人、无背景音"
						required
					>
						<div
							className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface p-6 text-center"
							onDragOver={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
							onDrop={handleDrop}
						>
							<Upload className="w-6 h-6 text-text-muted mb-2" />
							<p className="text-xs text-text-secondary">
								拖拽音频文件到此处，或
								<button
									type="button"
									onClick={() => inputRef.current?.click()}
									disabled={submitting}
									className="ml-1 text-primary hover:underline"
								>
									点击选择
								</button>
							</p>
							<p className="text-xs text-text-muted mt-1">
								支持 mp3 / wav / m4a / webm / ogg / flac
							</p>
							<input
								ref={inputRef}
								type="file"
								accept={ACCEPT}
								multiple
								className="hidden"
								onChange={(e) => handleFiles(e.target.files)}
							/>
						</div>

						{files.length > 0 && (
							<ul className="mt-3 space-y-1">
								{files.map((f, i) => (
									<li
										key={`${f.name}-${i}`}
										className="flex items-center justify-between rounded-lg bg-warm-100 px-3 py-1.5 text-xs text-text-secondary"
									>
										<span className="truncate">{f.name}</span>
										<span className="text-text-muted ml-2">
											{(f.size / 1024).toFixed(0)} KB
										</span>
										<button
											type="button"
											onClick={() =>
												setFiles(files.filter((_, idx) => idx !== i))
											}
											disabled={submitting}
											className="ml-2 rounded p-0.5 text-text-muted hover:bg-warm-200 hover:text-error disabled:opacity-40"
										>
											<X className="w-3 h-3" />
										</button>
									</li>
								))}
							</ul>
						)}
					</SettingsField>

					{submitting && (
						<div className="rounded-lg bg-warm-100 px-3 py-2 text-xs text-text-secondary">
							<div className="flex items-center gap-2 mb-1">
								<Loader2 className="w-3 h-3 animate-spin" />
								<span>{progressStage || "提交中…"}</span>
							</div>
							<div className="h-1 w-full rounded-full bg-warm-200 overflow-hidden">
								<div
									className="h-full bg-primary transition-[color,background-color,border-color,opacity,box-shadow,transform]"
									style={{ width: `${Math.round(progress * 100)}%` }}
								/>
							</div>
						</div>
					)}
				</div>

				<div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
					<button
						type="button"
						onClick={onClose}
						disabled={submitting}
						className="rounded-lg border border-border bg-surface px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40"
					>
						取消
					</button>
					<button
						type="button"
						onClick={() => void handleSubmit()}
						disabled={submitting}
						className="rounded-lg bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
					>
						{submitting && <Loader2 className="w-3 h-3 animate-spin" />}
						{submitting ? "提交中…" : "开始克隆"}
					</button>
				</div>
			</div>
		</div>
	);
}

function stageLabel(stage: CloneProgressPayload["stage"]): string {
	switch (stage) {
		case "uploading":
			return "上传样本中…";
		case "training":
			return "服务端训练中…";
		case "ready":
			return "克隆完成";
		case "error":
			return "克隆失败";
	}
}

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error("文件读取失败"));
				return;
			}
			const idx = result.indexOf(",");
			resolve(idx >= 0 ? result.slice(idx + 1) : result);
		};
		reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
		reader.readAsDataURL(file);
	});
}
