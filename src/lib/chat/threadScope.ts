import { useEffect, useRef, useState } from "react";
import { getAgentSession, type AgentSession } from "../agent/api";
import { sessionStore } from "../agent/sessionManager";
import { chatStore } from "./store";

type ThreadSource = "local" | "remote";

interface BackendThreadMetadata {
	cwd?: string;
	source?: ThreadSource;
}

interface ActiveThreadScopeState {
	scopePath: string | null;
	threadTitle: string | null;
	source: ThreadSource;
}

const backendMetadataCache = new Map<string, BackendThreadMetadata>();

function readBackendThreadMetadata(
	session: AgentSession | null | undefined,
): BackendThreadMetadata {
	const config =
		session?.config_json && typeof session.config_json === "object"
			? (session.config_json as Record<string, unknown>)
			: {};

	const readString = (key: string): string | undefined => {
		const value = config[key];
		return typeof value === "string" && value.trim() ? value.trim() : undefined;
	};

	return {
		cwd: readString("cwd"),
		source:
			config.source === "remote-control"
				? "remote"
				: config.source === "local-chat"
					? "local"
					: undefined,
	};
}

async function getBackendThreadMetadata(
	agentSessionId: string,
): Promise<BackendThreadMetadata> {
	const cached = backendMetadataCache.get(agentSessionId);
	if (cached) return cached;

	try {
		const session = await getAgentSession(agentSessionId);
		const metadata = readBackendThreadMetadata(session);
		backendMetadataCache.set(agentSessionId, metadata);
		return metadata;
	} catch (error) {
		console.warn("[threadScope] 读取后端线程元数据失败:", error);
		const fallback: BackendThreadMetadata = {};
		backendMetadataCache.set(agentSessionId, fallback);
		return fallback;
	}
}

function getRuntimeThreadScope(): ActiveThreadScopeState {
	const runtimeSession = sessionStore.getCurrentSession();
	return {
		scopePath: runtimeSession?.cwd ?? null,
		threadTitle: runtimeSession?.title?.trim() || null,
		source: "local",
	};
}

function getInitialThreadScope(): ActiveThreadScopeState {
	const activeChatSession = chatStore.getActiveSession();
	if (!activeChatSession) {
		return getRuntimeThreadScope();
	}

	return {
		scopePath: activeChatSession.cwd ?? null,
		threadTitle: activeChatSession.title?.trim() || null,
		source:
			activeChatSession.threadSource?.type === "remote" ? "remote" : "local",
	};
}

export async function resolveActiveThreadScope(): Promise<ActiveThreadScopeState> {
	const activeChatSession = chatStore.getActiveSession();
	const runtimeFallback = getRuntimeThreadScope();

	if (!activeChatSession) {
		return runtimeFallback;
	}

	let scopePath = activeChatSession.cwd ?? null;
	let source: ThreadSource =
		activeChatSession.threadSource?.type === "remote" ? "remote" : "local";

	if (!scopePath && activeChatSession.agentSessionId) {
		const runtimeMatch = sessionStore
			.getAllSessions()
			.find((session) => session.id === activeChatSession.agentSessionId);
		if (runtimeMatch?.cwd) {
			scopePath = runtimeMatch.cwd;
		} else {
			const backendMetadata = await getBackendThreadMetadata(
				activeChatSession.agentSessionId,
			);
			if (backendMetadata.cwd) {
				scopePath = backendMetadata.cwd;
				chatStore.setSessionCwd(activeChatSession.id, backendMetadata.cwd);
			}
			if (backendMetadata.source) {
				source = backendMetadata.source;
			}
		}
	}

	return {
		scopePath,
		threadTitle:
			activeChatSession.title?.trim() || runtimeFallback.threadTitle || null,
		source,
	};
}

export function useActiveThreadScope() {
	const [state, setState] = useState<ActiveThreadScopeState>(() =>
		getInitialThreadScope(),
	);
	const requestIdRef = useRef(0);

	useEffect(() => {
		let disposed = false;

		const syncScope = () => {
			const requestId = ++requestIdRef.current;
			void resolveActiveThreadScope().then((nextState) => {
				if (disposed || requestId !== requestIdRef.current) return;
				setState((prev) => {
					if (
						prev.scopePath === nextState.scopePath &&
						prev.threadTitle === nextState.threadTitle &&
						prev.source === nextState.source
					) {
						return prev;
					}
					return nextState;
				});
			});
		};

		syncScope();
		const unsubscribeChat = chatStore.subscribe(syncScope);
		const unsubscribeRuntime = sessionStore.subscribe(syncScope);

		return () => {
			disposed = true;
			unsubscribeChat();
			unsubscribeRuntime();
		};
	}, []);

	return state;
}
