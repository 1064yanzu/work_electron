/**
 * Push-based AsyncIterable for streaming user messages into SDK query.
 *
 * Allows the caller to push values into an AsyncIterable that the SDK
 * consumes as its prompt source. This enables keeping a single CLI process
 * alive across multiple user turns.
 */
export interface PushIterableController<T> {
	iterable: AsyncIterable<T>;
	push: (value: T) => void;
	close: () => void;
	readonly closed: boolean;
}

/** 创建 untyped 版本，兼容 PushController 接口 (push: (msg: unknown) => void) */
export function createPushIterableUntyped(): PushIterableController<unknown> {
	return createPushIterable<unknown>();
}

export function createPushIterable<T>(): PushIterableController<T> {
	const queue: T[] = [];
	let resolve: (() => void) | null = null;
	let done = false;

	const iterable: AsyncIterable<T> = {
		[Symbol.asyncIterator]() {
			return {
				async next(): Promise<IteratorResult<T>> {
					while (true) {
						if (queue.length > 0) {
							return { value: queue.shift()!, done: false };
						}
						if (done) {
							return { value: undefined as any, done: true };
						}
						await new Promise<void>((r) => {
							resolve = r;
						});
					}
				},
				async return(): Promise<IteratorResult<T>> {
					done = true;
					return { value: undefined as any, done: true };
				},
			};
		},
	};

	const push = (value: T) => {
		if (done) return;
		queue.push(value);
		if (resolve) {
			const r = resolve;
			resolve = null;
			r();
		}
	};

	const close = () => {
		done = true;
		if (resolve) {
			const r = resolve;
			resolve = null;
			r();
		}
	};

	return {
		iterable,
		push,
		close,
		get closed() {
			return done;
		},
	};
}
