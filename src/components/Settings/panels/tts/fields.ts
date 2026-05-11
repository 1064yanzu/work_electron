/**
 * panels/tts/fields.ts — `workshop.tts` 面板可搜索字段声明
 */
import type { FieldDescriptor } from "../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "workshop.tts",
		anchorId: "workshop.tts.global",
		label: "语音朗读全局设置",
		description: "默认服务商、采样率、音量、并发等基础参数",
		keywords: ["tts", "voice", "语音", "朗读", "speech"],
	},
	{
		tabId: "workshop.tts",
		anchorId: "workshop.tts.providers",
		label: "TTS 服务商",
		description: "OpenAI / Google / Azure / 火山引擎 / 自定义 等接入与音色配置",
		keywords: ["provider", "openai", "azure", "volc", "服务商", "接入"],
	},
	{
		tabId: "workshop.tts",
		anchorId: "workshop.tts.voices",
		label: "音色与音色克隆",
		description: "管理已克隆音色，调整试听样本",
		keywords: ["voice", "clone", "音色", "克隆"],
	},
	{
		tabId: "workshop.tts",
		anchorId: "workshop.tts.scenes",
		label: "TTS 场景",
		description: "为不同场景（朗读 / 通知 / 文档摘要）指定默认音色",
		keywords: ["scene", "场景", "默认音色"],
	},
];
