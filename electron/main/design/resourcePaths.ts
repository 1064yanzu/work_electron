import path from "node:path";
import { app } from "electron";

function getDevDesignModuleDir(): string {
	const appRoot = process.env.APP_ROOT || process.cwd();
	return path.join(appRoot, "electron", "main", "design");
}

export function getDesignLibraryRoot(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, "design-library");
	}
	return path.join(getDevDesignModuleDir(), "library");
}

export function getDesignBuiltinSkillsRoot(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, "design-builtin-skills");
	}
	return path.join(getDevDesignModuleDir(), "builtin-skills");
}

export function getDesignTemplatesRoot(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, "design-templates");
	}
	return path.join(getDevDesignModuleDir(), "templates");
}

export function getDesignFramesRoot(): string {
	return path.join(getDesignLibraryRoot(), "frames");
}
