import type { CSSProperties, ReactNode } from 'react';

/**
 * Kip the bellhop owl, drawn once and reused by every screen state.
 *
 * Coordinates: a 200x200 box. The body is centred at (100,120), the feet touch y~190 and the cap top
 * is y~33. A scene places this inside its own viewBox with a translate().
 *
 * Animation is plain CSS (see KIP_CSS) so it needs no client JS, can pivot around exact points, and is
 * switched off in one place for people who ask for reduced motion.
 */

export type KipMood = 'happy' | 'joy' | 'sleepy' | 'worried' | 'sad' | 'focus' | 'curious' | 'wink';
export type KipHat = 'bellhop' | 'chef' | 'hardhat' | 'nightcap' | 'none';
export type KipWing = 'down' | 'up' | 'wave' | 'bell';
export type KipLook = 'center' | 'scan' | 'up-right' | 'down';

const INK = '#1C1917';
const AMBER = '#E8A020';
const AMBER_DEEP = '#C68510';
const CREAM = '#FFF5E1';
const TEAL = '#0F5F54';
const BRASS = '#F2B83A';
const CORAL = '#C8573A';

export const KIP_CSS = `
.kip-svg .k-blink,.kip-svg .k-shadow,.kip-svg .k-twinkle,.kip-svg .k-pop,.kip-svg .k-fall,
.kip-svg .k-dot,.kip-svg .k-pulse,.kip-svg .k-steam,.kip-svg .k-drop{transform-box:fill-box;transform-origin:center}
.kip-svg .k-float{animation:k-float var(--dur,3s) ease-in-out infinite}
.kip-svg .k-swing{animation:k-swing var(--dur,3s) ease-in-out infinite}
.kip-svg .k-ring{animation:k-ring var(--dur,3s) ease-in-out infinite}
.kip-svg .k-shake{animation:k-shake var(--dur,3.5s) ease-in-out infinite}
.kip-svg .k-spin{animation:k-spin var(--dur,8s) linear infinite}
.kip-svg .k-blink{animation:k-blink 4.5s ease-in-out infinite}
.kip-svg .k-shadow{animation:k-shadow var(--dur,3s) ease-in-out infinite}
.kip-svg .k-twinkle{animation:k-twinkle var(--dur,2.4s) ease-in-out infinite}
.kip-svg .k-pop{animation:k-pop .6s cubic-bezier(.2,.9,.3,1.3) both}
.kip-svg .k-fall{animation:k-fall var(--dur,2.4s) ease-in infinite}
.kip-svg .k-dot{animation:k-dot 1.2s ease-in-out infinite}
.kip-svg .k-steam{animation:k-steam 2.2s ease-out infinite}
.kip-svg .k-look{animation:k-look 3.2s ease-in-out infinite}
.kip-svg .k-drop{animation:k-drop 2.2s ease-in infinite}
.kip-svg .k-flicker{animation:k-flicker 1.6s ease-in-out infinite}
.kip-svg .k-pulse{animation:k-pulse 1.8s ease-in-out infinite}
@keyframes k-float{0%,100%{transform:translateY(0)}50%{transform:translateY(var(--dy,-10px))}}
@keyframes k-swing{0%,100%{transform:rotate(var(--a,-5deg))}50%{transform:rotate(var(--b,5deg))}}
@keyframes k-ring{0%,55%,100%{transform:rotate(0)}60%{transform:rotate(-12deg)}66%{transform:rotate(10deg)}72%{transform:rotate(-8deg)}78%{transform:rotate(5deg)}84%{transform:rotate(-2deg)}}
@keyframes k-shake{0%,70%,100%{transform:rotate(0)}74%{transform:rotate(-4deg)}78%{transform:rotate(4deg)}82%{transform:rotate(-3deg)}86%{transform:rotate(3deg)}90%{transform:rotate(-1deg)}}
@keyframes k-spin{to{transform:rotate(360deg)}}
@keyframes k-blink{0%,90%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}
@keyframes k-shadow{0%,100%{transform:scaleX(1);opacity:.18}50%{transform:scaleX(.78);opacity:.1}}
@keyframes k-twinkle{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1.1)}}
@keyframes k-pop{0%{transform:scale(0) rotate(-25deg);opacity:0}70%{transform:scale(1.18) rotate(4deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
@keyframes k-fall{0%{transform:translateY(0) rotate(0);opacity:0}10%{opacity:1}100%{transform:translateY(120px) rotate(540deg);opacity:0}}
@keyframes k-dot{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-8px);opacity:1}}
@keyframes k-steam{0%{transform:translateY(0);opacity:0}25%{opacity:.8}100%{transform:translateY(-22px);opacity:0}}
@keyframes k-look{0%,100%{transform:translateX(-5px)}50%{transform:translateX(5px)}}
@keyframes k-drop{0%{transform:translateY(0);opacity:.9}100%{transform:translateY(16px);opacity:0}}
@keyframes k-flicker{0%,100%{opacity:.2}50%{opacity:1}}
@keyframes k-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
@media (prefers-reduced-motion:reduce){
  .kip-svg *{animation:none!important}
  .kip-svg .k-fall{display:none}
}
`;

