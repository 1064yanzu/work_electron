/**
 * PetBubble — 桌面宠物对话气泡组件
 *
 * 风格遵循项目 B.AI 暖色系统：奶油色卡面 + 1px 暖描边 + 轻语阴影 +
 * 指向角色的小三角箭头。色彩用项目变量 var(--t-bg-surface) / var(--t-border)
 * 等，避免 white/blue 等中性色破坏整体语境。
 */

import {
	type KeyboardEvent,
	type ReactNode,
	forwardRef,
	useEffect,
	useState,
} from "react";
import { CheckCircle2, AlertTriangle, Send, Sparkles } from "lucide-react";

// ── 通用容器 ──

interface PetBubbleShellProps {
	children: ReactNode;
	tone?: "default" | "success" | "warn" | "danger";
	/** 让指针穿透（拖动中） */
	noInteract?: boolean;
}

const TONE_RING: Record<NonNullable<PetBubbleShellProps["tone"]>, string> = {
	default: "rgba(217, 108, 70, 0.0)",
	success: "rgba(101, 156, 119, 0.18)",
	warn: "rgba(217, 158, 80, 0.22)",
	danger: "rgba(196, 95, 79, 0.24)",
};

const TONE_DOT: Record<NonNullable<PetBubbleShellProps["tone"]>, string> = {
	default: "#D96C46",
	success: "#5C9270",
	warn: "#D9A04A",
	danger: "#C45F4F",
};

/**
 * 气泡外壳：暖色卡面 + 极轻阴影 + 指向角色的小三角
 */
function PetBubbleShell({
	children,
	tone = "default",
	noInteract,
}: PetBubbleShellProps) {
	return (
		<div
			className="relative animate-pet-bubble-in"
			style={{
				pointerEvents: noInteract ? "none" : "auto",
			}}
		>
			<div
				className="relative rounded-2xl px-3.5 py-2.5"
				style={{
					backgroundColor: "var(--t-bg-surface, #ffffff)",
					boxShadow: `
						0 0 0 1px var(--t-border, #e8e5dd),
						0 0 0 4px ${TONE_RING[tone]},
						0 12px 32px -12px rgba(26, 26, 25, 0.18),
						0 4px 12px -4px rgba(26, 26, 25, 0.08)
					`,
				}}
			>
				{children}
			</div>
			{/* 指向角色的小三角（双层：背景+边框） */}
			<div
				aria-hidden="true"
				className="absolute left-1/2 -bottom-[6px] h-3 w-3 -translate-x-1/2 rotate-45"
				style={{
					backgroundColor: "var(--t-bg-surface, #ffffff)",
					boxShadow: "1px 1px 0 0 var(--t-border, #e8e5dd)",
				}}
			/>
			{/* 状态点 — 仅 success/warn/danger 显示 */}
			{tone !== "default" && (
				<span
					aria-hidden="true"
					className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--t-bg-surface,#ffffff)]"
					style={{ backgroundColor: TONE_DOT[tone] }}
				/>
			)}
		</div>
	);
}

// ── 任务气泡（思考中） ──

export interface PetTaskBubbleProps {
	title: string;
	noInteract?: boolean;
}

export function PetTaskBubble({ title, noInteract }: PetTaskBubbleProps) {
	return (
		<PetBubbleShell noInteract={noInteract}>
			<div className="flex items-start gap-2.5 max-w-[210px]">
				{/* 思考态：三点呼吸光圈 */}
				<div className="flex shrink-0 items-center justify-center pt-[3px]">
					<div className="relative h-3.5 w-3.5">
						<span
							className="absolute inset-0 rounded-full"
							style={{
								background:
									"radial-gradient(circle, rgba(217,108,70,0.32), rgba(217,108,70,0.08) 65%, transparent 70%)",
							}}
						/>
						<span
							className="absolute inset-[3px] rounded-full animate-pet-pulse"
							style={{ backgroundColor: "#D96C46" }}
						/>
					</div>
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-text-muted,#87867f)]">
						<Sparkles className="h-3 w-3" strokeWidth={2} />
						正在思考
					</div>
					<div className="mt-0.5 text-[12.5px] leading-snug text-[color:var(--t-text-primary,#1a1a19)] line-clamp-2">
						{title}
					</div>
				</div>
			</div>
		</PetBubbleShell>
	);
}

// ── 通知气泡（done/error/approval） ──

export interface PetNotificationBubbleProps {
	type: "done" | "error" | "approval";
	message: string;
	onAction?: () => void;
	noInteract?: boolean;
}

