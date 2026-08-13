#!/usr/bin/env node
/**
 * 从 `electron/shared/ipc/<域>.ts` 生成运行时可用的 channel 名清单。
 *
 * 为什么需要它：`IPCSchema` 是纯类型，编译后什么都不剩，运行时拿不到"合法命令
 * 有哪些"。而 preload 的 channel 白名单和主进程注册时的拼写校验都需要这份数据。
 * 手写一份必然和 schema 漂移，所以从单一事实源生成。
 *
 * 数据源是各域文件而不是 barrel（`ipc-schema.ts`）：barrel 里只有
 * `interface IPCSchema extends ...`，没有成员名。
 *
 * 用法：
 *   node scripts/generate-ipc-channels.mjs          # 生成 / 覆盖
 *   node scripts/generate-ipc-channels.mjs --check  # 只校验是否最新（CI / lint 用）
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const SCHEMA_DIR = resolve(projectRoot, "electron/shared/ipc");
/** 只放辅助类型，不含 channel。 */
const NON_DOMAIN_FILES = new Set(["common.ts"]);
const OUTPUT_PATH = resolve(projectRoot, "electron/shared/ipcChannels.generated.ts");

/**
 * 抓出 `export interface XxxIpcSchema { ... }` 顶层（缩进恰好一个 tab）的属性名。
 *
 * 用括号深度而不是正则整体匹配：schema 体内有大量嵌套对象字面量，
 * 只有深度为 1 的 `key: {` 才是真正的 channel。
 */
function extractChannelsFromDomain(source, fileName) {
	const startMarker = /export interface \w+IpcSchema \{/.exec(source);
	if (!startMarker) {
		throw new Error(`${fileName} 里找不到 \`export interface XxxIpcSchema {\``);
	}

	const channels = [];
	let depth = 0;
	let i = startMarker.index + startMarker[0].length - 1; // 指向那个 `{`
	let lineStart = i;

	for (; i < source.length; i += 1) {
		const ch = source[i];
		if (ch === "{") {
			depth += 1;
			continue;
		}
		if (ch === "}") {
			depth -= 1;
			if (depth === 0) break;
			continue;
		}
		if (ch === "\n") {
			lineStart = i + 1;
			continue;
		}
		if (depth === 1 && i === lineStart) {
			const lineEnd = source.indexOf("\n", i);
			const line = source.slice(i, lineEnd === -1 ? source.length : lineEnd);
			const match = /^\t(?:"([^"]+)"|([A-Za-z_$][\w$]*)):\s*\{/.exec(line);
			if (match) channels.push(match[1] ?? match[2]);
		}
	}

	if (channels.length === 0) {
		throw new Error(`${fileName} 解析出 0 个 channel，生成器可能与 schema 结构脱节`);
	}
	return channels;
}

function extractChannels() {
	const files = readdirSync(SCHEMA_DIR)
		.filter((f) => f.endsWith(".ts") && !NON_DOMAIN_FILES.has(f))
		.sort();
	if (files.length === 0) {
		throw new Error(`${SCHEMA_DIR} 下没有域文件`);
	}

	const seen = new Map();
	for (const file of files) {
		const source = readFileSync(resolve(SCHEMA_DIR, file), "utf-8");
		for (const channel of extractChannelsFromDomain(source, file)) {
			const previous = seen.get(channel);
			if (previous) {
				throw new Error(
					`channel "${channel}" 在 ${previous} 和 ${file} 里重复声明`,
				);
			}
			seen.set(channel, file);
		}
	}
	return [...seen.keys()];
}

function render(channels) {
	const sorted = [...channels].sort();
	const body = sorted.map((name) => `\t"${name}",`).join("\n");
	return `// 本文件由 scripts/generate-ipc-channels.mjs 自动生成，请勿手工编辑。
// 数据源：electron/shared/ipc/<域>.ts
// 重新生成：npm run generate:ipc      校验是否最新：npm run check:ipc

/**
 * 全部合法的 IPC channel 名（运行时可用）。
 *
 * \`IPCSchema\` 是纯类型，编译后不留痕迹；preload 的白名单校验和主进程注册时的
 * 拼写检查都需要一份运行时数据，就是这里。
 */
export const IPC_CHANNELS = [
${body}
] as const;

export type GeneratedIpcChannel = (typeof IPC_CHANNELS)[number];

/** 供 O(1) 查询的集合。 */
export const IPC_CHANNEL_SET: ReadonlySet<string> = new Set(IPC_CHANNELS);
`;
}

const channels = extractChannels();
const next = render(channels);

if (process.argv.includes("--check")) {
	let current = "";
	try {
		current = readFileSync(OUTPUT_PATH, "utf-8");
	} catch {
		// 文件不存在 → 视为不一致
	}
	if (current !== next) {
		console.error(
			"[check:ipc] electron/shared/ipcChannels.generated.ts 与 electron/shared/ipc/ 下的域 schema 不一致，请运行 `npm run generate:ipc`",
		);
		process.exit(1);
	}
	console.log(`[check:ipc] OK（${channels.length} 个 channel）`);
	process.exit(0);
}

writeFileSync(OUTPUT_PATH, next, "utf-8");
console.log(
	`[generate:ipc] 已写入 ${channels.length} 个 channel → electron/shared/ipcChannels.generated.ts`,
);
