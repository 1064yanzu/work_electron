/**
 * ProviderList.tsx — ModelSettings 左侧服务商列表
 *
 * Phase 4 · 对应 tasks.md 4.2。
 * - 顶部搜索框用 `SettingsTextInput`（R3.7），不再手写 <input>；
 * - 搜索大小写不敏感，按 name 子串匹配（与原 ModelSettings 行为一致）；
 * - 底部「添加服务商」按钮改用 `SettingsButton`（pill / secondary）；
 * - 点击列表项与原组件一致：切换 `selectedId`。
 */
import { Plus, Search } from "lucide-react";
import { useMemo } from "react";
import { cn } from "../../../../../lib/utils";
import type { Provider } from "../../../constants";
import { getProviderIcon } from "../../../providerIcons";
import { SettingsButton, SettingsTextInput } from "../../../ui/SettingsPrimitives";

export interface ProviderListProps {
	providers: Provider[];
	selectedId: string;
	searchQuery: string;
	onSearchChange: (next: string) => void;
	onSelect: (id: string) => void;
	onAdd: () => void;
}

export function ProviderList({
	providers,
	selectedId,
	searchQuery,
	onSearchChange,
	onSelect,
	onAdd,
}: ProviderListProps) {
	const normalized = searchQuery.trim().toLowerCase();
	const filtered = useMemo(
		() =>
			providers.filter((p) =>
				normalized ? p.name.toLowerCase().includes(normalized) : true,
			),
		[providers, normalized],
	);

	return (
		<div className="flex w-60 flex-col border-r border-border/80 bg-warm-50/50">
			<div className="p-4">
				<SettingsTextInput
					value={searchQuery}
					onChange={onSearchChange}
					placeholder="搜索模型平台..."
					prefix={
						<Search
							className="h-4 w-4 text-text-light"
							strokeWidth={1.8}
						/>
					}
					aria-label="搜索模型平台"
				/>
			</div>

			<div className="flex-1 space-y-1 overflow-y-auto px-3">
				{filtered.length === 0 ? (
					<p className="px-3 py-6 text-center text-[12px] text-text-light">
						没有匹配的服务商
					</p>
				) : (
					filtered.map((provider) => {
						const active = selectedId === provider.id;
						return (
							<button
								key={provider.id}
								type="button"
								onClick={() => onSelect(provider.id)}
								className={cn(
									"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left",
									"transition-[background-color,box-shadow,border-color] duration-150",
									active
										? "bg-surface shadow-sm ring-1 ring-zinc-200/80"
										: "hover:bg-surface/60",
								)}
							>
								<div
									className={cn(
										"flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-white shadow-sm",
										provider.color,
									)}
								>
									{getProviderIcon(provider.templateId) ? (
										<img
											src={getProviderIcon(provider.templateId)}
											alt={provider.name}
											className="h-full w-full object-cover"
										/>
									) : (
										provider.icon && (
											<provider.icon className="h-5 w-5" />
										)
									)}
								</div>
								<span className="flex-1 truncate text-sm font-medium text-text-primary">
									{provider.name}
								</span>
							</button>
						);
					})
				)}
			</div>

			<div className="border-t border-border/80 p-4">
				<SettingsButton
					variant="secondary"
					size="md"
					pill
					icon={Plus}
					onClick={onAdd}
					className="w-full justify-center py-2.5"
				>
					添加服务商
				</SettingsButton>
			</div>
		</div>
	);
}
