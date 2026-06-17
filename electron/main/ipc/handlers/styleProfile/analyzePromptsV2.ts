/**
 * styleProfile/analyzePromptsV2.ts — 完整「灵魂-骨干-血肉」体系分析 Prompt
 *
 * 8 步分析：
 * 1. 灵魂层 - 世界观与根本姿态
 * 2. 骨干层 - 思维运作
 * 3. 骨干层 - 篇章外化
 * 4. 血肉层 - 语言质感与指纹
 * 5. 横切话题
 * 6. 气韵（跨层）
 * 7. 全息性（跨尺度）
 * 8. 经变分布（跨篇）
 */

export const ANALYZE_SYSTEM_PROMPT_V2 = `你是一位专业的语言风格分析师，精通「灵魂-骨干-血肉」三层风格体系。

你的任务是从用户提供的文章样本中，精准提取作者的语言风格特征，构建完整的风格地图。

核心原则：
1. 只描述样本中真实存在的特征，不推断作者意图
2. 若某维度样本证据不足，标注 insufficient_evidence 而非强行填充
3. 特征性瑕疵同样重要——记录"不完美但反复出现"的习惯
4. 所有输出必须是严格合法的 JSON

分析顺序：灵魂 → 骨干 → 血肉 → 横切 → 气韵 → 全息 → 经变`;

// ============================================================================
// Step 1: 灵魂层 - 世界观与根本姿态
// ============================================================================

export function buildStep1SoulLayerPrompt(samples: string): string {
	return `以下是作者的写作样本：

${samples}

---

请分析样本中的**灵魂层**——世界观与根本姿态。这是三层中最稳定、跨题目几乎不变的部分。

需要分析的维度（每个维度输出一个对象）：

1. **核心关切**：什么问题无法绕开（最多2-3个，标主次）
2. **基本立场**：对核心关切肯定什么、警惕什么、回避什么
3. **认识论姿态**：实证（事实是锚点）↔ 诠释（意义是建构的）↔ 实用（看效果不看真伪）
4. **复杂性处理**：化繁为简、寻求统一 ↔ 保留矛盾、抵制化约
5. **不确定性姿态**：不确定也给倾向性判断 ↔ 保持开放 ↔ 把不确定性本身变成论点核心
6. **时间关系**：历史意识主导 ↔ 当下敏感 ↔ 前瞻导向
7. **系统与个案优先级**：从系统理解个案 ↔ 从个案质疑系统
8. **与主流关系**：加入并深化 ↔ 挑战并构建异见 ↔ 不在乎主流
9. **起笔触发**：反应（需外部由头）↔ 生成（内在自我驱动）
10. **读者关系**：专家（我知道告诉你）↔ 同行（我们一起想）↔ 学生（我也在摸索）；假定读者立场；知识共同体预设
11. **自我在场方式**：隐身 ↔ 在场但非主角 ↔ 主体性强；自我指涉纵深
12. **语言自觉度**：语言是透明工具 ↔ 被把玩的玩物
13. **根本气质**：悲剧感 ↔ 喜剧感 ↔ 讽刺感 ↔ 庄重感

请输出 JSON 对象，结构如下：
{
  "core_concerns": [{ "name": "维度名", "description": "描述（引用样本证据）", "intensity": "low|medium|high|insufficient_evidence", "conditions": "可选" }],
  "core_stance": [...],
  "epistemology": [...],
  "complexity_handling": [...],
  "uncertainty_stance": [...],
  "temporal_orientation": [...],
  "system_vs_case": [...],
  "mainstream_relation": [...],
  "initiation_trigger": [...],
  "reader_relation": [...],
  "self_presence": [...],
  "language_consciousness": [...],
  "fundamental_temperament": [...]
}

每个维度可以有多个分析对象，也可以只有一个。若某维度无法从样本中判断，该数组留空 []。

只输出 JSON 对象，不要包含其他文字。`;
}

// ============================================================================
// Step 2: 骨干层 - 思维运作
// ============================================================================

export function buildStep2ThinkingOperationPrompt(
	samples: string,
	soulLayerJson: string,
): string {
	return `以下是作者的写作样本：

${samples}

---

已识别的灵魂层：
${soulLayerJson}

---

请在此基础上，分析样本中的**骨干层·思维运作**——这个脑子怎么动（跨题目基本不变）。

需要分析的维度：

1. **推理方向**：归纳（现象→规律）↔ 演绎（前提→推论）↔ 类比（已知映射未知），标主次
2. **抽象-具体运动**：停在抽象 ↔ 停在具体 ↔ 两者往返（且往返方向有偏好）
3. **取景与剪裁**：注意力探照灯——优先注意什么、放大什么、对什么视而不见
4. **论据质料偏好**：用什么立论——轶事/统计/历史案例/权威引用/思想实验/纯逻辑/诉诸直觉，标主次
5. **论证构造**：如何处理反方——主动引入并消化、作次要干扰一笔带过、还是倾向回避
6. **收敛方式**：强结论 ↔ 留开放空间 ↔ 以一个新问题收束

请输出 JSON 对象：
{
  "reasoning_direction": [...],
  "abstraction_movement": [...],
  "attention_framing": [...],
  "evidence_preference": [...],
  "argumentation_structure": [...],
  "convergence_mode": [...]
}

只输出 JSON 对象，不要包含其他文字。`;
}

