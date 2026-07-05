/**
 * 终端实例组件
 * 使用 xterm.js 渲染单个终端，主题跟随系统亮暗模式
 */

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "../../lib/tauriCompat";
import {
	DEFAULT_TERMINAL_PREFS,
	getTerminalScrollbackLines,
} from "../../lib/config/terminal";
import { themeManager } from "../../lib/theme";
import "@xterm/xterm/css/xterm.css";

interface TerminalInstanceProps {
	terminalId: string;
	isActive: boolean;
	/**
	 * 远控 pty 时为 true。前端会跳过 terminal_resize（后端会拒绝，因为远控
	 * pty 的尺寸由 IM 卡片渲染决定，桌面 fit() 不能改），但仍然允许 stdin
	 * 输入与监听 terminal-data 输出。
	 */
	isRemote?: boolean;
	onExit?: () => void;
}

const darkTheme = {
	background: "#1e1e1e",
	foreground: "#d4d4d4",
	cursor: "#aeafad",
	cursorAccent: "#1e1e1e",
	selectionBackground: "#264f78",
	selectionForeground: "#d4d4d4",
	black: "#1e1e1e",
	red: "#f44747",
	green: "#6a9955",
	yellow: "#d7ba7d",
	blue: "#569cd6",
	magenta: "#c586c0",
	cyan: "#4ec9b0",
	white: "#d4d4d4",
	brightBlack: "#808080",
	brightRed: "#f44747",
	brightGreen: "#6a9955",
	brightYellow: "#d7ba7d",
	brightBlue: "#569cd6",
	brightMagenta: "#c586c0",
	brightCyan: "#4ec9b0",
	brightWhite: "#d4d4d4",
};

const lightTheme = {
	background: "#faf9f5",
	foreground: "#383a42",
	cursor: "#526fff",
	cursorAccent: "#faf9f5",
	selectionBackground: "#bfcef3",
	selectionForeground: "#383a42",
	black: "#383a42",
	red: "#e45649",
	green: "#50a14f",
	yellow: "#c18401",
	blue: "#4078f2",
	magenta: "#a626a4",
	cyan: "#0184bc",
	white: "#a0a1a7",
	brightBlack: "#696c77",
	brightRed: "#e45649",
	brightGreen: "#50a14f",
	brightYellow: "#c18401",
	brightBlue: "#4078f2",
	brightMagenta: "#a626a4",
	brightCyan: "#0184bc",
	brightWhite: "#ffffff",
};

function getTerminalTheme() {
	return themeManager.isDark() ? darkTheme : lightTheme;
}

