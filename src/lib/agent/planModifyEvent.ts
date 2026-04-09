/**
 * Plan Modify Event — 计划修改事件
 *
 * 轻量级事件机制：PlanCard 发出修改 feedback，CopilotSidebar 监听并触发新一轮 Agent 请求。
 * 使用 window CustomEvent，无需额外依赖。
 */

const PLAN_MODIFY_EVENT = "plan-modify-feedback";

export interface PlanModifyDetail {
	feedback: string;
}

/** 发起计划修改请求（由 PlanCard 调用） */
export function emitPlanModifyFeedback(feedback: string): void {
	window.dispatchEvent(
		new CustomEvent<PlanModifyDetail>(PLAN_MODIFY_EVENT, {
			detail: { feedback },
		}),
	);
}

/** 监听计划修改请求（由 CopilotSidebar 调用） */
export function onPlanModifyFeedback(
	handler: (feedback: string) => void,
): () => void {
	const listener = (e: Event) => {
		const detail = (e as CustomEvent<PlanModifyDetail>).detail;
		if (detail?.feedback) {
			handler(detail.feedback);
		}
	};
	window.addEventListener(PLAN_MODIFY_EVENT, listener);
	return () => window.removeEventListener(PLAN_MODIFY_EVENT, listener);
}
