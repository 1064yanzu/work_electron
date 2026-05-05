import { safeInvoke } from "../tauriBridge";

// ─── 飞书 · 扫码创建应用（OAuth Device Code Flow）───────────

export interface FeishuBeginAppRegistrationResult {
	sessionId: string;
	deviceCode: string;
	qrUrl: string;
	qrDataUrl: string;
	userCode: string;
	intervalSec: number;
	expireInSec: number;
}

export type FeishuPollAppRegistrationResult =
	| { status: "pending"; domain: "feishu" | "lark"; intervalSec: number }
	| {
			status: "success";
			appId: string;
			appSecret: string;
			domain: "feishu" | "lark";
			openId?: string;
	  }
	| { status: "access_denied" }
	| { status: "expired" }
	| { status: "error"; message: string };

export async function beginFeishuAppRegistration(
	domain: "feishu" | "lark" = "feishu",
): Promise<FeishuBeginAppRegistrationResult> {
	return await safeInvoke("feishu_begin_app_registration", { domain });
}

export async function pollFeishuAppRegistration(params: {
	deviceCode: string;
	currentDomain: "feishu" | "lark";
	intervalSec: number;
}): Promise<FeishuPollAppRegistrationResult> {
	return await safeInvoke("feishu_poll_app_registration", params);
}
