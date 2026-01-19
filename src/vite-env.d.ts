/// <reference types="vite/client" />

import type { ElectronAPI } from "../electron/shared/preload-api";

declare global {
	interface Window {
		electronAPI: ElectronAPI;
	}
}
