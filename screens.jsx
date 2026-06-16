/* MyRide — taxi booking screens (original design)
   3 variations each of Splash, Welcome, Login.
   All variations share the brand system below. */

// ─────────────────────────────────────────────────────────────
// Brand tokens
// ─────────────────────────────────────────────────────────────
const BRAND = {
  bg:      '#0B0B0C',
  bg2:     '#141416',
  surface: '#1B1B1F',
  hair:    'rgba(255,255,255,0.08)',
  text:    '#FAFAFA',
  muted:   'rgba(250,250,250,0.55)',
  faint:   'rgba(250,250,250,0.35)',
  yellow:  '#FFD60A',          // primary taxi yellow
  yellow2: '#F5C400',          // deeper, for pressed/contrast
  yellowSoft: 'rgba(255,214,10,0.12)',
};

// ─────────────────────────────────────────────────────────────
// Brand mark — geometric "M" with taxi checker corner
// ─────────────────────────────────────────────────────────────
function BrandMark({ size = 56, color = BRAND.yellow, checker = true }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" style={{ display: 'block' }}>
      {/* rounded square plate */}
      <rect x="2" y="2" width="60" height="60" rx="18" fill={color}/>
      {/* M strokes — three diagonal bars */}
      <path d="M14 46 L14 22 L22 22 L32 36 L42 22 L50 22 L50 46 L43 46 L43 32 L34 44 L30 44 L21 32 L21 46 Z"
            fill="#0B0B0C"/>
      {/* tiny taxi-checker stripe in corner */}
      {checker && (
        <g>
          <rect x="46" y="46" width="4" height="4" fill="#0B0B0C"/>
          <rect x="50" y="50" width="4" height="4" fill="#0B0B0C"/>
          <rect x="54" y="46" width="4" height="4" fill="#0B0B0C"/>
          <rect x="50" y="46" width="4" height="4" fill="#FFD60A"/>
          <rect x="46" y="50" width="4" height="4" fill="#FFD60A"/>
          <rect x="54" y="50" width="4" height="4" fill="#FFD60A"/>
        </g>
      )}
    </svg>
  );
}

// Simple taxi side-view glyph
function TaxiGlyph({ w = 120, fill = BRAND.yellow }) {
  return (
    <svg width={w} height={w * 0.55} viewBox="0 0 220 120" style={{ display: 'block' }}>
      {/* body */}
      <path d="M10 78 L26 50 Q34 38 50 36 L150 36 Q164 36 174 46 L200 70 Q210 72 210 82 L210 92 Q210 96 206 96 L188 96 A14 14 0 0 0 160 96 L92 96 A14 14 0 0 0 64 96 L14 96 Q10 96 10 92 Z" fill={fill}/>
      {/* windows */}
      <path d="M60 50 L84 50 L84 70 L46 70 Z" fill="#0B0B0C"/>
      <path d="M92 50 L148 50 L168 70 L92 70 Z" fill="#0B0B0C"/>
      <rect x="86" y="50" width="4" height="20" fill={fill}/>
      {/* taxi sign on roof */}
      <rect x="92" y="22" width="40" height="14" rx="3" fill="#0B0B0C"/>
      <text x="112" y="33" textAnchor="middle" fontSize="10" fontWeight="700" fill={fill} fontFamily="ui-monospace, monospace">TAXI</text>
      {/* checker stripe */}
      <g>
        <rect x="14" y="80" width="8" height="6" fill="#0B0B0C"/>
        <rect x="22" y="80" width="8" height="6" fill={fill}/>
        <rect x="30" y="80" width="8" height="6" fill="#0B0B0C"/>
        <rect x="38" y="80" width="8" height="6" fill={fill}/>
        <rect x="46" y="80" width="8" height="6" fill="#0B0B0C"/>
      </g>
      {/* wheels */}
      <circle cx="78" cy="98" r="12" fill="#0B0B0C"/>
      <circle cx="78" cy="98" r="5" fill="#1B1B1F"/>
      <circle cx="174" cy="98" r="12" fill="#0B0B0C"/>
      <circle cx="174" cy="98" r="5" fill="#1B1B1F"/>
      {/* headlight */}
      <rect x="196" y="78" width="10" height="4" rx="1" fill="#0B0B0C"/>
    </svg>
  );
}

// Decorative checker stripe band
function CheckerBand({ rows = 1, cells = 18, size = 10, color1 = BRAND.yellow, color2 = '#0B0B0C' }) {
  const cells2 = Array.from({ length: cells });
  const rows2 = Array.from({ length: rows });
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows2.map((_, r) => (
        <div key={r} style={{ display: 'flex' }}>
          {cells2.map((__, c) => (
            <div key={c} style={{
              width: size, height: size,
              background: (r + c) % 2 === 0 ? color1 : color2,
            }}/>
          ))}
        </div>
      ))}
    </div>
  );
}

