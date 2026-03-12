/**
 * Coding File Write Service
 * 负责 AI 编程工作区的文件写入/还原操作
 */
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * 将内容写入指定文件
 * @param filePath 文件绝对路径
 * @param content 文件内容
 * @param createDirs 是否自动创建父目录
 */
export async function writeFileContent(
	filePath: string,
	content: string,
	createDirs?: boolean,
): Promise<{ success: boolean; error?: string }> {
	try {
		if (createDirs) {
			await mkdir(dirname(filePath), { recursive: true });
		}
		await writeFile(filePath, content, "utf-8");
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * 还原文件到旧内容
 * - 如果 oldContent 为空且文件是新建的，则删除文件
 * - 否则用 oldContent 覆写文件
 * @param filePath 文件绝对路径
 * @param oldContent 旧的文件内容
 */
export async function revertFileContent(
	filePath: string,
	oldContent: string,
): Promise<{ success: boolean; error?: string }> {
	try {
		if (!oldContent) {
			// oldContent 为空说明文件是新建的，删除它
			await unlink(filePath);
		} else {
			await writeFile(filePath, oldContent, "utf-8");
		}
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
