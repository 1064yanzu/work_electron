import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
	EASE,
	Flip,
	gsap,
	isReducedMotion,
	mDur,
	useGsapMotion,
} from "../../lib/motion";
import { cn } from "../../lib/utils";

export type ToastType = "success" | "error" | "info" | "warning";
export type ToastActionVariant = "default" | "primary" | "danger";

export interface ToastOptions {
	type?: ToastType;
	duration?: number;
	closable?: boolean;
	actionLabel?: string;
	onAction?: () => void | Promise<void>;
	actionVariant?: ToastActionVariant;
}

interface ToastItem {
	id: string;
	message: string;
	type: ToastType;
	duration: number;
	closable: boolean;
	actionLabel?: string;
	onAction?: () => void | Promise<void>;
	actionVariant: ToastActionVariant;
}

const TOAST_EVENT_NAME = "show-toast";

function getToastStyles(type: ToastType) {
	switch (type) {
		case "success":
			return {
				border: "border-success-muted",
				iconBg: "bg-success-muted",
				icon: <CheckCircle2 size={18} className="text-success" />,
				progress: "bg-success",
			};
		case "error":
			return {
				border: "border-error-muted",
				iconBg: "bg-error-muted",
				icon: <XCircle size={18} className="text-error" />,
				progress: "bg-error",
			};
		case "warning":
			return {
				border: "border-warning-muted",
				iconBg: "bg-warning-muted",
				icon: <Info size={18} className="text-warning" />,
				progress: "bg-warning",
			};
		default:
			return {
				border: "border-border",
				iconBg: "bg-warm-200",
				icon: <Info size={18} className="text-text-secondary" />,
				progress: "bg-text-secondary",
			};
	}
}

function getActionClass(variant: ToastActionVariant) {
	switch (variant) {
		case "primary":
			return "bg-primary text-primary-foreground hover:bg-primary-hover";
		case "danger":
			return "bg-error text-white hover:opacity-90";
		default:
			return "bg-warm-200 text-text-primary hover:bg-warm-300";
	}
}

function ToastContainer() {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const listRef = useRef<HTMLDivElement>(null);
	// 移除一条之后剩下几条要平滑补位：在 setState **之前**抓一次 Flip 快照，
	// 渲染完成后从快照补间回去。纯 CSS 做不到（元素是被 flex 重新布局的）。
	const flipStateRef = useRef<Flip.FlipState | null>(null);

	useLayoutEffect(() => {
		const state = flipStateRef.current;
		if (!state) return;
		flipStateRef.current = null;
		Flip.from(state, {
			duration: mDur(0.32),
			ease: EASE.outExpo,
			absolute: true,
		});
	});

	useEffect(() => {
		const handleToast = (event: Event) => {
			const custom = event as CustomEvent<ToastItem>;
			setToasts((prev) => [...prev, custom.detail]);
		};
		window.addEventListener(TOAST_EVENT_NAME, handleToast);
		return () => window.removeEventListener(TOAST_EVENT_NAME, handleToast);
	}, []);

	// 自动消失的计时器由每条 toast 自己持有（见 ToastItemView）：
	// 组件卸载即自动清理，也让「倒计时结束」能和手动关闭走同一条退场动画。
	const handleClose = (id: string) => {
		const list = listRef.current;
		if (list && !isReducedMotion()) {
			flipStateRef.current = Flip.getState(list.children);
		}
		setToasts((prev) => prev.filter((item) => item.id !== id));
	};

	if (toasts.length === 0) return null;

	return (
		<div
			ref={listRef}
			className="pointer-events-none fixed right-4 top-4 z-[9999] flex max-w-[min(92vw,420px)] flex-col gap-2"
			aria-live="polite"
			aria-atomic="false"
		>
			{toasts.map((item) => (
				<ToastItemView
					key={item.id}
					toast={item}
					onClose={() => handleClose(item.id)}
				/>
			))}
		</div>
	);
}

