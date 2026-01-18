import type { ClipPayload, StoredClip } from "./types";

export interface ClipStore {
	append: (payload: ClipPayload) => Promise<StoredClip>;
	list: () => Promise<StoredClip[]>;
}
