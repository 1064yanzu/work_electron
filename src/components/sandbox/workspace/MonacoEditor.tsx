/**
 * Monaco 编辑器包装组件
 * 懒加载 @monaco-editor/react，支持 Cmd+S 保存、语言检测
 */

import { lazy, Suspense, useCallback, useRef } from "react";
import type { OnMount } from "@monaco-editor/react";
import { cn } from "../../../lib/utils";

// 懒加载 Monaco Editor
const Monaco = lazy(() => import("@monaco-editor/react"));

// ==================== 语言映射 ====================

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
	tsx: "typescript",
	ts: "typescript",
	jsx: "javascript",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	css: "css",
	scss: "scss",
	less: "less",
	html: "htm",
	htm: "html",
	json: "json",
	jsonc: "json",
	md: "markdown",
	markdown: "markdown",
	py: "python",
	go: "go",
	rs: "rust",
	java: "java",
	c: "c",
	cpp: "cpp",
	h: "c",
	hpp: "cpp",
	csharp: "csharp",
	cs: "csharp",
	swift: "swift",
	kt: "kotlin",
	kts: "kotlin",
	rb: "ruby",
	php: "php",
	sh: "shell",
	bash: "shell",
	zsh: "shell",
	fish: "shell",
	ps1: "powershell",
	sql: "sql",
	xml: "xml",
	yaml: "yaml",
	yml: "yaml",
	toml: "toml",
	ini: "ini",
	vue: "html",
	svelte: "html",
	graphql: "graphql",
	gql: "graphql",
	dockerfile: "dockerfile",
	makefile: "makefile",
};

/** 根据文件扩展名获取 Monaco 语言 */
export function getMonacoLanguage(extension: string): string {
	const ext = extension.toLowerCase().replace(/^\./, "");
	return EXTENSION_LANGUAGE_MAP[ext] || "plaintext";
}

// ==================== 骨架屏 ====================

function EditorSkeleton() {
	return (
		<div className="w-full h-full flex flex-col gap-3 p-4 bg-surface animate-pulse">
			<div className="flex gap-2">
				{Array.from({ length: 6 }).map((_, i) => (
					<div
						key={i}
						className="h-3 rounded bg-warm-200 dark:bg-cream-700"
						style={{ width: `${40 + Math.random() * 60}px` }}
					/>
				))}
			</div>
			<div className="flex-1 space-y-2">
				{Array.from({ length: 12 }).map((_, i) => (
					<div
						key={i}
						className="h-3 rounded bg-warm-100 dark:bg-cream-800"
						style={{ width: `${30 + Math.random() * 70}%` }}
					/>
				))}
			</div>
		</div>
	);
}

// ==================== 空状态 ====================

function EmptyEditorState() {
	return (
		<div className="w-full h-full flex flex-col items-center justify-center bg-surface text-text-muted gap-3">
			<div className="w-12 h-12 rounded-xl bg-warm-100 dark:bg-cream-800 flex items-center justify-center">
				<svg
					className="w-6 h-6 text-text-light"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.5}
					aria-hidden="true"
				>
					<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
					<polyline points="14,2 14,8 20,8" />
					<line x1={16} y1={13} x2={8} y2={13} />
					<line x1={16} y1={17} x2={8} y2={17} />
					<polyline points="10,9 9,9 8,9" />
				</svg>
			</div>
			<div className="text-center">
				<p className="text-sm font-medium">选择文件开始编辑</p>
				<p className="text-xs text-text-light mt-1">
					在左侧文件树中点击文件打开
				</p>
			</div>
		</div>
	);
}

// ==================== MonacoEditor ====================

interface MonacoEditorProps {
	/** 编辑器内容 */
	value: string;
	/** Monaco 语言标识 */
	language: string;
	/** 主题 */
	theme?: "vs" | "vs-dark";
	/** 内容变更回调 */
	onChange?: (value: string | undefined) => void;
	/** Cmd+S 保存回调 */
	onSave?: () => void;
	/** 只读模式 */
	readOnly?: boolean;
	/** 自定义类名 */
	className?: string;
}

export function MonacoEditor({
	value,
	language,
	theme = "vs",
	onChange,
	onSave,
	readOnly = false,
	className,
}: MonacoEditorProps) {
	const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

	/** 编辑器挂载后绑定快捷键 */
	const handleEditorMount: OnMount = useCallback(
		(editor, monaco) => {
			editorRef.current = editor;

			// Cmd+S / Ctrl+S 保存
			if (onSave) {
				editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
					onSave();
				});
			}

			// 聚焦编辑器
			editor.focus();
		},
		[onSave],
	);

	return (
		<div className={cn("w-full h-full", className)}>
			<Suspense fallback={<EditorSkeleton />}>
				<Monaco
					height="100%"
					language={language}
					theme={theme}
					value={value}
					onChange={onChange}
					onMount={handleEditorMount}
					loading={<EditorSkeleton />}
					options={{
						readOnly,
						fontSize: 13,
						fontFamily:
							'"JetBrains Mono", "SF Mono", Menlo, Monaco, "Courier New", monospace',
						fontLigatures: true,
						lineNumbers: "on",
						minimap: { enabled: true, scale: 1 },
						scrollBeyondLastLine: false,
						wordWrap: "off",
						tabSize: 2,
						insertSpaces: true,
						renderWhitespace: "selection",
						bracketPairColorization: { enabled: true },
						automaticLayout: true,
						smoothScrolling: true,
						cursorBlinking: "smooth",
						cursorSmoothCaretAnimation: "on",
						padding: { top: 8, bottom: 8 },
						glyphMargin: false,
						folding: true,
						lineDecorationsWidth: 8,
						lineNumbersMinChars: 3,
						suggest: {
							showIcons: true,
							showMethods: true,
							showFunctions: true,
							showVariables: true,
						},
					}}
				/>
			</Suspense>
		</div>
	);
}

export { EmptyEditorState };
