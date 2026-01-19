export type ClipPayload = {
	title?: string;
	url?: string;
	selectedText?: string;
	html?: string;
	text?: string;
	createdAt?: number;
	projectId?: string;
	folderId?: string;
	tags?: string[];
	source?: "browser_extension" | "manual" | "unknown";
};

export type StoredClip = {
	id: string;
	receivedAt: number;
	payload: ClipPayload;
};
