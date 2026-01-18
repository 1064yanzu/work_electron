import path from "node:path";
import { app } from "electron";

export function getDatabaseFilePath() {
	const userDataDir = app.getPath("userData");
	return path.join(userDataDir, "db.sqlite");
}
