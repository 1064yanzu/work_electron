import {
	deriveThoughtTitle,
	getMaxThoughtTagTokenLength,
	type ThoughtMeta,
	THOUGHT_TAG_PATTERNS,
} from "./thoughtPatterns";

export type ThoughtParserSegment =
	| { type: "text"; content: string }
	| { type: "thought"; content: string; meta: ThoughtMeta };

interface ActiveThoughtTag {
	name: string;
	closeTag: string;
	title: string;
}

const TAG_GUARD_LENGTH = Math.max(8, getMaxThoughtTagTokenLength() - 1);

export class ThoughtStreamParser {
	private buffer = "";
	private activeThoughtTag: ActiveThoughtTag | null = null;

	append(chunk: string): ThoughtParserSegment[] {
		if (!chunk) return [];
		this.buffer += chunk;
		return this.parseAvailable();
	}

	flush(): ThoughtParserSegment[] {
		if (!this.buffer) return [];
		const out: ThoughtParserSegment[] = [];
		if (this.activeThoughtTag) {
			out.push({
				type: "thought",
				content: this.buffer,
				meta: {
					tag: this.activeThoughtTag.name,
					title: this.activeThoughtTag.title,
					source: this.activeThoughtTag.name,
				},
			});
		} else {
			out.push({ type: "text", content: this.buffer });
		}
		this.buffer = "";
		this.activeThoughtTag = null;
		return out;
	}

	private parseAvailable(): ThoughtParserSegment[] {
		const out: ThoughtParserSegment[] = [];

		while (this.buffer.length > 0) {
			if (!this.activeThoughtTag) {
				const nextOpen = this.findNextOpenTag(this.buffer);
				if (!nextOpen) {
					if (this.buffer.length <= TAG_GUARD_LENGTH) break;
					const safeText = this.buffer.slice(
						0,
						this.buffer.length - TAG_GUARD_LENGTH,
					);
					this.buffer = this.buffer.slice(
						this.buffer.length - TAG_GUARD_LENGTH,
					);
					if (safeText) out.push({ type: "text", content: safeText });
					break;
				}

				if (nextOpen.index > 0) {
					out.push({
						type: "text",
						content: this.buffer.slice(0, nextOpen.index),
					});
				}
				this.buffer = this.buffer.slice(
					nextOpen.index + nextOpen.pattern.openTag.length,
				);
				this.activeThoughtTag = {
					name: nextOpen.pattern.name,
					closeTag: nextOpen.pattern.closeTag,
					title: nextOpen.pattern.title,
				};
				continue;
			}

			const closeIndex = this.indexOfCaseInsensitive(
				this.buffer,
				this.activeThoughtTag.closeTag,
			);
			if (closeIndex === -1) {
				const guard = Math.max(0, this.activeThoughtTag.closeTag.length - 1);
				if (this.buffer.length <= guard) break;
				const safeThought = this.buffer.slice(0, this.buffer.length - guard);
				this.buffer = this.buffer.slice(this.buffer.length - guard);
				if (safeThought) {
					out.push({
						type: "thought",
						content: safeThought,
						meta: {
							tag: this.activeThoughtTag.name,
							title: deriveThoughtTitle({ tag: this.activeThoughtTag.name }),
							source: this.activeThoughtTag.name,
						},
					});
				}
				break;
			}

			const thoughtContent = this.buffer.slice(0, closeIndex);
			if (thoughtContent) {
				out.push({
					type: "thought",
					content: thoughtContent,
					meta: {
						tag: this.activeThoughtTag.name,
						title: deriveThoughtTitle({ tag: this.activeThoughtTag.name }),
						source: this.activeThoughtTag.name,
					},
				});
			}

			this.buffer = this.buffer.slice(
				closeIndex + this.activeThoughtTag.closeTag.length,
			);
			this.activeThoughtTag = null;
		}

		return out;
	}

	private findNextOpenTag(input: string): {
		index: number;
		pattern: (typeof THOUGHT_TAG_PATTERNS)[number];
	} | null {
		let best: {
			index: number;
			pattern: (typeof THOUGHT_TAG_PATTERNS)[number];
		} | null = null;
		for (const pattern of THOUGHT_TAG_PATTERNS) {
			const idx = this.indexOfCaseInsensitive(input, pattern.openTag);
			if (idx < 0) continue;
			if (!best || idx < best.index) {
				best = { index: idx, pattern };
			}
		}
		return best;
	}

	private indexOfCaseInsensitive(haystack: string, needle: string): number {
		if (!needle) return -1;
		return haystack.toLowerCase().indexOf(needle.toLowerCase());
	}
}
