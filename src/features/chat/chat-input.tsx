import { Send } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SlashCommand } from "./slash-commands";

export function ChatInput({
	disabled,
	onSend,
	onOpenSettings,
	onNewSession,
	onClearContexts,
}: {
	disabled?: boolean;
	onSend: (text: string) => void;
	onOpenSettings: () => void;
	onNewSession: () => void;
	onClearContexts: () => void;
}) {
	const [value, setValue] = useState("");
	const [isComposing, setIsComposing] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	const clearAndFocus = useCallback(() => {
		setValue("");
		textareaRef.current?.focus();
	}, []);

	const commands = useMemo<SlashCommand[]>(
		() => [
			{
				id: "settings",
				label: "/settings",
				description: "打开设置",
				perform: () => {
					onOpenSettings();
					clearAndFocus();
				},
			},
			{
				id: "new",
				label: "/new",
				description: "新建会话",
				perform: () => {
					onNewSession();
					clearAndFocus();
				},
			},
			{
				id: "clear",
				label: "/clear",
				description: "清空上下文",
				perform: () => {
					onClearContexts();
					clearAndFocus();
				},
			},
			{
				id: "kb",
				label: "/kb",
				description: "知识库检索：/kb 关键词",
				perform: () => {
					setValue("/kb ");
					textareaRef.current?.focus();
				},
			},
		],
		[clearAndFocus, onClearContexts, onNewSession, onOpenSettings],
	);

	const showCommands = value.trim().startsWith("/");
	const filtered = useMemo(() => {
		if (!showCommands) return [];
		const q = value.trim().toLowerCase();
		return commands.filter((c) => c.label.toLowerCase().includes(q));
	}, [commands, showCommands, value]);

	const submit = () => {
		const text = value.trim();
		if (!text) return;
		if (text === "/settings") {
			onOpenSettings();
			setValue("");
			return;
		}
		if (text === "/new") {
			onNewSession();
			setValue("");
			return;
		}
		if (text === "/clear") {
			onClearContexts();
			setValue("");
			return;
		}
		onSend(text);
		setValue("");
	};

	return (
		<div className="relative">
			{showCommands && filtered.length > 0 && (
				<div className="absolute bottom-[100%] mb-2 w-full overflow-hidden rounded-xl border border-border/60 bg-popover shadow-sm">
					{filtered.map((c) => (
						<button
							type="button"
							key={c.id}
							onClick={() => {
								c.perform();
							}}
							className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-secondary/60"
						>
							<div className="text-sm">{c.label}</div>
							<div className="text-[11px] text-muted-foreground">
								{c.description}
							</div>
						</button>
					))}
				</div>
			)}

			<Textarea
				ref={textareaRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onCompositionStart={() => setIsComposing(true)}
				onCompositionEnd={() => setIsComposing(false)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.shiftKey && !isComposing) {
						e.preventDefault();
						if (!disabled) submit();
					}
				}}
				placeholder="输入消息，Enter 发送，Shift+Enter 换行"
				className={cn(
					"min-h-[84px] resize-none pr-12 text-sm",
					disabled && "opacity-70",
				)}
				disabled={disabled}
			/>
			<Button
				size="icon"
				className="absolute bottom-2 right-2 h-8 w-8"
				onClick={submit}
				disabled={disabled || !value.trim()}
			>
				<Send className="h-4 w-4" />
			</Button>
		</div>
	);
}
