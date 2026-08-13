// PanelErrorBoundary — 面板级 / 全屏 Overlay 级错误边界
//
// 全项目此前没有任何 ErrorBoundary，任一栏渲染异常会白屏整个应用。
// 用法：
//   - variant="panel"（默认）：包住三栏各自的内容（App.tsx），
//     fallback 渲染统一 ErrorState，「重试」重置边界触发子树重挂。
//   - variant="overlay"：包住全屏 Overlay（阅读器 / 设置 / 卡片库 / 命令面板…）。
//     这类组件铺满视口且盖在主界面之上，只给「重试」是死路——重试失败就永远
//     困在错误页里。所以额外提供「关闭」按钮，通过 onClose 回调把对应的 overlay
//     状态关掉，让用户能退回主界面。

import { Component, type ErrorInfo, type ReactNode } from "react";
import { X } from "lucide-react";
import { ErrorState } from "./ErrorState";

interface PanelErrorBoundaryProps {
	/** 面板名，用于日志与提示文案（如 "资源栏"） */
	label: string;
	children: ReactNode;
	/** panel = 面板内联；overlay = 全屏遮罩（带关闭按钮） */
	variant?: "panel" | "overlay";
	/**
	 * overlay 模式下的关闭回调。必须真正把对应 overlay 的开关状态置为关闭，
	 * 否则关掉后 React 会立刻重新挂载出错的子树。
	 */
	onClose?: () => void;
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

	private handleClose = () => {
		// 先复位自身，避免下次打开时直接显示上一轮的错误
		this.setState({ error: null });
		this.props.onClose?.();
	};

	render() {
		const { error } = this.state;
		if (!error) return this.props.children;

		const { label, variant = "panel", onClose } = this.props;

		if (variant === "overlay") {
			return (
				<div className="fixed inset-0 z-overlay flex items-center justify-center bg-background/95 backdrop-blur-sm animate-in fade-in duration-150">
					{onClose ? (
						<button
							type="button"
							onClick={this.handleClose}
							aria-label="关闭"
							className="absolute right-4 top-4 rounded-xl p-2 text-text-muted transition-colors hover:bg-warm-200 hover:text-text-primary"
						>
							<X className="h-4 w-4" strokeWidth={1.5} />
						</button>
					) : null}
					<div className="flex flex-col items-center gap-4 px-6">
						<ErrorState
							title={`${label}遇到了问题`}
							detail={error}
							onRetry={this.handleRetry}
							retryLabel="重新加载"
						/>
						{onClose ? (
							<button
								type="button"
								onClick={this.handleClose}
								className="text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
							>
								关闭并返回主界面
							</button>
						) : null}
					</div>
				</div>
			);
		}

		return (
			<div className="h-full w-full flex items-center justify-center p-6 bg-background">
				<ErrorState
					title={`${label}遇到了问题`}
					detail={error}
					onRetry={this.handleRetry}
					retryLabel="重新加载此面板"
				/>
			</div>
		);
	}
}