// Tiny generic icons used in screens
const Icon = {
  phone: (c = BRAND.text) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" stroke={c} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  ),
  mail: (c = BRAND.text) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke={c} strokeWidth="1.6"/>
      <path d="M4 7l8 6 8-6" stroke={c} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  ),
  apple: (c = BRAND.text) => (
    <svg width="18" height="20" viewBox="0 0 18 20" fill={c}>
      <path d="M13.6 10.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.7 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.5 3 2.4 1.2 0 1.6-.8 3-.8 1.4 0 1.8.8 3.1.7 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.6-1-2.6-4z M11.6 3.5c.6-.8 1-1.8.9-2.8-.9 0-2 .6-2.6 1.3-.6.7-1.1 1.7-1 2.7 1 .1 2-.4 2.7-1.2z"/>
    </svg>
  ),
  google: () => (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22 12.2c0-.8-.1-1.4-.2-2H12v3.8h5.6c-.2 1.3-1 2.3-2.1 3l3.3 2.5c2-1.8 3.2-4.5 3.2-7.3z" fill="#4285F4"/>
      <path d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.3-2.5c-.9.6-2.1 1-3.6 1-2.8 0-5.1-1.9-5.9-4.4H2.7v2.6A10 10 0 0012 22z" fill="#34A853"/>
      <path d="M6.1 13.6a6 6 0 010-3.8V7.2H2.7a10 10 0 000 9l3.4-2.6z" fill="#FBBC05"/>
      <path d="M12 5.9c1.6 0 3 .5 4 1.5l3-2.9A10 10 0 002.7 7.2L6.1 9.8C7 7.4 9.3 5.9 12 5.9z" fill="#EA4335"/>
    </svg>
  ),
  eye: (c = BRAND.muted, open = true) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke={c} strokeWidth="1.6"/>
      <circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.6"/>
      {!open && <path d="M4 4l16 16" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>}
    </svg>
  ),
  arrow: (c = '#0B0B0C') => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14m-6-6l6 6-6 6" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  dot: (c = BRAND.yellow) => <span style={{ width: 6, height: 6, borderRadius: 99, background: c, display: 'inline-block' }}/>,
  face: (c = BRAND.text) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="9" cy="11" r="1" fill={c}/>
      <circle cx="15" cy="11" r="1" fill={c}/>
      <path d="M9 15c1 .8 4 .8 6 0" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────
