/**
 * 加密工具类
 * 使用 AES-256-GCM 加密算法保护备份数据
 */
import * as crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const ITERATIONS = 100000; // PBKDF2 迭代次数

export interface EncryptionResult {
	encryptedData: Buffer;
	iv: Buffer;
	salt: Buffer;
	tag: Buffer;
}

export class CryptoService {
	/**
	 * 从密码派生加密密钥
	 */
	private static deriveKey(password: string, salt: Buffer): Buffer {
		return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");
	}

	/**
	 * 加密数据
	 * @param data 原始数据（Buffer 或 string）
	 * @param password 加密密码
	 * @returns 加密结果（包含加密数据、IV、盐和认证标签）
	 */
	static encrypt(data: Buffer | string, password: string): EncryptionResult {
		// 生成随机盐和 IV
		const salt = crypto.randomBytes(SALT_LENGTH);
		const iv = crypto.randomBytes(IV_LENGTH);

		// 派生密钥
		const key = this.deriveKey(password, salt);

		// 创建加密器
		const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

		// 加密数据
		const dataBuffer = Buffer.isBuffer(data)
			? data
			: Buffer.from(data, "utf-8");
		const encryptedData = Buffer.concat([
			cipher.update(dataBuffer),
			cipher.final(),
		]);

		// 获取认证标签
		const tag = cipher.getAuthTag();

		return {
			encryptedData,
			iv,
			salt,
			tag,
		};
	}

	/**
	 * 解密数据
	 * @param encryptedData 加密的数据
	 * @param password 解密密码
	 * @param iv 初始化向量
	 * @param salt 盐
	 * @param tag 认证标签
	 * @returns 解密后的数据（Buffer）
	 */
	static decrypt(
		encryptedData: Buffer,
		password: string,
		iv: Buffer,
		salt: Buffer,
		tag: Buffer,
	): Buffer {
		// 派生密钥
		const key = this.deriveKey(password, salt);

		// 创建解密器
		const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(tag);

		// 解密数据
		return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
	}

	/**
	 * 将加密结果序列化为单个 Buffer
	 * 格式：[salt(32 bytes)][iv(16 bytes)][tag(16 bytes)][encrypted data]
	 */
	static serializeEncrypted(result: EncryptionResult): Buffer {
		return Buffer.concat([
			result.salt,
			result.iv,
			result.tag,
			result.encryptedData,
		]);
	}

	/**
	 * 从序列化的 Buffer 中解析加密结果
	 */
	static deserializeEncrypted(buffer: Buffer): {
		salt: Buffer;
		iv: Buffer;
		tag: Buffer;
		encryptedData: Buffer;
	} {
		if (buffer.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
			throw new Error("Invalid encrypted data: buffer too short");
		}

		let offset = 0;

		const salt = buffer.subarray(offset, offset + SALT_LENGTH);
		offset += SALT_LENGTH;

		const iv = buffer.subarray(offset, offset + IV_LENGTH);
		offset += IV_LENGTH;

		const tag = buffer.subarray(offset, offset + TAG_LENGTH);
		offset += TAG_LENGTH;

		const encryptedData = buffer.subarray(offset);

		return { salt, iv, tag, encryptedData };
	}

	/**
	 * 加密字符串并返回 Base64 编码
	 */
	static encryptString(text: string, password: string): string {
		const result = this.encrypt(text, password);
		return this.serializeEncrypted(result).toString("base64");
	}

	/**
	 * 解密 Base64 编码的字符串
	 */
	static decryptString(encryptedBase64: string, password: string): string {
		const buffer = Buffer.from(encryptedBase64, "base64");
		const { salt, iv, tag, encryptedData } = this.deserializeEncrypted(buffer);
		const decrypted = this.decrypt(encryptedData, password, iv, salt, tag);
		return decrypted.toString("utf-8");
	}

	/**
	 * 加密文件（适用于备份文件）
	 */
	static encryptFile(fileBuffer: Buffer, password: string): Buffer {
		const result = this.encrypt(fileBuffer, password);
		return this.serializeEncrypted(result);
	}

	/**
	 * 解密文件
	 */
	static decryptFile(encryptedBuffer: Buffer, password: string): Buffer {
		const { salt, iv, tag, encryptedData } =
			this.deserializeEncrypted(encryptedBuffer);
		return this.decrypt(encryptedData, password, iv, salt, tag);
	}

	/**
	 * 验证密码强度
	 * @returns 如果密码足够强则返回 true，否则返回错误消息
	 */
	static validatePassword(password: string): {
		valid: boolean;
		message?: string;
	} {
		if (password.length < 8) {
			return { valid: false, message: "密码长度至少为 8 个字符" };
		}

		if (password.length > 128) {
			return { valid: false, message: "密码长度不能超过 128 个字符" };
		}

		// 推荐但不强制的复杂度检查
		const hasUpperCase = /[A-Z]/.test(password);
		const hasLowerCase = /[a-z]/.test(password);
		const hasNumber = /[0-9]/.test(password);
		const hasSpecial = /[^A-Za-z0-9]/.test(password);

		const complexityScore = [
			hasUpperCase,
			hasLowerCase,
			hasNumber,
			hasSpecial,
		].filter(Boolean).length;

		if (complexityScore < 2) {
			return {
				valid: false,
				message: "密码建议包含大小写字母、数字和特殊字符中的至少两种",
			};
		}

		return { valid: true };
	}
}
