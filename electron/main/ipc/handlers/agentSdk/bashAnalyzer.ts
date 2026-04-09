/**
 * bashAnalyzer.ts
 *
 * Bash command safety analyzer for the Agent SDK.
 * Classifies shell commands by their destructive potential and
 * identifies whether they target paths inside or outside the sandbox.
 */
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DestructiveLevel = "safe" | "moderate" | "dangerous";

export interface BashAnalysis {
	/** Whether the command is purely read-only */
	isReadOnly: boolean;
	/** Whether the command targets paths outside the sandbox */
	targetsOutsideSandbox: boolean;
	/** Paths that the command may modify */
	targetPaths: string[];
	/** How destructive the command is */
	destructiveLevel: DestructiveLevel;
	/** Human-readable reason for the classification */
	reason: string;
}

// ---------------------------------------------------------------------------
// Command classification sets
// ---------------------------------------------------------------------------

/** Commands that only read data — always safe */
const READ_ONLY_COMMANDS = new Set([
	"cat",
	"head",
	"tail",
	"less",
	"more",
	"ls",
	"ll",
	"stat",
	"file",
	"wc",
	"grep",
	"egrep",
	"fgrep",
	"rg",
	"ag",
	"find",
	"locate",
	"which",
	"where",
	"whereis",
	"type",
	"echo",
	"printf",
	"pwd",
	"env",
	"printenv",
	"whoami",
	"id",
	"date",
	"uname",
	"hostname",
	"uptime",
	"df",
	"du",
	"free",
	"top",
	"ps",
	"lsof",
	"netstat",
	"ss",
	"ifconfig",
	"ip",
	"dig",
	"nslookup",
	"ping",
	"traceroute",
	"curl",
	"wget",
	"diff",
	"cmp",
	"md5",
	"md5sum",
	"sha256sum",
	"shasum",
	"xxd",
	"hexdump",
	"od",
	"strings",
	"readlink",
	"realpath",
	"basename",
	"dirname",
	"tree",
	"sort",
	"uniq",
	"cut",
	"awk",
	"sed",   // sed without -i is read-only, handled separately
	"tr",
	"tee",   // tee writes to a file, handled separately
	"jq",
	"yq",
	"python3",
	"python",
	"node",
	"ruby",
	"perl",
	"git",
	"npm",
	"npx",
	"yarn",
	"pnpm",
	"brew",
	"cargo",
	"go",
	"rustc",
	"gcc",
	"clang",
	"make",
	"cmake",
	"open",
	"xdg-open",
	"pbcopy",
	"pbpaste",
	"xclip",
	"xsel",
]);

/** Commands that are inherently dangerous */
const DANGEROUS_COMMANDS = new Set([
	"rm",
	"rmdir",
	"shred",
	"chmod",
	"chown",
	"chgrp",
	"kill",
	"killall",
	"pkill",
	"shutdown",
	"reboot",
	"halt",
	"poweroff",
	"init",
	"systemctl",
	"launchctl",
	"sudo",
	"su",
	"doas",
	"mkfs",
	"fdisk",
	"dd",
	"format",
]);

/** Commands that write/modify — moderate risk */
const WRITE_COMMANDS = new Set([
	"cp",
	"mv",
	"ln",
	"mkdir",
	"touch",
	"install",
	"rsync",
	"scp",
	"tar",
	"zip",
	"unzip",
	"gzip",
	"gunzip",
	"bzip2",
	"xz",
]);

// ---------------------------------------------------------------------------
// Shell tokenization (simplified)
// ---------------------------------------------------------------------------

function tokenizeShell(input: string): string[] {
	const s = String(input || "");
	const tokens: string[] = [];
	let buf = "";
	let quote: "'" | '"' | null = null;
	let escape = false;

	for (let i = 0; i < s.length; i++) {
		const ch = s[i] as string;

		if (escape) {
			buf += ch;
			escape = false;
			continue;
		}

		if (ch === "\\" && quote !== "'") {
			escape = true;
			continue;
		}

		if (quote) {
			if (ch === quote) {
				quote = null;
			} else {
				buf += ch;
			}
			continue;
		}

		if (ch === "'" || ch === '"') {
			quote = ch;
			continue;
		}

		if (/\s/.test(ch)) {
			if (buf) {
				tokens.push(buf);
				buf = "";
			}
			continue;
		}

		buf += ch;
	}
	if (buf) tokens.push(buf);
	return tokens;
}

