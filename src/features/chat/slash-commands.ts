export type SlashCommand = {
	id: string;
	label: string;
	description?: string;
	perform: () => void;
};
