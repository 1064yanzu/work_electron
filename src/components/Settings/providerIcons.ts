// Provider 图标映射
// 将 templateId 映射到对应的图标文件路径

import openaiIcon from "../../assets/images/providers/openai.png";
import anthropicIcon from "../../assets/images/providers/anthropic.png";
import googleIcon from "../../assets/images/providers/google.png";
import deepseekIcon from "../../assets/images/providers/deepseek.png";
import mistralIcon from "../../assets/images/providers/mistral.png";
import zhipuIcon from "../../assets/images/providers/zhipu.png";
import moonshotIcon from "../../assets/images/providers/moonshot.png";
import siliconIcon from "../../assets/images/providers/silicon.png";
import aihubmixIcon from "../../assets/images/providers/aihubmix.webp";
import openrouterIcon from "../../assets/images/providers/openrouter.png";
import togetherIcon from "../../assets/images/providers/together.png";
import groqIcon from "../../assets/images/providers/groq.png";
import fireworksIcon from "../../assets/images/providers/fireworks.png";
import ollamaIcon from "../../assets/images/providers/ollama.png";
import lmstudioIcon from "../../assets/images/providers/lmstudio.png";
import newapiIcon from "../../assets/images/providers/newapi.png";
import githubIcon from "../../assets/images/providers/github.png";
import perplexityIcon from "../../assets/images/providers/perplexity.png";
import cerebrasIcon from "../../assets/images/providers/cerebras.webp";
import hyperbolicIcon from "../../assets/images/providers/hyperbolic.png";

/**
 * Provider 图标映射表
 * 将 provider 的 templateId 映射到图标文件路径
 */
export const PROVIDER_ICON_MAP: Record<string, string> = {
    openai: openaiIcon,
    anthropic: anthropicIcon,
    gemini: googleIcon,
    google: googleIcon,
    deepseek: deepseekIcon,
    mistral: mistralIcon,
    zhipu: zhipuIcon,
    moonshot: moonshotIcon,
    silicon: siliconIcon,
    aihubmix: aihubmixIcon,
    openrouter: openrouterIcon,
    together: togetherIcon,
    groq: groqIcon,
    fireworks: fireworksIcon,
    ollama: ollamaIcon,
    lmstudio: lmstudioIcon,
    newapi: newapiIcon,
    github: githubIcon,
    perplexity: perplexityIcon,
    cerebras: cerebrasIcon,
    hyperbolic: hyperbolicIcon,
};

/**
 * 获取 Provider 图标
 * @param templateId - Provider 的 templateId
 * @returns 图标文件路径，如果没有匹配则返回 undefined
 */
export function getProviderIcon(templateId?: string): string | undefined {
    if (!templateId) return undefined;
    return PROVIDER_ICON_MAP[templateId.toLowerCase()];
}

/**
 * 检查 Provider 是否有自定义图标
 */
export function hasProviderIcon(templateId?: string): boolean {
    return !!getProviderIcon(templateId);
}
