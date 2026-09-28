import { RangeSet, RangeSetBuilder, StateEffect, StateField, type Extension, type Text } from '@codemirror/state';
import { EditorView, GutterMarker, ViewPlugin, gutter, type ViewUpdate } from '@codemirror/view';

// Change markers in the gutter, like other code editors show against git:
// a bar beside added and modified lines, a notch where lines were removed.
// The comparison is against the published version of the post (the base the
// edit started from), so after publishing the markers clear.
//
// The diff is line-based, as git's is: a character diff would pair up
// unrelated lines that happen to share words and mark them all "modified".

type Kind = 'added' | 'modified' | 'deleted';

class ChangeMarker extends GutterMarker {
  readonly kind: Kind;
  readonly original: string;

  constructor(kind: Kind, original: string) {
    super();
    this.kind = kind;
    this.original = original;
  }

  eq(other: ChangeMarker) {
    return other.kind === this.kind && other.original === this.original;
  }

  toDOM() {
    const el = document.createElement('div');
    el.className = `cm-change cm-change--${this.kind}`;
    const label = { added: 'Added', modified: 'Changed', deleted: 'Removed' }[this.kind];
    el.title = this.original ? `${label}. Was:\n${clip(this.original)}` : label;
    return el;
  }
}

function clip(text: string): string {
  const lines = text.split('\n');
  const shown = lines.slice(0, 12).map((l) => (l.length > 120 ? `${l.slice(0, 117)}…` : l));
  return shown.join('\n') + (lines.length > 12 ? `\n… ${lines.length - 12} more lines` : '');
}

// --- Line diff (Myers) --------------------------------------------------------------

interface Hunk {
  /** Line index range in the base, end exclusive. */
  a0: number;
  a1: number;
  /** Line index range in the current text, end exclusive. */
  b0: number;
  b1: number;
}

/**
 * Hunks where `a` and `b` differ. Common lines at both ends are trimmed first,
 * which keeps typical edits cheap; a middle that is too different to diff in
 * reasonable time becomes one hunk.
 */
export function diffLines(a: string[], b: string[], maxEdits = 4000): Hunk[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }

  const n = endA - start;
  const m = endB - start;
  if (n === 0 && m === 0) return [];
  if (n === 0 || m === 0) return [{ a0: start, a1: endA, b0: start, b1: endB }];

  // Myers' O(ND) forward search, keeping each round's frontier to backtrack.
  const max = n + m;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = false;
  outer: for (let d = 0; d <= Math.min(max, maxEdits); d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[max + k - 1] < v[max + k + 1]) ? v[max + k + 1] : v[max + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[start + x] === b[start + y]) { x++; y++; }
      v[max + k] = x;
      if (x >= n && y >= m) { found = true; break outer; }
    }
  }
  if (!found) return [{ a0: start, a1: endA, b0: start, b1: endB }];

  // Backtrack into a list of equal/insert/delete steps, then group the edits.
  type Step = { type: 'eq' | 'ins' | 'del'; ai: number; bi: number };
  const steps: Step[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && vd[max + k - 1] < vd[max + k + 1]) ? k + 1 : k - 1;
    const prevX = vd[max + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; steps.push({ type: 'eq', ai: x, bi: y }); }
    if (d > 0) {
      if (x === prevX) { y--; steps.push({ type: 'ins', ai: x, bi: y }); }
      else { x--; steps.push({ type: 'del', ai: x, bi: y }); }
    }
  }
  steps.reverse();

  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  for (const s of steps) {
    if (s.type === 'eq') { cur = null; continue; }
    if (!cur) {
      cur = { a0: start + s.ai, a1: start + s.ai, b0: start + s.bi, b1: start + s.bi };
      hunks.push(cur);
    }
    if (s.type === 'del') cur.a1 = start + s.ai + 1;
    else cur.b1 = start + s.bi + 1;
  }
  return hunks;
}

// --- CodeMirror wiring ---------------------------------------------------------------

/** Sets the text to compare against; null turns the markers off. */
export const setChangeBase = StateEffect.define<string | null>();
const setMarkers = StateEffect.define<RangeSet<GutterMarker>>();

const baseField = StateField.define<string[] | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setChangeBase)) value = e.value === null ? null : e.value.split(/\r?\n/);
    }
    return value;
  },
});

const markerField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(value, tr) {
    // Keep markers attached to their lines while a fresh diff is pending.
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setMarkers)) value = e.value;
      if (e.is(setChangeBase) && e.value === null) value = RangeSet.empty;
    }
    return value;
  },
});

function computeMarkers(base: string[], doc: Text): RangeSet<GutterMarker> {
  const current: string[] = [];
  for (let i = 1; i <= doc.lines; i++) current.push(doc.line(i).text);

  const builder = new RangeSetBuilder<GutterMarker>();
  for (const h of diffLines(base, current)) {
    const original = base.slice(h.a0, h.a1).join('\n');
    if (h.b0 === h.b1) {
      // Removed lines: notch on the line that now sits where they were.
      const line = doc.line(Math.min(h.b0 + 1, doc.lines));
      builder.add(line.from, line.from, new ChangeMarker('deleted', original));
      continue;
    }
    const marker = new ChangeMarker(h.a0 === h.a1 ? 'added' : 'modified', original);
    for (let i = h.b0; i < h.b1; i++) {
      const line = doc.line(i + 1);
      builder.add(line.from, line.from, marker);
    }
  }
  return builder.finish();
}

const recompute = ViewPlugin.fromClass(class {
  private timer: number | undefined;
  private view: EditorView;

  constructor(view: EditorView) {
    this.view = view;
    this.schedule(0);
  }

  update(u: ViewUpdate) {
    const baseChanged = u.startState.field(baseField) !== u.state.field(baseField);
    if (u.docChanged || baseChanged) this.schedule(baseChanged ? 0 : 200);
  }

  private schedule(delay: number) {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      const base = this.view.state.field(baseField);
      if (!base) return;
      this.view.dispatch({ effects: setMarkers.of(computeMarkers(base, this.view.state.doc)) });
    }, delay);
  }

  destroy() {
    window.clearTimeout(this.timer);
  }
});

export function changeGutter(): Extension {
  return [
    baseField,
    markerField,
    recompute,
    gutter({
      class: 'cm-change-gutter',
      markers: (v) => v.state.field(markerField),
    }),
  ];
}
