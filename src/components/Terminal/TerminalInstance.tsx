/**
 * 终端实例组件
 * 使用 xterm.js 渲染单个终端
 */

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "../../lib/tauriCompat";
import "@xterm/xterm/css/xterm.css";

interface TerminalInstanceProps {
	terminalId: string;
	isActive: boolean;
	onExit?: () => void;
}

// Tokyo Night 深色终端主题
const darkTheme = {
	background: "#1a1b26",
	foreground: "#a9b1d6",
	cursor: "#c0caf5",
	cursorAccent: "#1a1b26",
	selectionBackground: "#33467c",
	selectionForeground: "#c0caf5",
	black: "#32344a",
	red: "#f7768e",
	green: "#9ece6a",
	yellow: "#e0af68",
	blue: "#7aa2f7",
	magenta: "#ad8ee6",
	cyan: "#449dab",
	white: "#787c99",
	brightBlack: "#444b6a",
	brightRed: "#ff7a93",
	brightGreen: "#b9f27c",
	brightYellow: "#ff9e64",
	brightBlue: "#7da6ff",
	brightMagenta: "#bb9af7",
	brightCyan: "#0db9d7",
	brightWhite: "#acb0d0",
};

export function TerminalInstance({
	terminalId,
	isActive,
	onExit,
}: TerminalInstanceProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);

	// 初始化 xterm.js
	useEffect(() => {
		if (!containerRef.current) return;

		const term = new Terminal({
			cursorBlink: true,
			cursorStyle: "bar",
			fontSize: 13,
			fontFamily:
				'"JetBrains Mono", "SF Mono", Menlo, Monaco, "Courier New", monospace',
			lineHeight: 1.4,
			theme: darkTheme,
			scrollback: 10000,
			allowTransparency: true,
			macOptionIsMeta: true,
			convertEol: true,
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);

		// 链接点击支持
		const webLinksAddon = new WebLinksAddon();
		term.loadAddon(webLinksAddon);

		term.open(containerRef.current);
		fitAddon.fit();

		termRef.current = term;
		fitAddonRef.current = fitAddon;

		// 用户输入 -> 发送到后端 pty
		const disposable = term.onData((data) => {
			invoke("terminal_write", { id: terminalId, data }).catch(() => {});
		});

		// 监听后端 pty 输出 -> 写入 xterm（通过 preload 暴露的 on 方法）
		const unsubData = window.electronAPI?.on<{ id: string; data: string }>(
			"terminal-data",
			(payload) => {
				if (payload.id === terminalId && termRef.current) {
					termRef.current.write(payload.data);
				}
			},
		);

		// 监听终端退出
		const unsubExit = window.electronAPI?.on<{
			id: string;
			exitCode: number;
			signal?: number;
		}>("terminal-exit", (payload) => {
			if (payload.id === terminalId) {
				term.writeln(
					`\r\n\x1b[90m[进程已退出，退出码: ${payload.exitCode}]\x1b[0m`,
				);
				onExit?.();
			}
		});

		// 通知后端初始尺寸
		invoke("terminal_resize", {
			id: terminalId,
			cols: term.cols,
			rows: term.rows,
		}).catch(() => {});

		return () => {
			disposable.dispose();
			unsubData?.();
			unsubExit?.();
			term.dispose();
			termRef.current = null;
			fitAddonRef.current = null;
		};
	}, [terminalId, onExit]);

	// 窗口 resize 时自适应
	useEffect(() => {
		if (!isActive) return;

		const handleResize = () => {
			if (fitAddonRef.current && termRef.current) {
				try {
					fitAddonRef.current.fit();
					invoke("terminal_resize", {
						id: terminalId,
						cols: termRef.current.cols,
						rows: termRef.current.rows,
					}).catch(() => {});
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
