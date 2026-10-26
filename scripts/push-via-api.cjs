/**
 * 通过 GitHub Git Data API 推送（绕过 git 的 HTTPS 隧道）
 * 用法：GH_TOKEN=xxx node scripts/push-via-api.cjs [branch] [tag]
 *
 * 为什么需要这个：
 *   当前环境的代理只放行 api.github.com，github.com:443 的 CONNECT 被阻断，
 *   导致 git push 必然失败。Git Data API 走 api.github.com，可以正常提交。
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const token = process.env.GH_TOKEN;
const owner = 'zwh9820-rgb';
const repo = 'local-workbench';
const branch = process.argv[2] || 'main-v2';
const tagName = process.argv[3] || '';
const tagMessage = process.argv[4] || '';

if (!token) {
  console.error('缺少 GH_TOKEN');
  process.exit(1);
}

const git = (cmd, opts = {}) => execSync(cmd, { maxBuffer: 100 * 1024 * 1024, ...opts });

/** 记录「上次通过 API 推上去的本地 HEAD」，下次用它作为 diff 基准 */
const STATE_FILE = path.join('.git', 'workbench-api-push');

function objectExists(sha) {
  try {
    // 必须加引号，否则 shell 会把 ^{commit} 的花括号吃掉
    git(`git cat-file -e "${sha}^{commit}"`);
    return true;
  } catch {
    return false;
  }
}

function resolveBase() {
  if (fs.existsSync(STATE_FILE)) {
    const saved = fs.readFileSync(STATE_FILE, 'utf8').trim();
    if (saved && objectExists(saved)) return saved;
  }
  // 退路：origin/main-v2（若本地有 remote-tracking）
  try {
    const sha = git('git rev-parse origin/main-v2').toString().trim();
    if (sha && objectExists(sha)) return sha;
  } catch {
    /* ignore */
  }
  return '';
}

async function api(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'workbench-push',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  }
  return json;
}

(async () => {
  const head = git('git rev-parse HEAD').toString().trim();
  console.log('[1/6] 本地 HEAD:', head.slice(0, 7));

  // 远程当前 head
  const ref = await api(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  const parentSha = ref.object.sha;
  console.log('[2/6] 远程', branch, '→', parentSha.slice(0, 7));

  if (parentSha === head) {
    console.log('已经同步，无需推送');
    return;
  }

  const parent = await api(`/repos/${owner}/${repo}/git/commits/${parentSha}`);
  const baseTree = parent.tree.sha;

  // diff 基准：上次推上去的本地提交（远程 SHA 本地可能没有）
  const base = resolveBase();
  if (!base) {
    console.error('找不到 diff 基准。请先用 git 推送一次，或手动写入 .git/workbench-api-push');
    process.exit(1);
  }
  console.log('      diff 基准:', base.slice(0, 7));

  // 差异文件
  const changed = git(`git diff --name-status ${base} ${head}`)
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);

  console.log('[3/6] 变更文件:', changed.length, '个');

  const treeEntries = [];
  for (const line of changed) {
    const parts = line.split('\t');
    const status = parts[0];
    const path = parts.slice(1).join('\t');

    if (status === 'D') {
      treeEntries.push({ path, mode: '100644', type: 'blob', sha: null });
      console.log('     删除', path);
      continue;
    }

    const buf = git(`git show ${head}:"${path}"`);
    const blob = await api(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }),
    });
    treeEntries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    console.log('     写入', path, '→', blob.sha.slice(0, 7));
  }

  // 新 tree
  const tree = await api(`/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTree, tree: treeEntries }),
  });
  console.log('[4/6] tree:', tree.sha.slice(0, 7));

  // 新 commit（沿用本地提交信息）
  const message = git(`git log -1 --format=%B ${head}`).toString().trim();
  const commit = await api(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
  });
  console.log('[5/6] commit:', commit.sha.slice(0, 7));

  // 更新分支（fast-forward）
  await api(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  console.log('      分支已更新');

  // 打 tag
  if (tagName) {
    const tagObj = await api(`/repos/${owner}/${repo}/git/tags`, {
      method: 'POST',
      body: JSON.stringify({
        tag: tagName,
        message: tagMessage || tagName,
        object: commit.sha,
        type: 'commit',
      }),
    });
    await api(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/tags/${tagName}`, sha: tagObj.sha }),
    });
    console.log('[6/6] tag', tagName, '已创建');
  } else {
    console.log('[6/6] 跳过 tag');
  }

  // 记录本次推送点，下次作为 diff 基准
  fs.writeFileSync(STATE_FILE, head, 'utf8');

  console.log('\n✅ 推送完成');
})().catch((e) => {
  console.error('\n❌ 失败：', e.message);
  process.exit(1);
});
