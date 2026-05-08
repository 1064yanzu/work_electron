/**
 * ShinyText
 *
 * 给一段文字添加横向"扫光"动效，常用于强调"正在进行"的状态。
 * Props 与 React Bits 同名组件保持兼容（speed/delay/spread/direction/yoyo/pauseOnHover/disabled）。
 *
 * 实现方式：纯 CSS keyframes + linear-gradient + background-clip:text，
 * 不引入任何运行时 JS 帧驱动库（项目未依赖 motion/framer-motion）。
 */
import {
	useState,
	useCallback,
	type CSSProperties,
	type ReactNode,
} from "react";
import "./ShinyText.css";

export interface ShinyTextProps {
	/** 要应用动效的文字内容；优先级低于 children */
	text?: ReactNode;
	children?: ReactNode;
	/** 文字底色（暗部） */
	color?: string;
	/** 高光颜色（亮部） */
	shineColor?: string;
	/** 单次扫光时长（秒） */
	speed?: number;
	/** 每次循环之间的等待时长（秒） */
	delay?: number;
	/** 渐变铺设方向（度） */
	spread?: number;
	/** 扫光方向 */
	direction?: "left" | "right";
	/** 是否往返摆动而非单向循环 */
	yoyo?: boolean;
	/** 鼠标悬浮时暂停 */
	pauseOnHover?: boolean;
	/** 关闭动效（仅显示底色文字） */
	disabled?: boolean;
	className?: string;
	style?: CSSProperties;
	title?: string;
}

export function ShinyText({
	text,
	children,
	color = "#b5b5b5",
	shineColor = "#ffffff",
	speed = 2,
	delay = 0,
	spread = 120,
	direction = "left",
	yoyo = false,
	pauseOnHover = false,
	disabled = false,
	className = "",
	style,
	title,
}: ShinyTextProps) {
	const [hoverPaused, setHoverPaused] = useState(false);

	const handleMouseEnter = useCallback(() => {
		if (pauseOnHover) setHoverPaused(true);
	}, [pauseOnHover]);

	const handleMouseLeave = useCallback(() => {
		if (pauseOnHover) setHoverPaused(false);
	}, [pauseOnHover]);

	const cssVars: CSSProperties = {
		// 自定义属性透传到 CSS
		// CSS 端通过 var(--shiny-*) 取值
		// 单次循环时长 = speed + delay（用 keyframes 60% 之后的停顿模拟 delay）
		["--shiny-color" as any]: color,
		["--shiny-shine-color" as any]: shineColor,
		["--shiny-spread" as any]: `${spread}deg`,
		["--shiny-speed" as any]: `${Math.max(0.1, speed + delay)}s`,
		["--shiny-delay" as any]: `${0}s`,
		...style,
	};

	const classes = [
		"shiny-text",
		!disabled && "shiny-text--animated",
		direction === "right" && "shiny-text--reverse",
		yoyo && "shiny-text--yoyo",
		hoverPaused && "shiny-text--paused",
		className,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<span
			className={classes}
			style={cssVars}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			title={title}
		>
			{children ?? text}
		</span>
	);
}

export default ShinyText;
