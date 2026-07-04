// PanelErrorBoundary — 面板级错误边界
//
// 全项目此前没有任何 ErrorBoundary，任一栏渲染异常会白屏整个应用。
// 用法：包住三栏各自的内容（App.tsx），fallback 渲染统一 ErrorState，
// 「重试」重置边界触发子树重挂。

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./ErrorState";

interface PanelErrorBoundaryProps {
	/** 面板名，用于日志与提示文案（如 "资源栏"） */
	label: string;
	children: ReactNode;
}

interface PanelErrorBoundaryState {
	error: Error | null;
}

export class PanelErrorBoundary extends Component<
	PanelErrorBoundaryProps,
	PanelErrorBoundaryState
> {
	state: PanelErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error(
			`[PanelErrorBoundary] ${this.props.label} 渲染异常：`,
			error,
			info.componentStack,
		);
	}

	private handleRetry = () => {
		this.setState({ error: null });
	};

	render() {
		if (this.state.error) {
			return (
				<div className="h-full w-full flex items-center justify-center p-6 bg-background">
					<ErrorState
						title={`${this.props.label}遇到了问题`}
						detail={this.state.error}
						onRetry={this.handleRetry}
						retryLabel="重新加载此面板"
					/>
				</div>
			);
		}
		return this.props.children;
	}
}
