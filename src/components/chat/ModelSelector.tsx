// 模型选择器组件
import { Check, Sparkles } from "lucide-react";
import { getModelIcon } from "../Settings/modelIcons";

interface Model {
	id: string;
	provider: string;
}

interface ModelSelectorProps {
	models: Model[];
	activeModel: string | null;
	onSelect: (modelId: string) => void;
	onClose: () => void;
}

export function ModelSelector({
	models,
	activeModel,
	onSelect,
	onClose,
}: ModelSelectorProps) {
	// 按提供商分组
	const groupedModels = models.reduce(
		(groups, model) => {
			if (!groups[model.provider]) groups[model.provider] = [];
			groups[model.provider].push(model);
			return groups;
		},
		{} as Record<string, Model[]>,
	);

	return (
		<>
			{/* Backdrop */}
			<div className="fixed inset-0 z-40" onClick={onClose} />

			{/* Dropdown */}
			<div className="absolute left-0 bottom-full mb-2 z-50 w-64 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
				<div className="p-2 border-b border-zinc-100 dark:border-zinc-700">
					<div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-zinc-500">
						<Sparkles className="w-3.5 h-3.5" />
						选择模型
					</div>
				</div>

				<div className="max-h-[300px] overflow-y-auto p-1">
					{Object.entries(groupedModels).map(([provider, providerModels]) => (
						<div key={provider} className="mb-2 last:mb-0">
							<div className="px-3 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
								{provider}
							</div>
							{providerModels.map((model) => (
								<button
									key={model.id}
									onClick={() => {
										onSelect(model.id);
										onClose();
									}}
									className={`
                    w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                    ${activeModel === model.id
											? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
											: "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
										}
                  `}
								>
									{getModelIcon(model.id) ? (
										<img
											src={getModelIcon(model.id)}
											alt={model.id}
											className="w-5 h-5 object-contain shrink-0"
										/>
									) : null}
									<span className="truncate flex-1 text-left">
										{model.id.split("/").pop() || model.id}
									</span>
									{activeModel === model.id && (
										<Check className="w-4 h-4 shrink-0" />
									)}
								</button>
							))}
						</div>
					))}
				</div>
			</div>
		</>
	);
}
