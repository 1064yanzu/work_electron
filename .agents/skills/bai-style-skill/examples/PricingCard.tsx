/**
 * B.AI 风格定价卡片
 * 对应 plan.png 截图
 */

'use client';

import { Check } from 'lucide-react';
import clsx from 'clsx';

interface Plan {
  name: string;
  price: string;
  unit: string;
  desc: string;
  features: string[];
  recommended?: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Plan Pro',
    price: '$200',
    unit: '/月',
    desc: '购买 Plan Pro 需邀请码',
    features: [
      '适合个人开发者、高频 AI 用户',
      '约 50-500 条消息 / 12 小时',
      '全系列模型可用',
      '尊享精选技能：补哥大脑、HTX/Binance、Web3 等',
    ],
  },
  {
    name: 'Plan Max',
    price: '$2,000',
    unit: '/月',
    desc: '',
    features: [
      '成为推广大使，享高额积分激励',
      '约 500-5000 条消息 / 12 小时',
      '更高优先级，优先体验试版新模型',
      '专属支持服务',
      '尊享精选技能：补哥大脑、HTX/Binance、Web3 等',
    ],
    recommended: true,
  },
];

export default function PricingSection() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">订阅计划</h1>
      <p className="mt-2 text-cream-700">
        选择适合您的服务方案，释放 BAI 的全部潜能
      </p>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
        {PLANS.map((p) => (
          <PlanCard key={p.name} plan={p} />
        ))}
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div className={clsx(
      'relative rounded-2xl bg-white border border-cream-400/80 p-8',
      'shadow-card hover:shadow-pop transition'
    )}>
      {plan.recommended && (
        <span className="absolute top-4 right-4 rounded-full
                         bg-cream-900 text-white text-[10px]
                         px-2 py-0.5 inline-flex items-center gap-1">
          ★ 推荐
        </span>
      )}

      {/* 装饰性 mark icon */}
      <div className="w-10 h-10 mb-6 flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.5" className="text-cream-900">
          <path d="M12 2 L4 8 L12 22 L20 8 Z" />
          <path d="M4 8 L20 8" />
          <path d="M12 2 L8 8 L12 22 L16 8 Z" />
        </svg>
      </div>

      <h3 className="text-lg font-medium">{plan.name}</h3>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-5xl font-semibold tracking-tight num">
          {plan.price}
        </span>
        <span className="text-cream-700">{plan.unit}</span>
      </div>
      {plan.desc && (
        <p className="mt-2 text-sm text-cream-700">{plan.desc}</p>
      )}

      <button className="mt-6 w-full rounded-full bg-cream-900 text-white
                         py-3 text-sm font-medium hover:opacity-90 transition">
        立即购买
      </button>

      <ul className="mt-6 space-y-3">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-cream-800">
            <Check strokeWidth={2} size={16}
                   className="mt-0.5 shrink-0 text-cream-900" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
