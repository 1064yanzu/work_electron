/**
 * CustomMascotService — 自定义桌宠的导入 / 列表 / 删除 / 编辑
 *
 * 兼容三种来源：
 *   1. 我们自己的 zip 包：pet.json + 17 个 PNG slot + 可选 atlas.webp / loading.mp4
 *   2. codex 简化包（~/.codex/pets/<id>/）：pet.json (id/displayName/description/spritesheetPath) + spritesheet.webp
 *   3. codex runs 目录（hatch-pet/runs/<id>/）：pet_request.json (含 atlas) + final/spritesheet.webp
 *      + 可选 frames/<state>/00.png + qa/videos/idle.mp4
 *
 * 导入策略：
 *   - schema 极宽松：只要找得到 spritesheet 或 hero 之一即可
 *   - 缺失字段自动派生：
 *     · hero.png 缺失 → 用 sharp 从 spritesheet 切第 0 帧
 *     · accentColor 缺失 → 用 sharp 取 spritesheet 中位色
 *     · label 缺失 → fallback 到 id
 *   - 写盘时统一标准化为 schemaVersion: 1
 *   - 保留 atlas 元数据（cell/cols/rows/rows[]）以便渲染层精确切片
 *
 * 数据流向：
 *   用户上传 zip 或目录
 *     → 复制/解压到临时目录
 *     → 校验 + 派生（hero / accentColor / atlas 元数据）
 *     → sanitize id → 冲突自动 -2/-3 后缀
 *     → 原子 rename 到 userData/custom-mascots/<id>
 *     → 更新 index.json → 广播 mascot-list-changed
 *
 * 索引文件 custom-mascots/index.json 是性能优化，启动时会做健康检查。
 */

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { app, type BrowserWindow } from "electron";
import StreamZip from "node-stream-zip";
import { z } from "zod";
import type { CustomMascotMeta } from "../../shared/ipc-schema";
import { createLogger } from "../logging/logger";

// ── sharp 懒加载（避免 Windows 二进制缺失时在 crash handler 注册前崩溃）──
import type sharpDefault from "sharp";
type SharpConstructor = typeof sharpDefault;
let _sharpFn: SharpConstructor | null = null;
async function getSharp(): Promise<SharpConstructor> {
  if (!_sharpFn) {
    // sharp 使用 export=，动态 import 在 esModuleInterop 下会包裹 .default
    const mod = await import("sharp");
    _sharpFn =
      (mod as unknown as { default: SharpConstructor }).default ??
      (mod as unknown as SharpConstructor);
  }
  return _sharpFn;
}

// ── 常量 ──

const MAX_PACK_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_DIR_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB（目录导入放宽到 200MB）

const ALLOWED_SLOTS = new Set<string>([
  "hero",
  "emotion-happy",
  "emotion-thinking",
  "emotion-focus",
  "emotion-surprise",
  "emotion-sad",
  "emotion-sleepy",
  "state-greet",
  "state-organize",
  "state-remind",
  "state-done",
  "empty-404",
  "empty-no-data",
  "empty-error",
  "onboarding-1",
  "onboarding-2",
  "onboarding-3",
]);

/**
 * 宽松 schema：兼容自家格式 + codex 简化包 + codex runs。
 * 字段除了 id 强约束外，其余都允许缺失，导入流程会派生默认值。
 */
const PET_JSON_SCHEMA = z
  .object({
    schemaVersion: z.number().optional(),
    // 自家字段
    id: z.string().min(1).max(64).optional(),
    label: z.string().min(1).max(80).optional(),
    tagline: z.string().min(1).max(160).optional(),
    personality: z.string().max(800).optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "accentColor 必须是 #RRGGBB")
      .optional(),
    createdAt: z.string().optional(),
    assets: z
      .object({
        slots: z.array(z.string()).optional(),
        atlas: z.boolean().optional(),
        loading: z.boolean().optional(),
      })
      .optional(),
    // codex 简化包字段
    displayName: z.string().optional(),
    description: z.string().optional(),
    spritesheetPath: z.string().optional(),
    // codex pet_request.json 字段
    pet_id: z.string().optional(),
    display_name: z.string().optional(),
    atlas: z
      .object({
        columns: z.number(),
        rows: z.number(),
        cell_width: z.number(),
        cell_height: z.number(),
        width: z.number().optional(),
        height: z.number().optional(),
      })
      .optional(),
    rows: z
      .array(
        z.object({
          state: z.string(),
          row: z.number(),
          frames: z.number(),
        }),
      )
      .optional(),
  })
  .passthrough();

