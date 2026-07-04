/**
 * styleProfile/recipeCrud.ts — 混搭配方 CRUD 操作
 *
 * 混搭配方允许用户从不同风格包中挑选各层级（认知模式 / 话语姿态 / 语言审美 / 校准锚点），
 * 组合成一个自定义的风格配方。
 */
import type { IpcMainInvokeEvent } from "electron";
import type {
	IPCSchema,
	StyleProfileRecipe,
} from "../../../../shared/ipc-schema";
import type { DbContext } from "../../../db/client";
import { randomUUID } from "node:crypto";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

/**
 * 将原始行转为 StyleProfileRecipe 对象
 */
function rowToRecipe(row: Record<string, unknown>): StyleProfileRecipe {
	return {
		id: row.id as string,
		name: row.name as string,
		description: (row.description as string | null) ?? null,
		// v2 新字段
		soul_profile_id: (row.soul_profile_id as string | null) ?? null,
		thinking_profile_id: (row.thinking_profile_id as string | null) ?? null,
		articulation_profile_id:
			(row.articulation_profile_id as string | null) ?? null,
		texture_profile_id: (row.texture_profile_id as string | null) ?? null,
		relational_profile_id: (row.relational_profile_id as string | null) ?? null,
		// v1 旧字段（向后兼容）
		cognitive_profile_id: (row.cognitive_profile_id as string | null) ?? null,
		rhetorical_profile_id: (row.rhetorical_profile_id as string | null) ?? null,
		aesthetic_profile_id: (row.aesthetic_profile_id as string | null) ?? null,
		anchors_profile_id: (row.anchors_profile_id as string | null) ?? null,
		intensity: (row.intensity as StyleProfileRecipe["intensity"]) ?? "medium",
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
		// 名称字段由 enrichRecipeNames 填充
		soul_profile_name:
			(row.soul_profile_name as string | undefined) ?? undefined,
		thinking_profile_name:
			(row.thinking_profile_name as string | undefined) ?? undefined,
		articulation_profile_name:
			(row.articulation_profile_name as string | undefined) ?? undefined,
		texture_profile_name:
			(row.texture_profile_name as string | undefined) ?? undefined,
		relational_profile_name:
			(row.relational_profile_name as string | undefined) ?? undefined,
		cognitive_profile_name:
			(row.cognitive_profile_name as string | undefined) ?? undefined,
		rhetorical_profile_name:
			(row.rhetorical_profile_name as string | undefined) ?? undefined,
		aesthetic_profile_name:
			(row.aesthetic_profile_name as string | undefined) ?? undefined,
		anchors_profile_name:
			(row.anchors_profile_name as string | undefined) ?? undefined,
	};
}

/**
 * 查询各层级来源 profile 的名称并填充到 recipe 对象上
 */
async function enrichRecipeNames(
	db: DbContext,
	recipe: StyleProfileRecipe,
): Promise<StyleProfileRecipe> {
	const ids = [
		// v2 字段
		recipe.soul_profile_id,
		recipe.thinking_profile_id,
		recipe.articulation_profile_id,
		recipe.texture_profile_id,
		recipe.relational_profile_id,
		// v1 字段（向后兼容）
		recipe.cognitive_profile_id,
		recipe.rhetorical_profile_id,
		recipe.aesthetic_profile_id,
		recipe.anchors_profile_id,
	].filter((id): id is string => id !== null);

	if (ids.length === 0) return recipe;

	// 用 IN 查询一次性拿到所有 profile 名称
	const placeholders = ids.map(() => "?").join(", ");
	const rows = await db.client.execute({
		sql: `SELECT id, name FROM style_profiles WHERE id IN (${placeholders})`,
		args: ids,
	});
	const nameMap = new Map<string, string>();
	for (const row of rows.rows) {
		const r = row as Record<string, unknown>;
		nameMap.set(r.id as string, r.name as string);
	}

	return {
		...recipe,
		// v2 名称
		soul_profile_name: recipe.soul_profile_id
			? nameMap.get(recipe.soul_profile_id)
			: undefined,
		thinking_profile_name: recipe.thinking_profile_id
			? nameMap.get(recipe.thinking_profile_id)
			: undefined,
		articulation_profile_name: recipe.articulation_profile_id
			? nameMap.get(recipe.articulation_profile_id)
			: undefined,
		texture_profile_name: recipe.texture_profile_id
			? nameMap.get(recipe.texture_profile_id)
			: undefined,
		relational_profile_name: recipe.relational_profile_id
			? nameMap.get(recipe.relational_profile_id)
			: undefined,
		// v1 名称（向后兼容）
		cognitive_profile_name: recipe.cognitive_profile_id
			? nameMap.get(recipe.cognitive_profile_id)
			: undefined,
		rhetorical_profile_name: recipe.rhetorical_profile_id
			? nameMap.get(recipe.rhetorical_profile_id)
			: undefined,
		aesthetic_profile_name: recipe.aesthetic_profile_id
			? nameMap.get(recipe.aesthetic_profile_id)
			: undefined,
		anchors_profile_name: recipe.anchors_profile_id
			? nameMap.get(recipe.anchors_profile_id)
			: undefined,
	};
}

