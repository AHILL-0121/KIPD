import type { ReactNode } from 'react';
import { KipBell, KipFigure, KipStyles, Sparkle, kipVars } from './Kip';

export type KipdScene =
  | '404'
  | 'loading'
  | 'success'
  | 'error'
  | 'empty'
  | 'no-connection'
  | 'booking-confirmed'
  | 'checkout'
  | 'order-ready'
  | 'maintenance'
  | 'default';

interface KipdIllustrationProps {
  scene?: KipdScene;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  message?: string;
  className?: string;
}

const SIZES = {
  sm: { width: 160, height: 140 },
  md: { width: 280, height: 220 },
  lg: { width: 360, height: 300 },
  xl: { width: 480, height: 400 },
};

const LABELS: Record<KipdScene, string> = {
  '404': 'Kip looks around, lost',
  loading: 'Kip is working on it',
  success: 'Kip celebrates',
  error: 'Kip is worried something went wrong',
  empty: 'Kip searches but finds nothing yet',
  'no-connection': 'Kip has lost the connection',
  'booking-confirmed': 'Kip holds up a room key',
  checkout: 'Kip waves goodbye next to a suitcase',
  'order-ready': 'Kip serves a hot dish',
  maintenance: 'Kip is fixing things',
  default: 'Kip the bellhop owl',
};

export function KipdIllustration({ scene = 'default', size = 'md', message, className }: KipdIllustrationProps) {
  const { width, height } = SIZES[size];

  return (
    <div className={`flex flex-col items-center gap-4 ${className || ''}`}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 280 220"
        fill="none"
        className="kip-svg select-none"
        role="img"
        aria-label={LABELS[scene]}
      >
        <KipStyles />
        {renderScene(scene)}
      </svg>
      {message && (
        <p className="text-center text-ink-muted text-sm font-serif italic max-w-xs">{message}</p>
      )}
    </div>
  );
}

function renderScene(scene: KipdScene) {
  switch (scene) {
    case '404': return <NotFoundScene />;
    case 'loading': return <LoadingScene />;
    case 'success': return <SuccessScene />;
    case 'error': return <ErrorScene />;
    case 'empty': return <EmptyScene />;
    case 'no-connection': return <NoConnectionScene />;
    case 'booking-confirmed': return <BookingConfirmedScene />;
    case 'checkout': return <CheckoutScene />;
    case 'order-ready': return <OrderReadyScene />;
    case 'maintenance': return <MaintenanceScene />;
    default: return <DefaultScene />;
  }
}

// ---------- shared staging ----------

/** Shadow on the floor, plus Kip placed in the middle of the 280x220 scene (Kip's own box is 200x200). */
function Stage({ children, float = true, dur = '3s', dy = '-10px', shake = false }: {
  children: ReactNode; float?: boolean; dur?: string; dy?: string; shake?: boolean;
}) {
  return (
    <g>
      <ellipse className={float ? 'k-shadow' : undefined} style={kipVars({ '--dur': dur })} cx={140} cy={207} rx={46} ry={7} fill="#C47A10" opacity={0.18} />
      <g transform="translate(40 12)">
        <g className={float ? 'k-float' : undefined} style={kipVars({ '--dur': dur, '--dy': dy })}>
          <g className={shake ? 'k-shake' : undefined} style={kipVars({ '--dur': '3.5s' }, '100px 190px')}>
            {children}
          </g>
        </g>
      </g>
    </g>
  );
}

const BELL_AT = 'translate(188 126)';

// ---------- scenes ----------

function DefaultScene() {
  return (
    <g>
      <Sparkle x={48} y={64} s={1.1} />
      <Sparkle x={238} y={36} s={0.9} delay={0.8} />
      <Sparkle x={30} y={130} s={0.7} delay={1.4} />
      <Stage>
        <KipFigure mood="happy" hat="bellhop" rightWing="bell">
          <g transform={BELL_AT}><KipBell /></g>
        </KipFigure>
      </Stage>
    </g>
  );
}

/** Kip glances left and right while three dots bounce above, like "one moment please". */
function LoadingScene() {
  return (
    <g>
      <g transform="translate(140 26)">
        {[-16, 0, 16].map((x, i) => (
          <circle key={x} className="k-dot" style={{ animationDelay: `${i * 0.2}s` }} cx={x} cy={0} r={4.5} fill="#E8A020" />
        ))}
      </g>
      <Stage dur="1.6s" dy="-5px">
        <KipFigure mood="happy" hat="bellhop" look="scan" rightWing="wave" />
      </Stage>
    </g>
  );
}

