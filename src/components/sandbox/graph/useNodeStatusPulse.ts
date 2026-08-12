/**
 * useNodeStatusPulse —— 运行图节点状态落定时的一次注意力提示。
 *
 * 执行图经常是几十个节点同时在跑，颜色从橙变绿是唯一的完成信号，
 * 视线不在那个节点上就完全错过。加一下轻微的放大回弹，
 * 余光也能捕捉到"刚刚有东西完成/失败了"。
 *
 * 两条约束：
 * - **首次挂载不放**：否则打开执行图的瞬间几十个节点一起跳，像出故障；
 * - 动画写在节点内层容器上。xyflow 用 transform 给节点定位，
 *   在它管的那层元素上写 transform 会让节点漂走。
 */

import { useRef } from "react";

import { attentionPulse, useGsapMotion } from "../../../lib/motion";

export function useNodeStatusPulse(status: string) {
	const ref = useRef<HTMLDivElement>(null);
	const seenRef = useRef<string | null>(null);

	useGsapMotion(
		() => {
			const previous = seenRef.current;
			seenRef.current = status;
			// 首次记录（挂载）不放动画
			if (previous === null || previous === status) return;
			if (status !== "completed" && status !== "error") return;
			attentionPulse(ref.current, { scale: 1.035, duration: 0.5 });
		},
		{ dependencies: [status] },
	);

	return ref;
}
