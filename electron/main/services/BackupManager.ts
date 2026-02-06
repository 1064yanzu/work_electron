/**
 * 备份管理器
 * 参考 Cherry Studio 实现，适配当前项目架构
 */
import { app, type IpcMainInvokeEvent } from "electron";
import * as fs from "fs-extra";
import * as path from "node:path";
import archiver from "archiver";
import StreamZip from "node-stream-zip";
import type { FileStat } from "webdav";
import { WebDavService, type WebDavConfig } from "./WebDavService";
import { CryptoService } from "./CryptoService";

interface BackupProgress {
	stage: string;
	progress: number;
	total: number;
}

export class BackupManager {
	private tempDir = path.join(
		app.getPath("temp"),
		"ipo-workbench",
		"backup",
		"temp",
	);
	private backupDir = path.join(app.getPath("temp"), "ipo-workbench", "backup");

	// 缓存 WebDAV 实例
	private webdavInstance: WebDavService | null = null;
	private cachedWebdavConnectionConfig: {
		webdavHost: string;
		webdavUser?: string;
		webdavPass?: string;
		webdavPath?: string;
	} | null = null;

	constructor() {
		this.backup = this.backup.bind(this);
		this.restore = this.restore.bind(this);
		this.backupToWebdav = this.backupToWebdav.bind(this);
		this.restoreFromWebdav = this.restoreFromWebdav.bind(this);
		this.listWebdavFiles = this.listWebdavFiles.bind(this);
		this.deleteWebdavFile = this.deleteWebdavFile.bind(this);
		this.checkConnection = this.checkConnection.bind(this);
	}

	/**
	 * 比较两个 WebDAV 配置是否相等
	 */
	private isWebDavConfigEqual(
		cachedConfig: typeof this.cachedWebdavConnectionConfig,
		config: WebDavConfig,
	): boolean {
		if (!cachedConfig) return false;

		return (
			cachedConfig.webdavHost === config.webdavHost &&
			cachedConfig.webdavUser === config.webdavUser &&
			cachedConfig.webdavPass === config.webdavPass &&
			cachedConfig.webdavPath === config.webdavPath
		);
	}

	/**
	 * 获取 WebDAV 实例，连接配置未变则复用
	 */
	private getWebDavInstance(config: WebDavConfig): WebDavService {
		const configChanged = !this.isWebDavConfigEqual(
			this.cachedWebdavConnectionConfig,
			config,
		);

		if (configChanged || !this.webdavInstance) {
			this.webdavInstance = new WebDavService(config);
			this.cachedWebdavConnectionConfig = {
				webdavHost: config.webdavHost,
				webdavUser: config.webdavUser,
				webdavPass: config.webdavPass,
				webdavPath: config.webdavPath,
			};
			console.log("[BackupManager] Created new WebDav instance");
		} else {
			console.log("[BackupManager] Reusing existing WebDav instance");
		}

		return this.webdavInstance;
	}

	/**
	 * 递归设置目录及文件为可写
	 */
	private async setWritableRecursive(dirPath: string): Promise<void> {
		try {
			const items = await fs.readdir(dirPath, { withFileTypes: true });

			for (const item of items) {
				const fullPath = path.join(dirPath, item.name);

				if (item.isDirectory()) {
					await this.setWritableRecursive(fullPath);
				}

				await this.forceSetWritable(fullPath);
			}

			await this.forceSetWritable(dirPath);
		} catch (error) {
			console.error(`权限设置失败：${dirPath}`, error);
			throw error;
		}
	}

	/**
	 * 跨平台设置文件/目录为可写
	 */
	private async forceSetWritable(targetPath: string): Promise<void> {
		try {
			if (process.platform === "win32") {
				await fs.chmod(targetPath, 0o666);
			} else {
				const stats = await fs.stat(targetPath);
				const mode = stats.isDirectory() ? 0o777 : 0o666;
				await fs.chmod(targetPath, mode);
			}
		} catch (error: any) {
			if (error.code !== "ENOENT") {
				console.warn(`权限设置警告：${targetPath}`, error);
			}
		}
	}

	/**
	 * 获取目录大小
	 */
	private async getDirSize(dirPath: string): Promise<number> {
		let size = 0;
		const items = await fs.readdir(dirPath, { withFileTypes: true });

		for (const item of items) {
			const fullPath = path.join(dirPath, item.name);
			if (item.isDirectory()) {
				size += await this.getDirSize(fullPath);
			} else {
				const stats = await fs.stat(fullPath);
				size += stats.size;
			}
		}
		return size;
	}

