/**
 * 宠物气泡共享语义色。
 *
 * 之前 done / error / approval 三色分散在 PetNotificationBubble 与
 * PetHistoryBubble 里各写一份，这里收敛为单一事实源。
 * 注意：气泡常用 withAlpha() 计算透明底色，必须是原始 hex（不能用 CSS 变量）。
 */
export const PET_TONE_DONE = "#3F9C6E";
export const PET_TONE_ERROR = "#C45454";
export const PET_TONE_APPROVAL = "#8B6FB8";
