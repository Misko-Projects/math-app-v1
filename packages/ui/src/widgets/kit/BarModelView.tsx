import { pictureProps } from './a11y';
import { type BarSpec, layoutBarModel } from './barModel';
import './bar-model.css';

/**
 * A `bar-model` stimulus (03 §5.1, #17 slice 4d), laid out by `layoutBarModel`: coloured pieces
 * with their numbers, the unknown a dashed white "?" piece, braces with the whole, and for two
 * steps the shared sand piece joined by a strip and each bar's step number. Static: one picture
 * named by `label` (`describeBarModel`), never the unknown.
 */
export function BarModelView({
  spec,
  label,
  maxWidth = 720,
}: {
  spec: BarSpec;
  label?: string;
  maxWidth?: number;
}) {
  const l = layoutBarModel(spec, maxWidth);
  return (
    <div className="ni-bar" {...pictureProps(label)} style={{ width: l.w, height: l.h }}>
      {l.link ? (
        <span
          className="ni-bar__link"
          style={{ left: l.link.x, top: l.link.y, width: l.link.w, height: l.link.h }}
        />
      ) : null}
      {l.badges.map((b) => (
        <span key={b.label} className="ni-bar__badge" style={{ top: b.y }}>
          {b.label}
        </span>
      ))}
      {l.pieces.map((p, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the pieces are positional
          key={i}
          className="ni-bar__piece ni-number"
          data-kind={p.kind}
          data-tone={p.tone}
          style={{ left: p.x, top: p.y, width: p.w }}
        >
          {p.label}
        </span>
      ))}
      {l.braces.map((b, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the braces are positional
          key={i}
          className="ni-bar__brace"
          data-side={b.side}
          style={{ left: b.x, top: b.y, width: b.w }}
        >
          <span
            className="ni-bar__whole ni-number"
            data-kind={b.label === '?' ? 'unknown' : 'known'}
          >
            {b.label}
          </span>
        </span>
      ))}
    </div>
  );
}
