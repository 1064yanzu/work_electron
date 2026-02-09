import { Image, MessageSquare, Paintbrush, Zap } from "lucide-react";

export type BadgeType = "vision" | "function" | "reasoning" | "image-gen";

interface ModelBadgeProps {
	type: BadgeType;
}

const badgeConfig = {
	vision: {
		icon: Image,
		bg: "bg-emerald-50",
		text: "text-emerald-600",
		border: "border-emerald-200",
		title: "视觉能力",
	},
	function: {
		icon: Zap,
		bg: "bg-amber-50",
		text: "text-amber-600",
		border: "border-amber-200",
		title: "函数调用",
	},
	reasoning: {
		icon: MessageSquare,
		bg: "bg-blue-50",
		text: "text-blue-600",
		border: "border-blue-200",
		title: "推理能力",
	},
	"image-gen": {
		icon: Paintbrush,
		bg: "bg-cyan-50 dark:bg-cyan-950/30",
		text: "text-cyan-700 dark:text-cyan-300",
		border: "border-cyan-200 dark:border-cyan-800/50",
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