function ToastItemView({
	toast: item,
	onClose,
}: {
	toast: ToastItem;
	onClose: () => void;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const iconRef = useRef<HTMLDivElement>(null);
	const progressRef = useRef<HTMLDivElement>(null);
	const exitingRef = useRef(false);

	const closeWithMotion = () => {
		if (exitingRef.current) return;
		exitingRef.current = true;
		const element = rootRef.current;
		if (!element || isReducedMotion()) {
			onClose();
			return;
		}
		gsap.to(element, {
			x: 32,
			opacity: 0,
			scale: 0.96,
			duration: mDur(0.24),
			ease: EASE.inExpo,
			onComplete: onClose,
		});
	};

	// 倒计时自动关闭。放在 toast 自己身上（而不是容器的 timer map）有两个好处：
	// 卸载即自动清理，且「时间到」和「手动关」走同一条退场动画——
	// 改造前自动消失的 toast 是直接从 DOM 里消失的，没有过渡。
	const closeRef = useRef(closeWithMotion);
	closeRef.current = closeWithMotion;
	useEffect(() => {
		if (item.duration <= 0) return;
		const timer = window.setTimeout(() => closeRef.current(), item.duration);
		return () => window.clearTimeout(timer);
	}, [item.duration]);

	// 入场 + 进度条。
	// 进度条从「每 50ms setState 一次」换成一条 scaleX 补间：
	// 一条 3 秒的 toast 原来要触发 60 次重渲染，现在 0 次，且走合成器不碰布局。
	useGsapMotion(
		({ gsap: g, dur, expressive }) => {
			const tl = g.timeline();
			if (rootRef.current) {
				tl.from(rootRef.current, {
					x: 44,
					opacity: 0,
					scale: 0.92,
					duration: dur(0.46),
					ease: EASE.spring,
					clearProps: "transform,opacity",
				});
			}
			if (expressive && iconRef.current) {
				tl.from(
					iconRef.current,
					{
						scale: 0.4,
						rotate: -25,
						duration: dur(0.5),
						ease: EASE.spring,
						clearProps: "transform",
					},
					dur(0.08),
				);
			}
			if (item.duration > 0 && progressRef.current) {
				// 进度条不缩放时长：它表示的是真实剩余时间，必须和计时器一致
				g.fromTo(
					progressRef.current,
					{ scaleX: 1 },
					{
						scaleX: 0,
						duration: item.duration / 1000,
						ease: "none",
						transformOrigin: "left center",
					},
				);
			}
		},
		{ scope: rootRef, runInReduced: true },
	);

	const styles = getToastStyles(item.type);

	return (
		<div
			ref={rootRef}
			role="status"
			className={cn(
				"pointer-events-auto relative overflow-hidden rounded-2xl border bg-cream-50 dark:bg-cream-900 p-4 shadow-bai-pop",
				styles.border,
			)}
		>
			<div className="flex items-start gap-3">
				<div
					ref={iconRef}
					className={cn(
						"mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
						styles.iconBg,
					)}
				>
					{styles.icon}
				</div>

				<div className="min-w-0 flex-1">
					<div className="break-words pt-0.5 text-sm text-text-primary">
						{item.message}
					</div>
					{item.actionLabel && item.onAction ? (
						<div className="mt-2">
							<button
								type="button"
								onClick={async () => {
									await item.onAction?.();
									closeWithMotion();
								}}
								className={cn(
									"rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
									getActionClass(item.actionVariant),
								)}
							>
								{item.actionLabel}
							</button>
						</div>
					) : null}
				</div>

				{item.closable ? (
					<button
						type="button"
						onClick={closeWithMotion}
						aria-label="关闭通知"
						className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-warm-200 hover:text-text-primary"
					>
						<X size={14} />
					</button>
				) : null}
			</div>

			{item.duration > 0 ? (
				<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-warm-200">
					<div
						ref={progressRef}
						className={cn("h-full w-full origin-left", styles.progress)}
					/>
				</div>
			) : null}
		</div>
	);
}

class ToastAPI {
	private container: HTMLDivElement | null = null;
	private root: ReturnType<typeof createRoot> | null = null;

	private ensureContainer() {
		if (this.container) return;
		this.container = document.createElement("div");
		this.container.id = "toast-container";
		document.body.appendChild(this.container);
		this.root = createRoot(this.container);
		this.root.render(<ToastContainer />);
	}

	show(message: string, options: ToastOptions = {}) {
		this.ensureContainer();
		const id =
			typeof crypto !== "undefined" && "randomUUID" in crypto
				? crypto.randomUUID()
				: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const payload: ToastItem = {
			id,
			message,
			type: options.type || "info",
			duration: options.duration ?? 3000,
			closable: options.closable ?? true,
			actionLabel: options.actionLabel,
			onAction: options.onAction,
			actionVariant: options.actionVariant ?? "default",
		};
		window.dispatchEvent(
			new CustomEvent(TOAST_EVENT_NAME, { detail: payload }),
		);
	}

	success(message: string, duration = 3000) {
		this.show(message, { type: "success", duration });
	}

	error(message: string, duration = 5000) {
		this.show(message, { type: "error", duration });
	}

	/**
	 * 错误 + 一键重试。retry 异步函数会在按下"再试一次"时调用，
	 * 抛错则再弹一个普通 error toast（避免无限重试循环）。
	 */
	errorWithRetry(
		message: string,
		retry: () => void | Promise<void>,
		options: { duration?: number; actionLabel?: string } = {},
	) {
		this.show(message, {
			type: "error",
			duration: options.duration ?? 6000,
			actionLabel: options.actionLabel ?? "再试一次",
			actionVariant: "danger",
			onAction: async () => {
				try {
					await retry();
				} catch (e) {
					this.show(`重试失败：${e instanceof Error ? e.message : String(e)}`, {
						type: "error",
						duration: 5000,
					});
				}
			},
		});
	}

	info(message: string, duration = 3000) {
		this.show(message, { type: "info", duration });
	}

	warning(message: string, duration = 4000) {
		this.show(message, { type: "warning", duration });
	}
}

export const toast = new ToastAPI();