type PetJsonRaw = z.infer<typeof PET_JSON_SCHEMA>;

/** 持久化在 index.json / pet.json 里的 atlas 网格信息，渲染层据此切帧 */
export interface AtlasGridInfo {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  width: number;
  height: number;
  rowMap?: Array<{ state: string; row: number; frames: number }>;
}

// ── 路径辅助 ──

export function getCustomMascotsRootDir(): string {
  return path.join(app.getPath("userData"), "custom-mascots");
}

function getIndexPath(): string {
  return path.join(getCustomMascotsRootDir(), "index.json");
}

function getMascotDir(id: string): string {
  return path.join(getCustomMascotsRootDir(), id);
}

async function ensureRootDir(): Promise<void> {
  await fs.mkdir(getCustomMascotsRootDir(), { recursive: true });
}

// ── id 处理 ──

function sanitizeId(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return cleaned || `pet-${Date.now().toString(36)}`;
}

async function resolveAvailableId(preferredId: string): Promise<string> {
  const root = getCustomMascotsRootDir();
  let candidate = preferredId;
  let suffix = 2;
  while (true) {
    const dir = path.join(root, candidate);
    try {
      await fs.access(dir);
      candidate = `${preferredId}-${suffix++}`;
      if (suffix > 99) {
        candidate = `${preferredId}-${randomBytes(3).toString("hex")}`;
        break;
      }
    } catch {
      return candidate;
    }
  }
  return candidate;
}

// ── 索引（index.json）维护 ──

interface IndexFileShape {
  schemaVersion: 1;
  mascots: CustomMascotMeta[];
}

const EMPTY_INDEX: IndexFileShape = { schemaVersion: 1, mascots: [] };

async function readIndex(): Promise<IndexFileShape> {
  try {
    const raw = await fs.readFile(getIndexPath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.mascots)) {
      return parsed as IndexFileShape;
    }
  } catch {
    // 不存在或异常 → 视为空索引
  }
  return { ...EMPTY_INDEX, mascots: [] };
}

async function writeIndex(index: IndexFileShape): Promise<void> {
  await ensureRootDir();
  await fs.writeFile(getIndexPath(), JSON.stringify(index, null, 2), "utf-8");
}

/** 启动时调用：移除指向不存在目录的索引条目，补齐磁盘上有但索引漏的 */
export async function reconcileCustomMascotIndex(): Promise<
  CustomMascotMeta[]
> {
  await ensureRootDir();
  const index = await readIndex();
  const root = getCustomMascotsRootDir();
  const dirEntries = await fs.readdir(root, { withFileTypes: true });
  const diskIds = new Set(
    dirEntries
      .filter((e) => e.isDirectory() && /^[a-z0-9-]+$/.test(e.name))
      .map((e) => e.name),
  );
  const indexedIds = new Set(index.mascots.map((m) => m.id));

  let mascots = index.mascots.filter((m) => diskIds.has(m.id));

  for (const id of diskIds) {
    if (indexedIds.has(id)) continue;
    const meta = await tryLoadMetaFromDisk(id);
    if (meta) mascots.push(meta);
  }

  const next: IndexFileShape = { schemaVersion: 1, mascots };
  if (
    mascots.length !== index.mascots.length ||
    mascots.some((m, i) => m.id !== index.mascots[i]?.id)
  ) {
    await writeIndex(next);
  }
  return mascots;
}

