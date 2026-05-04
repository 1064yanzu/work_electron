import { Image, MessageSquare, Paintbrush, Zap } from "lucide-react";

export type BadgeType = "vision" | "function" | "reasoning" | "image-gen";

interface ModelBadgeProps {
	type: BadgeType;
}

const badgeConfig = {
	vision: {
		icon: Image,
		bg: "bg-mint-500/10",
		text: "text-mint-600",
		border: "border-mint-500/30",
		title: "视觉能力",
	},
	function: {
		icon: Zap,
		bg: "bg-warm-200",
		text: "text-text-secondary",
		border: "border-border",
		title: "函数调用",
	},
	reasoning: {
		icon: MessageSquare,
		bg: "bg-violetx-500/10",
		text: "text-violetx-500",
		border: "border-violetx-500/30",
		title: "推理能力",
	},
	"image-gen": {
		icon: Paintbrush,
		bg: "bg-peach-500/10",
		text: "text-peach-500",
		border: "border-peach-500/30",
		title: "图像生成",
	},
};

export function ModelBadge({ type }: ModelBadgeProps) {
	const config = badgeConfig[type];
	const Icon = config.icon;

	return (
		<span
			title={config.title}
			className={`inline-flex items-center px-1.5 py-0.5 rounded-md border ${config.bg} ${config.text} ${config.border}`}
		>
			<Icon className="w-3 h-3" />
		</span>
	);
}

// 根据模型名称推断能力标签
export function getModelBadges(model: string): BadgeType[] {
	const badges: BadgeType[] = [];
	const l = model.toLowerCase();

	// 视觉能力
	if (
		l.includes("4o") ||
		l.includes("vision") ||
		l.includes("gemini") ||
		l.includes("claude-3")
	) {
		badges.push("vision");
	}
	// 推理能力
	if (l.includes("o1") || l.includes("reasoner") || l.includes("r1")) {
		badges.push("reasoning");
	}
	// 图像生成能力
	if (
		l.includes("dall-e") ||
		l.includes("dalle") ||
		l.includes("flux") ||
		l.includes("stable-diffusion") ||
		l.includes("sd-") ||
		l.includes("sdxl") ||
		l.includes("midjourney") ||
		l.includes("cogview") ||
		l.includes("wanx") ||
		l.includes("imagen")
	) {
		badges.push("image-gen");
	}
	// 函数调用
	if (l.includes("gpt-4") || l.includes("claude") || l.includes("gemini")) {
		badges.push("function");
	}

	return badges;
}
