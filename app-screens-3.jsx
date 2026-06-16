/* MyRide — Staff transport schedules: Bus & Dhoni timetables (free, internal IT staff). */

function ModeTab({ active, label, sub, icon, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '12px 14px', borderRadius: 18, cursor: 'pointer', textAlign: 'left',
      background: active ? BRAND.yellow : 'rgba(255,255,255,0.04)',
      border: `1.5px solid ${active ? BRAND.yellow : 'rgba(255,255,255,0.10)'}`,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, flex: '0 0 auto',
        background: active ? 'rgba(11,11,12,0.12)' : 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon(active ? '#0B0B0C' : BRAND.text)}</div>
      <div>
        <div style={{ color: active ? '#0B0B0C' : BRAND.text, fontSize: 15, fontWeight: 700 }}>{label}</div>
        <div style={{ color: active ? 'rgba(11,11,12,0.6)' : BRAND.muted, fontSize: 11.5 }}>{sub}</div>
      </div>
    </button>
  );
}

const BusIcon = (c = '#FAFAFA') => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="13" rx="3" stroke={c} strokeWidth="1.7"/><path d="M4 11h16" stroke={c} strokeWidth="1.7"/><circle cx="8" cy="20" r="1.6" fill={c}/><circle cx="16" cy="20" r="1.6" fill={c}/><path d="M7 17v2M17 17v2" stroke={c} strokeWidth="1.7" strokeLinecap="round"/></svg>);
const DhoniIcon = (c = '#FAFAFA') => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 15h18l-2 4H5l-2-4z" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/><path d="M12 4v11M12 4l5 4-5 1" stroke={c} strokeWidth="1.7" strokeLinejoin="round"/><path d="M3 19c1.5 1.2 3 1.2 4.5 0M9 19c1.5 1.2 3 1.2 4.5 0M15 19c1.5 1.2 3 1.2 4.5 0" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></svg>);

