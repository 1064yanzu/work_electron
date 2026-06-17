/**
 * styleProfile/rendererV2.ts — 风格包渲染 IPC handler
 *
 * 仅负责把 IPC 请求转交给 styleRenderCore（单一渲染事实源）。
 * 渲染规则本身见 styleRenderCore.ts。
 */
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../../shared/ipc-schema";
import type { DbContext } from "../../../db/client";
import { loadAndRenderProfile, loadAndRenderRecipe } from "./styleRenderCore";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createStyleRendererHandlersV2(db: DbContext) {
	const renderPrompt: Handler<"style_profile_render_prompt"> = async (
		_event,
		input,
	) => {
		const { profile_id, intensity = "medium" } = input;
		const prompt = await loadAndRenderProfile(db, profile_id, intensity);
		return { prompt };
	};

	const renderRecipePrompt: Handler<"style_recipe_render_prompt"> = async (
		_event,
		input,
	) => {
		const { recipe_id, intensity } = input;
		const prompt = await loadAndRenderRecipe(db, recipe_id, intensity, {
			typeAttr: true,
		});
		return { prompt };
	};

	return {
		style_profile_render_prompt: renderPrompt,
		style_recipe_render_prompt: renderRecipePrompt,
	};
}
