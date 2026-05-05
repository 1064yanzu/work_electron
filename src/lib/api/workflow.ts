import type {
	AppendWorkflowLogPayload,
	CreateWorkflowPayload,
	ListWorkflowLogsPayload,
	UpdateWorkflowPayload,
	Uuid,
	WorkflowNode,
	WorkflowRunLog,
} from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function createWorkflowNode(
	payload: CreateWorkflowPayload,
): Promise<WorkflowNode> {
	return await safeInvoke("create_workflow_node", { payload });
}

export async function listWorkflowNodes(): Promise<WorkflowNode[]> {
	return await safeInvoke("list_workflow_nodes");
}

export async function updateWorkflowNode(
	payload: UpdateWorkflowPayload,
): Promise<WorkflowNode> {
	return await safeInvoke("update_workflow_node", { payload });
}

export async function deleteWorkflowNode(id: Uuid): Promise<void> {
	return await safeInvoke("delete_workflow_node", { id });
}

export async function appendWorkflowLog(
	payload: AppendWorkflowLogPayload,
): Promise<WorkflowRunLog> {
	return await safeInvoke("append_workflow_log", { payload });
}

export async function listWorkflowLogs(
	payload?: ListWorkflowLogsPayload,
): Promise<WorkflowRunLog[]> {
	return await safeInvoke("list_workflow_logs", { payload });
}