/** Both wings up, confetti falling, a green tick pops in. */
function SuccessScene() {
  const colors = ['#E8A020', '#C8573A', '#5E8C6A', '#0F5F54', '#F2B83A', '#C8573A', '#5E8C6A', '#E8A020'];
  return (
    <g>
      {colors.map((fill, i) => (
        <rect
          key={i}
          className="k-fall"
          style={{ ...kipVars({ '--dur': `${2 + (i % 3) * 0.3}s` }), animationDelay: `${i * 0.28}s` }}
          x={34 + i * 30} y={10} width={7} height={7} rx={1.5} fill={fill}
        />
      ))}
      <g transform="translate(236 56)">
        <g className="k-pop">
          <circle r={20} fill="#5E8C6A" />
          <path d="M-8 0 L-3 6 L8 -6" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      </g>
      <Stage dur="1.6s" dy="-14px">
        <KipFigure mood="joy" hat="bellhop" leftWing="wave" rightWing="wave" />
      </Stage>
    </g>
  );
}

/** Worried Kip with an occasional shake and a pulsing warning sign. No bobbing: nothing here is cheerful. */
function ErrorScene() {
  return (
    <g>
      <g transform="translate(238 52)">
        <g className="k-pulse">
          <path d="M0 -22 L21 14 H-21 Z" fill="#C8573A" stroke="#C8573A" strokeWidth={5} strokeLinejoin="round" />
          <path d="M0 -8 V3" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" />
          <circle cx={0} cy={9} r={2.2} fill="#fff" />
        </g>
      </g>
      <Stage float={false} shake>
        <KipFigure mood="worried" hat="bellhop" />
      </Stage>
    </g>
  );
}

/** Head-tilted Kip with a magnifying glass sweeping over nothing yet. */
function EmptyScene() {
  return (
    <g>
      <text className="k-twinkle" x={46} y={70} fontFamily="Georgia,serif" fontSize={24} fontWeight={700} fill="#E8A020">?</text>
      <text className="k-twinkle" style={{ animationDelay: '0.9s' }} x={28} y={106} fontFamily="Georgia,serif" fontSize={16} fontWeight={700} fill="#E8A020">?</text>
      <g transform="translate(236 72)">
        <g className="k-swing" style={kipVars({ '--a': '-14deg', '--b': '10deg', '--dur': '3.4s' }, '0px 34px')}>
          <circle r={20} fill="#fff" fillOpacity={0.35} stroke="#B9AB96" strokeWidth={5} />
          <path d="M-10 -8 Q-6 -14 2 -14" stroke="#fff" strokeOpacity={0.8} strokeWidth={3} strokeLinecap="round" fill="none" />
          <path d="M14 14 L28 34" stroke="#B9AB96" strokeWidth={7} strokeLinecap="round" />
        </g>
      </g>
      <Stage dur="4s" dy="-6px">
        <g style={kipVars({}, '100px 190px')}>
          <g className="k-swing" style={kipVars({ '--a': '-3deg', '--b': '4deg', '--dur': '4s' }, '100px 190px')}>
            <KipFigure mood="curious" hat="bellhop" look="up-right" />
          </g>
        </g>
      </Stage>
    </g>
  );
}

/** Lost at night: nightcap, eyes scanning, big faint 404 behind. */
function NotFoundScene() {
  return (
    <g>
      <Sparkle x={26} y={40} s={1.2} />
      <Sparkle x={250} y={58} s={0.9} delay={0.7} />
      <Sparkle x={66} y={16} s={0.7} delay={1.3} />
      <text x={140} y={150} textAnchor="middle" fontFamily="Georgia,serif" fontSize={120} fontWeight={700} fill="#F5C96A" opacity={0.35}>404</text>
      <text className="k-twinkle" style={{ animationDelay: '0.4s' }} x={196} y={44} fontFamily="Georgia,serif" fontSize={26} fontWeight={700} fill="#E8A020">?</text>
      <Stage dur="3.4s" dy="-8px">
        <KipFigure mood="curious" hat="nightcap" look="scan" />
      </Stage>
    </g>
  );
}

/** Sad Kip, searching wifi arcs and a red cross. */
function NoConnectionScene() {
  const arcs = [14, 26, 38];
  const cx = 232;
  const cy = 86;
  return (
    <g>
      {arcs.map((r, i) => (
        <path
          key={r}
          className="k-flicker"
          style={{ animationDelay: `${(arcs.length - 1 - i) * 0.25}s` }}
          d={`M${cx - r * 0.72} ${cy - r * 0.72} A${r} ${r} 0 0 1 ${cx + r * 0.72} ${cy - r * 0.72}`}
          stroke="#B9AB96" strokeWidth={5} strokeLinecap="round" fill="none"
        />
      ))}
      <circle cx={cx} cy={cy} r={4.5} fill="#B9AB96" />
      <g transform="translate(256 34)">
        <g className="k-pulse">
          <circle r={12} fill="#C8573A" />
          <path d="M-5 -5 L5 5 M5 -5 L-5 5" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
        </g>
      </g>
      <Stage dur="4s" dy="-5px">
        <KipFigure mood="sad" hat="bellhop" look="down" />
      </Stage>
    </g>
  );
}

