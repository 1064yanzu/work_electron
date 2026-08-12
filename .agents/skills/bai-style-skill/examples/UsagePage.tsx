/**
 * B.AI 风格用量信息页
 * 对应 usage.png 截图
 *
 * 依赖：recharts
 */

'use client';

import { Database, CreditCard, TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip,
} from 'recharts';

const MONTHLY = [
  { month: '6月', usage: 0 }, { month: '7月', usage: 0 },
  { month: '8月', usage: 0 }, { month: '9月', usage: 0 },
  { month: '10月', usage: 0 }, { month: '11月', usage: 0 },
  { month: '12月', usage: 0 }, { month: '1月', usage: 0 },
  { month: '2月', usage: 0 }, { month: '3月', usage: 0 },
  { month: '4月', usage: 0 }, { month: '5月', usage: 0 },
];

export default function UsagePage() {
  return (
    <div className="max-w-5xl mx-auto py-10 px-8">
      {/* 标题 + 分割线 */}
      <h1 className="text-2xl font-semibold tracking-tight">用量信息</h1>
      <hr className="mt-4 border-cream-400" />

      {/* 顶部双卡片 */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardLabel icon={Database}>积分余额</CardLabel>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-5xl font-semibold tracking-tight num">
              500,000
            </span>
            <button className="rounded-full bg-peach-100 px-4 py-1.5
                               text-xs font-medium hover:bg-peach-200/70">
              + 充值
            </button>
          </div>
          <div className="mt-2 text-xs text-cream-600">赠送积分：500,000</div>
        </Card>

        <Card>
          <CardLabel icon={CreditCard}>本月消费</CardLabel>
          <div className="mt-3 text-5xl font-semibold tracking-tight num">
            0
          </div>
        </Card>
      </div>

      {/* 图表 */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">每月用量</h2>
        <div className="mt-4 rounded-2xl bg-white border border-cream-400/80
                        p-6 shadow-card h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={MONTHLY}
                       margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              {/* 关键：只保留虚线水平网格 */}
              <CartesianGrid strokeDasharray="2 4" stroke="#E8E5DD"
                             vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false}
                     tick={{ fill: '#9D9D98', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false}
                     tick={{ fill: '#9D9D98', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: '#fff', border: '1px solid #E8E5DD',
                  borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              />
              <Line type="monotone" dataKey="usage"
                    stroke="#1A1A19" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 积分明细 */}
      <h2 className="mt-12 text-lg font-semibold tracking-tight">积分明细</h2>
      {/* 表格略 */}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-cream-400/80
                    p-6 shadow-card">
      {children}
    </div>
  );
}

function CardLabel({
  icon: Icon, children,
}: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-cream-700">
      <Icon strokeWidth={1.5} size={16} />
      {children}
    </div>
  );
}
