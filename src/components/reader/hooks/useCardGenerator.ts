import { useCallback, useEffect, useRef, useState } from "react";

import { invoke } from "../../../lib/tauriCompat";
import { listen } from "../../../lib/tauriEventCompat";
import type { ReaderBook, ReaderKnowledgeCard } from "../../../lib/api/reader";
import { readerCreateCard } from "../../../lib/api/reader";
import { readerStoreApi } from "../../../lib/stores/readerStore";

type StreamChunk = {
	content: string;
	done: boolean;
	channel?: "text" | "thought";
};

function buildSystemPrompt(): string {
	return [
		"你是知识卡片生成器。给定一段文本，生成指定数量的问答式知识卡片。",
		'输出格式为 JSON 数组，每个元素包含 "question" 和 "answer" 字段。',
		"问题应该测试对关键概念的理解，答案应该简洁准确。",
		"仅输出 JSON 数组，不要输出其他内容。",
	].join("\n");
}

function buildUserPrompt(text: string, count: number): string {
	return `请从以下文本中生成 ${count} 张知识卡片：\n\n> ${text}`;
}

function tryParseCards(
	raw: string,
): Array<{ question: string; answer: string }> | null {
	// 1. 尝试直接 JSON.parse
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.length > 0) return parsed;
	} catch {}
	// 2. 提取 ```json ... ``` 代码块
	const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
	if (fenceMatch) {
		try {
			const parsed = JSON.parse(fenceMatch[1].trim());
			if (Array.isArray(parsed) && parsed.length > 0) return parsed;
		} catch {}
	}
	// 3. 提取第一个 JSON 数组
	const arrayMatch = raw.match(/\[[\s\S]*\]/);
	if (arrayMatch) {
		try {
			const parsed = JSON.parse(arrayMatch[0]);
			if (Array.isArray(parsed) && parsed.length > 0) return parsed;
		} catch {}
	}
	return null;
}

async function resolveActiveModel(): Promise<string> {
	try {
		const model = await invoke<string>("get_active_model");
		if (typeof model === "string" && model.trim().length > 0) return model;
	} catch {}
	return "claude-haiku-4-5-20251001";
}

export function useCardGenerator({
	book,
	cardGenModel,
}: {
	book: ReaderBook | null;
	cardGenModel?: string;
}) {
	const [generating, setGenerating] = useState(false);
	const streamIdRef = useRef<string | null>(null);
	const bufferRef = useRef("");

	useEffect(() => {
		const unsubs: Array<() => void> = [];
		(async () => {
			try {
				const off = await listen<{ items: StreamChunk[] }>(
					"llm-stream-chunk",
					(event) => {
						if (!event?.payload?.items) return;
						for (const chunk of event.payload.items) {
							if (!streamIdRef.current) return;
							if (chunk.done) {
								// 流结束，解析卡片
								const raw = bufferRef.current;
								bufferRef.current = "";
								streamIdRef.current = null;
								setGenerating(false);

								// 检查是否是错误
								if (raw.includes("__llm_error__")) {
									try {
										const err = JSON.parse(raw);
										console.warn("[card-gen] LLM error:", err.message);
									} catch {}
									return;
								}

								parseAndStoreCards(raw);
							} else {
								bufferRef.current += chunk.content || "";
							}
						}
					},
				);
				unsubs.push(off as () => void);
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

	const parseAndStoreCards = useCallback(
		async (raw: string) => {
			if (!book) return;
			const parsed = tryParseCards(raw);
			if (!parsed || parsed.length === 0) {
				console.warn("[card-gen] Failed to parse cards from LLM output");
				return;
			}

			const created: ReaderKnowledgeCard[] = [];
			for (const item of parsed) {
				if (!item.question || !item.answer) continue;
				try {
					const card = await readerCreateCard({
						book_id: book.id,
						chapter_id: null,
						question: item.question,
						answer: item.answer,
					});
					created.push(card);
				} catch (e) {
					console.warn("[card-gen] Failed to save card:", e);
				}
			}

			if (created.length > 0) {
				readerStoreApi.addCards(created);
			}
		},
		[book],
	);

	const generate = useCallback(
		async (text: string, count = 5) => {
			if (!book || generating) return;
			setGenerating(true);
			bufferRef.current = "";

			const streamId = `reader-cards-${book.id}-${Date.now()}`;
			streamIdRef.current = streamId;

			try {
				const model = cardGenModel?.trim()
					? cardGenModel.trim()
					: await resolveActiveModel();
				await invoke("invoke_llm_stream", {
					payload: {
						stream_id: streamId,
						streamId,
						model,
						system: buildSystemPrompt(),
						prompt: buildUserPrompt(text, count),
						messages: [{ role: "user", content: buildUserPrompt(text, count) }],
						temperature: 0.3,
					},
				});
			} catch (e) {
				console.warn("[card-gen] Failed to start LLM stream:", e);
				streamIdRef.current = null;
				setGenerating(false);
			}
		},
		[book, generating, cardGenModel],
	);

	const cancel = useCallback(async () => {
		if (!streamIdRef.current) return;
		try {
			await invoke("invoke_llm_stream_cancel", {
				payload: { streamId: streamIdRef.current },
			});
		} catch {}
		streamIdRef.current = null;
		bufferRef.current = "";
		setGenerating(false);
	}, []);

	return { generating, generate, cancel };
}