// SPLASH — variation A : Big monogram, full bleed yellow corner shape
// ─────────────────────────────────────────────────────────────
function SplashA() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, overflow: 'hidden' }}>
      {/* yellow geometric accent */}
      <div style={{
        position: 'absolute', top: -80, right: -120, width: 360, height: 360,
        background: BRAND.yellow, borderRadius: '50% 50% 12% 50%',
        filter: 'blur(0px)', opacity: 0.95,
      }}/>
      <div style={{
        position: 'absolute', top: -40, right: -60, width: 240, height: 240,
        background: BRAND.bg, borderRadius: '50%',
      }}/>
      {/* checker stripe at bottom */}
      <div style={{ position: 'absolute', bottom: 120, left: 0, right: 0 }}>
        <CheckerBand cells={40} size={10}/>
      </div>
      {/* center brand */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 18,
      }}>
        <BrandMark size={88}/>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ color: BRAND.text, fontSize: 38, fontWeight: 700, letterSpacing: -1.2 }}>MyRide</div>
          <div style={{ color: BRAND.muted, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}>Premium · On Demand</div>
        </div>
      </div>
      {/* loading pulse */}
      <div style={{
        position: 'absolute', bottom: 64, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 6,
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: 99, background: BRAND.yellow,
            opacity: 0.4, animation: `mrPulse 1.2s ${i * 0.15}s infinite ease-in-out`,
          }}/>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SPLASH — variation B : Taxi over city silhouette
// ─────────────────────────────────────────────────────────────
function SplashB() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, overflow: 'hidden' }}>
      {/* gradient sky */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(120% 60% at 50% 100%, rgba(255,214,10,0.18), transparent 60%), linear-gradient(180deg, #0B0B0C 0%, #111114 100%)',
      }}/>
      {/* city silhouette */}
      <svg viewBox="0 0 400 140" style={{ position: 'absolute', bottom: 140, left: 0, right: 0, width: '100%' }}>
        <g fill="#1B1B1F">
          <rect x="0" y="80" width="40" height="60"/>
          <rect x="42" y="50" width="28" height="90"/>
          <rect x="72" y="70" width="22" height="70"/>
          <rect x="96" y="30" width="38" height="110"/>
          <rect x="136" y="60" width="26" height="80"/>
          <rect x="164" y="20" width="42" height="120"/>
          <rect x="208" y="50" width="34" height="90"/>
          <rect x="244" y="40" width="28" height="100"/>
          <rect x="274" y="70" width="24" height="70"/>
          <rect x="300" y="35" width="36" height="105"/>
          <rect x="338" y="65" width="26" height="75"/>
          <rect x="366" y="55" width="34" height="85"/>
        </g>
        {/* tiny windows */}
        <g fill={BRAND.yellow} opacity="0.65">
          <rect x="50" y="64" width="3" height="3"/><rect x="58" y="64" width="3" height="3"/>
          <rect x="104" y="44" width="3" height="3"/><rect x="112" y="44" width="3" height="3"/><rect x="120" y="44" width="3" height="3"/>
          <rect x="172" y="34" width="3" height="3"/><rect x="180" y="34" width="3" height="3"/><rect x="190" y="34" width="3" height="3"/>
          <rect x="216" y="64" width="3" height="3"/><rect x="226" y="64" width="3" height="3"/>
          <rect x="252" y="54" width="3" height="3"/><rect x="260" y="54" width="3" height="3"/>
          <rect x="308" y="49" width="3" height="3"/><rect x="318" y="49" width="3" height="3"/>
          <rect x="376" y="69" width="3" height="3"/><rect x="384" y="69" width="3" height="3"/>
        </g>
      </svg>
      {/* road line */}
      <div style={{
        position: 'absolute', bottom: 116, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(255,214,10,0.5) 50%, transparent)',
      }}/>
      {/* taxi sliding */}
      <div style={{
        position: 'absolute', bottom: 122, left: '50%', transform: 'translateX(-50%)',
        animation: 'mrSlide 1.8s ease-out',
      }}>
        <TaxiGlyph w={150}/>
      </div>
      {/* logo top center */}
      <div style={{
        position: 'absolute', top: 220, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <BrandMark size={64}/>
        <div style={{
          color: BRAND.text, fontSize: 42, fontWeight: 700,
          letterSpacing: -1.4, fontFamily: 'inherit',
        }}>MyRide</div>
        <div style={{
          padding: '6px 12px', borderRadius: 99,
          border: `1px solid ${BRAND.hair}`, color: BRAND.muted,
          fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase',
        }}>Your city, on the meter</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SPLASH — variation C : Ultra minimal — checker monogram only
// ─────────────────────────────────────────────────────────────
function SplashC() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.yellow, overflow: 'hidden' }}>
      {/* subtle radial */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(80% 60% at 50% 40%, rgba(255,255,255,0.18), transparent 60%)',
      }}/>
      {/* huge inverted M */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        gap: 24,
      }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <rect x="0" y="0" width="64" height="64" fill="none"/>
          <path d="M8 50 L8 14 L20 14 L32 32 L44 14 L56 14 L56 50 L46 50 L46 26 L34 44 L30 44 L18 26 L18 50 Z" fill="#0B0B0C"/>
        </svg>
        <div style={{
          color: '#0B0B0C', fontSize: 14, fontWeight: 700,
          letterSpacing: 6, textTransform: 'uppercase',
        }}>M Y R I D E</div>
      </div>
      {/* bottom checker */}
      <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <CheckerBand cells={6} rows={2} size={14} color1="#0B0B0C" color2={BRAND.yellow}/>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WELCOME — variation A : Photo hero + CTA stack
