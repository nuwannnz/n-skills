// Git and GitHub for one project folder, through the user's own `git` and `gh`
// (so their credentials, SSH keys and keychain just work). Nothing here ever
// rewrites history or discards work: sync only fast-forwards, and saving only
// adds a branch, a commit and a pull request.
import { execFile } from 'node:child_process';

let PATH = process.env.PATH ?? '';
export const setPath = p => { PATH = p; };

function run(cmd, args, cwd, { timeout = 60000 } = {}) {
  return new Promise(res => execFile(cmd, args, {
    cwd, timeout, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PATH, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', GIT_EDITOR: 'true' },
  }, (err, stdout, stderr) => res({
    ok: !err,
    out: String(stdout ?? '').trim(),
    err: String(stderr || err?.message || '').trim(),
  })));
}
const git = (cwd, args, opt) => run('git', args, cwd, opt);
const gh = (cwd, args, opt) => run('gh', args, cwd, opt);
const last = s => s.split('\n').filter(Boolean).pop() ?? '';

export async function hasGh() { return (await run('gh', ['--version'], undefined)).ok; }

export async function isRepo(root) { return (await git(root, ['rev-parse', '--is-inside-work-tree'])).out === 'true'; }

/** Name and email git will commit as, where each comes from, and who `gh` is signed in as. */
export async function identity(root) {
  const read = async (scope, key) => (await git(root, ['config', scope, '--get', key])).out;
  const [localName, localEmail, name, email] = await Promise.all([
    read('--local', 'user.name'), read('--local', 'user.email'), read('--includes', 'user.name'), read('--includes', 'user.email'),
  ]);
  const ghUser = await ghAccount(root);
  return {
    name, email,
    local: { name: localName, email: localEmail },
    source: localName || localEmail ? 'this project' : (name || email ? 'global git config' : 'not set'),
    gh: ghUser,
  };
}

async function ghAccount(root) {
  const r = await gh(root, ['api', 'user', '--jq', '[.login,.id,.name]|@tsv'], { timeout: 15000 });
  if (!r.ok) return null;
  const [login, id, name] = r.out.split('\t');
  return { login, id, name: name || login, email: `${id}+${login}@users.noreply.github.com` };
}

/** `git config --local`, so the choice belongs to this project only. */
export async function setIdentity(root, { name, email }) {
  name = String(name ?? '').trim();
  email = String(email ?? '').trim();
  if (!name || !/^[^\s@]+@[^\s@]+$/.test(email)) return { error: 'Enter a name and a valid email address.' };
  for (const [k, v] of [['user.name', name], ['user.email', email]]) {
    const r = await git(root, ['config', '--local', k, v]);
    if (!r.ok) return { error: r.err };
  }
  return { ok: true };
}

async function defaultBranch(root) {
  const head = await git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head.ok && head.out.startsWith('origin/')) return head.out.slice(7);
  for (const b of ['main', 'master']) {
    if ((await git(root, ['rev-parse', '--verify', '-q', `refs/remotes/origin/${b}`])).ok) return b;
  }
  return (await git(root, ['config', '--get', 'init.defaultBranch'])).out || 'main';
}

/** The last commit that touched a file: who, when, and what they said. */
export async function fileLog(root, file) {
  const r = await git(root, ['log', '-1', '--format=%an%x09%ae%x09%at%x09%h%x09%s', '--', file]);
  if (!r.ok || !r.out) return null;
  const [name, email, at, hash, subject] = r.out.split('\t');
  return { name, email, at: +at * 1000, hash, subject };
}

const STATUS_WORDS = { M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'copied', '?': 'new', U: 'conflict' };

/** Branch, tracking, and the working-tree changes. Cheap and offline. */
export async function status(root) {
  const [st, remote] = await Promise.all([git(root, ['status', '--porcelain=v1', '-b', '--untracked-files=all']), git(root, ['remote', 'get-url', 'origin'])]);
  if (!st.ok) return { repo: false, error: st.err };
  const lines = st.out.split('\n').filter(Boolean);
  const head = lines.shift() ?? '';
  const branch = head.replace(/^## (No commits yet on )?/, '').split(/\.\.\.| \[/)[0].trim();
  const upstream = head.match(/\.\.\.(\S+)/)?.[1] ?? null;
  const ahead = +(head.match(/ahead (\d+)/)?.[1] ?? 0);
  const behind = +(head.match(/behind (\d+)/)?.[1] ?? 0);
  const def = await defaultBranch(root);
  const files = lines.map(l => {
    const x = l[0], y = l[1];
    const code = x === '?' ? '?' : (y !== ' ' ? y : x);
    return { path: l.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''), code, kind: STATUS_WORDS[code] ?? 'modified' };
  });
  let behindBase = 0;
  if (branch && branch !== def) behindBase = +((await git(root, ['rev-list', '--count', `HEAD..origin/${def}`])).out || 0);
  return {
    repo: true, branch, upstream, ahead, behind, behindBase, defaultBranch: def, onDefault: branch === def,
    remote: remote.ok ? remote.out : null, files,
  };
}

/** Unified diff of one changed file against HEAD (new files show whole). */
export async function diff(root, file) {
  const tracked = (await git(root, ['ls-files', '--error-unmatch', '--', file])).ok;
  const r = tracked
    ? await git(root, ['diff', 'HEAD', '--no-color', '--', file])
    : await git(root, ['diff', '--no-index', '--no-color', '--', '/dev/null', file]);
  // --no-index exits 1 when the files differ, so read the output either way.
  return { text: r.out || r.err };
}

/**
 * Keeps the checkout current: fetches, then fast-forwards the current branch
 * when that is safe. After a pull request is merged, moves a clean checkout
 * back to the default branch.
 */
