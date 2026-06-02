import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const ARCH_ALIASES = {
	x64: "x86_64",
	arm64: "arm64",
};

function parseArg(name) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((item) => item.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : null;
}

function readPackageJson() {
	return JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
}

function defaultAppPath(targetArch) {
	const { version, build } = readPackageJson();
	const productName = build?.productName ?? "IPO Workbench";
	const appDir = targetArch === "arm64" ? "mac-arm64" : "mac";
	return path.join(
		process.cwd(),
		"release",
		version,
		appDir,
		`${productName}.app`,
	);
}

function listFiles(root) {
	const out = [];
	const entries = fs.readdirSync(root, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			out.push(...listFiles(fullPath));
			continue;
		}
		out.push(fullPath);
	}
	return out;
}

function fileOutput(filePath) {
	return execFileSync("file", [filePath], { encoding: "utf8" }).trim();
}

function requireExists(filePath, failures) {
	if (!fs.existsSync(filePath)) {
		failures.push(`缺少文件或目录：${filePath}`);
		return false;
	}
	return true;
}

function assertMachOArch(filePath, expectedArch, failures) {
	const output = fileOutput(filePath);
	if (!output.includes(expectedArch)) {
		failures.push(`架构不匹配：${filePath}\n  期望：${expectedArch}\n  实际：${output}`);
	}
}

function assertNoWrongDarwinPackages(nodeModulesPath, targetArch, failures) {
	const wrongArch = targetArch === "x64" ? "arm64" : "x64";
	const wrongPackageDirs = [
		path.join(
			nodeModulesPath,
			"@anthropic-ai",
			`claude-agent-sdk-darwin-${wrongArch}`,
		),
		path.join(nodeModulesPath, "@libsql", `darwin-${wrongArch}`),
		path.join(nodeModulesPath, "@img", `sharp-darwin-${wrongArch}`),
		path.join(nodeModulesPath, "@img", `sharp-libvips-darwin-${wrongArch}`),
	];

	for (const packagePath of wrongPackageDirs) {
		if (fs.existsSync(packagePath)) {
			failures.push(`包内混入错误平台依赖：${packagePath}`);
		}
	}
}

function assertRequiredPackages(nodeModulesPath, targetArch, failures) {
	const requiredDirs = [
		["Claude SDK", "@anthropic-ai", `claude-agent-sdk-darwin-${targetArch}`],
		["LibSQL", "@libsql", `darwin-${targetArch}`],
		["sharp", "@img", `sharp-darwin-${targetArch}`],
		["sharp libvips", "@img", `sharp-libvips-darwin-${targetArch}`],
	];

	for (const [label, scope, packageName] of requiredDirs) {
		const packagePath = path.join(nodeModulesPath, scope, packageName);
		if (!fs.existsSync(packagePath)) {
			failures.push(`${label} 缺少 ${packagePath}`);
		}
	}
}

function main() {
	const targetArch = parseArg("arch");
	const appPath = parseArg("app") ?? (targetArch ? defaultAppPath(targetArch) : null);

	if (!appPath || !targetArch || !ARCH_ALIASES[targetArch]) {
		console.error(
			"用法：node scripts/verify-mac-package-architectures.mjs --arch=x64|arm64 [--app=/path/IPO\\ Workbench.app]",
		);
		process.exit(1);
	}

	const failures = [];
	const expectedMachOArch = ARCH_ALIASES[targetArch];
	const executablePath = path.join(appPath, "Contents", "MacOS", "IPO Workbench");
	const nodeModulesPath = path.join(
		appPath,
		"Contents",
		"Resources",
		"app.asar.unpacked",
		"node_modules",
	);

	if (requireExists(executablePath, failures)) {
		assertMachOArch(executablePath, expectedMachOArch, failures);
	}

	if (requireExists(nodeModulesPath, failures)) {
		assertRequiredPackages(nodeModulesPath, targetArch, failures);
		assertNoWrongDarwinPackages(nodeModulesPath, targetArch, failures);
		const criticalNativeRoots = [
			path.join(nodeModulesPath, "@libsql", `darwin-${targetArch}`),
			path.join(nodeModulesPath, "@img", `sharp-darwin-${targetArch}`),
			path.join(nodeModulesPath, "@img", `sharp-libvips-darwin-${targetArch}`),
		];
		for (const root of criticalNativeRoots.filter((item) => fs.existsSync(item))) {
			for (const nativeFile of listFiles(root).filter((item) =>
				item.endsWith(".node") || item.endsWith(".dylib"),
			)) {
				assertMachOArch(nativeFile, expectedMachOArch, failures);
			}
		}
	}

	if (failures.length > 0) {
		console.error("[verify-mac-package-architectures] macOS 安装包架构检查失败：");
		for (const failure of failures) console.error(`- ${failure}`);
		console.error(
			"请在目标架构 macOS 环境构建对应安装包，或重新安装该架构的 optional native dependencies 后再打包。",
		);
		process.exit(1);
	}

	console.log(
		`[verify-mac-package-architectures] ${targetArch} macOS 安装包架构检查通过。`,
	);
}

main();
