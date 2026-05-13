/**
 * Channel 文件上下行能力（IM 远程终端专用）。
 *
 * 各 IM 渠道按需实现：
 *   - feishu: 通过 im.file.upload + im.message.create(msg_type=file)
 *   - telegram: bot.api.sendDocument
 *   - slack: files.uploadV2
 *   - discord: channel.send({ files })
 *
 * 由 PtyBridgeService 在执行 `/cli get <path>` 命令时调用，把 cwd 下的文件
 * 经 IM 回传给用户。入站方向（手机端发图/文件到 IM）则在 channel 的
 * onInboundMessage 阶段直接通过 RemoteInboundMessage.inbound_files 暴露
 * download 闭包，PtyBridgeService 落到 cwd/.uploads。
 */

export type ChannelFileSendParams = {
	targetId: string;
	fileName: string;
	data: Buffer;
	mimeType?: string;
	/** 附带的说明文字（可选，部分渠道支持） */
	caption?: string;
	/** 回复某条 IM 消息（可选） */
	replyToMessageId?: string;
};

export interface ChannelFileTransfer {
	/** 是否启用（凭证/能力齐全后才返回 true） */
	isEnabled(): boolean;
	/** 把 Buffer 作为文件发送到 IM 对话。 */
	sendFile(params: ChannelFileSendParams): Promise<void>;
}
