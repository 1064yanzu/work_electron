/**
 * IP 形象资产预处理脚本
 *
 * 输入:/Volumes/external disk/develop/IP设计/交付物/{效率引擎版,云端助理版,摸鱼生活版}
 * 输出:src/assets/mascots/{efficiency,cloud,leisure}/{slot}.png
 *
 * 处理:
 *   1) 效率引擎版整板 → 按 grid 切割
 *   2) 云端/摸鱼版直接读单张
 *   3) 白底 → 透明(RGB > 245 的像素 alpha 设为 0)
 *   4) 缩放短边到 1024
 *   5) 输出 PNG
 *
 * 运行:npx tsx scripts/build-mascots.ts
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SOURCE_ROOT =
	"/Volumes/external disk/develop/IP设计/交付物";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUT_ROOT = path.join(PROJECT_ROOT, "src/assets/mascots");

const TARGET_SHORT = 1024;
const WHITE_THRESHOLD = 240; // 大于此值的 RGB 视为白底

type SlotName =
	| "hero"
	| "emotion-happy"
	| "emotion-thinking"
	| "emotion-focus"
	| "emotion-surprise"
	| "emotion-sad"
	| "emotion-sleepy"
	| "state-greet"
	| "state-organize"
	| "state-remind"
	| "state-done"
	| "empty-404"
	| "empty-no-data"
	| "empty-error"
	| "onboarding-1"
	| "onboarding-2"
	| "onboarding-3";

interface CropSource {
	type: "crop";
	file: string;
	cols: number;
	rows: number;
	index: number; // 0-based, 行优先
	padX?: number; // 单元内左右内缩比例 0~0.5
	padY?: number;
}

interface FullSource {
	type: "full";
	file: string;
}

type Source = CropSource | FullSource;

interface MascotPlan {
	id: "efficiency" | "cloud" | "leisure";
	srcDir: string;
	slots: Partial<Record<SlotName, Source>>;
}

// === 效率引擎版 ===
// 02-表情设定板.png:4×2 = 开心 / 疑惑 / 思考 / 专注 / 惊讶 / 委屈 / 得意 / 困倦
// 03-动作姿态设定板.png:3×2 = 挥手打招呼 / 低头思考 / 工作 / 展示完成 / 出错 / 空状态
// 05-空状态插画板.png:3×1 = 404 / 无数据 / 加载失败
// 06-onboarding引导插画板.png:3×1
const EFFICIENCY: MascotPlan = {
	id: "efficiency",
	srcDir: path.join(SOURCE_ROOT, "墨鱼君-效率引擎版/4K导出"),
	slots: {
		hero: {
			type: "crop",
			file: "01-标准形象三视图.png",
			cols: 3,
			rows: 1,
			index: 0,
			padX: 0.05,
		},
		"emotion-happy": {
			type: "crop",
			file: "02-表情设定板.png",
			cols: 4,
			rows: 2,
			index: 0,
		},
		"emotion-thinking": {
			type: "crop",
			file: "02-表情设定板.png",
			cols: 4,
			rows: 2,
			index: 2,
		},
		"emotion-focus": {
			type: "crop",
			file: "02-表情设定板.png",
			cols: 4,
			rows: 2,
			index: 3,
		},
		"emotion-surprise": {
			type: "crop",
			file: "02-表情设定板.png",
			cols: 4,
			rows: 2,
			index: 4,
		},
		"emotion-sad": {
			type: "crop",
			file: "02-表情设定板.png",
			cols: 4,
			rows: 2,
			index: 5,
		},
		"emotion-sleepy": {
			type: "crop",
			file: "02-表情设定板.png",
			cols: 4,
			rows: 2,
			index: 7,
		},
		"state-greet": {
			type: "crop",
			file: "03-动作姿态设定板.png",
			cols: 3,
			rows: 2,
			index: 0,
		},
		"state-organize": {
			type: "crop",
			file: "03-动作姿态设定板.png",
			cols: 3,
			rows: 2,
			index: 2,
		},
		"state-remind": {
			type: "crop",
			file: "03-动作姿态设定板.png",
			cols: 3,
			rows: 2,
			index: 3,
		},
		"state-done": {
			type: "crop",
			file: "03-动作姿态设定板.png",
			cols: 3,
			rows: 2,
			index: 5,
		},
		"empty-404": {
			type: "crop",
			file: "05-空状态插画板.png",
			cols: 3,
			rows: 1,
			index: 0,
		},
		"empty-no-data": {
			type: "crop",
			file: "05-空状态插画板.png",
			cols: 3,
			rows: 1,
			index: 1,
		},
		"empty-error": {
			type: "crop",
			file: "05-空状态插画板.png",
			cols: 3,
			rows: 1,
			index: 2,
		},
		"onboarding-1": {
			type: "crop",
			file: "06-onboarding引导插画板.png",
			cols: 3,
			rows: 1,
			index: 0,
		},
		"onboarding-2": {
			type: "crop",
			file: "06-onboarding引导插画板.png",
			cols: 3,
			rows: 1,
			index: 1,
		},
		"onboarding-3": {
			type: "crop",
			file: "06-onboarding引导插画板.png",
			cols: 3,
			rows: 1,
			index: 2,
		},
	},
};

// === 云端助理版(已拆单张)===
const CLOUD: MascotPlan = {
	id: "cloud",
	srcDir: path.join(SOURCE_ROOT, "墨鱼君-云端助理版"),
	slots: {
		hero: {
			type: "crop",
			file: "01-标准形象三视图.png",
			cols: 3,
			rows: 1,
			index: 0,
			padX: 0.05,
		},
		"emotion-happy": { type: "full", file: "表情包/01-开心.png" },
		"emotion-thinking": { type: "full", file: "表情包/02-思考.png" },
		"emotion-focus": { type: "full", file: "表情包/03-专注.png" },
		"emotion-surprise": { type: "full", file: "表情包/04-惊讶.png" },
		"emotion-sad": { type: "full", file: "表情包/05-委屈.png" },
		"emotion-sleepy": { type: "full", file: "表情包/06-困倦.png" },
		"state-greet": { type: "full", file: "状态图/01-打招呼.png" },
		"state-organize": { type: "full", file: "状态图/02-整理文档.png" },
		"state-remind": { type: "full", file: "状态图/03-发送提醒.png" },
		"state-done": { type: "full", file: "状态图/04-完成任务.png" },
		"empty-404": { type: "full", file: "空状态/01-404.png" },
		"empty-no-data": { type: "full", file: "空状态/02-无数据.png" },
		"empty-error": { type: "full", file: "空状态/03-加载失败.png" },
		"onboarding-1": {
			type: "crop",
			file: "03-onboarding引导插画板.png",
			cols: 3,
			rows: 1,
			index: 0,
		},
		"onboarding-2": {
			type: "crop",
			file: "03-onboarding引导插画板.png",
			cols: 3,
			rows: 1,
			index: 1,
		},
		"onboarding-3": {
			type: "crop",
			file: "03-onboarding引导插画板.png",
			cols: 3,
			rows: 1,
			index: 2,
		},
	},
};

// === 摸鱼生活版 ===
// 状态图映射:抱鱼待机→greet,带薪摸鱼→organize,快乐喝饮品→remind,裹毯休息→done(语义弱化,生活化处理)
// 表情:满足→focus(摸鱼版没有"专注",用满足代替)
const LEISURE: MascotPlan = {
	id: "leisure",
	srcDir: path.join(SOURCE_ROOT, "墨鱼君-摸鱼生活版"),
	slots: {
		hero: {
			type: "crop",
			file: "01-标准形象三视图.png",
			cols: 3,
			rows: 1,
			index: 0,
			padX: 0.05,
		},
		"emotion-happy": { type: "full", file: "表情包/01-开心.png" },
		"emotion-thinking": { type: "full", file: "表情包/02-发呆.png" },
		"emotion-focus": { type: "full", file: "表情包/04-满足.png" },
		"emotion-surprise": { type: "full", file: "表情包/05-惊讶.png" },
		"emotion-sad": { type: "full", file: "表情包/06-委屈.png" },
		"emotion-sleepy": { type: "full", file: "表情包/03-困倦.png" },
		"state-greet": { type: "full", file: "状态图/01-抱鱼待机.png" },
		"state-organize": { type: "full", file: "状态图/04-带薪摸鱼.png" },
		"state-remind": { type: "full", file: "状态图/02-快乐喝饮品.png" },
		"state-done": { type: "full", file: "状态图/03-裹毯休息.png" },
		"empty-404": { type: "full", file: "空状态/01-404.png" },
		"empty-no-data": { type: "full", file: "空状态/02-无数据.png" },
		"empty-error": { type: "full", file: "空状态/03-加载失败.png" },
		"onboarding-1": {
			type: "crop",
			file: "03-onboarding引导插画板.png",
			cols: 3,
			rows: 1,
			index: 0,
		},
		"onboarding-2": {
			type: "crop",
			file: "03-onboarding引导插画板.png",
			cols: 3,
			rows: 1,
			index: 1,
		},
		"onboarding-3": {
			type: "crop",
			file: "03-onboarding引导插画板.png",
			cols: 3,
			rows: 1,
			index: 2,
		},
	},
};

const ALL_PLANS: MascotPlan[] = [EFFICIENCY, CLOUD, LEISURE];

/** 把白底像素的 alpha 设为 0,边缘做线性渐变 */
async function transparentizeWhite(buf: Buffer): Promise<Buffer> {
	const { data, info } = await sharp(buf)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const { width, height, channels } = info;
	const out = Buffer.from(data);
	for (let i = 0; i < out.length; i += channels) {
		const r = out[i];
		const g = out[i + 1];
		const b = out[i + 2];
		const minRGB = Math.min(r, g, b);
		// 接近纯白 → 全透
		if (minRGB >= 250) {
			out[i + 3] = 0;
			continue;
		}
		// 240-250 之间做 alpha 渐变,避免锯齿
		if (minRGB >= WHITE_THRESHOLD) {
			const t = (minRGB - WHITE_THRESHOLD) / (250 - WHITE_THRESHOLD);
			out[i + 3] = Math.max(0, Math.round(255 * (1 - t)));
		}
	}
	return await sharp(out, { raw: { width, height, channels } })
		.png({
			compressionLevel: 9,
			palette: true,
			quality: 80,
			effort: 10,
		})
		.toBuffer();
}

