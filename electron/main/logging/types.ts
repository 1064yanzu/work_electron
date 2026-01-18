export type Logger = {
	info: (obj: Record<string, unknown>) => void;
	warn: (obj: Record<string, unknown>) => void;
	error: (obj: Record<string, unknown>) => void;
};
