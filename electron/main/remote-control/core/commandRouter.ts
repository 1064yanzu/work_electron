import type { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import type { Logger } from "../../logging/types";
import { AgentSdkExecutor } from "./agentSdkExecutor";
import { clampString } from "./utils";
import { getRemoteHelpText, parseRemoteInboundCommand } from "./commandParser";
import { ensureRemoteSessionSandboxDir } from "./sandboxDir";
import { FeishuDocxToolExecutor } from "../feishu-docx/toolExecutor";
import {
	buildContextFilesPrompt,
	persistInboundContextFiles,
} from "./contextFilePersistence";
import type { RemoteChatHistoryService } from "./remoteChatHistoryService";
import type {
	RemoteControlConfig,
	RemoteInboundMessage,
	RemoteInteractionRef,
	RemoteOutboundMessage,
	RemoteRuntimeStatus,
} from "./types";
import type { PairingService } from "./pairingService";
import { RemoteSessionStore } from "../store/sessionStore";

export type RemoteCommandRouterDeps = {
	logger: Logger;
	executor: AgentSdkExecutor;
	pairingService: PairingService;
	sessionStore: RemoteSessionStore;
	getConfig: () => RemoteControlConfig;
	getRuntimeStatus: () => RemoteRuntimeStatus;
	getActiveModel: () => Promise<string>;
	getMainWindow: () => BrowserWindow | null;
	remoteChatHistory: RemoteChatHistoryService;
	sendMessage: (message: RemoteOutboundMessage) => Promise<void>;
};

function isAllowedByPolicy(
	config: RemoteControlConfig,
	message: RemoteInboundMessage,
): boolean {
	if (message.channel_id !== "feishu") return true;
	const policy = config.channels.feishu;
	if (message.is_group) {
		if (policy.groupPolicy === "disabled") return false;
		if (policy.groupPolicy === "allowlist") {
			// 先检查群 ID（target_id）是否在群白名单中
			const groupId = String(message.target_id ?? "").trim();
			if (!groupId || !policy.groupAllowFrom.includes(groupId)) {
				// 群 ID 不在白名单中，再回退检查发送者 ID
				const senderId = String(message.sender_id ?? "").trim();
				if (!senderId || !policy.groupAllowFrom.includes(senderId)) {
					return false;
				}
			}
		}
		// @bot 检测已在 feishuChannel 中处理，这里不再重复
		return true;
	}
	if (policy.dmPolicy === "open") return true;
	if (policy.dmPolicy === "allowlist") {
		return policy.allowFrom.includes(message.peer_id);
	}
	return true;
}

const REMOTE_FEISHU_DOCX_MCP_ARG = "--remote-feishu-docx-mcp";

export class RemoteCommandRouter {
	private readonly interactionByRequestId = new Map<
		string,
		RemoteInteractionRef
	>();

	constructor(private readonly deps: RemoteCommandRouterDeps) {}

	bindInteraction(ref: RemoteInteractionRef): void {
		this.interactionByRequestId.set(ref.request_id, ref);
	}

	getInteractionRef(requestId: string): RemoteInteractionRef | null {
		return this.interactionByRequestId.get(requestId) ?? null;
	}

	removeInteractionRef(requestId: string): void {
		this.interactionByRequestId.delete(requestId);
	}

	private findLatestInteractionRef(
		channelId: string,
		peerId: string,
	): RemoteInteractionRef | null {
		let picked: RemoteInteractionRef | null = null;
		for (const item of this.interactionByRequestId.values()) {
			if (item.channel_id !== channelId) continue;
			if (item.peer_id !== peerId) continue;
			if (!picked || item.created_at > picked.created_at) {
				picked = item;
			}
		}
		return picked;
	}

	private async sendSystemReply(
		message: RemoteInboundMessage,
		text: string,
	): Promise<void> {
		await this.deps.sendMessage({
			channel_id: message.channel_id,
			target_id: message.target_id,
			reply_to_message_id: message.message_id,
			text,
		});
	}

	private canUseFeishuDocx(config: RemoteControlConfig): {
		ok: boolean;
		reason?: string;
	} {
		const appId = String(config.channels.feishu.appId || "").trim();
		const appSecret = String(config.channels.feishu.appSecret || "").trim();
		if (!appId || !appSecret) {
			return {
				ok: false,
				reason: "Feishu App ID / App Secret 未配置，无法调用文档 API。",
			};
		}
		return { ok: true };
	}

	private buildFeishuDocxMcpServers(config: RemoteControlConfig):
		| Record<string, { command: string; args?: string[]; env?: Record<string, string> }>
		| undefined {
		const credential = this.canUseFeishuDocx(config);
		if (!credential.ok) return undefined;
		if (!config.channels.feishu.enableDocxMcp) return undefined;
		const args = process.argv
			.slice(1)
			.filter((item) => item !== REMOTE_FEISHU_DOCX_MCP_ARG);
		args.push(REMOTE_FEISHU_DOCX_MCP_ARG);
		return {
			feishu_docx: {
				command: process.execPath,
				args,
				env: {
					REMOTE_FEISHU_APP_ID: String(config.channels.feishu.appId || ""),
					REMOTE_FEISHU_APP_SECRET: String(
						config.channels.feishu.appSecret || "",
					),
					REMOTE_FEISHU_DOMAIN: config.channels.feishu.domain,
					REMOTE_FEISHU_ENABLE_DOC_WRITE_OPS: String(
						config.channels.feishu.enableDocWriteOps,
					),
					REMOTE_FEISHU_ENABLE_DOC_FILE_DELETE: String(
						config.channels.feishu.enableDocFileDelete,
					),
					REMOTE_FEISHU_ENABLE_LEGACY_DOCS_READ: String(
						config.channels.feishu.enableLegacyDocsRead,
					),
				},
			},
		};
	}

	async handleInbound(message: RemoteInboundMessage): Promise<void> {
		const config = this.deps.getConfig();
		if (!isAllowedByPolicy(config, message)) {
			await this.sendSystemReply(
				message,
				"当前策略不允许该来源使用远程控制，请在设置中调整白名单或群策略。",
			);
			return;
		}

		if (!message.text.trim()) return;

		if (
			message.channel_id === "feishu" &&
			config.channels.feishu.dmPolicy === "pairing" &&
			!message.is_group
		) {
			const pairing = await this.deps.pairingService.ensurePairing({
				channelId: message.channel_id,
				peerId: message.peer_id,
				peerName: message.peer_name,
			});
			if (pairing.status === "pending") {
				await this.sendSystemReply(
					message,
					`检测到首次接入，请在设置页审批配对请求。\n配对码：${pairing.request.code}`,
				);
				return;
			}
		}

		const command = parseRemoteInboundCommand(message);
		switch (command.kind) {
			case "help":
				await this.sendSystemReply(message, getRemoteHelpText());
				return;
			case "status": {
				const status = this.deps.getRuntimeStatus();
				await this.sendSystemReply(
					message,
					[
						`远程控制：${status.enabled ? "已启用" : "已关闭"}`,
						`活跃运行：${status.active_runs}`,
						`待审批配对：${status.pending_pairings}`,
						...status.channels.map(
							(channel) =>
								`${channel.channel_id}: ${channel.running ? "运行中" : "未运行"} / ${channel.connected ? "已连接" : "未连接"}`,
						),
					].join("\n"),
				);
				return;
			}
			case "sessions": {
				const sessions = this.deps.sessionStore.list(10);
				if (sessions.length === 0) {
					await this.sendSystemReply(message, "暂无远程会话。");
					return;
				}
				await this.sendSystemReply(
					message,
					[
						"最近会话：",
						...sessions.map(
							(item) =>
								`- ${item.session_id} [${item.state}] run=${item.run_id ?? "-"} ${item.prompt_preview}`,
						),
					].join("\n"),
				);
				return;
			}
			case "stop": {
				const runId =
					command.runId || this.deps.sessionStore.list(1)[0]?.run_id;
				if (!runId) {
					await this.sendSystemReply(
						message,
						"没有可停止的运行。可用：/stop <runId>",
					);
					return;
				}
				const success = await this.deps.executor.abort(runId);
				await this.sendSystemReply(
					message,
					success ? `已停止运行 ${runId}` : `停止失败：${runId}`,
				);
				return;
			}
			case "model": {
				const model = await this.deps.getActiveModel();
				await this.sendSystemReply(message, `当前模型：${model}`);
				return;
			}
			case "approve": {
				const ref = command.requestId
					? this.interactionByRequestId.get(command.requestId)
					: this.findLatestInteractionRef(message.channel_id, message.peer_id);
				if (!ref) {
					await this.sendSystemReply(
						message,
						command.requestId
							? `未找到交互请求：${command.requestId}`
							: "当前没有待审批的交互请求。",
					);
					return;
				}
				const success = await this.deps.executor.resolveInteraction({
					runId: ref.run_id,
					requestId: ref.request_id,
					decision: {
						behavior: "allow",
						message: command.message,
					},
				});
				if (success) {
					this.interactionByRequestId.delete(ref.request_id);
				}
				await this.sendSystemReply(
					message,
					success
						? `已批准交互请求 ${ref.request_id}`
						: `批准失败：${ref.request_id}`,
				);
				return;
			}
			case "reject": {
				const ref = command.requestId
					? this.interactionByRequestId.get(command.requestId)
					: this.findLatestInteractionRef(message.channel_id, message.peer_id);
				if (!ref) {
					await this.sendSystemReply(
						message,
						command.requestId
							? `未找到交互请求：${command.requestId}`
							: "当前没有待审批的交互请求。",
					);
					return;
				}
				const success = await this.deps.executor.resolveInteraction({
					runId: ref.run_id,
					requestId: ref.request_id,
					decision: {
						behavior: "deny",
						message: command.message ?? "Rejected from remote channel",
						interrupt: true,
					},
				});
				if (success) {
					this.interactionByRequestId.delete(ref.request_id);
				}
				await this.sendSystemReply(
					message,
					success
						? `已拒绝交互请求 ${ref.request_id}`
						: `拒绝失败：${ref.request_id}`,
				);
				return;
			}
			case "doc_call": {
				if (message.channel_id !== "feishu") {
					await this.sendSystemReply(
						message,
						"仅 Feishu 通道支持 /doc.call。",
					);
					return;
				}
				if (!config.channels.feishu.enableDocCommandFallback) {
					await this.sendSystemReply(
						message,
						"当前已关闭 /doc.call 兜底能力（enableDocCommandFallback=false）。",
					);
					return;
				}
				if (!command.toolName) {
					await this.sendSystemReply(
						message,
						[
							"命令格式错误：缺少 tool_name。",
							"语法：/doc.call <tool_name> <json_args>",
							'示例：/doc.call docx_create_document {"title":"远控创建文档"}',
						].join("\n"),
					);
					return;
				}
				const credential = this.canUseFeishuDocx(config);
				if (!credential.ok) {
					await this.sendSystemReply(message, credential.reason || "配置缺失。");
					return;
				}

				let parsedArgs: unknown = {};
				if (command.jsonArgsText) {
					try {
						parsedArgs = JSON.parse(command.jsonArgsText);
					} catch (error) {
						await this.sendSystemReply(
							message,
							[
								`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`,
								"语法：/doc.call <tool_name> <json_args>",
							].join("\n"),
						);
						return;
					}
				}

				try {
					const toolExecutor = new FeishuDocxToolExecutor({
						appId: String(config.channels.feishu.appId || "").trim(),
						appSecret: String(config.channels.feishu.appSecret || "").trim(),
						domain: config.channels.feishu.domain,
						enableDocWriteOps: config.channels.feishu.enableDocWriteOps,
						enableDocFileDelete: config.channels.feishu.enableDocFileDelete,
						enableLegacyDocsRead: config.channels.feishu.enableLegacyDocsRead,
					});
					const result = await toolExecutor.executeTool(
						command.toolName,
						parsedArgs,
					);
					const output = JSON.stringify(result, null, 2);
					await this.sendSystemReply(
						message,
						[
							`/doc.call 执行成功：${command.toolName}`,
							output ? clampString(output, 3200) : "（无返回数据）",
						].join("\n"),
					);
				} catch (error) {
					await this.sendSystemReply(
						message,
						[
							`/doc.call 执行失败：${command.toolName}`,
							error instanceof Error ? error.message : String(error),
						].join("\n"),
					);
				}
				return;
			}
			case "chat": {
				if (!this.deps.executor.ready) {
					await this.sendSystemReply(
						message,
						"Agent 运行器尚未就绪，请稍后重试。",
					);
					return;
				}
				const model = await this.deps.getActiveModel();
				const basePrompt = command.prompt;
				const session = this.deps.sessionStore.create({
					session_id: randomUUID(),
					channel_id: message.channel_id,
					peer_id: message.peer_id,
					peer_name: message.peer_name,
					target_id: message.target_id,
					prompt_preview: clampString(basePrompt, 80),
				});
				const taskId = `remote-${session.session_id}`;
				let sandboxDir: string | undefined;
				let agentSessionId: string | undefined;
				try {
					sandboxDir = await ensureRemoteSessionSandboxDir(
						session.session_id,
					);
					const persistedContextFiles = await persistInboundContextFiles({
						logger: this.deps.logger,
						sandboxDir,
						files: message.context_files || [],
					});
					const contextPrompt = buildContextFilesPrompt(persistedContextFiles);
					const prompt = contextPrompt
						? `${basePrompt}\n\n${contextPrompt}`
						: basePrompt;
					const persistedRun =
						await this.deps.remoteChatHistory.prepareRemoteChatRun({
							channelId: message.channel_id,
							peerId: message.peer_id,
							peerName: message.peer_name,
							remoteSessionId: session.session_id,
							taskId,
							prompt,
							sandboxDir,
						});
					agentSessionId = persistedRun.agentSessionId;
					const mcpServers =
						message.channel_id === "feishu"
							? this.buildFeishuDocxMcpServers(config)
							: undefined;
					const runId = await this.deps.executor.start({
						prompt,
						model,
						cwd: sandboxDir,
						interactive_approval: true,
						persist_session: true,
						mcp_servers: mcpServers,
					});
					this.deps.sessionStore.bindRun(session.session_id, runId);
					this.deps.sessionStore.update(session.session_id, {
						agent_session_id: agentSessionId,
						task_id: taskId,
						sandbox_dir: sandboxDir,
					});
					this.deps.remoteChatHistory.registerRunContext({
						runId,
						agentSessionId,
						taskId,
						sandboxDir,
					});

					// 将远程消息注入前端 UI，让用户可以在界面中看到远程对话
					const win = this.deps.getMainWindow();
					if (win && !win.isDestroyed()) {
						win.webContents.send("remote-chat-inject", {
							runId,
							prompt,
							channelId: message.channel_id,
							peerName: message.peer_name || message.peer_id,
							peerId: message.peer_id,
							sessionId: session.session_id,
							taskId,
							agentSessionId,
							persistedByMain: true,
							sandboxDir,
							contextFiles: persistedContextFiles.map((file) => file.relativePath),
						});
					}

					await this.sendSystemReply(message, "收到，正在处理中…");
				} catch (error) {
					this.deps.logger.error({
						msg: "remote control start failed",
						error: error instanceof Error ? error.message : String(error),
					});
					this.deps.sessionStore.update(session.session_id, {
						state: "error",
						last_error: error instanceof Error ? error.message : String(error),
					});
					if (agentSessionId) {
						await this.deps.remoteChatHistory.persistRunStartFailure({
							agentSessionId,
							taskId,
							sandboxDir,
							errorText:
								error instanceof Error ? error.message : String(error),
						});
					}
					await this.sendSystemReply(
						message,
						`任务启动失败：${error instanceof Error ? error.message : String(error)}`,
					);
				}
				return;
			}
		}
	}
}
