/**
 * 长输出折叠：把超长 snapshot 切成「头部 + 折叠提示 + 尾部」，并保留剩余分页
 * 以便用户通过 `/cli more` 翻看。
 *
 * 折叠的判定单位是字符数（非 token / 行），因为不同 IM 渠道对单条消息字符数
 * 都有限制（telegram 4096、discord 2000、slack 40000、feishu 30000）。
 *
 * 折叠展示原则：
 *   - 字符总数 ≤ threshold → 不折叠
 *   - 否则保留头 30%、尾 30%、中间用占位提示替代
 *   - 剩余的中间页面切成不超过 `pageSize` 的页，存进 morePages 队列
 */

export type FoldedSnapshot = {
	/** 直接拿去 wrap 给 IM 显示的可视化主体 */
	visible: string;
	/** 是否被折叠 */
	folded: boolean;
	/** 折叠后剩余的"中间页"，调用方按需保存到 session.morePages */
	morePages: string[];
	/** 总折叠的字符数（统计用） */
	hiddenChars: number;
};

export type FoldOptions = {
	threshold: number;
	pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 1800;

export function foldLongOutput(
	snapshot: string,
	opts: FoldOptions,
): FoldedSnapshot {
	const threshold = Math.max(800, opts.threshold);
	const pageSize = Math.max(400, opts.pageSize ?? DEFAULT_PAGE_SIZE);
	if (!snapshot) {
		return { visible: snapshot, folded: false, morePages: [], hiddenChars: 0 };
	}
	if (snapshot.length <= threshold) {
		return { visible: snapshot, folded: false, morePages: [], hiddenChars: 0 };
	}
	// 头尾各保留 30%
	const head = Math.max(400, Math.floor(threshold * 0.4));
	const tail = Math.max(200, Math.floor(threshold * 0.3));
	const headPart = snapshot.slice(0, head);
	const tailPart = snapshot.slice(snapshot.length - tail);
	const middle = snapshot.slice(head, snapshot.length - tail);
	const hidden = middle.length;

	const pages: string[] = [];
	for (let i = 0; i < middle.length; i += pageSize) {
		pages.push(middle.slice(i, i + pageSize));
	}

	const placeholder = `\n[...折叠 ${hidden} 字符（${pages.length} 页），发送 /cli more 查看下一页...]\n`;
	return {
		visible: `${headPart}${placeholder}${tailPart}`,
		folded: true,
		morePages: pages,
		hiddenChars: hidden,
	};
}
