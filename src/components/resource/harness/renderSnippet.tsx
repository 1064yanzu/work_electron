/**
 * FTS 检索片段的安全渲染。
 *
 * 后端 snippet() 用 <mark></mark> 包裹命中词。这里手动切分成 React 片段，
 * **绝不走 dangerouslySetInnerHTML**——片段内容来自会话正文，属于不可信输入。
 */

export function renderSnippet(snippet: string) {
	return snippet
		.split(/(<mark>[\s\S]*?<\/mark>)/g)
		.filter((part) => part.length > 0)
		.map((part, index) => {
			const matched = /^<mark>([\s\S]*?)<\/mark>$/.exec(part);
			const key = `${index}-${part.slice(0, 12)}`;
			if (matched) {
				return (
					<mark
						key={key}
						className="bg-terracotta/[0.18] text-text-primary rounded-sm px-0.5"
					>
						{matched[1]}
					</mark>
				);
			}
			return <span key={key}>{part}</span>;
		});
}
