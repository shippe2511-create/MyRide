/* MyRide — shared app primitives: faux map, extended minimal icons, glass card.
   Relies on BRAND from screens.jsx (loaded first). */

// Glassmorphism surface
function Glass({ children, style = {}, blur = 24, bg = 'rgba(20,20,22,0.72)', soft = true }) {
  return (
    <div style={{
      background: bg,
      backdropFilter: `blur(${blur}px) saturate(160%)`,
      WebkitBackdropFilter: `blur(${blur}px) saturate(160%)`,
      border: `1px solid rgba(255,255,255,0.10)`,
      borderRadius: 28,
      boxShadow: soft ? '0 18px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
      ...style,
    }}>{children}</div>
  );
}

// Reusable dark faux-map background (SVG). Accepts a route flag.
function MapBg({ route = true, style = {} }) {
  return (
    <svg viewBox="0 0 400 880" preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }}>
      <rect width="400" height="880" fill="#0E0E10"/>
      {/* block grid */}
      <g stroke="#181A1E" strokeWidth="1" fill="none">
        {Array.from({ length: 20 }).map((_, i) => (<line key={'h'+i} x1="-20" y1={i*52} x2="420" y2={i*52 - 40}/>))}
        {Array.from({ length: 13 }).map((_, i) => (<line key={'v'+i} x1={i*36} y1="-20" x2={i*36 + 30} y2="900"/>))}
      </g>
      {/* roads */}
      <path d="M-20 300 L 420 250" stroke="#23252B" strokeWidth="16" fill="none"/>
      <path d="M150 -20 L 220 900" stroke="#23252B" strokeWidth="16" fill="none"/>
      <path d="M-20 620 L 420 660" stroke="#23252B" strokeWidth="12" fill="none"/>
      <path d="M150 -20 L 220 900" stroke="#34373F" strokeWidth="2" strokeDasharray="6 9" fill="none"/>
      {/* park + water */}
      <rect x="28" y="470" width="104" height="120" rx="14" fill="#14211A"/>
      <path d="M270 560 Q 350 600 420 560 L 420 720 Q 350 700 270 720 Z" fill="#0E1A28"/>
      {route && (
        <g>
          <path d="M96 690 C 150 600 175 470 200 330 S 300 170 350 120"
            stroke={BRAND.yellow} strokeWidth="5" fill="none" strokeLinecap="round"/>
          <g transform="translate(96,690)">
            <circle r="15" fill={BRAND.yellow} opacity="0.22"/>
            <circle r="7" fill={BRAND.yellow}/><circle r="3" fill="#0B0B0C"/>
          </g>
          <g transform="translate(350,120)">
            <rect x="-9" y="-9" width="18" height="18" rx="5" fill={BRAND.yellow}/>
            <rect x="-4" y="-4" width="8" height="8" fill="#0B0B0C"/>
          </g>
        </g>
      )}
    </svg>
  );
}

