import { useCallback, useEffect, useRef, useState } from "react";

import { invoke } from "../../../lib/tauriCompat";
import { listen } from "../../../lib/tauriEventCompat";
import type { ReaderBook } from "../../../lib/api/reader";
import { readerCreateDraftCards } from "../../../lib/api/reader";
import { readerStoreApi } from "../../../lib/stores/readerStore";
import { toast } from "../../ui/Toast";

type StreamChunk = {
	content: string;
	done: boolean;
	channel?: "text" | "thought";
	streamId?: string;
};

function buildPrompt(text: string, count: number): string {
	return [
		"你是复习卡（问答式 flashcard）生成器。给定一段文本，生成指定数量的问答式复习卡。",
		'输出格式为 JSON 数组，每个元素包含 "question" 和 "answer" 字段。',
		"问题应该测试对关键概念的理解，答案应该简洁准确。",
		"仅输出 JSON 数组，不要输出其他内容。",
		"",
		`请从以下文本中生成 ${count} 张复习卡：`,
		"",
		`> ${text}`,
	].join("\n");
}

/**
 * 从流式文本中增量提取已完成的 JSON 对象。
 */
function extractCompletedObjects(
	text: string,
	alreadyExtracted: number,
): Array<{ question: string; answer: string }> {
	const results: Array<{ question: string; answer: string }> = [];
	const regex =
		/\{\s*"question"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"answer"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
	let match: RegExpExecArray | null;
	let idx = 0;
	while ((match = regex.exec(text)) !== null) {
		if (idx >= alreadyExtracted) {
			try {
				const question = JSON.parse(`"${match[1]}"`);
				const answer = JSON.parse(`"${match[2]}"`);
				if (question && answer) {
					results.push({ question, answer });
				}
			} catch {}
		}
		idx++;
	}
	return results;
}

async function resolveActiveModel(): Promise<string> {
	try {
		const model = await invoke<string>("get_active_model");
		if (typeof model === "string" && model.trim().length > 0) return model;
	} catch {}
	return "claude-haiku-4-5-20251001";
}

type GenerateContext = {
	chapterId: string | null;
	locator: string | null;
	sourceText: string | null;
};

export function useCardGenerator({
	book,
	cardGenModel,
}: {
	book: ReaderBook | null;
	cardGenModel?: string;
}) {
	const [generating, setGenerating] = useState(false);
	const [extractedCount, setExtractedCount] = useState(0);
	const streamIdRef = useRef<string | null>(null);
	const bufferRef = useRef("");
	const itemsRef = useRef<Array<{ question: string; answer: string }>>([]);
	const contextRef = useRef<GenerateContext>({
		chapterId: null,
		locator: null,
		sourceText: null,
	});
	const bookRef = useRef(book);
	useEffect(() => {
		bookRef.current = book;
	}, [book]);

	const finalizeAndSave = useCallback(async () => {
		const items = itemsRef.current;
		const currentBook = bookRef.current;
		const ctx = contextRef.current;
		if (!currentBook || items.length === 0) {
			setGenerating(false);
			if (items.length === 0) {
				toast.warning("未能从 AI 输出中解析出卡片");
			}
			return;
		}
		try {
			const generationSessionId = streamIdRef.current ?? `gen-${Date.now()}`;
			const drafts = await readerCreateDraftCards({
				book_id: currentBook.id,
				chapter_id: ctx.chapterId,
				locator: ctx.locator,
				source_text: ctx.sourceText,
				generation_session_id: generationSessionId,
				items,
			});
			readerStoreApi.addDraftCards(drafts);
			toast.success(`已生成 ${drafts.length} 张草稿卡片，等待审核`);
		} catch (e) {
			console.warn("[card-gen] Failed to create draft cards:", e);
			toast.error(
				`保存草稿卡片失败：${e instanceof Error ? e.message : String(e)}`,
			);
		} finally {
			itemsRef.current = [];
			setGenerating(false);
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		let off: (() => void) | null = null;
		(async () => {
			try {
				const unlisten = await listen<StreamChunk>(
					"llm-stream-chunk",
					(event) => {
						const chunk = event?.payload;
						if (!chunk || !streamIdRef.current) return;
						if (chunk.streamId && chunk.streamId !== streamIdRef.current) {
							return;
						}

						if (chunk.done) {
							const finalContent = (chunk.content || "").trim();
							const raw = bufferRef.current;
							bufferRef.current = "";
							streamIdRef.current = null;

							if (finalContent.includes("__llm_error__")) {
								setGenerating(false);
								itemsRef.current = [];
								try {
									const err = JSON.parse(finalContent);
									toast.error(`卡片生成失败：${err.message || "未知错误"}`);
								} catch {
									toast.error("卡片生成失败");
								}
								return;
							}

							const remaining = extractCompletedObjects(
								raw,
								itemsRef.current.length,
							);
							if (remaining.length > 0) {
								itemsRef.current.push(...remaining);
								setExtractedCount(itemsRef.current.length);
							}
							finalizeAndSave();
						} else {
							bufferRef.current += chunk.content || "";
							const newItems = extractCompletedObjects(
								bufferRef.current,
								itemsRef.current.length,
							);
							if (newItems.length > 0) {
								itemsRef.current.push(...newItems);
								setExtractedCount(itemsRef.current.length);
							}
						}
					},
				);
				if (cancelled) {
					try {
						unlisten();
					} catch {}
					return;
				}
				off = unlisten as () => void;
			} catch {}
		})();
		return () => {
			cancelled = true;
			if (off) {
				try {
					off();
				} catch {}
			}
		};
	}, [finalizeAndSave]);

	const generate = useCallback(
		async (
			text: string,
			count = 5,
			options?: {
				chapterId?: string | null;
				locator?: string | null;
				sourceText?: string | null;
			},
		) => {
			if (!book || generating) return;
			setGenerating(true);
			setExtractedCount(0);
			bufferRef.current = "";
			itemsRef.current = [];
			contextRef.current = {
				chapterId: options?.chapterId ?? null,
				locator: options?.locator ?? null,
				sourceText: options?.sourceText ?? null,
			};

			const streamId = `reader-cards-${book.id}-${Date.now()}`;
			streamIdRef.current = streamId;

			try {
				const model = cardGenModel?.trim()
					? cardGenModel.trim()
					: await resolveActiveModel();
				await invoke("invoke_llm_stream", {
					payload: {
						streamId,
						model,
						prompt: buildPrompt(text, count),
						temperature: 0.3,
					},
				});
			} catch (e) {
				console.warn("[card-gen] Failed to start LLM stream:", e);
				streamIdRef.current = null;
				setGenerating(false);
				toast.error(
					`启动卡片生成失败：${e instanceof Error ? e.message : String(e)}`,
				);
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
		itemsRef.current = [];
		setGenerating(false);
	}, []);

	return { generating, extractedCount, generate, cancel };
}
