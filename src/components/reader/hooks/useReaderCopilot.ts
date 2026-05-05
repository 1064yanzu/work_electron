import { useCallback, useEffect, useRef, useState } from "react";

import { invoke } from "../../../lib/tauriCompat";
import { listen } from "../../../lib/tauriEventCompat";
import type { ReaderBook, ReaderChapter } from "../../../lib/api/reader";

export type CopilotMessage = {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	citations?: Array<{ chunk_id: string; snippet: string }>;
	streaming?: boolean;
};

export type CopilotIntent =
	| { kind: "translate"; text: string; targetLang?: string }
	| { kind: "explain"; text: string }
	| { kind: "summarize"; text: string }
	| { kind: "ask"; text: string; question?: string }
	| { kind: "freeform"; question: string };

const READER_MODEL_KEY = "reader.copilot.model";

async function resolveActiveModel(): Promise<string> {
	try {
		const model = await invoke<string>("get_active_model");
		if (typeof model === "string" && model.trim().length > 0) return model;
	} catch {}
	return "claude-haiku-4-5-20251001";
}

function buildSystemPrompt(
	book: ReaderBook,
	scope: "chapter" | "book",
): string {
	return [
		"你是 IPO Workbench 的阅读副驾驶。",
		`当前正在阅读：《${book.title}》${book.authors.length ? `（作者：${book.authors.join("、")}）` : ""}。`,
		`格式：${book.format.toUpperCase()}。`,
		scope === "chapter"
			? "请围绕用户当前章节进行解答，避免引入未提供的内容。"
			: "你可以参考整本书的相关上下文，但仅限用户提供的资料范围。",
		"输出使用中文 Markdown，关键引用用 `> `，必要时分点。",
		"当用户让你翻译时，默认目标语言中文（zh-CN）；解释/总结时给出 3-5 句重点。",
	].join("\n");
}

function buildUserMessage(
	intent: CopilotIntent,
	contextSnippets?: string[],
): string {
	const ctx =
		contextSnippets && contextSnippets.length > 0
			? `\n\n## 章节上下文\n${contextSnippets.map((s, i) => `（${i + 1}）${s}`).join("\n")}`
			: "";

	switch (intent.kind) {
		case "translate":
			return `请把下面这段话准确翻译成${intent.targetLang || "中文"}：\n\n> ${intent.text}${ctx}`;
		case "explain":
			return `请用简洁直观的语言解释下面这段话的含义、术语与背景：\n\n> ${intent.text}${ctx}`;
		case "summarize":
			return `请把下面这段话浓缩成 3-5 个要点：\n\n> ${intent.text}${ctx}`;
		case "ask": {
			const head = intent.question ? `问题：${intent.question}\n\n` : "";
			return `${head}围绕下面这段话回答：\n\n> ${intent.text}${ctx}`;
		}
		case "freeform":
			return `${intent.question || ""}${ctx}`;
		default:
			return "";
	}
}

