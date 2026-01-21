/**
 * Agent Model Scenario Settings Component
 * 
 * DESIGN PHILOSOPHY:
 * Premium, modern, and delicate.
 * Using subtle shadows, refined typography, and smooth transitions.
 */
import {
    Bot,
    ChevronDown,
    Plus,
    Sparkles,
    Trash2,
    Zap,
    PenTool,
    Search,
    Code2,
    Microscope,
    Languages,
    FileJson,
    Bug,
    Box,
    Check,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    type AgentScenario,
    type ScenarioModelConfig,
    SCENARIO_DESCRIPTIONS,
    SCENARIO_LABELS,
} from '../../../lib/models/agentModelConfig';
import { useAgentModelSettingsStore } from '../../../lib/models/agentModelSettingsStore';
import { useSettingsStore } from '../../../lib/settingsStore';
import { Modal } from '../components';

// Icon mapping for Scenarios
const SCENARIO_ICONS: Record<string, any> = {
    default: Zap,
    fast_search: Search,
    code_review: Code2,
    deep_analysis: Microscope,
    writing: PenTool,
    translation: Languages,
    data_processing: FileJson,
    debugging: Bug,
    custom: Box,
};

// Provider Colors
const PROVIDER_COLORS: Record<string, string> = {
    anthropic: 'bg-purple-50 text-purple-700 border-purple-200',
    openai: 'bg-green-50 text-green-700 border-green-200',
    google: 'bg-blue-50 text-blue-700 border-blue-200',
    deepseek: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    default: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

const getProviderStyle = (providerId: string) => {
    const key = Object.keys(PROVIDER_COLORS).find(k => providerId.toLowerCase().includes(k)) || 'default';
    return PROVIDER_COLORS[key];
};

/**
 * Premium Card Component
 */
const Card = ({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => (
    <div
        onClick={onClick}
        className={`bg-white rounded-xl border border-zinc-200/60 shadow-sm hover:shadow-md hover:border-zinc-300/80 transition-all duration-200 ${className}`}
    >
        {children}
    </div>
);

/**
 * Premium Badge Component
 */
const Badge = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${className}`}>
        {children}
    </span>
);

/**
 * Custom Select Component
 */
interface SelectOption {
    label: string;
    value: string;
    subLabel?: string;
    icon?: any;
    badge?: string;
}

interface SelectGroup {
    label: string;
    items: SelectOption[];
}

const CustomSelect = ({
    options,
    groups,
    value,
    onChange,
    placeholder = "请选择...",
    label,
    renderOption
}: {
    options?: SelectOption[],
    groups?: SelectGroup[],
    value: string,
    onChange: (val: string) => void,
    placeholder?: string,
    label?: string,
    renderOption?: (opt: SelectOption) => React.ReactNode
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);

    // Collapsed state for groups (default all expanded)
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    const toggleGroup = (groupLabel: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setCollapsedGroups(prev => ({
            ...prev,
            [groupLabel]: !prev[groupLabel]
        }));
    };

    // Calculate position on open
    useEffect(() => {
        if (isOpen && triggerRef.current) {
            const updatePosition = () => {
                const rect = triggerRef.current?.getBoundingClientRect();
                if (rect) {
                    setPosition({
                        top: rect.bottom + window.scrollY + 8,
                        left: rect.left + window.scrollX,
                        width: rect.width
                    });
                }
            };
            updatePosition();
            window.addEventListener('scroll', updatePosition);
            window.addEventListener('resize', updatePosition);
            return () => {
                window.removeEventListener('scroll', updatePosition);
                window.removeEventListener('resize', updatePosition);
            };
        }
    }, [isOpen]);

    // Click outside to close
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (triggerRef.current && triggerRef.current.contains(event.target as Node)) return;
            // Check if click is inside the portal dropdown (we can't easily ref it due to portal, 
            // but we can check if the target is inside a data-id element)
            const target = event.target as HTMLElement;
            if (target.closest('[data-select-dropdown]')) return;

            setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Find selected label from options OR groups
    const selectedOption = useMemo(() => {
        if (options) return options.find(o => o.value === value);
        if (groups) {
            for (const group of groups) {
                const found = group.items.find(o => o.value === value);
                if (found) return found;
            }
        }
        return null;
    }, [options, groups, value]);

    return (
        <>
            {/* Trigger */}
            <div
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`group relative w-full bg-zinc-50 hover:bg-white border transition-all duration-200 rounded-xl px-3 py-2.5 cursor-pointer flex items-center justify-between ${isOpen ? 'ring-2 ring-zinc-900/5 border-zinc-300 bg-white' : 'border-zinc-200'}`}
            >
                <div className="flex items-center gap-2 min-w-0">
                    {selectedOption?.icon && <selectedOption.icon className="w-4 h-4 text-zinc-500" />}
                    <div className="flex flex-col items-start truncate">
                        {label && <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-0.5">{label}</span>}
                        <span className={`text-sm ${value ? 'text-zinc-900' : 'text-zinc-400'} truncate font-medium`}>
                            {selectedOption ? selectedOption.label : placeholder}
                        </span>
                    </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {/* Portal Dropdown */}
            {isOpen && createPortal(
                <div
                    data-select-dropdown
                    style={{
                        position: 'absolute',
                        top: position.top,
                        left: position.left,
                        width: position.width,
                        zIndex: 9999, // High z-index to break out
                    }}
                    className="bg-white rounded-xl border border-zinc-200 shadow-xl max-h-[300px] overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col"
                >
                    <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
                        {/* Render Groups */}
                        {groups ? (
                            groups.map((group) => (
                                <div key={group.label} className="mb-1 last:mb-0">
                                    <div
                                        onClick={(e) => toggleGroup(group.label, e)}
                                        className="flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-zinc-500 bg-zinc-50/50 hover:bg-zinc-100 cursor-pointer rounded-lg mb-1 select-none"
                                    >
                                        <span>{group.label} ({group.items.length})</span>
                                        <ChevronDown className={`w-3 h-3 transition-transform ${collapsedGroups[group.label] ? '-rotate-90' : ''}`} />
                                    </div>

                                    {!collapsedGroups[group.label] && (
                                        <div className="space-y-0.5 pl-1">
                                            {group.items.map(option => (
                                                <OptionItem
                                                    key={option.value}
                                                    option={option}
                                                    isSelected={value === option.value}
                                                    onClick={() => { onChange(option.value); setIsOpen(false); }}
                                                    renderOption={renderOption}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            // Render Flat Options
                            options?.length === 0 ? (
                                <div className="px-3 py-8 text-center text-xs text-zinc-400">暂无选项</div>
                            ) : (
                                options?.map((option) => (
                                    <OptionItem
                                        key={option.value}
                                        option={option}
                                        isSelected={value === option.value}
                                        onClick={() => { onChange(option.value); setIsOpen(false); }}
                                        renderOption={renderOption}
                                    />
                                ))
                            )
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

const OptionItem = ({ option, isSelected, onClick, renderOption }: { option: SelectOption, isSelected: boolean, onClick: () => void, renderOption?: any }) => (
    <div
        onClick={onClick}
        className={`px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors flex items-center justify-between group ${isSelected ? 'bg-zinc-100/80 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'}`}
    >
        {renderOption ? renderOption(option) : (
            <div className="flex items-center gap-2 overflow-hidden">
                {option.icon && <option.icon className="w-4 h-4 opacity-50 shrink-0" />}
                <div className="min-w-0">
                    <div className="font-medium truncate">{option.label}</div>
                    {option.subLabel && <div className="text-xs text-zinc-400 truncate">{option.subLabel}</div>}
                </div>
            </div>
        )}
        <div className="flex items-center gap-2 shrink-0">
            {option.badge && (
                <Badge className="bg-zinc-100 text-zinc-500 group-hover:bg-white border-zinc-200">{option.badge}</Badge>
            )}
            {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
        </div>
    </div>
);

export function AgentModelScenarioSettings() {
    const { settings, store, isLoaded } = useAgentModelSettingsStore();
    const { providers } = useSettingsStore();

    // UI States
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'preset' | 'custom'>('preset');

    // Form States
    const [selectedScenarioType, setSelectedScenarioType] = useState<AgentScenario>('fast_search');
    const [customScenarioName, setCustomScenarioName] = useState('');
    const [selectedModelId, setSelectedModelId] = useState('');
    const [selectedProviderId, setSelectedProviderId] = useState('');

    // Load store
    useEffect(() => {
        if (!isLoaded) {
            store.init();
        }
    }, [isLoaded, store]);

    // Derived Data
    const allModels = useMemo(() => {
        return providers
            .filter(p => p.isEnabled)
            .flatMap(p =>
                p.models.map(m => ({
                    id: m,
                    provider: p.name,
                    providerId: p.id,
                }))
            );
    }, [providers]);

    // Group models by provider for grouped select
    const modelGroups = useMemo<SelectGroup[]>(() => {
        return providers
            .filter(p => p.isEnabled)
            .map(p => ({
                label: p.name,
                items: p.models.map(m => ({
                    label: m,
                    value: m,
                    // subLabel: p.name, // Redundant in grouped view
                    badge: '', // Removed badge as header shows provider
                }))
            }))
            .filter(g => g.items.length > 0);
    }, [providers]);

    // Flat options for fallback or other uses
    const modelOptions = useMemo<SelectOption[]>(() =>
        allModels.map(m => ({
            label: m.id,
            value: m.id,
            subLabel: m.provider,
            badge: m.provider,
        }))
        , [allModels]);

    const configuredScenarios = useMemo(() => {
        return new Set(settings.scenarioConfigs.map((c: ScenarioModelConfig) =>
            c.scenario === 'custom' ? `custom:${c.customName}` : c.scenario
        ));
    }, [settings.scenarioConfigs]);

    const availablePresetScenarios = useMemo(() => {
        const presets: AgentScenario[] = [
            'fast_search', 'code_review', 'deep_analysis',
            'writing', 'translation', 'data_processing', 'debugging'
        ];
        return presets.filter(s => !configuredScenarios.has(s));
    }, [configuredScenarios]);

    const presetOptions = useMemo<SelectOption[]>(() =>
        availablePresetScenarios.map(s => ({
            label: SCENARIO_LABELS[s],
            value: s,
            subLabel: SCENARIO_DESCRIPTIONS[s],
            icon: SCENARIO_ICONS[s]
        }))
        , [availablePresetScenarios]);

    // Handlers
    const handleDefaultModelChange = async (modelId: string) => {
        const model = allModels.find(m => m.id === modelId);
        if (model) {
            await store.setDefaultModel(modelId, model.providerId);
        }
    };

    const handleAddScenario = async () => {
        if (!selectedModelId || !selectedProviderId) return;

        const isCustom = activeTab === 'custom';
        const scenario = isCustom ? 'custom' : selectedScenarioType;

        // Validation
        if (isCustom && !customScenarioName.trim()) return;

        await store.addScenarioConfig({
            scenario,
            customName: isCustom ? customScenarioName.trim() : undefined,
            modelId: selectedModelId,
            providerId: selectedProviderId,
        });

        setIsAddModalOpen(false);
        resetForm();
    };

    const resetForm = () => {
        setSelectedModelId('');
        setSelectedProviderId('');
        setCustomScenarioName('');
        setSelectedScenarioType(availablePresetScenarios[0] || 'fast_search');
    };

    const handleRemove = async (config: ScenarioModelConfig) => {
        await store.removeScenarioConfig(config.scenario, config.customName);
    };

    const handleToggle = async (config: ScenarioModelConfig) => {
        await store.updateScenarioConfig(config.scenario, { enabled: !config.enabled });
    };

    const handleScenarioModelChange = async (config: ScenarioModelConfig, modelId: string) => {
        const model = allModels.find(m => m.id === modelId);
        if (model) {
            await store.updateScenarioConfig(config.scenario, { modelId, providerId: model.providerId });
        }
    };

    const getModelDisplay = (modelId: string, providerId: string) => {
        const model = allModels.find(m => m.id === modelId && m.providerId === providerId);
        return model ? { name: model.id, provider: model.provider } : { name: modelId, provider: providerId };
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col gap-1">
                <h4 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
                    <Bot className="w-5 h-5 text-indigo-600" />
                    模型场景配置
                </h4>
                <p className="text-sm text-zinc-500">
                    针对不同任务配置专用的 AI 模型，平衡性能与成本。
                </p>
            </div>

            {/* Global Settings Group */}
            <div className="grid grid-cols-1 gap-4">
                {/* Simplified layout for Default Model & Smart Switch */}
                <div className="bg-white rounded-xl border border-zinc-200/60 shadow-sm p-1 grid grid-cols-2 divide-x divide-zinc-100">
                    <div className="p-4 flex flex-col justify-between">
                        <div className="mb-2">
                            <div className="flex items-center gap-2 font-medium text-zinc-900 text-sm">
                                <Zap className="w-4 h-4 text-amber-500" />
                                默认模型
                            </div>
                            <p className="text-xs text-zinc-400 mt-1">兜底使用的基础模型</p>
                        </div>
                        <CustomSelect
                            value={settings.defaultModelId}
                            groups={modelGroups}
                            onChange={handleDefaultModelChange}
                            placeholder="选择默认模型..."
                            label={settings.defaultProviderId ? getModelDisplay(settings.defaultModelId, settings.defaultProviderId).provider : undefined}
                        />
                    </div>

                    <div
                        className="p-4 flex flex-col justify-between cursor-pointer hover:bg-zinc-50/50 transition-colors"
                        onClick={() => store.toggleSmartScenarioSwitch()}
                    >
                        <div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 font-medium text-zinc-900 text-sm">
                                    <Sparkles className={`w-4 h-4 ${settings.enableSmartScenarioSwitch ? 'text-purple-600' : 'text-zinc-400'}`} />
                                    智能场景推断
                                </div>
                                <div className={`w-8 h-5 rounded-full p-0.5 transition-colors ${settings.enableSmartScenarioSwitch ? 'bg-purple-600' : 'bg-zinc-200'}`}>
                                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${settings.enableSmartScenarioSwitch ? 'translate-x-3' : 'translate-x-0'}`} />
                                </div>
                            </div>
                            <p className="text-xs text-zinc-400 mt-1">
                                根据任务自动选择最佳模型
                            </p>
                        </div>
                        <span className={`text-[10px] font-medium px-2 py-1 rounded inline-block w-fit mt-3 ${settings.enableSmartScenarioSwitch ? 'bg-purple-50 text-purple-600' : 'bg-zinc-100 text-zinc-400'}`}>
                            {settings.enableSmartScenarioSwitch ? '已启用 · 动态优化' : '已禁用 · 手动控制'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Scenarios List Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h5 className="font-medium text-zinc-900 text-sm">已生效场景</h5>
                    <button
                        onClick={() => { setIsAddModalOpen(true); resetForm(); }}
                        className="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-all shadow-sm hover:shadow active:scale-95"
                    >
                        <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform" />
                        添加场景
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {settings.scenarioConfigs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 px-4 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/50">
                            <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mb-3 text-zinc-400">
                                <Box className="w-6 h-6" />
                            </div>
                            <h6 className="text-sm font-medium text-zinc-900">暂未配置场景</h6>
                            <p className="text-xs text-zinc-500 text-center max-w-[250px] mt-1">
                                添加场景映射后，特定任务将自动路由到专用模型，提升效率。
                            </p>
                        </div>
                    ) : (
                        settings.scenarioConfigs.map((config) => {
                            const Icon = SCENARIO_ICONS[config.scenario] || Box;

                            return (
                                <div
                                    key={config.scenario === 'custom' ? `custom-${config.customName}` : config.scenario}
                                    className={`group flex items-center justify-between p-4 bg-white rounded-xl border transition-all duration-200 ${config.enabled ? 'border-zinc-200/80 shadow-sm hover:border-indigo-300/50 hover:shadow-md' : 'border-zinc-100 bg-zinc-50/50 opacity-70'}`}
                                >
                                    <div className="flex items-center gap-4 flex-1 min-w-0 mr-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 ${config.enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-zinc-200 text-zinc-400'}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm text-zinc-900 truncate">
                                                    {config.scenario === 'custom' ? config.customName : SCENARIO_LABELS[config.scenario]}
                                                </span>
                                                {config.scenario === 'custom' && <Badge className="bg-zinc-100 text-zinc-500 border-zinc-200 text-[10px] shrink-0">自定义</Badge>}
                                            </div>
                                            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[90%]">
                                                {config.scenario === 'custom' ? '用户自定义场景规则' : SCENARIO_DESCRIPTIONS[config.scenario]}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        {/* Model Selector in List */}
                                        <div className="w-40 relative">
                                            <CustomSelect
                                                value={config.modelId}
                                                groups={modelGroups}
                                                onChange={(val) => handleScenarioModelChange(config, val)}
                                                placeholder="选择模型"
                                            />
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center border-l pl-3 ml-2 border-zinc-100 gap-1">
                                            <button
                                                onClick={() => handleToggle(config)}
                                                className={`p-2 rounded-lg transition-colors ${config.enabled ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-zinc-400 hover:bg-zinc-100'}`}
                                                title={config.enabled ? "禁用" : "启用"}
                                            >
                                                {config.enabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => handleRemove(config)}
                                                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                title="删除"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Add Modal */}
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="配置新场景"
            >
                <div className="space-y-6 pt-2">
                    {/* Tabs */}
                    <div className="flex p-1 bg-zinc-100/80 rounded-xl">
                        <button
                            onClick={() => setActiveTab('preset')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${activeTab === 'preset' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                        >
                            预设场景
                        </button>
                        <button
                            onClick={() => setActiveTab('custom')}
                            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${activeTab === 'custom' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                        >
                            自定义
                        </button>
                    </div>

                    <div className="space-y-4">
                        {/* Scenario Selection */}
                        <div className="relative z-20">
                            <label className="text-xs font-medium text-zinc-500 mb-1.5 block uppercase tracking-wider">场景类型</label>
                            {activeTab === 'preset' ? (
                                <CustomSelect
                                    value={selectedScenarioType}
                                    options={presetOptions}
                                    onChange={(val) => setSelectedScenarioType(val as AgentScenario)}
                                    placeholder="选择预设场景..."
                                />
                            ) : (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={customScenarioName}
                                        onChange={(e) => setCustomScenarioName(e.target.value)}
                                        placeholder="例如: 创意写作 creative_writing"
                                        className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
                                    />
                                    <p className="text-xs text-zinc-400 px-1">
                                        输入唯一的场景标识符（推荐英文），Agent 将尝试从您的指令中匹配。
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Model Selection */}
                        <div className="relative z-10">
                            <label className="text-xs font-medium text-zinc-500 mb-1.5 block uppercase tracking-wider">目标模型</label>
                            <CustomSelect
                                value={selectedModelId}
                                groups={modelGroups}
                                onChange={(val) => {
                                    const model = allModels.find(m => m.id === val);
                                    if (model) {
                                        setSelectedModelId(model.id);
                                        setSelectedProviderId(model.providerId);
                                    }
                                }}
                                placeholder="选择最适合的模型..."
                                label={selectedProviderId ? getModelDisplay(selectedModelId, selectedProviderId).provider : undefined}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-zinc-100">
                        <button
                            onClick={() => setIsAddModalOpen(false)}
                            className="px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 rounded-lg transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleAddScenario}
                            disabled={!selectedModelId || (activeTab === 'custom' && !customScenarioName)}
                            className="px-6 py-2 text-xs font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
                        >
                            确认添加
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
