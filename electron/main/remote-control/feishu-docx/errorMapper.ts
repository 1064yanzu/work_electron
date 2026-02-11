import { extractFeishuApiErrorInfo } from "../channels/feishu/feishuApiError";

export type FeishuDocxToolError = {
	message: string;
	feishu_code?: number;
	feishu_msg?: string;
	feishu_log_id?: string;
};

export function mapFeishuDocxToolError(error: unknown): FeishuDocxToolError {
	const info = extractFeishuApiErrorInfo(error);
	const fallback = error instanceof Error ? error.message : String(error);
	return {
		message: info.message || info.msg || fallback,
		feishu_code: info.code,
		feishu_msg: info.msg,
		feishu_log_id: info.logId,
	};
}
