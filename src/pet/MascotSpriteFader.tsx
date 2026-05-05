/**
 * MascotSpriteFader — SpriteAnimator 的薄包装，motion 切换时做 150ms cross-fade
 *
 * 设计动机：直接换 row 会瞬间替换 atlas 行，视觉上"硬切"。
 * 这里通过双层 SpriteAnimator + opacity transition 让上一段动画渐隐、新动画渐显，
 * 切换完成后只保留单层（避免长时间双层 spritesheet 同时跑动浪费 CPU）。
 *
 * 实现要点：
 * - 用 incomingMotion / outgoingMotion 两层
 * - motion prop 变化时：把当前层标记为 outgoing、把新 motion 设为 incoming
 * - 150ms 后 outgoing 卸载，只剩 incoming
 * - 用 key 化让每个 row 有独立的 frame state，避免 row 切换时的帧错位闪烁
 */

import { useEffect, useRef, useState } from "react";
import { SpriteAnimator } from "../components/Mascot/SpriteAnimator";
import { getMotionSpec, type MascotMotion } from "../lib/mascot/manifest";

const FADE_MS = 150;

export interface MascotSpriteFaderProps {
	atlasUrl: string;
	motion: MascotMotion;
	size?: number;
	paused?: boolean;
}

interface Layer {
	motion: MascotMotion;
	id: number;
	visible: boolean;
}

let layerSeq = 0;

export function MascotSpriteFader({
	atlasUrl,
	motion,
	size = 180,
	paused = false,
}: MascotSpriteFaderProps) {
	const [layers, setLayers] = useState<Layer[]>(() => [
		{ motion, id: ++layerSeq, visible: true },
	]);
	const lastMotionRef = useRef<MascotMotion>(motion);
	const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (motion === lastMotionRef.current) return;
		lastMotionRef.current = motion;

		// 把现有层标 outgoing（visible=false 触发淡出），同时插入一层新 motion（visible=true 淡入）
		setLayers((prev) => {
			const outgoing = prev.map((layer) => ({ ...layer, visible: false }));
			const incoming: Layer = { motion, id: ++layerSeq, visible: true };
			return [...outgoing, incoming];
		});

		// FADE_MS 后丢弃所有 outgoing
		if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
		cleanupTimerRef.current = setTimeout(() => {
			setLayers((prev) => prev.filter((layer) => layer.visible));
		}, FADE_MS + 10);

		return () => {
			if (cleanupTimerRef.current) {
				clearTimeout(cleanupTimerRef.current);
				cleanupTimerRef.current = null;
			}
		};
	}, [motion]);

	const renderHeight = size * (208 / 192);

	return (
		<div
			className="relative"
			style={{ width: `${size}px`, height: `${renderHeight}px` }}
		>
			{layers.map((layer) => (
				<div
					key={layer.id}
					className="absolute inset-0"
					style={{
						opacity: layer.visible ? 1 : 0,
						transition: `opacity ${FADE_MS}ms ease-out`,
					}}
				>
					<SpriteAnimator
						atlasUrl={atlasUrl}
						row={getMotionSpec(layer.motion)}
						size={size}
						paused={paused}
						loop={true}
					/>
				</div>
			))}
		</div>
	);
}
