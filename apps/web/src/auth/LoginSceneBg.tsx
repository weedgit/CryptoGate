/**
 * Soft gradient wave lines — decorative background for the login hero.
 */
const WAVES = [
  { d: "M-100 520 C 180 440, 360 620, 640 540 S 1080 420, 1300 500", w: 1.6, o: 0.9 },
  { d: "M-100 560 C 200 480, 380 660, 660 580 S 1100 460, 1300 545", w: 1.2, o: 0.7 },
  { d: "M-100 600 C 220 520, 400 700, 680 620 S 1120 500, 1300 590", w: 1, o: 0.55 },
  { d: "M-100 640 C 240 560, 420 740, 700 660 S 1140 540, 1300 635", w: 0.9, o: 0.42 },
  { d: "M-100 680 C 260 600, 440 780, 720 700 S 1160 580, 1300 680", w: 0.8, o: 0.32 },
  { d: "M-100 720 C 280 640, 460 820, 740 740 S 1180 620, 1300 725", w: 0.7, o: 0.24 },
  { d: "M-100 760 C 300 680, 480 860, 760 780 S 1200 660, 1300 770", w: 0.6, o: 0.18 },
];

export function LoginSceneBg() {
  return (
    <div className="login-scene login-scene--waves" aria-hidden>
      <div className="login-scene__glow" />
      <svg
        className="login-scene__waves"
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="login-wave-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--wave-a)" stopOpacity="0" />
            <stop offset="25%" stopColor="var(--wave-a)" />
            <stop offset="60%" stopColor="var(--wave-b)" />
            <stop offset="100%" stopColor="var(--wave-b)" stopOpacity="0" />
          </linearGradient>
          <filter id="login-wave-blur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <path
          className="login-scene__wave-halo"
          d={WAVES[0].d}
          stroke="url(#login-wave-grad)"
          strokeWidth={10}
          fill="none"
          filter="url(#login-wave-blur)"
        />
        {WAVES.map((wave, i) => (
          <path
            key={i}
            className="login-scene__wave"
            style={{ animationDelay: `${i * -1.4}s` }}
            d={wave.d}
            stroke="url(#login-wave-grad)"
            strokeWidth={wave.w}
            strokeOpacity={wave.o}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </svg>
    </div>
  );
}
