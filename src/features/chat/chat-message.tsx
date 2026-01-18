import { cn } from "@/lib/utils";
import type { ChatMessage } from "./types";

export function ChatMessageView({ message }: { message: ChatMessage }) {
	const isUser = message.role === "user";
	return (
		<div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
			<div
				className={cn(
					"max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6",
					isUser
						? "bg-primary text-primary-foreground"
						: "bg-background/70 text-foreground",
				)}
			>
				<div className="whitespace-pre-wrap">{message.content}</div>
			</div>
		</div>
	);
}
