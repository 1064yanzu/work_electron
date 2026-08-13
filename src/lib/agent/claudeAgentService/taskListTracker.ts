/**
 * claude-agent-sdk 0.3.142+：Headless/SDK 会话用 TaskCreate/TaskUpdate/TaskGet/TaskList
 * 族替代 TodoWrite。这些工具是增量 CRUD（不再一次传全量列表），
 * 需要在本地维护快照再换算成 onTodoUpdate 需要的全量数组。
 */

export const TASK_LIST_TOOL_NAMES = [
	"TaskCreate",
	"TaskUpdate",
	"TaskGet",
	"TaskList",
] as const;

export function isTaskListToolName(
	name: string | undefined,
): name is (typeof TASK_LIST_TOOL_NAMES)[number] {
	return (
		name === "TaskCreate" ||
		name === "TaskUpdate" ||
		name === "TaskGet" ||
		name === "TaskList"
	);
}

/**
 * 把 tool_result 的 content 还原成结构化对象。
 *
 * `tool_call_end.output` 直接来自 Anthropic tool_result 块的 content，
 * 形状有三种：结构化对象、JSON 字符串、`[{ type: "text", text: "…" }]`
 * 内容块数组。只处理前两种的话，一旦 CLI 走数组形态，Task 快照就会静默
 * 停更（任务列表卡住不动却不报错），所以三种都要认。
 */
function parseJsonMaybe(value: unknown): any {
	if (value === null || value === undefined) return value;
	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}
	if (Array.isArray(value)) {
		const text = value
			.map((block: any) =>
				typeof block === "string"
					? block
					: typeof block?.text === "string"
						? block.text
						: "",
			)
			.join("");
		if (!text.trim()) return value;
		try {
			return JSON.parse(text);
		} catch {
			return value;
		}
	}
	return value;
}

function normalizeTaskStatus(
	value: unknown,
	fallback: "pending" | "in_progress" | "completed" = "pending",
): "pending" | "in_progress" | "completed" {
	if (value === "pending" || value === "in_progress" || value === "completed")
		return value;
	return fallback;
}

export class TaskListTracker {
	private taskToolInputById = new Map<string, Record<string, unknown>>();
	private taskItemsById = new Map<
		string,
		{
			content: string;
			status: "pending" | "in_progress" | "completed";
			activeForm?: string;
			order: number;
		}
	>();
	private taskItemOrderCounter = 0;

	constructor(
		private onTodoUpdate:
			| ((
					todos: Array<{
						content: string;
						status: "pending" | "in_progress" | "completed";
						activeForm?: string;
					}>,
			  ) => void)
			| undefined,
		private debug: boolean,
	) {}

	registerToolInput(id: string, input: Record<string, unknown>): void {
		this.taskToolInputById.set(id, input);
	}

	private emitTaskSnapshot(): void {
		if (!this.onTodoUpdate) return;
		const items = Array.from(this.taskItemsById.values())
			.sort((a, b) => a.order - b.order)
			.map(({ content, status, activeForm }) => ({
				content,
				status,
				activeForm,
			}));
		this.onTodoUpdate(items);
	}

	handleToolCallEnd(
		taskToolName: (typeof TASK_LIST_TOOL_NAMES)[number],
		event: { id: string; output?: unknown; isError?: boolean },
	): void {
		const input = this.taskToolInputById.get(event.id) || {};
		const output = parseJsonMaybe(event.output) as any;
		try {
			if (taskToolName === "TaskCreate" && !event.isError) {
				const taskId: string | undefined = output?.task?.id;
				if (taskId) {
					this.taskItemsById.set(taskId, {
						content:
							(input.subject as string) ||
							(input.description as string) ||
							output?.task?.subject ||
							"",
						status: "pending",
						activeForm: input.activeForm as string | undefined,
						order: this.taskItemOrderCounter++,
					});
				}
			} else if (taskToolName === "TaskUpdate" && !event.isError) {
				// TaskUpdate 失败时会返回 { success: false, error }，
				// 这种"软失败"不带 isError，照单全收会让快照跑偏
				const taskId = (input.taskId as string) || output?.taskId;
				if (taskId && output?.success !== false) {
					if (input.status === "deleted") {
						this.taskItemsById.delete(taskId);
					} else {
						const existing = this.taskItemsById.get(taskId);
						this.taskItemsById.set(taskId, {
							content:
								(input.subject as string) ||
								(input.description as string) ||
								existing?.content ||
								"",
							status: normalizeTaskStatus(
								input.status,
								existing?.status ?? "pending",
							),
							activeForm:
								(input.activeForm as string | undefined) ??
								existing?.activeForm,
							order: existing?.order ?? this.taskItemOrderCounter++,
						});
					}
				}
			} else if (taskToolName === "TaskList" && Array.isArray(output?.tasks)) {
				// TaskList 返回全量真实数据，用它全量重建快照（修正本地增量追踪可能的偏差）。
				// activeForm 不在 TaskList 的返回里，从旧快照里捞回来，
				// 否则重建一次就把"进行中"的动词短语丢了。
				const previousActiveForms = new Map(
					Array.from(this.taskItemsById.entries()).map(([id, item]) => [
						id,
						item.activeForm,
					]),
				);
				this.taskItemsById.clear();
				this.taskItemOrderCounter = 0;
				for (const t of output.tasks) {
					if (!t?.id) continue;
					this.taskItemsById.set(t.id, {
						content: t.subject || "",
						status: normalizeTaskStatus(t.status),
						activeForm: previousActiveForms.get(t.id),
						order: this.taskItemOrderCounter++,
					});
				}
			}
			if (taskToolName !== "TaskGet") this.emitTaskSnapshot();
		} catch (error) {
			if (this.debug)
				console.warn("[ClaudeAgentService] 任务列表快照同步失败:", error);
		}
		this.taskToolInputById.delete(event.id);
	}
}
