/* MyRide — trip + account screens: TripProgress, Payment, RateTip, Profile, Activity, Wallet. */

function SheetGrip() {
  return <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.18)', margin: '0 auto 16px' }}/>;
}
function RoundBtn2({ children, style = {} }) {
  return (<button style={{ width: 48, height: 48, borderRadius: 16, cursor: 'pointer', background: 'rgba(20,20,22,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 10px 26px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>{children}</button>);
}

// ── TRIP IN PROGRESS ──────────────────────────────────────────
function ScreenTripProgress() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0E0E10', overflow: 'hidden' }}>
      <MapBg/>
      <div style={{ position: 'absolute', top: 300, left: 165 }}><VehiclePhoto w={76} style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }}/></div>
      <div style={{ position: 'absolute', top: 56, left: 16, right: 16, zIndex: 5, display: 'flex', justifyContent: 'center' }}>
        <Glass style={{ borderRadius: 99, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: '#3CCB7F', boxShadow: '0 0 10px #3CCB7F' }}/>
          <span style={{ color: BRAND.text, fontSize: 14, fontWeight: 700 }}>On trip · 14 min to airport</span>
        </Glass>
      </div>
      <Glass style={{ position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 32, padding: 20 }}>
        <SheetGrip/>
        {/* progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ color: BRAND.muted, fontSize: 12, fontWeight: 600 }}>Marina</span>
          <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, width: '62%', background: BRAND.yellow, borderRadius: 99 }}/>
          </div>
          <span style={{ color: BRAND.text, fontSize: 12, fontWeight: 700 }}>Airport</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name="MK" size={50} ring/>
          <div style={{ flex: 1 }}>
            <div style={{ color: BRAND.text, fontSize: 16, fontWeight: 700 }}>Marcus K.</div>
            <div style={{ color: BRAND.muted, fontSize: 13 }}>MV 88 · Twin Cab</div>
          </div>
          <button style={{ width: 48, height: 48, borderRadius: 15, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{AppIcon.phone(BRAND.text)}</button>
        </div>
        {/* fare + share */}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <div style={{ flex: 1, padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ color: BRAND.faint, fontSize: 11 }}>Fare</div>
            <div style={{ color: BRAND.text, fontSize: 16, fontWeight: 700 }}>$18.40</div>
          </div>
          <button style={{ flex: 1, padding: '12px 14px', borderRadius: 16, background: BRAND.yellowSoft, border: `1px solid ${BRAND.yellow}`, cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ color: BRAND.yellow, fontSize: 11, fontWeight: 600 }}>Safety</div>
            <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>Share trip</div>
          </button>
        </div>
      </Glass>
    </div>
  );
}

// ── PAYMENT / FARE SUMMARY ────────────────────────────────────
function ScreenPayment() {
  const rows = [
    { l: 'Base fare', v: '$6.00' },
    { l: 'Distance · 18.2 km', v: '$9.80' },
    { l: 'Time · 24 min', v: '$2.10' },
    { l: 'Airport surcharge', v: '$2.00' },
    { l: 'Promo · FIRST5', v: '−$1.50', g: true },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '56px 20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: BRAND.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 34px rgba(255,214,10,0.3)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="#0B0B0C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ color: BRAND.text, fontSize: 24, fontWeight: 700, letterSpacing: -0.6, marginTop: 16 }}>You’ve arrived</div>
        <div style={{ color: BRAND.muted, fontSize: 14, marginTop: 4 }}>International Airport · Terminal 3</div>
      </div>
      {/* fare card */}
      <div style={{ padding: '24px 16px 0' }}>
        <Glass style={{ borderRadius: 24, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ color: BRAND.muted, fontSize: 14 }}>Total fare</span>
            <span style={{ color: BRAND.text, fontSize: 30, fontWeight: 700, letterSpacing: -1 }}>$18.40</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                <span style={{ color: BRAND.muted }}>{r.l}</span>
                <span style={{ color: r.g ? '#3CCB7F' : BRAND.text, fontWeight: 600 }}>{r.v}</span>
              </div>
            ))}
          </div>
        </Glass>
      </div>
      {/* payment method */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{AppIcon.card()}</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 600 }}>Visa •••• 4429</div>
            <div style={{ color: BRAND.muted, fontSize: 12.5 }}>Charged automatically</div>
          </div>
          <span style={{ color: BRAND.yellow, fontSize: 13, fontWeight: 600 }}>Change</span>
        </div>
      </div>
      <div style={{ marginTop: 'auto', padding: '0 16px 40px' }}>
        <BigBtn>{AppIcon.arrow()} Continue to rate</BigBtn>
      </div>
    </div>
  );
}

