/**
 * Coding Workspace 后端服务
 * 提供文件树读取（递归 + gitignore 过滤）和 Git CLI 封装
 */
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// 文件树节点类型
export interface FileTreeNode {
	name: string;
	path: string;
	type: "file" | "directory";
	children?: FileTreeNode[];
	size?: number;
}

// Git 状态信息
export interface GitStatusInfo {
	branch: string;
	ahead: number;
	behind: number;
	files: Array<{
		path: string;
		absolutePath?: string;
		status:
			| "modified"
			| "added"
			| "deleted"
			| "renamed"
			| "untracked"
			| "copied"
			| "conflicted";
		staged: boolean;
		indexStatus?:
			| "modified"
			| "added"
			| "deleted"
			| "renamed"
			| "untracked"
			| "copied"
			| "conflicted";
		workingTreeStatus?:
			| "modified"
			| "added"
			| "deleted"
			| "renamed"
			| "untracked"
			| "copied"
			| "conflicted";
		originalPath?: string;
		originalAbsolutePath?: string;
	}>;
}

// Git 分支信息
export interface GitBranchInfo {
	name: string;
	current: boolean;
	remote?: string;
	lastCommit?: string;
}

export interface GitCommitInfo {
	hash: string;
	shortHash: string;
	subject: string;
	authorName: string;
	timestamp: number;
}

// 默认忽略的目录/文件模式
const DEFAULT_IGNORE_PATTERNS = [
	"node_modules",
	".git",
	".DS_Store",
	"Thumbs.db",
	".next",
	".nuxt",
	"dist",
	"build",
	".cache",
	".turbo",
	"__pycache__",
	".pytest_cache",
	"coverage",
	".nyc_output",
	".vscode",
	".idea",
	"*.pyc",
	"*.pyo",
	"*.class",
	"*.o",
	"*.obj",
	"*.exe",
	"*.dll",
	"*.so",
	"*.dylib",
];

/** Parse .gitignore file and return patterns */
async function parseGitignore(dirPath: string): Promise<string[]> {
	try {
		const gitignorePath = path.join(dirPath, ".gitignore");
		const content = await readFile(gitignorePath, "utf-8");
		return content
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#"));
	} catch {
		return [];
	}
}

/** Check if a filename matches ignore patterns */
function shouldIgnore(name: string, patterns: string[]): boolean {
	for (const pattern of patterns) {
		// Simple glob matching for common patterns
		if (pattern === name) return true;
		if (pattern.endsWith("/") && pattern.slice(0, -1) === name) return true;
		if (pattern.startsWith("*.")) {
			const ext = pattern.slice(1);
			if (name.endsWith(ext)) return true;
		}
		if (pattern.startsWith("**/") && name === pattern.slice(3)) return true;
	}
	return false;
}

/** Read directory tree recursively */
export async function readFileTree(
	dirPath: string,
	maxDepth = 5,
	currentDepth = 0,
): Promise<FileTreeNode[]> {
	if (currentDepth >= maxDepth) return [];

	const ignorePatterns = [
		...DEFAULT_IGNORE_PATTERNS,
		...(currentDepth === 0 ? await parseGitignore(dirPath) : []),
	];

	try {
		const entries = await readdir(dirPath, { withFileTypes: true });
		const nodes: FileTreeNode[] = [];

		// Sort: directories first, then files, alphabetically
		const sorted = entries.sort((a, b) => {
			if (a.isDirectory() && !b.isDirectory()) return -1;
			if (!a.isDirectory() && b.isDirectory()) return 1;
			return a.name.localeCompare(b.name);
		});

		for (const entry of sorted) {
			if (shouldIgnore(entry.name, ignorePatterns)) continue;

			const fullPath = path.join(dirPath, entry.name);

			if (entry.isDirectory()) {
				const children = await readFileTree(
					fullPath,
					maxDepth,
					currentDepth + 1,
				);
				nodes.push({
					name: entry.name,
					path: fullPath,
					type: "directory",
					children,
				});
			} else if (entry.isFile()) {
				try {
					const fileStat = await stat(fullPath);
					nodes.push({
						name: entry.name,
						path: fullPath,
						type: "file",
						size: fileStat.size,
					});
				} catch {
					nodes.push({
						name: entry.name,
						path: fullPath,
						type: "file",
					});
				}
			}
		}

		return nodes;
	} catch (error) {
		console.error(
			`[CodingService] Failed to read directory: ${dirPath}`,
			error,
		);
		return [];
	}
}

