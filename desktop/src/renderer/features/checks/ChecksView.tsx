// What `scrumo validate` found in the documents.
import type { ProjectView } from '../../app/store';
import { Button, Empty, Note, PageHead } from '../../ui';
import { refreshChecks } from '../projects/actions';

export function ChecksView({ p }: { p: ProjectView }) {
  const v = p.validation;
  return (
    <div className="page">
      <PageHead title="Checks" sub={<>What <span className="mono">scrumo validate</span> found in the documents.</>}>
        <Button onClick={() => refreshChecks(p.info.root)}>Check again</Button>
      </PageHead>
      {!v ? <Empty>Not checked yet.</Empty> : v.findings.length ? v.findings.map((f, i) => (
        <div key={i} className={`finding ${f.severity}`}>
          <div className="code">{f.code} · {f.severity}</div>
          <div>{f.message}</div>
          <div className="file">{f.file}{f.line ? `:${f.line}` : ''}</div>
        </div>
      )) : <Note tone="ok">No problems. {v.files} files checked.</Note>}
    </div>
  );
}
