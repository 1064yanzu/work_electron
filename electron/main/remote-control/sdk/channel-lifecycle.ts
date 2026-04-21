/**
 * 渠道插件生命周期接口
 *
 * 设计取舍：
 * - 保留最小方法集，跟原 `RemoteChannelPlugin` 一致风格
 * - 增加 `probe`（不启动实际连接只验证配置）和 `reload`（配置变化后热更新）
 */

import type { ChannelRuntimeContext } from "./channel-runtime-context";

/**
 * 渠道探针结果。
 */
export type ChannelProbeResult = {
	ok: boolean;
	message: string;
	/** 额外诊断信息（例如检测到的 bot 名、用户名、token 权限范围等） */
	details?: Record<string, unknown>;
};

/**
 * 生命周期接口。渠道 plugin 必须实现。
 */
export type ChannelLifecycle = {
	/** 启动（建立连接 / 开始监听） */
	start: (ctx: ChannelRuntimeContext) => Promise<void>;

	/** 停止（关闭连接 / 清理资源） */
	stop: () => Promise<void>;

	/**
	 * 配置热更（可选；未实现时由 orchestrator 降级为 stop + start） */
	reload?: (ctx: ChannelRuntimeContext) => Promise<void>;

	/**
	 * 探针：仅验证凭据/可达性，不建立长连接。
	 * 用于「测试连接」按钮。
	 */
	probe: (ctx: ChannelRuntimeContext) => Promise<ChannelProbeResult>;
};
