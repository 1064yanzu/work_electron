import { AppShell } from "@/app/app-shell";
import { ElectronGate } from "@/app/electron-gate";
import { ErrorBoundary } from "@/app/error-boundary";
import { AppProviders } from "@/app/providers";

export default function App() {
	return (
		<ErrorBoundary>
			<AppProviders>
				<ElectronGate>
					<AppShell />
				</ElectronGate>
			</AppProviders>
		</ErrorBoundary>
	);
}
