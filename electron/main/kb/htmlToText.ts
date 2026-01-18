export function htmlToText(html: string) {
	const withoutScript = html.replace(
		/<script[\s\S]*?>[\s\S]*?<\/script>/gi,
		"",
	);
	const withoutStyle = withoutScript.replace(
		/<style[\s\S]*?>[\s\S]*?<\/style>/gi,
		"",
	);
	const withNewlines = withoutStyle
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p\s*>/gi, "\n\n");
	const withoutTags = withNewlines.replace(/<[^>]+>/g, " ");
	return withoutTags.replace(/\s+/g, " ").trim();
}