// ─────────────────────────────────────────────────────────────
function WelcomeA() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column' }}>
      {/* hero placeholder image — striped */}
      <div style={{
        margin: '54px 16px 0', height: 380, borderRadius: 28,
        background: `
          repeating-linear-gradient(135deg, #18181C 0 14px, #1B1B1F 14px 28px),
          #1B1B1F
        `,
        border: `1px solid ${BRAND.hair}`,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* placeholder label */}
        <div style={{
          position: 'absolute', top: 14, left: 14,
          padding: '4px 8px', borderRadius: 6,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
          color: BRAND.muted, fontSize: 10, fontFamily: 'ui-monospace, monospace',
          letterSpacing: 0.5,
        }}>HERO / nightlife cab</div>
        {/* vehicle on top of image */}
        <div style={{ position: 'absolute', bottom: 44, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
          <VehiclePhoto w={240} style={{ boxShadow: '0 18px 40px rgba(0,0,0,0.5)' }}/>
        </div>
        {/* brand chip */}
        <div style={{
          position: 'absolute', top: 14, right: 14,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px 6px 6px', borderRadius: 99,
          background: 'rgba(255,214,10,0.95)',
        }}>
          <BrandMark size={20} checker={false}/>
          <span style={{ color: '#0B0B0C', fontWeight: 700, fontSize: 12, letterSpacing: 0.2 }}>MyRide</span>
        </div>
      </div>
      {/* copy */}
      <div style={{ padding: '28px 24px 0' }}>
        <h1 style={{
          margin: 0, color: BRAND.text, fontSize: 32, fontWeight: 700,
          letterSpacing: -1, lineHeight: 1.1, textWrap: 'pretty',
        }}>The city in<br/>a yellow tap.</h1>
        <p style={{
          margin: '12px 0 0', color: BRAND.muted, fontSize: 15,
          lineHeight: 1.5, textWrap: 'pretty',
        }}>Book a taxi in seconds, track every meter,<br/>and pay without ever opening your wallet.</p>
      </div>
      {/* CTA stack */}
      <div style={{ marginTop: 'auto', padding: '0 16px 48px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button style={{
          height: 56, borderRadius: 18, border: 'none',
          background: BRAND.yellow, color: '#0B0B0C',
          fontSize: 16, fontWeight: 700, letterSpacing: 0.1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          Get started {Icon.arrow('#0B0B0C')}
        </button>
        <button style={{
          height: 56, borderRadius: 18,
          background: 'transparent', color: BRAND.text,
          border: `1px solid ${BRAND.hair}`, fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}>
          I already have an account
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WELCOME — variation B : Onboarding carousel (interactive)
// ─────────────────────────────────────────────────────────────
function WelcomeB() {
  const [step, setStep] = React.useState(0);
  const slides = [
    {
      title: 'Hail a ride\nin three taps',
      body: 'Pick where you are. Pick where you’re headed. We do the rest — no calls, no haggling.',
      art: 'cards',
    },
    {
      title: 'Watch the meter\nbefore you go',
      body: 'See the fare estimate up front, including airport surcharges and night premiums.',
      art: 'meter',
    },
    {
      title: 'Pay without\ntouching your wallet',
      body: 'Apple Pay, card, or in-app credit. Tip your driver in one tap when the ride ends.',
      art: 'wallet',
    },
  ];
  const s = slides[step];

  const Art = () => (
    <div style={{
      height: 280, margin: '12px 16px 0', borderRadius: 28,
      background: BRAND.surface, border: `1px solid ${BRAND.hair}`,
      position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {s.art === 'cards' && (
        <div style={{ position: 'relative', width: 260, height: 200 }}>
          <div style={{
            position: 'absolute', left: 14, top: 24, width: 200, height: 90, borderRadius: 18,
            background: BRAND.bg2, border: `1px solid ${BRAND.hair}`,
            padding: 14, transform: 'rotate(-4deg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: BRAND.muted, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: BRAND.yellow }}/>
              Pickup
            </div>
            <div style={{ color: BRAND.text, fontSize: 14, fontWeight: 600, marginTop: 6 }}>Wynwood, Block 23</div>
          </div>
          <div style={{
            position: 'absolute', right: 14, bottom: 0, width: 200, height: 90, borderRadius: 18,
            background: BRAND.yellow, padding: 14, transform: 'rotate(3deg)',
            boxShadow: '0 18px 40px rgba(255,214,10,0.18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(11,11,12,0.6)', fontSize: 11, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#0B0B0C' }}/>
              Dropoff
            </div>
            <div style={{ color: '#0B0B0C', fontSize: 14, fontWeight: 700, marginTop: 6 }}>MIA Airport · Terminal D</div>
          </div>
        </div>
      )}
      {s.art === 'meter' && (
        <div style={{
          width: 220, height: 220, borderRadius: '50%',
          background: `conic-gradient(${BRAND.yellow} 0% 72%, ${BRAND.surface} 72% 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 60px rgba(255,214,10,0.18)',
        }}>
          <div style={{
            width: 168, height: 168, borderRadius: '50%', background: BRAND.bg,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${BRAND.hair}`,
          }}>
            <div style={{ color: BRAND.muted, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' }}>Est. fare</div>
            <div style={{ color: BRAND.text, fontSize: 38, fontWeight: 700, letterSpacing: -1 }}>$18.40</div>
            <div style={{ color: BRAND.yellow, fontSize: 11, fontWeight: 600, marginTop: 2 }}>locked in</div>
          </div>
        </div>
      )}
      {s.art === 'wallet' && (
        <div style={{ position: 'relative', width: 240, height: 200 }}>
          <div style={{
            position: 'absolute', inset: '20px 12px 30px',
            borderRadius: 18, background: BRAND.bg2, border: `1px solid ${BRAND.hair}`,
            padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <BrandMark size={28} checker={false}/>
              <div style={{ color: BRAND.muted, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>MyRide Pay</div>
            </div>
            <div>
              <div style={{ color: BRAND.faint, fontSize: 10, letterSpacing: 2 }}>•••• 4429</div>
              <div style={{ color: BRAND.text, fontSize: 22, fontWeight: 700, marginTop: 2 }}>$120.50</div>
            </div>
          </div>
          <div style={{
            position: 'absolute', right: 0, top: 0, padding: '8px 12px',
            borderRadius: 99, background: BRAND.yellow, color: '#0B0B0C',
            fontWeight: 700, fontSize: 12, boxShadow: '0 10px 24px rgba(255,214,10,0.3)',
          }}>+ tip 15%</div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '54px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BrandMark size={26} checker={false}/>
          <span style={{ color: BRAND.text, fontSize: 15, fontWeight: 700 }}>MyRide</span>
        </div>
        <button onClick={() => setStep(2)} style={{
          background: 'transparent', border: 'none', color: BRAND.muted,
          fontSize: 14, fontWeight: 500, cursor: 'pointer',
        }}>Skip</button>
      </div>
      <Art/>
      {/* progress + copy */}
      <div style={{ padding: '26px 24px 0' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => setStep(i)} style={{
              flex: i === step ? 2 : 1, height: 4, borderRadius: 99,
              background: i === step ? BRAND.yellow : BRAND.hair,
              border: 'none', cursor: 'pointer', transition: 'flex .25s',
            }}/>
          ))}
        </div>
        <h1 style={{
          margin: '20px 0 0', color: BRAND.text, fontSize: 28, fontWeight: 700,
          letterSpacing: -0.8, lineHeight: 1.15, whiteSpace: 'pre-line',
        }}>{s.title}</h1>
        <p style={{
          margin: '10px 0 0', color: BRAND.muted, fontSize: 14,
          lineHeight: 1.5, textWrap: 'pretty',
        }}>{s.body}</p>
      </div>
      <div style={{ marginTop: 'auto', padding: '0 16px 48px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          style={{
            height: 56, width: 56, borderRadius: 18,
            background: BRAND.surface, color: BRAND.text, border: `1px solid ${BRAND.hair}`,
            cursor: step === 0 ? 'default' : 'pointer', opacity: step === 0 ? 0.4 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          onClick={() => setStep(Math.min(2, step + 1))}
          style={{
            flex: 1, height: 56, borderRadius: 18, border: 'none',
            background: BRAND.yellow, color: '#0B0B0C',
            fontSize: 16, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {step === 2 ? 'Create account' : 'Next'} {Icon.arrow('#0B0B0C')}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WELCOME — variation C : Map background + frosted CTA card
// ─────────────────────────────────────────────────────────────
function WelcomeC() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0E0E10', overflow: 'hidden' }}>
      {/* faux dark map */}
      <svg viewBox="0 0 400 880" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect width="400" height="880" fill="#0E0E10"/>
        {/* grid blocks */}
        <g stroke="#1B1B1F" strokeWidth="1" fill="none">
          {Array.from({ length: 18 }).map((_, i) => (<line key={'h'+i} x1="-20" y1={i * 60} x2="420" y2={i * 60 - 60}/>))}
          {Array.from({ length: 12 }).map((_, i) => (<line key={'v'+i} x1={i * 40} y1="-20" x2={i * 40 + 40} y2="900"/>))}
        </g>
        {/* main roads */}
        <path d="M-20 320 L 420 270" stroke="#26262B" strokeWidth="14" fill="none"/>
        <path d="M-20 320 L 420 270" stroke="#3A3A40" strokeWidth="2" fill="none" strokeDasharray="6 8"/>
        <path d="M180 -20 L 240 900" stroke="#26262B" strokeWidth="14" fill="none"/>
        <path d="M180 -20 L 240 900" stroke="#3A3A40" strokeWidth="2" fill="none" strokeDasharray="6 8"/>
        {/* park */}
        <rect x="20" y="500" width="120" height="140" rx="14" fill="#15201A"/>
        <rect x="20" y="500" width="120" height="140" rx="14" fill="none" stroke="#1F3327" strokeWidth="1"/>
        {/* water */}
        <path d="M260 600 Q 340 640 420 600 L 420 760 Q 340 740 260 760 Z" fill="#0F1A26"/>
        {/* route highlight */}
        <path d="M80 700 C 160 620 200 520 220 340 S 320 180 360 120" stroke={BRAND.yellow} strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="2 6"/>
        {/* pickup pin */}
        <g transform="translate(80,700)">
          <circle r="14" fill={BRAND.yellow} opacity="0.25"/>
          <circle r="7" fill={BRAND.yellow}/>
          <circle r="3" fill="#0B0B0C"/>
        </g>
        {/* drop pin */}
        <g transform="translate(360,120)">
          <rect x="-9" y="-9" width="18" height="18" rx="4" fill={BRAND.yellow}/>
          <rect x="-4" y="-4" width="8" height="8" fill="#0B0B0C"/>
        </g>
      </svg>
      {/* top brand */}
      <div style={{
        position: 'absolute', top: 60, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8,
      }}>
        <BrandMark size={26} checker={false}/>
        <span style={{ color: BRAND.text, fontWeight: 700, letterSpacing: -0.2 }}>MyRide</span>
      </div>
      {/* frosted card */}
      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 28,
        borderRadius: 28, padding: 22,
        background: 'rgba(20,20,22,0.78)', backdropFilter: 'blur(24px) saturate(160%)',
        border: `1px solid ${BRAND.hair}`,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          borderRadius: 99, background: BRAND.yellowSoft, color: BRAND.yellow,
          fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: BRAND.yellow }}/>
          24 drivers near you
        </div>
        <h1 style={{
          margin: '14px 0 0', color: BRAND.text, fontSize: 30, fontWeight: 700,
          letterSpacing: -1, lineHeight: 1.1,
        }}>Welcome to the<br/>fastest cab in town.</h1>
        <p style={{
          margin: '8px 0 18px', color: BRAND.muted, fontSize: 13,
          lineHeight: 1.5,
        }}>Sign in to book your first ride — new riders get $5 off the first three trips.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{
            flex: 1, height: 52, borderRadius: 16, border: 'none',
            background: BRAND.yellow, color: '#0B0B0C',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>Continue</button>
          <button style={{
            height: 52, padding: '0 18px', borderRadius: 16,
            background: 'transparent', color: BRAND.text,
            border: `1px solid ${BRAND.hair}`, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Sign in</button>
        </div>
        <div style={{
          marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BRAND.hair}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: BRAND.faint, fontSize: 11,
        }}>
          <span>By continuing you agree to our Terms</span>
          <span style={{ color: BRAND.muted }}>EN ▾</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN — variation A : Phone + OTP-ready (with country picker)
// ─────────────────────────────────────────────────────────────
function LoginA() {
  const [num, setNum] = React.useState('552 014 ');
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column' }}>
      {/* top bar */}
      <div style={{
        padding: '54px 16px 0', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button style={{
          width: 40, height: 40, borderRadius: 14, border: `1px solid ${BRAND.hair}`,
          background: BRAND.surface, color: BRAND.text, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      <div style={{ padding: '32px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <BrandMark size={36}/>
          <span style={{ color: BRAND.muted, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase' }}>Sign in</span>
        </div>
        <h1 style={{
          margin: 0, color: BRAND.text, fontSize: 30, fontWeight: 700,
          letterSpacing: -1, lineHeight: 1.1,
        }}>Enter your<br/>phone number</h1>
        <p style={{ margin: '8px 0 0', color: BRAND.muted, fontSize: 14, lineHeight: 1.5 }}>
          We’ll text you a code to verify. Standard rates apply.
        </p>
      </div>
      {/* phone field */}
      <div style={{ padding: '28px 16px 0' }}>
        <div style={{
          height: 64, borderRadius: 20, background: BRAND.surface,
          border: `1px solid ${BRAND.hair}`, display: 'flex',
          alignItems: 'stretch', overflow: 'hidden',
        }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 0 16px',
            background: 'transparent', border: 'none', borderRight: `1px solid ${BRAND.hair}`,
            color: BRAND.text, fontSize: 16, fontWeight: 600, cursor: 'pointer',
          }}>
            🇦🇪 <span style={{ color: BRAND.muted, fontWeight: 500 }}>+971</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke={BRAND.muted} strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <input
            value={num}
            onChange={e => setNum(e.target.value)}
            placeholder="50 123 4567"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: BRAND.text, fontSize: 18, fontWeight: 600, letterSpacing: 0.5,
              padding: '0 16px',
            }}/>
        </div>
        {/* helper */}
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 12,
          background: BRAND.yellowSoft, color: BRAND.yellow,
          fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: BRAND.yellow }}/>
          Make sure your number can receive SMS
        </div>
      </div>
      {/* divider + socials */}
      <div style={{ padding: '28px 24px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: BRAND.hair }}/>
        <span style={{ color: BRAND.faint, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>or continue with</span>
        <div style={{ flex: 1, height: 1, background: BRAND.hair }}/>
      </div>
      <div style={{ padding: '16px 16px 0', display: 'flex', gap: 10 }}>
        {[
          { id: 'apple', el: Icon.apple() },
          { id: 'google', el: Icon.google() },
          { id: 'mail', el: Icon.mail() },
        ].map(s => (
          <button key={s.id} style={{
            flex: 1, height: 52, borderRadius: 16, background: BRAND.surface,
            border: `1px solid ${BRAND.hair}`, color: BRAND.text, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{s.el}</button>
        ))}
      </div>
      {/* primary */}
      <div style={{ marginTop: 'auto', padding: '0 16px 44px' }}>
        <button style={{
          height: 56, width: '100%', borderRadius: 18, border: 'none',
          background: BRAND.yellow, color: '#0B0B0C',
          fontSize: 16, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          Send code {Icon.arrow('#0B0B0C')}
        </button>
        <p style={{
          margin: '12px 0 0', textAlign: 'center',
          color: BRAND.faint, fontSize: 12,
        }}>
          New to MyRide? <span style={{ color: BRAND.yellow, fontWeight: 600 }}>Create an account</span>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN — variation B : Email + password, social-first
// ─────────────────────────────────────────────────────────────
function LoginB() {
  const [showPw, setShowPw] = React.useState(false);
  const [email, setEmail] = React.useState('alex@myride.co');
  const [pw, setPw] = React.useState('riderider');
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column' }}>
      {/* yellow header band */}
      <div style={{
        position: 'relative', padding: '54px 24px 36px',
        background: BRAND.yellow, borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
        overflow: 'hidden',
      }}>
        {/* checker accent */}
        <div style={{ position: 'absolute', top: 0, right: 0 }}>
          <CheckerBand cells={5} rows={3} size={10} color1="#0B0B0C" color2={BRAND.yellow}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <BrandMark size={28} color="#0B0B0C" checker={false}/>
          <span style={{ color: '#0B0B0C', fontWeight: 700, letterSpacing: -0.2 }}>MyRide</span>
        </div>
        <h1 style={{
          margin: '24px 0 0', color: '#0B0B0C', fontSize: 32, fontWeight: 700,
          letterSpacing: -1, lineHeight: 1.05,
        }}>Welcome back.<br/>Ready to roll?</h1>
        <p style={{ margin: '6px 0 0', color: 'rgba(11,11,12,0.65)', fontSize: 13, fontWeight: 500 }}>
          Sign in to keep your rides, cards and points.
        </p>
      </div>
      {/* socials row */}
      <div style={{ padding: '24px 16px 0', display: 'flex', gap: 10 }}>
        <button style={{
          flex: 1, height: 52, borderRadius: 16, background: '#fff', color: '#0B0B0C',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontWeight: 600, fontSize: 14,
        }}>{Icon.apple('#0B0B0C')} Apple</button>
        <button style={{
          flex: 1, height: 52, borderRadius: 16, background: BRAND.surface, color: BRAND.text,
          border: `1px solid ${BRAND.hair}`, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontWeight: 600, fontSize: 14,
        }}>{Icon.google()} Google</button>
      </div>
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: BRAND.hair }}/>
        <span style={{ color: BRAND.faint, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>or email</span>
        <div style={{ flex: 1, height: 1, background: BRAND.hair }}/>
      </div>
      {/* email + pw */}
      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          height: 60, borderRadius: 18, background: BRAND.surface,
          border: `1px solid ${BRAND.hair}`, padding: '0 16px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {Icon.mail(BRAND.muted)}
          <div style={{ flex: 1 }}>
            <div style={{ color: BRAND.faint, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Email</div>
            <input
              value={email} onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%', background: 'transparent', border: 'none', outline: 'none',
                color: BRAND.text, fontSize: 15, fontWeight: 600, padding: '2px 0 0',
              }}/>
          </div>
        </div>
        <div style={{
          height: 60, borderRadius: 18, background: BRAND.surface,
          border: `1px solid ${BRAND.yellow}`, padding: '0 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: `0 0 0 4px ${BRAND.yellowSoft}`,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="10" width="16" height="11" rx="2.5" stroke={BRAND.yellow} strokeWidth="1.6"/>
            <path d="M8 10V7a4 4 0 018 0v3" stroke={BRAND.yellow} strokeWidth="1.6"/>
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ color: BRAND.faint, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Password</div>
            <input
              type={showPw ? 'text' : 'password'}
              value={pw} onChange={e => setPw(e.target.value)}
              style={{
                width: '100%', background: 'transparent', border: 'none', outline: 'none',
                color: BRAND.text, fontSize: 15, fontWeight: 600, padding: '2px 0 0',
                letterSpacing: showPw ? 0 : 2,
              }}/>
          </div>
          <button onClick={() => setShowPw(!showPw)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
          }}>{Icon.eye(BRAND.muted, showPw)}</button>
        </div>
      </div>
      <div style={{
        padding: '14px 24px 0', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: BRAND.muted, fontSize: 13 }}>
          <span style={{
            width: 18, height: 18, borderRadius: 6, background: BRAND.yellow,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5L20 7" stroke="#0B0B0C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          Remember me
        </label>
        <button style={{
          background: 'transparent', border: 'none', color: BRAND.yellow,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>Forgot?</button>
      </div>
      <div style={{ marginTop: 'auto', padding: '0 16px 44px' }}>
        <button style={{
          height: 56, width: '100%', borderRadius: 18, border: 'none',
          background: BRAND.yellow, color: '#0B0B0C',
          fontSize: 16, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          Sign in {Icon.arrow('#0B0B0C')}
        </button>
        <p style={{
          margin: '12px 0 0', textAlign: 'center',
          color: BRAND.faint, fontSize: 12,
        }}>
          Don’t have an account? <span style={{ color: BRAND.yellow, fontWeight: 600 }}>Create one</span>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN — variation C : OTP entry (post phone-number step)
// ─────────────────────────────────────────────────────────────
function LoginC() {
  const [code, setCode] = React.useState(['4', '8', '2', '', '', '']);
  const focused = code.findIndex(c => c === '');
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '54px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button style={{
          width: 40, height: 40, borderRadius: 14, border: `1px solid ${BRAND.hair}`,
          background: BRAND.surface, color: BRAND.text, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M14 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 99, background: BRAND.surface,
          border: `1px solid ${BRAND.hair}`,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: BRAND.yellow, animation: 'mrPulse 1.4s infinite' }}/>
          <span style={{ color: BRAND.muted, fontSize: 11, fontWeight: 600 }}>Verifying</span>
        </div>
      </div>
      <div style={{ padding: '36px 24px 0' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: BRAND.yellowSoft, border: `1px solid ${BRAND.yellow}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 22,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M3 7l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" stroke={BRAND.yellow} strokeWidth="1.6" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 style={{
          margin: 0, color: BRAND.text, fontSize: 30, fontWeight: 700,
          letterSpacing: -1, lineHeight: 1.1,
        }}>Check your<br/>messages</h1>
        <p style={{
          margin: '8px 0 0', color: BRAND.muted, fontSize: 14, lineHeight: 1.5,
        }}>
          We sent a 6-digit code to <span style={{ color: BRAND.text, fontWeight: 600 }}>+971 50 482 ••••</span>.
          <button style={{
            background: 'transparent', border: 'none', color: BRAND.yellow,
            fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0, marginLeft: 4,
          }}>Change</button>
        </p>
      </div>
      {/* OTP boxes */}
      <div style={{
        padding: '28px 16px 0', display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)', gap: 8,
      }}>
        {code.map((d, i) => {
          const isFocus = i === focused;
          const filled = d !== '';
          return (
            <div key={i} style={{
              height: 64, borderRadius: 16,
              background: filled ? BRAND.surface : BRAND.bg2,
              border: `1.5px solid ${isFocus ? BRAND.yellow : filled ? BRAND.hair : BRAND.hair}`,
              boxShadow: isFocus ? `0 0 0 4px ${BRAND.yellowSoft}` : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: BRAND.text, fontSize: 24, fontWeight: 700,
            }}>
              {d || (isFocus ? <span style={{ width: 2, height: 28, background: BRAND.yellow, animation: 'mrCaret 1s infinite' }}/> : '')}
            </div>
          );
        })}
      </div>
      <div style={{
        padding: '18px 24px 0', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: BRAND.muted, fontSize: 13 }}>Didn’t get a code?</span>
        <span style={{ color: BRAND.faint, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>Resend in 0:24</span>
      </div>
      {/* face id */}
      <div style={{ padding: '24px 16px 0' }}>
        <button style={{
          width: '100%', height: 56, borderRadius: 18,
          background: BRAND.surface, border: `1px solid ${BRAND.hair}`,
          color: BRAND.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          {Icon.face(BRAND.yellow)} Sign in with Face ID
        </button>
      </div>
      <div style={{ marginTop: 'auto', padding: '0 16px 44px' }}>
        <button style={{
          height: 56, width: '100%', borderRadius: 18, border: 'none',
          background: BRAND.yellow, color: '#0B0B0C',
          fontSize: 16, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          Verify and continue {Icon.arrow('#0B0B0C')}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Export to global scope (we have several Babel files)
// ─────────────────────────────────────────────────────────────
Object.assign(window, {
  BRAND, BrandMark, TaxiGlyph, CheckerBand, Icon,
  SplashA, SplashB, SplashC,
  WelcomeA, WelcomeB, WelcomeC,
  LoginA, LoginB, LoginC,
});
