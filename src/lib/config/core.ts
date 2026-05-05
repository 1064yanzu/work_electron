import { invoke } from "../tauriCompat";

export interface AppConfig {
	key: string;
	value: any;
}

export async function getConfig(key: string): Promise<any | null> {
	return invoke("get_config", { key });
}

export async function setConfig(key: string, value: any): Promise<void> {
	return invoke("set_config", { key, value });
}

export async function getAllConfigs(): Promise<AppConfig[]> {
	return invoke("get_all_configs");
}
