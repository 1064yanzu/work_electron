/**
 * 转录覆盖层 —— 在窄栏里整面覆盖展示一段会话的完整消息流。
 *
 * 长消息默认折叠（超过 MESSAGE_FOLD_LENGTH 字符），点击展开。
 * 顶部可直接发起迁移，省得退回列表再点一次。
 */
import { useState } from "react";
import { ArrowLeft, ArrowRightLeft, Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import { MigrateMenu } from "./SessionRow";
import type { MigrateTarget, TranscriptState } from "./types";
import { MESSAGE_FOLD_LENGTH, sessionTitle, shortCwd } from "./utils";

export function TranscriptOverlay({
	state,
	harnessLabel,
	targets,
	onClose,
	onMigrate,
}: {
	state: TranscriptState;
	harnessLabel: string;
	targets: MigrateTarget[];
	onClose: () => void;
	onMigrate: (target: MigrateTarget) => void;
}) {
	const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
		() => new Set(),
	);
	const [pickerOpen, setPickerOpen] = useState(false);

	const toggleMessage = (id: string) => {
		setExpandedMessages((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<div className="absolute inset-0 z-30 flex flex-col bg-background/97 backdrop-blur-md animate-fade-in">
			<div className="px-4 pt-5 pb-3 shrink-0 border-b border-border">
				<div className="flex items-start gap-2">
					<button
						type="button"
						onClick={onClose}
						className="mt-0.5 p-1.5 -ml-1.5 rounded-lg text-text-light hover:text-text-secondary hover:bg-warm-200/70 dark:hover:bg-cream-800/40 transition duration-200"
						title="返回列表"
					>
						<ArrowLeft className="w-3.5 h-3.5" />
					</button>
					<div className="min-w-0 flex-1">
						<div className="text-[9.5px] font-semibold tracking-[0.22em] text-text-light uppercase">
							Transcript
						</div>
						<h3 className="font-serif text-[15px] leading-tight text-text-primary mt-1 truncate">
							{state.session ? sessionTitle(state.session) : "加载中…"}
						</h3>
						{state.session && (
							<p className="text-[10.5px] text-text-light mt-1 truncate">
								{harnessLabel}
								{state.session.cwd && (
									<>
										<span className="mx-1 text-text-light/50">·</span>
										<span className="font-mono">
											{shortCwd(state.session.cwd)}
										</span>
									</>
								)}
								<span className="mx-1 text-text-light/50">·</span>
								<span className="tabular-nums">
									{state.session.message_count} 条
								</span>
							</p>
						)}
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 space-y-2">
				{state.loading && (
					<div className="flex items-center justify-center gap-2 py-16 text-[11.5px] text-text-light">
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						正在加载转录…
					</div>
				)}
				{state.error && (
					<div className="px-3 py-2 rounded-lg bg-error/8 dark:bg-error/15 border border-error/20 text-[11.5px] text-error">
						{state.error}
					</div>
				)}
				{!state.loading && !state.error && state.messages.length === 0 && (
					<p className="text-center py-16 text-[11.5px] text-text-light">
						这段会话没有可展示的消息
					</p>
				)}
				{state.messages.map((message) => {
					const isUser = message.role === "user";
					const isLong = message.content.length > MESSAGE_FOLD_LENGTH;
					const isOpen = expandedMessages.has(message.id);
					const body =
						isLong && !isOpen
							? `${message.content.slice(0, MESSAGE_FOLD_LENGTH)}…`
							: message.content;
					return (
						<div
							key={message.id}
							className={cn(
								"rounded-xl px-3 py-2 border transition duration-200",
								isUser
									? "bg-terracotta/[0.06] border-terracotta/20"
									: "bg-surface dark:bg-cream-900/40 border-border",
							)}
						>
							<div className="flex items-center justify-between gap-2 mb-1">
								<span
									className={cn(
										"text-[9px] font-semibold tracking-[0.18em] uppercase",
										isUser ? "text-terracotta" : "text-text-light",
									)}
								>
									{isUser ? "我" : message.role === "system" ? "系统" : "助手"}
								</span>
								<span className="text-[9.5px] text-text-light/80 tabular-nums shrink-0">
									#{message.seq + 1}
								</span>
							</div>
							<p className="text-[11.5px] text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
								{body || "（空消息）"}
							</p>
							{isLong && (
								<button
									type="button"
									onClick={() => toggleMessage(message.id)}
									className="mt-1 text-[10.5px] text-terracotta hover:underline underline-offset-2"
								>
									{isOpen ? "收起" : "展开全文"}
								</button>
							)}
						</div>
					);
				})}
			</div>

			{state.session && (
				<div className="shrink-0 border-t border-border px-4 py-3 space-y-2">
					{pickerOpen && (
						<MigrateMenu
							targets={targets}
							onPick={(target) => {
								setPickerOpen(false);
								onMigrate(target);
							}}
						/>
					)}
					<button
						type="button"
						onClick={() => setPickerOpen((prev) => !prev)}
						className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[11.5px] font-medium hover:bg-primary-hover transition duration-200"
					>
						<ArrowRightLeft className="w-3 h-3" />
						{pickerOpen ? "收起目标" : "迁移这段会话"}
					</button>
				</div>
			)}
		</div>
	);
}

// ============================================================