/** Drop this once inside every <svg className="kip-svg"> that uses Kip. */
export function KipStyles() {
  return <style>{KIP_CSS}</style>;
}

/** Inline style that sets the CSS variables the keyframes read, plus an optional pivot. */
export function kipVars(vars: Record<string, string | number>, pivot?: string): CSSProperties {
  const style: Record<string, string | number> = { ...vars };
  if (pivot) {
    style.transformOrigin = pivot;
    style.transformBox = 'view-box';
  }
  return style as CSSProperties;
}

// ---------- parts ----------

function Wing({ side, pose }: { side: 'l' | 'r'; pose: KipWing }) {
  const left = side === 'l';
  const px = left ? 50 : 150;
  const sign = left ? 1 : -1; // positive rotate = clockwise, which lifts the left wing outward
  const cx = left ? 46 : 154;
  let className: string | undefined;
  let style: CSSProperties;
  if (pose === 'wave') {
    className = 'k-swing';
    style = kipVars({ '--a': `${sign * 115}deg`, '--b': `${sign * 145}deg`, '--dur': '0.7s' }, `${px}px 108px`);
  } else {
    const angle = pose === 'up' ? 125 : pose === 'bell' ? 45 : 0;
    style = { ...kipVars({}, `${px}px 108px`), transform: `rotate(${sign * angle}deg)` };
  }
  return (
    <g className={className} style={style}>
      <ellipse cx={cx} cy={132} rx={13} ry={28} transform={`rotate(${left ? 12 : -12} ${cx} 130)`} fill={AMBER_DEEP} />
    </g>
  );
}

function Eye({ cx, side, mood, look }: { cx: number; side: 'l' | 'r'; mood: KipMood; look: KipLook }) {
  const arcUp = `M${cx - 12} 100 Q${cx} 84 ${cx + 12} 100`; // ^ ^  (joy)
  const arcDown = `M${cx - 12} 96 Q${cx} 106 ${cx + 12} 96`; // closed (sleepy, wink)
  const white = <circle cx={cx} cy={94} r={19} fill={CREAM} />;
  const closed = (d: string) => (
    <g>
      {white}
      <path d={d} stroke={INK} strokeWidth={3.5} strokeLinecap="round" fill="none" />
    </g>
  );

  if (mood === 'joy') return closed(arcUp);
  if (mood === 'sleepy') return closed(arcDown);
  if (mood === 'wink' && side === 'r') return closed(arcDown);

  const small = mood === 'worried' || mood === 'sad' || mood === 'focus';
  const r = small ? 8 : 9;
  const base = side === 'l' ? 2 : -2;
  const offset = look === 'up-right' ? [5, -5] : look === 'down' ? [0, 5] : [base, 0];
  const pupil = (
    <g>
      <circle cx={cx} cy={96} r={r} fill={INK} />
      <circle cx={cx + 3} cy={92} r={3} fill="#fff" />
    </g>
  );
  return (
    <g className="k-blink">
      {white}
      <g transform={`translate(${offset[0]} ${offset[1]})`}>
        {look === 'scan' ? (
          <g className="k-look" style={{ animationDelay: '0s' }}>{pupil}</g>
        ) : (
          pupil
        )}
      </g>
    </g>
  );
}

function Brows({ mood }: { mood: KipMood }) {
  const stroke = { stroke: AMBER_DEEP, strokeWidth: 4, strokeLinecap: 'round' as const, fill: 'none' };
  if (mood === 'worried' || mood === 'sad') {
    return (
      <g>
        <path d="M66 80 L88 73" {...stroke} />
        <path d="M134 80 L112 73" {...stroke} />
      </g>
    );
  }
  if (mood === 'focus') {
    return (
      <g>
        <path d="M66 73 L88 80" {...stroke} />
        <path d="M134 73 L112 80" {...stroke} />
      </g>
    );
  }
  if (mood === 'curious') return <path d="M108 73 Q120 66 132 73" {...stroke} />;
  return null;
}

