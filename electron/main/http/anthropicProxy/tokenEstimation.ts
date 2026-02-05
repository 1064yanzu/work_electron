import { collectAnthropicRequestText } from "./ipoMarkers";
import type { AnthropicRequest } from "./types";

function estimateTokensFromText(text: string): number {
	const s = String(text || "");
	if (!s.trim()) return 0;
	// Rough heuristic:
	// - CJK characters are often close to 1 token each
	// - Other characters average ~4 chars/token
	const cjkMatches = s.match(/[\u4E00-\u9FFF]/g);
	const cjkCount = cjkMatches ? cjkMatches.length : 0;
	const otherCount = Math.max(0, s.length - cjkCount);
	return cjkCount + Math.ceil(otherCount / 4);
}

export function estimateAnthropicInputTokens(
	req: Partial<AnthropicRequest>,
): number {
	const pieces: string[] = [];
	const text = collectAnthropicRequestText(req as AnthropicRequest);
	if (text) pieces.push(text);
	if (Array.isArray(req.tools)) {
		for (const t of req.tools) {
			if (!t) continue;
			if (typeof (t as any).name === "string")
				pieces.push(String((t as any).name));
			if (typeof (t as any).description === "string")
				pieces.push(String((t as any).description));
			if ((t as any).input_schema) {
				try {
					pieces.push(JSON.stringify((t as any).input_schema));
				} catch {
					// ignore
				}
			}
		}
	}
	return estimateTokensFromText(pieces.join("\n"));
}
