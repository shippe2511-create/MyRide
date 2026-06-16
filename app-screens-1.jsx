/* MyRide — booking flow screens: Home, Search, ChooseRide, Finding, Tracking.
   Relies on BRAND, BrandMark, TaxiGlyph (screens.jsx) + Glass, MapBg, AppIcon, Avatar, BigBtn (app-shared.jsx). */

// Top floating header used over maps
function MapHeader({ left, right }) {
  return (
    <div style={{
      position: 'absolute', top: 56, left: 16, right: 16, zIndex: 5,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>{left}{right}</div>
  );
}
function RoundBtn({ children, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      width: 48, height: 48, borderRadius: 16, cursor: 'pointer',
      background: 'rgba(20,20,22,0.72)', backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: '0 10px 26px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
    }}>{children}</button>
  );
}

// ── HOME / MAP ────────────────────────────────────────────────
function ScreenHome() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0E0E10', overflow: 'hidden' }}>
      <MapBg route={false}/>
      {/* vehicle markers */}
      <div style={{ position: 'absolute', top: 300, left: 110 }}><VehiclePhoto w={68} style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }}/></div>
      <div style={{ position: 'absolute', top: 430, left: 236 }}><VehiclePhoto w={58} style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }}/></div>
      <div style={{ position: 'absolute', top: 246, left: 250 }}><VehiclePhoto w={52} style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }}/></div>
      {/* you-pin */}
      <div style={{ position: 'absolute', top: 388, left: '50%', transform: 'translateX(-50%)' }}>
        <div style={{ width: 18, height: 18, borderRadius: 99, background: BRAND.yellow, boxShadow: `0 0 0 8px ${BRAND.yellowSoft}` }}/>
      </div>

      <MapHeader
        left={<RoundBtn>{AppIcon.menu()}</RoundBtn>}
        right={
          <div style={{ display: 'flex', gap: 10 }}>
            <RoundBtn>{AppIcon.gift()}</RoundBtn>
            <RoundBtn><Avatar name="AL" size={30}/></RoundBtn>
          </div>
        }
      />

      {/* bottom sheet */}
      <Glass style={{
        position: 'absolute', left: 8, right: 8, bottom: 84,
        borderRadius: 32, padding: 18,
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.18)', margin: '0 auto 16px' }}/>
        <div style={{ color: BRAND.text, fontSize: 22, fontWeight: 700, letterSpacing: -0.5, marginBottom: 14 }}>Where to?</div>
        {/* search field */}
        <div style={{
          height: 56, borderRadius: 18, background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center',
          gap: 12, padding: '0 16px', marginBottom: 12,
        }}>
          {AppIcon.search(BRAND.muted)}
          <span style={{ color: BRAND.muted, fontSize: 15 }}>Search destination</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, color: BRAND.yellow, fontSize: 13, fontWeight: 600 }}>
            {AppIcon.clock(BRAND.yellow)}
          </div>
        </div>
        {/* saved shortcuts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { ic: AppIcon.home(BRAND.text), t: 'Home', s: '21 Marina Walk, Block C' },
            { ic: AppIcon.work(BRAND.text), t: 'Work', s: 'One Central Tower, 14F' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 4px', borderBottom: i === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.ic}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 600 }}>{r.t}</div>
                <div style={{ color: BRAND.muted, fontSize: 12.5 }}>{r.s}</div>
              </div>
              {AppIcon.chev()}
            </div>
          ))}
        </div>
      </Glass>
      <TabBar active="home"/>
    </div>
  );
}

// ── SEARCH DESTINATION ────────────────────────────────────────
function ScreenSearch() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: BRAND.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '56px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <RoundBtn style={{ position: 'static', boxShadow: 'none' }}>{AppIcon.back()}</RoundBtn>
        <span style={{ color: BRAND.text, fontSize: 18, fontWeight: 700 }}>Plan your ride</span>
      </div>
      {/* from/to stack */}
      <div style={{ padding: '20px 16px 0' }}>
        <Glass blur={0} bg="rgba(255,255,255,0.04)" style={{ borderRadius: 22, padding: '6px 16px', boxShadow: 'none' }}>
          {/* connector */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 18 }}>
              <span style={{ width: 11, height: 11, borderRadius: 99, background: BRAND.yellow }}/>
              <span style={{ flex: 1, width: 2, background: 'rgba(255,255,255,0.14)', margin: '4px 0' }}/>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: BRAND.text }}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ color: BRAND.faint, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Pickup</div>
                <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 600 }}>Current location · Marina Walk</div>
              </div>
              <div style={{ padding: '12px 0' }}>
                <div style={{ color: BRAND.faint, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Destination</div>
                <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                  Airport<span style={{ width: 2, height: 18, background: BRAND.yellow, marginLeft: 2, display: 'inline-block', animation: 'mrCaret 1s infinite' }}/>
                </div>
              </div>
            </div>
          </div>
        </Glass>
      </div>
      {/* results */}
      <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column' }}>
        {[
          { t: 'International Airport', s: 'Terminal 3 · 24 min away', ic: AppIcon.loc() },
          { t: 'Airport Metro Station', s: 'Red Line · 19 min away', ic: AppIcon.loc(BRAND.muted) },
          { t: 'Airport Free Zone', s: 'Logistics City · 28 min', ic: AppIcon.loc(BRAND.muted) },
          { t: 'Airport Plaza Hotel', s: 'Sheikh Rd · 22 min', ic: AppIcon.loc(BRAND.muted) },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{r.ic}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: BRAND.text, fontSize: 15, fontWeight: 600 }}>{r.t}</div>
              <div style={{ color: BRAND.muted, fontSize: 12.5 }}>{r.s}</div>
            </div>
          </div>
        ))}
      </div>
      {/* map pick */}
      <div style={{ marginTop: 'auto', padding: '0 16px 40px' }}>
        <BigBtn kind="ghost">{AppIcon.loc(BRAND.yellow)} Set location on map</BigBtn>
      </div>
    </div>
  );
}

