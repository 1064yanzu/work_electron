import React from "react";

export class ErrorBoundary extends React.Component<
	{ children: React.ReactNode },
	{ error?: unknown }
> {
	state: { error?: unknown } = {};

	static getDerivedStateFromError(error: unknown) {
		return { error };
	}

	render() {
		if (this.state.error) {
			const message =
				this.state.error instanceof Error
					? this.state.error.message
					: String(this.state.error);
			return (
				<div className="flex h-screen w-screen items-center justify-center bg-background p-6 text-foreground">
					<div className="w-full max-w-xl rounded-2xl border border-border/60 bg-secondary/60 p-6 shadow-sm backdrop-blur">
						<div className="text-sm font-semibold">前端渲染失败</div>
						<div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
							{message}
						</div>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}