export function TerminalInstance({
	terminalId,
	isActive,
	isRemote,
	onExit,
}: TerminalInstanceProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const webglAddonRef = useRef<WebglAddon | null>(null);

	// 通过 ref 桥接 onExit，避免父组件 inline 闭包导致 useEffect 重建（每次渲染都
	// 销毁/重建整个 xterm 实例 + 重新订阅 IPC）。
	const onExitRef = useRef(onExit);
	useEffect(() => {
		onExitRef.current = onExit;
	}, [onExit]);

	// 初始化 xterm.js（仅依赖 terminalId）
	useEffect(() => {
		if (!containerRef.current) return;

		let cancelled = false;
		let term: Terminal | null = null;
		let unsubTheme: (() => void) | null = null;
		let disposable: { dispose: () => void } | null = null;
		let unsubData: (() => void) | undefined;
		let unsubExit: (() => void) | undefined;

		void (async () => {
			// scrollback 行数从用户配置读取（新建终端才会应用，已存在的终端需要重建
			// xterm 实例才能变更 scrollback，这是 xterm 自身的限制），读取失败时回退默认值。
			const scrollback = await getTerminalScrollbackLines().catch(
				() => DEFAULT_TERMINAL_PREFS.scrollbackLines,
			);
			if (cancelled || !containerRef.current) return;

			term = new Terminal({
				cursorBlink: true,
				cursorStyle: "bar",
				fontSize: 13,
				fontFamily:
					'"JetBrains Mono", "SF Mono", Menlo, Monaco, "Courier New", monospace',
				lineHeight: 1.4,
				theme: getTerminalTheme(),
				scrollback,
				allowTransparency: true,
				macOptionIsMeta: true,
				convertEol: true,
			});
			const activeTerm = term;

			// 订阅主题变化，动态更新 xterm 配色
			unsubTheme = themeManager.subscribe(() => {
				activeTerm.options.theme = getTerminalTheme();
			});

			const fitAddon = new FitAddon();
			activeTerm.loadAddon(fitAddon);

			// 链接点击支持
			const webLinksAddon = new WebLinksAddon();
			activeTerm.loadAddon(webLinksAddon);

			activeTerm.open(containerRef.current);
			fitAddon.fit();

			// WebGL 硬件加速渲染：大幅降低大量输出/滚动时的 CPU 占用。
			// 注意：WebglAddon 必须在 terminal.open() 之后加载（xterm 要求）。
			// 系统休眠恢复、GPU 驱动异常等场景可能触发 context loss，此时把
			// addon dispose 掉即可安全降级回 xterm 默认的 DOM 渲染器，不影响终端可用性。
			try {
				const webglAddon = new WebglAddon();
				webglAddon.onContextLoss(() => {
					console.warn("[Terminal] WebGL 上下文丢失，降级为 DOM 渲染器");
					webglAddon.dispose();
					if (webglAddonRef.current === webglAddon) {
						webglAddonRef.current = null;
					}
				});
				activeTerm.loadAddon(webglAddon);
				webglAddonRef.current = webglAddon;
			} catch (error) {
				console.warn(
					"[Terminal] WebGL 渲染器加载失败，使用默认 DOM 渲染:",
					error,
				);
				webglAddonRef.current = null;
			}

			termRef.current = activeTerm;
			fitAddonRef.current = fitAddon;

			// 用户输入 -> 发送到后端 pty
			disposable = activeTerm.onData((data) => {
				invoke("terminal_write", { id: terminalId, data }).catch(() => {});
			});

			// 监听后端 pty 输出 -> 写入 xterm（通过 preload 暴露的 on 方法）
			unsubData = window.electronAPI?.on<{ id: string; data: string }>(
				"terminal-data",
				(payload) => {
					if (payload.id === terminalId && termRef.current) {
						termRef.current.write(payload.data);
					}
				},
			);

			// 监听终端退出
			unsubExit = window.electronAPI?.on<{
				id: string;
				exitCode: number;
				signal?: number;
			}>("terminal-exit", (payload) => {
				if (payload.id === terminalId) {
					activeTerm.writeln(
						`\r\n\x1b[90m[进程已退出，退出码: ${payload.exitCode}]\x1b[0m`,
					);
					onExitRef.current?.();
				}
			});

			// 通知后端初始尺寸（远控 pty 跳过：尺寸已由 PtyBridgeService 在创建时锁定）
			if (!isRemote) {
				invoke("terminal_resize", {
					id: terminalId,
					cols: activeTerm.cols,
					rows: activeTerm.rows,
				}).catch(() => {});
			}
		})();

		return () => {
			cancelled = true;
			disposable?.dispose();
			unsubData?.();
			unsubExit?.();
			unsubTheme?.();
			webglAddonRef.current?.dispose();
			webglAddonRef.current = null;
			term?.dispose();
			termRef.current = null;
			fitAddonRef.current = null;
		};
	}, [terminalId]);

	// 窗口 resize 时自适应
	useEffect(() => {
		if (!isActive) return;

		const handleResize = () => {
			if (fitAddonRef.current && termRef.current) {
				try {
					fitAddonRef.current.fit();
					// 远控 pty 桌面端只观察 + 输入，不允许改尺寸
					if (!isRemote) {
						invoke("terminal_resize", {
							id: terminalId,
							cols: termRef.current.cols,
							rows: termRef.current.rows,
						}).catch(() => {});
					}
				} catch {
					// ignore
				}
			}
		};

		// 初始 fit
		requestAnimationFrame(handleResize);

		window.addEventListener("resize", handleResize);
		// 使用 ResizeObserver 监听容器大小变化
		const observer = new ResizeObserver(handleResize);
		if (containerRef.current) {
			observer.observe(containerRef.current);
		}

		return () => {
			window.removeEventListener("resize", handleResize);
			observer.disconnect();
		};
	}, [isActive, terminalId]);

	// 活跃时 focus 终端
	useEffect(() => {
		if (isActive && termRef.current) {
			termRef.current.focus();
		}
	}, [isActive]);

	return (
		<div
			ref={containerRef}
			className="w-full h-full"
			style={{
				display: isActive ? "block" : "none",
			}}
		/>
	);
}