function Hat({ hat }: { hat: KipHat }) {
  switch (hat) {
    case 'bellhop':
      return (
        <g>
          <path d="M68 66 L77 40 Q100 33 123 40 L132 66 Q100 73 68 66 Z" fill={TEAL} />
          <path d="M70 59 Q100 66 130 59 L132 66 Q100 73 68 66 Z" fill={BRASS} />
          <circle cx={100} cy={35} r={4.5} fill={BRASS} />
        </g>
      );
    case 'chef':
      return (
        <g>
          <circle cx={78} cy={46} r={13} fill="#fff" />
          <circle cx={100} cy={36} r={16} fill="#fff" />
          <circle cx={122} cy={46} r={13} fill="#fff" />
          <rect x={76} y={46} width={48} height={22} rx={3} fill="#fff" />
          <rect x={74} y={60} width={52} height={8} rx={3} fill="#EFE7D6" />
        </g>
      );
    case 'hardhat':
      return (
        <g>
          <path d="M70 66 Q70 36 100 36 Q130 36 130 66 Z" fill={BRASS} />
          <rect x={96} y={36} width={8} height={30} fill="#E09F18" />
          <rect x={64} y={63} width={72} height={8} rx={4} fill="#E09F18" />
        </g>
      );
    case 'nightcap':
      return (
        <g>
          <path d="M72 66 Q80 34 112 32 Q142 34 150 64 Q130 52 128 66 Z" fill={CORAL} />
          <rect x={68} y={62} width={64} height={8} rx={4} fill={CREAM} />
          <circle cx={150} cy={64} r={7} fill={CREAM} />
        </g>
      );
    default:
      return null;
  }
}

/** The service bell Kip holds in the 'bell' wing pose. Place it with translate(). Base sits on y=0. */
export function KipBell({ ring = true }: { ring?: boolean }) {
  return (
    <g className={ring ? 'k-ring' : undefined} style={kipVars({ '--dur': '3s' }, '0px -20px')}>
      <circle cx={0} cy={-21} r={3.5} fill={AMBER_DEEP} />
      <path d="M-14 0 Q-14 -18 0 -18 Q14 -18 14 0 Z" fill={BRASS} />
      <path d="M-9 -6 Q-8 -13 -2 -14" stroke="#fff" strokeOpacity={0.55} strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <ellipse cx={0} cy={1} rx={15} ry={3.5} fill={AMBER_DEEP} />
    </g>
  );
}

export interface KipFigureProps {
  mood?: KipMood;
  hat?: KipHat;
  leftWing?: KipWing;
  rightWing?: KipWing;
  look?: KipLook;
  /** Extra things Kip holds or wears, in the same 200x200 coordinates, drawn on top. */
  children?: ReactNode;
}

export function KipFigure({
  mood = 'happy',
  hat = 'bellhop',
  leftWing = 'down',
  rightWing = 'down',
  look,
  children,
}: KipFigureProps) {
  const eyeLook: KipLook = look ?? (mood === 'sad' ? 'down' : mood === 'curious' ? 'up-right' : 'center');
  return (
    <g>
      <Wing side="l" pose={leftWing} />
      <Wing side="r" pose={rightWing} />

      {/* feet */}
      <ellipse cx={86} cy={184} rx={13} ry={5.5} fill={CORAL} />
      <ellipse cx={114} cy={184} rx={13} ry={5.5} fill={CORAL} />

      {/* body and belly */}
      <ellipse cx={100} cy={120} rx={58} ry={64} fill={AMBER} />
      <ellipse cx={100} cy={148} rx={34} ry={32} fill={CREAM} />
      <path
        d="M84 138 q6 6 12 0 M96 138 q6 6 12 0 M90 150 q6 6 12 0 M102 150 q6 6 12 0 M96 162 q6 6 12 0"
        stroke="#F2D9A4" strokeWidth={2.5} strokeLinecap="round" fill="none"
      />

      {/* face */}
      <Eye cx={80} side="l" mood={mood} look={eyeLook} />
      <Eye cx={120} side="r" mood={mood} look={eyeLook} />
      <Brows mood={mood} />
      {mood === 'joy' ? (
        <g fill={CORAL} stroke={CORAL} strokeWidth={2} strokeLinejoin="round">
          <path d="M94 108 L106 108 L100 114 Z" />
          <path d="M95 119 L105 119 L100 124 Z" />
        </g>
      ) : (
        <path d="M94 108 L106 108 L100 119 Z" fill={CORAL} stroke={CORAL} strokeWidth={2} strokeLinejoin="round" />
      )}
      <circle cx={62} cy={112} r={6} fill="#E8704A" opacity={0.45} />
      <circle cx={138} cy={112} r={6} fill="#E8704A" opacity={0.45} />

      {/* feelings that show on the face */}
      {mood === 'sad' && <ellipse className="k-drop" cx={62} cy={106} rx={3} ry={5} fill="#A8D8EA" />}
      {mood === 'worried' && <ellipse className="k-drop" cx={140} cy={74} rx={3} ry={5} fill="#A8D8EA" />}

      {/* bow tie */}
      <path d="M100 129 L84 120 L84 138 Z M100 129 L116 120 L116 138 Z" fill={TEAL} stroke={TEAL} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={100} cy={129} r={5} fill="#0B4A41" />

      <Hat hat={hat} />
      {children}
    </g>
  );
}

/** Five-point sparkle used for twinkles and orbiting stars. */
export function Sparkle({ x, y, s = 1, delay = 0, fill = AMBER }: { x: number; y: number; s?: number; delay?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className="k-twinkle" style={{ animationDelay: `${delay}s` }} d="M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z" fill={fill} />
    </g>
  );
}
