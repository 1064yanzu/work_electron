/**
 * SSE（Server-Sent Events）解析器 —— LLM 调用链路的共享实现。
 *
 * ## 为什么要抽出来
 *
 * 本仓库原先有两份独立的 SSE 解析：`llm/invoke.ts`（渲染端 LLM 调用）和
 * `http/anthropicProxy/providerCalls.ts`（Agent SDK 走的代理）。两份代码解决
 * 的是同一个问题，但细节各自演进：一个按行 flush、一个按事件块 flush；一个
 * 同步回调、一个支持异步回调；对 `\r\n`、多行 `data:`、尾包的处理也不一致。
 * 结果是同一个供应商的兼容性 bug 要修两遍，而且经常只修了一边。
 *
 * ## 协议要点（决定了下面的实现形态）
 *
 * - 事件之间用**空行**分隔（`\n\n`）；一个事件块内可以有多行 `data:`。
 * - 规范规定多行 `data:` 应当用 `\n` 连接成单条数据。但历史上 `invoke.ts`
 *   是逐行下发的 —— 对只有一行 data 的主流供应商两者等价，为了不改行为，
 *   这里用 `joinMultilineData` 开关把两种模式都保留。
 * - 网络分片与事件边界无关：一个 TCP chunk 可能切在 `dat` 和 `a: {...}` 之间，
 *   所以必须自己缓冲，不能对 chunk 直接 split。
 */

export interface SseParserOptions {
	/**
	 * 是否把同一事件块内的多行 `data:` 合并成一条（用 `\n` 连接）后再下发。
	 *
	 * - `true`（默认）：符合 SSE 规范，合并后 trim，空串不下发。
	 * - `false`：每行 `data:` 单独下发（`invoke.ts` 的历史行为）。
	 */
	joinMultilineData?: boolean;
}

/**
 * 从一个事件块里抽出所有 `data:` 行的值。
 *
 * 行尾的 `\r` / 空格 / 制表符会被剥掉 —— 有些中转服务会在行尾多塞空白，
 * 不处理的话 `[DONE]` 会变成 `[DONE] ` 而匹配不上。
 */
export function extractSseDataLines(block: string): string[] {
	const values: string[] = [];
	let cursor = 0;
	while (cursor < block.length) {
		const nl = block.indexOf("\n", cursor);
		const end = nl === -1 ? block.length : nl;
		let lineEnd = end;
		while (
			lineEnd > cursor &&
			(block.charCodeAt(lineEnd - 1) === 13 /* \r */ ||
				block.charCodeAt(lineEnd - 1) === 32 /* space */ ||
				block.charCodeAt(lineEnd - 1) === 9) /* \t */
		) {
			lineEnd--;
		}
		// 先比首字符再 startsWith：绝大多数行不是 data:，省掉一次子串比较
		if (
			lineEnd > cursor &&
			block.charCodeAt(cursor) === 100 /* d */ &&
			block.startsWith("data:", cursor)
		) {
			let dataStart = cursor + "data:".length;
			while (
				dataStart < lineEnd &&
				(block.charCodeAt(dataStart) === 32 ||
					block.charCodeAt(dataStart) === 9)
			) {
				dataStart++;
			}
			if (dataStart < lineEnd) values.push(block.slice(dataStart, lineEnd));
		}
		cursor = nl === -1 ? block.length : nl + 1;
	}
	return values;
}

/**
 * 创建一个增量 SSE 解析器：喂任意切分的文本片段，回调收到完整的 data 值。
 *
 * 返回的函数是同步的，适合"读流"和"解析"分离的调用方
 * （`readTextStream(body, parser)`）。需要异步回调请用 `readSseStream`。
 */
export function createSseParser(
	onData: (data: string) => void,
	options?: SseParserOptions,
): (chunk: string) => void {
	const join = options?.joinMultilineData !== false;
	let buffer = "";

	return (chunk: string) => {
		buffer += chunk;
		while (true) {
			const sep = buffer.indexOf("\n\n");
			if (sep === -1) break;
			const block = buffer.slice(0, sep);
			buffer = buffer.slice(sep + 2);

			const values = extractSseDataLines(block);
			if (values.length === 0) continue;
			if (join) {
				const data = values.join("\n").trim();
				if (data) onData(data);
			} else {
				for (const value of values) onData(value);
			}
		}
	};
}

/**
 * 把 `ReadableStream` 逐块读出并按行下发（不做 SSE 解析）。
 *
 * 按行而不是按块 flush，是为了让下游拿到 token 的延迟贴近网络到达时间：
 * 有些供应商一个 TCP 包里塞十几个事件，按包处理会让打字机效果一顿一顿的。
 */
export async function readTextStream(
	body: ReadableStream<Uint8Array>,
	onText: (text: string) => void,
): Promise<void> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let idx: number;
		while ((idx = buffer.indexOf("\n")) !== -1) {
			const line = buffer.slice(0, idx + 1);
			buffer = buffer.slice(idx + 1);
			onText(line);
		}
	}
	if (buffer) onText(buffer);
}

/**
 * 读取并解析一条 SSE 流，支持 **异步** 的 data 回调（回调会被 await）。
 *
 * 尾包处理很重要：不少供应商在最后一个事件后不发空行就断连，
 * 不处理残留 buffer 会丢掉 `finish_reason` 甚至最后一段正文。
 */
export async function readSseStream(
	body: ReadableStream<Uint8Array>,
	onData: (data: string) => void | Promise<void>,
	options?: SseParserOptions,
): Promise<void> {
	const join = options?.joinMultilineData !== false;
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	const flushBlock = async (block: string) => {
		const values = extractSseDataLines(block);
		if (values.length === 0) return;
		if (join) {
			const data = values.join("\n").trim();
			if (data) await onData(data);
			return;
		}
		for (const value of values) await onData(value);
	};

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		while (true) {
			const idx = buffer.indexOf("\n\n");
			if (idx === -1) break;
			const block = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 2);
			await flushBlock(block);
		}
	}

	const tail = buffer.trim();
	if (tail) await flushBlock(tail);
}
