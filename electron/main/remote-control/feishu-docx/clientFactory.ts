import * as Lark from "@larksuiteoapi/node-sdk";
import type { FeishuDocxExecutionConfig } from "./types";

export function createFeishuDocxClient(
	config: Pick<FeishuDocxExecutionConfig, "appId" | "appSecret" | "domain">,
): Lark.Client {
	return new Lark.Client({
		appId: config.appId,
		appSecret: config.appSecret,
		appType: Lark.AppType.SelfBuild,
		domain: config.domain === "lark" ? Lark.Domain.Lark : Lark.Domain.Feishu,
	});
}