// ============================================================================
// Step 3: 骨干层 - 篇章外化（关节活动范围）
// ============================================================================

export function buildStep3ArticulationPatternPrompt(
	samples: string,
	soulLayerJson: string,
	thinkingOperationJson: string,
): string {
	return `以下是作者的写作样本：

${samples}

---

已识别的特征：
灵魂层：${soulLayerJson}
思维运作：${thinkingOperationJson}

---

请在此基础上，分析样本中的**骨干层·篇章外化**——思维如何落到篇章上（用「关节活动范围」写法，描述动作在什么条件/范围内发生，不规定固定落点）。

需要分析的维度：

1. **问题驱动程度**：是否以问题作为推进引擎；问题颗粒度偏宏观还是微观
2. **信息密度运动范围**：密度曲线倾向于怎样起伏（如"开头铺陈、中段聚焦"），峰值落在第几段由题目决定
3. **转折/让步的关节范围**：转折倾向于在论证推进到什么程度时出现——遇反例时、情绪积累到阈值时、还是逻辑走到分支点时
4. **开篇的重力倾向**：开篇先满足什么——建立认同、抛出张力、还是先界定范围；是否依赖外部由头起笔（接灵魂层"起笔触发"）
5. **结尾的重力倾向**：收尾满足什么——回扣更大框架、留开口、还是完成闭环
6. **结构的显隐**：路标密度——明示结构（小标题、"第一第二"、过渡明示）↔ 让结构隐于无形

请输出 JSON 对象：
{
  "question_driven": [...],
  "density_movement": [...],
  "transition_joint": [...],
  "opening_gravity": [...],
  "closing_gravity": [...],
  "structure_visibility": [...]
}

只输出 JSON 对象，不要包含其他文字。`;
}

// ============================================================================
// Step 4: 血肉层 - 语言质感与指纹
// ============================================================================

export function buildStep4TextureLayerPrompt(
	samples: string,
	soulLayerJson: string,
	thinkingOperationJson: string,
	articulationPatternJson: string,
): string {
	return `以下是作者的写作样本：

${samples}

---

已识别的特征：
灵魂层：${soulLayerJson}
思维运作：${thinkingOperationJson}
篇章外化：${articulationPatternJson}

---

请在此基础上，分析样本中的**血肉层**——语言质感与指纹。多数条目从上两层代谢而来，末尾保留不必解释来源的指纹。

需要分析的维度：

1. **句子节奏**：长短句比例、停顿密度，是否段内混用制造张弛
2. **词汇层级**：口语 ↔ 书面 ↔ 技术，混用则标切换触发；含语言杂糅度（文白、中外、雅俗、方言/网络语）
3. **修辞偏好**：最依赖的两到三种手段（反问、排比、类比举例、引用、数字列举……），关注使用密度
4. **情感温度及突破条件**：常态温度，以及在什么情境下升温/降温、突破惯常克制
5. **比喻系统**：使用密度 + 喻体来源域偏好（日常、自然、机械、身体感知、经济、历史……）
6. **数据与数字审美**：精确数字制造质感 ↔ 量级估算；数据是论证支撑还是审美点缀
7. **人称/称谓使用**："我"的频率、是否用"你/你们"拉近、是否偏好无人称泛称
8. **引用处理**：直接引用 ↔ 转述大意；引用频率；是否标注来源
9. **格式与排版习惯**：段落切分（短段/空行）、是否用列举编号、表情与特殊符号倾向
10. **指纹级小习惯**：特定词/标点/搭配的高频出现（爱用某连接词、某种破折号、某两字常连用）——不要求解释"为什么"，这些让读者直觉"就是这个人"

请输出 JSON 对象：
{
  "sentence_rhythm": [...],
  "lexical_register": [...],
  "rhetorical_devices": [...],
  "emotional_temperature": [...],
  "metaphor_system": [...],
  "data_aesthetics": [...],
  "pronoun_usage": [...],
  "citation_handling": [...],
  "formatting_habits": [...],
  "fingerprint_habits": [...]
}

注意：指纹级小习惯也要记录"特征性瑕疵"——称不上优点但反复出现的习惯。

只输出 JSON 对象，不要包含其他文字。`;
}

// ============================================================================
// Step 5: 横切话题（贯穿三层）
// ============================================================================

