/**
 * MCPSettings — MCP 服务器设置面板
 *
 * Phase 7.4：手写 button / input / textarea / 自定义开关全部替换为
 * SettingsButton / SettingsTextInput / SettingsTextArea / SettingsSwitch。
 */
import {
	AlertCircle,
	Check,
	CheckCircle2,
	Download,
	Plug,
	Plus,
	RefreshCw,
	Terminal,
	Trash2,
	Upload,
	X,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	addMcpServer,
	deleteMcpServer,
	type EnvCheckResult,
	listMcpServers,
	type MCPServer,
	mcpCheckEnv,
	testMcpServer,
	updateMcpServer,
} from "../../../lib/config";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { toast } from "../../ui/Toast";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsBadge,
	SettingsButton,
	SettingsField,
	SettingsHint,
	SettingsPageContainer,
	SettingsSectionCard,
	SettingsSwitch,
	SettingsTextArea,
	SettingsTextInput,
} from "../ui/SettingsPrimitives";

export function MCPSettings() {
	const [servers, setServers] = useState<
		(MCPServer & { status?: "running" | "stopped" | "error" })[]
	>([]);
	const [envCheck, setEnvCheck] = useState<EnvCheckResult | null>(null);
	const [isCheckingEnv, setIsCheckingEnv] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isAdding, setIsAdding] = useState(false);
	const [newServer, setNewServer] = useState<Partial<MCPServer>>({
		name: "",
		command: "",
		args: [],
		enabled: true,
	});

	useEffect(() => {
		loadServers();
		checkEnv();
	}, []);

	const checkEnv = async () => {
		try {
			setIsCheckingEnv(true);
			const result = await mcpCheckEnv();
			setEnvCheck(result);
		} catch (error) {
			console.error("环境检测失败:", error);
		} finally {
			setIsCheckingEnv(false);
		}
	};

	const loadServers = async () => {
		try {
			setIsLoading(true);
			const data = await listMcpServers();
			setServers(data.map((s) => ({ ...s, status: "stopped" })));
		} catch (error) {
			console.error("加载 MCP 服务器失败:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleAddServer = async () => {
		if (!newServer.name || !newServer.command) {
			toast.warning("请填写服务器名称和命令");
			return;
		}

		const server: MCPServer = {
			id: Date.now().toString(),
			name: newServer.name,
			command: newServer.command,
			args: newServer.args || [],
			env: newServer.env,
			enabled: true,
		};

		try {
			await addMcpServer(server);
			await loadServers();
			setIsAdding(false);
			setNewServer({ name: "", command: "", args: [], enabled: true });
		} catch (error) {
			toast.error(`添加失败: ${error}`);
		}
	};

	const handleRemoveServer = async (id: string) => {
		const confirmed = await confirmDialog.danger(
			"确定要删除此 MCP 服务器吗？",
			"删除 MCP 服务器",
		);
		if (!confirmed) return;
		try {
			await deleteMcpServer(id);
			await loadServers();
		} catch (error) {
			toast.error(`删除失败: ${error}`);
		}
	};

	const toggleServer = async (id: string) => {
		const server = servers.find((s) => s.id === id);
		if (!server) return;

		try {
			await updateMcpServer({ ...server, enabled: !server.enabled });
			await loadServers();
		} catch (error) {
			toast.error(`更新失败: ${error}`);
		}
	};

	const handleExportJson = () => {
		const data = JSON.stringify(servers, null, 2);
		const blob = new Blob([data], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `mcp-servers-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleImportJson = async () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			try {
				const text = await file.text();
				const imported = JSON.parse(text) as MCPServer[];

				if (!Array.isArray(imported)) {
					toast.error("无效的 JSON 格式");
					return;
				}

				for (const server of imported) {
					await addMcpServer({
						...server,
						id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
					});
				}

				await loadServers();
				toast.success(`成功导入 ${imported.length} 个 MCP 服务器`);
			} catch (error) {
				toast.error(`导入失败: ${error}`);
			}
		};
		input.click();
	};

	const testConnection = async (id: string) => {
		const server = servers.find((s) => s.id === id);
		if (!server) return;

		setServers(
			servers.map((s) => (s.id === id ? { ...s, status: "running" } : s)),
		);

		try {
			const result = await testMcpServer(server);
			setServers(
				servers.map((s) => (s.id === id ? { ...s, status: "running" } : s)),
			);
			toast.success(
				`MCP 服务器 "${server.name}" 可用（tools: ${result.tool_count}）`,
			);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			if (msg.includes("暂不支持")) {
				setServers(
					servers.map((s) => (s.id === id ? { ...s, status: "stopped" } : s)),
				);
				toast.info(msg);
			} else {
				setServers(
					servers.map((s) => (s.id === id ? { ...s, status: "error" } : s)),
				);
				toast.error(`测试失败: ${msg}`);
			}
		}

		setTimeout(() => {
			setServers((prev) =>
				prev.map((s) => (s.id === id ? { ...s, status: "stopped" } : s)),
			);
		}, 3000);
	};

	return (
		<SettingsPageContainer contentClassName="max-w-3xl space-y-8">
			<div
				id="integrations.mcp.servers"
				data-settings-anchor="integrations.mcp.servers"
			>
				<SettingsPanelHeader
					icon={Plug}
					title="MCP 服务配置"
					description="管理 Model Context Protocol 服务器，扩展 Agent 的工具与能力。"
				/>
			</div>

			{/* 环境检测 */}
			<SettingsSectionCard>
				<div className="p-5 space-y-3">
					<div className="flex items-center justify-between">
						<h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
							<Terminal className="w-4 h-4" />
							运行环境检测
						</h4>
						<SettingsButton
							variant="ghost"
							size="sm"
							icon={RefreshCw}
							onClick={checkEnv}
							disabled={isCheckingEnv}
							loading={isCheckingEnv}
						>
							{isCheckingEnv ? "检测中..." : "重新检测"}
						</SettingsButton>
					</div>

					{envCheck ? (
						<div className="space-y-2 text-xs">
							<div className="flex items-center justify-between">
								<span className="text-text-secondary">Node.js</span>
								<div className="flex items-center gap-1.5">
									{envCheck.node_version ? (
										<>
											<CheckCircle2
												className="w-3.5 h-3.5 bai-icon-mint"
												strokeWidth={1.5}
											/>
											<span className="font-mono text-text-primary">
												{envCheck.node_version}
											</span>
										</>
									) : (
										<>
											<XCircle className="w-3.5 h-3.5 text-error" />
											<span className="text-error">未检测到</span>
										</>
									)}
								</div>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-text-secondary">NPX</span>
								<div className="flex items-center gap-1.5">
									{envCheck.npx_version ? (
										<>
											<CheckCircle2
												className="w-3.5 h-3.5 bai-icon-mint"
												strokeWidth={1.5}
											/>
											<span className="font-mono text-text-primary">
												{envCheck.npx_version}
											</span>
										</>
									) : (
										<>
											<XCircle className="w-3.5 h-3.5 text-error" />
											<span className="text-error">未检测到</span>
										</>
									)}
								</div>
							</div>
							<div className="pt-2 border-t border-border/50">
								<div className="flex items-center justify-between mb-1">
									<span className="text-text-secondary">Shell Path</span>
									<SettingsBadge tone="neutral">
										{envCheck.shell || "Default"}
									</SettingsBadge>
								</div>
								<code className="block w-full p-2 bg-surface border border-border rounded text-[10px] text-text-secondary font-mono break-all max-h-20 overflow-y-auto">
									{envCheck.path}
								</code>
							</div>
							{!envCheck.valid && (
								<SettingsHint
									tone="error"
									icon={AlertCircle}
									title="环境配置不完整"
								>
									MCP 服务通常依赖 Node.js 环境。请确保已安装 Node.js，并且 npx
									命令可用。 如果是通过 nvm/fnm 安装，尝试在终端中执行{" "}
									<code className="font-mono">
										ln -s $(which node) /usr/local/bin/node
									</code>{" "}
									创建软链接。
								</SettingsHint>
							)}
						</div>
					) : (
						<div className="text-center py-4 text-text-muted text-xs">
							点击上方按钮检测运行环境...
						</div>
					)}
				</div>
			</SettingsSectionCard>

			{/* Server List */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h4 className="font-medium text-text-primary">已配置的服务器</h4>
					<div className="flex items-center gap-2">
						<SettingsButton
							variant="secondary"
							icon={Upload}
							onClick={handleImportJson}
							title="从 JSON 导入"
						>
							导入
						</SettingsButton>
						<SettingsButton
							variant="secondary"
							icon={Download}
							onClick={handleExportJson}
							title="导出为 JSON"
						>
							导出
						</SettingsButton>
						<SettingsButton
							variant="primary"
							icon={Plus}
							onClick={() => setIsAdding(true)}
						>
							添加
						</SettingsButton>
					</div>
				</div>

				{isLoading ? (
					<div className="text-center py-8 text-text-muted">加载中...</div>
				) : (
					servers.map((server) => (
						<SettingsSectionCard key={server.id}>
							<div className="p-4">
								<div className="flex items-start justify-between mb-3">
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 mb-1">
											<h5 className="font-medium text-text-primary">
												{server.name}
											</h5>
											{server.status === "running" && (
												<SettingsBadge tone="success">运行中</SettingsBadge>
											)}
											{server.status === "error" && (
												<SettingsBadge tone="error">错误</SettingsBadge>
											)}
										</div>
										<div className="text-xs font-mono text-text-muted">
											{server.command} {server.args.join(" ")}
										</div>
									</div>

									<div className="flex items-center gap-2">
										<SettingsButton
											variant="ghost"
											size="sm"
											icon={RefreshCw}
											onClick={() => testConnection(server.id)}
											title="测试连接"
										/>
										<SettingsSwitch
											checked={server.enabled}
											onChange={() => toggleServer(server.id)}
										/>
										<SettingsButton
											variant="danger"
											size="sm"
											icon={Trash2}
											onClick={() => handleRemoveServer(server.id)}
											title="删除"
										/>
									</div>
								</div>

								{server.env && Object.keys(server.env).length > 0 && (
									<div className="mt-3 pt-3 border-t border-border">
										<div className="text-xs text-text-muted mb-2">
											环境变量:
										</div>
										<div className="space-y-1">
											{Object.entries(server.env).map(([key, value]) => (
												<div
													key={key}
													className="text-xs font-mono text-text-secondary"
												>
													{key}={value}
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						</SettingsSectionCard>
					))
				)}

				{!isLoading && servers.length === 0 && !isAdding && (
					<div className="text-center py-12 text-text-muted">
						<Plug className="w-12 h-12 mx-auto mb-3 opacity-30" />
						<p>暂无 MCP 服务器配置</p>
					</div>
				)}
			</div>

			{/* Add Server Form */}
			{isAdding && (
				<SettingsSectionCard className="border-2 border-primary/20 bg-primary/5">
					<div className="p-4 space-y-4">
						<div className="flex items-center justify-between">
							<h5 className="font-medium text-text-primary">添加新服务器</h5>
							<SettingsButton
								variant="ghost"
								size="sm"
								icon={X}
								onClick={() => setIsAdding(false)}
								title="取消"
							/>
						</div>

						<div className="space-y-3">
							<SettingsField label="名称">
								<SettingsTextInput
									value={newServer.name || ""}
									onChange={(value) =>
										setNewServer({ ...newServer, name: value })
									}
									placeholder="例如: Playwright Browser"
								/>
							</SettingsField>

							<SettingsField label="命令">
								<SettingsTextInput
									value={newServer.command || ""}
									onChange={(value) =>
										setNewServer({ ...newServer, command: value })
									}
									placeholder="例如: npx"
									mono
								/>
							</SettingsField>

							<SettingsField label="参数（每行一个）">
								<SettingsTextArea
									value={(newServer.args || []).join("\n")}
									onChange={(value) =>
										setNewServer({
											...newServer,
											args: value.split("\n").filter((a) => a.trim()),
										})
									}
									placeholder={"-y\n@modelcontextprotocol/server-playwright"}
									rows={3}
									mono
								/>
							</SettingsField>

							<div className="flex gap-2 pt-2">
								<SettingsButton
									variant="primary"
									icon={Check}
									onClick={() => void handleAddServer()}
									className="flex-1"
								>
									添加
								</SettingsButton>
								<SettingsButton
									variant="secondary"
									onClick={() => setIsAdding(false)}
								>
									取消
								</SettingsButton>
							</div>
						</div>
					</div>
				</SettingsSectionCard>
			)}

			{/* Info */}
			<SettingsHint tone="info" icon={AlertCircle} title="关于 MCP">
				Model Context Protocol (MCP) 允许应用通过标准化协议连接外部工具和服务。
				<div className="mt-2">
					• Playwright: 浏览器自动化和网页抓取
					<br />• File System: 文件系统访问
					<br />• Custom: 自定义工具和服务
				</div>
			</SettingsHint>
		</SettingsPageContainer>
	);
}
