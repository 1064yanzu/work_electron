import type { InvokeLlmPayload, LlmResponse } from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function invokeLlm(
	payload: InvokeLlmPayload,
): Promise<LlmResponse> {
	return await safeInvoke("invoke_llm", { payload });
}
