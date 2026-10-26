import { Sparkles } from 'lucide-react';
import { PageScroll } from '@/components/layout/page-container';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';

export const metadata = { title: 'AI 助手' };

/**
 * Agent 面板（占位）
 * 下一阶段接入：OpenAI SDK → LM Studio function calling + 工具执行 + 会话回放
 */
export default function AgentPage() {
  return (
    <PageScroll maxWidth="max-w-[860px]">
      <PageHeader
        title="AI 助手"
        description="内嵌式 Agent，运行在本地服务端，只读写本机数据库"
      />

      <Card className="mt-4">
        <EmptyState
          icon={<Sparkles />}
          title="Agent 正在接入"
          description="下一步会接通 LM Studio 的 function calling：查询灵感、建待办、写复盘、读画布、在画布建节点。Agent 不会自动提交 ComfyUI 生成任务，出图始终需要你手动点击运行。"
        />
      </Card>
    </PageScroll>
  );
}
