import { useState } from "react";
import { ChevronDown, ChevronRight, Server } from "lucide-react";

export interface ClaudeAuthStatus {
	isLoggedIn: boolean;
	authMethod: "oauth" | "api_key" | "env_key" | "none";
	email?: string;
	model?: string;
	mcpServers?: Array<{ name: string; command?: string; url?: string; type?: string }>;
}

interface Props {
	status: ClaudeAuthStatus | null;
	loading?: boolean;
}

export function ClaudeAuthStatusCard({ status, loading = false }: Props) {
	const [mcpExpanded, setMcpExpanded] = useState(false);

	return (
		<div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
			<div className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">
				Claude Code 连接状态
			</div>

			{loading || !status ? (
				<div className="flex items-center gap-2 text-sm text-zinc-400 dark:text-zinc-500">
					<span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-300 dark:bg-zinc-600" />
					检测中...
				</div>
			) : (
				<div className="space-y-2.5">
					<AuthTypeLine status={status} />
					{status.model && (
						<div className="text-xs text-zinc-500 dark:text-zinc-400">
							当前模型：
							<span className="font-mono text-zinc-700 dark:text-zinc-300">
								{status.model}
							</span>
						</div>
					)}
					{status.mcpServers && status.mcpServers.length > 0 && (
						<McpServerList
							servers={status.mcpServers}
							expanded={mcpExpanded}
							onToggle={() => setMcpExpanded((v) => !v)}
						/>
					)}
				</div>
			)}
		</div>
	);
}

function AuthTypeLine({ status }: { status: ClaudeAuthStatus }) {
	if (status.authMethod === "oauth") {
		return (
			<div className="flex items-center gap-2 text-sm">
				<span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
				<span className="text-zinc-700 dark:text-zinc-200">已通过 Claude 账号登录</span>
				{status.email && (
					<span className="text-xs text-zinc-400 dark:text-zinc-500">{status.email}</span>
				)}
			</div>
		);
	}
	if (status.authMethod === "api_key" || status.authMethod === "env_key") {
		return (
			<div className="flex items-center gap-2 text-sm">
				<span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
				<span className="text-zinc-700 dark:text-zinc-200">使用 API Key</span>
			</div>
		);
	}
	return (
		<div className="flex items-center gap-2 text-sm">
			<span className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-yellow-400" />
			<span className="text-zinc-500 dark:text-zinc-400">未配置认证</span>
		</div>
	);
}

function McpServerList({
	servers,
	expanded,
	onToggle,
}: {
	servers: Array<{ name: string; command?: string; url?: string; type?: string }>;
	expanded: boolean;
	onToggle: () => void;
}) {
	return (
		<div>
			<button
				type="button"
				onClick={onToggle}
				className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
			>
				<Server className="h-3 w-3" />
				<span>检测到 {servers.length} 个 MCP 服务器</span>
				{expanded ? (
					<ChevronDown className="h-3 w-3" />
				) : (
					<ChevronRight className="h-3 w-3" />
				)}
			</button>
			{expanded && (
				<ul className="mt-1.5 space-y-1 pl-5">
					{servers.map((server) => (
						<li
							key={server.name}
							className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400"
						>
							<span className="font-medium text-zinc-700 dark:text-zinc-300">
								{server.name}
							</span>
							{server.type && (
								<span className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[10px] text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
									{server.type}
								</span>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