/** Joyful Kip, room key swinging, sparkles orbiting. */
function BookingConfirmedScene() {
  const orbit = [0, 90, 180, 270].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { x: 140 + Math.cos(a) * 96, y: 110 + Math.sin(a) * 78, deg };
  });
  return (
    <g>
      <g className="k-spin" style={kipVars({ '--dur': '9s' }, '140px 110px')}>
        {orbit.map((p, i) => <Sparkle key={p.deg} x={p.x} y={p.y} s={1.1} delay={i * 0.4} />)}
      </g>
      <g transform="translate(240 40)">
        <g className="k-swing" style={kipVars({ '--a': '-12deg', '--b': '12deg', '--dur': '2.2s' }, '0px -8px')}>
          <circle cx={0} cy={0} r={7} stroke="#F2B83A" strokeWidth={3.5} fill="none" />
          <rect x={-2.5} y={7} width={5} height={26} rx={1.5} fill="#F2B83A" />
          <rect x={2.5} y={22} width={8} height={4.5} rx={1} fill="#F2B83A" />
          <rect x={2.5} y={28} width={5} height={4} rx={1} fill="#F2B83A" />
        </g>
      </g>
      <Stage dur="2s" dy="-12px">
        <KipFigure mood="joy" hat="bellhop" rightWing="wave" />
      </Stage>
    </g>
  );
}

/** Waving goodbye beside a suitcase, with a heart floating up. */
function CheckoutScene() {
  return (
    <g>
      <g transform="translate(236 70)">
        <path className="k-twinkle" style={kipVars({ '--dur': '2s' })} d="M0 8 C-13 -2 -10 -16 0 -8 C10 -16 13 -2 0 8 Z" fill="#C8573A" />
      </g>
      <g transform="translate(46 182)">
        <g className="k-float" style={kipVars({ '--dur': '1.8s', '--dy': '-4px' })}>
          <path d="M-8 -28 V-34 H8 V-28" stroke="#A8493A" strokeWidth={3} fill="none" strokeLinecap="round" />
          <rect x={-22} y={-28} width={44} height={32} rx={5} fill="#C8573A" />
          <rect x={-22} y={-16} width={44} height={3} fill="#A8493A" />
          <rect x={-4} y={-19} width={8} height={9} rx={2} fill="#F2B83A" />
          <circle cx={-14} cy={7} r={3.5} fill="#1C1917" />
          <circle cx={14} cy={7} r={3.5} fill="#1C1917" />
        </g>
      </g>
      <Stage dur="2.6s" dy="-8px">
        <KipFigure mood="happy" hat="bellhop" rightWing="wave" />
      </Stage>
    </g>
  );
}

/** Chef Kip carrying a steaming plate. */
function OrderReadyScene() {
  return (
    <g>
      <Sparkle x={46} y={80} s={1} />
      <Sparkle x={252} y={30} s={0.8} delay={1} />
      <Stage dur="2s" dy="-9px">
        <KipFigure mood="happy" hat="chef" rightWing="bell">
          <g transform="translate(190 128)">
            {[-9, 0, 9].map((x, i) => (
              <path key={x} className="k-steam" style={{ animationDelay: `${i * 0.5}s` }} d={`M${x} -18 q-4 -6 0 -12`} stroke="#B9AB96" strokeWidth={3} strokeLinecap="round" fill="none" />
            ))}
            <ellipse cx={0} cy={1} rx={27} ry={6} fill="#E7DFD0" />
            <ellipse cx={0} cy={-3} rx={17} ry={9} fill="#E8A020" />
            <circle cx={-6} cy={-8} r={5} fill="#C8573A" />
            <circle cx={6} cy={-7} r={4.5} fill="#5E8C6A" />
          </g>
        </KipFigure>
      </Stage>
    </g>
  );
}

/** Hard-hat Kip swinging a spanner, gear turning, sparks flying. */
function MaintenanceScene() {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g>
      <g transform="translate(240 50)">
        <g className="k-spin" style={kipVars({ '--dur': '6s' }, '0px 0px')}>
          <path fillRule="evenodd" fill="#C8BBA8" d="M-12 0 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0 M-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 Z" />
          {teeth.map((deg) => (
            <rect key={deg} x={-3} y={-18} width={6} height={8} rx={1.5} fill="#C8BBA8" transform={`rotate(${deg})`} />
          ))}
        </g>
      </g>
      <Sparkle x={216} y={112} s={0.8} delay={0.2} fill="#F2B83A" />
      <Sparkle x={258} y={128} s={0.6} delay={0.9} fill="#F2B83A" />
      <Stage dur="2.4s" dy="-6px">
        <KipFigure mood="focus" hat="hardhat" rightWing="bell">
          <g transform="translate(188 122)">
            <g className="k-swing" style={kipVars({ '--a': '-22deg', '--b': '14deg', '--dur': '1.1s' }, '0px 24px')}>
              <rect x={-4} y={-6} width={8} height={32} rx={3} fill="#A89880" />
              <path fillRule="evenodd" fill="#A89880" d="M-11 -14 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 M-4.5 -14 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 Z" />
            </g>
          </g>
        </KipFigure>
      </Stage>
    </g>
  );
}
