/**
 * 终端实例组件
 * 使用 xterm.js 渲染单个终端，主题跟随系统亮暗模式
 */

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "../../lib/tauriCompat";
import { themeManager } from "../../lib/theme";
import "@xterm/xterm/css/xterm.css";

interface TerminalInstanceProps {
	terminalId: string;
	isActive: boolean;
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
	onExit,
}: TerminalInstanceProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);

	// 通过 ref 桥接 onExit，避免父组件 inline 闭包导致 useEffect 重建（每次渲染都
	// 销毁/重建整个 xterm 实例 + 重新订阅 IPC）。
	const onExitRef = useRef(onExit);
	useEffect(() => {
		onExitRef.current = onExit;
	}, [onExit]);

	// 初始化 xterm.js（仅依赖 terminalId）
	useEffect(() => {
		if (!containerRef.current) return;

		const term = new Terminal({
			cursorBlink: true,
			cursorStyle: "bar",
			fontSize: 13,
			fontFamily:
				'"JetBrains Mono", "SF Mono", Menlo, Monaco, "Courier New", monospace',
			lineHeight: 1.4,
			theme: getTerminalTheme(),
			scrollback: 10000,
			allowTransparency: true,
			macOptionIsMeta: true,
			convertEol: true,
		});

		// 订阅主题变化，动态更新 xterm 配色
		const unsubTheme = themeManager.subscribe(() => {
			term.options.theme = getTerminalTheme();
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
				onExitRef.current?.();
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
			unsubTheme();
			term.dispose();
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
