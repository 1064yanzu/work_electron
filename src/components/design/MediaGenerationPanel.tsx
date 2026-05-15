/**
 * MediaGenerationPanel —— 设计 session 的多模态资产生成入口（M3 骨架）。
 *
 * 当前阶段：
 * - 列出 6 个 provider（image / video / audio / music）
 * - 提交后落库 design_media_history（status=queued）
 * - 展示该 session 的历史记录
 *
 * 真正的 provider 调用接入后只需扩展 runMediaJob 内部；前端不变。
 */
import {
	History,
	Image as ImageIcon,
	Loader2,
	Music,
	Video,
	Volume2,
	Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	designMediaGenerate,
	designMediaHistory,
	designMediaProviders,
	type DesignMediaProvider,
} from "../../lib/api/design";
import { Button } from "../ui/Button";
import { RadioCardGroup } from "../ui/RadioCard";
import { toast } from "../ui/Toast";

type MediaKind = "image" | "video" | "audio" | "music";

const KIND_ICON: Record<MediaKind, typeof ImageIcon> = {
	image: ImageIcon,
	video: Video,
	audio: Volume2,
	music: Music,
};

const KIND_LABEL: Record<MediaKind, string> = {
	image: "图像",
	video: "视频",
	audio: "音频",
	music: "音乐",
};

interface HistoryItem {
	id: string;
	session_id?: string;
	provider: string;
	kind: string;
	prompt: string;
	status: string;
	asset_paths: string[];
	created_at: number;
}

interface MediaGenerationPanelProps {
	sessionId: string;
}

export function MediaGenerationPanel({ sessionId }: MediaGenerationPanelProps) {
	const [providers, setProviders] = useState<DesignMediaProvider[]>([]);
	const [activeKind, setActiveKind] = useState<MediaKind>("image");
	const [activeProvider, setActiveProvider] = useState<string>("");
	const [prompt, setPrompt] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [history, setHistory] = useState<HistoryItem[]>([]);
	const [loadingHistory, setLoadingHistory] = useState(true);

	useEffect(() => {
		void (async () => {
			try {
				const list = await designMediaProviders();
				setProviders(list);
				const firstImage = list.find((p) => p.kinds.includes("image"));
				if (firstImage) setActiveProvider(firstImage.id);
			} catch (err) {
				console.warn("[MediaGenerationPanel] load providers failed", err);
			}
		})();
	}, []);

	const refreshHistory = async () => {
		setLoadingHistory(true);
		try {
			const list = await designMediaHistory({
				session_id: sessionId,
				limit: 20,
			});
			setHistory(list);
		} catch (err) {
			console.warn("[MediaGenerationPanel] load history failed", err);
		} finally {
			setLoadingHistory(false);
		}
	};

	useEffect(() => {
		void refreshHistory();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId]);

	const availableProviders = providers.filter((p) =>
		p.kinds.includes(activeKind),
	);

	const handleKindChange = (kind: MediaKind) => {
		setActiveKind(kind);
		const first = providers.find((p) => p.kinds.includes(kind));
		if (first) setActiveProvider(first.id);
	};

	const handleSubmit = async () => {
		if (!activeProvider || !prompt.trim()) return;
		setSubmitting(true);
		try {
			const res = await designMediaGenerate({
				session_id: sessionId,
				provider: activeProvider,
				kind: activeKind,
				prompt: prompt.trim(),
			});
			if (res.status === "failed") {
				toast.error(`提交失败：${res.error ?? "未知错误"}`);
			} else {
				toast.success("已加入媒体队列");
				setPrompt("");
				void refreshHistory();
			}
		} catch (err) {
			toast.error(
				`提交失败：${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="flex flex-col gap-3 p-3">
			<header className="flex items-center gap-1.5">
				<Wand2 className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.5} />
				<span className="text-xs font-medium text-text-primary">媒体生成</span>
				<span className="text-[10px] text-text-muted">
					· 队列模式（M3 骨架）
				</span>
			</header>

			<RadioCardGroup
				value={activeKind}
				onChange={handleKindChange}
				items={(Object.keys(KIND_LABEL) as MediaKind[]).map((kind) => {
					const Icon = KIND_ICON[kind];
					return {
						value: kind,
						label: KIND_LABEL[kind],
						icon: <Icon className="w-4 h-4" strokeWidth={1.5} />,
					};
				})}
				size="sm"
				layout="horizontal"
				columns={4}
				aria-label="媒体类型"
			/>

			{availableProviders.length > 0 ? (
				<RadioCardGroup
					value={activeProvider}
					onChange={setActiveProvider}
					items={availableProviders.map((p) => ({
						value: p.id,
						label: p.label,
						description: p.requires_key ? "需要 API Key" : undefined,
					}))}
					size="sm"
					layout="horizontal"
					aria-label="媒体服务"
				/>
			) : null}

			<textarea
				value={prompt}
				onChange={(e) => setPrompt(e.target.value)}
				rows={3}
				placeholder={`描述要生成的${KIND_LABEL[activeKind]}…`}
				className="w-full px-3 py-2.5 rounded-2xl border border-cream-300 bg-cream-100/60 text-xs text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:border-cream-500 focus:shadow-[0_0_0_3px_var(--t-primary-muted)] resize-vertical dark:border-cream-500/60 dark:bg-cream-800/40"
			/>

			<Button
				type="button"
				variant="action"
				size="sm"
				shape="rounded"
				onClick={() => void handleSubmit()}
				disabled={submitting || !activeProvider || !prompt.trim()}
				icon={
					submitting ? (
						<Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
					) : (
						<Wand2 className="w-3 h-3" strokeWidth={1.5} />
					)
				}
			>
				{submitting ? "提交中…" : "加入队列"}
			</Button>

			<div className="border-t border-border pt-2 flex flex-col gap-1.5">
				<div className="flex items-center gap-1.5 text-[11px] text-text-muted">
					<History className="w-3 h-3" strokeWidth={1.5} />
					<span>历史</span>
				</div>
				{loadingHistory ? (
					<div className="text-[11px] text-text-muted">加载中…</div>
				) : history.length === 0 ? (
					<div className="text-[11px] text-text-muted">尚无媒体生成记录</div>
				) : (
					<div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
						{history.map((item) => (
							<div
								key={item.id}
								className="flex items-start gap-2 p-2 rounded-md bg-bg-surface/50 border border-border"
							>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-1.5 text-[10px]">
										<span className="text-text-muted">{item.provider}</span>
										<span className="text-text-muted">·</span>
										<span className="text-text-muted">{item.kind}</span>
										<span className="text-text-muted">·</span>
										<span
											className={
												item.status === "done"
													? "text-primary"
													: item.status === "failed"
														? "text-red-500"
														: "text-text-muted"
											}
										>
											{item.status}
										</span>
									</div>
									<div className="text-[11px] text-text-primary truncate mt-0.5">
										{item.prompt}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
