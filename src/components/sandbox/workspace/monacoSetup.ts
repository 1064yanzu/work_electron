/**
 * Monaco 本地化配置 — 让 @monaco-editor/react 使用 vite 打包的 monaco-editor，
 * 而不是默认的 jsdelivr CDN（离线/内网环境会加载失败）。
 *
 * 同时把 monaco-editor 从 dependencies 移到 devDependencies：
 * vite 构建期把它打进 dist，运行期不再需要 node_modules 里的 ~90MB 副本。
 *
 * 此模块只被 MonacoEditor.tsx 懒加载链引入，不影响首屏体积。
 */
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
	getWorker(_workerId: string, label: string) {
		switch (label) {
			case "json":
				return new jsonWorker();
			case "css":
			case "scss":
			case "less":
				return new cssWorker();
			case "html":
			case "handlebars":
			case "razor":
				return new htmlWorker();
			case "typescript":
			case "javascript":
				return new tsWorker();
			default:
				return new editorWorker();
		}
	},
};

loader.config({ monaco });

export { monaco };
