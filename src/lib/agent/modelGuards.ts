export function isClaudeFamilyModel(
	modelId: string | null | undefined,
): boolean {
	const value = String(modelId || "")
		.trim()
		.toLowerCase();
	if (!value) return false;
	return value.includes("claude") || value.includes("anthropic");
}
