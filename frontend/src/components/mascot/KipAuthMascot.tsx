import { KipBell, KipFigure, KipStyles } from './Kip';

/** Kip for the sign-in and sign-up side panels. The float and shadow come from auth.css (.kipd-kip). */
export function KipAuthMascot() {
  return (
    <svg
      className="kipd-kip kip-svg"
      width="230"
      height="230"
      viewBox="-6 -6 212 212"
      fill="none"
      role="img"
      aria-label="Kip the bellhop owl"
    >
      <KipStyles />
      <KipFigure mood="happy" hat="bellhop" rightWing="bell">
        <g transform="translate(188 126)"><KipBell /></g>
      </KipFigure>
    </svg>
  );
}
