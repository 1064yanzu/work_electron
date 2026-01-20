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
			alert("请填写服务器名称和命令");
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
			alert(`添加失败: ${error}`);
		}
	};

	const handleRemoveServer = async (id: string) => {
		if (confirm("确定要删除此 MCP 服务器吗？")) {
			try {
				await deleteMcpServer(id);
				await loadServers();
			} catch (error) {
				alert(`删除失败: ${error}`);
			}
		}
	};

	const toggleServer = async (id: string) => {
		const server = servers.find((s) => s.id === id);
		if (!server) return;

		try {
			await updateMcpServer({ ...server, enabled: !server.enabled });
			await loadServers();
		} catch (error) {
			alert(`更新失败: ${error}`);
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
					alert("无效的 JSON 格式");
					return;
				}

				// 导入所有服务器
				for (const server of imported) {
					await addMcpServer({
						...server,
						id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
					});
				}

				await loadServers();
				alert(`成功导入 ${imported.length} 个 MCP 服务器`);
			} catch (error) {
				alert(`导入失败: ${error}`);
			}
		};
		input.click();
	};

	const testConnection = async (id: string) => {
		const server = servers.find((s) => s.id === id);
		if (!server) return;

		// 设置为测试中状态
		setServers(
			servers.map((s) => (s.id === id ? { ...s, status: "running" } : s)),
		);

		try {
			const result = await testMcpServer(server);
			setServers(
				servers.map((s) => (s.id === id ? { ...s, status: "running" } : s)),
			);
			alert(
				`✅ MCP 服务器 "${server.name}" 可用（tools: ${result.tool_count}）`,
			);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			if (msg.includes("暂不支持")) {
				setServers(
					servers.map((s) => (s.id === id ? { ...s, status: "stopped" } : s)),
				);
				alert(`ℹ️ ${msg}`);
			} else {
				setServers(
					servers.map((s) => (s.id === id ? { ...s, status: "error" } : s)),
				);
				alert(`❌ 测试失败: ${msg}`);
			}
		}

		// 3秒后重置状态
		setTimeout(() => {
			setServers((prev) =>
				prev.map((s) => (s.id === id ? { ...s, status: "stopped" } : s)),
			);
		}, 3000);
	};

	return (
		<div className="flex-1 h-full bg-white p-8 overflow-y-auto">
			<div className="max-w-3xl space-y-8">
				<div className="border-b border-border pb-4 mb-8">
					<h3 className="text-lg font-serif font-medium text-text-primary flex items-center gap-2">
						<Plug className="w-5 h-5" />
						MCP 服务配置
					</h3>
					<p className="text-sm text-text-secondary mt-1">
						配置 Model Context Protocol 服务器，扩展应用能力
					</p>
				</div>

				{/* 环境检测 */}
				<div className="bg-zinc-50 border border-border rounded-lg p-4">
					<div className="flex items-center justify-between mb-4">
						<h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
							<Terminal className="w-4 h-4" />
							运行环境检测
						</h4>
						<button
							onClick={checkEnv}
							disabled={isCheckingEnv}
							className="text-xs text-primary hover:underline disabled:opacity-50"
						>
							{isCheckingEnv ? "检测中..." : "重新检测"}
						</button>
					</div>

					{envCheck ? (
						<div className="space-y-2 text-xs">
							<div className="flex items-center justify-between">
								<span className="text-text-secondary">Node.js</span>
								<div className="flex items-center gap-1.5">
									{envCheck.node_version ? (
										<>
											<CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
											<span className="font-mono text-text-primary">
												{envCheck.node_version}
											</span>
										</>
									) : (
										<>
											<XCircle className="w-3.5 h-3.5 text-red-600" />
											<span className="text-red-600">未检测到</span>
										</>
									)}
								</div>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-text-secondary">NPX</span>
								<div className="flex items-center gap-1.5">
									{envCheck.npx_version ? (
										<>
											<CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
											<span className="font-mono text-text-primary">
												{envCheck.npx_version}
											</span>
										</>
									) : (
										<>
											<XCircle className="w-3.5 h-3.5 text-red-600" />
											<span className="text-red-600">未检测到</span>
										</>
									)}
								</div>
							</div>
							<div className="pt-2 border-t border-border/50">
								<div className="flex items-center justify-between mb-1">
									<span className="text-text-secondary">Shell Path</span>
									<span className="text-[10px] text-text-muted bg-zinc-100 px-1.5 py-0.5 rounded">
										{envCheck.shell || "Default"}
									</span>
								</div>
								<code className="block w-full p-2 bg-white border border-border rounded text-[10px] text-text-secondary font-mono break-all max-h-20 overflow-y-auto">
									{envCheck.path}
								</code>
							</div>
							{!envCheck.valid && (
								<div className="mt-2 text-red-600 bg-red-50 p-2 rounded text-[11px] flex items-start gap-2">
									<AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
									<div>
										<p className="font-medium">环境配置不完整</p>
										<p className="opacity-90 mt-0.5">
											MCP 服务通常依赖 Node.js 环境。请确保已安装 Node.js，并且
											npx 命令可用。 如果是通过 nvm/fnm 安装，尝试在终端中执行{" "}
											<code>ln -s $(which node) /usr/local/bin/node</code>{" "}
											创建软链接。
										</p>
									</div>
								</div>
							)}
						</div>
					) : (
						<div className="text-center py-4 text-text-muted text-xs">
							点击上方按钮检测运行环境...
						</div>
					)}
				</div>

				{/* Server List */}
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h4 className="font-medium text-text-primary">已配置的服务器</h4>
						<div className="flex items-center gap-2">
							<button
								onClick={handleImportJson}
								className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-border text-text-primary rounded-lg hover:bg-surface transition-colors"
								title="从 JSON 导入"
							>
								<Upload className="w-4 h-4" />
								导入
							</button>
							<button
								onClick={handleExportJson}
								className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-border text-text-primary rounded-lg hover:bg-surface transition-colors"
								title="导出为 JSON"
							>
								<Download className="w-4 h-4" />
								导出
							</button>
							<button
								onClick={() => setIsAdding(true)}
								className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
							>
								<Plus className="w-4 h-4" />
								添加
							</button>
						</div>
					</div>

					{isLoading ? (
						<div className="text-center py-8 text-text-muted">加载中...</div>
					) : (
						servers.map((server) => (
							<div
								key={server.id}
								className="p-4 border border-border rounded-lg hover:shadow-md transition-shadow"
							>
								<div className="flex items-start justify-between mb-3">
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-1">
											<h5 className="font-medium text-text-primary">
												{server.name}
											</h5>
											{server.status === "running" && (
												<span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
													运行中
												</span>
											)}
											{server.status === "error" && (
												<span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
													错误
												</span>
											)}
										</div>
										<div className="text-xs font-mono text-text-muted">
											{server.command} {server.args.join(" ")}
										</div>
									</div>

									<div className="flex items-center gap-2">
										<button
											onClick={() => testConnection(server.id)}
											className="p-1.5 text-text-muted hover:text-primary transition-colors"
											title="测试连接"
										>
											<RefreshCw className="w-4 h-4" />
										</button>
										<label className="relative inline-flex items-center cursor-pointer">
											<input
												type="checkbox"
												checked={server.enabled}
												onChange={() => toggleServer(server.id)}
												className="sr-only peer"
											/>
											<div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
										</label>
										<button
											onClick={() => handleRemoveServer(server.id)}
											className="p-1.5 text-text-muted hover:text-red-600 transition-colors"
											title="删除"
										>
											<Trash2 className="w-4 h-4" />
										</button>
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
					<div className="p-4 border-2 border-primary/20 bg-primary/5 rounded-lg space-y-4">
						<div className="flex items-center justify-between mb-2">
							<h5 className="font-medium text-text-primary">添加新服务器</h5>
							<button
								onClick={() => setIsAdding(false)}
								className="text-text-muted hover:text-text-primary"
							>
								<X className="w-4 h-4" />
							</button>
						</div>

						<div className="space-y-3">
							<div>
								<label className="block text-sm font-medium text-text-primary mb-1">
									名称
								</label>
								<input
									type="text"
									value={newServer.name || ""}
									onChange={(e) =>
										setNewServer({ ...newServer, name: e.target.value })
									}
									placeholder="例如: Playwright Browser"
									className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-text-primary mb-1">
									命令
								</label>
								<input
									type="text"
									value={newServer.command || ""}
									onChange={(e) =>
										setNewServer({ ...newServer, command: e.target.value })
									}
									placeholder="例如: npx"
									className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-text-primary mb-1">
									参数 (每行一个)
								</label>
								<textarea
									value={(newServer.args || []).join("\n")}
									onChange={(e) =>
										setNewServer({
											...newServer,
											args: e.target.value.split("\n").filter((a) => a.trim()),
										})
									}
									placeholder="-y&#10;@modelcontextprotocol/server-playwright"
									rows={3}
									className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
								/>
							</div>

							<div className="flex gap-2 pt-2">
								<button
									onClick={handleAddServer}
									className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
								>
									<Check className="w-4 h-4" />
									添加
								</button>
								<button
									onClick={() => setIsAdding(false)}
									className="px-4 py-2 bg-surface border border-border rounded-lg hover:bg-border/30 transition-colors text-sm font-medium"
								>
									取消
								</button>
							</div>
						</div>
					</div>
				)}

				{/* Info */}
				<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
					<div className="flex items-start gap-3">
						<AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
						<div className="text-sm text-blue-900">
							<div className="font-medium mb-1">关于 MCP</div>
							<p className="text-blue-700 mb-2">
								Model Context Protocol (MCP)
								允许应用通过标准化协议连接外部工具和服务。
							</p>
							<div className="text-xs text-blue-600">
								• Playwright: 浏览器自动化和网页抓取
								<br />• File System: 文件系统访问
								<br />• Custom: 自定义工具和服务
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