/**
 * Split a command string on shell operators (&&, ||, ;, |) into segments.
 * Each segment is a separate command to analyze.
 */
function splitCommandSegments(command: string): string[] {
	// Simple split — doesn't handle quotes perfectly but good enough for analysis
	const segments: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let escape = false;

	for (let i = 0; i < command.length; i++) {
		const ch = command[i] as string;

		if (escape) {
			current += ch;
			escape = false;
			continue;
		}
		if (ch === "\\" && quote !== "'") {
			escape = true;
			current += ch;
			continue;
		}
		if (quote) {
			current += ch;
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === '"') {
			quote = ch;
			current += ch;
			continue;
		}

		// Check for operators
		if (ch === ";" || ch === "|") {
			if (current.trim()) segments.push(current.trim());
			current = "";
			// Skip double operators: && ||
			if (i + 1 < command.length && command[i + 1] === ch) i++;
			continue;
		}
		if (ch === "&" && i + 1 < command.length && command[i + 1] === "&") {
			if (current.trim()) segments.push(current.trim());
			current = "";
			i++; // skip second &
			continue;
		}

		current += ch;
	}
	if (current.trim()) segments.push(current.trim());
	return segments;
}

/**
 * Check if a command has output redirection (>, >>) targeting a path.
 * Returns the target path or null.
 */