export function PetNotificationBubble({
	type,
	message,
	onAction,
	noInteract,
}: PetNotificationBubbleProps) {
	const tone = type === "done" ? "success" : type === "error" ? "danger" : "warn";
	const Icon = type === "done" ? CheckCircle2 : AlertTriangle;
	const iconColor =
		type === "done" ? "#5C9270" : type === "error" ? "#C45F4F" : "#D9A04A";
	const label =
		type === "done"
			? "已完成"
			: type === "error"
				? "出错了"
				: "需要你的同意";

	return (
		<PetBubbleShell tone={tone} noInteract={noInteract}>
			<div className="flex items-start gap-2.5 max-w-[220px]">
				<Icon
					className="mt-[1px] h-4 w-4 shrink-0"
					strokeWidth={2}
					style={{ color: iconColor }}
				/>
				<div className="min-w-0 flex-1">
					<div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-text-muted,#87867f)]">
						{label}
					</div>
					<div className="mt-0.5 text-[12.5px] leading-snug text-[color:var(--t-text-primary,#1a1a19)]">
						{message}
					</div>
					{(type === "approval" || type === "error") && onAction && (
						<button
							type="button"
							onClick={onAction}
							className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[color:var(--t-bg-muted,#f4f2ec)] px-2.5 py-[3px] text-[11px] font-medium text-[color:var(--t-text-primary,#1a1a19)] transition-colors hover:bg-[color:var(--t-border,#e8e5dd)]"
						>
							去主窗口处理
							<span aria-hidden="true">→</span>
						</button>
					)}
				</div>
			</div>
		</PetBubbleShell>
	);
}

// ── 输入气泡（快捷回复） ──

export interface PetInputBubbleProps {
	value: string;
	onChange: (next: string) => void;
	onSubmit: () => void;
	onClose: () => void;
	onOpenMain: () => void;
	noInteract?: boolean;
}

export const PetInputBubble = forwardRef<HTMLTextAreaElement, PetInputBubbleProps>(
	function PetInputBubble(
		{ value, onChange, onSubmit, onClose, onOpenMain, noInteract },
		ref,
	) {
		const [focused, setFocused] = useState(false);

		// 自动聚焦
		useEffect(() => {
			if (!ref || typeof ref === "function") return;
			ref.current?.focus();
		}, [ref]);

		const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				onSubmit();
			}
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};

		const trimmed = value.trim();
		const canSend = trimmed.length > 0;

		return (
			<PetBubbleShell noInteract={noInteract}>
				<div className="w-[230px]">
					<div className="mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--t-text-muted,#87867f)]">
						<Sparkles className="h-3 w-3" strokeWidth={2} />
						快捷回复
					</div>
					<div
						className="rounded-xl px-2.5 py-1.5 transition-colors"
						style={{
							backgroundColor: focused
								? "var(--t-bg, #faf9f5)"
								: "var(--t-bg-muted, #f4f2ec)",
							boxShadow: focused
								? "0 0 0 2px rgba(217, 108, 70, 0.18)"
								: "inset 0 0 0 1px var(--t-border-subtle, rgba(0,0,0,0.04))",
						}}
					>
						<textarea
							ref={ref}
							value={value}
							onChange={(e) => onChange(e.target.value)}
							onKeyDown={handleKeyDown}
							onFocus={() => setFocused(true)}
							onBlur={() => setFocused(false)}
							placeholder="说点什么…  Enter 发送  Esc 关闭"
							rows={2}
							className="w-full resize-none bg-transparent text-[12.5px] leading-relaxed text-[color:var(--t-text-primary,#1a1a19)] placeholder:text-[color:var(--t-text-light,#9d9d98)] outline-none"
						/>
					</div>
					<div className="mt-2 flex items-center justify-between">
						<button
							type="button"
							onClick={onOpenMain}
							className="text-[10.5px] text-[color:var(--t-text-light,#9d9d98)] transition-colors hover:text-[color:var(--t-text-secondary,#6b6b68)]"
						>
							打开主窗口
						</button>
						<button
							type="button"
							onClick={onSubmit}
							disabled={!canSend}
							className="inline-flex items-center gap-1 rounded-full px-3 py-[5px] text-[11.5px] font-semibold transition-all disabled:cursor-not-allowed"
							style={{
								backgroundColor: canSend
									? "#D96C46"
									: "var(--t-bg-muted, #f4f2ec)",
								color: canSend ? "#ffffff" : "var(--t-text-light, #9d9d98)",
								boxShadow: canSend
									? "0 4px 12px -4px rgba(217, 108, 70, 0.45)"
									: "none",
							}}
						>
							<Send className="h-3 w-3" strokeWidth={2.4} />
							发送
						</button>
					</div>
				</div>
			</PetBubbleShell>
		);
	},
);
