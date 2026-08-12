/**
 * ProviderApiBaseSection.tsx — API 地址 + preview URL + 默认端点类型
 *
 * Phase 4 · 对应 tasks.md 4.5。
 * - API Base 输入走 `SettingsTextInput`（R3.7）；
 * - 预览 URL + 默认端点类型收到 `SettingsDisclosure id="ai.models.advanced"`（R6.2）；
 * - 端点类型 Select 保留 `chat_completions / responses` 两个选项。
 */
import { useSettingsStore } from "../../../../../lib/settingsStore";
import Select from "../../../../ui/Select";
import type { Provider } from "../../../constants";
import { settingsAnchorProps } from "../../../fieldRegistry";
import { SettingsTextInput } from "../../../ui/SettingsPrimitives";
import { SettingsDisclosure } from "../../../ui/SettingsDisclosure";
import { getTemplateForProvider } from "../../../utils";
import {
	computeApiPreviewUrl,
	getDefaultEndpointType,
	isEndpointConfigurableProvider,
} from "./types";

export interface ProviderApiBaseSectionProps {
	provider: Provider;
}

export function ProviderApiBaseSection({
	provider,
}: ProviderApiBaseSectionProps) {
	const { settingsStore } = useSettingsStore();

	const template = getTemplateForProvider(provider);
	const defaultEndpointType = getDefaultEndpointType(
		provider.metadata as Record<string, unknown> | undefined,
	);
	const apiPreviewUrl = computeApiPreviewUrl(provider, defaultEndpointType);
	const canConfigureEndpoint = isEndpointConfigurableProvider(
		provider.providerType,
	);

	return (
		<section className="mb-8" {...settingsAnchorProps("ai.models.apiBase")}>
			<div className="mb-3 flex items-center gap-2">
				<label className="text-sm font-medium text-text-secondary">
					API 地址
				</label>
				<span className="rounded-md bg-warm-200 px-2 py-0.5 text-xs text-text-light">
					可选
				</span>
			</div>

			<SettingsTextInput
				value={provider.apiBase || ""}
				onChange={(next) =>
					settingsStore.updateProvider(provider.id, { apiBase: next })
				}
				placeholder={template?.defaultApiBase || "https://api.openai.com/v1"}
				mono
				size="lg"
				aria-label="API 地址"
			/>

			{(apiPreviewUrl || canConfigureEndpoint) && (
				<div className="mt-3">
					<SettingsDisclosure id="ai.models.advanced" title="高级选项">
						<div
							className="space-y-5 pt-3"
							{...settingsAnchorProps("ai.models.endpointType")}
						>
							{provider.apiBase && apiPreviewUrl && (
								<div>
									<label className="mb-2 block text-xs font-medium text-text-secondary">
										请求预览
									</label>
									<p className="break-all rounded-lg border border-border/70 bg-warm-50/60 px-3 py-2 font-mono text-xs text-text-muted">
										{apiPreviewUrl}
									</p>
								</div>
							)}
							{canConfigureEndpoint && (
								<div>
									<label className="mb-2 block text-xs font-medium text-text-secondary">
										默认端点类型
									</label>
									<Select
										value={defaultEndpointType}
										onChange={(e) =>
											settingsStore.updateProvider(provider.id, {
												metadata: {
													...(provider.metadata || {}),
													openai_endpoint_type: e.target.value,
												},
											})
										}
									>
										<option value="chat_completions">兼容型</option>
										<option value="responses">Responses</option>
									</Select>
									<p className="mt-2 text-xs text-text-light">
										未单独配置的模型会继承此默认端点类型。
									</p>
								</div>
							)}
						</div>
					</SettingsDisclosure>
				</div>
			)}
		</section>
	);
}
