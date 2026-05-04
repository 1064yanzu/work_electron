// 分享卡片视图组件

import {
	ExternalLink,
	Image as ImageIcon,
	Loader2,
	RefreshCw,
	Settings,
	Trash2,
	Type,
	X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { deleteCard as deleteCardApi, getCardImagePath } from "../../lib/api";
import { useCardsQuery } from "../../lib/query";
import { convertFileSrc, invoke } from "../../lib/tauriCompat";
import type { Card } from "../../types";
import { toast } from "../ui/Toast";

interface CardsViewProps {
	viewTabs: React.ReactNode;
	onOpenSettings: () => void;
}

export function CardsView({ viewTabs, onOpenSettings }: CardsViewProps) {
	const [cards, setCards] = useState<Card[]>([]);
	const [cardImages, setCardImages] = useState<Record<string, string>>({});
	const [isLoadingCards, setIsLoadingCards] = useState(false);
	const [cardErrorMessage, setCardErrorMessage] = useState<string | null>(null);
	const [cardPreview, setCardPreview] = useState<Card | null>(null);
	const [cardDeleteConfirm, setCardDeleteConfirm] = useState<Card | null>(null);

	const cardsQuery = useCardsQuery();

	const buildCardImages = useCallback(async (data: Card[]) => {
		const entries = await Promise.all(
			data.map(async (card) => {
				try {
					const fullPath = await getCardImagePath(card.image_path);
					const assetUrl = convertFileSrc(fullPath);
					return [card.id, assetUrl] as const;
				} catch (error) {
					console.error("加载卡片图片失败:", error);
					return [card.id, ""] as const;
				}
			}),
		);
		setCardImages(Object.fromEntries(entries));
	}, []);

	const fetchCards = useCallback(async () => {
		setIsLoadingCards(true);
		try {
			const result = await cardsQuery.refetch();
			const data = result.data ?? [];
			setCards(data);
			await buildCardImages(data);
			setCardErrorMessage(null);
		} catch (error) {
			console.error("获取分享卡片失败:", error);
			setCardErrorMessage("获取分享卡片失败");
		} finally {
			setIsLoadingCards(false);
		}
	}, [cardsQuery, buildCardImages]);

	useEffect(() => {
		if (!cardsQuery.data) return;
		setCards(cardsQuery.data);
		void buildCardImages(cardsQuery.data);
	}, [cardsQuery.data, buildCardImages]);

	const handleDeleteCard = useCallback((card: Card) => {
		setCardDeleteConfirm(card);
	}, []);

	const confirmDeleteCard = useCallback(async () => {
		if (!cardDeleteConfirm) return;
		try {
			await deleteCardApi(cardDeleteConfirm.id);
			setCards((prev) =>
				prev.filter((card) => card.id !== cardDeleteConfirm.id),
			);
			setCardImages((prev) => {
				const next = { ...prev };
				delete next[cardDeleteConfirm.id];
				return next;
			});
			if (cardPreview?.id === cardDeleteConfirm.id) {
				setCardPreview(null);
			}
		} catch (error) {
			console.error("删除卡片失败:", error);
			toast.error("删除卡片失败");
		} finally {
			setCardDeleteConfirm(null);
		}
	}, [cardDeleteConfirm, cardPreview]);

	const handleOpenCardSource = useCallback((card: Card) => {
		if (card.source_url) {
			invoke("open_external_url", { url: card.source_url });
		}
	}, []);

	return (
		<>
			{/* 卡片删除确认对话框 */}
			{cardDeleteConfirm ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
					<div className="bg-surface rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
						<h3 className="font-semibold text-lg text-text-primary mb-2">
							删除卡片
						</h3>
						<p className="text-sm text-text-muted mb-6">
							确定删除「{cardDeleteConfirm.title}」吗？图片文件也会一并移除。
						</p>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setCardDeleteConfirm(null)}
								className="px-4 py-2 text-sm text-text-secondary hover:bg-warm-200 dark:hover:bg-cream-700 rounded-lg transition-colors"
							>
								取消
							</button>
							<button
								type="button"
								onClick={() => void confirmDeleteCard()}
								className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
							>
								删除
							</button>
						</div>
					</div>
				</div>
			) : null}

			{/* 卡片预览弹窗 */}
			{cardPreview && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
					onClick={() => setCardPreview(null)}
				>
					<div
						className="bg-surface rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
						onClick={(e) => e.stopPropagation()}
					>
						{/* 头部 */}
						<div className="flex items-center justify-between px-5 py-4 border-b border-border">
							<div className="flex-1 min-w-0 pr-4">
								<h3 className="text-base font-semibold text-text-primary truncate">
									{cardPreview.title}
								</h3>
								<p className="text-xs text-text-light mt-0.5">
									{new Date(cardPreview.created_at).toLocaleString("zh-CN", {
										year: "numeric",
										month: "short",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})}
								</p>
							</div>
							<div className="flex items-center gap-1.5 shrink-0">
								{cardPreview.source_url && (
									<button
										onClick={() => handleOpenCardSource(cardPreview)}
										className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
									>
										访问原文
									</button>
								)}
								<button
									onClick={() => setCardPreview(null)}
									className="p-2 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-xl transition-colors"
								>
									<X className="w-4 h-4" />
								</button>
							</div>
						</div>

						{/* 内容区域 - 可滚动 */}
						<div className="overflow-y-auto max-h-[calc(90vh-80px)]">
							{/* 图片 */}
							<div className="bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-900">
								{cardImages[cardPreview.id] ? (
									<img
										src={cardImages[cardPreview.id]}
										alt={cardPreview.title}
										className="w-full object-contain"
										onError={(e) => {
											(e.target as HTMLImageElement).style.display = "none";
										}}
									/>
								) : (
									<div className="aspect-[4/5] flex items-center justify-center">
										<div className="text-center">
											<ImageIcon className="w-10 h-10 text-text-light mx-auto mb-2" />
											<p className="text-sm text-text-light">图片加载中...</p>
										</div>
									</div>
								)}
							</div>

							{/* 文本内容 */}
							<div className="p-5 space-y-4">
								<div className="bg-warm-50/50 rounded-xl p-4">
									<p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
										{cardPreview.text}
									</p>
								</div>

								{/* 元信息 */}
								<div className="flex flex-wrap gap-2">
									{cardPreview.theme_id && (
										<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-warm-200 rounded-lg text-xs text-text-secondary">
											<span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
											{cardPreview.theme_id}
										</span>
									)}
									{cardPreview.font_id && (
										<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-warm-200 rounded-lg text-xs text-text-secondary">
											<Type className="w-3 h-3" />
											{cardPreview.font_id}
										</span>
									)}
									{cardPreview.aspect_ratio && (
										<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-warm-200 rounded-lg text-xs text-text-secondary">
											<ImageIcon className="w-3 h-3" />
											{cardPreview.aspect_ratio}
										</span>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* 卡片列表头部 */}
			<div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-border">
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-2">
						<ImageIcon className="w-4 h-4 text-text-light" />
						<h2 className="font-semibold text-sm text-text-primary">
							分享卡片
						</h2>
					</div>
					{viewTabs}
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={fetchCards}
						className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
						title="刷新卡片"
					>
						{isLoadingCards ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							<RefreshCw className="w-4 h-4" />
						)}
					</button>
					<button
						onClick={onOpenSettings}
						className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
					>
						<Settings className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* 卡片列表内容 */}
			<div className="flex-1 overflow-y-auto scrollbar-hide p-3">
				{cardErrorMessage ? (
					<div className="text-center py-10">
						<p className="text-sm text-red-500 mb-2">{cardErrorMessage}</p>
						<button
							onClick={fetchCards}
							className="text-xs text-blue-600 hover:underline"
						>
							重试
						</button>
					</div>
				) : isLoadingCards ? (
					<div className="flex items-center justify-center h-32">
						<Loader2 className="w-5 h-5 animate-spin text-text-light" />
					</div>
				) : cards.length === 0 ? (
					<div className="text-center py-12">
						<div className="w-16 h-16 bg-warm-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
							<ImageIcon className="w-7 h-7 text-text-light" />
						</div>
						<p className="text-sm font-medium text-text-secondary mb-1">
							暂无分享卡片
						</p>
						<p className="text-xs text-text-light">
							请在浏览器插件中生成并发送卡片
						</p>
					</div>
				) : (
					<div className="space-y-4">
						{cards.map((card) => {
							const imageSrc = cardImages[card.id];
							return (
								<div
									key={card.id}
									onClick={() => setCardPreview(card)}
									className="group rounded-2xl bg-surface/50 ring-1 ring-zinc-200/50 dark:ring-zinc-700/40 hover:ring-zinc-300/80 dark:hover:ring-zinc-600/60 shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-all duration-300 cursor-pointer overflow-hidden hover:-translate-y-1"
								>
									{/* 卡片图片区域 */}
									<div className="relative bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-900">
										{imageSrc ? (
											<img
												src={imageSrc}
												alt={card.title}
												className="w-full object-contain"
												onError={(e) => {
													console.error("图片加载失败:", imageSrc);
													(e.target as HTMLImageElement).style.display = "none";
												}}
											/>
										) : (
											<div className="aspect-[4/5] flex items-center justify-center">
												<div className="text-center">
													<ImageIcon className="w-8 h-8 text-text-light mx-auto mb-2" />
													<p className="text-xs text-text-light">
														图片加载中...
													</p>
												</div>
											</div>
										)}
										{/* 主题标签 */}
										{card.theme_id && (
											<span className="absolute top-3 left-3 px-2.5 py-1 text-[10px] font-medium rounded-full bg-surface/90/80 text-text-secondary shadow-sm backdrop-blur-sm">
												{card.theme_id}
											</span>
										)}
									</div>

									{/* 卡片信息区域 */}
									<div className="p-4 space-y-3">
										<div className="flex items-start justify-between gap-3">
											<h3 className="text-sm font-semibold text-text-primary leading-snug line-clamp-2 flex-1">
												{card.title}
											</h3>
											{card.source_url && (
												<button
													onClick={(e) => {
														e.stopPropagation();
														handleOpenCardSource(card);
													}}
													className="shrink-0 p-1.5 text-text-light hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
													title="访问原文"
												>
													<ExternalLink className="w-3.5 h-3.5" />
												</button>
											)}
										</div>

										<p className="text-[13px] text-text-muted leading-relaxed line-clamp-3">
											{card.text}
										</p>

										<div className="flex items-center justify-between pt-2 border-t border-border/50">
											<div className="flex items-center gap-2 text-xs text-text-light">
												{card.aspect_ratio && (
													<span className="px-1.5 py-0.5 bg-warm-200 dark:bg-cream-700/50 rounded text-[10px]">
														{card.aspect_ratio}
													</span>
												)}
												<span>
													{new Date(card.created_at).toLocaleDateString(
														"zh-CN",
														{ month: "short", day: "numeric" },
													)}
												</span>
											</div>
											<button
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteCard(card);
												}}
												className="p-1.5 text-text-light hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
												title="删除卡片"
											>
												<Trash2 className="w-3.5 h-3.5" />
											</button>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</>
	);
}
