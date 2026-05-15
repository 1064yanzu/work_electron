import fs from "node:fs";
import path from "node:path";

const CLAUDE_BINARY_BY_PLATFORM: Record<string, string> = {
	darwin: "claude",
	linux: "claude",
	win32: "claude.exe",
};

function getNativePackageNames(
	platform = process.platform,
	arch = process.arch,
): string[] {
	if (platform === "linux") {
		return [
			`@anthropic-ai/claude-agent-sdk-linux-${arch}-musl`,
			`@anthropic-ai/claude-agent-sdk-linux-${arch}`,
		];
	}
	return [`@anthropic-ai/claude-agent-sdk-${platform}-${arch}`];
}

function toPhysicalAsarPath(candidate: string): string {
	return candidate.replace(/\.asar([/\\])/g, ".asar.unpacked$1");
}

function existingFile(candidate: string): string | undefined {
	const physical = toPhysicalAsarPath(candidate);
	if (physical !== candidate && fs.existsSync(physical)) return physical;
	if (physical !== candidate) return undefined;
	return fs.existsSync(candidate) ? candidate : undefined;
}

export function resolveClaudeCodeExecutablePath(): string | undefined {
	const appRoot = process.env.APP_ROOT ?? "";
	const binary = CLAUDE_BINARY_BY_PLATFORM[process.platform];
	if (!appRoot || !binary) return undefined;

	for (const packageName of getNativePackageNames()) {
		const candidate = path.join(
			appRoot,
			"node_modules",
			...packageName.split("/"),
			binary,
		);
		const found = existingFile(candidate);
		if (found) return found;
	}

	return undefined;
}

export function getExpectedClaudeCodeExecutablePath(): string | undefined {
	const appRoot = process.env.APP_ROOT ?? "";
	const binary = CLAUDE_BINARY_BY_PLATFORM[process.platform];
	if (!appRoot || !binary) return undefined;
	const packageName = getNativePackageNames().at(-1);
	if (!packageName) return undefined;
	return path.join(appRoot, "node_modules", ...packageName.split("/"), binary);
}