export async function sync(root, { mergedBranch } = {}) {
  const s0 = await status(root);
  if (!s0.repo) return { error: s0.error };
  if (!s0.remote) return { skipped: 'no remote' };
  const f = await git(root, ['fetch', '--prune', '--quiet'], { timeout: 90000 });
  if (!f.ok) return { error: `Couldn't reach the remote: ${f.err.split('\n')[0]}` };
  const notes = [];
  let s = await status(root);
  const dirty = s.files.length > 0;
  if (mergedBranch && s.branch === mergedBranch && !dirty && s.branch !== s.defaultBranch) {
    const sw = await git(root, ['switch', s.defaultBranch]);
    if (sw.ok) notes.push(`Your pull request was merged, so you're back on ${s.defaultBranch}.`);
    s = await status(root);
  }
  if (s.upstream && s.behind > 0 && s.ahead === 0) {
    const p = await git(root, ['merge', '--ff-only', '--quiet', s.upstream]);
    if (p.ok) notes.push(`Updated ${s.branch}: pulled ${s.behind} new change${s.behind === 1 ? '' : 's'}.`);
    else return { error: `Couldn't update ${s.branch}${dirty ? ' (your unsaved changes overlap with new ones; save them first)' : ''}.`, notes };
  } else if (s.behind > 0 && s.ahead > 0) {
    notes.push(`${s.branch} has diverged from the remote. Nothing was changed.`);
  }
  return { ok: true, notes };
}

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'update';

export async function listPrs(root) {
  const r = await gh(root, ['pr', 'list', '--author', '@me', '--state', 'all', '--limit', '12',
    '--json', 'number,title,url,state,isDraft,reviewDecision,mergeable,headRefName,baseRefName,mergedAt,updatedAt,statusCheckRollup'], { timeout: 30000 });
  if (!r.ok) return { error: /known GitHub host|not a git repository/i.test(r.err) ? 'Pull requests are followed for GitHub repositories only.' : (r.err.split('\n')[0] || 'gh failed') };
  try {
    return {
      prs: JSON.parse(r.out).map(p => ({
        number: p.number, title: p.title, url: p.url, branch: p.headRefName, base: p.baseRefName, updatedAt: p.updatedAt, mergedAt: p.mergedAt,
        status: p.state === 'MERGED' ? 'merged' : p.state === 'CLOSED' ? 'closed' : p.isDraft ? 'draft'
          : p.reviewDecision === 'APPROVED' ? 'approved' : p.reviewDecision === 'CHANGES_REQUESTED' ? 'changes' : 'review',
        conflicts: p.mergeable === 'CONFLICTING',
        checks: checkSummary(p.statusCheckRollup),
      })),
    };
  } catch { return { error: 'Unexpected reply from gh.' }; }
}

function checkSummary(rollup) {
  if (!rollup?.length) return null;
  const states = rollup.map(c => c.conclusion || c.state || c.status);
  if (states.some(s => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE'].includes(s))) return 'failing';
  if (states.some(s => ['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED', 'WAITING', null, undefined, ''].includes(s))) return 'pending';
  return 'passing';
}

/**
 * Saves the changes: a branch (unless already on one with work in progress), a
 * commit, a push, and a pull request (or an update to the open one).
 */
export async function save(root, { title, body, openPrBranches = [], mergedBranches = [] }) {
  const s = await status(root);
  if (!s.repo) return { error: 'This folder is not a git repository.' };
  if (!s.files.length) return { error: 'There is nothing to save.' };
  const id = await identity(root);
  if (!id.name || !id.email) return { error: 'Set your git name and email first (the person icon in the header).', needsIdentity: true };

  const names = s.files.map(f => f.path.replace(/^docs\//, ''));
  title = String(title ?? '').trim() || `Update ${names.length === 1 ? names[0] : `${names.length} documents`}`;
  const fresh = s.onDefault || (mergedBranches.includes(s.branch) && !openPrBranches.includes(s.branch));
  let branch = s.branch;
  if (s.remote && fresh) {
    branch = `scrumo/${slug(title)}-${Date.now().toString(36)}`;
    const base = s.onDefault ? [] : [`origin/${s.defaultBranch}`];
    const sw = await git(root, ['switch', '-c', branch, ...base]);
    if (!sw.ok) return { error: `Couldn't start a branch: ${sw.err}` };
  }
  const add = await git(root, ['add', '-A']);
  if (!add.ok) return { error: add.err };
  const commit = await git(root, ['commit', '-m', title, '-m', String(body ?? '').trim() || names.map(n => `- ${n}`).join('\n')]);
  if (!commit.ok) return { error: commit.err || commit.out };
  if (!s.remote) return { ok: true, branch, committed: true, note: 'Saved as a commit on this computer. This project has no remote to push to.' };

  const push = await git(root, ['push', '--set-upstream', 'origin', branch], { timeout: 120000 });
  if (!push.ok) return { error: `Saved the commit, but pushing failed: ${last(push.err)}`, committed: true, branch };
  if (openPrBranches.includes(branch)) return { ok: true, branch, updated: true, note: 'Added to your open pull request.' };

  const pr = await gh(root, ['pr', 'create', '--base', s.defaultBranch, '--head', branch, '--title', title,
    '--body', `${String(body ?? '').trim() || 'Document changes:\n' + names.map(n => `- ${n}`).join('\n')}\n\n_Created from scrumo desktop._`], { timeout: 60000 });
  if (pr.ok) return { ok: true, branch, prUrl: last(pr.out) };
  const m = s.remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return {
    ok: true, branch, pushed: true,
    compareUrl: m ? `https://github.com/${m[1]}/compare/${s.defaultBranch}...${branch}?expand=1` : null,
    note: `Pushed, but the pull request wasn't created (${last(pr.err) || 'gh unavailable'}).`,
  };
}
