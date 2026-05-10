/**
 * TTS 文本净化
 *
 * 把助手消息里常见的 Markdown 标记、代码块、工具调用占位符、文档协议标记
 * 等"看着是字其实不适合念"的片段剥干净，留下自然语言。
 *
 * 约束：
 *  - 纯函数；不依赖 DOM / React
 *  - 默认保留中文标点与自然换行，让 TTS 合成时能正确停顿
 *  - 超长 URL 不念出来，改念"链接"；短 URL（≤ 40 字符）保留 host
 *  - 代码块整体替换成"（省略一段代码）"，避免把反引号/尖括号念出来
 */

export interface SanitizeOptions {
	/** 是否保留代码块占位说明（默认 true）。false 则整段删掉。 */
	keepCodePlaceholder?: boolean;
	/** 允许的最大长度；超出会截断到最后一个句末标点，再追加省略号 */
	maxLength?: number;
}

const URL_HOST_MAX = 40;

/**
 * 把纯文本里的 Markdown / 协议噪声剥掉，产出适合 TTS 合成的文本。
 */
export function sanitizeForSpeech(
	raw: string,
	options: SanitizeOptions = {},
): string {
	if (!raw) return "";
	const keepCodePlaceholder = options.keepCodePlaceholder ?? true;

	let text = raw;

	// 1) 先剥掉项目内部的协议标记和 AI 写作占位
	//    <<<WRITE>>> / <<<END>>> / <<<AI_CREATE_DONE>>> / <<<AI_UPDATE_DONE>>>
	text = text.replace(/<<<[A-Z_]+>>>/g, "");

	// 2) :::update-doc / :::create-doc 这类围栏块：整段移除
	text = text.replace(/:::(update-doc|create-doc)[\s\S]*?:::/g, "");

	// 3) 三反引号代码块：替换占位或删除
	text = text.replace(/```[\s\S]*?```/g, () =>
		keepCodePlaceholder ? "（此处略去一段代码）" : "",
	);

	// 4) 行内代码：`xxx` → 去掉反引号，保留内容
	text = text.replace(/`([^`\n]+)`/g, "$1");

	// 5) 图片：![alt](url) → alt 或空
	text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, (_m, alt) =>
		alt ? `图片：${alt}` : "",
	);

	// 6) 链接：[text](url) → 短链接保留 host，长链接只念 text 或"链接"
	text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (_m, label, url) => {
		const clean = String(url).trim();
		if (clean.length <= URL_HOST_MAX) {
			try {
				const host = new URL(clean).host;
				return label ? `${label}（${host}）` : host;
			} catch {
				return label || clean;
			}
		}
		return label || "链接";
	});

	// 7) 裸 URL：超过阈值的念"链接"，否则念 host
	text = text.replace(/\bhttps?:\/\/\S+/gi, (m) => {
		if (m.length <= URL_HOST_MAX) {
			try {
				return new URL(m).host;
			} catch {
				return "链接";
			}
		}
		return "链接";
	});

	// 8) 标题：# / ## / ### 只剩标题文字
	text = text.replace(/^#{1,6}\s+/gm, "");

	// 9) 引用块 "> "：去掉前缀
	text = text.replace(/^>\s?/gm, "");

	// 10) 列表前缀：-、*、+、数字. 统一换成空（保留换行，让合成停顿）
	text = text.replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "");

	// 11) 水平线 --- / ***
	text = text.replace(/^\s*[-*_]{3,}\s*$/gm, "");

	// 12) 表格分隔行：| --- | --- |  整行删
	text = text.replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, "");

	// 13) 表格单元格 | 变成"，"，让念起来像陈述
	text = text.replace(/^\s*\|(.+)\|\s*$/gm, (_m, row) => {
		return String(row)
			.split("|")
			.map((cell) => cell.trim())
			.filter((cell) => cell.length > 0)
			.join("，");
	});

	// 14) 加粗 / 斜体 / 删除线：**x** *x* _x_ ~~x~~
	text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
	text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");
	text = text.replace(/__([^_]+)__/g, "$1");
	text = text.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1");
	text = text.replace(/~~([^~]+)~~/g, "$1");

	// 15) HTML 标签（如果有漏过来的）
	text = text.replace(/<br\s*\/?>/gi, "\n");
	text = text.replace(/<\/?[a-zA-Z][^>]*>/g, "");

	// 16) 多余空行、首尾空白
	text = text.replace(/\n{3,}/g, "\n\n");
	text = text.replace(/[\u00A0\t ]+/g, " ");
	text = text.trim();

	// 17) 可选硬截断：优先切到最后一个句末标点
	if (options.maxLength && text.length > options.maxLength) {
		const slice = text.slice(0, options.maxLength);
		const lastPunct = Math.max(
			slice.lastIndexOf("。"),
			slice.lastIndexOf("！"),
			slice.lastIndexOf("？"),
			slice.lastIndexOf("."),
			slice.lastIndexOf("!"),
			slice.lastIndexOf("?"),
			slice.lastIndexOf("\n"),
		);
		text = lastPunct > options.maxLength * 0.6 ? slice.slice(0, lastPunct + 1) : slice;
		text = `${text.trim()}……`;
	}

	return text;
}

/**
 * 按自然断句拆成若干短段，每段不超过 maxChars；空段会被丢弃。
 *
 * 用途：长回复的自动朗读队列，分段合成避免一次 TTS 请求过大，
 * 同时让用户随时能在段间中断。
 */
export function splitForSpeech(text: string, maxChars = 220): string[] {
	if (!text) return [];
	const out: string[] = [];
	// 先按段落切，再按句号切，保持自然停顿
	const paragraphs = text.split(/\n{2,}/);
	for (const p of paragraphs) {
		const normalized = p.trim();
		if (!normalized) continue;
		const sentences = normalized
			.split(/(?<=[。！？.!?\n])\s*/)
			.map((s) => s.trim())
			.filter(Boolean);

		let buf = "";
		for (const s of sentences) {
			if ((buf + s).length <= maxChars) {
				buf += (buf ? "" : "") + s;
			} else {
				if (buf) out.push(buf);
				if (s.length <= maxChars) {
					buf = s;
				} else {
					// 单句超过上限，按字数硬切
					for (let i = 0; i < s.length; i += maxChars) {
						out.push(s.slice(i, i + maxChars));
					}
					buf = "";
				}
			}
		}
		if (buf) out.push(buf);
	}
	return out;
}
