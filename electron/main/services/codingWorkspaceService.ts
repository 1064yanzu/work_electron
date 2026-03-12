import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
	BackendCapabilityFlags,
	BackendCapabilityMatrix,
	CodingApprovalMode,
	CodingBackendId,
	CodingWorkspaceProfile,
	WorkspaceInstructionSource,
	WorkspaceMemoryReadResult,
	WorkspaceMemoryWriteInput,
	WorkspaceProfileUpdateInput,
} from "../../shared/coding-workspace";
import { findCodexBinary } from "./codexService";

const execFileAsync = promisify(execFile);

const WORKSPACE_DIR_PARTS = [".ipo", "ai-workspace"] as const;
const WORKSPACE_PROFILE_FILE = "profile.json";
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_CODEX_MODEL = "gpt-5-codex";
const DEFAULT_CODEX_MODEL_CATALOG = [
	"gpt-5-codex",
	"gpt-5",
	"o4-mini",
];
const MAX_INSTRUCTION_BYTES = 64 * 1024;
const MAX_DISCOVERY_DEPTH = 4;

interface PersistedWorkspaceProfile {
	defaultBackend?: CodingBackendId;
	defaultModel?: string;
	defaultApprovalMode?: CodingApprovalMode;
	memoryPolicy?: "manual" | "always";
	lastOpenedAt?: number;
	updatedAt?: number;
}

function getWorkspaceDir(projectPath: string): string {
	return path.join(projectPath, ...WORKSPACE_DIR_PARTS);
}

function getProjectName(projectPath: string): string {
	return path.basename(projectPath) || projectPath;
}

function createWorkspaceProfileId(projectPath: string): string {
	const normalized = path.resolve(projectPath);
	return Buffer.from(normalized).toString("base64url");
}

async function ensureDir(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true });
}