async function tryLoadMetaFromDisk(
  id: string,
): Promise<CustomMascotMeta | null> {
  const dir = getMascotDir(id);
  try {
    const petJsonPath = path.join(dir, "pet.json");
    const raw = await fs.readFile(petJsonPath, "utf-8");
    const parsed = PET_JSON_SCHEMA.parse(JSON.parse(raw));
    const present = await listPresentSlots(dir);
    const hasAtlas = await fileExists(path.join(dir, "atlas.webp"));
    const hasLoading = await fileExists(path.join(dir, "loading.mp4"));
    const hasSpritesheetWebp = await fileExists(
      path.join(dir, "spritesheet.webp"),
    );
    const hasSpritesheetPng = await fileExists(
      path.join(dir, "spritesheet.png"),
    );
    const hasSpritesheet = hasSpritesheetWebp || hasSpritesheetPng;
    const spritesheetExt = hasSpritesheetWebp
      ? "webp"
      : hasSpritesheetPng
        ? "png"
        : undefined;
    return {
      id,
      label: pickLabel(parsed, id),
      tagline: pickTagline(parsed),
      personality: pickPersonality(parsed),
      accentColor: parsed.accentColor ?? "#D96C46",
      isBuiltin: false,
      version: parsed.schemaVersion ?? 1,
      createdAt: parsed.createdAt,
      hasAtlas,
      hasLoading,
      hasSpritesheet,
      spritesheetExt,
      slots: present,
      atlas: extractAtlasInfo(parsed),
    };
  } catch {
    return null;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function listPresentSlots(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    const result: string[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".png")) continue;
      const slot = entry.slice(0, -4);
      if (ALLOWED_SLOTS.has(slot)) result.push(slot);
    }
    return result;
  } catch {
    return [];
  }
}

// ── 字段派生 ──

function pickLabel(parsed: PetJsonRaw, fallbackId: string): string {
  const candidate =
    parsed.label ?? parsed.displayName ?? parsed.display_name ?? fallbackId;
  return String(candidate).slice(0, 80) || fallbackId;
}

function pickTagline(parsed: PetJsonRaw): string {
  if (parsed.tagline) return String(parsed.tagline).slice(0, 160);
  if (parsed.description) return String(parsed.description).slice(0, 160);
  return "自定义桌宠";
}

function pickPersonality(parsed: PetJsonRaw): string {
  if (parsed.personality) return String(parsed.personality).slice(0, 800);
  if (parsed.description) return String(parsed.description).slice(0, 800);
  return "";
}

function extractAtlasInfo(parsed: PetJsonRaw): AtlasGridInfo | undefined {
  if (!parsed.atlas) return undefined;
  const info: AtlasGridInfo = {
    columns: parsed.atlas.columns,
    rows: parsed.atlas.rows,
    cellWidth: parsed.atlas.cell_width,
    cellHeight: parsed.atlas.cell_height,
    width: parsed.atlas.width ?? parsed.atlas.columns * parsed.atlas.cell_width,
    height: parsed.atlas.height ?? parsed.atlas.rows * parsed.atlas.cell_height,
  };
  if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
    info.rowMap = parsed.rows.map((r) => ({
      state: r.state,
      row: r.row,
      frames: r.frames,
    }));
  }
  return info;
}

/** sharp 取图像中位色 → #RRGGBB；失败返回 null */
async function deriveAccentColorFromImage(
  filePath: string,
): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
    // 缩成 16x16 后求近似中位色：avg R/G/B 在 alpha>200 的像素上
    const sharp = await getSharp();
    const { data, info } = await sharp(filePath)
      .resize(16, 16, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let i = 0; i < data.length; i += channels) {
      const a = channels === 4 ? data[i + 3] : 255;
      if (a < 200) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    if (n === 0) return null;
    r = Math.round(r / n);
    g = Math.round(g / n);
    b = Math.round(b / n);
    const hex = (v: number) => v.toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch {
    return null;
  }
}

/** 从 spritesheet 切第 0 帧（或左上角 cell）保存为 hero.png */
async function deriveHeroFromSpritesheet(
  spritesheetPath: string,
  atlas: AtlasGridInfo | null,
  destPath: string,
): Promise<boolean> {
  try {
    let cellW: number;
    let cellH: number;
    if (atlas) {
      cellW = atlas.cellWidth;
      cellH = atlas.cellHeight;
    } else {
      // 没有 atlas 信息：尝试默认 hatch-pet 标准 192x208，否则取整张图缩到 256x256
      const sharp = await getSharp();
      const meta = await sharp(spritesheetPath).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w >= 192 && h >= 208 && w % 192 === 0 && h % 208 === 0) {
        cellW = 192;
        cellH = 208;
      } else {
        // 不像网格：直接整图缩 256
        await sharp(spritesheetPath)
          .resize(256, 256, { fit: "inside" })
          .png({ compressionLevel: 9 })
          .toFile(destPath);
        return true;
      }
    }
    const sharp = await getSharp();
    await sharp(spritesheetPath)
      .extract({ left: 0, top: 0, width: cellW, height: cellH })
      .resize(256, 256, { fit: "inside" })
      .png({ compressionLevel: 9 })
      .toFile(destPath);
    return true;
  } catch {
    return false;
  }
}