/** Execute a git command in a directory */
async function gitExec(
	cwd: string,
	args: string[],
	options?: { timeout?: number },
): Promise<string> {
	try {
		const { stdout } = await execFileAsync("git", args, {
			cwd,
			maxBuffer: 1024 * 1024 * 10, // 10MB
			timeout: options?.timeout ?? 10000,
		});
		return stdout.trim();
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		throw new Error(`Git command failed: git ${args.join(" ")} — ${msg}`);
	}
}

/** Check if directory is a git repo */
export async function isGitRepo(dirPath: string): Promise<boolean> {
	try {
		await gitExec(dirPath, ["rev-parse", "--is-inside-work-tree"]);
		return true;
	} catch {
		return false;
	}
}

/** Get git status for a directory */
export async function getGitStatus(dirPath: string): Promise<GitStatusInfo> {
	const branchOutput = await gitExec(dirPath, ["branch", "--show-current"]);
	const detachedHead =
		!branchOutput && (await gitExec(dirPath, ["rev-parse", "--short", "HEAD"]));

	// Get ahead/behind counts
	let ahead = 0;
	let behind = 0;
	try {
		const abOutput = await gitExec(dirPath, [
			"rev-list",
			"--left-right",
			"--count",
			"HEAD...@{upstream}",
		]);
		const [a, b] = abOutput.split("\t").map(Number);
		ahead = a || 0;
		behind = b || 0;
	} catch {
		// No upstream configured
	}

	// Get file statuses using porcelain format
	const statusOutput = await gitExec(dirPath, [
		"status",
		"--porcelain=v1",
		"-uall",
	]);

	const files: GitStatusInfo["files"] = [];
	if (statusOutput) {
		for (const line of statusOutput.split("\n")) {
			if (!line) continue;
			const xy = line.substring(0, 2);
			const rawPath = line.substring(3);
			const parsedPath = rawPath.includes(" -> ")
				? rawPath.split(" -> ")
				: [rawPath];
			const originalPath = parsedPath.length > 1 ? parsedPath[0] : undefined;
			const filePath = parsedPath.length > 1 ? parsedPath[1] : parsedPath[0];

			const indexCode = xy[0];
			const worktreeCode = xy[1];
			const isConflict = isConflictStatus(xy);
			const indexStatus = isConflict
				? ("conflicted" as const)
				: mapGitStatusCode(indexCode);
			const workingTreeStatus =
				xy === "??"
					? "untracked"
					: isConflict
						? ("conflicted" as const)
						: mapGitStatusCode(worktreeCode);
			const primaryStatus =
				indexStatus ?? workingTreeStatus ?? ("modified" as const);
			const staged =
				indexStatus !== undefined &&
				indexStatus !== "untracked" &&
				indexStatus !== "conflicted";

			files.push({
				path: filePath,
				absolutePath: path.resolve(dirPath, filePath),
				status: primaryStatus,
				staged,
				indexStatus,
				workingTreeStatus,
				originalPath,
				originalAbsolutePath: originalPath
					? path.resolve(dirPath, originalPath)
					: undefined,
			});
		}
	}

	return {
		branch: branchOutput || detachedHead || "HEAD",
		ahead,
		behind,
		files,
	};
}

/** Get git branches */
export async function getGitBranches(
	dirPath: string,
): Promise<GitBranchInfo[]> {
	const output = await gitExec(dirPath, [
		"branch",
		"-a",
		"--format=%(HEAD) %(refname:short) %(upstream:short) %(objectname:short)",
	]);

	const branches: GitBranchInfo[] = [];
	if (output) {
		for (const line of output.split("\n")) {
			if (!line.trim()) continue;
			const isCurrent = line.startsWith("*");
			const parts = line.substring(2).trim().split(/\s+/);
			const name = parts[0] || "";
			const remote = parts[1] || undefined;
			const lastCommit = parts[2] || undefined;

			// Skip remote HEAD refs
			if (name.includes("HEAD")) continue;

			branches.push({
				name,
				current: isCurrent,
				remote,
				lastCommit,
			});
		}
	}

	return branches;
}