export function createStyleRecipeCrudHandlers(db: DbContext) {
	const createRecipe: Handler<"style_recipe_create"> = async (
		_event,
		input,
	) => {
		const id = randomUUID();
		const now = Date.now();

		await db.client.execute({
			sql: `INSERT INTO style_profile_recipes
        (id, name, description,
         soul_profile_id, thinking_profile_id, articulation_profile_id,
         texture_profile_id, relational_profile_id,
         cognitive_profile_id, rhetorical_profile_id,
         aesthetic_profile_id, anchors_profile_id, intensity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.name,
				input.description ?? null,
				input.soul_profile_id ?? null,
				input.thinking_profile_id ?? null,
				input.articulation_profile_id ?? null,
				input.texture_profile_id ?? null,
				input.relational_profile_id ?? null,
				input.cognitive_profile_id ?? null,
				input.rhetorical_profile_id ?? null,
				input.aesthetic_profile_id ?? null,
				input.anchors_profile_id ?? null,
				input.intensity ?? "medium",
				now,
				now,
			],
		});

		const rows = await db.client.execute({
			sql: `SELECT * FROM style_profile_recipes WHERE id = ?`,
			args: [id],
		});
		const recipe = rowToRecipe(rows.rows[0] as Record<string, unknown>);
		return enrichRecipeNames(db, recipe);
	};

	const listRecipes: Handler<"style_recipe_list"> = async () => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM style_profile_recipes ORDER BY updated_at DESC`,
			args: [],
		});
		const recipes = rows.rows.map((r) =>
			rowToRecipe(r as Record<string, unknown>),
		);
		// 批量填充名称
		return Promise.all(recipes.map((r) => enrichRecipeNames(db, r)));
	};

	const getRecipe: Handler<"style_recipe_get"> = async (_event, input) => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM style_profile_recipes WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0) {
			throw new Error(`Recipe not found: ${input.id}`);
		}
		const recipe = rowToRecipe(rows.rows[0] as Record<string, unknown>);
		return enrichRecipeNames(db, recipe);
	};

	const updateRecipe: Handler<"style_recipe_update"> = async (
		_event,
		input,
	) => {
		const now = Date.now();
		const sets: string[] = ["updated_at = ?"];
		const args: (string | number | null)[] = [now];

		if (input.name !== undefined) {
			sets.push("name = ?");
			args.push(input.name);
		}
		if (input.description !== undefined) {
			sets.push("description = ?");
			args.push(input.description ?? null);
		}
		// v2 层级
		if (input.soul_profile_id !== undefined) {
			sets.push("soul_profile_id = ?");
			args.push(input.soul_profile_id ?? null);
		}
		if (input.thinking_profile_id !== undefined) {
			sets.push("thinking_profile_id = ?");
			args.push(input.thinking_profile_id ?? null);
		}
		if (input.articulation_profile_id !== undefined) {
			sets.push("articulation_profile_id = ?");
			args.push(input.articulation_profile_id ?? null);
		}
		if (input.texture_profile_id !== undefined) {
			sets.push("texture_profile_id = ?");
			args.push(input.texture_profile_id ?? null);
		}
		if (input.relational_profile_id !== undefined) {
			sets.push("relational_profile_id = ?");
			args.push(input.relational_profile_id ?? null);
		}
		// v1 层级（向后兼容）
		if (input.cognitive_profile_id !== undefined) {
			sets.push("cognitive_profile_id = ?");
			args.push(input.cognitive_profile_id ?? null);
		}
		if (input.rhetorical_profile_id !== undefined) {
			sets.push("rhetorical_profile_id = ?");
			args.push(input.rhetorical_profile_id ?? null);
		}
		if (input.aesthetic_profile_id !== undefined) {
			sets.push("aesthetic_profile_id = ?");
			args.push(input.aesthetic_profile_id ?? null);
		}
		if (input.anchors_profile_id !== undefined) {
			sets.push("anchors_profile_id = ?");
			args.push(input.anchors_profile_id ?? null);
		}
		if (input.intensity !== undefined) {
			sets.push("intensity = ?");
			args.push(input.intensity);
		}

		args.push(input.id);
		await db.client.execute({
			sql: `UPDATE style_profile_recipes SET ${sets.join(", ")} WHERE id = ?`,
			args,
		});

		const rows = await db.client.execute({
			sql: `SELECT * FROM style_profile_recipes WHERE id = ?`,
			args: [input.id],
		});
		const recipe = rowToRecipe(rows.rows[0] as Record<string, unknown>);
		return enrichRecipeNames(db, recipe);
	};

	const deleteRecipe: Handler<"style_recipe_delete"> = async (
		_event,
		input,
	) => {
		await db.client.execute({
			sql: `DELETE FROM style_profile_recipes WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	return {
		style_recipe_create: createRecipe,
		style_recipe_list: listRecipes,
		style_recipe_get: getRecipe,
		style_recipe_update: updateRecipe,
		style_recipe_delete: deleteRecipe,
	};
}
