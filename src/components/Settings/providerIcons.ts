// Provider 图标映射
// 将 templateId 映射到对应的图标文件路径

import openaiIcon from "../../assets/images/providers/openai.png";
import anthropicIcon from "../../assets/images/providers/anthropic.png";
import googleIcon from "../../assets/images/providers/google.png";
import deepseekIcon from "../../assets/images/providers/deepseek.png";
import mistralIcon from "../../assets/images/providers/mistral.png";
import zhipuIcon from "../../assets/images/providers/zhipu.png";
import moonshotIcon from "../../assets/images/providers/moonshot.png";
import cherryinIcon from "../../assets/images/providers/cherryin.png";
import ovmsIcon from "../../assets/images/providers/ovms.png";
import ocoolaiIcon from "../../assets/images/providers/ocoolai.png";
import alayanewIcon from "../../assets/images/providers/alayanew.webp";
import aionlyIcon from "../../assets/images/providers/aionly.webp";
import burncloudIcon from "../../assets/images/providers/burncloud.png";
import cephalonIcon from "../../assets/images/providers/cephalon.jpeg";
import lanyunIcon from "../../assets/images/providers/lanyun.png";
import ph8Icon from "../../assets/images/providers/ph8.png";
import sophnetIcon from "../../assets/images/providers/sophnet.svg";
import dashscopeIcon from "../../assets/images/providers/dashscope.png";
import modelscopeIcon from "../../assets/images/providers/modelscope.png";
import doubaoIcon from "../../assets/images/providers/doubao.png";
import minimaxIcon from "../../assets/images/providers/minimax.png";
import baichuanIcon from "../../assets/images/providers/baichuan.png";
import stepIcon from "../../assets/images/providers/step.png";
import zeroOneIcon from "../../assets/images/providers/zero-one.png";
import zaiIcon from "../../assets/images/providers/zai.svg";
import qiniuIcon from "../../assets/images/providers/qiniu.webp";
import longcatIcon from "../../assets/images/providers/longcat.png";
import infiniIcon from "../../assets/images/providers/infini.png";
import grokIcon from "../../assets/images/providers/grok.png";
import nvidiaIcon from "../../assets/images/providers/nvidia.png";
import jinaIcon from "../../assets/images/providers/jina.png";
import ppioIcon from "../../assets/images/providers/ppio.png";
import ai302Icon from "../../assets/images/providers/302ai.webp";
import dmxapiIcon from "../../assets/images/providers/dmxapi.png";
import tokenfluxIcon from "../../assets/images/providers/tokenflux.png";
import huggingfaceIcon from "../../assets/images/providers/huggingface.webp";
import xirangIcon from "../../assets/images/providers/xirang.png";
import hunyuanIcon from "../../assets/images/providers/hunyuan.png";
import tencentCloudTiIcon from "../../assets/images/providers/tencent-cloud-ti.png";
import baiduCloudIcon from "../../assets/images/providers/baidu-cloud.svg";
import voyageaiIcon from "../../assets/images/providers/voyageai.png";
import mimoIcon from "../../assets/images/providers/mimo.svg";
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
	cherryin: cherryinIcon,
	ovms: ovmsIcon,
	ocoolai: ocoolaiIcon,
	alayanew: alayanewIcon,
	aionly: aionlyIcon,
	burncloud: burncloudIcon,
	cephalon: cephalonIcon,
	lanyun: lanyunIcon,
	ph8: ph8Icon,
	sophnet: sophnetIcon,
	dashscope: dashscopeIcon,
	modelscope: modelscopeIcon,
	doubao: doubaoIcon,
	minimax: minimaxIcon,
	"minimax-global": minimaxIcon,
	baichuan: baichuanIcon,
	stepfun: stepIcon,
	yi: zeroOneIcon,
	zai: zaiIcon,
	xirang: xirangIcon,
	hunyuan: hunyuanIcon,
	"tencent-cloud-ti": tencentCloudTiIcon,
	"baidu-cloud": baiduCloudIcon,
	voyageai: voyageaiIcon,
	mimo: mimoIcon,
	qiniu: qiniuIcon,
	longcat: longcatIcon,
	infini: infiniIcon,
	grok: grokIcon,
	nvidia: nvidiaIcon,
	jina: jinaIcon,
	ppio: ppioIcon,
	"302ai": ai302Icon,
	dmxapi: dmxapiIcon,
	tokenflux: tokenfluxIcon,
	huggingface: huggingfaceIcon,
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
