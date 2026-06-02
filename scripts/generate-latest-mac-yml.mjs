import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ARCHES = ["x64", "arm64"];

function readPackageJson() {
	return JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
}

function sha512Base64(filePath) {
	const hash = crypto.createHash("sha512");
	hash.update(fs.readFileSync(filePath));
	return hash.digest("base64");
}

function findZip(releaseDir, productName, version, arch) {
	const expected = `${productName}-${version}-${arch}-Mac.zip`;
	const expectedPath = path.join(releaseDir, expected);
	if (fs.existsSync(expectedPath)) return expectedPath;

	const fallback = fs
		.readdirSync(releaseDir)
		.find((name) => name.endsWith(`-${arch}-Mac.zip`));
	return fallback ? path.join(releaseDir, fallback) : null;
}

function main() {
	const { version, build } = readPackageJson();
	const productName = build?.productName ?? "IPO Workbench";
	const releaseDir = path.join(process.cwd(), "release", version);
	const entries = [];

	for (const arch of ARCHES) {
		const zipPath = findZip(releaseDir, productName, version, arch);
		if (!zipPath) {
			console.error(`[generate-latest-mac-yml] 缺少 ${arch} zip：${releaseDir}`);
			process.exit(1);
		}
		const stat = fs.statSync(zipPath);
		entries.push({
			arch,
			name: path.basename(zipPath),
			sha512: sha512Base64(zipPath),
			size: stat.size,
			mtimeMs: stat.mtimeMs,
		});
	}

	const primary = entries.find((entry) => entry.arch === "x64") ?? entries[0];
	const releaseDate = new Date(
		Math.max(...entries.map((entry) => entry.mtimeMs)),
	).toISOString();

	const lines = [
		`version: ${version}`,
		"files:",
		...entries.flatMap((entry) => [
			`  - url: ${entry.name}`,
			`    sha512: ${entry.sha512}`,
			`    size: ${entry.size}`,
		]),
		`path: ${primary.name}`,
		`sha512: ${primary.sha512}`,
		`releaseDate: '${releaseDate}'`,
		"",
	];

	const outputPath = path.join(releaseDir, "latest-mac.yml");
	fs.writeFileSync(outputPath, lines.join("\n"));
	console.log(`[generate-latest-mac-yml] 已生成 ${outputPath}`);
}

main();
