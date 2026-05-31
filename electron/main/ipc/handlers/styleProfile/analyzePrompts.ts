/**
 * styleProfile/analyzePrompts.ts — 分步分析 LLM Prompt 模板
 *
 * 每个 step 独立生成 JSON，避免单次超长 context。
 * 输出格式均为 JSON 数组（StyleAxisAnalysis[]）或对象（StyleCalibrationAnchors）。
 */

export const ANALYZE_SYSTEM_PROMPT = `你是一位专业的语言风格分析师。
你的任务是从用户提供的文章样本中，精准提取作者的语言风格特征。
分析时保持客观，只描述样本中真实存在的特征，不推断作者意图。
若某维度样本证据不足，请标注 insufficient_evidence 而非强行填充。
所有输出必须是严格合法的 JSON。`;

export function buildStep1Prompt(samples: string): string {
	return `以下是作者的写作样本：

${samples}

---

请分析样本中的**文本认知模式**（第一层）：即作者观察和处理世界信息的底层方式。

维度示例（但不限于）：
- 归纳 vs 演绎倾向
- 抽象 vs 具象偏好
- 叙事驱动 vs 概念驱动
- 整体框架 vs 细节堆砌
- 问题意识 vs 答案导向

请输出一个 JSON 数组，每个元素格式如下：
{
  "name": "维度名称（中文，4-8字）",
  "description": "描述（50-150字，用第三人称客观描述，引用样本中的具体表达作为证据）",
  "intensity": "low | medium | high | insufficient_evidence",
  "conditions": "可选：该特征在何种场景下尤为明显"
}

只输出 JSON 数组，不要包含其他文字。`;
}

export function buildStep2Prompt(
	samples: string,
	cognitivePatternJson: string,
): string {
	return `以下是作者的写作样本：

${samples}

---

已识别的第一层（文本认知模式）：
${cognitivePatternJson}

---

请在此基础上，分析样本中的**话语姿态**（第二层）：即作者如何在文本中定位自己与读者/议题的关系。

维度示例（但不限于）：
- 权威陈述 vs 探索商量
- 共情代入 vs 保持距离
- 反讽与幽默的使用
- 对确定性的表达方式（断言 vs 留白）
- 读者预设（专家/大众/同行）

请输出格式同上的 JSON 数组，只输出 JSON，不要包含其他文字。`;
}

export function buildStep3Prompt(
	samples: string,
	cognitivePatternJson: string,
	rhetoricalStanceJson: string,
): string {
	return `以下是作者的写作样本：

${samples}

---

已识别的前两层特征：
第一层（认知模式）：${cognitivePatternJson}
第二层（话语姿态）：${rhetoricalStanceJson}

---

请在此基础上，分析样本中的**语言审美**（第三层）：即作者对语言形式本身的审美偏好。

维度示例（但不限于）：
- 句式节奏（长句/短句比例，节奏感）
- 词汇密度（高密度术语 vs 口语化）
- 修辞手法偏好（类比/排比/反复等）
- 标点与分段习惯
- 意象与比喻的类型

请输出格式同上的 JSON 数组，只输出 JSON，不要包含其他文字。`;
}

export function buildStep4Prompt(
	samples: string,
	cognitivePatternJson: string,
	rhetoricalStanceJson: string,
	languageAestheticJson: string,
): string {
	return `以下是作者的写作样本：

${samples}

---

已识别的三层风格特征：
认知模式：${cognitivePatternJson}
话语姿态：${rhetoricalStanceJson}
语言审美：${languageAestheticJson}

---

请生成**校准锚点**，帮助 AI 在生成内容时自我校准是否符合该风格。

请输出以下 JSON 对象：
{
  "positive": ["5-8条正向示例，每条是该风格的标志性表达模式，可以是句式模板或词汇偏好"],
  "negative": ["5-8条负向示例，每条是与该风格相悖、应避免的表达方式"],
  "missing": ["缺失特征列表，每条是分析时样本不足、无法确认的维度"]
}

只输出 JSON 对象，不要包含其他文字。`;
}
