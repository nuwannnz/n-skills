// The agent's multiple-choice questions, one at a time, in place of the composer.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { getProject, type Pending } from '../../app/store';
import { Button, cx, Grow, Icon } from '../../ui';
import { answerQuestions, editQuestion } from './actions';

type Card = Extract<Pending, { kind: 'question' }>;

/** What has been answered so far for question i, as the person would read it. */
const answerOf = (card: Card, i: number) => [...card.picked[i]!].sort((a, b) => a - b).map(o => card.questions[i]!.options![o]!.label)
  .concat(card.other[i]!.trim() ? [card.other[i]!.trim()] : []).join(', ');

export function QuestionCard({ root, card }: { root: string; card: Card }) {
  const { id, questions, at } = card;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (document.activeElement?.tagName !== 'INPUT') ref.current?.focus({ preventScroll: true }); }, [at]);
  const q = questions[at]!;
  const multi = !!q.multiSelect;
  const last = at === questions.length - 1;
  const picked = card.picked[at]!;
  const answered = (i: number) => card.picked[i]!.length > 0 || card.other[i]!.trim() !== '';
  const edit = (fn: Parameters<typeof editQuestion>[2]) => editQuestion(root, id, fn);
  const current = () => getProject(root)?.chat.pending.find(x => x.id === id) as Card | undefined;

  const next = () => { if (!answered(at)) return; if (last) answerQuestions(root, card); else edit(c => { c.at++; }); };
  const back = () => { if (at > 0) edit(c => { c.at--; }); };
  const pick = (o: number) => {
    if (multi) return edit(c => { const list = c.picked[at]!; c.picked[at] = list.includes(o) ? list.filter(x => x !== o) : [...list, o]; });
    edit(c => { c.picked[at] = [o]; c.other[at] = ''; });
    if (!last) setTimeout(() => { const c = current(); if (c?.at === at && c.picked[at]!.length) edit(x => { x.at++; }); }, 320); // a single choice moves on by itself
  };
  const keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') { if (e.key === 'Enter') { e.preventDefault(); next(); } return; }
    if (/^[1-9]$/.test(e.key) && +e.key <= (q.options?.length ?? 0)) pick(+e.key - 1);
    else if (e.key === 'Enter' && e.target === e.currentTarget) next();
    else if (e.key === 'ArrowLeft') back();
  };

  return (
    <section className="qcard pending" aria-label="Questions from the agent" tabIndex={-1} ref={ref} onKeyDown={keys}>
      <div className="q-top">
        <span className="q-tag">{q.header || 'Question'}</span>{multi ? <span className="muted small">Pick any that apply</span> : null}<Grow />
        {questions.length > 1 ? <>
          <span className="q-steps" aria-hidden="true">{questions.map((_, i) => <i key={i} className={i <= at ? 'on' : ''} />)}</span>
          <span className="muted small">{at + 1} of {questions.length}</span>
        </> : null}
      </div>
      {at > 0 ? (
        <div className="qchips"><span className="muted small">So far</span>
          {questions.slice(0, at).map((_, i) => (
            <button type="button" key={i} className="qchip" title="Change this answer" onClick={() => edit(c => { c.at = i; })}>{answerOf(card, i)} <span>✎</span></button>
          ))}
        </div>
      ) : null}
      <div className="qtext" id={`qt-${id}`}>{q.question}</div>
      <div className="qopts" role={multi ? 'group' : 'radiogroup'} aria-labelledby={`qt-${id}`}>
        {(q.options ?? []).map((o, oi) => {
          const on = picked.includes(oi);
          return (
            <button type="button" key={oi} className={cx('qopt', on && 'on')} role={multi ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => pick(oi)}>
              <span className={cx('qmark', multi && 'sq')}>{on ? <Icon name="check" size={11} /> : null}</span>
              <span className="qbody"><b>{o.label}</b>{o.description ? <span className="muted small">{o.description}</span> : null}{o.preview ? <pre className="qprev">{o.preview}</pre> : null}</span>
              {oi < 9 ? <kbd>{oi + 1}</kbd> : null}
            </button>
          );
        })}
        <label className="qown"><span className="muted small">Or write your own</span>
          <input className="qother" placeholder="Type an answer" value={card.other[at]} onChange={e => {
            const v = e.target.value;
            edit(c => { c.other[at] = v; if (!multi && v.trim()) c.picked[at] = []; });
          }} />
        </label>
      </div>
      <div className="q-foot">
        <Button variant="ghost" size="small" onClick={() => answerQuestions(root, card)}>{questions.length > 1 && questions.some((_, i) => answered(i)) ? 'Skip the rest' : 'Skip'}</Button>
        <span className="qkeys">1 to {Math.min(9, q.options?.length ?? 0)} choose · Enter {last ? 'sends' : 'continues'}{at > 0 ? ' · ← back' : ''}</span>
        <Grow />
        {at > 0 ? <Button onClick={back}>Back</Button> : null}
        <Button variant="primary" disabled={!answered(at)} onClick={next}>{last ? (questions.length > 1 ? 'Send answers' : 'Send answer') : 'Next'}</Button>
      </div>
    </section>
  );
}
