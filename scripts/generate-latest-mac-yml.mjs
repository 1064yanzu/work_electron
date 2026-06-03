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
			// 渐进发布：某架构 zip 尚未就绪时跳过并告警（而非中断），
			// 以便先发布已就绪的架构；待该架构 zip 到位后重跑即可合并为双架构。
			console.warn(
				`[generate-latest-mac-yml] ⚠️ 缺少 ${arch} zip，已跳过该架构：${releaseDir}`,
			);
			continue;
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

	if (entries.length === 0) {
		console.error(
			`[generate-latest-mac-yml] 未找到任何架构的 zip：${releaseDir}`,
		);
		process.exit(1);
	}

	const primary = entries.find((entry) => entry.arch === "x64") ?? entries[0];
	const releaseDate = new Date(
		Math.max(...entries.map((entry) => entry.mtimeMs)),
	).toISOString();

	// GitHub Release 上传 asset 时会把文件名里的空格规范化为点（"IPO Workbench-..." → "IPO.Workbench-..."）。
	// electron-updater 用 latest-mac.yml 的 url 逐字符拼接下载地址并匹配 asset 名，
	// 因此 url/path 必须与 GitHub 上的实际 asset 名一致——统一用点名，否则自动更新 404。
	const toAssetName = (name) => name.replace(/ /g, ".");

	const lines = [
		`version: ${version}`,
		"files:",
		...entries.flatMap((entry) => [
			`  - url: ${toAssetName(entry.name)}`,
			`    sha512: ${entry.sha512}`,
			`    size: ${entry.size}`,
		]),
		`path: ${toAssetName(primary.name)}`,
		`sha512: ${primary.sha512}`,
		`releaseDate: '${releaseDate}'`,
		"",
	];

	const outputPath = path.join(releaseDir, "latest-mac.yml");
	fs.writeFileSync(outputPath, lines.join("\n"));
	console.log(`[generate-latest-mac-yml] 已生成 ${outputPath}`);
}

main();
