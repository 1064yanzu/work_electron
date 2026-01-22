import gpt4Icon from "../../assets/images/models/gpt_4.png";
import gpt35Icon from "../../assets/images/models/gpt_3.5.png";
import gptO1Icon from "../../assets/images/models/gpt_o1.png";
import gptGeneralIcon from "../../assets/images/models/gpt_dark.png";
import claudeIcon from "../../assets/images/models/claude.png";
import geminiIcon from "../../assets/images/models/gemini.png";
import deepseekIcon from "../../assets/images/models/deepseek.png";
import llamaIcon from "../../assets/images/models/llama.png";
import qwenIcon from "../../assets/images/models/qwen.png";
import mixtralIcon from "../../assets/images/models/mixtral.png";
import moonshotIcon from "../../assets/images/models/moonshot.png";
import zhipuIcon from "../../assets/images/models/zhipu.png";
import grokIcon from "../../assets/images/models/grok.png";
import perplexityIcon from "../../assets/images/models/perplexity.png";
import yiIcon from "../../assets/images/models/yi.png";

export const MODEL_ICON_MAP: Record<string, string> = {
    "gpt-4": gpt4Icon,
    "gpt-3.5": gpt35Icon,
    "gpt-o1": gptO1Icon,
    gpt: gptGeneralIcon,
    claude: claudeIcon,
    gemini: geminiIcon,
    deepseek: deepseekIcon,
    llama: llamaIcon,
    qwen: qwenIcon,
    mixtral: mixtralIcon,
    mistral: mixtralIcon, // fallback to mixtral if mistral icon missing
    moonshot: moonshotIcon,
    glm: zhipuIcon,
    zhipu: zhipuIcon,
    grok: grokIcon,
    perplexity: perplexityIcon,
    yi: yiIcon,
};

/**
 * 根据模型 ID 获取对应的图标
 * 使用正则匹配模型名称
 */
export function getModelIcon(modelId: string): string | undefined {
    if (!modelId) return undefined;

    const id = modelId.toLowerCase();

    // 正则匹配规则 (参考 Cherry Studio)
    const rules: Array<[RegExp, string]> = [
        [/o1(-|\b)/, gptO1Icon],
        [/gpt-4/, gpt4Icon],
        [/gpt-3\.5/, gpt35Icon],
        [/gpt/, gptGeneralIcon],
        [/claude/, claudeIcon],
        [/gemini/, geminiIcon],
        [/deepseek/, deepseekIcon],
        [/llama/, llamaIcon],
        [/qwen/, qwenIcon],
        [/qwq/, qwenIcon],
        [/mixtral/, mixtralIcon],
        [/mistral/, mixtralIcon],
        [/moonshot/, moonshotIcon],
        [/kimi/, moonshotIcon],
        [/glm/, zhipuIcon],
        [/grok/, grokIcon],
        [/perplexity/, perplexityIcon],
        [/sonar/, perplexityIcon],
        [/yi(-|\b)/, yiIcon],
    ];

    for (const [regex, icon] of rules) {
        if (regex.test(id)) {
            return icon;
        }
    }

    return undefined;
}
