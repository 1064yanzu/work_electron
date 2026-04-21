/**
 * 个人微信渠道（Wechaty · 实验特性）
 *
 * ⚠️ 风险提示
 * - 微信无官方 Bot API；本渠道依赖开源项目 [Wechaty](https://github.com/wechaty/wechaty)
 * - 所有方案都有**封号风险**，尤其新号或频繁发消息的号
 * - `wechaty-puppet-xp`（Windows 桌面端劫持）只支持 Windows + 锁定 WeChat 版本；macOS 无官方方案
 * - 默认**禁用**，UI 上必须显示「实验特性 · 有封号风险」并要求用户先 `acknowledgedRisk=true`
 *
 * 依赖策略：
 * - 不在 package.json 强制引入 wechaty（~400MB），改为 **运行时动态 import**
 * - 用户启用本渠道前需要自行安装 `wechaty` + 对应 puppet 包（服务模式只需 `wechaty-puppet-service`）
 * - 若运行时 import 失败，本渠道进入 "依赖未安装" 状态，保持 orchestrator 治理完整
 *
 * 能力降级（协议层限制）：
 * - 不支持 reactions / pin / edit message / typing / 按钮交互
 * - streaming 降级为「分段发送」——Agent 响应过程中每累积一段文本发一条新消息
 */

import type { Logger } from "../../../logging/types";
import type {
	RemoteChannelPlugin,
	RemoteChannelContext,
} from "../../core/channel-plugin";
import { updateChannelCapabilityEntry } from "../../core/channelCapabilityRegistry";
import type {
	RemoteOutboundMessage,
	RemoteWechatConfig,
} from "../../core/types";
import {
	createSequentialQueue,
	getChannelDedupe,
	type ChannelDedupe,
	type SequentialQueue,
} from "../../sdk";

/**
 * 动态 import wechaty —— 失败时返回 null（表示依赖未安装）
 */
async function tryLoadWechaty(): Promise<{
	WechatyBuilder: {
		build: (options: unknown) => WechatyInstance;
	};
} | null> {
	try {
		// `import()` 绕开 bundler 静态解析，让 runtime 按需解析
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const importer = new Function("spec", "return import(spec)") as (
			spec: string,
		) => Promise<unknown>;
		const mod = (await importer("wechaty")) as {
			WechatyBuilder?: {
				build: (options: unknown) => WechatyInstance;
			};
		};
		if (!mod?.WechatyBuilder) return null;
		return { WechatyBuilder: mod.WechatyBuilder };
	} catch {
		return null;
	}
}

// Minimal type shim for Wechaty runtime instance（保持类型安全，但不绑定具体版本）
type WechatyEventHandler = (...args: unknown[]) => void | Promise<void>;
type WechatyInstance = {
	on: (event: string, handler: WechatyEventHandler) => WechatyInstance;
	start: () => Promise<void>;
	stop: () => Promise<void>;
	logout?: () => Promise<void>;
	currentUser?: unknown;
	say?: (msg: string) => Promise<void>;
	Contact?: {
		find: (query: { id?: string; name?: string }) => Promise<
			| {
					say: (msg: string) => Promise<void>;
					id?: string;
			  }
			| undefined
		>;
	};
	Room?: {
		find: (query: { id?: string; topic?: string }) => Promise<
			| {
					say: (msg: string) => Promise<void>;
					id?: string;
			  }
			| undefined
		>;
	};
};

type WechatyMessage = {
	id: () => string;
	text: () => string;
	talker: () => { id: string; name: () => string } | undefined;
	room: () => { id: string; topic: () => Promise<string> } | undefined | null;
	self: () => boolean;
};

const CHUNK_LIMIT = 1800;

function chunkText(text: string, limit: number): string[] {
	if (text.length <= limit) return [text];
	const chunks: string[] = [];
	let remaining = text;
	while (remaining.length > 0) {
		if (remaining.length <= limit) {
			chunks.push(remaining);
			break;
		}
		let splitIndex = remaining.lastIndexOf("\n", limit);
		if (splitIndex <= 0 || splitIndex < limit * 0.3) {
			splitIndex = remaining.lastIndexOf(" ", limit);
		}
		if (splitIndex <= 0 || splitIndex < limit * 0.3) {
			splitIndex = limit;
		}
		chunks.push(remaining.slice(0, splitIndex));
		remaining = remaining.slice(splitIndex).trimStart();
	}
	return chunks;
}

export class WechatChannelPlugin implements RemoteChannelPlugin {
	readonly id = "wechat" as const;