// ── RATE & TIP ────────────────────────────────────────────────
function ScreenRateTip() {
  const [rating, setRating] = React.useState(5);
  const [tip, setTip] = React.useState(2);
  const tips = ['$0', '$2', '$5', '$10'];
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '64px 24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Avatar name="MK" size={88} ring/>
        <div style={{ color: BRAND.text, fontSize: 23, fontWeight: 700, letterSpacing: -0.5, marginTop: 18 }}>How was your trip?</div>
        <div style={{ color: BRAND.muted, fontSize: 14, marginTop: 4 }}>with Marcus K. · MV 88 (Twin Cab)</div>
        {/* stars */}
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setRating(n)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, transform: n <= rating ? 'scale(1.05)' : 'scale(1)', transition: 'transform .15s' }}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill={n <= rating ? BRAND.yellow : 'none'}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.9 6.6 20l1-6.1L3.2 9.5l6.1-.9L12 3z" stroke={n <= rating ? BRAND.yellow : 'rgba(255,255,255,0.25)'} strokeWidth="1.5" strokeLinejoin="round"/></svg>
            </button>
          ))}
        </div>
        <div style={{ color: BRAND.yellow, fontSize: 14, fontWeight: 700, marginTop: 12 }}>{['', 'Poor', 'Okay', 'Good', 'Great', 'Excellent!'][rating]}</div>
      </div>
      {/* tip */}
      <div style={{ padding: '28px 16px 0' }}>
        <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>Add a tip for Marcus</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {tips.map((t, i) => {
            const on = tip === i;
            return (
              <button key={i} onClick={() => setTip(i)} style={{
                flex: 1, height: 56, borderRadius: 18, cursor: 'pointer', fontSize: 16, fontWeight: 700,
                background: on ? BRAND.yellow : 'rgba(255,255,255,0.04)',
                color: on ? '#0B0B0C' : BRAND.text,
                border: `1.5px solid ${on ? BRAND.yellow : 'rgba(255,255,255,0.10)'}`,
              }}>{t}</button>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 'auto', padding: '0 16px 40px' }}>
        <BigBtn>Submit {tips[tip] !== '$0' ? `· ${tips[tip]} tip` : ''}</BigBtn>
      </div>
    </div>
  );
}

// ── PROFILE ───────────────────────────────────────────────────
function ScreenProfile() {
  const items = [
    { ic: AppIcon.card(BRAND.text), t: 'Payment methods', s: '2 cards · MyRide Pay' },
    { ic: AppIcon.clock(BRAND.text), t: 'Trip history', s: '142 rides' },
    { ic: AppIcon.gift(BRAND.text), t: 'Promotions', s: '$5.00 credit available' },
    { ic: AppIcon.shield(BRAND.text), t: 'Safety', s: 'Trusted contacts, SOS' },
    { ic: AppIcon.settings(BRAND.text), t: 'Settings', s: 'Notifications, language' },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '56px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: BRAND.text, fontSize: 22, fontWeight: 700 }}>Account</span>
        <RoundBtn2 style={{ position: 'static', boxShadow: 'none', width: 44, height: 44 }}>{AppIcon.settings()}</RoundBtn2>
      </div>
      {/* profile card */}
      <div style={{ padding: '20px 16px 0' }}>
        <Glass style={{ borderRadius: 26, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar name="AL" size={64} ring/>
          <div style={{ flex: 1 }}>
            <div style={{ color: BRAND.text, fontSize: 19, fontWeight: 700 }}>Alex Lawson</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: BRAND.muted, fontSize: 13, marginTop: 2 }}>{AppIcon.star(true)} 4.92 rider rating</div>
          </div>
          <div style={{ padding: '6px 12px', borderRadius: 99, background: BRAND.yellow, color: '#0B0B0C', fontSize: 12, fontWeight: 700 }}>GOLD</div>
        </Glass>
      </div>
      {/* menu */}
      <div style={{ padding: '14px 16px 0' }}>
        <Glass blur={0} bg="rgba(255,255,255,0.03)" style={{ borderRadius: 22, padding: '4px 16px', boxShadow: 'none' }}>
          {items.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 0', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{r.ic}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 600 }}>{r.t}</div>
                <div style={{ color: BRAND.muted, fontSize: 12.5 }}>{r.s}</div>
              </div>
              {AppIcon.chev()}
            </div>
          ))}
        </Glass>
      </div>
      <TabBar active="account"/>
    </div>
  );
}

