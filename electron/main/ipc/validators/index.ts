/**
 * IPC 入参的运行时校验。
 *
 * ## 为什么类型不够
 *
 * `IPCSchema` 只在**编译期**约束渲染端。实际打到 handler 上的参数来自
 * `ipcRenderer.invoke` 的结构化克隆，中间任何一处 `as any`、一次远程控制通道
 * 注入的消息、一个和主进程版本不匹配的前端，都会让 handler 拿到形态完全不同的
 * 对象。对纯查询命令这最多返回一个奇怪的结果；对**副作用命令**（写文件、删目录、
 * 起 shell、动 git worktree）就是实打实的安全和数据问题。
 *
 * ## 覆盖范围
 *
 * 只给副作用命令加，不追求全量覆盖 —— 431 个命令逐个写 schema 的维护成本
 * 远超收益，而且大多数查询命令的参数错了只是查不到东西。
 *
 * ## 失败行为
 *
 * 校验失败直接抛错，由 `handle()` 的 catch 统一记日志并沿 IPC 抛回渲染端。
 * 错误信息里带上 channel 名和具体哪个字段不合法，方便前端排查。
 */
import { z } from "zod";

export type IpcInputValidator = z.ZodType;

/** 非空字符串（trim 后）。路径、id 这类参数最常见的错误就是传了空串。 */
const nonEmptyString = z.string().trim().min(1);

/**
 * 兼容历史调用形态：部分渲染端把参数包在 `{ payload: {...} }` 里
 * （见 `handlers/fsSafe.ts` 的 `unwrapPayload`）。校验器必须接受这两种形态，
 * 否则会把本来能跑的调用挡掉。
 */
function withPayloadWrapper<T extends z.ZodTypeAny>(inner: T) {
	return z.union([inner, z.object({ payload: inner })]);
}

const readFileSafeInput = withPayloadWrapper(
	z.object({
		path: nonEmptyString,
		encoding: z.enum(["utf-8", "base64"]).optional(),
	}),
);

const writeFileSafeInput = withPayloadWrapper(
	z.object({
		path: nonEmptyString,
		content: z.string(),
		encoding: z.enum(["utf-8", "base64"]).optional(),
		create_dirs: z.boolean().optional(),
		allow_empty: z.boolean().optional(),
		expected_mtime_ms: z.number().optional(),
		expected_size: z.number().optional(),
	}),
);

const pathOnlyInput = withPayloadWrapper(z.object({ path: nonEmptyString }));

const listFilesInput = withPayloadWrapper(
	z.object({ path: nonEmptyString, recursive: z.boolean().optional() }),
);

const mkdirInput = withPayloadWrapper(
	z.object({ path: nonEmptyString, recursive: z.boolean().optional() }),
);

const srcDestInput = withPayloadWrapper(
	z.object({
		src: nonEmptyString,
		dest: nonEmptyString,
		create_dirs: z.boolean().optional(),
	}),
);

const terminalCreateInput = z.object({
	id: z.string().optional(),
	cwd: z.string().optional(),
	// shell 还会再过一遍 `security/terminalGuard.ts` 的白名单，这里只挡明显畸形的值
	shell: z.string().max(512).optional(),
	env: z.record(z.string(), z.string()).optional(),
	cols: z.number().int().positive().max(2000).optional(),
	rows: z.number().int().positive().max(2000).optional(),
});

const fileWatchStartInput = z.object({
	path: nonEmptyString,
	// schema 里没有声明，但 handler 层历史上接受它；宽松放行避免挡掉存量调用
	ignored: z.array(z.string()).optional(),
});

// 注意：worktree 系列的 schema 用的是 camelCase（与库里其余 snake_case 命令不同）
const worktreeRepoInput = z.object({
	repoPath: nonEmptyString,
	branchName: z.string().optional(),
});

const worktreePairInput = z.object({
	repoPath: nonEmptyString,
	worktreePath: nonEmptyString,
});

/**
 * channel → 入参校验器。
 *
 * 键必须是真实存在的 channel 名；`registerIpcHandlers` 结束时的对账
 * （auditRegisteredChannels）会顺带发现拼错的键。
 */
export const IPC_INPUT_VALIDATORS = {
	// --- 文件系统（*_safe 全系列）---
	read_file_safe: readFileSafeInput,
	read_file_bytes_safe: pathOnlyInput,
	write_file_safe: writeFileSafeInput,
	list_files_safe: listFilesInput,
	mkdir_safe: mkdirInput,
	copy_file_safe: srcDestInput,
	move_file_safe: srcDestInput,
	delete_file_safe: pathOnlyInput,
	reveal_file_safe: pathOnlyInput,
	read_file_utf8: z.object({ path: nonEmptyString }),

	// --- 进程 ---
	terminal_create: terminalCreateInput,

	// --- 文件监听 ---
	file_watch_start: fileWatchStartInput,
	file_watch_stop: z.object({ path: nonEmptyString }),

	// --- Git worktree（会真的动用户仓库）---
	worktree_create: worktreeRepoInput,
	worktree_remove: worktreePairInput,
	worktree_merge: worktreePairInput,

	// --- 外链 ---
	open_external_url: z.object({ url: nonEmptyString.max(4096) }),
} satisfies Record<string, IpcInputValidator>;

export type ValidatedChannel = keyof typeof IPC_INPUT_VALIDATORS;

/** 执行一次校验，失败时抛出带 channel 上下文的可读错误。 */
export function validateIpcInput(
	channel: string,
	validator: IpcInputValidator,
	input: unknown,
): unknown {
	const result = validator.safeParse(input);
	if (result.success) return result.data;

	const detail = result.error.issues
		.slice(0, 5)
		.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
		.join("; ");
	throw new Error(`[ipc:${channel}] 入参校验失败 — ${detail}`);
}
