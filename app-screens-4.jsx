/* MyRide — modern feature screens: Safety/SOS, Chat, Notifications, Schedule-ahead. */

function FeatHeader({ title, onBack = true }) {
  return (
    <div style={{ padding: '56px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
      {onBack && <button style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{AppIcon.back()}</button>}
      <span style={{ color: BRAND.text, fontSize: 18, fontWeight: 700 }}>{title}</span>
    </div>
  );
}

// ── SAFETY / SOS CENTER ───────────────────────────────────────
function ScreenSafety() {
  const [held, setHeld] = React.useState(false);
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <FeatHeader title="Safety Centre"/>
      <div style={{ padding: '18px 16px 0', color: BRAND.muted, fontSize: 13.5, lineHeight: 1.5 }}>
        You’re sharing this trip with Facilities. Use the tools below if anything feels off.
      </div>

      {/* SOS button */}
      <div style={{ padding: '24px 16px 0', display: 'flex', justifyContent: 'center' }}>
        <button
          onMouseDown={() => setHeld(true)} onMouseUp={() => setHeld(false)} onMouseLeave={() => setHeld(false)}
          style={{
            width: 168, height: 168, borderRadius: 99, cursor: 'pointer', border: 'none',
            background: held ? '#E5484D' : 'radial-gradient(circle at 50% 35%, #FF5A5F, #E5484D)',
            color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxShadow: held ? '0 0 0 18px rgba(229,72,77,0.18)' : '0 18px 50px rgba(229,72,77,0.4)',
            transition: 'box-shadow .2s, transform .1s', transform: held ? 'scale(0.97)' : 'scale(1)',
          }}>
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: 1 }}>SOS</span>
          <span style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>{held ? 'Release to cancel' : 'Hold for help'}</span>
        </button>
      </div>

      {/* tools */}
      <div style={{ padding: '26px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { ic: AppIcon.loc(BRAND.yellow), t: 'Share live location', s: 'Send your live trip to a contact' },
          { ic: AppIcon.user(BRAND.text), t: 'Trusted contacts', s: '2 people added' },
          { ic: AppIcon.shield(BRAND.text), t: 'Call Facilities desk', s: 'Internal staff support · 24/7' },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{r.ic}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 600 }}>{r.t}</div>
              <div style={{ color: BRAND.muted, fontSize: 12.5 }}>{r.s}</div>
            </div>
            {AppIcon.chev()}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── IN-APP CHAT ───────────────────────────────────────────────
function ScreenChat() {
  const msgs = [
    { me: false, t: 'On my way, I’m the yellow Camry near the lobby.', time: '12:31' },
    { me: true, t: 'Great, I’m waiting by the main entrance 👍', time: '12:31' },
    { me: false, t: 'Perfect, 2 minutes away.', time: '12:32' },
    { me: true, t: 'Thanks Marcus!', time: '12:32' },
  ];
  const quick = ['I’m here', 'Running late', 'Call me'];
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column' }}>
      {/* header w/ driver */}
      <div style={{ padding: '52px 16px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button style={{ width: 40, height: 40, borderRadius: 13, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{AppIcon.back()}</button>
        <Avatar name="MK" size={42} ring/>
        <div style={{ flex: 1 }}>
          <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 700 }}>Marcus K.</div>
          <div style={{ color: '#3CCB7F', fontSize: 12, fontWeight: 600 }}>● Arriving · 2 min</div>
        </div>
        <button style={{ width: 42, height: 42, borderRadius: 13, background: BRAND.yellow, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{AppIcon.phone('#0B0B0C')}</button>
      </div>

      {/* messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ textAlign: 'center', color: BRAND.faint, fontSize: 11, marginBottom: 4 }}>Today · trip to Airport T3</div>
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
            <div style={{
              padding: '11px 14px', fontSize: 14, lineHeight: 1.4,
              borderRadius: m.me ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: m.me ? BRAND.yellow : 'rgba(255,255,255,0.06)',
              color: m.me ? '#0B0B0C' : BRAND.text,
              border: m.me ? 'none' : '1px solid rgba(255,255,255,0.08)',
              fontWeight: m.me ? 600 : 500,
            }}>{m.t}</div>
            <div style={{ fontSize: 10.5, color: BRAND.faint, marginTop: 4, textAlign: m.me ? 'right' : 'left' }}>{m.time}</div>
          </div>
        ))}
      </div>

      {/* quick replies */}
      <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8 }}>
        {quick.map((q, i) => (
          <button key={i} style={{ padding: '8px 14px', borderRadius: 99, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: BRAND.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{q}</button>
        ))}
      </div>
      {/* composer */}
      <div style={{ padding: '0 16px 36px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1, height: 50, borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', padding: '0 16px', color: BRAND.muted, fontSize: 14 }}>Message…</div>
        <button style={{ width: 50, height: 50, borderRadius: 16, background: BRAND.yellow, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{AppIcon.arrow('#0B0B0C')}</button>
      </div>
    </div>
  );
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
function ScreenNotifications() {
  const groups = [
    { day: 'Today', items: [
      { ic: DhoniIconN(BRAND.yellow), t: 'Dhoni 9:00 AM confirmed', s: 'Seat 07 · Malé → Data Centre', time: '8m', unread: true },
      { ic: AppIcon.shield(BRAND.yellow), t: 'Trip shared with Facilities', s: 'Your live location is visible', time: '1h' },
    ]},
    { day: 'Earlier', items: [
      { ic: AppIcon.gift(BRAND.yellow), t: 'New staff route added', s: 'Express bus from Hulhumalé at 7:30 AM', time: '1d' },
      { ic: AppIcon.star(true), t: 'Rate your last trip', s: 'with Marcus K. · Yellow Camry', time: '2d' },
      { ic: AppIcon.clock(BRAND.yellow), t: 'Schedule updated', s: 'Lunch shuttle now departs 12:30 PM', time: '3d' },
    ]},
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '56px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: BRAND.text, fontSize: 22, fontWeight: 700 }}>Notifications</span>
        <span style={{ color: BRAND.yellow, fontSize: 13, fontWeight: 600 }}>Mark all read</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 24px' }}>
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 18 }}>
            <div style={{ color: BRAND.faint, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '0 4px 10px' }}>{g.day}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.items.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', borderRadius: 20, background: r.unread ? BRAND.yellowSoft : 'rgba(255,255,255,0.03)', border: `1px solid ${r.unread ? 'rgba(255,214,10,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{r.ic}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: BRAND.text, fontSize: 14.5, fontWeight: 600 }}>{r.t}</div>
                    <div style={{ color: BRAND.muted, fontSize: 12.5 }}>{r.s}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <span style={{ color: BRAND.faint, fontSize: 11 }}>{r.time}</span>
                    {r.unread && <span style={{ width: 8, height: 8, borderRadius: 99, background: BRAND.yellow }}/>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function DhoniIconN(c) { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 15h18l-2 4H5l-2-4z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/><path d="M12 4v11M12 4l5 4-5 1" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/></svg>); }

// ── SCHEDULE-AHEAD (pre-book) ─────────────────────────────────
function ScreenScheduleAhead() {
  const [day, setDay] = React.useState(2);
  const [slot, setSlot] = React.useState('08:00');
  const days = [['Thu', '29'], ['Fri', '30'], ['Sat', '31'], ['Sun', '01'], ['Mon', '02']];
  const slots = ['07:30', '08:00', '08:30', '09:00', '17:30', '18:00'];
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <FeatHeader title="Schedule a ride"/>
      <div style={{ padding: '16px 16px 0', color: BRAND.muted, fontSize: 13.5, lineHeight: 1.5 }}>
        Pre-book up to 7 days ahead. We’ll hold a car and remind you 15 minutes before.
      </div>

      {/* route card */}
      <div style={{ padding: '18px 16px 0' }}>
        <Glass blur={0} bg="rgba(255,255,255,0.04)" style={{ borderRadius: 20, padding: '4px 16px', boxShadow: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ width: 11, height: 11, borderRadius: 99, background: BRAND.yellow }}/>
            <div style={{ flex: 1 }}><div style={{ color: BRAND.faint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pickup</div><div style={{ color: BRAND.text, fontSize: 14.5, fontWeight: 600 }}>Staff Housing · Hulhumalé</div></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0' }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: BRAND.text }}/>
            <div style={{ flex: 1 }}><div style={{ color: BRAND.faint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Destination</div><div style={{ color: BRAND.text, fontSize: 14.5, fontWeight: 600 }}>IT Office · Tower 2</div></div>
          </div>
        </Glass>
      </div>

      {/* day strip */}
      <div style={{ padding: '18px 0 0' }}>
        <div style={{ padding: '0 16px 10px', color: BRAND.faint, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Pick a day</div>
        <div style={{ display: 'flex', gap: 8, padding: '0 16px', overflowX: 'auto' }}>
          {days.map((d, i) => {
            const on = day === i;
            return (
              <button key={i} onClick={() => setDay(i)} style={{ flex: '0 0 auto', width: 58, padding: '12px 0', borderRadius: 16, cursor: 'pointer', textAlign: 'center', background: on ? BRAND.yellow : 'rgba(255,255,255,0.04)', border: `1.5px solid ${on ? BRAND.yellow : 'rgba(255,255,255,0.10)'}` }}>
                <div style={{ color: on ? 'rgba(11,11,12,0.6)' : BRAND.muted, fontSize: 11, fontWeight: 600 }}>{d[0]}</div>
                <div style={{ color: on ? '#0B0B0C' : BRAND.text, fontSize: 19, fontWeight: 700, marginTop: 2 }}>{d[1]}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* time slots */}
      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ color: BRAND.faint, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', paddingBottom: 10 }}>Pick a time</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {slots.map(s => {
            const on = slot === s;
            return (
              <button key={s} onClick={() => setSlot(s)} style={{ height: 50, borderRadius: 14, cursor: 'pointer', fontSize: 15, fontWeight: 700, background: on ? BRAND.yellow : 'rgba(255,255,255,0.04)', color: on ? '#0B0B0C' : BRAND.text, border: `1.5px solid ${on ? BRAND.yellow : 'rgba(255,255,255,0.10)'}` }}>{s}</button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '0 16px 40px' }}>
        <BigBtn>{AppIcon.clock('#0B0B0C')} Schedule for {days[day][0]} {slot}</BigBtn>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenSafety, ScreenChat, ScreenNotifications, ScreenScheduleAhead });