// ── SETTINGS (dark theme, notifications, logout) ────────────
function ScreenSettings() {
  const [dark, setDark] = React.useState(true);
  const [push, setPush] = React.useState(true);
  const [rideUpd, setRideUpd] = React.useState(true);
  const [promo, setPromo] = React.useState(false);
  const Row = ({ icon, t, s, right, last }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 0', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 600 }}>{t}</div>
        {s && <div style={{ color: BRAND.muted, fontSize: 12.5 }}>{s}</div>}
      </div>
      {right}
    </div>
  );
  const Section = ({ title, children }) => (
    <div style={{ padding: '0 16px', marginTop: 18 }}>
      <div style={{ color: BRAND.faint, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '0 4px 8px' }}>{title}</div>
      <Glass blur={0} bg="rgba(255,255,255,0.03)" style={{ borderRadius: 22, padding: '4px 16px', boxShadow: 'none' }}>{children}</Glass>
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '56px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{AppIcon.back()}</button>
        <span style={{ color: BRAND.text, fontSize: 18, fontWeight: 700 }}>Settings</span>
      </div>

      <Section title="Appearance">
        <Row icon={AppIcon.moon(BRAND.yellow)} t="Dark theme" s={dark ? 'On · easier on the eyes at night' : 'Off · light interface'} right={<Toggle on={dark} onChange={setDark}/>}/>
        <Row icon={AppIcon.globe(BRAND.text)} t="Language" s="English (UK)" right={AppIcon.chev()} last/>
      </Section>

      <Section title="Notifications">
        <Row icon={AppIcon.bell(BRAND.text)} t="Push notifications" s="Allow MyRide to notify you" right={<Toggle on={push} onChange={setPush}/>}/>
        <Row icon={AppIcon.calendar(BRAND.text)} t="Ride & schedule updates" s="Driver, ETA, bus & dhoni times" right={<Toggle on={rideUpd} onChange={setRideUpd}/>}/>
        <Row icon={AppIcon.gift(BRAND.text)} t="Promotions" s="Offers and staff perks" right={<Toggle on={promo} onChange={setPromo}/>} last/>
      </Section>

      <Section title="Account">
        <Row icon={AppIcon.user(BRAND.text)} t="Edit profile" s="Name, photo, staff ID" right={AppIcon.chev()}/>
        <Row icon={AppIcon.shield(BRAND.text)} t="Privacy & security" s="Face ID, trusted contacts" right={AppIcon.chev()} last/>
      </Section>

      <div style={{ padding: '22px 16px 8px' }}>
        <button style={{ width: '100%', height: 56, borderRadius: 18, cursor: 'pointer', background: 'rgba(255,90,95,0.12)', border: '1px solid rgba(255,90,95,0.4)', color: '#FF8A8A', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>{AppIcon.logout('#FF8A8A')} Log out</button>
      </div>
      <div style={{ textAlign: 'center', color: BRAND.faint, fontSize: 11.5, padding: '4px 0 32px' }}>MyRide for Staff · v2.4.0</div>
    </div>
  );
}

// ── LOG OUT confirmation ───────────────────────────
function ScreenLogout() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, overflow: 'hidden' }}>
      {/* dimmed account behind */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.4, filter: 'blur(2px)' }}><ScreenProfile/></div>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }}/>
      {/* confirm sheet */}
      <Glass style={{ position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 32, padding: 24 }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(255,90,95,0.14)', border: '1px solid rgba(255,90,95,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>{AppIcon.logout('#FF8A8A')}</div>
        <div style={{ color: BRAND.text, fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>Log out of MyRide?</div>
        <div style={{ color: BRAND.muted, fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>You’ll need your staff ID and a verification code to sign back in.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
          <button style={{ height: 56, borderRadius: 18, cursor: 'pointer', background: '#FF5A5F', border: 'none', color: '#fff', fontSize: 16, fontWeight: 700 }}>Log out</button>
          <button style={{ height: 56, borderRadius: 18, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: BRAND.text, fontSize: 15, fontWeight: 600 }}>Cancel</button>
        </div>
      </Glass>
    </div>
  );
}

// ── ACTIVITY / HISTORY ────────────────────────────────────────
function ScreenActivity() {
  const trips = [
    { to: 'International Airport · T3', d: 'Today · 12:34', p: '$18.40', ic: AppIcon.loc() },
    { to: 'One Central Tower', d: 'Yesterday · 08:10', p: '$9.20', ic: AppIcon.work(BRAND.text) },
    { to: 'Marina Walk, Block C', d: 'Mon · 19:42', p: '$11.60', ic: AppIcon.home(BRAND.text) },
    { to: 'City Mall · North Gate', d: 'Sun · 15:20', p: '$7.80', ic: AppIcon.loc(BRAND.muted) },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '56px 20px 0' }}>
        <span style={{ color: BRAND.text, fontSize: 22, fontWeight: 700 }}>Your trips</span>
      </div>
      {/* summary */}
      <div style={{ padding: '18px 16px 0', display: 'flex', gap: 10 }}>
        {[{ k: 'This month', v: '14' }, { k: 'Spent', v: '$182' }, { k: 'Saved', v: '$24' }].map((s, i) => (
          <Glass key={i} style={{ flex: 1, borderRadius: 20, padding: '14px 16px' }}>
            <div style={{ color: BRAND.faint, fontSize: 11 }}>{s.k}</div>
            <div style={{ color: BRAND.text, fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>{s.v}</div>
          </Glass>
        ))}
      </div>
      {/* list */}
      <div style={{ padding: '18px 16px 0' }}>
        <Glass blur={0} bg="rgba(255,255,255,0.03)" style={{ borderRadius: 22, padding: '4px 16px', boxShadow: 'none' }}>
          {trips.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 0', borderBottom: i < trips.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{t.ic}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: BRAND.text, fontSize: 14.5, fontWeight: 600 }}>{t.to}</div>
                <div style={{ color: BRAND.muted, fontSize: 12.5 }}>{t.d}</div>
              </div>
              <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 700 }}>{t.p}</div>
            </div>
          ))}
        </Glass>
      </div>
      <TabBar active="trips"/>
    </div>
  );
}

