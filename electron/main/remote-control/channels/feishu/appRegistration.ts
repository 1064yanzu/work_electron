/**
 * appRegistration.ts — 飞书应用扫码注册（OAuth Device Code Flow）
 *
 * 移植自 openclaw 的 `feishu-auth.ts`（extensions/feishu/src/app-registration.ts），
 * 利用飞书官方 OAuth 的 archetype=PersonalAgent 原型，让用户通过手机扫码
 * 自动创建并授权应用，实现零手动输入的配置体验。
 *
 * 流程：
 *   1. init  → 校验环境支持 client_secret auth
 *   2. begin → 获取 device_code + verification_uri_complete（转 QR）
 *   3. poll  → 轮询直到授权成功 / 被拒 / 过期 / 超时；成功返回 appId + appSecret + openId + domain
 */

import { randomUUID } from "node:crypto";
import QRCode from "qrcode";

const FEISHU_ACCOUNTS_URL = "https://accounts.feishu.cn";
const LARK_ACCOUNTS_URL = "https://accounts.larksuite.com";
const REGISTRATION_PATH = "/oauth/v1/app/registration";
const REQUEST_TIMEOUT_MS = 10_000;

export type FeishuDomain = "feishu" | "lark";

function accountsBaseUrl(domain: FeishuDomain): string {
	return domain === "lark" ? LARK_ACCOUNTS_URL : FEISHU_ACCOUNTS_URL;
}

// ─── OAuth 请求封装 ─────────────────────────────────────────

async function postRegistration<T>(
	baseUrl: string,
	body: Record<string, string>,
): Promise<T> {
	const res = await fetch(`${baseUrl}${REGISTRATION_PATH}`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(body).toString(),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	// 注意：飞书对 pending 状态返回 4xx + JSON body，所以不能按 res.ok 抛错
	return (await res.json()) as T;
}

// ─── 1. init ───────────────────────────────────────────────

interface InitResponse {
	nonce?: string;
	supported_auth_methods?: string[];
}

export async function initAppRegistration(
	domain: FeishuDomain = "feishu",
): Promise<void> {
	const baseUrl = accountsBaseUrl(domain);
	const res = await postRegistration<InitResponse>(baseUrl, { action: "init" });
	if (!res.supported_auth_methods?.includes("client_secret")) {
		throw new Error("当前环境不支持 client_secret 认证方法");
	}
}

// ─── 2. begin ──────────────────────────────────────────────

interface RawBeginResponse {
	device_code: string;
	verification_uri: string;
	user_code: string;
	verification_uri_complete: string;
	interval: number;
	expire_in: number;
}

export interface BeginResult {
	sessionId: string;
	deviceCode: string;
	qrUrl: string;
	qrDataUrl: string;
	userCode: string;
	intervalSec: number;
	expireInSec: number;
}

export async function beginAppRegistration(
	domain: FeishuDomain = "feishu",
): Promise<BeginResult> {
	const baseUrl = accountsBaseUrl(domain);
	const res = await postRegistration<RawBeginResponse>(baseUrl, {
		action: "begin",
		archetype: "PersonalAgent",
		auth_method: "client_secret",
		request_user_info: "open_id",
	});

	const qrUrl = new URL(res.verification_uri_complete);
	qrUrl.searchParams.set("from", "ipo_workbench_onboard");
	qrUrl.searchParams.set("tp", "ob_app");

	const qrDataUrl = await QRCode.toDataURL(qrUrl.toString(), {
		errorCorrectionLevel: "M",
		margin: 2,
		width: 320,
		color: {
			dark: "#141413",
			light: "#ffffff",
		},
	});

	return {
		sessionId: randomUUID(),
		deviceCode: res.device_code,
		qrUrl: qrUrl.toString(),
		qrDataUrl,
		userCode: res.user_code,
		intervalSec: res.interval || 5,
		expireInSec: res.expire_in || 600,
	};
}

// ─── 3. poll ───────────────────────────────────────────────

interface PollResponse {
	client_id?: string;
	client_secret?: string;
	user_info?: {
		open_id?: string;
		tenant_brand?: "feishu" | "lark";
	};
	error?: string;
	error_description?: string;
}

export type PollOutcome =
	| {
			status: "pending";
			domain: FeishuDomain;
			intervalSec: number;
	  }
	| {
			status: "success";
			appId: string;
			appSecret: string;
			domain: FeishuDomain;
			openId?: string;
	  }
	| { status: "access_denied" }
	| { status: "expired" }
	| { status: "error"; message: string };

/**
 * 单次轮询（由前端按 interval 调用，而不是后端自己长轮询）。
 *
 * @param deviceCode    begin 阶段返回的 device_code
 * @param currentDomain 当前猜测的域名（初始 feishu；若 tenant_brand=lark 后切换到 lark）
 */
export async function pollAppRegistrationOnce(params: {
	deviceCode: string;
	currentDomain: FeishuDomain;
	intervalSec: number;
}): Promise<PollOutcome> {
	const baseUrl = accountsBaseUrl(params.currentDomain);

	let pollRes: PollResponse;
	try {
		pollRes = await postRegistration<PollResponse>(baseUrl, {
			action: "poll",
			device_code: params.deviceCode,
			tp: "ob_app",
		});
	} catch {
		// 瞬时网络错误：让前端继续按 interval 轮询
		return {
			status: "pending",
			domain: params.currentDomain,
			intervalSec: params.intervalSec,
		};
	}

	// 自动切换到 lark
	const brand = pollRes.user_info?.tenant_brand;
	if (brand === "lark" && params.currentDomain !== "lark") {
		return {
			status: "pending",
			domain: "lark",
			intervalSec: params.intervalSec,
		};
	}

	if (pollRes.client_id && pollRes.client_secret) {
		return {
			status: "success",
			appId: pollRes.client_id,
			appSecret: pollRes.client_secret,
			domain: brand === "lark" ? "lark" : params.currentDomain,
			openId: pollRes.user_info?.open_id,
		};
	}

	if (pollRes.error) {
		if (pollRes.error === "authorization_pending") {
			return {
				status: "pending",
				domain: params.currentDomain,
				intervalSec: params.intervalSec,
			};
		}
		if (pollRes.error === "slow_down") {
			return {
				status: "pending",
				domain: params.currentDomain,
				intervalSec: params.intervalSec + 5,
			};
		}
		if (pollRes.error === "access_denied") {
			return { status: "access_denied" };
		}
		if (pollRes.error === "expired_token") {
			return { status: "expired" };
		}
		return {
			status: "error",
			message: `${pollRes.error}: ${pollRes.error_description ?? "unknown"}`,
		};
	}

	return {
		status: "pending",
		domain: params.currentDomain,
		intervalSec: params.intervalSec,
	};
}