function extractRedirectTarget(command: string): string | null {
	// Match >> or > followed by a path
	const match = command.match(/>{1,2}\s*([^\s;|&]+)/);
	if (!match?.[1]) return null;
	const target = match[1].replace(/^['"]|['"]$/g, "");
	return target || null;
}

/**
 * Check if `sed` is used with the in-place flag (-i)
 */
function isSedInPlace(tokens: string[]): boolean {
	return tokens.some((t) => t === "-i" || t.startsWith("-i"));
}

/**
 * Check if `tee` is being used (writes to a file)
 */
function isTeeCommand(tokens: string[]): boolean {
	return tokens[0] === "tee";
}

// ---------------------------------------------------------------------------
// Main analyzer
// ---------------------------------------------------------------------------

function analyzeSegment(segment: string, cwd: string): BashAnalysis {
	const tokens = tokenizeShell(segment);
	if (tokens.length === 0) {
		return {
			isReadOnly: true,
			targetsOutsideSandbox: false,
			targetPaths: [],
			destructiveLevel: "safe",
			reason: "空命令",
		};
	}

	const cmd = (tokens[0] || "").toLowerCase();
	const cwdResolved = path.resolve(cwd);

	const isInsideSandbox = (p: string): boolean => {
		const resolved = path.isAbsolute(p)
			? path.resolve(p)
			: path.resolve(cwd, p);
		return (
			resolved === cwdResolved ||
			resolved.startsWith(`${cwdResolved}${path.sep}`)
		);
	};

	// Extract file paths from tokens (non-flag arguments)
	const filePaths = tokens
		.slice(1)
		.filter((t) => !t.startsWith("-") && t !== "")
		.map((t) => t.replace(/^['"]|['"]$/g, ""));

	// Check for output redirection
	const redirectTarget = extractRedirectTarget(segment);

	// --- Dangerous commands ---
	if (DANGEROUS_COMMANDS.has(cmd)) {
		const outsidePaths = filePaths.filter((p) => !isInsideSandbox(p));
		return {
			isReadOnly: false,
			targetsOutsideSandbox: outsidePaths.length > 0,
			targetPaths: filePaths,
			destructiveLevel: "dangerous",
			reason: `危险命令: ${cmd}`,
		};
	}

	// --- Write commands ---
	if (WRITE_COMMANDS.has(cmd)) {
		// For cp/mv/rsync, the last argument is typically the destination
		const destPath = filePaths[filePaths.length - 1];
		const outsideSandbox = destPath ? !isInsideSandbox(destPath) : false;
		return {
			isReadOnly: false,
			targetsOutsideSandbox: outsideSandbox,
			targetPaths: destPath ? [destPath] : [],
			destructiveLevel: outsideSandbox ? "moderate" : "safe",
			reason: `写入命令: ${cmd}`,
		};
	}

	// --- sed with -i ---
	if (cmd === "sed" && isSedInPlace(tokens)) {
		const targetFiles = filePaths.filter(
			(p) => !p.startsWith("-") && !p.includes("/dev/"),
		);
		const outsidePaths = targetFiles.filter((p) => !isInsideSandbox(p));
		return {
			isReadOnly: false,
			targetsOutsideSandbox: outsidePaths.length > 0,
			targetPaths: targetFiles,
			destructiveLevel: outsidePaths.length > 0 ? "moderate" : "safe",
			reason: "sed -i (原地编辑)",
		};
	}

	// --- tee (writes to file) ---
	if (isTeeCommand(tokens)) {
		const targetFiles = filePaths.filter((p) => !p.startsWith("-"));
		const outsidePaths = targetFiles.filter((p) => !isInsideSandbox(p));
		return {
			isReadOnly: false,
			targetsOutsideSandbox: outsidePaths.length > 0,
			targetPaths: targetFiles,
			destructiveLevel: outsidePaths.length > 0 ? "moderate" : "safe",
			reason: "tee (写入文件)",
		};
	}

	// --- Output redirection ---
	if (redirectTarget) {
		const outsideSandbox = !isInsideSandbox(redirectTarget);
		return {
			isReadOnly: false,
			targetsOutsideSandbox: outsideSandbox,
			targetPaths: [redirectTarget],
			destructiveLevel: outsideSandbox ? "moderate" : "safe",
			reason: `输出重定向到: ${redirectTarget}`,
		};
	}

	// --- Read-only commands ---
	if (READ_ONLY_COMMANDS.has(cmd)) {
		return {
			isReadOnly: true,
			targetsOutsideSandbox: false,
			targetPaths: [],
			destructiveLevel: "safe",
			reason: `只读命令: ${cmd}`,
		};
	}

	// --- Unknown command → moderate (require approval) ---
	return {
		isReadOnly: false,
		targetsOutsideSandbox: true, // assume the worst
		targetPaths: filePaths,
		destructiveLevel: "moderate",
		reason: `未知命令: ${cmd}（默认需要审批）`,
	};
}

/**
 * Analyze a shell command string for safety.
 * Splits compound commands and returns the worst-case analysis.
 */
export function analyzeBashCommand(command: string, cwd: string): BashAnalysis {
	const trimmed = String(command || "").trim();
	if (!trimmed) {
		return {
			isReadOnly: true,
			targetsOutsideSandbox: false,
			targetPaths: [],
			destructiveLevel: "safe",
			reason: "空命令",
		};
	}

	const segments = splitCommandSegments(trimmed);
	if (segments.length === 0) {
		return {
			isReadOnly: true,
			targetsOutsideSandbox: false,
			targetPaths: [],
			destructiveLevel: "safe",
			reason: "空命令",
		};
	}

	// Analyze each segment and take the worst case
	const analyses = segments.map((seg) => analyzeSegment(seg, cwd));

	const levelOrder: Record<DestructiveLevel, number> = {
		safe: 0,
		moderate: 1,
		dangerous: 2,
	};

	let worstLevel: DestructiveLevel = "safe";
	let anyOutside = false;
	let allReadOnly = true;
	const allPaths: string[] = [];
	const reasons: string[] = [];

	for (const a of analyses) {
		if (levelOrder[a.destructiveLevel] > levelOrder[worstLevel]) {
			worstLevel = a.destructiveLevel;
		}
		if (a.targetsOutsideSandbox) anyOutside = true;
		if (!a.isReadOnly) allReadOnly = false;
		allPaths.push(...a.targetPaths);
		if (a.reason) reasons.push(a.reason);
	}

	return {
		isReadOnly: allReadOnly,
		targetsOutsideSandbox: anyOutside,
		targetPaths: [...new Set(allPaths)],
		destructiveLevel: worstLevel,
		reason: reasons.join("; "),
	};
}
