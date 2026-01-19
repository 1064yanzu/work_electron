export function sanitizeHtml(html: string) {
	const withoutScript = html.replace(
		/<script[\s\S]*?>[\s\S]*?<\/script>/gi,
		"",
	);
	const withoutStyle = withoutScript.replace(
		/<style[\s\S]*?>[\s\S]*?<\/style>/gi,
		"",
	);
	const withoutCssLink = withoutStyle.replace(
		/<link\b(?=[^>]*\brel\s*=\s*(?:"[^"]*stylesheet[^"]*"|'[^']*stylesheet[^']*'|[^\s>]*stylesheet[^\s>]*))[^>]*>/gi,
		"",
	);
	return withoutCssLink.replace(
		/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
		"",
	);
}
