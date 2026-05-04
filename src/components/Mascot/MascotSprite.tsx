import { cn } from "../../lib/utils";
import {
	getMascotAtlas,
	getMotionSpec,
	type MascotMotion,
} from "../../lib/mascot/manifest";
import { useMascot } from "../../lib/mascotStore";
import { SpriteAnimator } from "./SpriteAnimator";

export interface MascotSpriteProps {
	motion: MascotMotion;
	/** 渲染尺寸（CSS px） */
	size?: number;
	className?: string;
	/** 不可见时暂停以省 CPU */
	paused?: boolean;
	/** 是否循环（false 时播完停在最后一帧） */
	loop?: boolean;
	/** atlas 缺位 / IP 关闭时的 fallback */
	fallback?: React.ReactNode;
}

/**
 * MascotSprite — 当前 IP × motion 的 spritesheet 包装层
 *
 * 自动绑定 useMascot().id 取对应 atlas，缺位（off / 资产未生成）走 fallback。
 * 业务侧只需要传 motion 语义即可，不用关心 IP 切换或资产路径。
 */
export function MascotSprite({
	motion,
	size = 96,
	className,
	paused,
	loop = true,
	fallback = null,
}: MascotSpriteProps) {
	const { id, enabled } = useMascot();
	if (!enabled || id === "off") return <>{fallback}</>;
	const atlasUrl = getMascotAtlas(id);
	if (!atlasUrl) return <>{fallback}</>;
	const row = getMotionSpec(motion);

	return (
		<SpriteAnimator
			atlasUrl={atlasUrl}
			row={row}
			size={size}
			paused={paused}
			loop={loop}
			className={cn(className)}
		/>
	);
}
