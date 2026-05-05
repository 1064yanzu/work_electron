import type { DbContext } from "../db/client";

const SETTINGS_KEY = "reader.settings.v1";

export type ReaderSettings = {
	theme: string;
	font_family: string;
	font_size: number;
	line_height: number;
	letter_spacing: number;
	column_count: 1 | 2;
	max_width_ch: number;
	page_transition: "slide" | "fade" | "instant";
	auto_hide_chrome_ms: number;
	default_selection_action: "explain" | "translate" | "highlight" | "ask";
	tts_provider: "system" | "openai" | "azure" | "volcano";
	tts_rate: number;
	ai_context_scope: "chapter" | "book";
	disable_notifications_while_reading: boolean;
};

export const READER_DEFAULT_SETTINGS: ReaderSettings = {
	theme: "paperwhite",
	font_family: "serif-cn",
	font_size: 17,
	line_height: 1.75,
	letter_spacing: 0.01,
	column_count: 1,
	max_width_ch: 70,
	page_transition: "fade",
	auto_hide_chrome_ms: 1200,
	default_selection_action: "explain",
	tts_provider: "system",
	tts_rate: 1.0,
	ai_context_scope: "chapter",
	disable_notifications_while_reading: false,
};

function clampNumber(
	v: unknown,
	min: number,
	max: number,
	fallback: number,
): number {
	if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
	return Math.max(min, Math.min(max, v));
}

function sanitize(input: Partial<ReaderSettings>): Partial<ReaderSettings> {
	const out: Partial<ReaderSettings> = {};
	if (typeof input.theme === "string") out.theme = input.theme;
	if (typeof input.font_family === "string")
		out.font_family = input.font_family;
	if (input.font_size != null)
		out.font_size = clampNumber(input.font_size, 12, 30, 17);
	if (input.line_height != null)
		out.line_height = clampNumber(input.line_height, 1.2, 2.4, 1.75);
	if (input.letter_spacing != null)
		out.letter_spacing = clampNumber(input.letter_spacing, -0.05, 0.1, 0.01);
	if (input.column_count === 1 || input.column_count === 2)
		out.column_count = input.column_count;
	if (input.max_width_ch != null)
		out.max_width_ch = clampNumber(input.max_width_ch, 40, 120, 70);
	if (
		input.page_transition === "slide" ||
		input.page_transition === "fade" ||
		input.page_transition === "instant"
	)
		out.page_transition = input.page_transition;
	if (input.auto_hide_chrome_ms != null)
		out.auto_hide_chrome_ms = clampNumber(
			input.auto_hide_chrome_ms,
			0,
			10_000,
			1200,
		);
	if (
		input.default_selection_action === "explain" ||
		input.default_selection_action === "translate" ||
		input.default_selection_action === "highlight" ||
		input.default_selection_action === "ask"
	)
		out.default_selection_action = input.default_selection_action;
	if (
		input.tts_provider === "system" ||
		input.tts_provider === "openai" ||
		input.tts_provider === "azure" ||
		input.tts_provider === "volcano"
	)
		out.tts_provider = input.tts_provider;
	if (input.tts_rate != null)
		out.tts_rate = clampNumber(input.tts_rate, 0.5, 2.5, 1.0);
	if (input.ai_context_scope === "chapter" || input.ai_context_scope === "book")
		out.ai_context_scope = input.ai_context_scope;
	if (typeof input.disable_notifications_while_reading === "boolean")
		out.disable_notifications_while_reading =
			input.disable_notifications_while_reading;
	return out;
}

export async function getReaderSettings(
	db: DbContext,
): Promise<ReaderSettings> {
	const res = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ? LIMIT 1`,
		args: [SETTINGS_KEY],
	});
	const raw = res.rows[0]?.value;
	if (typeof raw !== "string") return { ...READER_DEFAULT_SETTINGS };
	try {
		const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
		return { ...READER_DEFAULT_SETTINGS, ...sanitize(parsed) };
	} catch {
		return { ...READER_DEFAULT_SETTINGS };
	}
}

export async function updateReaderSettings(
	db: DbContext,
	patch: Partial<ReaderSettings>,
): Promise<void> {
	const current = await getReaderSettings(db);
	const next = { ...current, ...sanitize(patch) };
	const ts = Date.now();
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [SETTINGS_KEY, JSON.stringify(next), ts],
	});
}
