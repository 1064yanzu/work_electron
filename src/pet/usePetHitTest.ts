/**
 * usePetHitTest — 桌宠精确命中检测
 *
 * 利用 Electron 的 setIgnoreMouseEvents(true, { forward: true }) 机制：
 * 窗口处于 ignore 状态时，鼠标点击会穿透到背后的窗口，但 mousemove 事件仍会
 * 被转发到 renderer。本 hook 借助这一特性，实时检测鼠标所在 DOM 元素：
 *
 * - 鼠标位于透明区域（根容器 data-pet-passthrough 或 body/html）→ ignore=true（穿透）
 * - 鼠标位于宠物本体、气泡、菜单等可交互元素上 → ignore=false（正常捕获）
 *
 * 使用 requestAnimationFrame 节流 mousemove，避免高频事件导致性能开销。
 * 只在状态变化时发起 IPC 调用。
 *
 * @param disabled 当全局"鼠标穿透"开关（throughClicks）开启时传 true，
 *                 此时 hook 不做动态切换，窗口永久保持 ignore 模式。
 */

import { useEffect, useRef } from "react";
import { invoke } from "../lib/tauriCompat";

export function usePetHitTest(disabled: boolean) {
	// true = 当前处于 ignore（穿透）模式；初始值与 createPetWindow 的初始状态一致
	const isIgnoringRef = useRef(true);
	const rafScheduledRef = useRef(false);

	useEffect(() => {
		if (disabled) {
			// throughClicks 开启时确保回到 ignore 模式（处理从 false→true 的切换）
			if (!isIgnoringRef.current) {
				isIgnoringRef.current = true;
				void invoke("pet_window_set_mouse_ignore", { ignore: true }).catch(
					() => {},
				);
			}
			return;
		}

		const handleMouseMove = (e: MouseEvent) => {
			// rAF 节流：同一帧内只处理最后一次坐标
			if (rafScheduledRef.current) return;
			const { clientX, clientY } = e;
			rafScheduledRef.current = true;
			requestAnimationFrame(() => {
				rafScheduledRef.current = false;

				// peek 时宠物探出窗口边界（clientX/Y 越界）→ 视为悬停在宠物上，停止穿透
				const outOfBounds =
					clientX < 0 ||
					clientY < 0 ||
					clientX >= window.innerWidth ||
					clientY >= window.innerHeight;
				if (outOfBounds) {
					if (isIgnoringRef.current) {
						isIgnoringRef.current = false;
						void invoke("pet_window_set_mouse_ignore", {
							ignore: false,
						}).catch(() => {});
					}
					return;
				}

				const el = document.elementFromPoint(clientX, clientY);

				// 判定为"透明/穿透区域"的条件：
				// 1. 没有找到元素（超出文档范围）
				// 2. 命中的是 HTML / BODY 元素
				// 3. 命中的是根容器（标记了 data-pet-passthrough）
				const isPassthrough =
					!el ||
					el.tagName === "HTML" ||
					el.tagName === "BODY" ||
					el.hasAttribute("data-pet-passthrough");

				if (isPassthrough !== isIgnoringRef.current) {
					isIgnoringRef.current = isPassthrough;
					void invoke("pet_window_set_mouse_ignore", {
						ignore: isPassthrough,
					}).catch(() => {});
				}
			});
		};

		window.addEventListener("mousemove", handleMouseMove);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			// 组件卸载时恢复穿透模式，避免遮挡
			if (!isIgnoringRef.current) {
				isIgnoringRef.current = true;
				void invoke("pet_window_set_mouse_ignore", { ignore: true }).catch(
					() => {},
				);
			}
		};
	}, [disabled]);
}
