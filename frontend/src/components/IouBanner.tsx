// SPEC §8.15a / §8.15c — the IOU banner: on every screen, under the mess banner, one row per IOU or payment waiting on
// me (okError says I may OK it), what it is and OK / Got it and Decline. Not red, no sound; answering removes the row.
import { useApp } from '../state';
import { IouAnswerButtons, okable, useIouAction, useIous } from './Ious';
import { okError, waitingText, type IouItem, type IouKind, type IouPair, type IouPayment } from '../../../src/shared/ious';
import s from './Messes.module.css';

export function IouBanner() {
  const { me, memberById } = useApp();
  const { pairs } = useIous();
  const { busy, error, act } = useIouAction();
  const mine: [IouPair, IouKind, IouItem | IouPayment][] = (pairs ?? []).flatMap((p) => [
    ...p.waiting.ious.map((x) => [p, 'iou', x] as [IouPair, IouKind, IouItem]),
    ...p.waiting.payments.map((x) => [p, 'payment', x] as [IouPair, IouKind, IouPayment]),
  ]).filter(([p, kind, x]) => !okError(kind, okable(p, x), me.id));
  if (mine.length === 0 && !error) return null;
  return (
    <section className={s.banner} aria-label="IOUs to OK" aria-live="polite">
      {error && <div role="alert" className="alert-error">{error}</div>}
      {mine.map(([p, kind, x]) => {
        const by = memberById(x.createdBy)?.displayName ?? 'Someone';
        return (
          <div key={x.id} className={s.ask}>
            <span className={s.question}>💵 {waitingText(kind, by, x.cents, 'how' in x ? x.how : null, x.note)}</span>
            <div className={s.actions}><IouAnswerButtons p={p} kind={kind} x={x} busy={busy} act={act} makerName={by} /></div>
          </div>
        );
      })}
    </section>
  );
}