// ── WALLET ────────────────────────────────────────────────────
function ScreenWallet() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '56px 20px 0' }}>
        <span style={{ color: BRAND.text, fontSize: 22, fontWeight: 700 }}>Wallet</span>
      </div>
      {/* balance card */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ position: 'relative', borderRadius: 28, padding: 22, overflow: 'hidden', background: 'linear-gradient(135deg, #FFD60A, #F5C400)', boxShadow: '0 18px 50px rgba(255,214,10,0.28)' }}>
          <div style={{ position: 'absolute', top: -30, right: -20, width: 140, height: 140, borderRadius: 99, background: 'rgba(255,255,255,0.18)' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
            <BrandMark size={30} color="#0B0B0C" checker={false}/>
            <span style={{ color: 'rgba(11,11,12,0.6)', fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>MYRIDE PAY</span>
          </div>
          <div style={{ color: 'rgba(11,11,12,0.65)', fontSize: 12, fontWeight: 600, marginTop: 26 }}>Available balance</div>
          <div style={{ color: '#0B0B0C', fontSize: 38, fontWeight: 700, letterSpacing: -1.5 }}>$120.50</div>
        </div>
      </div>
      {/* add money */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 10 }}>
        <BigBtn style={{ height: 52 }}>{AppIcon.plus()} Add money</BigBtn>
        <BigBtn kind="ghost" style={{ height: 52, width: 'auto', padding: '0 22px' }}>{AppIcon.gift(BRAND.text)} Redeem</BigBtn>
      </div>
      {/* methods */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ color: BRAND.muted, fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 4 }}>Payment methods</div>
        <Glass blur={0} bg="rgba(255,255,255,0.03)" style={{ borderRadius: 22, padding: '4px 16px', boxShadow: 'none' }}>
          {[
            { ic: AppIcon.card(BRAND.text), t: 'Visa •••• 4429', s: 'Default', def: true },
            { ic: AppIcon.card(BRAND.text), t: 'Mastercard •••• 8810', s: 'Expires 04/27' },
            { ic: AppIcon.cash(BRAND.text), t: 'Cash', s: 'Pay driver directly' },
          ].map((r, i, a) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 0', borderBottom: i < a.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{r.ic}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 600 }}>{r.t}</div>
                <div style={{ color: BRAND.muted, fontSize: 12.5 }}>{r.s}</div>
              </div>
              {r.def && <span style={{ padding: '4px 10px', borderRadius: 99, background: BRAND.yellowSoft, color: BRAND.yellow, fontSize: 11, fontWeight: 700 }}>Default</span>}
            </div>
          ))}
        </Glass>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenTripProgress, ScreenPayment, ScreenRateTip, ScreenProfile, ScreenActivity, ScreenWallet, ScreenSettings, ScreenLogout });
