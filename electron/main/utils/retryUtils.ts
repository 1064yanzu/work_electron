/**
 * API 请求重试工具
 * 
 * 提供可重试错误检测和指数退避重试机制
 */

/**
 * 可重试的错误模式 - 这些错误通常是临时性的，可以通过重试解决
 */
const RETRYABLE_ERROR_PATTERNS = [
    "524",           // Cloudflare timeout
    "502",           // Bad Gateway
    "503",           // Service Unavailable
    "504",           // Gateway Timeout
    "529",           // Site is overloaded
    "ETIMEDOUT",     // Connection timeout
    "ECONNRESET",    // Connection reset
    "ECONNREFUSED",  // Connection refused
    "ENOTFOUND",     // DNS lookup failed
    "socket hang up",
    "overloaded",    // API overloaded
    "rate limit",    // Rate limiting
    "too many requests",
    "timeout",       // Generic timeout
    "network error",
    "fetch failed",
];

/**
 * 不可恢复的错误模式 - 这些错误不应该重试
 */
const NON_RETRYABLE_ERROR_PATTERNS = [
    "invalid_api_key",
    "authentication",
    "unauthorized",
    "forbidden",
    "not_found",
    "invalid_request",
    "model_not_found",
    "context_length_exceeded",
    "content_policy_violation",
];

export interface RetryConfig {
    maxRetries: number;        // 最大重试次数，默认 3
    baseDelayMs: number;       // 基础延迟，默认 1000ms
    maxDelayMs: number;        // 最大延迟，默认 30000ms
    backoffMultiplier: number; // 退避倍数，默认 2
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
};

export interface RetryState {
    attempt: number;
    maxAttempts: number;
    reason: string;
    nextRetryAt: number;
}

/**
 * 检查错误是否可重试
 */
export function isRetryableError(error: string | Error): boolean {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

    // 先检查是否是不可恢复的错误
    if (NON_RETRYABLE_ERROR_PATTERNS.some(p => msg.includes(p.toLowerCase()))) {
        return false;
    }

    // 再检查是否匹配可重试模式
    return RETRYABLE_ERROR_PATTERNS.some(p => msg.includes(p.toLowerCase()));
}

/**
 * 计算指数退避延迟
 */
export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
    const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
    // 添加 10-30% 的随机抖动，避免重试风暴
    const jitter = delay * (0.1 + Math.random() * 0.2);
    return Math.min(delay + jitter, config.maxDelayMs);
}

/**
 * 带重试的异步函数执行器
 * 
 * @param fn 要执行的异步函数
 * @param config 重试配置
 * @param options 选项
 * @returns 执行结果
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    options?: {
        abortSignal?: AbortSignal;
        onRetry?: (state: RetryState) => void;
        logger?: (msg: string) => void;
    }
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        // 检查是否已中止
        if (options?.abortSignal?.aborted) {
            throw new Error("Aborted");
        }

        // 非首次尝试时等待退避延迟
        if (attempt > 0 && lastError) {
            const delayMs = calculateBackoffDelay(attempt - 1, config);
            const retryState: RetryState = {
                attempt,
                maxAttempts: config.maxRetries,
                reason: lastError.message,
                nextRetryAt: Date.now() + delayMs,
            };

            options?.logger?.(`[Retry ${attempt}/${config.maxRetries}] ${lastError.message}, waiting ${Math.round(delayMs)}ms...`);
            options?.onRetry?.(retryState);

            // 等待退避延迟
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, delayMs);
                if (options?.abortSignal) {
                    options.abortSignal.addEventListener("abort", () => {
                        clearTimeout(timer);
                        reject(new Error("Aborted during retry wait"));
                    }, { once: true });
                }
            });
        }

        try {
            return await fn();
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));

            // 检查是否是可重试的错误
            if (!isRetryableError(lastError)) {
                options?.logger?.(`[No Retry] Non-retryable error: ${lastError.message}`);
                throw lastError;
            }

            // 如果是最后一次尝试，抛出错误
            if (attempt >= config.maxRetries) {
                options?.logger?.(`[Retry Failed] Max retries reached, giving up: ${lastError.message}`);
                throw lastError;
            }

            // 否则继续重试
            options?.logger?.(`[Will Retry] Retryable error detected: ${lastError.message}`);
        }
    }

    // 理论上不会到达这里，但 TypeScript 需要返回值
    throw lastError || new Error("Unknown error");
}
