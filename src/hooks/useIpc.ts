import { useCallback, useMemo } from "react";
import { ipcInvoke, isElectronAvailable } from "@/lib/ipc";
import type { IPCChannel, IPCSchema } from "../../electron/shared/ipc-schema";

export function useIpc() {
	const available = useMemo(() => isElectronAvailable(), []);
	const invoke = useCallback(
		async <K extends IPCChannel>(channel: K, input: IPCSchema[K]["input"]) => {
			return ipcInvoke(channel, input);
		},
		[],
	);
	return { available, invoke };
}
