/**
 * 宠物气泡共用工具
 */

/** 把 hex 颜色调成低透明度 rgba */
export function withAlpha(hex: string, alpha: number): string {
	if (!hex.startsWith("#")) return hex;
	const h = hex.slice(1);
	const full =
		h.length === 3
			? h
					.split("")
					.map((c) => c + c)
					.join("")
			: h;
	const r = parseInt(full.slice(0, 2), 16);
	const g = parseInt(full.slice(2, 4), 16);
	const b = parseInt(full.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 把 hex 颜色按比例向白色提亮（用于渐变上沿） */
export function lighten(hex: string, ratio: number): string {
	if (!hex.startsWith("#")) return hex;
	const h = hex.slice(1);
	const full =
		h.length === 3
			? h
					.split("")
					.map((c) => c + c)
					.join("")
			: h;
	const r = parseInt(full.slice(0, 2), 16);
	const g = parseInt(full.slice(2, 4), 16);
	const b = parseInt(full.slice(4, 6), 16);
	const lr = Math.round(r + (255 - r) * ratio);
	const lg = Math.round(g + (255 - g) * ratio);
	const lb = Math.round(b + (255 - b) * ratio);
	return `rgb(${lr}, ${lg}, ${lb})`;
}