	/**
	 * 带进度的目录复制
	 */
	private async copyDirWithProgress(
		source: string,
		destination: string,
		onProgress: (size: number) => void,
	): Promise<void> {
		let totalFiles = 0;
		let processedFiles = 0;
		let lastProgressReported = 0;

		// 计算总文件数
		const countFiles = async (dir: string): Promise<number> => {
			let count = 0;
			const items = await fs.readdir(dir, { withFileTypes: true });
			for (const item of items) {
				if (item.isDirectory()) {
					count += await countFiles(path.join(dir, item.name));
				} else {
					count++;
				}
			}
			return count;
		};

		totalFiles = await countFiles(source);

		// 复制文件并更新进度
		const copyDir = async (src: string, dest: string): Promise<void> => {
			const items = await fs.readdir(src, { withFileTypes: true });

			for (const item of items) {
				const sourcePath = path.join(src, item.name);
				const destPath = path.join(dest, item.name);

				if (item.isDirectory()) {
					await fs.ensureDir(destPath);
					await copyDir(sourcePath, destPath);
				} else {
					const stats = await fs.stat(sourcePath);
					await fs.copy(sourcePath, destPath);
					processedFiles++;

					// 只在进度变化超过5%时报告进度
					const currentProgress = Math.floor(
						(processedFiles / totalFiles) * 100,
					);
					if (
						currentProgress - lastProgressReported >= 5 ||
						processedFiles === totalFiles
					) {
						lastProgressReported = currentProgress;
						onProgress(stats.size);
					}
				}
			}
		};

		await copyDir(source, destination);
	}

	/**
	 * 创建备份
	 */
	async backup(
		_: IpcMainInvokeEvent,
		fileName: string,
		data: string,
		destinationPath: string = this.backupDir,
		skipBackupFile = false,
		onProgress?: (progress: BackupProgress) => void,
	): Promise<string> {
		try {
			await fs.ensureDir(this.tempDir);
			onProgress?.({ stage: "preparing", progress: 0, total: 100 });

			// 写入 data.json
			const tempDataPath = path.join(this.tempDir, "data.json");
			await new Promise<void>((resolve, reject) => {
				const writeStream = fs.createWriteStream(tempDataPath);
				writeStream.write(data);
				writeStream.end();

				writeStream.on("finish", () => resolve());
				writeStream.on("error", (error) => reject(error));
			});

			onProgress?.({ stage: "writing_data", progress: 20, total: 100 });

			if (!skipBackupFile) {
				// 复制 Data 目录
				const sourcePath = path.join(app.getPath("userData"), "Data");
				const tempDataDir = path.join(this.tempDir, "Data");

				const totalSize = await this.getDirSize(sourcePath);
				let copiedSize = 0;

				await this.copyDirWithProgress(sourcePath, tempDataDir, (size) => {
					copiedSize += size;
					const progress = Math.min(
						50,
						Math.floor((copiedSize / totalSize) * 50),
					);
					onProgress?.({ stage: "copying_files", progress, total: 100 });
				});

				await this.setWritableRecursive(tempDataDir);
				onProgress?.({
					stage: "preparing_compression",
					progress: 50,
					total: 100,
				});
			} else {
				console.log("Skip the backup of the file");
				await fs.promises.mkdir(path.join(this.tempDir, "Data"));
			}

			// 创建 ZIP 压缩包
			const backupedFilePath = path.join(destinationPath, fileName);
			const output = fs.createWriteStream(backupedFilePath);

			const archive = archiver("zip", {
				zlib: { level: 1 },
			});

			let lastProgress = 50;
			let totalEntries = 0;
			let processedEntries = 0;
			let totalBytes = 0;
			let processedBytes = 0;

			// 计算总文件数和总大小
			const calculateTotals = async (dirPath: string) => {
				try {
					const items = await fs.readdir(dirPath, { withFileTypes: true });
					for (const item of items) {
						const fullPath = path.join(dirPath, item.name);
						if (item.isDirectory()) {
							await calculateTotals(fullPath);
						} else {
							totalEntries++;
							const stats = await fs.stat(fullPath);
							totalBytes += stats.size;
						}
					}
				} catch (error) {
					console.error("[BackupManager] Error calculating totals:", error);
				}
			};

			await calculateTotals(this.tempDir);

			// 监听文件添加事件
			archive.on("entry", () => {
				processedEntries++;
				if (totalEntries > 0) {
					const progressPercent = Math.min(
						55,
						50 + Math.floor((processedEntries / totalEntries) * 5),
					);
					if (progressPercent > lastProgress) {
						lastProgress = progressPercent;
						onProgress?.({
							stage: "compressing",
							progress: progressPercent,
							total: 100,
						});
					}
				}
			});

			// 监听数据写入事件
			archive.on("data", (chunk) => {
				processedBytes += chunk.length;
				if (totalBytes > 0) {
					const progressPercent = Math.min(
						99,
						55 + Math.floor((processedBytes / totalBytes) * 44),
					);
					if (progressPercent > lastProgress) {
						lastProgress = progressPercent;
						onProgress?.({
							stage: "compressing",
							progress: progressPercent,
							total: 100,
						});
					}
				}
			});

			// 等待压缩完成
			await new Promise<void>((resolve, reject) => {
				output.on("close", () => {
					onProgress?.({ stage: "compressing", progress: 100, total: 100 });
					resolve();
				});
				archive.on("error", reject);
				archive.on("warning", (err: any) => {
					if (err.code !== "ENOENT") {
						console.warn("[BackupManager] Archive warning:", err);
					}
				});

				archive.pipe(output);
				archive.directory(this.tempDir, false);
				archive.finalize();
			});

			// 清理临时目录
			await fs.remove(this.tempDir);
			onProgress?.({ stage: "completed", progress: 100, total: 100 });

			console.log("Backup completed successfully");
			return backupedFilePath;
		} catch (error) {
			console.error("[BackupManager] Backup failed:", error);
			await fs.remove(this.tempDir).catch(() => {});
			throw error;
		}
	}

