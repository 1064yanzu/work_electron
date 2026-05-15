import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const TARGETS = {
	"darwin-arm64": {
		packageName: "@anthropic-ai/claude-agent-sdk-darwin-arm64",
		binary: "claude",
	},
	"darwin-x64": {
		packageName: "@anthropic-ai/claude-agent-sdk-darwin-x64",
		binary: "claude",
	},
	"linux-arm64": {
		packageName: "@anthropic-ai/claude-agent-sdk-linux-arm64",
		binary: "claude",
	},
	"linux-x64": {
		packageName: "@anthropic-ai/claude-agent-sdk-linux-x64",
		binary: "claude",
	},
	"win32-arm64": {
		packageName: "@anthropic-ai/claude-agent-sdk-win32-arm64",
		binary: "claude.exe",
	},
	"win32-x64": {
		packageName: "@anthropic-ai/claude-agent-sdk-win32-x64",
		binary: "claude.exe",
	},
};

function parseTargets() {
	const explicit = process.argv.find((arg) => arg.startsWith("--targets="));
	if (explicit) {
		return explicit
			.slice("--targets=".length)
			.split(",")
			.map((target) => target.trim())
			.filter(Boolean);
	}
	return [`${process.platform}-${process.arch}`];
}

function packagePath(packageName, binary) {
	return path.join(process.cwd(), "node_modules", ...packageName.split("/"), binary);
}

const missing = [];
for (const target of parseTargets()) {
	const spec = TARGETS[target];
	if (!spec) {
		missing.push(`${target}: unsupported target`);
		continue;
	}

	const binaryPath = packagePath(spec.packageName, spec.binary);
	if (!fs.existsSync(binaryPath)) {
		missing.push(`${target}: ${binaryPath}`);
	}
}

if (missing.length > 0) {
	console.error("[verify-claude-native-binaries] Claude Code 原生二进制缺失：");
	for (const item of missing) console.error(`- ${item}`);
	console.error(
		"请在对应平台执行 npm ci/npm install，或确保 CI runner 与目标平台一致且未禁用 optionalDependencies。",
	);
	process.exit(1);
}

console.log("[verify-claude-native-binaries] Claude Code 原生二进制检查通过。");
