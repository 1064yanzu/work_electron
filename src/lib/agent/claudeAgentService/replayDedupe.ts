/**
 * 处理 followup / 重放场景下可见文本的去重：
 * SDK 在 resume/重试时可能把已经流式输出过的文本再发一遍，
 * 这里通过前缀探测 + 偏移追踪把重复的增量吞掉，只放行真正的新内容。
 */
export class VisibleTextReplayGuard {
	private streamedVisibleText = "";
	private pendingReplayProbe = "";
	private replayDedupeOffset: number | null = null;
	private readonly replayProbeMinChars = 24;

	constructor(private emit: (delta: string) => void) {}

	private appendVisibleTextDelta(delta: string): void {
		if (!delta) return;
		this.streamedVisibleText += delta;
		this.emit(delta);
	}

	flushPending(): void {
		if (!this.pendingReplayProbe) return;
		const pending = this.pendingReplayProbe;
		this.pendingReplayProbe = "";
		this.appendVisibleTextDelta(pending);
	}

	handleDelta(delta: string): void {
		if (!delta) return;

		if (this.replayDedupeOffset !== null) {
			const knownTail = this.streamedVisibleText.slice(this.replayDedupeOffset);
			if (knownTail && delta.startsWith(knownTail)) {
				this.replayDedupeOffset = null;
				this.appendVisibleTextDelta(delta.slice(knownTail.length));
				return;
			}

			const expected = this.streamedVisibleText.slice(
				this.replayDedupeOffset,
				this.replayDedupeOffset + delta.length,
			);
			if (expected === delta) {
				this.replayDedupeOffset += delta.length;
				if (this.replayDedupeOffset >= this.streamedVisibleText.length) {
					this.replayDedupeOffset = null;
				}
				return;
			}

			this.replayDedupeOffset = null;
		}

		if (this.pendingReplayProbe) {
			const candidate = this.pendingReplayProbe + delta;
			if (this.streamedVisibleText.startsWith(candidate)) {
				if (candidate.length >= this.replayProbeMinChars) {
					this.pendingReplayProbe = "";
					this.replayDedupeOffset = candidate.length;
				} else {
					this.pendingReplayProbe = candidate;
				}
				return;
			}

			this.flushPending();
		}

		if (this.streamedVisibleText.startsWith(delta)) {
			this.pendingReplayProbe = delta;
			return;
		}

		this.appendVisibleTextDelta(delta);
	}

	reset(): void {
		this.streamedVisibleText = "";
		this.replayDedupeOffset = null;
		this.pendingReplayProbe = "";
	}
}
