// Changes: what is unsaved, how to save it as a pull request, and where your pull requests stand.
import { ago, esc, icon } from './ui.js';

const PR_LABEL = { review: 'Waiting for review', approved: 'Approved · ready to merge', changes: 'Changes requested', merged: 'Merged', closed: 'Closed', draft: 'Draft' };
const STEPS = [['saved', 'Saved'], ['review', 'In review'], ['changes', 'Changes requested'], ['approved', 'Approved'], ['merged', 'Merged']];

export const openPrFor = p => p.git?.prs?.find(x => x.branch === p.git.branch && !['merged', 'closed'].includes(x.status)) ?? null;

function diffLines(text) {
  return `<div class="diff">${String(text).split('\n').filter(l => !/^(diff --git|index |new file|deleted file|--- |\+\+\+ )/.test(l))
    .map(l => `<div class="${l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@@') ? 'hunk' : ''}">${esc(l.replace(/^[+-]/, '')) || ' '}</div>`).join('')}</div>`;
}

/** The journey of one pull request, as a row of steps. */
function journey(pr) {
  const at = { review: 1, changes: 2, approved: 3, merged: 4, closed: 1, draft: 0 }[pr.status] ?? 1;
  return `<div class="journey">${STEPS.filter(([k]) => k !== 'changes' || pr.status === 'changes').map(([k, label]) => {
    const i = STEPS.findIndex(s => s[0] === k);
    const state = k === 'changes' ? 'bad' : i < at || (pr.status === 'merged') ? 'done' : i === at ? 'now' : '';
    return `<div class="step ${state}"><i>${state === 'done' ? icon('check', 11) : state === 'bad' ? '!' : ''}</i>${label}</div>`;
  }).join('')}</div>`;
}

function prCard(pr) {
  const checks = pr.checks ? `<span class="pill" data-s="${pr.checks === 'passing' ? 'done' : pr.checks === 'failing' ? 'blocked' : 'in-progress'}">checks ${pr.checks}</span>` : '';
  const conflict = pr.conflicts ? '<span class="pill" data-s="blocked">merge conflicts</span>' : '';
  return `<button class="pr" data-url="${esc(pr.url)}">
    <span class="pr-dot" data-pr="${pr.status}"></span>
    <span class="pr-main"><span class="pr-title">${esc(pr.title)}</span><span class="muted small">#${pr.number} · ${esc(pr.branch)} · updated ${ago(Date.parse(pr.updatedAt))}</span></span>
    <span class="pr-meta"><span class="pill" data-pr="${pr.status}">${PR_LABEL[pr.status]}</span>${pr.status === 'merged' || pr.status === 'closed' ? '' : checks + conflict}</span></button>`;
}

export function changesView(p, ctx) {
  const g = p.git;
  if (!g) return { html: '<div class="page"><div class="empty">Reading the repository…</div></div>' };
  if (!g.repo) return { html: '<div class="page"><div class="empty"><b>Not a git repository</b>Run git init in this folder to track changes.</div></div>' };
  const inPr = openPrFor(p);
  const prs = g.prs ?? [];
  const files = g.files.map(f => `<div class="file-row" data-file="${esc(f.path)}">
      <button class="file-head"><span class="kind" data-k="${esc(f.kind)}">${esc(f.kind)}</span><span class="mono">${esc(f.path)}</span><span class="chev">›</span></button>
      <div class="file-diff" hidden></div></div>`).join('');
  const warn = !g.remote ? '<div class="note warn">This project has no remote on GitHub. Changes are saved as commits on this computer only.</div>'
    : g.prError?.startsWith('Install the GitHub CLI') ? `<div class="note warn">${esc(g.prError)}</div>` : '';
  const target = g.onDefault || !inPr ? 'a new pull request' : `pull request #${inPr.number}`;
  const html = `<div class="page changes wide">
    <div class="two even-wide ${g.remote || inPr ? '' : 'single'}">
      <div class="col">
        <div class="lab">Unsaved changes <span class="muted">on ${esc(g.branch)}</span></div>
        ${warn}
        ${g.files.length ? `<div class="files">${files}</div>
          <div class="save-box">
            <div class="save-title">Save to ${esc(target)}</div>
            <input id="prTitle" placeholder="Summarise what changed (optional)" maxlength="120" value="${esc(p.saveTitle ?? '')}">
            <textarea id="prBody" rows="3" placeholder="Anything the reviewer should know (optional)"></textarea>
            <div class="row"><span class="muted small">Commits as ${esc(p.identity?.name || 'you')}${p.identity?.email ? ` &lt;${esc(p.identity.email)}&gt;` : ''} · ${g.remote ? `adds to ${esc(target)}` : 'kept on this computer'}</span><span class="grow"></span>
            <button class="btn primary" id="doSave">${g.remote ? (inPr && !g.onDefault ? 'Save and update pull request' : 'Save and open pull request') : 'Save changes'}</button></div>
          </div>` : '<div class="note ok">Everything is saved. Changes you or the agent make will show up here.</div>'}
      </div>
      <div class="col">
        ${inPr ? `<div class="lab">Review journey · #${inPr.number}</div><div class="card pad"><b>${esc(inPr.title)}</b>
          <div class="muted small">${esc(inPr.branch)} → ${esc(inPr.base)} · updated ${ago(Date.parse(inPr.updatedAt))}</div>${journey(inPr)}
          ${inPr.status === 'changes' ? '<div class="note bad">A reviewer asked for changes. Edit the documents and save again to answer.</div>' : ''}
          <div class="row">${inPr.checks ? `<span class="pill" data-s="${inPr.checks === 'passing' ? 'done' : inPr.checks === 'failing' ? 'blocked' : 'in-progress'}">checks ${inPr.checks}</span>` : ''}<button class="btn small" data-url="${esc(inPr.url)}">Open on GitHub</button></div></div>` : ''}
        ${g.remote ? `<div class="lab">Recent pull requests</div>${prs.length ? `<div class="prs">${prs.map(prCard).join('')}</div>` : `<div class="empty small card">${g.prError ? esc(g.prError) : 'No pull requests from you yet.'}</div>`}` : ''}
      </div>
    </div></div>`;
  return {
    html,
    bind(el) {
      el.querySelectorAll('.file-head').forEach(b => b.onclick = async () => {
        const row = b.closest('.file-row');
        const box = row.querySelector('.file-diff');
        row.classList.toggle('open');
        box.hidden = !row.classList.contains('open');
        if (!box.hidden && !box.innerHTML) box.innerHTML = diffLines((await ctx.api.git.diff(p.info.root, row.dataset.file)).text);
      });
      el.querySelectorAll('[data-url]').forEach(b => b.onclick = () => ctx.api.openUrl(b.dataset.url));
      el.querySelector('#doSave')?.addEventListener('click', async () => {
        const btn = el.querySelector('#doSave');
        btn.disabled = true; btn.textContent = 'Saving…';
        p.saveTitle = '';
        const r = await ctx.api.git.save(p.info.root, { title: el.querySelector('#prTitle')?.value, body: el.querySelector('#prBody')?.value });
        if (r.error) { ctx.toast(r.error, 'err'); if (r.needsIdentity) ctx.showIdentity(); }
        else if (r.prUrl) ctx.toast('Pull request opened. Reviewers will see it on GitHub.');
        else if (r.updated) ctx.toast('Added to your open pull request.');
        else ctx.toast(r.note ?? 'Saved.');
        if (r.compareUrl) ctx.api.openUrl(r.compareUrl);
        ctx.render();
      });
    },
  };
}
