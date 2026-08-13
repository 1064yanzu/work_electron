/**
 * PetInputBubble — 快捷回复输入气泡
 *
 * 升级要点：
 * - 右上角"回主窗口"图标按钮
 * - 输入空 + 未聚焦时显示三个快速建议 chip（按 IP 个性化）
 * - 字符数温和提示（接近 200 字时浮现）
 * - 发送按钮 hover 微微抬起 + accent 色阴影
 */

import {
	type KeyboardEvent,
	type PointerEvent,
	forwardRef,
	useEffect,
	useState,
} from "react";
import { ArrowUp, Home } from "lucide-react";
import { PetBubbleShell, type PetBubblePlacement } from "./PetBubbleShell";
import { withAlpha } from "./utils";
import { getPool } from "../../lib/mascot/personality";
import type { MascotSelection } from "../../lib/mascotStore";

export interface PetInputBubbleProps {
	value: string;
	onChange: (next: string) => void;
	onSubmit: () => void;
	onClose: () => void;
	onOpenMain: () => void;
	accentColor?: string;
	noInteract?: boolean;
	onPointerEnter?: (e: PointerEvent<HTMLDivElement>) => void;
	onPointerLeave?: (e: PointerEvent<HTMLDivElement>) => void;
	placement?: PetBubblePlacement;
	sinking?: boolean;
	mascotId?: MascotSelection;
}

const MAX_LEN = 200;

export const PetInputBubble = forwardRef<
	HTMLTextAreaElement,
	PetInputBubbleProps
>(function PetInputBubble(
	{
		value,
		onChange,
		onSubmit,
		onClose,
		onOpenMain,
		accentColor = "#D96C46",
		noInteract,
		onPointerEnter,
		onPointerLeave,
		placement,
		sinking,
		mascotId = "efficiency",
	},
	ref,
) {
	const [focused, setFocused] = useState(false);
	const quickSuggestions = getPool(mascotId, "quickSuggestions");

	// 自动聚焦
	useEffect(() => {
		if (!ref || typeof ref === "function") return;
		ref.current?.focus();
	}, [ref]);

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (
			(e.key === "Enter" && !e.shiftKey) ||
			(e.key === "Enter" && (e.metaKey || e.ctrlKey))
		) {
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
	const len = value.length;
	const showCount = len > MAX_LEN * 0.75;
	const showSuggestions = !focused && !canSend;

	return (
		<PetBubbleShell
			accentColor={accentColor}
			noInteract={noInteract}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
			placement={placement}
			sinking={sinking}
		>
			<div className="w-[244px]">
				{/* 右上：回主窗口 */}
				<div className="absolute right-2.5 top-2.5">
					<button
						type="button"
						onClick={onOpenMain}
						aria-label="打开主窗口"
						className="flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--t-text-muted,#9d9d98)] transition-colors hover:bg-[color:var(--t-bg-muted,#f4f2ec)] hover:text-[color:var(--t-text-secondary,#6b6b68)]"
					>
						<Home className="h-3.5 w-3.5" strokeWidth={1.8} />
					</button>
				</div>

				<textarea
					ref={ref}
					value={value}
					onChange={(e) => {
						const next = e.target.value;
						if (next.length <= MAX_LEN) onChange(next);
					}}
					onKeyDown={handleKeyDown}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					placeholder="想跟我说点什么？"
					rows={2}
					className="block w-full resize-none bg-transparent pr-8 text-sm leading-relaxed text-[color:var(--t-text-primary,#1a1a19)] placeholder:text-[color:var(--t-text-muted,#9d9d98)] outline-none"
				/>

				{/* 快速建议 chip — 仅未聚焦且无内容时显示 */}
				{showSuggestions && (
					<div className="mt-1 flex flex-wrap gap-1.5">
						{quickSuggestions.map((s) => (
							<button
								key={s}
								type="button"
								onClick={() => {
									onChange(s);
									// 选完之后让外层把焦点回到 textarea（通过 setState 重渲染会保留 focus）
									if (ref && typeof ref !== "function") {
										ref.current?.focus();
									}
								}}
								className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs leading-none transition-colors"
								style={{
									borderColor: withAlpha(accentColor, 0.18),
									backgroundColor: withAlpha(accentColor, 0.04),
									color: "var(--t-text-secondary, #6b6b68)",
								}}
							>
								{s}
							</button>
						))}
					</div>
				)}

				<div className="mt-1.5 flex items-center justify-between">
					{/* 左下：键盘提示 / 字数提示 */}
					<span
						className="text-2xs tracking-wide text-[color:var(--t-text-muted,#9d9d98)] transition-opacity duration-150"
						style={{
							opacity: showCount ? 1 : focused && !canSend ? 0.7 : 0,
						}}
					>
						{showCount ? `${len} / ${MAX_LEN}` : "Enter 发送 · Esc 关闭"}
					</span>

					<button
						type="button"
						onClick={onSubmit}
						disabled={!canSend}
						aria-label="发送"
						className="group inline-flex h-7 w-7 items-center justify-center rounded-full transition-[color,background-color,border-color,opacity,box-shadow,transform] disabled:cursor-not-allowed"
						style={{
							backgroundColor: canSend
								? accentColor
								: "var(--t-bg-muted, #f4f2ec)",
							color: canSend ? "#ffffff" : "var(--t-text-muted, #9d9d98)",
							boxShadow: canSend
								? `0 6px 14px -4px ${withAlpha(accentColor, 0.45)}`
								: "none",
							transform: canSend ? "scale(1)" : "scale(0.96)",
						}}
					>
						<ArrowUp
							className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-[1px] group-active:translate-y-0"
							strokeWidth={1.5}
						/>
					</button>
				</div>
			</div>
		</PetBubbleShell>
	);
});