export function useReaderCopilot({
	book,
	chapter,
	contextScope,
}: {
	book: ReaderBook | null;
	chapter: ReaderChapter | null;
	contextScope: "chapter" | "book";
}) {
	const [messages, setMessages] = useState<CopilotMessage[]>([]);
	const [streaming, setStreaming] = useState(false);
	const streamIdRef = useRef<string | null>(null);
	const assistantIdRef = useRef<string | null>(null);

	useEffect(() => {
		// 切书时清空对话
		setMessages([]);
		setStreaming(false);
	}, [book?.id]);

	// 监听全局 LLM 流事件（与 invoke_llm_stream 协议保持一致）
	useEffect(() => {
		const unsubs: Array<() => void> = [];
		(async () => {
			try {
				const off1 = await listen<{
					stream_id: string;
					delta: string;
				}>("llm-stream-delta", (event) => {
					if (!event?.payload) return;
					const { stream_id, delta } = event.payload;
					if (streamIdRef.current && stream_id !== streamIdRef.current) return;
					setMessages((prev) =>
						prev.map((m) =>
							m.id === assistantIdRef.current
								? { ...m, content: (m.content || "") + (delta || "") }
								: m,
						),
					);
				});
				unsubs.push(off1 as () => void);

				const off2 = await listen<{
					stream_id: string;
				}>("llm-stream-end", (event) => {
					if (!event?.payload) return;
					if (
						streamIdRef.current &&
						event.payload.stream_id !== streamIdRef.current
					)
						return;
					setMessages((prev) =>
						prev.map((m) =>
							m.id === assistantIdRef.current ? { ...m, streaming: false } : m,
						),
					);
					streamIdRef.current = null;
					assistantIdRef.current = null;
					setStreaming(false);
				});
				unsubs.push(off2 as () => void);

				const off3 = await listen<{
					stream_id: string;
					error: string;
				}>("llm-stream-error", (event) => {
					if (!event?.payload) return;
					if (
						streamIdRef.current &&
						event.payload.stream_id !== streamIdRef.current
					)
						return;
					setMessages((prev) => [
						...prev.map((m) =>
							m.id === assistantIdRef.current ? { ...m, streaming: false } : m,
						),
						{
							id: `err-${Date.now()}`,
							role: "system",
							content: `⚠️ 调用失败：${event.payload.error}`,
						},
					]);
					streamIdRef.current = null;
					assistantIdRef.current = null;
					setStreaming(false);
				});
				unsubs.push(off3 as () => void);
			} catch {}
		})();
		return () => {
			for (const fn of unsubs) {
				try {
					fn();
				} catch {}
			}
		};
	}, []);

	const send = useCallback(
		async (intent: CopilotIntent) => {
			if (!book) return;
			if (streaming) return;

			const userId = `u-${Date.now()}`;
			const assistantId = `a-${Date.now()}`;

			let contextSnippets: string[] = [];
			if (contextScope === "chapter" && chapter?.text) {
				contextSnippets = [chapter.text.slice(0, 2_400)];
			} else if (contextScope === "book" && book.source_id) {
				try {
					const hits = await invoke<
						Array<{ chunk_id: string; content: string; snippet: string }>
					>("kb_search_chunks", {
						payload: {
							query:
								intent.kind === "freeform"
									? intent.question
									: "text" in intent
										? intent.text
										: "",
							source_id: book.source_id,
							limit: 4,
						},
					});
					contextSnippets = hits.map((h) => h.snippet || h.content).slice(0, 4);
				} catch {}
			}

			const userMsg: CopilotMessage = {
				id: userId,
				role: "user",
				content: humanizeIntentForUserMsg(intent),
			};
			const assistantMsg: CopilotMessage = {
				id: assistantId,
				role: "assistant",
				content: "",
				streaming: true,
			};
			setMessages((prev) => [...prev, userMsg, assistantMsg]);
			assistantIdRef.current = assistantId;
			setStreaming(true);

			try {
				const model = await resolveActiveModel();
				localStorage.setItem(READER_MODEL_KEY, model);
				const streamId = `reader-${book.id}-${assistantId}`;
				streamIdRef.current = streamId;

				await invoke("invoke_llm_stream", {
					payload: {
						stream_id: streamId,
						model,
						system: buildSystemPrompt(book, contextScope),
						messages: [
							{
								role: "user",
								content: buildUserMessage(intent, contextSnippets),
							},
						],
						temperature: 0.4,
					},
				});
			} catch (e) {
				setStreaming(false);
				streamIdRef.current = null;
				assistantIdRef.current = null;
				setMessages((prev) =>
					prev.map((m) =>
						m.id === assistantId
							? {
									...m,
									streaming: false,
									content: `⚠️ 启动 AI 调用失败：${e instanceof Error ? e.message : String(e)}`,
								}
							: m,
					),
				);
			}
		},
		[book, chapter, contextScope, streaming],
	);

	const stop = useCallback(async () => {
		if (!streamIdRef.current) return;
		try {
			await invoke("invoke_llm_stream_cancel", {
				payload: { streamId: streamIdRef.current },
			});
		} catch {}
		setStreaming(false);
	}, []);

	const clear = useCallback(() => {
		setMessages([]);
	}, []);

	return { messages, send, stop, clear, streaming };
}

function humanizeIntentForUserMsg(intent: CopilotIntent): string {
	switch (intent.kind) {
		case "translate":
			return `🌐 翻译：${intent.text}`;
		case "explain":
			return `💡 解释：${intent.text}`;
		case "summarize":
			return `📝 总结：${intent.text}`;
		case "ask":
			return `❓ ${intent.question ? intent.question + "  " : ""}（节选：${intent.text}）`;
		case "freeform":
			return intent.question;
	}
}
