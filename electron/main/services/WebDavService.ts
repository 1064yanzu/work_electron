import https from "node:https";
import path from "node:path";
import type Stream from "node:stream";
import type {
    BufferLike,
    CreateDirectoryOptions,
    GetFileContentsOptions,
    PutFileContentsOptions,
    WebDAVClient,
} from "webdav";
import { createClient } from "webdav";

export interface WebDavConfig {
    webdavHost: string;
    webdavUser?: string;
    webdavPass?: string;
    webdavPath?: string;
    fileName?: string;
    skipBackupFile?: boolean;
    disableStream?: boolean;
    encryptionPassword?: string; // 加密密码（可选）
}

/**
 * WebDAV 客户端服务
 * 参考 Cherry Studio 实现
 */
export class WebDavService {
    public instance: WebDAVClient | undefined;
    private webdavPath: string;

    constructor(params: WebDavConfig) {
        this.webdavPath = params.webdavPath || "/";

        this.instance = createClient(params.webdavHost, {
            username: params.webdavUser,
            password: params.webdavPass,
            maxBodyLength: Number.POSITIVE_INFINITY,
            maxContentLength: Number.POSITIVE_INFINITY,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
            }),
        });

        this.putFileContents = this.putFileContents.bind(this);
        this.getFileContents = this.getFileContents.bind(this);
        this.createDirectory = this.createDirectory.bind(this);
        this.deleteFile = this.deleteFile.bind(this);
    }

    public putFileContents = async (
        filename: string,
        data: string | BufferLike | Stream.Readable,
        options?: PutFileContentsOptions,
    ) => {
        if (!this.instance) {
            return new Error("WebDAV client not initialized");
        }

        try {
            if (!(await this.instance.exists(this.webdavPath))) {
                await this.instance.createDirectory(this.webdavPath, {
                    recursive: true,
                });
            }
        } catch (error) {
            console.error("Error creating directory on WebDAV:", error);
            throw error;
        }

        const remoteFilePath = path.posix.join(this.webdavPath, filename);

        try {
            return await this.instance.putFileContents(remoteFilePath, data, options);
        } catch (error) {
            console.error("Error putting file contents on WebDAV:", error);
            throw error;
        }
    };

    public getFileContents = async (
        filename: string,
        options?: GetFileContentsOptions,
    ) => {
        if (!this.instance) {
            throw new Error("WebDAV client not initialized");
        }

        const remoteFilePath = path.posix.join(this.webdavPath, filename);

        try {
            return await this.instance.getFileContents(remoteFilePath, options);
        } catch (error) {
            console.error("Error getting file contents on WebDAV:", error);
            throw error;
        }
    };

    public getDirectoryContents = async () => {
        if (!this.instance) {
            throw new Error("WebDAV client not initialized");
        }

        try {
            return await this.instance.getDirectoryContents(this.webdavPath);
        } catch (error) {
            console.error("Error getting directory contents on WebDAV:", error);
            throw error;
        }
    };

    public checkConnection = async () => {
        if (!this.instance) {
            throw new Error("WebDAV client not initialized");
        }

        try {
            return await this.instance.exists("/");
        } catch (error) {
            console.error("Error checking connection:", error);
            throw error;
        }
    };

    public createDirectory = async (
        path: string,
        options?: CreateDirectoryOptions,
    ) => {
        if (!this.instance) {
            throw new Error("WebDAV client not initialized");
        }

        try {
            return await this.instance.createDirectory(path, options);
        } catch (error) {
            console.error("Error creating directory on WebDAV:", error);
            throw error;
        }
    };

    public deleteFile = async (filename: string) => {
        if (!this.instance) {
            throw new Error("WebDAV client not initialized");
        }

        const remoteFilePath = path.posix.join(this.webdavPath, filename);

        try {
            return await this.instance.deleteFile(remoteFilePath);
        } catch (error) {
            console.error("Error deleting file on WebDAV:", error);
            throw error;
        }
    };
}