	/**
	 * 从备份恢复
	 */
	async restore(
		_: IpcMainInvokeEvent,
		backupPath: string,
		onProgress?: (progress: BackupProgress) => void,
	): Promise<string> {
		try {
			await fs.ensureDir(this.tempDir);
			onProgress?.({ stage: "preparing", progress: 0, total: 100 });

			console.log(`step 1: unzip backup file: ${this.tempDir}`);

			const zip = new StreamZip.async({ file: backupPath });
			onProgress?.({ stage: "extracting", progress: 15, total: 100 });
			await zip.extract(null, this.tempDir);
			onProgress?.({ stage: "extracted", progress: 25, total: 100 });

			console.log("step 2: read data.json");
			const dataPath = path.join(this.tempDir, "data.json");
			const data = await fs.readFile(dataPath, "utf-8");
			onProgress?.({ stage: "reading_data", progress: 35, total: 100 });

			console.log("step 3: restore Data directory");
			const sourcePath = path.join(this.tempDir, "Data");
			const destPath = path.join(app.getPath("userData"), "Data");

			const dataExists = await fs.pathExists(sourcePath);
			const dataFiles = dataExists ? await fs.readdir(sourcePath) : [];

			if (dataExists && dataFiles.length > 0) {
				const totalSize = await this.getDirSize(sourcePath);
				let copiedSize = 0;

				await this.setWritableRecursive(destPath);
				await fs.remove(destPath);

				await this.copyDirWithProgress(sourcePath, destPath, (size) => {
					copiedSize += size;
					const progress = Math.min(
						85,
						35 + Math.floor((copiedSize / totalSize) * 50),
					);
					onProgress?.({ stage: "copying_files", progress, total: 100 });
				});
			} else {
				console.log("skipBackupFile is true, skip restoring Data directory");
			}

			console.log("step 4: clean up temp directory");
			await this.setWritableRecursive(this.tempDir);
			await fs.remove(this.tempDir);
			onProgress?.({ stage: "completed", progress: 100, total: 100 });

			console.log("step 5: Restore completed successfully");

			return data;
		} catch (error) {
			console.error("Restore failed:", error);
			await fs.remove(this.tempDir).catch(() => {});
			throw error;
		}
	}

	/**
	 * 备份到 WebDAV
	 */
	async backupToWebdav(
		event: IpcMainInvokeEvent,
		data: string,
		webdavConfig: WebDavConfig,
	) {
		const filename = webdavConfig.fileName || "workbench-backup.zip";
		const backupedFilePath = await this.backup(
			event,
			filename,
			data,
			undefined,
			webdavConfig.skipBackupFile,
		);
		const webdavClient = this.getWebDavInstance(webdavConfig);

		try {
			let fileContent: Buffer;

			// 如果启用加密
			if (webdavConfig.encryptionPassword) {
				console.log("[BackupManager] Encrypting backup file...");
				const rawContent = await fs.readFile(backupedFilePath);
				fileContent = CryptoService.encryptFile(
					rawContent,
					webdavConfig.encryptionPassword,
				);
				console.log(
					`[BackupManager] Encrypted: ${rawContent.length} -> ${fileContent.length} bytes`,
				);
			} else {
				fileContent = await fs.readFile(backupedFilePath);
			}

			// 上传到 WebDAV
			let result;
			if (webdavConfig.disableStream) {
				result = await webdavClient.putFileContents(filename, fileContent, {
					overwrite: true,
				});
			} else {
				// 使用流式上传（对于大文件更高效）
				// 注意：加密后的数据需要先写入临时文件
				if (webdavConfig.encryptionPassword) {
					const tempEncryptedPath = `${backupedFilePath}.encrypted`;
					await fs.writeFile(tempEncryptedPath, fileContent);
					const contentLength = (await fs.stat(tempEncryptedPath)).size;
					result = await webdavClient.putFileContents(
						filename,
						fs.createReadStream(tempEncryptedPath),
						{
							overwrite: true,
							contentLength,
						},
					);
					await fs.remove(tempEncryptedPath);
				} else {
					const contentLength = (await fs.stat(backupedFilePath)).size;
					result = await webdavClient.putFileContents(
						filename,
						fs.createReadStream(backupedFilePath),
						{
							overwrite: true,
							contentLength,
						},
					);
				}
			}

			await fs.remove(backupedFilePath);
			return result;
		} catch (error) {
			await fs.remove(backupedFilePath).catch(() => {});
			throw error;
		}
	}

