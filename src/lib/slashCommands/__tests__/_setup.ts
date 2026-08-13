/**
 * 测试环境 polyfill：在 Node 下运行 PBT 时，给 renderer-only 的模块
 * （例如 themeManager / chatStore / permissionStore）提供最小 DOM 兜底。
 *
 * 使用方式：
 *   npx tsx --import ./src/lib/slashCommands/__tests__/_setup.ts --test ...
 * 或：
 *   node --test --import tsx ./src/lib/slashCommands/__tests__/_setup.ts ...
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

if (
	typeof globalThis.localStorage === "undefined" ||
	typeof globalThis.localStorage.getItem !== "function"
) {
	const mem = new Map();
	globalThis.localStorage = {
		getItem: (k) => (mem.has(k) ? mem.get(k) : null),
		setItem: (k, v) => mem.set(k, String(v)),
		removeItem: (k) => mem.delete(k),
		clear: () => mem.clear(),
		key: (i) => Array.from(mem.keys())[i] ?? null,
		get length() {
			return mem.size;
		},
	};
}

if (typeof globalThis.document === "undefined") {
	globalThis.document = {
		documentElement: {
			classList: {
				add: () => undefined,
				remove: () => undefined,
				toggle: () => false,
				contains: () => false,
			},
			style: { setProperty: () => undefined, removeProperty: () => undefined },
			setAttribute: () => undefined,
			getAttribute: () => null,
		},
		body: {
			appendChild: () => undefined,
			classList: { add: () => undefined, remove: () => undefined },
		},
		createElement: () => ({
			id: "",
			style: {},
			setAttribute: () => undefined,
			appendChild: () => undefined,
		}),
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
	};
}

if (typeof globalThis.window === "undefined") {
	globalThis.window = {
		matchMedia: () => ({
			matches: false,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
		}),
		localStorage: globalThis.localStorage,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		location: { href: "http://localhost" },
	};
}

if (typeof globalThis.navigator === "undefined") {
	globalThis.navigator = { userAgent: "node-test" };
}