// Extended minimal icon set (1.6 stroke, currentColor-ish)
const AppIcon = {
  menu: (c = '#FAFAFA') => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h10" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>),
  back: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 6l-6 6 6 6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  search: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke={c} strokeWidth="1.8"/><path d="M20 20l-3.5-3.5" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>),
  pinDot: (c = BRAND.yellow) => (<span style={{ width: 12, height: 12, borderRadius: 99, background: c, display: 'inline-block', boxShadow: `0 0 0 4px ${BRAND.yellowSoft}` }}/>),
  pinSq: (c = BRAND.text) => (<span style={{ width: 12, height: 12, borderRadius: 3, background: c, display: 'inline-block' }}/>),
  home: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 11l8-6 8 6M6 10v9h12v-9" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  work: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="13" rx="2.5" stroke={c} strokeWidth="1.7"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" stroke={c} strokeWidth="1.7"/></svg>),
  star: (filled, c = BRAND.yellow) => (<svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? c : 'none'}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.9 6.6 20l1-6.1L3.2 9.5l6.1-.9L12 3z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/></svg>),
  clock: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke={c} strokeWidth="1.7"/><path d="M12 8v4l3 2" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  user: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={c} strokeWidth="1.7"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" stroke={c} strokeWidth="1.7" strokeLinecap="round"/></svg>),
  card: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke={c} strokeWidth="1.7"/><path d="M3 9h18" stroke={c} strokeWidth="1.7"/></svg>),
  cash: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="12" rx="2.5" stroke={c} strokeWidth="1.7"/><circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.7"/></svg>),
  chev: (c = BRAND.muted) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  phone: (c = '#0B0B0C') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/></svg>),
  chat: (c = '#0B0B0C') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H9l-4 3v-3a2 2 0 01-1-2V6z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/></svg>),
  shield: (c = BRAND.yellow) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/><path d="M9 12l2 2 4-4" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  plus: (c = '#0B0B0C') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>),
  gift: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="9" width="16" height="11" rx="2" stroke={c} strokeWidth="1.7"/><path d="M4 13h16M12 9v11M12 9c-2-4-6-3-6 0M12 9c2-4 6-3 6 0" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/></svg>),
  settings: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.7"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke={c} strokeWidth="1.6" strokeLinecap="round"/></svg>),
  loc: (c = BRAND.yellow) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/><circle cx="12" cy="10" r="2.4" stroke={c} strokeWidth="1.7"/></svg>),
  arrow: (c = '#0B0B0C') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6l6 6-6 6" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  calendar: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="16" rx="3" stroke={c} strokeWidth="1.7"/><path d="M4 9h16M8 3v4M16 3v4" stroke={c} strokeWidth="1.7" strokeLinecap="round"/></svg>),
  moon: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8 8 0 119.5 4a6.5 6.5 0 1010.5 10.5z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/></svg>),
  bell: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/><path d="M10 20a2 2 0 004 0" stroke={c} strokeWidth="1.7" strokeLinecap="round"/></svg>),
  globe: (c = '#FAFAFA') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke={c} strokeWidth="1.7"/><path d="M4 12h16M12 4c2.5 2 2.5 14 0 16M12 4c-2.5 2-2.5 14 0 16" stroke={c} strokeWidth="1.5"/></svg>),
  logout: (c = '#FF8A8A') => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M9 16l-4-4 4-4M5 12h11" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>),
};

