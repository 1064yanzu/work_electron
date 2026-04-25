import { type ContextItem, EnhancedInput } from "./EnhancedInput";
import type { SlashCommand } from "./SlashCommandMenu";
import { toast } from "./Toast";

// 测试组件 - 展示如何使用 EnhancedInput
export function TestEnhancedInput() {
	const handleSubmit = (
		text: string,
		contexts: ContextItem[],
		command?: SlashCommand,
	) => {
		console.log("提交:", { text, contexts, command });
		toast.info(
			`提交成功，文本长度 ${text.length}，上下文 ${contexts.length}，命令 ${command?.label || "无"}`,
		);
	};

	const handleCommandSelect = (command: SlashCommand) => {
		console.log("选择命令:", command);
	};

	return (
		<div className="p-8 max-w-4xl mx-auto">
			<h1 className="text-2xl font-bold mb-6">增强输入框测试</h1>

			<div className="space-y-4">
				<div className="bg-surface p-4 rounded-lg">
					<h2 className="font-medium mb-2">使用说明:</h2>
					<ul className="text-sm text-text-muted space-y-1 list-disc list-inside">
						<li>
							输入 <code className="bg-surface px-1 rounded">/</code>{" "}
							查看所有命令
						</li>
						<li>
							输入 <code className="bg-surface px-1 rounded">@</code> 引用上下文
						</li>
						<li>
							使用 <code className="bg-surface px-1 rounded">⌘ + Enter</code>{" "}
							提交
						</li>
					</ul>
				</div>

				<EnhancedInput
					onSubmit={handleSubmit}
					onCommandSelect={handleCommandSelect}
				/>
			</div>
		</div>
	);
}