	private wechaty: WechatyInstance | null = null;
	private ctx: RemoteChannelContext | null = null;
	private dependencyMissing = false;
	private readonly outboundQueue: SequentialQueue = createSequentialQueue();
	private readonly persistentDedupe: ChannelDedupe = getChannelDedupe("wechat");

	constructor(private readonly logger: Logger) {}

	async start(ctx: RemoteChannelContext): Promise<void> {
		this.ctx = ctx;
		const config = ctx.config.channels.wechat;
		if (!config) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: "配置缺失",
			});
			return;
		}
		if (!config.acknowledgedRisk) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: "未确认风险提示（请在设置页勾选「我已了解封号风险」）",
			});
			this.updateCapabilitiesPlaceholder();
			return;
		}

		const wechatyMod = await tryLoadWechaty();
		if (!wechatyMod) {
			this.dependencyMissing = true;
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error:
					"未检测到 wechaty 依赖；请手动安装：`npm install wechaty` + 对应 puppet 包",
			});
			this.updateCapabilitiesPlaceholder();
			return;
		}

		const puppetOptions = this.resolvePuppetOptions(config);
		if (!puppetOptions) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: `puppet "${config.puppet}" 配置不完整`,
			});
			return;
		}

		try {
			this.wechaty = wechatyMod.WechatyBuilder.build(puppetOptions);
			this.registerEventHandlers(this.wechaty, config);
			await this.wechaty.start();
			ctx.onStatusPatch({
				running: true,
				connected: true,
				mode: config.puppet,
				last_error: undefined,
			});
		} catch (err) {
			this.wechaty = null;
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error:
					err instanceof Error
						? `wechaty 启动失败：${err.message}`
						: "wechaty 启动失败",
			});
			this.updateCapabilitiesPlaceholder();
			return;
		}

		this.updateCapabilitiesLive();
	}

	async stop(): Promise<void> {
		if (this.wechaty) {
			try {
				await this.wechaty.stop();
			} catch (err) {
				this.logger.warn({
					msg: "wechat: stop error (ignored)",
					error: err instanceof Error ? err.message : String(err),
				});
			}
			this.wechaty = null;
		}
		this.ctx = null;
		this.dependencyMissing = false;
		await this.persistentDedupe.flush().catch(() => {});
	}

	async testConnection(): Promise<{ ok: boolean; message: string }> {
		const config = this.ctx?.config.channels.wechat;
		if (!config) return { ok: false, message: "配置缺失" };
		if (!config.acknowledgedRisk) {
			return { ok: false, message: "未确认风险提示" };
		}
		const mod = await tryLoadWechaty();
		if (!mod) {
			return {
				ok: false,
				message:
					"未检测到 wechaty 依赖；请在项目目录执行 `npm install wechaty wechaty-puppet-service`（或所选 puppet）后重试",
			};
		}
		return {
			ok: true,
			message: `依赖已就绪，puppet=${config.puppet}；实际可用需扫码登录成功`,
		};
	}

	async send(message: RemoteOutboundMessage): Promise<void> {
		if (!this.wechaty) {
			this.logger.warn({
				msg: "wechat: 未初始化，忽略发送",
				dependencyMissing: this.dependencyMissing,
			});
			return;
		}
		const config = this.ctx?.config.channels.wechat;
		if (!config) return;
		const sequentialEnabled = config.features?.sequential_delivery !== false;
		const instance = this.wechaty;

		const doSend = async () => {
			const chunks = chunkText(
				message.text,
				config.textChunkLimit ?? CHUNK_LIMIT,
			);
			for (const chunk of chunks) {
				try {
					if (message.target_id.startsWith("room:")) {
						const id = message.target_id.slice("room:".length);
						const room = await instance.Room?.find({ id });
						if (!room) {
							this.logger.warn({ msg: "wechat: room not found", id });
							continue;
						}
						await room.say(chunk);
					} else {
						const id = message.target_id.startsWith("contact:")
							? message.target_id.slice("contact:".length)
							: message.target_id;
						const contact = await instance.Contact?.find({ id });
						if (!contact) {
							this.logger.warn({ msg: "wechat: contact not found", id });
							continue;
						}
						await contact.say(chunk);
					}
				} catch (err) {
					this.logger.error({
						msg: "wechat: 发送消息失败",
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}
			this.ctx?.onStatusPatch({ last_outbound_at: Date.now() });
		};

		if (sequentialEnabled) {
			await this.outboundQueue(message.target_id, doSend);
		} else {
			await doSend();
		}
	}

	// ─── 内部 ────────────────────────────────────────────

	private resolvePuppetOptions(
		config: RemoteWechatConfig,
	): { puppet: string; puppetOptions?: Record<string, unknown> } | null {
		switch (config.puppet) {
			case "service":
				if (!config.token) return null;
				return {
					puppet: "wechaty-puppet-service",
					puppetOptions: {
						token: config.token,
						...(config.endpoint ? { endpoint: config.endpoint } : {}),
					},
				};
			case "padlocal":
				if (!config.token) return null;
				return {
					puppet: "wechaty-puppet-padlocal",
					puppetOptions: { token: config.token },
				};
			case "xp":
				return {
					puppet: "wechaty-puppet-xp",
				};
			default:
				return null;
		}
	}

	private registerEventHandlers(
		wechaty: WechatyInstance,
		config: RemoteWechatConfig,
	): void {
		wechaty.on("scan", (...args: unknown[]) => {
			const [qrcode, status] = args as [string, number];
			this.logger.info({
				msg: "wechat: scan to login",
				qrcode: typeof qrcode === "string" ? qrcode.slice(0, 60) : "?",
				status,
			});
		});
		wechaty.on("login", (...args: unknown[]) => {
			const [user] = args as [{ name?: () => string } | undefined];
			const name = typeof user?.name === "function" ? user.name() : "unknown";
			this.logger.info({ msg: "wechat: login", name });
			this.ctx?.onStatusPatch({
				connected: true,
				last_error: undefined,
			});
		});
		wechaty.on("logout", () => {
			this.ctx?.onStatusPatch({
				connected: false,
				last_error: "已登出",
			});
		});
		wechaty.on("error", (...args: unknown[]) => {
			const err = args[0];
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error({ msg: "wechat: error", error: msg });
			this.ctx?.onStatusPatch({ last_error: msg });
		});
		wechaty.on("message", async (...args: unknown[]) => {
			const msg = args[0] as WechatyMessage;
			await this.handleMessage(msg, config).catch((err) => {
				this.logger.error({
					msg: "wechat: message handler failed",
					error: err instanceof Error ? err.message : String(err),
				});
			});
		});
	}

	private async handleMessage(
		message: WechatyMessage,
		config: RemoteWechatConfig,
	): Promise<void> {
		if (message.self()) return;
		const text = message.text();
		if (!text) return;

		const talker = message.talker();
		const room = message.room();
		const isGroup = !!room;

		if (isGroup && !config.enableGroup) return;
		if (!isGroup && !config.enableDm) return;

		// 持久化去重
		if (config.features?.dedupe.persistent !== false) {
			const fresh = await this.persistentDedupe.checkAndRecord(
				`inbound:${isGroup ? "room" : "contact"}:${message.id()}`,
			);
			if (!fresh) return;
		}

		const senderId = talker?.id ?? "";
		const senderName =
			typeof talker?.name === "function" ? talker.name() : "unknown";

		let body = text.trim();
		if (isGroup && config.requireMention) {
			// Wechaty 的群 @ 检测通常靠 message.mentionSelf()，这里退化为文本前缀 "@"
			if (!body.startsWith("@")) return;
			body = body.replace(/^@\S+\s*/, "").trim();
			if (!body) return;
		}

		this.ctx?.onStatusPatch({ last_inbound_at: Date.now() });

		const targetId = isGroup ? `room:${room?.id ?? ""}` : `contact:${senderId}`;

		await this.ctx?.onInboundMessage({
			channel_id: "wechat",
			peer_id: senderId,
			peer_name: senderName,
			sender_id: senderId,
			sender_name: senderName,
			is_group: isGroup,
			text: body,
			message_id: message.id(),
			target_id: targetId,
		});
	}

	private updateCapabilitiesPlaceholder(): void {
		updateChannelCapabilityEntry({
			channelId: "wechat",
			label: "个人微信（未就绪）",
			status: "placeholder",
			capabilities: {
				text: false,
				card: false,
				streaming: false,
				typing: false,
				interactive: false,
				editMessage: false,
				deleteMessage: false,
				reactions: false,
				pin: false,
				media: false,
			},
		});
	}

	private updateCapabilitiesLive(): void {
		const config = this.ctx?.config.channels.wechat;
		const streaming = (config?.features?.streaming.mode ?? "edit") !== "off";
		updateChannelCapabilityEntry({
			channelId: "wechat",
			label: "个人微信（Wechaty · 实验）",
			status: "sdk",
			capabilities: {
				text: true,
				card: false,
				streaming, // 降级分段发送
				typing: false,
				interactive: false,
				editMessage: false,
				deleteMessage: false,
				reactions: false,
				pin: false,
				media: true, // wechaty 支持图片/文件
			},
		});
	}
}
