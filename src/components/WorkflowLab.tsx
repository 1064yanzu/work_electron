import {
	ArrowRight,
	CheckCircle,
	Clock,
	Play,
	Plus,
	Workflow,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	appendWorkflowLog,
	createWorkflowNode,
	listWorkflowNodes,
} from "../lib/api";
import { NodeStatus, type WorkflowNode, WorkflowNodeType } from "../types";

export function WorkflowLab() {
	const [nodes, setNodes] = useState<WorkflowNode[]>([]);
	const [loading, setLoading] = useState(false);

	const fetchNodes = async () => {
		setLoading(true);
		try {
			const data = await listWorkflowNodes();
			setNodes(data);
		} catch (error) {
			console.error(error);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchNodes();
	}, []);

	const handleCreateNode = async () => {
		try {
			await createWorkflowNode({
				name: "New Analysis Step",
				node_type: WorkflowNodeType.Llm,
				status: NodeStatus.Pending,
				input_sources: [],
				output_notes: [],
			});
			fetchNodes();
		} catch (error) {
			console.error(error);
		}
	};

	const handleRunNode = async (id: string) => {
		try {
			// Optimistic update
			setNodes((prev) =>
				prev.map((n) =>
					n.id === id ? { ...n, status: NodeStatus.Running } : n,
				),
			);

			await appendWorkflowLog({
				node_id: id,
				status: NodeStatus.Running,
				summary: "Started processing...",
			});

			// Simulate process
			setTimeout(async () => {
				await appendWorkflowLog({
					node_id: id,
					status: NodeStatus.Completed,
					summary: "Analysis completed successfully.",
				});
				fetchNodes();
			}, 2000);
		} catch (error) {
			console.error(error);
		}
	};

	const getStatusIcon = (status: NodeStatus) => {
		switch (status) {
			case NodeStatus.Completed:
				return <CheckCircle className="w-4 h-4 text-green-500" />;
			case NodeStatus.Failed:
				return <XCircle className="w-4 h-4 text-red-500" />;
			case NodeStatus.Running:
				return <Clock className="w-4 h-4 text-blue-500 animate-pulse" />;
			default:
				return (
					<div className="w-4 h-4 rounded-full border-2 border-gray-300" />
				);
		}
	};

	return (
		<main className="flex-1 flex flex-col bg-panel-process border-r border-border relative h-full overflow-hidden">
			<div className="p-4 border-b border-border flex items-center justify-between bg-white/50 backdrop-blur-sm z-10">
				<div className="flex items-center gap-2 text-text-secondary">
					<Workflow className="w-5 h-5 text-primary" />
					<h2 className="font-serif font-medium tracking-wide text-sm">
						Process Lab
					</h2>
				</div>
				<button
					onClick={handleCreateNode}
					className="p-1.5 bg-white border border-border rounded-md hover:border-primary/50 transition-colors text-text-secondary"
				>
					<Plus className="w-4 h-4" />
				</button>
			</div>

			<div className="flex-1 p-6 overflow-y-auto space-y-6">
				{nodes.length === 0 && !loading && (
					<div className="flex flex-col items-center justify-center h-full text-text-muted gap-4">
						<Workflow className="w-12 h-12 opacity-20" />
						<p>No workflow nodes active. Start a new process.</p>
					</div>
				)}

				<div className="max-w-3xl mx-auto space-y-4">
					{nodes.map((node) => (
						<div
							key={node.id}
							className="bg-white rounded-xl border border-border shadow-sm p-5 transition-all hover:shadow-md"
						>
							<div className="flex items-center justify-between mb-4">
								<div className="flex items-center gap-3">
									<div
										className={`w-10 h-10 rounded-full flex items-center justify-center ${
											node.node_type === WorkflowNodeType.Llm
												? "bg-orange-100 text-orange-600"
												: "bg-gray-100 text-gray-600"
										}`}
									>
										<Workflow className="w-5 h-5" />
									</div>
									<div>
										<div className="font-medium text-text-primary">
											{node.name}
										</div>
										<div className="text-xs text-text-muted flex items-center gap-2">
											<span className="capitalize">{node.node_type} Node</span>
											<span>•</span>
											<span className="font-mono text-[10px]">
												{node.id.slice(0, 8)}
											</span>
										</div>
									</div>
								</div>
								<div className="flex items-center gap-3">
									{getStatusIcon(node.status)}
									{node.status !== NodeStatus.Running && (
										<button
											onClick={() => handleRunNode(node.id)}
											className="p-2 hover:bg-surface rounded-full transition-colors text-text-secondary"
										>
											<Play className="w-4 h-4" />
										</button>
									)}
								</div>
							</div>

							{/* Mock connections visualization */}
							{(node.input_sources.length > 0 ||
								node.output_notes.length > 0) && (
								<div className="flex items-center gap-4 text-xs text-text-muted bg-surface/50 p-2 rounded border border-border/50">
									<div className="flex items-center gap-1">
										<span>{node.input_sources.length} Inputs</span>
									</div>
									<ArrowRight className="w-3 h-3 text-text-muted/50" />
									<div className="flex items-center gap-1">
										<span>{node.output_notes.length} Outputs</span>
									</div>
								</div>
							)}
						</div>
					))}
				</div>
			</div>

			{/* Chat Input Area */}
			<div className="p-4 border-t border-border bg-white/80 backdrop-blur-md sticky bottom-0">
				<div className="max-w-3xl mx-auto relative">
					<input
						type="text"
						placeholder="Describe a task to generate workflow..."
						className="w-full pl-4 pr-12 py-3.5 rounded-xl border border-border bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/50 transition-all placeholder:text-text-muted/50"
					/>
					<div className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-surface rounded-md border border-border text-xs text-text-muted font-medium">
						⏎
					</div>
				</div>
			</div>
		</main>
	);
}