// ── 解压 / 校验 ──

interface ExtractResult {
  tmpDir: string; // 标准化后的 staging（直接 rename 到 target 即可）
  finalPetJson: NormalizedPetJson;
  hasAtlas: boolean;
  hasLoading: boolean;
  hasSpritesheet: boolean;
  spritesheetExt?: "webp" | "png";
  presentSlots: string[];
}

interface NormalizedPetJson {
  schemaVersion: 1;
  id: string;
  label: string;
  tagline: string;
  personality: string;
  accentColor: string;
  createdAt?: string;
  atlas?: AtlasGridInfo;
}

function isUnsafePath(rel: string): boolean {
  if (!rel) return true;
  if (path.isAbsolute(rel)) return true;
  const norm = path.normalize(rel).replace(/\\/g, "/");
  if (norm.startsWith("..") || norm.includes("/../") || norm === "..")
    return true;
  if (/^[a-zA-Z]:/.test(norm)) return true;
  return false;
}

async function extractZipToTmp(zipPath: string): Promise<string> {
  const stat = await fs.stat(zipPath);
  if (stat.size > MAX_PACK_SIZE_BYTES) {
    throw new Error(
      `压缩包过大（${(stat.size / 1024 / 1024).toFixed(1)} MB > 50 MB 上限）`,
    );
  }
  const tmpDir = await fs.mkdtemp(path.join(tmpdir(), "custom-mascot-"));
  const zip = new StreamZip.async({ file: zipPath });
  try {
    const entries = await zip.entries();
    for (const name of Object.keys(entries)) {
      if (isUnsafePath(name)) {
        throw new Error(`压缩包包含不安全的路径：${name}`);
      }
    }
    await zip.extract(null, tmpDir);
  } finally {
    await zip.close();
  }
  return tmpDir;
}

async function copyDirToTmp(srcDir: string): Promise<string> {
  const stat = await fs.stat(srcDir);
  if (!stat.isDirectory()) {
    throw new Error("不是目录");
  }
  // 大小检查（递归累加，防止误选超大目录）
  const totalSize = await getDirTotalSize(srcDir);
  if (totalSize > MAX_DIR_SIZE_BYTES) {
    throw new Error(
      `目录过大（${(totalSize / 1024 / 1024).toFixed(1)} MB > 200 MB 上限）`,
    );
  }
  const tmpDir = await fs.mkdtemp(path.join(tmpdir(), "custom-mascot-"));
  // 浅拷贝：只把直接相关的文件搬过来（不递归无关大目录）
  await copyAnyMascotInputs(srcDir, tmpDir);
  return tmpDir;
}

async function getDirTotalSize(dir: string, depth = 0): Promise<number> {
  if (depth > 6) return 0;
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isFile()) {
      try {
        const s = await fs.stat(full);
        total += s.size;
      } catch {
        // noop
      }
    } else if (ent.isDirectory()) {
      total += await getDirTotalSize(full, depth + 1);
      if (total > MAX_DIR_SIZE_BYTES) break;
    }
  }
  return total;
}

/**
 * 把目录里跟桌宠相关的文件统一复制到 tmp 下：
 * - 顶层 / 一级子目录的 pet.json / pet_request.json
 * - 顶层 / final/ 下的 spritesheet.webp / spritesheet.png
 * - 顶层的 hero.png / atlas.webp / loading.mp4 / 任意白名单 PNG slot
 * - frames/<state>/00.png 取到顶层（如果用户没有自家 PNG slot 时备用）
 * - qa/videos/idle.mp4 / loading.mp4 → loading.mp4
 */
