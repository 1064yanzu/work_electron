/**
 * ProviderDetailHeader.tsx — 右侧详情区顶部：图标 + 服务商名 + 外链 + 启用开关
 *
 * Phase 4 · 对应 tasks.md 4.3。
 */
import { ExternalLink } from "lucide-react";
import { cn } from "../../../../../lib/utils";
import type { Provider } from "../../../constants";
import { SettingsSwitch } from "../../../ui/SettingsPrimitives";
import { getProviderIcon } from "../../../providerIcons";
import {
	getProviderColorProps,
	getTemplateForProvider,
	openUrl,
} from "../../../utils";

export interface ProviderDetailHeaderProps {
	provider: Provider;
	onToggle: (id: string) => void;
}

export function ProviderDetailHeader({
	provider,
	onToggle,
}: ProviderDetailHeaderProps) {
	const template = getTemplateForProvider(provider);
	const colorProps = getProviderColorProps(provider.color);

	return (
		<div className="mb-10 flex items-center justify-between pr-10">
			<div className="flex items-center gap-3">
				<div
					className={cn(
						"flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl shadow-sm",
						colorProps.className,
					)}
					style={colorProps.style}
				>
					{getProviderIcon(provider.templateId) ? (
						<img
							src={getProviderIcon(provider.templateId)}
							alt={provider.name}
							className="h-full w-full object-cover"
						/>
					) : (
						provider.icon && <provider.icon className="h-6 w-6" />
					)}
				</div>
				<h2 className="text-xl font-semibold text-text-primary">
					{provider.name}
				</h2>
				{template?.homeUrl && (
					<button
						type="button"
						onClick={() => openUrl(template.homeUrl!)}
						className={cn(
							"rounded-lg p-1.5 text-text-light",
							"transition-[color,background-color] duration-150",
							"hover:bg-warm-200 hover:text-text-secondary",
						)}
						title="访问官网"
					>
						<ExternalLink className="h-4 w-4" />
					</button>
				)}
			</div>
			<SettingsSwitch
				checked={provider.isEnabled}
				onChange={() => onToggle(provider.id)}
			/>
		</div>
	);
}