// Avatar placeholder (initials)
function Avatar({ name = 'AL', size = 48, ring = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 99,
      background: 'linear-gradient(135deg, #2A2A30, #1B1B1F)',
      border: ring ? `2px solid ${BRAND.yellow}` : `1px solid rgba(255,255,255,0.10)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: BRAND.text, fontWeight: 700, fontSize: size * 0.34, letterSpacing: 0.3,
      flex: '0 0 auto',
    }}>{name}</div>
  );
}

// Large primary button
function BigBtn({ children, kind = 'primary', style = {}, ...rest }) {
  const isP = kind === 'primary';
  return (
    <button {...rest} style={{
      height: 58, width: '100%', borderRadius: 20, cursor: 'pointer',
      border: isP ? 'none' : '1px solid rgba(255,255,255,0.12)',
      background: isP ? BRAND.yellow : 'rgba(255,255,255,0.04)',
      color: isP ? '#0B0B0C' : BRAND.text,
      fontSize: 16, fontWeight: 700, letterSpacing: 0.1,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      boxShadow: isP ? '0 14px 34px rgba(255,214,10,0.28)' : 'none',
      ...style,
    }}>{children}</button>
  );
}

Object.assign(window, { Glass, MapBg, AppIcon, Avatar, BigBtn });

// Twin-cab (double-cab pickup) glyph — the MyRide staff fleet vehicle
function TwinCab({ w = 120, fill = BRAND.yellow }) {
  return (
    <svg width={w} height={w * 0.55} viewBox="0 0 220 120" style={{ display: 'block' }}>
      {/* cargo bed (rear, lower) */}
      <path d="M116 62 L206 62 Q210 62 210 66 L210 90 Q210 94 206 94 L116 94 Z" fill={fill}/>
      {/* bed wall lip */}
      <rect x="120" y="58" width="90" height="6" rx="2" fill={fill}/>
      {/* cab (front, taller, two doors) */}
      <path d="M12 94 L12 66 Q12 62 16 60 L30 42 Q34 36 44 36 L94 36 Q102 36 108 44 L118 62 L118 94 Z" fill={fill}/>
      {/* windscreen + two side windows */}
      <path d="M36 48 L58 48 L58 60 L28 60 Z" fill="#0B0B0C"/>
      <path d="M62 48 L92 48 L100 60 L62 60 Z" fill="#0B0B0C"/>
      {/* B-pillar between the twin-cab doors */}
      <rect x="58" y="48" width="4" height="12" fill={fill}/>
      {/* door handles hint */}
      <rect x="34" y="70" width="14" height="3" rx="1.5" fill="#0B0B0C" opacity="0.5"/>
      <rect x="72" y="70" width="14" height="3" rx="1.5" fill="#0B0B0C" opacity="0.5"/>
      {/* front bumper + headlight */}
      <rect x="10" y="84" width="6" height="8" rx="2" fill="#0B0B0C"/>
      <rect x="200" y="78" width="10" height="5" rx="1" fill="#0B0B0C" opacity="0.6"/>
      {/* wheels (arches under cab + bed) */}
      <circle cx="54" cy="96" r="14" fill="#0B0B0C"/>
      <circle cx="54" cy="96" r="6" fill="#1B1B1F"/>
      <circle cx="168" cy="96" r="14" fill="#0B0B0C"/>
      <circle cx="168" cy="96" r="6" fill="#1B1B1F"/>
    </svg>
  );
}
window.TwinCab = TwinCab;

// Real twin-cab (Hilux) photo — transparent, no background tile
function VehiclePhoto({ w = 110, style = {}, shadow = true }) {
  const h = Math.round(w / 1.86);
  return (
    <div style={{
      width: w, height: h, flex: '0 0 auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center', ...style, boxShadow: 'none',
    }}>
      <img src="assets/twincab.png" alt="Twin cab" style={{
        width: '100%', height: '100%', objectFit: 'contain', display: 'block',
        filter: shadow ? 'drop-shadow(0 6px 10px rgba(0,0,0,0.45))' : 'none',
      }}/>
    </div>
  );
}
window.VehiclePhoto = VehiclePhoto;

// Reusable iOS-style toggle switch
function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 52, height: 30, borderRadius: 99, border: 'none', cursor: 'pointer', flex: '0 0 auto',
      background: on ? BRAND.yellow : 'rgba(255,255,255,0.16)', position: 'relative', transition: 'background .2s',
    }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 25 : 3, width: 24, height: 24, borderRadius: 99, background: '#fff', transition: 'left .2s', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}/>
    </button>
  );
}
window.Toggle = Toggle;

// Bottom tab bar (Home · Trips · Schedule · Account)
function TabBar({ active = 'home' }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: AppIcon.home },
    { id: 'trips', label: 'Trips', icon: AppIcon.clock },
    { id: 'schedule', label: 'Schedule', icon: AppIcon.calendar },
    { id: 'account', label: 'Account', icon: AppIcon.user },
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20,
      background: 'rgba(15,15,17,0.88)', backdropFilter: 'blur(24px) saturate(160%)',
      WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      padding: '10px 12px 20px', display: 'flex', justifyContent: 'space-around',
    }}>
      {tabs.map(t => {
        const on = active === t.id;
        const c = on ? BRAND.yellow : 'rgba(250,250,250,0.5)';
        return (
          <button key={t.id} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1, padding: 0 }}>
            {t.icon(c)}
            <span style={{ color: c, fontSize: 11, fontWeight: on ? 700 : 600 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
window.TabBar = TabBar;