async function copyAnyMascotInputs(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });

  // 1. pet.json：自家 / codex 简化包根目录
  const tryPetJsonAt = async (p: string) => {
    if (await fileExists(p)) {
      await fs.copyFile(p, path.join(dest, "pet.json"));
      return true;
    }
    return false;
  };
  const tryPetRequestAt = async (p: string) => {
    // pet_request.json 也接受为 pet.json 的替代
    if (await fileExists(p)) {
      await fs.copyFile(p, path.join(dest, "pet_request.json"));
      return true;
    }
    return false;
  };
  let foundJson = await tryPetJsonAt(path.join(src, "pet.json"));
  let foundRequest = await tryPetRequestAt(path.join(src, "pet_request.json"));

  // 2. 一级子目录搜：兼容 zip 多套一层或 runs 父目录传进来
  if (!foundJson && !foundRequest) {
    const subEntries = await fs.readdir(src, { withFileTypes: true });
    for (const ent of subEntries) {
      if (!ent.isDirectory()) continue;
      const sub = path.join(src, ent.name);
      if (await fileExists(path.join(sub, "pet.json"))) {
        await fs.copyFile(
          path.join(sub, "pet.json"),
          path.join(dest, "pet.json"),
        );
        foundJson = true;
        // 把这个子目录认作"实际根"，递归把它的资源也搬过来
        await copyAssetFiles(sub, dest);
        return;
      }
      if (await fileExists(path.join(sub, "pet_request.json"))) {
        await fs.copyFile(
          path.join(sub, "pet_request.json"),
          path.join(dest, "pet_request.json"),
        );
        foundRequest = true;
        await copyAssetFiles(sub, dest);
        return;
      }
    }
  }

  if (!foundJson && !foundRequest) {
    // 容忍：哪怕没有任何 json，也允许只导入一张 spritesheet（极简最小输入）
    await copyAssetFiles(src, dest);
    return;
  }
  await copyAssetFiles(src, dest);
}

