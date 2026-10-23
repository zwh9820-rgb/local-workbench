/**
 * 示例数据：npm run db:seed
 * 用于首次启动时页面不至于空白，可随时删除 data/workbench.db 重来。
 */
import { db } from './index';
import {
  agentSession,
  agentToolLog,
  aiHot,
  clipboardSnapshots,
  dailyReview,
  events,
  inspiration,
  promptTemplates,
  todoItems,
} from './schema';
import { getWeekKey, todayKey, toDateKey } from '../lib/date';

const today = todayKey();
const weekKey = getWeekKey(new Date());
const now = new Date();

const at = (dayOffset: number, hour: number, minute = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const yesterday = (() => {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return toDateKey(d);
})();

async function main() {
  // 1. 日历
  await db
    .insert(events)
    .values([
      {
        title: 'ComfyUI 工作流出图验收',
        description: '检查 LoRA 权重与采样器参数组合，产出 3 组对比图',
        startAt: at(0, 10, 0),
        endAt: at(0, 11, 30),
        category: '创作',
        tags: ['comfyui', '出图'],
      },
      {
        title: '漫剧第 3 集脚本评审',
        startAt: at(0, 15, 0),
        endAt: at(0, 16, 0),
        category: '会议',
        tags: ['漫剧'],
      },
      {
        title: '皮卡短视频素材拍摄',
        startAt: at(1, 9, 30),
        endAt: at(1, 12, 0),
        category: '拍摄',
        tags: ['短视频'],
      },
    ])
    .onConflictDoNothing();

  // 2. 待办
  await db
    .insert(todoItems)
    .values([
      {
        title: '整理 DeepSeek 提示词模板（10 条）',
        note: '覆盖分镜、口播、标题三个方向',
        status: 'doing',
        priority: 'high',
        planDate: today,
        weekKey,
        tags: ['提示词'],
        sortOrder: 1,
      },
      {
        title: '把 ComfyUI 工作流 JSON 存入灵感库',
        status: 'pending',
        priority: 'medium',
        planDate: today,
        weekKey,
        tags: ['comfyui'],
        sortOrder: 2,
      },
      {
        title: '复盘本周选题数据',
        status: 'pending',
        priority: 'low',
        planDate: today,
        weekKey,
        sortOrder: 3,
      },
      {
        title: '完成第 3 集分镜初稿',
        status: 'pending',
        priority: 'high',
        planDate: today,
        weekKey,
        dueDate: today,
        sortOrder: 4,
      },
      {
        title: '搭建本地素材归档目录',
        status: 'done',
        priority: 'medium',
        planDate: today,
        weekKey,
        completedAt: at(0, 9, 20),
        sortOrder: 5,
      },
      {
        title: '调研短视频前 3 秒钩子写法',
        status: 'pending',
        priority: 'medium',
        planDate: toDateKey(at(2, 0, 0)),
        weekKey,
        sortOrder: 6,
      },
    ])
    .onConflictDoNothing();

  // 3. AI 热点
  await db
    .insert(aiHot)
    .values([
      {
        title: 'DeepSeek 发布新一代推理模型，函数调用能力增强',
        summary: '对本地 Agent 的工具调用稳定性有明显提升，值得跟进。',
        content:
          '## 要点\n\n- 工具调用更稳\n- 长上下文压缩更好\n\n> 可在 LM Studio 中直接加载量化版本测试。',
        source: '官方公告',
        category: '模型',
        tags: ['deepseek', 'agent'],
        heat: 92,
        publishedAt: at(-1, 20, 0),
      },
      {
        title: 'ComfyUI 新节点支持视频一致性约束',
        summary: '对漫剧连续镜头一致性有帮助。',
        source: '社区',
        category: '工具',
        tags: ['comfyui', '视频'],
        heat: 78,
        publishedAt: at(-2, 11, 0),
      },
      {
        title: '短视频平台调整推荐权重，完播率权重上升',
        summary: '前 3 秒钩子设计需要重做。',
        source: '行业观察',
        category: '平台',
        tags: ['短视频'],
        heat: 65,
        publishedAt: at(-3, 9, 0),
      },
    ])
    .onConflictDoNothing();

  // 4. 昨日复盘
  await db
    .insert(dailyReview)
    .values([
      {
        reviewDate: yesterday,
        summary: '把工作台的数据结构定下来了，节奏还行。',
        wellDone: '完成了灵感库表结构设计，跑通了本地 SQLite 读写。',
        problems: '提示词模板变量替换逻辑想复杂了，绕了一圈。',
        improvements: '先跑通最小闭环，再补细节。',
        tomorrowPlan: '完成 ComfyUI 工作流入库 + Agent 工具联调。',
        content:
          '## 今日复盘\n\n### 做得好\n- 数据结构一次成型\n\n### 待改进\n- 不要在没验证前过度设计\n',
        moodScore: 4,
        energyScore: 3,
        tags: ['开发'],
      },
    ])
    .onConflictDoNothing();

  // 5. 灵感素材库
  await db
    .insert(inspiration)
    .values([
      {
        title: '漫剧分镜提示词 · 赛博夜雨',
        summary: '统一风格前缀 + 镜头语言，用于第 3 集分镜批量出图。',
        type: 'prompt',
        status: 'ongoing',
        progress: 60,
        tags: ['提示词', '漫剧', '分镜'],
        isFavorite: true,
        content:
          '```text\n赛博朋克雨夜街道，霓虹反射在湿滑地面，电影感构图，35mm，\n主体：{{character}}，动作：{{action}}，镜头：{{shot}}\nnegative: low quality, extra fingers, watermark\n```\n\n### 变量说明\n- `character` 角色描述\n- `action` 动作\n- `shot` 景别（wide / medium / close）',
      },
      {
        title: 'ComfyUI · 图生视频一致性工作流',
        summary: 'ControlNet + IPAdapter 组合，保持角色跨镜头一致。',
        type: 'comfyui',
        status: 'ongoing',
        progress: 35,
        tags: ['comfyui', '工作流', '视频'],
        localPath: 'D:/assets/comfy/workflows/i2v_consistency.json',
        content:
          '```json\n{\n  "3": { "class_type": "KSampler", "inputs": { "steps": 28, "cfg": 6.5, "sampler_name": "dpmpp_2m" } },\n  "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "sdxl_base.safetensors" } }\n}\n```\n\n### 调试记录\n- steps 28 / cfg 6.5 时角色漂移最小\n- IPAdapter weight 0.7 以上会糊',
      },
      {
        title: '漫剧第 3 集脚本 · 雨夜重逢',
        summary: '三幕结构，结尾留钩子。',
        type: 'script',
        status: 'paused',
        progress: 45,
        tags: ['漫剧', '脚本'],
        content:
          '## 第 3 集 · 雨夜重逢\n\n**场景 1｜外景 · 街道 · 夜**\n\n> 雨声。霓虹灯在积水中碎裂。\n\n**林**：（低声）你还是来了。\n\n---\n\n### 待补\n- [ ] 第二幕冲突点\n- [ ] 结尾钩子台词',
      },
      {
        title: '皮卡短视频 · 前 3 秒钩子合集',
        summary: '收集了 12 种开场句式，直接套用。',
        type: 'video',
        status: 'finished',
        progress: 100,
        tags: ['短视频', '文案'],
        content:
          '1. 「我用 3 天做了别人 3 个月的事」\n2. 「别急着划走，这个错误你正在犯」\n3. 「成本 0 元，效果像外包」\n\n> 结构：钩子 → 反常识 → 证据 → 行动指令',
      },
      {
        title: '本地 Agent 工具设计笔记',
        summary: '白名单文件读取的路径校验思路。',
        type: 'note',
        status: 'ongoing',
        progress: 20,
        tags: ['agent', '安全'],
        content:
          '路径校验三步：\n\n1. `resolve` 成绝对路径\n2. 必须 `startsWith` 白名单根目录\n3. 扩展名白名单 `.md/.json/.txt`\n\n```bash\n# 反例，绝对禁止\ncat /etc/passwd\n```',
      },
    ])
    .onConflictDoNothing();

  // 6. 提示词模板
  await db
    .insert(promptTemplates)
    .values([
      {
        name: '分镜图生成 · 通用',
        description: '给定角色、动作、景别，输出一条可用于 SDXL 的提示词',
        category: '出图',
        model: 'flux',
        tags: ['分镜', '出图'],
        variables: ['style', 'character', 'action', 'shot', 'light'],
        content:
          '{{style}}，{{character}}，{{action}}，{{shot}}，{{light}}，电影感，高细节，8k\nnegative: low quality, blurry, extra fingers, watermark',
      },
      {
        name: '漫剧台词润色',
        description: '把大白话台词改成有画面感的短句',
        category: '写作',
        model: 'deepseek',
        tags: ['漫剧', '台词'],
        variables: ['role', 'scene', 'raw_line'],
        content:
          '你是资深漫剧编剧。角色：{{role}}；场景：{{scene}}。\n把下面这句台词改成 2 句以内、有画面感的短句，保留原意，不要解释：\n\n{{raw_line}}',
      },
      {
        name: '短视频选题拆解',
        description: '输入一个选题，输出钩子 + 结构 + 风险点',
        category: '运营',
        model: 'deepseek',
        tags: ['短视频'],
        variables: ['topic', 'audience'],
        content:
          '选题：{{topic}}\n目标人群：{{audience}}\n\n请输出：\n1. 3 条前 3 秒钩子\n2. 45 秒脚本结构（分段时间）\n3. 可能的违规/限流风险点',
      },
    ])
    .onConflictDoNothing();

  // 7. 剪贴板快照
  await db
    .insert(clipboardSnapshots)
    .values([
      {
        content: 'dpmpp_2m_sde_gpu + karras，steps 30，cfg 5.5 出图更干净',
        contentType: 'text',
        sourceApp: '灵感记录',
        charCount: 42,
      },
      {
        content: 'https://github.com/comfyanonymous/ComfyUI',
        contentType: 'url',
        sourceApp: '浏览器',
        charCount: 43,
      },
    ])
    .onConflictDoNothing();

  // 8. Agent 会话（含工具日志）
  const sessionId = crypto.randomUUID();
  await db
    .insert(agentSession)
    .values({
      id: sessionId,
      title: '查一下进行中的灵感',
      mode: 'workbench',
      model: process.env.LM_STUDIO_MODEL ?? 'deepseek-r1-distill-qwen-7b',
      messageCount: 2,
      lastMessageAt: new Date(),
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: '帮我看下现在进行中的灵感有哪些',
          createdAt: Date.now() - 60000,
        },
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            '当前进行中的灵感有 3 条：\n\n1. **漫剧分镜提示词 · 赛博夜雨**（进度 60%）\n2. **ComfyUI · 图生视频一致性工作流**（进度 35%）\n3. **本地 Agent 工具设计笔记**（进度 20%）\n\n需要我帮你把第 2 条的进度更新一下吗？',
          createdAt: Date.now() - 50000,
        },
      ],
    })
    .onConflictDoNothing();

  await db
    .insert(agentToolLog)
    .values({
      sessionId,
      toolName: 'listInspiration',
      args: JSON.stringify({ status: 'ongoing', limit: 10 }),
      result: JSON.stringify({ count: 3, items: ['漫剧分镜提示词', 'ComfyUI 工作流', 'Agent 工具设计笔记'] }),
      status: 'ok',
      durationMs: 12,
    })
    .onConflictDoNothing();

  console.log('[seed] 完成：events/todo/ai_hot/review/inspiration/template/clipboard/agent_session 均已写入');
}

main().catch((err) => {
  console.error('[seed] 失败', err);
  process.exit(1);
});
