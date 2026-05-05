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

/** 获取卡片图片的完整路径（用于前端展示） */
export async function getCardImagePath(imagePath: string): Promise<string> {
	return await safeInvoke("get_card_image_path", { imagePath });
}