/** Get git commit history */
export async function getGitHistory(
	dirPath: string,
	limit = 12,
): Promise<GitCommitInfo[]> {
	const output = await gitExec(dirPath, [
		"log",
		`-n`,
		String(limit),
		"--date=unix",
		"--pretty=format:%H%x09%h%x09%an%x09%at%x09%s",
	]);

	if (!output) return [];

	return output
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [hash, shortHash, authorName, timestamp, ...subjectParts] =
				line.split("\t");
			return {
				hash,
				shortHash,
				authorName,
				timestamp: Number(timestamp || 0) * 1000,
				subject: subjectParts.join("\t"),
			};
		});
}

/** Read a single file's content */
export async function readFileContent(
	filePath: string,
	maxSize = 1024 * 512, // 512KB default limit
): Promise<{ content: string; truncated: boolean }> {
	const fileStat = await stat(filePath);
	const truncated = fileStat.size > maxSize;
	const content = await readFile(filePath, "utf-8");
	return {
		content: truncated ? content.slice(0, maxSize) : content,
		truncated,
	};
}

// ==================
// Git 写操作
// ==================

/** git add - 暂存文件 */
export async function gitAdd(
	dirPath: string,
	files: string[],
): Promise<{ success: boolean; error?: string }> {
	try {
		const args = files.length > 0 ? ["add", ...files] : ["add", "-A"];
		await gitExec(dirPath, args);
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** git reset HEAD - 取消暂存 */
export async function gitUnstage(
	dirPath: string,
	files: string[],
): Promise<{ success: boolean; error?: string }> {
	try {
		const args =
			files.length > 0 ? ["reset", "HEAD", "--", ...files] : ["reset", "HEAD"];
		await gitExec(dirPath, args);
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** git commit */
export async function gitCommit(
	dirPath: string,
	message: string,
	options?: { amend?: boolean },
): Promise<{ success: boolean; hash?: string; error?: string }> {
	try {
		const args = ["commit", "-m", message];
		if (options?.amend) args.push("--amend");
		const result = await gitExec(dirPath, args);
		const hashMatch = result.match(/\[[\w/.-]+ ([a-f0-9]+)\]/);
		return { success: true, hash: hashMatch?.[1] };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** git push */
export async function gitPush(
	dirPath: string,
	remote?: string,
	branch?: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const args = ["push"];
		if (remote) args.push(remote);
		if (branch) args.push(branch);
		await gitExec(dirPath, args, { timeout: 30000 });
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** git pull */
export async function gitPull(
	dirPath: string,
	remote?: string,
	branch?: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const args = ["pull"];
		if (remote) args.push(remote);
		if (branch) args.push(branch);
		await gitExec(dirPath, args, { timeout: 30000 });
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** git checkout / switch - 切换分支 */
export async function gitCheckout(
	dirPath: string,
	branch: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		await gitExec(dirPath, ["checkout", branch]);
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** git checkout -b - 创建新分支 */
export async function gitCreateBranch(
	dirPath: string,
	branchName: string,
	startPoint?: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		const args = ["checkout", "-b", branchName];
		if (startPoint) args.push(startPoint);
		await gitExec(dirPath, args);
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** git stash operations - 暂存工作区 */
export async function gitStash(
	dirPath: string,
	action: "push" | "pop" | "list",
	message?: string,
): Promise<{ success: boolean; output?: string; error?: string }> {
	try {
		const args = ["stash", action];
		if (action === "push" && message) args.push("-m", message);
		const result = await gitExec(dirPath, args);
		return { success: true, output: result };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** git checkout -- files - 丢弃工作区变更 */
export async function gitDiscard(
	dirPath: string,
	files: string[],
): Promise<{ success: boolean; error?: string }> {
	try {
		if (files.length === 0)
			return { success: false, error: "No files specified" };
		await gitExec(dirPath, ["checkout", "--", ...files]);
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

function mapGitStatusCode(
	code: string,
):
	| "modified"
	| "added"
	| "deleted"
	| "renamed"
	| "untracked"
	| "copied"
	| "conflicted"
	| undefined {
	switch (code) {
		case "M":
			return "modified";
		case "A":
			return "added";
		case "D":
			return "deleted";
		case "R":
			return "renamed";
		case "C":
			return "copied";
		case "U":
			return "conflicted";
		case "?":
			return "untracked";
		default:
			return undefined;
	}
}

function isConflictStatus(xy: string): boolean {
	return new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]).has(xy);
}
