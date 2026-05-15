/**
 * BrandExtractInput —— Discovery 阶段的"提取品牌"输入。
 *
 * 用户输入一个站点 URL，调用 designExtractBrand 把 colors/fonts 落到
 * <work_dir>/brand-spec.md。提取结果以 swatch + 字体名展示，
 * 让用户感知到 system prompt 会带这些信息。
 */
import { CheckCircle2, Globe, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { designExtractBrand } from "../../lib/api/design";
import { Button } from "../ui/Button";
import { toast } from "../ui/Toast";

interface BrandExtractInputProps {
	sessionId: string;
}

interface ExtractResult {
	colors: string[];
	fonts: string[];
	site_name?: string;
	logo_url?: string;
	favicon_url?: string;
	brand_spec_path: string;
}

export function BrandExtractInput({ sessionId }: BrandExtractInputProps) {
	const [url, setUrl] = useState("");
	const [running, setRunning] = useState(false);
	const [result, setResult] = useState<ExtractResult | null>(null);

	const handleExtract = async () => {
		const trimmed = url.trim();
		if (!trimmed) return;
		const normalized = /^https?:\/\//i.test(trimmed)
			? trimmed
			: `https://${trimmed}`;
		try {
			setRunning(true);
			const res = await designExtractBrand({
				session_id: sessionId,
				url: normalized,
			});
			setResult(res);
			toast.success(
				`已提取 ${res.colors.length} 个颜色 · ${res.fonts.length} 个字体`,
			);
		} catch (err) {
			toast.error(
				`提取失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setRunning(false);
		}
	};

	return (
		<div className="flex flex-col gap-2.5 p-3 rounded-2xl border border-cream-300 bg-cream-50/70 shadow-bai-card dark:border-cream-500/60 dark:bg-cream-900/70">
			<div className="flex items-center gap-1.5">
				<Globe className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.5} />
				<span className="text-xs font-medium text-text-primary">
					从站点提取品牌（可选）
				</span>
			</div>
			<p className="text-[11px] text-text-muted leading-relaxed">
				填一个你想参照的站点 URL，我会抓 color/font 落盘到 brand-spec.md，
				system prompt 会以最高优先级带入。
			</p>
			<div className="flex items-center gap-2">
				<input
					type="text"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					placeholder="linear.app"
					disabled={running}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							void handleExtract();
						}
					}}
					className="flex-1 px-3 py-2 rounded-xl border border-cream-300 bg-cream-100/60 text-xs text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-cream-500 focus:shadow-[0_0_0_3px_var(--t-primary-muted)] dark:border-cream-500/60 dark:bg-cream-800/40"
				/>
				<Button
					type="button"
					variant="action"
					size="sm"
					shape="rounded"
					onClick={() => void handleExtract()}
					disabled={running || !url.trim()}
					icon={
						running ? (
							<Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
						) : (
							<Sparkles className="w-3 h-3" strokeWidth={1.5} />
						)
					}
				>
					{running ? "抓取中…" : "提取"}
				</Button>
			</div>

			{result ? (
				<div className="flex flex-col gap-2 pt-2 border-t border-border">
					<div className="flex items-center gap-1.5 text-[11px] text-text-muted">
						<CheckCircle2 className="w-3 h-3 text-primary" strokeWidth={1.5} />
						<span>
							已落盘：{result.site_name ?? "(未识别)"} ·{" "}
							<code className="text-[10px] text-text-muted bg-warm-200/40 px-1 rounded">
								brand-spec.md
							</code>
						</span>
					</div>
					{result.colors.length > 0 ? (
						<div className="flex items-center gap-1.5 flex-wrap">
							{result.colors.slice(0, 8).map((c) => (
								<span
									key={c}
									className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5"
									title={c}
								>
									<span
										className="w-3 h-3 rounded-sm border border-border"
										style={{ background: c }}
									/>
									<span className="text-[10px] font-mono text-text-muted">
										{c}
									</span>
								</span>
							))}
						</div>
					) : null}
					{result.fonts.length > 0 ? (
						<div className="flex items-center gap-1.5 flex-wrap text-[11px] text-text-muted">
							<span>字体：</span>
							{result.fonts.map((f) => (
								<span
									key={f}
									className="px-1.5 py-0.5 rounded-md bg-warm-200/40 text-text-primary"
									style={{ fontFamily: `"${f}", sans-serif` }}
								>
									{f}
								</span>
							))}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
