/**
 * adapter 公共解析工具。
 *
 * 核心是 parseJsonLines 的**增量安全读取**：JSONL 是追加写的活文件，
 * 从 byte_offset 读到 EOF 时，最后一行很可能是写了一半的残行。
 * 若把残行的字节数也计入新 offset，下次续读就会从行中间开始，
 * 之后所有行都会错位。因此这里只把**最后一个换行符**之前的内容算作已消费，
 * 残行���到下次（写完后）再读。
 */
import { open, stat } from "node:fs/promises";
import type { CanonicalBlock } from "../types";

/** 单次增量扫描的结果。 */
export interface JsonLinesScan {
	/** 解析成功的对象（已按行序） */
	objects: Record<string, unknown>[];
	/** 本次消费到的字节位置（下次从这里续读） */
	endOffset: number;
	/** 解析失败被跳过的行数 */
	skippedLines: number;
	/** 文件 mtime，用于判定会话活跃度 */
	mtimeMs: number;
	/**
	 * 本次是「不连续的重读」（文件被截断/重写，或超大增量只读了尾部）。
	 * 为 true 时调用方必须重置累计状态（seq / messageCount / tokenEstimate），
	 * 否则续接旧计数会导致消息 id 重复或 seq 整体错位。
	 */
	restarted: boolean;
}

/** 单文件单次读取上限，防止异常大文件撑爆主进程内存（20MB）。 */
const MAX_READ_BYTES = 20 * 1024 * 1024;

/**
 * 从 fromOffset 增量读取 JSONL 并逐行解析。
 *
 * @returns 文件不存在/无法读取时返回 null；无新增内容时返回空 objects
 */
export async function parseJsonLines(
	filePath: string,
	fromOffset: number,
): Promise<JsonLinesScan | null> {
	let size: number;
	let mtimeMs: number;
	try {
		const st = await stat(filePath);
		if (!st.isFile()) return null;
		size = st.size;
		mtimeMs = st.mtimeMs;
	} catch {
		return null;
	}

	// 文件被截断/重写（体积变小）→ 从头全量重读，并告知调用方重置累计状态
	const restarted = fromOffset > size;
	let start = restarted ? 0 : Math.max(0, fromOffset);
	let truncatedHead = false;
	if (size - start > MAX_READ_BYTES) {
		// 超大增量：只读尾部避免 OOM。这也是一次「不连续」的读，
		// 之前累计的 seq / token 同样不可信，按重启处理。
		start = size - MAX_READ_BYTES;
		truncatedHead = true;
	}
	if (start >= size) {
		return {
			objects: [],
			endOffset: size,
			skippedLines: 0,
			mtimeMs,
			restarted: false,
		};
	}

	let buf: Buffer;
	let bytesRead: number;
	try {
		const fh = await open(filePath, "r");
		try {
			const length = size - start;
			buf = Buffer.allocUnsafe(length);
			// 必须用实际读到的字节数：stat 与 read 之间文件可能被截断，
			// 否则 allocUnsafe 的池化脏内存会被当成数据解析。
			const r = await fh.read(buf, 0, length, start);
			bytesRead = r.bytesRead;
		} finally {
			await fh.close();
		}
	} catch {
		return null;
	}

	let slice = buf.subarray(0, bytesRead);
	// 尾部截断时起点可能落在多字节 UTF-8 序列或行中间：
	// 丢弃首个换行符之前的残片，保证从完整行开始（注释先前声称做了这件事，实际没做）
	let startAdjust = 0;
	if (truncatedHead) {
		const firstNl = slice.indexOf(0x0a);
		if (firstNl < 0) {
			return {
				objects: [],
				endOffset: size,
				skippedLines: 0,
				mtimeMs,
				restarted: true,
			};
		}
		startAdjust = firstNl + 1;
		slice = slice.subarray(startAdjust);
	}

	const text = slice.toString("utf8");
	// 只消费到最后一个换行符：其后的残行留待下次（活文件正在追加写）
	const lastNl = text.lastIndexOf("\n");
	if (lastNl < 0) {
		// 整段都还没写完一行
		return {
			objects: [],
			endOffset: start + startAdjust,
			skippedLines: 0,
			mtimeMs,
			restarted: restarted || truncatedHead,
		};
	}
	const consumable = text.slice(0, lastNl);
	// startAdjust 计入：截断路径下 slice 已经跳过了首个残片
	const endOffset =
		start + startAdjust + Buffer.byteLength(consumable, "utf8") + 1;

	const objects: Record<string, unknown>[] = [];
	let skippedLines = 0;
	for (const line of consumable.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed) as unknown;
			const rec = asRecord(parsed);
			if (rec) objects.push(rec);
			else skippedLines += 1;
		} catch {
			// 坏行跳过并计数：格式演进/写入中断都不应中断整个摄取
			skippedLines += 1;
		}
	}

	return {
		objects,
		endOffset,
		skippedLines,
		mtimeMs,
		restarted: restarted || truncatedHead,
	};
}