export function buildStep5CrossCuttingPrompt(
	samples: string,
	soulLayerJson: string,
	thinkingOperationJson: string,
	articulationPatternJson: string,
	textureLayerJson: string,
): string {
	return `以下是作者的写作样本：

${samples}

---

已识别的三层特征：
灵魂层：${soulLayerJson}
思维运作：${thinkingOperationJson}
篇章外化：${articulationPatternJson}
血肉层：${textureLayerJson}

---

请识别**横切话题**——贯穿三层、每层各答一次的主题。

需要分析的横切话题（若样本中不存在某话题，该字段可省略）：

1. **执念意象/反复出现的例证域**（若有）：
   - soul: 为什么重要
   - structure: 在论证什么位置出现、起什么作用
   - texture: 具体怎么措辞

2. **幽默与讽刺**（若有）：
   - soul: 根在灵魂根本气质
   - structure: 出现在什么阶段、服务什么功能（缓和/反讽否定/过渡）
   - texture: 靠什么手段（自嘲/反讽/夸张）

3. **标题习惯**（若有）：
   - structure: 在结构中的角色（论点浓缩还是悬念设置）
   - texture: 表层形式（陈述/疑问/悬念）

4. **元评论/自我指涉**（若有）：
   - soul: 是否是自我在场的延伸
   - structure: 出现在思维转向的什么节点（提新概念/自我修正）
   - texture: 具体怎么表达

请输出 JSON 对象：
{
  "recurring_imagery": { "soul": "...", "structure": "...", "texture": "..." } 或省略,
  "humor_irony": { "soul": "...", "structure": "...", "texture": "..." } 或省略,
  "title_habit": { "structure": "...", "texture": "..." } 或省略,
  "meta_commentary": { "soul": "...", "structure": "...", "texture": "..." } 或省略
}

只输出 JSON 对象，不要包含其他文字。`;
}

// ============================================================================
// Step 6: 气韵（跨层）
// ============================================================================

export function buildStep6LayerHarmonyPrompt(
	samples: string,
	soulLayerJson: string,
	thinkingOperationJson: string,
	articulationPatternJson: string,
	textureLayerJson: string,
): string {
	return `以下是作者的写作样本：

${samples}

---

已识别的三层特征：
灵魂层：${soulLayerJson}
思维运作：${thinkingOperationJson}
篇章外化：${articulationPatternJson}
血肉层：${textureLayerJson}

---

请描述**气韵**——三层之间的比例关系或反差。

用一句话（50-150字）描述三者之间的比例关系或反差，这是写作 AI 接收到的第一印象校准。

例如："灵魂严肃，骨架克制，但血肉轻盈，造成一种郑重其事地开玩笑的感觉"。

请输出 JSON 对象：
{
  "description": "一句话描述三层之间的比例关系或反差"
}

只输出 JSON 对象，不要包含其他文字。`;
}

// ============================================================================
// Step 7: 全息性（跨尺度）
// ============================================================================

export function buildStep7HolographicPrompt(
	samples: string,
	soulLayerJson: string,
	thinkingOperationJson: string,
	articulationPatternJson: string,
	textureLayerJson: string,
): string {
	return `以下是作者的写作样本：

${samples}

---

已识别的三层特征：
灵魂层：${soulLayerJson}
思维运作：${thinkingOperationJson}
篇章外化：${articulationPatternJson}
血肉层：${textureLayerJson}

---

请识别**全息性**——同一"形状"在句子级、段落级、全文级三个尺度复现的模式。

识别 1-3 个会同时出现在多个尺度的"形状"。例如"让步-反转"：
- 句子级："不是 X，而是 Y"
- 段落级：先呈现常见看法、再质疑、再修正
- 全文级：开篇接受共识、中段复杂化、结尾重新定位

同一形状贯穿三个尺度即极强签名——意味着 AI 哪怕只写一句话，也会自动带上这个作者的印记。

请输出 JSON 数组：
[
  {
    "name": "形状名称",
    "description": "形状描述",
    "sentence_level": "句子级表现（若有）",
    "paragraph_level": "段落级表现（若有）",
    "article_level": "全文级表现（若有）"
  }
]

只在单一尺度出现的，如实记录，不必强行凑。

只输出 JSON 数组，不要包含其他文字。`;
}

// ============================================================================
// Step 8: 经变分布（跨篇）
// ============================================================================

export function buildStep8ConstancyVariancePrompt(
	samples: string,
	allPreviousJson: string,
): string {
	return `以下是作者的写作样本：

${samples}

---

已识别的所有特征：
${allPreviousJson}

---

请标注**经变分布**——前面填的每一条轴线，对这位作者是"不管写什么都基本不变"的（经），还是"换题目/换心情就会摆动"的（变）。

判断方式：若样本中有多篇不同主题的文章，横向比较；若样本少，根据已有特征的稳定性推断。

标"变"的，记录浮动范围或触发条件（如"认识论姿态在科学话题偏实证、在文化话题偏诠释"）。

请输出 JSON 对象：
{
  "summary": "一句话：这位作者的'经'集中在……,'变'集中在……",
  "constants": ["标记为'经'的维度关键路径，如'灵魂层·核心关切'、'血肉层·句子节奏'等"],
  "variables": [
    { "dimension": "标记为'变'的维度", "range": "浮动范围或触发条件" }
  ]
}

只输出 JSON 对象，不要包含其他文字。`;
}