async function ensureFile(filePath: string): Promise<void> {
	try {
		await fs.access(filePath);
	} catch {
		await fs.writeFile(filePath, "", "utf-8");
	}
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
	try {
		const raw = await fs.readFile(filePath, "utf-8");
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
	await ensureDir(path.dirname(filePath));
	await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

async function readTextFile(filePath: string): Promise<string> {
	try {
		const content = await fs.readFile(filePath, "utf-8");
		return content.slice(0, MAX_INSTRUCTION_BYTES);
	} catch {
		return "";
	}
}

async function getMtime(filePath: string): Promise<number | undefined> {
	try {
		const stats = await fs.stat(filePath);
		return stats.mtimeMs;
	} catch {
		return undefined;
	}
}

async function listInstructionFiles(
	rootDir: string,
	kind: WorkspaceInstructionSource["kind"],
	labelPrefix: string,
	depth = 0,
): Promise<WorkspaceInstructionSource[]> {
	if (depth > MAX_DISCOVERY_DEPTH) return [];
	try {
		const entries = await fs.readdir(rootDir, { withFileTypes: true });
		const collected: WorkspaceInstructionSource[] = [];
		for (const entry of entries) {
			const fullPath = path.join(rootDir, entry.name);
			if (entry.isDirectory()) {
				collected.push(
					...(await listInstructionFiles(fullPath, kind, labelPrefix, depth + 1)),
				);
				continue;
			}
			collected.push({
				path: fullPath,
				label: `${labelPrefix}/${path.relative(rootDir, fullPath)}`,
				kind,
				updatedAt: await getMtime(fullPath),
			});
		}
		return collected;
	} catch {
		return [];
	}
}

async function collectRepoInstructionSources(projectPath: string): Promise<WorkspaceInstructionSource[]> {
	const singleFiles = [
		{ name: "AGENTS.md", label: "AGENTS.md" },
		{ name: "CLAUDE.md", label: "CLAUDE.md" },
		{ name: "CODEX.md", label: "CODEX.md" },
	];
	const sources: WorkspaceInstructionSource[] = [];
	for (const file of singleFiles) {
		const filePath = path.join(projectPath, file.name);
		try {
			await fs.access(filePath);
			sources.push({
				path: filePath,
				label: file.label,
				kind: "repo_instruction",
				updatedAt: await getMtime(filePath),
			});
		} catch {
			// ignore
		}
	}

	const claudeDir = path.join(projectPath, ".claude");
	const codexDir = path.join(projectPath, ".codex");
	sources.push(
		...(await listInstructionFiles(claudeDir, "repo_instruction", ".claude")),
		...(await listInstructionFiles(codexDir, "repo_instruction", ".codex")),
	);
	return sources.sort((a, b) => a.path.localeCompare(b.path));
}

async function ensureWorkspaceLayout(projectPath: string) {
	const workspaceDir = getWorkspaceDir(projectPath);
	const workspaceFile = path.join(workspaceDir, "workspace.md");
	const memoryFile = path.join(workspaceDir, "memory.md");
	const rulesFile = path.join(workspaceDir, "rules.md");
	const commandsDir = path.join(workspaceDir, "commands");
	const artifactsDir = path.join(workspaceDir, "artifacts");
	const profileFile = path.join(workspaceDir, WORKSPACE_PROFILE_FILE);

	await ensureDir(workspaceDir);
	await Promise.all([
		ensureFile(workspaceFile),
		ensureFile(memoryFile),
		ensureFile(rulesFile),
		ensureDir(commandsDir),
		ensureDir(artifactsDir),
	]);

	return {
		workspaceDir,
		workspaceFile,
		memoryFile,
		rulesFile,
		commandsDir,
		artifactsDir,
		profileFile,
	};
}

function getDefaultApprovalMode(backend: CodingBackendId): CodingApprovalMode {
	return backend === "codex" ? "on-request" : "acceptEdits";
}

function getDefaultModel(backend: CodingBackendId): string {
	return backend === "codex" ? DEFAULT_CODEX_MODEL : DEFAULT_CLAUDE_MODEL;
}

async function buildWorkspaceProfile(projectPath: string): Promise<CodingWorkspaceProfile> {
	const layout = await ensureWorkspaceLayout(projectPath);
	const persistedRaw = await readJsonFile<PersistedWorkspaceProfile>(layout.profileFile);
	const persisted = persistedRaw ?? {};
	const now = Date.now();
	const defaultBackend = persisted.defaultBackend ?? "claude-code";
	const profile: CodingWorkspaceProfile = {
		id: createWorkspaceProfileId(projectPath),
		projectPath,
		projectName: getProjectName(projectPath),
		workspaceDir: layout.workspaceDir,
		hasPersistedProfile: Boolean(persistedRaw),
		defaultBackend,
		defaultModel: persisted.defaultModel ?? getDefaultModel(defaultBackend),
		defaultApprovalMode:
			persisted.defaultApprovalMode ?? getDefaultApprovalMode(defaultBackend),
		lastOpenedAt: persisted.lastOpenedAt ?? now,
		updatedAt: persisted.updatedAt ?? now,
		memoryPolicy: persisted.memoryPolicy ?? "always",
		manifest: {
			workspaceFile: layout.workspaceFile,
			memoryFile: layout.memoryFile,
			rulesFile: layout.rulesFile,
			commandsDir: layout.commandsDir,
			artifactsDir: layout.artifactsDir,
			profileFile: layout.profileFile,
			sources: [],
		},
	};
	return profile;
}

async function persistWorkspaceProfile(profile: CodingWorkspaceProfile): Promise<void> {
	await writeJsonFile(profile.manifest.profileFile, {
		defaultBackend: profile.defaultBackend,
		defaultModel: profile.defaultModel,
		defaultApprovalMode: profile.defaultApprovalMode,
		memoryPolicy: profile.memoryPolicy,
		lastOpenedAt: profile.lastOpenedAt,
		updatedAt: profile.updatedAt,
	});
}

async function buildWorkspaceMemoryReadResult(projectPath: string): Promise<WorkspaceMemoryReadResult> {
	const profile = await buildWorkspaceProfile(projectPath);
	const repoSources = await collectRepoInstructionSources(projectPath);
	const workspaceSources: WorkspaceInstructionSource[] = [
		{
			path: profile.manifest.workspaceFile,
			label: "workspace.md",
			kind: "workspace_context",
			updatedAt: await getMtime(profile.manifest.workspaceFile),
		},
		{
			path: profile.manifest.rulesFile,
			label: "rules.md",
			kind: "workspace_rules",
			updatedAt: await getMtime(profile.manifest.rulesFile),
		},
		{
			path: profile.manifest.memoryFile,
			label: "memory.md",
			kind: "workspace_memory",
			updatedAt: await getMtime(profile.manifest.memoryFile),
		},
	];
	const sources = [...repoSources, ...workspaceSources];
	profile.manifest.sources = sources;

	const [workspace, rules, memory] = await Promise.all([
		readTextFile(profile.manifest.workspaceFile),
		readTextFile(profile.manifest.rulesFile),
		readTextFile(profile.manifest.memoryFile),
	]);
	const mergedSections: string[] = [];
	for (const source of repoSources) {
		const content = await readTextFile(source.path);
		if (!content.trim()) continue;
		mergedSections.push(`## ${source.label}\n${content}`);
	}
	if (workspace.trim()) mergedSections.push(`## workspace.md\n${workspace}`);
	if (rules.trim()) mergedSections.push(`## rules.md\n${rules}`);
	if (memory.trim()) mergedSections.push(`## memory.md\n${memory}`);

	profile.lastOpenedAt = Date.now();
	profile.updatedAt = Date.now();
	await persistWorkspaceProfile(profile);

	return {
		profile,
		workspace,
		memory,
		rules,
		mergedInstructions: mergedSections.join("\n\n").trim(),
		sources,
	};
}

async function runCommand(binary: string, args: string[]): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(binary, args, {
			timeout: 10000,
			maxBuffer: 1024 * 1024,
		});
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

async function detectClaudeCapabilityMatrix(): Promise<BackendCapabilityMatrix> {
	const binaryPath = (await runCommand("bash", ["-lc", "command -v claude || true"]))?.trim() || null;
	const version = binaryPath ? await runCommand(binaryPath, ["--version"]) : null;
	const capabilities: BackendCapabilityFlags = {
		resume: true,
		rewind: false,
		interactiveApproval: true,
		setModelWhileRunning: true,
		slashCommandSupport: true,
		workspaceMemory: true,
		toolEventGranularity: "granular",
	};
	return {
		backend: "claude-code",
		available: Boolean(binaryPath),
		binaryPath,
		version,
		detectedAt: Date.now(),
		capabilities,
		unsupportedReasons: {
			rewind: "当前 Claude Code CLI / SDK 未暴露可安全回退到历史转折点的运行时控制。",
		},
		defaultModel: DEFAULT_CLAUDE_MODEL,
		modelCatalog: ["claude-sonnet-4-6", "claude-opus-4-1", "claude-haiku-4-5"],
		error: binaryPath ? undefined : "未检测到 Claude Code CLI。",
	};
}

async function detectCodexCapabilityMatrix(): Promise<BackendCapabilityMatrix> {
	const binaryPath = findCodexBinary();
	const version = binaryPath ? await runCommand(binaryPath, ["--version"]) : null;
	const helpText = binaryPath ? await runCommand(binaryPath, ["exec", "--help"]) : null;
	const capabilities: BackendCapabilityFlags = {
		resume: Boolean(helpText?.includes("exec resume")),
		rewind: false,
		interactiveApproval: false,
		setModelWhileRunning: false,
		slashCommandSupport: true,
		workspaceMemory: true,
		toolEventGranularity: helpText?.includes("--json") ? "granular" : "coarse",
	};
	return {
		backend: "codex",
		available: Boolean(binaryPath),
		binaryPath,
		version,
		detectedAt: Date.now(),
		capabilities,
		unsupportedReasons: {
			interactiveApproval: "Codex CLI 通过 approval policy 预先配置权限，不支持逐条工具审批。",
			setModelWhileRunning: "Codex exec 运行中不支持在线切换模型。",
			rewind: "Codex CLI 当前没有暴露可供桌面端调用的 rewind 控制。",
		},
		defaultModel: DEFAULT_CODEX_MODEL,
		modelCatalog: DEFAULT_CODEX_MODEL_CATALOG,
		error: binaryPath ? undefined : "未检测到 Codex CLI。",
	};
}

export async function getBackendCapabilityMatrix(
	backend: CodingBackendId,
): Promise<BackendCapabilityMatrix> {
	if (backend === "codex") {
		return detectCodexCapabilityMatrix();
	}
	return detectClaudeCapabilityMatrix();
}

export async function getAllBackendCapabilityMatrices(): Promise<
	Record<CodingBackendId, BackendCapabilityMatrix>
> {
	const [claude, codex] = await Promise.all([
		detectClaudeCapabilityMatrix(),
		detectCodexCapabilityMatrix(),
	]);
	return {
		"claude-code": claude,
		codex,
	};
}

export async function getCodingWorkspaceProfile(
	projectPath: string,
): Promise<CodingWorkspaceProfile> {
	const result = await buildWorkspaceMemoryReadResult(projectPath);
	return result.profile;
}

export async function updateCodingWorkspaceProfile(
	input: WorkspaceProfileUpdateInput,
): Promise<CodingWorkspaceProfile> {
	const profile = await buildWorkspaceProfile(input.projectPath);
	const nextBackend = input.defaultBackend ?? profile.defaultBackend;
	const nextProfile: CodingWorkspaceProfile = {
		...profile,
		defaultBackend: nextBackend,
		defaultModel: input.defaultModel ?? profile.defaultModel ?? getDefaultModel(nextBackend),
		defaultApprovalMode:
			input.defaultApprovalMode ??
			profile.defaultApprovalMode ??
			getDefaultApprovalMode(nextBackend),
		memoryPolicy: input.memoryPolicy ?? profile.memoryPolicy,
		lastOpenedAt: Date.now(),
		updatedAt: Date.now(),
	};
	await persistWorkspaceProfile(nextProfile);
	return nextProfile;
}

export async function readCodingWorkspaceMemory(
	projectPath: string,
): Promise<WorkspaceMemoryReadResult> {
	return buildWorkspaceMemoryReadResult(projectPath);
}

export async function writeCodingWorkspaceMemory(
	input: WorkspaceMemoryWriteInput,
): Promise<WorkspaceMemoryReadResult> {
	const profile = await buildWorkspaceProfile(input.projectPath);
	const targetPath =
		input.target === "workspace"
			? profile.manifest.workspaceFile
			: input.target === "memory"
				? profile.manifest.memoryFile
				: profile.manifest.rulesFile;
	await fs.writeFile(targetPath, input.content, "utf-8");
	return buildWorkspaceMemoryReadResult(input.projectPath);
}