// ── NEARBY VEHICLES (post-request) ────────────────────────────
// No manual cab-picking. The rider requests, and we show the
// twin-cabs nearby while the system auto-assigns the closest one.
function ScreenNearby() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0E0E10', overflow: 'hidden' }}>
      <MapBg route={false}/>
      {/* nearby vehicle markers around the rider */}
      <div style={{ position: 'absolute', top: 250, left: 96 }}><VehiclePhoto w={66} style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }}/></div>
      <div style={{ position: 'absolute', top: 188, left: 232 }}><VehiclePhoto w={56} style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }}/></div>
      <div style={{ position: 'absolute', top: 340, left: 244 }}><VehiclePhoto w={52} style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }}/></div>
      {/* you-pin */}
      <div style={{ position: 'absolute', top: 300, left: '50%', transform: 'translateX(-50%)' }}>
        <div style={{ width: 18, height: 18, borderRadius: 99, background: BRAND.yellow, boxShadow: `0 0 0 8px ${BRAND.yellowSoft}` }}/>
      </div>

      <MapHeader left={<RoundBtn>{AppIcon.back()}</RoundBtn>} right={<RoundBtn>{AppIcon.shield(BRAND.yellow)}</RoundBtn>}/>
      {/* count pill */}
      <div style={{ position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
        <Glass style={{ borderRadius: 99, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: BRAND.yellow, animation: 'mrPulse 1.3s infinite' }}/>
          <span style={{ color: BRAND.text, fontSize: 14, fontWeight: 700 }}>3 twin-cabs near you</span>
        </Glass>
      </div>

      <Glass style={{ position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 32, padding: 18 }}>
        <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.18)', margin: '0 auto 14px' }}/>
        <div style={{ color: BRAND.text, fontSize: 20, fontWeight: 700, letterSpacing: -0.4 }}>Vehicles near you</div>
        <div style={{ color: BRAND.muted, fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>No need to pick — request and we’ll assign the nearest available twin-cab, then track it live on the map.</div>

        {/* trip from / to summary */}
        <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: BRAND.yellow }}/>
            <span style={{ color: BRAND.text, fontSize: 13.5, fontWeight: 500 }}>Marina Walk, Block C</span>
          </div>
          <div style={{ height: 14, width: 2, background: 'rgba(255,255,255,0.14)', margin: '2px 0 2px 4px' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: BRAND.text }}/>
            <span style={{ color: BRAND.text, fontSize: 13.5, fontWeight: 500 }}>International Airport · T3</span>
          </div>
        </div>

        {/* staff row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px 14px', marginTop: 2 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{AppIcon.shield(BRAND.yellow)}</div>
          <span style={{ color: BRAND.text, fontSize: 14, fontWeight: 600 }}>Free · IT staff trip</span>
          <span style={{ marginLeft: 'auto', color: BRAND.muted, fontSize: 13 }}>Staff ID · AL-0093</span>
        </div>
        <BigBtn>Request nearest ride</BigBtn>
      </Glass>
    </div>
  );
}

// ── FINDING DRIVER ────────────────────────────────────────────
function ScreenFinding() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0E0E10', overflow: 'hidden' }}>
      <MapBg route={false}/>
      <MapHeader left={<RoundBtn>{AppIcon.back()}</RoundBtn>} right={null}/>
      {/* radar */}
      <div style={{ position: 'absolute', top: 250, left: '50%', transform: 'translateX(-50%)' }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            position: 'absolute', left: '50%', top: '50%', width: 60, height: 60, marginLeft: -30, marginTop: -30,
            borderRadius: 99, border: `2px solid ${BRAND.yellow}`,
            animation: `mrRadar 2.2s ${i * 0.7}s infinite ease-out`,
          }}/>
        ))}
        <div style={{ position: 'relative', width: 60, height: 60, borderRadius: 99, background: BRAND.yellow, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(255,214,10,0.4)' }}>
          <BrandMark size={34} checker={false}/>
        </div>
      </div>
      <Glass style={{ position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 32, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {[0, 1, 2].map(i => (<span key={i} style={{ width: 7, height: 7, borderRadius: 99, background: BRAND.yellow, animation: `mrPulse 1.2s ${i * 0.15}s infinite` }}/>))}
        </div>
        <div style={{ color: BRAND.text, fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>Finding your vehicle…</div>
        <div style={{ color: BRAND.muted, fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>Matching you with the nearest twin-cab in the fleet. This usually takes under a minute.</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <div style={{ flex: 1, padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ color: BRAND.faint, fontSize: 11 }}>Vehicle</div>
            <div style={{ color: BRAND.text, fontSize: 16, fontWeight: 700 }}>MV 88</div>
          </div>
          <div style={{ flex: 1, padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ color: BRAND.faint, fontSize: 11 }}>To</div>
            <div style={{ color: BRAND.text, fontSize: 16, fontWeight: 700 }}>Airport T3</div>
          </div>
        </div>
        <BigBtn kind="ghost" style={{ marginTop: 14, height: 52 }}>Cancel</BigBtn>
      </Glass>
    </div>
  );
}

// ── DRIVER ARRIVING / TRACKING ────────────────────────────────
function ScreenTracking() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0E0E10', overflow: 'hidden' }}>
      <MapBg/>
      {/* moving vehicle on route */}
      <div style={{ position: 'absolute', top: 356, left: 150 }}><VehiclePhoto w={76} style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.5)' }}/></div>
      <MapHeader left={<RoundBtn>{AppIcon.back()}</RoundBtn>} right={<RoundBtn>{AppIcon.shield(BRAND.yellow)}</RoundBtn>}/>
      {/* eta pill */}
      <div style={{ position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
        <Glass style={{ borderRadius: 99, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: BRAND.yellow, animation: 'mrPulse 1.3s infinite' }}/>
          <span style={{ color: BRAND.text, fontSize: 14, fontWeight: 700 }}>Arriving in 3 min</span>
        </Glass>
      </div>
      <Glass style={{ position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 32, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name="MK" size={56} ring/>
          <div style={{ flex: 1 }}>
            <div style={{ color: BRAND.text, fontSize: 17, fontWeight: 700 }}>Marcus K.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: BRAND.muted, fontSize: 13 }}>
              {AppIcon.star(true)} 4.96 · 2,140 trips
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: BRAND.text, fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>MV 88</div>
            <div style={{ color: BRAND.muted, fontSize: 12.5 }}>Twin Cab</div>
          </div>
        </div>
        {/* actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button style={{ flex: 1, height: 54, borderRadius: 18, border: 'none', cursor: 'pointer', background: BRAND.yellow, color: '#0B0B0C', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{AppIcon.chat()} Message</button>
          <button style={{ flex: 1, height: 54, borderRadius: 18, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: BRAND.text, fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{AppIcon.phone(BRAND.text)} Call</button>
        </div>
        {/* trip detail */}
        <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: BRAND.yellow }}/>
            <span style={{ color: BRAND.text, fontSize: 13.5, fontWeight: 500 }}>Marina Walk, Block C</span>
          </div>
          <div style={{ height: 14, width: 2, background: 'rgba(255,255,255,0.14)', margin: '2px 0 2px 4px' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: BRAND.text }}/>
            <span style={{ color: BRAND.text, fontSize: 13.5, fontWeight: 500 }}>International Airport · T3</span>
          </div>
        </div>
      </Glass>
    </div>
  );
}

Object.assign(window, { ScreenHome, ScreenSearch, ScreenNearby, ScreenFinding, ScreenTracking });