async function copyAssetFiles(src: string, dest: string): Promise<void> {
  // 顶层 hero / atlas / loading / 白名单 PNG / spritesheet
  const topEntries = await fs
    .readdir(src, { withFileTypes: true })
    .catch(() => []);
  for (const ent of topEntries) {
    if (!ent.isFile()) continue;
    const name = ent.name;
    const full = path.join(src, name);
    const allowed =
      name === "spritesheet.webp" ||
      name === "spritesheet.png" ||
      name === "atlas.webp" ||
      name === "loading.mp4" ||
      (name.endsWith(".png") && ALLOWED_SLOTS.has(name.slice(0, -4)));
    if (allowed) {
      await fs.copyFile(full, path.join(dest, name));
    }
  }

  // final/spritesheet.* （codex runs 标准位置）
  const finalDir = path.join(src, "final");
  if (await dirExists(finalDir)) {
    for (const name of ["spritesheet.webp", "spritesheet.png"]) {
      const fp = path.join(finalDir, name);
      if (
        (await fileExists(fp)) &&
        !(await fileExists(path.join(dest, name)))
      ) {
        await fs.copyFile(fp, path.join(dest, name));
      }
    }
  }

  // qa/videos/idle.mp4 → loading.mp4 兜底
  const videosDir = path.join(src, "qa", "videos");
  if (
    (await dirExists(videosDir)) &&
    !(await fileExists(path.join(dest, "loading.mp4")))
  ) {
    const candidates = ["loading.mp4", "idle.mp4"];
    for (const name of candidates) {
      const fp = path.join(videosDir, name);
      if (await fileExists(fp)) {
        await fs.copyFile(fp, path.join(dest, "loading.mp4"));
        break;
      }
    }
  }

  // frames/<state>/00.png → 没有 hero.png 时 idle/00.png 兜底（仅当 dest 还没 hero）
  if (!(await fileExists(path.join(dest, "hero.png")))) {
    const framesDir = path.join(src, "frames");
    if (await dirExists(framesDir)) {
      const candidates = [
        path.join(framesDir, "idle", "00.png"),
        path.join(framesDir, "waving", "00.png"),
        path.join(framesDir, "running", "00.png"),
      ];
      for (const fp of candidates) {
        if (await fileExists(fp)) {
          await fs.copyFile(fp, path.join(dest, "hero.png"));
          break;
        }
      }
    }
  }
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

/** 标准化与派生：从 tmpDir 里读 pet.json / pet_request.json，补齐 hero / accent，落最终 pet.json */
async function normalizeAndDerive(tmpDir: string): Promise<ExtractResult> {
  // 1. 读 json
  const petJsonPath = path.join(tmpDir, "pet.json");
  const petRequestPath = path.join(tmpDir, "pet_request.json");
  let parsed: PetJsonRaw = {} as PetJsonRaw;
  const hasPetJson = await fileExists(petJsonPath);
  const hasPetRequest = await fileExists(petRequestPath);
  if (hasPetJson) {
    try {
      const raw = await fs.readFile(petJsonPath, "utf-8");
      parsed = PET_JSON_SCHEMA.parse(JSON.parse(raw));
    } catch (err) {
      throw new Error(
        `pet.json 解析失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  if (hasPetRequest) {
    // pet_request.json 仅作为补充元数据来源
    try {
      const raw = await fs.readFile(petRequestPath, "utf-8");
      const extra = PET_JSON_SCHEMA.parse(JSON.parse(raw));
      // merge：pet.json 优先，pet_request 提供 atlas / rows / 名称兜底
      parsed = {
        ...extra,
        ...parsed,
        atlas: parsed.atlas ?? extra.atlas,
        rows: parsed.rows ?? extra.rows,
        displayName: parsed.displayName ?? extra.displayName,
        display_name: parsed.display_name ?? extra.display_name,
        description: parsed.description ?? extra.description,
        pet_id: parsed.pet_id ?? extra.pet_id,
      };
    } catch {
      // noop —— pet_request.json 不强制
    }
    // 用完移除
    await fs.rm(petRequestPath).catch(() => {});
  }

  // 2. 派生 id
  const rawId =
    parsed.id ?? parsed.pet_id ?? parsed.displayName ?? parsed.display_name;
  if (!rawId) {
    throw new Error(
      "无法识别桌宠 id：pet.json / pet_request.json 缺少 id / displayName / pet_id",
    );
  }
  const id = sanitizeId(String(rawId));

  // 3. 资源探测
  const hasAtlas = await fileExists(path.join(tmpDir, "atlas.webp"));
  const hasLoading = await fileExists(path.join(tmpDir, "loading.mp4"));
  const hasSpritesheetWebp = await fileExists(
    path.join(tmpDir, "spritesheet.webp"),
  );
  const hasSpritesheetPng = await fileExists(
    path.join(tmpDir, "spritesheet.png"),
  );
  const hasSpritesheet = hasSpritesheetWebp || hasSpritesheetPng;
  const spritesheetExt: "webp" | "png" | undefined = hasSpritesheetWebp
    ? "webp"
    : hasSpritesheetPng
      ? "png"
      : undefined;
  const spritesheetPath = spritesheetExt
    ? path.join(tmpDir, `spritesheet.${spritesheetExt}`)
    : null;
  const hasHero = await fileExists(path.join(tmpDir, "hero.png"));

  // 4. hero 派生：缺失时从 spritesheet 切
  if (!hasHero && spritesheetPath) {
    const atlas = extractAtlasInfo(parsed) ?? null;
    const ok = await deriveHeroFromSpritesheet(
      spritesheetPath,
      atlas,
      path.join(tmpDir, "hero.png"),
    );
    if (!ok) {
      // 派生失败也允许通过：渲染层会用 label 首字母兜底
    }
  }

  // 校验：至少要有 hero.png 或 spritesheet
  const finalHasHero = await fileExists(path.join(tmpDir, "hero.png"));
  if (!finalHasHero && !hasSpritesheet) {
    throw new Error("缺少必备资源：需要 hero.png 或 spritesheet.(webp|png)");
  }

  // 5. accentColor 派生
  let accentColor = parsed.accentColor;
  if (!accentColor) {
    const sourceImage = finalHasHero
      ? path.join(tmpDir, "hero.png")
      : (spritesheetPath ?? "");
    if (sourceImage) {
      const derived = await deriveAccentColorFromImage(sourceImage);
      if (derived) accentColor = derived;
    }
  }
  if (!accentColor) accentColor = "#D96C46";

  // 6. 收集最终 PNG slot 列表（含派生的 hero）
  const presentSlots = await listPresentSlots(tmpDir);

  // 7. 写最终 pet.json（标准化 schemaVersion=1）
  const atlas = extractAtlasInfo(parsed);
  const finalPetJson: NormalizedPetJson = {
    schemaVersion: 1,
    id,
    label: pickLabel(parsed, id),
    tagline: pickTagline(parsed),
    personality: pickPersonality(parsed),
    accentColor,
    createdAt: parsed.createdAt ?? new Date().toISOString(),
    atlas,
  };
  await fs.writeFile(
    petJsonPath,
    JSON.stringify(finalPetJson, null, 2),
    "utf-8",
  );

  // 8. 清掉无关文件（避免目录污染）
  await pruneUnknownFiles(tmpDir);

  return {
    tmpDir,
    finalPetJson,
    hasAtlas,
    hasLoading,
    hasSpritesheet,
    spritesheetExt,
    presentSlots,
  };
}

/** 仅保留白名单内的文件，其它（references/ frames/ 等）删除 */
async function pruneUnknownFiles(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await fs.rm(full, { recursive: true, force: true }).catch(() => {});
      continue;
    }
    const name = ent.name;
    const allowed =
      name === "pet.json" ||
      name === "atlas.webp" ||
      name === "loading.mp4" ||
      name === "spritesheet.webp" ||
      name === "spritesheet.png" ||
      (name.endsWith(".png") && ALLOWED_SLOTS.has(name.slice(0, -4)));
    if (!allowed) {
      await fs.rm(full).catch(() => {});
    }
  }
}

async function rmrf(p: string): Promise<void> {
  try {
    await fs.rm(p, { recursive: true, force: true });
  } catch {
    // noop
  }
}

// ── 列表 ──

export async function listCustomMascots(): Promise<CustomMascotMeta[]> {
  await ensureRootDir();
  const index = await readIndex();
  return index.mascots;
}

// ── 导入 ──

export interface ImportProgressEvent {
  phase: "validating" | "extracting" | "writing" | "done";
  percent: number;
  message?: string;
}

export interface ImportOptions {
  onProgress?: (e: ImportProgressEvent) => void;
}

export interface ImportResult {
  mascot: CustomMascotMeta;
  finalId: string;
  renamed: boolean;
}

async function commonImportFromTmp(
  stagedTmpDir: string,
  requestedRawId: string,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const logger = createLogger();
  const emit = (
    phase: ImportProgressEvent["phase"],
    percent: number,
    message?: string,
  ) => opts.onProgress?.({ phase, percent, message });
  emit("extracting", 50, "标准化中");

  const extracted = await normalizeAndDerive(stagedTmpDir);

  const requestedId = sanitizeId(requestedRawId || extracted.finalPetJson.id);
  const finalId = await resolveAvailableId(requestedId);
  const renamed = finalId !== extracted.finalPetJson.id;

  await ensureRootDir();
  const targetDir = getMascotDir(finalId);

  emit("writing", 75, "写入到 custom-mascots");

  // 把 tmpDir 整体搬到 .tmp-<rand>，再 rename 到 targetDir
  const stagedDir = path.join(
    getCustomMascotsRootDir(),
    `.tmp-${randomBytes(4).toString("hex")}`,
  );
  await rmrf(stagedDir);
  // 递归复制（normalize 后 tmpDir 已经只剩白名单）
  await fs.mkdir(stagedDir, { recursive: true });
  for (const entry of await fs.readdir(extracted.tmpDir, {
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    await fs.copyFile(
      path.join(extracted.tmpDir, entry.name),
      path.join(stagedDir, entry.name),
    );
  }

  if (renamed) {
    const updated: NormalizedPetJson = {
      ...extracted.finalPetJson,
      id: finalId,
    };
    await fs.writeFile(
      path.join(stagedDir, "pet.json"),
      JSON.stringify(updated, null, 2),
      "utf-8",
    );
  }

  await rmrf(targetDir);
  await fs.rename(stagedDir, targetDir);

  const meta: CustomMascotMeta = {
    id: finalId,
    label: extracted.finalPetJson.label,
    tagline: extracted.finalPetJson.tagline,
    personality: extracted.finalPetJson.personality,
    accentColor: extracted.finalPetJson.accentColor,
    isBuiltin: false,
    version: 1,
    createdAt: extracted.finalPetJson.createdAt,
    hasAtlas: extracted.hasAtlas,
    hasLoading: extracted.hasLoading,
    hasSpritesheet: extracted.hasSpritesheet,
    spritesheetExt: extracted.spritesheetExt,
    slots: extracted.presentSlots,
    atlas: extracted.finalPetJson.atlas,
  };

  const index = await readIndex();
  const filtered = index.mascots.filter((m) => m.id !== finalId);
  filtered.push(meta);
  await writeIndex({ schemaVersion: 1, mascots: filtered });

  emit("done", 100, "导入完成");
  logger.info({
    msg: "Custom mascot imported",
    id: finalId,
    label: meta.label,
    renamed,
    hasSpritesheet: meta.hasSpritesheet,
    hasAtlas: meta.hasAtlas,
  });
  return { mascot: meta, finalId, renamed };
}

export async function importCustomMascotFromZip(
  zipPath: string,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const emit = (
    phase: ImportProgressEvent["phase"],
    percent: number,
    message?: string,
  ) => opts.onProgress?.({ phase, percent, message });
  emit("validating", 5, "校验压缩包");

  const tmpDir = await extractZipToTmp(zipPath);

  try {
    // zip 里可能套了一层根目录，让 copyAnyMascotInputs 帮忙拍平
    const flatTmp = await fs.mkdtemp(
      path.join(tmpdir(), "custom-mascot-flat-"),
    );
    await copyAnyMascotInputs(tmpDir, flatTmp);
    try {
      // 用 zip 文件名做兜底 id
      const fallbackId = path.basename(zipPath, path.extname(zipPath));
      return await commonImportFromTmp(flatTmp, fallbackId, opts);
    } finally {
      await rmrf(flatTmp);
    }
  } finally {
    await rmrf(tmpDir);
  }
}

export async function importCustomMascotFromDir(
  dirPath: string,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const emit = (
    phase: ImportProgressEvent["phase"],
    percent: number,
    message?: string,
  ) => opts.onProgress?.({ phase, percent, message });
  emit("validating", 5, "扫描目录");

  const tmpDir = await copyDirToTmp(dirPath);
  try {
    const fallbackId = path.basename(dirPath);
    return await commonImportFromTmp(tmpDir, fallbackId, opts);
  } finally {
    await rmrf(tmpDir);
  }
}

// ── 删除 ──

export async function deleteCustomMascot(id: string): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error("非法 id");
  }
  const dir = getMascotDir(id);
  await rmrf(dir);
  const index = await readIndex();
  const next = index.mascots.filter((m) => m.id !== id);
  await writeIndex({ schemaVersion: 1, mascots: next });
}

// ── 编辑 meta ──

export async function updateCustomMascotMeta(
  id: string,
  patch: Partial<
    Pick<CustomMascotMeta, "label" | "tagline" | "personality" | "accentColor">
  >,
): Promise<CustomMascotMeta> {
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error("非法 id");
  }
  const dir = getMascotDir(id);
  const petJsonPath = path.join(dir, "pet.json");
  const raw = await fs.readFile(petJsonPath, "utf-8");
  const parsed = PET_JSON_SCHEMA.parse(JSON.parse(raw));

  if (
    patch.accentColor !== undefined &&
    !/^#[0-9a-fA-F]{6}$/.test(patch.accentColor)
  ) {
    throw new Error("accentColor 必须是 #RRGGBB");
  }

  const next: NormalizedPetJson = {
    schemaVersion: 1,
    id,
    label: patch.label ?? pickLabel(parsed, id),
    tagline: patch.tagline ?? pickTagline(parsed),
    personality: patch.personality ?? pickPersonality(parsed),
    accentColor: patch.accentColor ?? parsed.accentColor ?? "#D96C46",
    createdAt: parsed.createdAt ?? new Date().toISOString(),
    atlas: extractAtlasInfo(parsed),
  };
  await fs.writeFile(petJsonPath, JSON.stringify(next, null, 2), "utf-8");

  // 更新索引
  const fresh = await tryLoadMetaFromDisk(id);
  if (!fresh) throw new Error("自定义桌宠不存在");
  const index = await readIndex();
  const idx = index.mascots.findIndex((m) => m.id === id);
  if (idx === -1) {
    index.mascots.push(fresh);
  } else {
    index.mascots[idx] = fresh;
  }
  await writeIndex(index);
  return fresh;
}

// ── 单个资源路径（备用） ──

export function getCustomMascotAssetPath(
  id: string,
  slot: string,
): string | null {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  if (slot === "atlas") return path.join(getMascotDir(id), "atlas.webp");
  if (slot === "loading") return path.join(getMascotDir(id), "loading.mp4");
  if (slot === "spritesheet") {
    return path.join(getMascotDir(id), "spritesheet.webp");
  }
  if (!ALLOWED_SLOTS.has(slot)) return null;
  return path.join(getMascotDir(id), `${slot}.png`);
}

// ── 广播 ──

export function broadcastMascotListChanged(
  getWindows: () => BrowserWindow[],
  mascots: CustomMascotMeta[],
): void {
  for (const win of getWindows()) {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send("mascot-list-changed", { mascots });
      }
    } catch {
      // noop
    }
  }
}
