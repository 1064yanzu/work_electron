// 分享卡片视图组件（剪藏分享卡片）

import {
	ExternalLink,
	Image as ImageIcon,
	Loader2,
	RefreshCw,
	Settings,
	Trash2,
	Type,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteCard as deleteCardApi, getCardImagePath } from "../../lib/api";
import { EVENTS, events } from "../../lib/events";
import { useCardsQuery } from "../../lib/query";
import { convertFileSrc, invoke } from "../../lib/tauriCompat";
import type { Card } from "../../types";
import { AutoVirtualGrid } from "../ui/AutoVirtualGrid";
import { confirmDialog } from "../ui/ConfirmDialog";
import { Modal } from "../ui/Modal";
import { toast } from "../ui/Toast";
import { IllustratedEmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";

interface SharedCardsEmbeddedProps {
	hideTitle?: boolean;
}

export function SharedCardsEmbedded({ hideTitle }: SharedCardsEmbeddedProps) {
	const [cards, setCards] = useState<Card[]>([]);
	const [cardImages, setCardImages] = useState<Record<string, string>>({});
	const [isLoadingCards, setIsLoadingCards] = useState(false);
	const [cardErrorMessage, setCardErrorMessage] = useState<string | null>(null);
	const [cardPreview, setCardPreview] = useState<Card | null>(null);

	// 延迟提交的删除：卡片没有后端软删（`delete_card` 会连图片文件一起抹掉，
	// 不可逆），所以撤销窗口只能放在前端——先从列表里乐观移除并挂一个 5 秒定时器，
	// 时间到了才真正落库。组件卸载时把未到期的删除立即兑现，避免用户以为删掉了
	// 但切走一次就复活。
	const pendingDeletesRef = useRef(new Map<string, number>());
	// 卡片列表滚动容器（AutoVirtualGrid 超过阈值时按此容器虚拟化）
	const cardsScrollRef = useRef<HTMLDivElement | null>(null);

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
			console.error("获取分享卡失败:", error);
			setCardErrorMessage("获取分享卡失败");
		} finally {
			setIsLoadingCards(false);
		}
	}, [cardsQuery, buildCardImages]);

	useEffect(() => {
		if (!cardsQuery.data) return;
		setCards(cardsQuery.data);
		void buildCardImages(cardsQuery.data);
	}, [cardsQuery.data, buildCardImages]);

	/** 把一条待删卡片真正落库（定时器到期或组件卸载时调用） */
	const commitDeleteCard = useCallback(
		async (cardId: string) => {
			pendingDeletesRef.current.delete(cardId);
			try {
				await deleteCardApi(cardId);
				setCardImages((prev) => {
					if (!(cardId in prev)) return prev;
					const next = { ...prev };
					delete next[cardId];
					return next;
				});
			} catch (error) {
				console.error("删除卡片失败:", error);
				toast.error(
					`删除卡片失败：${
						error instanceof Error ? error.message : String(error)
					}`,
				);
				await fetchCards();
			}
		},
		[fetchCards],
	);

	const handleDeleteCard = useCallback(
		async (card: Card) => {
			const confirmed = await confirmDialog.show({
				type: "danger",
				title: "删除卡片",
				message: `确定删除「${card.title}」吗？图片文件也会一并移除。`,
				confirmText: "删除",
				cancelText: "取消",
			});
			if (!confirmed) return;

			// 乐观移除 + 撤销窗口
			setCards((prev) => prev.filter((item) => item.id !== card.id));
			setCardPreview((prev) => (prev?.id === card.id ? null : prev));

			const timer = window.setTimeout(() => {
				void commitDeleteCard(card.id);
			}, 5000);
			pendingDeletesRef.current.set(card.id, timer);

			toast.show(`已删除「${card.title}」`, {
				type: "warning",
				duration: 5000,
				actionLabel: "撤销",
				actionVariant: "primary",
				onAction: () => {
					const pending = pendingDeletesRef.current.get(card.id);
					if (pending === undefined) {
						// 已经落库了，撤不回来——如实告诉用户，不做假恢复
						toast.error("撤销来晚了，卡片已删除");
						return;
					}
					window.clearTimeout(pending);
					pendingDeletesRef.current.delete(card.id);
					setCards((prev) =>
						prev.some((item) => item.id === card.id)
							? prev
							: [card, ...prev].sort(
									(a, b) =>
										new Date(b.created_at).getTime() -
										new Date(a.created_at).getTime(),
								),
					);
				},
			});
		},
		[commitDeleteCard],
	);

	// 卸载前兑现所有未到期的删除
	useEffect(() => {
		const pending = pendingDeletesRef.current;
		return () => {
			for (const [cardId, timer] of pending) {
				window.clearTimeout(timer);
				void deleteCardApi(cardId).catch((error) => {
					console.error("卸载时提交卡片删除失败:", error);
				});
			}
			pending.clear();
		};
	}, []);

	const handleOpenCardSource = useCallback((card: Card) => {
		if (card.source_url) {
			invoke("open_external_url", { url: card.source_url });
		}
	}, []);

	return (
		<div className="flex flex-col h-full">
			{/* 卡片预览弹窗 — 复用 <Modal>（自带 overlayStack / Esc / 焦点回归） */}
			{cardPreview && (
				<Modal
					isOpen
					onClose={() => setCardPreview(null)}
					title={cardPreview.title}
				>
					<div className="space-y-4">
						<div className="flex items-center justify-between gap-3">
							<p className="text-xs text-text-light">
								{new Date(cardPreview.created_at).toLocaleString("zh-CN", {
									year: "numeric",
									month: "short",
									day: "numeric",
									hour: "2-digit",
									minute: "2-digit",
								})}
							</p>
							{cardPreview.source_url && (
								<button
									onClick={() => handleOpenCardSource(cardPreview)}
									className="shrink-0 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-warm-200 rounded-lg transition-colors"
								>
									访问原文
								</button>
							)}
						</div>

						<div className="overflow-hidden rounded-xl bg-warm-100">
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
										<p className="text-sm text-text-light">图片加载中…</p>
									</div>
								</div>
							)}
						</div>

						<div className="bg-warm-50/50 rounded-xl p-4">
							<p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
								{cardPreview.text}
							</p>
						</div>

						<div className="flex flex-wrap gap-2">
							{cardPreview.theme_id && (
								<span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-warm-200 rounded-lg text-xs text-text-secondary">
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
				</Modal>
			)}

			{/* 嵌入式可选标题区（仅在 hideTitle=false 时显示） */}
			{!hideTitle ? (
				<div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-border">
					<div className="flex items-center gap-2">
						<ImageIcon className="w-4 h-4 text-text-light" />
						<h2 className="font-semibold text-sm text-text-primary">分享卡</h2>
					</div>
					<button
						onClick={fetchCards}
						className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
						title="刷新"
					>
						{isLoadingCards ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							<RefreshCw className="w-4 h-4" />
						)}
					</button>
				</div>
			) : null}

			{/* 卡片列表内容 */}
			<div ref={cardsScrollRef} className="flex-1 overflow-y-auto p-3">
				{cardErrorMessage ? (
					<div className="text-center py-10">
						<p className="text-sm text-error mb-2">{cardErrorMessage}</p>
						<button
							onClick={fetchCards}
							className="text-xs text-focus hover:underline"
						>
							重试
						</button>
					</div>
				) : isLoadingCards ? (
					<div className="space-y-4" aria-busy="true">
						<Skeleton className="h-40 w-full rounded-2xl" />
						<Skeleton className="h-40 w-full rounded-2xl" />
						<Skeleton className="h-40 w-2/3 rounded-2xl" />
					</div>
				) : cards.length === 0 ? (
					<IllustratedEmptyState
						illustration="document"
						title="暂无分享卡"
						description="请在浏览器插件中生成并发送分享卡"
						action={
							<button
								type="button"
								onClick={() =>
									events.emit(EVENTS.OPEN_SETTINGS, {
										tab: "integrations.clip",
									})
								}
								className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-warm-200/60 hover:text-text-primary"
							>
								<Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
								查看剪藏服务设置
							</button>
						}
					/>
				) : (
					<AutoVirtualGrid
						items={cards}
						scrollRef={cardsScrollRef}
						getItemKey={(card) => card.id}
						estimateSize={420}
						gap={16}
						className="space-y-4"
						renderItem={(card) => {
							const imageSrc = cardImages[card.id];
							return (
								<div
									key={card.id}
									onClick={() => setCardPreview(card)}
									className="group rounded-2xl bg-surface/50 ring-1 ring-border/50 hover:ring-border/80 shadow-bai-card hover:shadow-float transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250 cursor-pointer overflow-hidden hover:-translate-y-0.5"
								>
									<div className="relative bg-warm-100">
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
													<p className="text-xs text-text-light">图片加载中…</p>
												</div>
											</div>
										)}
										{card.theme_id && (
											<span className="absolute top-3 left-3 px-2.5 py-1 text-2xs font-medium rounded-full bg-surface/90 text-text-secondary shadow-sm">
												{card.theme_id}
											</span>
										)}
									</div>

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
													className="shrink-0 p-1.5 text-text-light hover:text-focus hover:bg-focus/8 rounded-lg transition-colors"
													title="访问原文"
												>
													<ExternalLink className="w-3.5 h-3.5" />
												</button>
											)}
										</div>

										<p className="text-sm text-text-muted leading-relaxed line-clamp-3">
											{card.text}
										</p>

										<div className="flex items-center justify-between pt-2 border-t border-border/50">
											<div className="flex items-center gap-2 text-xs text-text-light">
												{card.aspect_ratio && (
													<span className="px-1.5 py-0.5 bg-warm-200 rounded-lg text-2xs">
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
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													void handleDeleteCard(card);
												}}
												className="p-1.5 text-text-light hover:text-error hover:bg-error/8 rounded-lg opacity-0 group-hover:opacity-100 transition-[color,background-color,border-color,opacity,box-shadow,transform]"
												title="删除分享卡"
												aria-label={`删除分享卡「${card.title}」`}
											>
												<Trash2 className="w-3.5 h-3.5" />
											</button>
										</div>
									</div>
								</div>
							);
						}}
					/>
				)}
			</div>
		</div>
	);
}