	/**
	 * 从 WebDAV 恢复
	 */
	async restoreFromWebdav(
		event: IpcMainInvokeEvent,
		webdavConfig: WebDavConfig,
	) {
		const filename = webdavConfig.fileName || "workbench-backup.zip";
		const webdavClient = this.getWebDavInstance(webdavConfig);

		try {
			const retrievedFile = await webdavClient.getFileContents(filename);
			const backupedFilePath = path.join(this.backupDir, filename);

			if (!fs.existsSync(this.backupDir)) {
				fs.mkdirSync(this.backupDir, { recursive: true });
			}

			let fileBuffer: Buffer;

			// 如果启用了加密，先解密
			if (webdavConfig.encryptionPassword) {
				console.log("[BackupManager] Decrypting backup file...");
				const encryptedBuffer = retrievedFile as Buffer;
				fileBuffer = CryptoService.decryptFile(
					encryptedBuffer,
					webdavConfig.encryptionPassword,
				);
				console.log(
					`[BackupManager] Decrypted: ${encryptedBuffer.length} -> ${fileBuffer.length} bytes`,
				);
			} else {
				fileBuffer = retrievedFile as Buffer;
			}

			// 写入解密后的文件
			await new Promise<void>((resolve, reject) => {
				const writeStream = fs.createWriteStream(backupedFilePath);
				writeStream.write(fileBuffer);
				writeStream.end();

				writeStream.on("finish", () => resolve());
				writeStream.on("error", (error) => reject(error));
			});

			return await this.restore(event, backupedFilePath);
		} catch (error: any) {
			console.error("Failed to restore from WebDAV:", error);
			// 提供更友好的错误消息
			if (
				error.message?.includes(
					"Unsupported state or unable to authenticate data",
				)
			) {
				throw new Error("解密失败：密码错误或文件已损坏");
			}
			throw new Error(error.message || "Failed to restore backup file");
		}
	}

	/**
	 * 列出 WebDAV 备份文件
	 */
	async listWebdavFiles(
		_: IpcMainInvokeEvent,
		config: WebDavConfig,
	): Promise<Array<{ fileName: string; modifiedTime: string; size: number }>> {
		try {
			const client = this.getWebDavInstance(config);
			const response = await client.getDirectoryContents();
			const files = Array.isArray(response) ? response : (response as any).data;

			return files
				.filter(
					(file: FileStat) =>
						file.type === "file" && file.basename.endsWith(".zip"),
				)
				.map((file: FileStat) => ({
					fileName: file.basename,
					modifiedTime: file.lastmod,
					size: file.size,
				}))
				.sort(
					(a: { modifiedTime: string }, b: { modifiedTime: string }) =>
						new Date(b.modifiedTime).getTime() -
						new Date(a.modifiedTime).getTime(),
				);
		} catch (error: any) {
			console.error("Failed to list WebDAV files:", error);
			throw new Error(error.message || "Failed to list backup files");
		}
	}

	/**
	 * 删除 WebDAV 备份文件
	 */
	async deleteWebdavFile(
		_: IpcMainInvokeEvent,
		fileName: string,
		webdavConfig: WebDavConfig,
	) {
		try {
			const webdavClient = this.getWebDavInstance(webdavConfig);
			return await webdavClient.deleteFile(fileName);
		} catch (error: any) {
			console.error("Failed to delete WebDAV file:", error);
			throw new Error(error.message || "Failed to delete backup file");
		}
	}

	/**
	 * 测试 WebDAV 连接
	 */
	async checkConnection(_: IpcMainInvokeEvent, webdavConfig: WebDavConfig) {
		const webdavClient = this.getWebDavInstance(webdavConfig);
		return await webdavClient.checkConnection();
	}
}

// 导出单例
export const backupManager = new BackupManager();
