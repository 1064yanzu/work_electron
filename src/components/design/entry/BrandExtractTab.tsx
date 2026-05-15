/**
 * Brand Tab：让用户先从一个 URL 提取品牌色板/字体，再用它启动一次设计。
 *
 * 与 src/components/design/BrandExtractInput 的区别：
 * - 它在 Discovery 表单中作为字段附属；
 * - 本组件在入口首屏，先「占位创建一个 session」再 extract，最后跳到 discovery，
 *   draftAnswers.answers.brand 自动设为 brand-spec。
 */
import { CheckCircle2, Globe, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import {
	designExtractBrand,
	designListSessions,
	designStartSession,
} from "../../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../../lib/stores";
import { Button } from "../../ui/Button";
import { toast } from "../../ui/Toast";

interface ExtractResult {
	colors: string[];
	fonts: string[];
	site_name?: string;
	brand_spec_path: string;
}

export function BrandExtractTab() {
	const isStarting = useDesignStoreSelector((s) => s.isStarting);
	const [url, setUrl] = useState("");
	const [running, setRunning] = useState(false);
	const [result, setResult] = useState<ExtractResult | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);

	const ensureSession = async (): Promise<string> => {
		if (sessionId) return sessionId;
		const r = await designStartSession({
			title: url ? `品牌：${url}` : "品牌设计",
		});
		designStore.setDiscoveryForm(r.discovery_form);
		designStore.setCurrentSession({
			id: r.session_id,
			title: url ? `品牌：${url}` : "品牌设计",
			status: "draft",
			work_dir: r.work_dir,
			created_at: Date.now(),
			updated_at: Date.now(),
		});
		designStore.resetDraft();
		designStore.patchDraftAnswers({ answers: { brand: "brand-spec" } });
		setSessionId(r.session_id);
		return r.session_id;
	};

	const handleExtract = async () => {
		const trimmed = url.trim();
		if (!trimmed) return;
		const normalized = /^https?:\/\//i.test(trimmed)
			? trimmed
			: `https://${trimmed}`;
		try {
			setRunning(true);
			const id = await ensureSession();
			const res = await designExtractBrand({
				session_id: id,
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

	const handleContinue = async () => {
		try {
			designStore.setStarting(true);
			if (!sessionId) {
				await ensureSession();
			}
			designStore.setStage("discovery");
			const list = await designListSessions({ limit: 50 });
			designStore.setSessionsList(list);
		} finally {
			designStore.setStarting(false);
		}
	};

	return (
		<div className="max-w-2xl flex flex-col gap-5">
			<div className="flex flex-col gap-2">
				<div className="inline-flex items-center gap-2 text-text-primary">
					<Globe className="w-4 h-4 text-primary" strokeWidth={1.6} />
					<span className="text-sm font-medium">从站点提取品牌</span>
				</div>
				<p className="text-xs text-text-muted leading-relaxed">
					填一个你想参照的站点 URL（例如 <code>linear.app</code> /{" "}
					<code>cohere.com</code>）， 我会抓取主色、字体与 logo，落盘成{" "}
					<code>brand-spec.md</code> 注入 system prompt。
				</p>
			</div>

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
					className="flex-1 px-3.5 py-2.5 rounded-full border border-cream-300 bg-cream-100/60 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-cream-500 focus:shadow-[0_0_0_3px_var(--t-primary-muted)] dark:border-cream-500/60 dark:bg-cream-800/40"
				/>
				<Button
					type="button"
					variant="action"
					size="md"
					onClick={() => void handleExtract()}
					disabled={running || !url.trim()}
					icon={
						running ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.6} />
						) : (
							<Sparkles className="w-3.5 h-3.5" strokeWidth={1.6} />
						)
					}
				>
					{running ? "抓取中…" : "提取"}
				</Button>
			</div>

			{result ? (
				<div className="flex flex-col gap-3 p-4 rounded-2xl border border-cream-300 bg-cream-50 shadow-bai-card dark:border-cream-500/60 dark:bg-cream-900">
					<div className="flex items-center gap-2 text-xs text-text-primary">
						<CheckCircle2 className="w-4 h-4 text-primary" strokeWidth={1.6} />
						<span className="font-medium">
							{result.site_name ?? "已识别站点"}
						</span>
						<span className="text-text-muted">
							已落盘到{" "}
							<code className="bg-warm-200/40 px-1 rounded">brand-spec.md</code>
						</span>
					</div>
					{result.colors.length > 0 ? (
						<div className="flex items-center gap-2 flex-wrap">
							{result.colors.slice(0, 10).map((c) => (
								<span
									key={c}
									className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1"
									title={c}
								>
									<span
										className="w-3.5 h-3.5 rounded-full border border-border"
										style={{ background: c }}
									/>
									<span className="text-[11px] font-mono text-text-muted">
										{c}
									</span>
								</span>
							))}
						</div>
					) : null}
					{result.fonts.length > 0 ? (
						<div className="flex items-center gap-2 flex-wrap text-[11px] text-text-muted">
							<span>字体：</span>
							{result.fonts.map((f) => (
								<span
									key={f}
									className="px-2 py-0.5 rounded-full bg-warm-200/40 text-text-primary"
									style={{ fontFamily: `"${f}", sans-serif` }}
								>
									{f}
								</span>
							))}
						</div>
					) : null}
					<div className="flex justify-end pt-1">
						<Button
							type="button"
							variant="action"
							size="sm"
							disabled={isStarting}
							onClick={() => void handleContinue()}
							icon={<Sparkles className="w-3.5 h-3.5" strokeWidth={1.6} />}
							iconPosition="right"
						>
							继续填答卷
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