/** 安全地把 unknown 断言成对象；非对象/数组/null 返回 null。 */
export function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

/** 安全取字符串；非字符串返回空串。 */
export function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** 单个工具结果并入扁平文本时的截断长度（避免几十 KB 的日志淹没蒸馏输入）。 */
const TOOL_RESULT_CLIP = 600;

/**
 * 把结构化 block 扁平成纯文本，供 FTS 检索与蒸馏输入使用。
 *
 * thinking 块**不计入**：它是模型的内部草稿，噪声大且常与最终结论矛盾，
 * 混进蒸馏输入会让 HANDOFF 包出现已被推翻的结论。
 */
export function flattenBlocks(blocks: CanonicalBlock[]): string {
	const parts: string[] = [];
	for (const b of blocks) {
		switch (b.type) {
			case "text":
				if (b.text.trim()) parts.push(b.text);
				break;
			case "tool_use":
				parts.push(`[工具调用] ${b.name}`);
				break;
			case "tool_result": {
				const out = b.output.trim();
				if (!out) break;
				const clipped =
					out.length > TOOL_RESULT_CLIP
						? `${out.slice(0, TOOL_RESULT_CLIP)}…（已截断）`
						: out;
				parts.push(`[工具结果]${b.isError ? "（失败）" : ""} ${clipped}`);
				break;
			}
			default:
				break;
		}
	}
	return parts.join("\n");
}

/**
 * 剥掉 CLI 注入的系统块（AGENTS.md、environment_context、权限说明、插件清单等）。
 * 这些是每轮固定注入的样板，不属于用户真实意图，会严重污染蒸馏输入与标题。
 */
export function stripInjectedContext(text: string): string {
	let out = text;
	const tagPatterns = [
		/<environment_context>[\s\S]*?<\/environment_context>/g,
		/<permissions[^>]*>[\s\S]*?<\/permissions[^>]*>/g,
		/<app-context>[\s\S]*?<\/app-context>/g,
		/<collaboration_mode>[\s\S]*?<\/collaboration_mode>/g,
		/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g,
		/<system-reminder>[\s\S]*?<\/system-reminder>/g,
		// codex：每轮注入的可用插件清单
		/<recommended_plugins>[\s\S]*?<\/recommended_plugins>/g,
		// claude-code：斜杠命令回显（/model、/clear 等），非用户真实意图
		/<command-name>[\s\S]*?<\/command-name>/g,
		/<command-message>[\s\S]*?<\/command-message>/g,
		/<command-args>[\s\S]*?<\/command-args>/g,
		/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g,
	];
	for (const re of tagPatterns) out = out.replace(re, "");
	// AGENTS.md / CLAUDE.md 全文注入块
	out = out.replace(/^#\s*AGENTS\.md instructions for[\s\S]*$/m, "");
	// codex：粘贴附件时注入的文件清单块（"# Files mentioned by the user:" + ## 路径行）
	out = out.replace(/^#\s*Files mentioned by the user:[\s\S]*?(?=\n\S|$)/m, "");
	return out.trim();
}

/**
 * 从一段用户文本提取可用作会话标题的首行意图。
 * 先剥注入块，再取首个非空行前 60 字；剥完为空返回空串（调用方应继续找下一条）。
 */
export function titleFromUserText(text: string): string {
	const cleaned = stripInjectedContext(text);
	if (!cleaned) return "";
	const firstLine = cleaned
		.split("\n")
		.map((l) => l.trim())
		.find((l) => l.length > 0);
	if (!firstLine) return "";
	return firstLine.slice(0, 60);
}
