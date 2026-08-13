import type { Card, Uuid } from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function listCards(): Promise<Card[]> {
	return await safeInvoke("list_cards");
}

export async function getCard(id: Uuid): Promise<Card> {
	return await safeInvoke("get_card", { id });
}

export async function deleteCard(id: Uuid): Promise<void> {
	return await safeInvoke("delete_card", { id });
}

/**
 * 获取卡片图片的完整路径（用于前端展示）。
 *
 * 后端返回的是 `{ path }` 对象，这里解包成字符串——原先签名谎报为 `Promise<string>`
 * 却直接把对象透传给了 `convertFileSrc`，导致每张分享卡图片都在 `filePath.replace`
 * 上抛 TypeError 并被调用方的 catch 吞掉（表现为图片永远加载不出来）。
 */
export async function getCardImagePath(imagePath: string): Promise<string> {
	const result = await safeInvoke<{ path: string }>("get_card_image_path", {
		image_path: imagePath,
	});
	return result.path;
}
