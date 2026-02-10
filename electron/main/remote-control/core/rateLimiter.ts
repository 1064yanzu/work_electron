export class SlidingWindowRateLimiter {
	private readonly buckets = new Map<string, number[]>();

	allow(key: string, limitPerMinute: number, now = Date.now()): boolean {
		const windowMs = 60_000;
		const current = this.buckets.get(key) ?? [];
		const filtered = current.filter((ts) => now - ts < windowMs);
		if (filtered.length >= Math.max(1, limitPerMinute)) {
			this.buckets.set(key, filtered);
			return false;
		}
		filtered.push(now);
		this.buckets.set(key, filtered);
		return true;
	}
}