function ScheduleRow({ time, ampm, from, to, dur, seats, status }) {
  const full = seats === 0;
  const soon = status === 'now';
  const statusLabel = full ? 'Full' : soon ? 'Boarding' : 'On time';
  const statusColor = full ? '#FF8A8A' : soon ? BRAND.yellow : '#3CCB7F';
  return (
    <div style={{
      display: 'flex', gap: 14, padding: '16px', borderRadius: 20, alignItems: 'stretch',
      background: soon ? BRAND.yellowSoft : 'rgba(255,255,255,0.03)',
      border: `1px solid ${soon ? BRAND.yellow : 'rgba(255,255,255,0.08)'}`,
    }}>
      {/* time block */}
      <div style={{ width: 58, flex: '0 0 auto', textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: 22, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1 }}>{time}</div>
        <div style={{ color: BRAND.muted, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{ampm}</div>
      </div>
      {/* connector */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
        <span style={{ width: 9, height: 9, borderRadius: 99, background: BRAND.yellow }}/>
        <span style={{ flex: 1, width: 2, background: 'rgba(255,255,255,0.14)', margin: '3px 0' }}/>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: BRAND.text }}/>
      </div>
      {/* route */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: BRAND.text, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{from}</div>
        <div style={{ color: BRAND.faint, fontSize: 11, margin: '3px 0 6px' }}>{dur}</div>
        <div style={{ color: BRAND.text, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to}</div>
      </div>
      {/* status + capacity (info only) */}
      <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: statusColor }}/>
          <span style={{ color: statusColor, fontSize: 12, fontWeight: 700 }}>{statusLabel}</span>
        </div>
        <div style={{ color: BRAND.muted, fontSize: 12 }}>{full ? 'No seats' : `${seats} seats free`}</div>
      </div>
    </div>
  );
}

function ScreenSchedule() {
  const [mode, setMode] = React.useState('bus');
  const [day, setDay] = React.useState(1);
  const days = ['Mon 28', 'Today', 'Sat 30', 'Sun 31'];

  const busTrips = [
    { time: '7:30', ampm: 'AM', from: 'Staff Housing · Hulhumalé', to: 'IT Office · Tower 2', dur: '25 min · Express', seats: 12, status: 'next' },
    { time: '8:15', ampm: 'AM', from: 'Staff Housing · Hulhumalé', to: 'IT Office · Tower 2', dur: '30 min · All stops', seats: 4 },
    { time: '12:30', ampm: 'PM', from: 'IT Office · Tower 2', to: 'City Centre Lunch Hub', dur: '15 min', seats: 0 },
    { time: '5:45', ampm: 'PM', from: 'IT Office · Tower 2', to: 'Staff Housing · Hulhumalé', dur: '25 min · Express', seats: 18 },
  ];
  const dhoniTrips = [
    { time: '7:00', ampm: 'AM', from: 'Malé Jetty No. 3', to: 'Data Centre Island', dur: '20 min crossing', seats: 8, status: 'now' },
    { time: '9:00', ampm: 'AM', from: 'Malé Jetty No. 3', to: 'Data Centre Island', dur: '20 min crossing', seats: 2 },
    { time: '1:00', ampm: 'PM', from: 'Data Centre Island', to: 'Malé Jetty No. 3', dur: '20 min crossing', seats: 0 },
    { time: '6:00', ampm: 'PM', from: 'Data Centre Island', to: 'Malé Jetty No. 3', dur: '20 min crossing', seats: 14 },
  ];
  const trips = mode === 'bus' ? busTrips : dhoniTrips;

  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* header */}
      <div style={{ padding: '56px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: BRAND.text, fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>Staff Transport</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ padding: '3px 9px', borderRadius: 99, background: BRAND.yellowSoft, color: BRAND.yellow, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3 }}>IT STAFF · INFO ONLY</span>
          </div>
        </div>
        <button style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{AppIcon.clock()}</button>
      </div>

      {/* mode tabs */}
      <div style={{ padding: '18px 16px 0', display: 'flex', gap: 10 }}>
        <ModeTab active={mode === 'bus'} label="Bus" sub="Island shuttle" icon={BusIcon} onClick={() => setMode('bus')}/>
        <ModeTab active={mode === 'dhoni'} label="Dhoni" sub="Ferry crossing" icon={DhoniIcon} onClick={() => setMode('dhoni')}/>
      </div>

      {/* day picker */}
      <div style={{ padding: '16px 16px 0', display: 'flex', gap: 8 }}>
        {days.map((d, i) => {
          const on = day === i;
          return (
            <button key={i} onClick={() => setDay(i)} style={{
              flex: 1, padding: '10px 0', borderRadius: 14, cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: on ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: on ? BRAND.text : BRAND.muted,
              border: `1px solid ${on ? 'rgba(255,255,255,0.14)' : 'transparent'}`,
            }}>{d}</button>
          );
        })}
      </div>

      {/* next-departure banner */}
      <div style={{ padding: '16px 16px 0' }}>
        <Glass style={{ borderRadius: 20, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: BRAND.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
            {mode === 'bus' ? BusIcon('#0B0B0C') : DhoniIcon('#0B0B0C')}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: BRAND.muted, fontSize: 11.5, fontWeight: 600 }}>Next departure</div>
            <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 700 }}>{trips[0].time} {trips[0].ampm} · {mode === 'bus' ? 'Hulhumalé → Office' : 'Malé → Data Centre'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: BRAND.yellow, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{mode === 'bus' ? '08' : '12'}</div>
            <div style={{ color: BRAND.faint, fontSize: 10 }}>min</div>
          </div>
        </Glass>
      </div>

      {/* timetable list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 96px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {trips.map((t, i) => <ScheduleRow key={i} {...t}/>)}
        <div style={{ textAlign: 'center', color: BRAND.faint, fontSize: 11.5, padding: '6px 0 0' }}>
          Timetable set by Facilities · for information only · times subject to change
        </div>
      </div>
      <TabBar active="schedule"/>
    </div>
  );
}

// ── RESERVATION TICKET (free staff pass) ──────────────────────
function ScreenStaffPass() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '56px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button style={{ width: 44, height: 44, borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{AppIcon.back()}</button>
        <span style={{ color: BRAND.text, fontSize: 18, fontWeight: 700 }}>Your seat is booked</span>
      </div>

      {/* boarding pass */}
      <div style={{ padding: '22px 16px 0' }}>
        <div style={{ position: 'relative', borderRadius: 28, overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,0.45)' }}>
          {/* top yellow */}
          <div style={{ background: 'linear-gradient(135deg, #FFD60A, #F5C400)', padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BrandMark size={26} color="#0B0B0C" checker={false}/>
                <span style={{ color: '#0B0B0C', fontWeight: 700 }}>MyRide</span>
              </div>
              <span style={{ color: 'rgba(11,11,12,0.6)', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>STAFF PASS</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 18 }}>
              <div>
                <div style={{ color: 'rgba(11,11,12,0.6)', fontSize: 11, fontWeight: 600 }}>FROM</div>
                <div style={{ color: '#0B0B0C', fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>Malé Jetty 3</div>
              </div>
              {DhoniIcon('#0B0B0C')}
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'rgba(11,11,12,0.6)', fontSize: 11, fontWeight: 600 }}>TO</div>
                <div style={{ color: '#0B0B0C', fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>Data Centre</div>
              </div>
            </div>
          </div>
          {/* perforation */}
          <div style={{ position: 'relative', background: BRAND.surface, height: 0 }}>
            <div style={{ position: 'absolute', left: -10, top: -10, width: 20, height: 20, borderRadius: 99, background: BRAND.bg }}/>
            <div style={{ position: 'absolute', right: -10, top: -10, width: 20, height: 20, borderRadius: 99, background: BRAND.bg }}/>
          </div>
          {/* bottom */}
          <div style={{ background: BRAND.surface, padding: '24px 22px 22px', borderTop: '2px dashed rgba(255,255,255,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {[['Date', 'Today'], ['Depart', '9:00 AM'], ['Seat', '07']].map(([k, v], i) => (
                <div key={i}>
                  <div style={{ color: BRAND.faint, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ color: BRAND.text, fontSize: 16, fontWeight: 700, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
            {/* barcode */}
            <div style={{ display: 'flex', gap: 2, marginTop: 20, height: 54, alignItems: 'stretch' }}>
              {Array.from({ length: 48 }).map((_, i) => (
                <span key={i} style={{ flex: (i * 7) % 3 + 1, background: i % 2 ? 'transparent' : BRAND.text, borderRadius: 1 }}/>
              ))}
            </div>
            <div style={{ textAlign: 'center', color: BRAND.muted, fontSize: 12, fontWeight: 600, letterSpacing: 2, marginTop: 10 }}>MR · IT · 4471 · 0093</div>
          </div>
        </div>
      </div>

      {/* staff note */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 18, background: BRAND.yellowSoft, border: `1px solid ${BRAND.yellow}` }}>
          {AppIcon.shield(BRAND.yellow)}
          <span style={{ color: BRAND.text, fontSize: 13, lineHeight: 1.4 }}>Show this pass and your IT staff ID when boarding. No fare — rides are company-provided.</span>
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '0 16px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <BigBtn>Add to Wallet</BigBtn>
        <BigBtn kind="ghost" style={{ height: 52 }}>Cancel reservation</BigBtn>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenSchedule, ScreenStaffPass });
