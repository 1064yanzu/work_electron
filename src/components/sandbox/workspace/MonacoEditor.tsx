/**
 * Monaco 编辑器包装组件
 * 懒加载 @monaco-editor/react，支持 Cmd+S 保存、语言检测
 */

import {
	forwardRef,
	lazy,
	Suspense,
	useCallback,
	useImperativeHandle,
	useRef,
} from "react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import { cn } from "../../../lib/utils";

// 懒加载 Monaco Editor：先执行 monacoSetup（loader 指向 vite 打包的 monaco 实例 + 本地 worker），
// 再加载 @monaco-editor/react，确保不会走 CDN。
const Monaco = lazy(async () => {
	await import("./monacoSetup");
	return import("@monaco-editor/react");
});

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
	html: "html",
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

export interface MonacoCursorPosition {
	lineNumber: number;
	column: number;
}

export interface MonacoEditorHandle {
	focus: () => void;
	runAction: (actionId: string) => void;
	formatDocument: () => void;
	getPosition: () => MonacoCursorPosition | null;
}

interface MonacoEditorProps {
	/** 编辑器内容 */
	value: string;
	/** Monaco 语言标识 */
	language: string;
	/** 文件路径：用于 Monaco model URI、undo/view state 隔离 */
	path?: string;
	/** 主题 */
	theme?: "vs" | "vs-dark";
	/** 内容变更回调 */
	onChange?: (value: string | undefined) => void;
	/** Cmd+S 保存回调 */
	onSave?: () => void;
	/** 光标变化回调 */
	onCursorPositionChange?: (position: MonacoCursorPosition) => void;
	/** 只读模式 */
	readOnly?: boolean;
	/** 自动换行 */
	wordWrap?: boolean;
	/** 迷你地图 */
	minimap?: boolean;
	/** 自定义类名 */
	className?: string;
}

export const MonacoEditor = forwardRef<MonacoEditorHandle, MonacoEditorProps>(
	function MonacoEditor(
		{
			value,
			language,
			path,
			theme = "vs",
			onChange,
			onSave,
			onCursorPositionChange,
			readOnly = false,
			wordWrap = false,
			minimap = true,
			className,
		},
		ref,
	) {
		const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

		useImperativeHandle(
			ref,
			() => ({
				focus: () => editorRef.current?.focus(),
				runAction: (actionId: string) => {
					void editorRef.current?.getAction(actionId)?.run();
				},
				formatDocument: () => {
					void editorRef.current
						?.getAction("editor.action.formatDocument")
						?.run();
				},
				getPosition: () => {
					const position = editorRef.current?.getPosition();
					return position
						? {
								lineNumber: position.lineNumber,
								column: position.column,
							}
						: null;
				},
			}),
			[],
		);

		const handleBeforeMount: BeforeMount = useCallback((monaco) => {
			monaco.editor.defineTheme("ipo-workbench-light", {
				base: "vs",
				inherit: true,
				rules: [],
				colors: {
					"editor.background": "#fbfaf7",
					"editor.foreground": "#26231f",
					"editorLineNumber.foreground": "#9a9389",
					"editorLineNumber.activeForeground": "#0f766e",
					"editor.selectionBackground": "#d8ece8",
					"editor.lineHighlightBackground": "#f3f0ea",
					"editorCursor.foreground": "#0f766e",
					"editorIndentGuide.background1": "#e7e1d8",
					"editorIndentGuide.activeBackground1": "#c7bfb2",
					"minimap.background": "#fbfaf7",
				},
			});
			monaco.editor.defineTheme("ipo-workbench-dark", {
				base: "vs-dark",
				inherit: true,
				rules: [],
				colors: {
					"editor.background": "#171512",
					"editor.foreground": "#eee8dd",
					"editorLineNumber.foreground": "#756d62",
					"editorLineNumber.activeForeground": "#70c7b5",
					"editor.selectionBackground": "#264d49",
					"editor.lineHighlightBackground": "#211f1b",
					"editorCursor.foreground": "#70c7b5",
					"editorIndentGuide.background1": "#2e2a24",
					"editorIndentGuide.activeBackground1": "#5d554a",
					"minimap.background": "#171512",
				},
			});
		}, []);

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

				const position = editor.getPosition();
				if (position) {
					onCursorPositionChange?.({
						lineNumber: position.lineNumber,
						column: position.column,
					});
				}
				const cursorDisposable = editor.onDidChangeCursorPosition((event) => {
					onCursorPositionChange?.({
						lineNumber: event.position.lineNumber,
						column: event.position.column,
					});
				});
				const disposeDisposable = editor.onDidDispose(() => {
					cursorDisposable.dispose();
					disposeDisposable.dispose();
				});

				// 聚焦编辑器
				editor.focus();
			},
			[onCursorPositionChange, onSave],
		);

		return (
			<div className={cn("w-full h-full", className)}>
				<Suspense fallback={<EditorSkeleton />}>
					<Monaco
						height="100%"
						path={path}
						saveViewState
						keepCurrentModel
						language={language}
						theme={
							theme === "vs-dark" ? "ipo-workbench-dark" : "ipo-workbench-light"
						}
						value={value}
						onChange={onChange}
						beforeMount={handleBeforeMount}
						onMount={handleEditorMount}
						loading={<EditorSkeleton />}
						options={{
							readOnly,
							fontSize: 13,
							lineHeight: 21,
							fontFamily:
								'"JetBrains Mono", "SF Mono", Menlo, Monaco, "Courier New", monospace',
							fontLigatures: true,
							letterSpacing: 0,
							lineNumbers: "on",
							minimap: { enabled: minimap, scale: 1, renderCharacters: false },
							scrollBeyondLastLine: false,
							wordWrap: wordWrap ? "on" : "off",
							tabSize: 2,
							insertSpaces: true,
							renderWhitespace: "selection",
							bracketPairColorization: { enabled: true },
							guides: {
								bracketPairs: true,
								indentation: true,
								highlightActiveIndentation: true,
							},
							automaticLayout: true,
							formatOnPaste: true,
							formatOnType: true,
							smoothScrolling: true,
							cursorBlinking: "smooth",
							cursorSmoothCaretAnimation: "on",
							padding: { top: 12, bottom: 12 },
							glyphMargin: false,
							folding: true,
							foldingStrategy: "indentation",
							showFoldingControls: "mouseover",
							stickyScroll: { enabled: true },
							lineDecorationsWidth: 10,
							lineNumbersMinChars: 4,
							renderLineHighlight: "line",
							renderFinalNewline: "on",
							occurrencesHighlight: "singleFile",
							selectionHighlight: true,
							links: true,
							quickSuggestions: !readOnly,
							acceptSuggestionOnEnter: "smart",
							multiCursorModifier: "alt",
							mouseWheelZoom: true,
							contextmenu: true,
							scrollbar: {
								verticalScrollbarSize: 12,
								horizontalScrollbarSize: 12,
								alwaysConsumeMouseWheel: false,
							},
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
	},
);

export { EmptyEditorState };
