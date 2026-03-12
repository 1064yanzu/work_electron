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
    status: "modified" | "added" | "deleted" | "renamed" | "untracked";
    staged: boolean;
  }>;
}

// Git 分支信息
export interface GitBranchInfo {
  name: string;
  current: boolean;
  remote?: string;
  lastCommit?: string;
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
        const children = await readFileTree(fullPath, maxDepth, currentDepth + 1);
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
    console.error(`[CodingService] Failed to read directory: ${dirPath}`, error);
    return [];
  }
}

/** Execute a git command in a directory */
async function gitExec(
  cwd: string,
  args: string[],
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 1024 * 1024 * 10, // 10MB
      timeout: 10000,
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
  const branchOutput = await gitExec(dirPath, [
    "branch",
    "--show-current",
  ]);

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
      const filePath = line.substring(3);

      const indexStatus = xy[0];
      const wtStatus = xy[1];

      let status: GitStatusInfo["files"][0]["status"] = "modified";
      let staged = false;

      // Determine status from index (X) and worktree (Y) indicators
      if (xy === "??") {
        status = "untracked";
      } else if (indexStatus === "A" || wtStatus === "A") {
        status = "added";
        staged = indexStatus === "A";
      } else if (indexStatus === "D" || wtStatus === "D") {
        status = "deleted";
        staged = indexStatus === "D";
      } else if (indexStatus === "R" || wtStatus === "R") {
        status = "renamed";
        staged = indexStatus === "R";
      } else if (indexStatus === "M" || wtStatus === "M") {
        status = "modified";
        staged = indexStatus === "M";
      }

      files.push({ path: filePath, status, staged });
    }
  }

  return {
    branch: branchOutput || "HEAD",
    ahead,
    behind,
    files,
  };
}

/** Get git branches */
export async function getGitBranches(dirPath: string): Promise<GitBranchInfo[]> {
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
