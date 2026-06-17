/**
 * 语言风格包升级到 v2「灵魂-骨干-血肉」体系
 *
 * 添加新字段支持完整的三层分析 + 关系性维度
 */

export const upgradeStyleProfileToV2 = `
-- 检查并添加新字段到 style_analyses 表
-- 使用 ALTER TABLE 逐个添加字段（SQLite 不支持批量 ADD COLUMN）

-- schema 版本标识
ALTER TABLE style_analyses ADD COLUMN schema_version TEXT DEFAULT 'v1';

-- 灵魂层
ALTER TABLE style_analyses ADD COLUMN soul_layer TEXT;

-- 骨干层·思维运作
ALTER TABLE style_analyses ADD COLUMN thinking_operation TEXT;

-- 骨干层·篇章外化
ALTER TABLE style_analyses ADD COLUMN articulation_pattern TEXT;

-- 血肉层
ALTER TABLE style_analyses ADD COLUMN texture_layer TEXT;

-- 横切话题
ALTER TABLE style_analyses ADD COLUMN cross_cutting TEXT;
`;

export function applyStyleProfileV2Migration(db: { execute: (opts: { sql: string }) => Promise<unknown> }) {
	const statements = upgradeStyleProfileToV2
		.split(';')
		.map(s => s.trim())
		.filter(s => s.length > 0 && !s.startsWith('--'));

	return Promise.all(
		statements.map(sql =>
			db.execute({ sql }).catch(err => {
				// 忽略"列已存在"错误（幂等性）
				if (err.message?.includes('duplicate column name')) {
					return;
				}
				throw err;
			})
		)
	);
}
