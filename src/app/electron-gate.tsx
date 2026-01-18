import { Button } from "@/components/ui/button";
import { isElectronAvailable } from "@/lib/ipc";

export function ElectronGate({ children }: { children: React.ReactNode }) {
	if (isElectronAvailable()) return children;

	return (
		<div className="flex h-screen w-screen items-center justify-center bg-background p-6 text-foreground">
			<div className="w-full max-w-xl rounded-2xl border border-border/60 bg-secondary/60 p-6 shadow-sm backdrop-blur">
				<div className="text-sm font-semibold">需要在 Electron 中运行</div>
				<div className="mt-2 text-xs leading-5 text-muted-foreground">
					当前页面运行在浏览器开发服务器环境，无法访问
					window.electronAPI，所以不会加载任何真实数据。 请通过 Electron
					应用启动（或运行项目的 Electron 开发命令）来使用完整功能。
				</div>
				<div className="mt-4 flex items-center gap-2">
					<Button variant="secondary" onClick={() => window.location.reload()}>
						刷新
					</Button>
				</div>
			</div>
		</div>
	);
}
