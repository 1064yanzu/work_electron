/**
 * CustomMascotEditor — 自定义桌宠 meta 编辑面板（dialog）
 *
 * 仅允许修改 label / tagline / personality / accentColor。
 * 资源（PNG/atlas/loading）只能通过重新上传 zip 替换。
 */

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useFocusTrap } from "../ui/FocusTrap";
import { useMascot, type CustomMascotMeta } from "../../lib/mascotStore";

export interface CustomMascotEditorProps {
	mascot: CustomMascotMeta | null;
	onClose: () => void;
}

export function CustomMascotEditor({
	mascot,
	onClose,
}: CustomMascotEditorProps) {
	const trapRef = useFocusTrap<HTMLDivElement>({ onEscape: onClose });
	const { updateCustomMeta } = useMascot();
	const [label, setLabel] = useState(mascot?.label ?? "");
	const [tagline, setTagline] = useState(mascot?.tagline ?? "");
	const [personality, setPersonality] = useState(mascot?.personality ?? "");
	const [accentColor, setAccentColor] = useState(
		mascot?.accentColor ?? "#888888",
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// mascot 变更时重置表单
	useEffect(() => {
		if (!mascot) return;
		setLabel(mascot.label);
		setTagline(mascot.tagline);
		setPersonality(mascot.personality);
		setAccentColor(mascot.accentColor);
		setError(null);
	}, [mascot]);

	if (!mascot) return null;

	const handleSave = async () => {
		setSaving(true);
		setError(null);
		try {
			const result = await updateCustomMeta({
				id: mascot.id,
				label: label.trim() || mascot.label,
				tagline: tagline.trim(),
				personality: personality.trim(),
				accentColor: accentColor.trim() || mascot.accentColor,
			});
			if (result.success) {
				onClose();
			} else {
				setError(result.error ?? "保存失败");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
			role="dialog"
			aria-modal
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div ref={trapRef} className="relative w-[min(520px,calc(100vw-32px))] rounded-2xl bg-surface shadow-2xl ring-1 ring-cream-900/5 dark:ring-cream-100/10 overflow-hidden animate-slide-up">
				<div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border/60">
					<div>
						<div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-light">
							编辑自定义桌宠
						</div>
						<div className="text-[15px] font-semibold text-text-primary mt-0.5">
							{mascot.label}
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="text-text-light transition hover:text-text-primary"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="px-6 py-5 space-y-4">
					<FormField label="名字" hint="将出现在选择卡片和设置面板上">
						<input
							type="text"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							maxLength={32}
							className={inputClass}
						/>
					</FormField>

					<FormField label="一句话标语">
						<input
							type="text"
							value={tagline}
							onChange={(e) => setTagline(e.target.value)}
							maxLength={64}
							className={inputClass}
							placeholder="例如：陪你认真摸鱼"
						/>
					</FormField>

					<FormField label="人格描述" hint="影响 ARIA 描述与对比页">
						<textarea
							value={personality}
							onChange={(e) => setPersonality(e.target.value)}
							maxLength={200}
							rows={3}
							className={cn(inputClass, "resize-none")}
							placeholder="一句话描述这只桌宠的形象 / 性格"
						/>
					</FormField>

					<FormField label="主题色 accentColor" hint="影响选中态高亮、气泡边缘">
						<div className="flex items-center gap-2">
							<input
								type="color"
								value={accentColor}
								onChange={(e) => setAccentColor(e.target.value)}
								className="h-9 w-9 rounded-md border border-border cursor-pointer"
							/>
							<input
								type="text"
								value={accentColor}
								onChange={(e) => setAccentColor(e.target.value)}
								maxLength={9}
								className={cn(inputClass, "flex-1 font-mono text-[12px]")}
								placeholder="#RRGGBB"
							/>
						</div>
					</FormField>

					{error && (
						<div className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">
							{error}
						</div>
					)}
				</div>

				<div className="flex items-center justify-end gap-2 px-6 pb-5 pt-2 border-t border-border/60 bg-warm-50/50">
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl px-4 py-2 text-[12.5px] font-medium text-text-secondary hover:bg-warm-100 transition"
					>
						取消
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={saving}
						className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[12.5px] font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
					>
						{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
						保存
					</button>
				</div>
			</div>
		</div>
	);
}

const inputClass =
	"h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px] text-text-primary outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition";

function FormField({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between">
				<label className="text-[12px] font-semibold text-text-primary">
					{label}
				</label>
				{hint && <span className="text-[10.5px] text-text-light">{hint}</span>}
			</div>
			{children}
		</div>
	);
}