async function processSource(plan: MascotPlan, slot: SlotName, src: Source) {
	const fullPath = path.join(plan.srcDir, src.file);
	const exists = await fs
		.access(fullPath)
		.then(() => true)
		.catch(() => false);
	if (!exists) {
		console.warn(`  ⚠ ${plan.id}/${slot}: 源文件不存在 ${src.file},跳过`);
		return null;
	}
	let imgBuf: Buffer;
	if (src.type === "full") {
		imgBuf = await fs.readFile(fullPath);
	} else {
		// crop
		const meta = await sharp(fullPath).metadata();
		const W = meta.width!;
		const H = meta.height!;
		const cellW = W / src.cols;
		const cellH = H / src.rows;
		const col = src.index % src.cols;
		const row = Math.floor(src.index / src.cols);
		const padX = src.padX ?? 0;
		const padY = src.padY ?? 0;
		const left = Math.round(cellW * (col + padX));
		const top = Math.round(cellH * (row + padY));
		const cropW = Math.round(cellW * (1 - 2 * padX));
		const cropH = Math.round(cellH * (1 - 2 * padY));
		imgBuf = await sharp(fullPath)
			.extract({ left, top, width: cropW, height: cropH })
			.toBuffer();
	}
	// 缩放
	const meta = await sharp(imgBuf).metadata();
	const w = meta.width!;
	const h = meta.height!;
	const scale = TARGET_SHORT / Math.min(w, h);
	if (scale < 1) {
		imgBuf = await sharp(imgBuf)
			.resize({
				width: Math.round(w * scale),
				height: Math.round(h * scale),
				fit: "inside",
			})
			.toBuffer();
	}
	// 去白底
	const finalBuf = await transparentizeWhite(imgBuf);
	const outPath = path.join(OUT_ROOT, plan.id, `${slot}.png`);
	await fs.mkdir(path.dirname(outPath), { recursive: true });
	await fs.writeFile(outPath, finalBuf);
	const sizeKB = Math.round(finalBuf.length / 1024);
	console.log(`  ✓ ${plan.id}/${slot}.png (${sizeKB} KB)`);
	return outPath;
}

async function main() {
	console.log(`资产预处理开始`);
	console.log(`  输入:${SOURCE_ROOT}`);
	console.log(`  输出:${OUT_ROOT}\n`);

	let totalBytes = 0;
	let count = 0;

	for (const plan of ALL_PLANS) {
		console.log(`▶ ${plan.id}`);
		for (const [slot, src] of Object.entries(plan.slots)) {
			if (!src) continue;
			const out = await processSource(plan, slot as SlotName, src);
			if (out) {
				const stat = await fs.stat(out);
				totalBytes += stat.size;
				count++;
			}
		}
		console.log("");
	}

	console.log(
		`完成。共 ${count} 张图,合计 ${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
