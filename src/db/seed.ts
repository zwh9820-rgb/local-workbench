/**
 * 演示数据种子（可选）
 * 运行：npm run db:seed
 * ----------------------------------------------------------------------------
 * 只在数据库为空时插入，避免重复污染。用来快速验证画布编辑器、总览卡片。
 */
import { db, sqlite } from './index';
import { canvas, canvasNode, inspiration, todoItems } from './schema';

const uuid = () => crypto.randomUUID();

function seed() {
  const existing = db.select({ id: canvas.id }).from(canvas).all();
  if (existing.length > 0) {
    console.log('[seed] 已有画布数据，跳过');
    return;
  }

  const canvasId = uuid();

  db.insert(canvas)
    .values({
      id: canvasId,
      name: '示例项目 · 赛博城市短片',
      description: '演示用画布：提示词 → ComfyUI 工作流 → 出图',
      viewState: { x: 80, y: 60, zoom: 0.85 },
      edges: [
        { id: uuid(), source: 'seed-prompt', target: 'seed-comfy', type: 'default' },
      ],
    })
    .run();

  db.insert(canvasNode)
    .values([
      {
        id: 'seed-group',
        canvasId,
        nodeType: 'group',
        title: '第一镜 · 建立镜头',
        content: '',
        positionX: 40,
        positionY: 40,
        width: 760,
        height: 420,
        zIndex: -1,
        meta: { tone: 0 },
      },
      {
        id: 'seed-prompt',
        canvasId,
        nodeType: 'prompt',
        title: '正向提示词',
        content:
          'a lone figure walking through neon-lit cyberpunk alley, rain, volumetric light, cinematic, 35mm',
        positionX: 80,
        positionY: 100,
        width: 320,
        height: 200,
        zIndex: 0,
        meta: {},
      },
      {
        id: 'seed-note',
        canvasId,
        nodeType: 'note',
        title: '拍摄备注',
        content: '整体偏冷调，高光只留在霓虹招牌上。',
        positionX: 80,
        positionY: 330,
        width: 320,
        height: 110,
        zIndex: 0,
        meta: {},
      },
      {
        id: 'seed-comfy',
        canvasId,
        nodeType: 'comfy_run',
        title: 'ComfyUI 出图',
        content: '',
        positionX: 440,
        positionY: 100,
        width: 340,
        height: 240,
        zIndex: 0,
        meta: { status: 'idle', progress: 0, workflowJson: null },
      },
    ])
    .run();

  db.insert(inspiration)
    .values([
      {
        title: '雨夜霓虹的调色参考',
        content:
          '## 要点\n- 高光收窄，只在招牌边缘\n- 阴影偏青\n\n```bash\n# 参考命令\nffmpeg -i in.mp4 -vf "curves=preset=darker"\n```',
        type: 'fragment',
        status: 'ongoing',
        progress: 40,
        tags: ['调色', '参考'],
      },
      {
        title: '短片分镜脚本 v0.1',
        content: '1. 空镜：雨落霓虹\n2. 中景：人物入场\n3. 特写：眼神',
        type: 'script',
        status: 'paused',
        progress: 20,
        tags: ['分镜'],
      },
    ])
    .run();

  db.insert(todoItems)
    .values([
      { title: '整理第一镜的分镜图', priority: 'high', dueDate: new Date() },
      { title: '给 ComfyUI 工作流加 ControlNet', priority: 'medium', dueDate: new Date() },
      { title: '导出 10 秒预览片段', priority: 'low', status: 'done', completedAt: new Date() },
    ])
    .run();

  console.log(`[seed] 完成，画布 id = ${canvasId}`);
}

seed();
sqlite.close();
