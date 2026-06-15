import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabaseClient'

/* ----------------------------------------------------------------- helpers */
function AntGlyph() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="#3C4838" strokeWidth="2" strokeLinecap="round">
      <ellipse cx="32" cy="18" rx="6" ry="7" />
      <ellipse cx="32" cy="33" rx="5" ry="6" />
      <ellipse cx="32" cy="48" rx="7" ry="8" />
      <path d="M28 14c-3-3-6-4-9-3M36 14c3-3 6-4 9-3" />
      <path d="M27 31c-6 1-10 4-13 2M37 31c6 1 10 4 13 2M28 33c-7 3-11 8-14 7M36 33c7 3 11 8 14 7M29 46c-6 4-10 10-13 9M35 46c6 4 10 10 13 9" />
    </svg>
  )
}

// Deterministic catalog code from a listing's uuid (e.g. ANT-0432)
function catCode(id) {
  const hex = String(id).replace(/[^a-f0-9]/gi, '').slice(-4) || '0000'
  const n = (parseInt(hex, 16) % 9000) + 1000
  return 'ANT-' + n
}
const fmt = (n) => (Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(2))
const stageShort = (s) => (s ? s.replace(' (claustral)', '').replace(' (eggs/larvae)', '') : '—')

/* --------------------------------------------------------------------- app */
export default function App() {
  const [session, setSession] = useState(null)
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [genus, setGenus] = useState('All')

  const [detail, setDetail] = useState(null) // listing object or null
  const [showForm, setShowForm] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [mine, setMine] = useState(false) // filter: only my listings
  const [editing, setEditing] = useState(null) // listing being edited, or null

  // auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // load listings
  useEffect(() => {
    loadListings()
  }, [])

  async function loadListings() {
    setLoading(true)
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('Load failed:', error.message)
    else setListings(data || [])
    setLoading(false)
  }

  // close panels on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setDetail(null)
        setShowForm(false)
        setShowAuth(false)
        setEditing(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const genera = useMemo(() => {
    const set = new Set(listings.map((l) => l.genus).filter(Boolean))
    return ['All', ...Array.from(set).sort()]
  }, [listings])

  const mineActive = mine && !!session

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const uid = session?.user?.id
    return listings.filter((l) => {
      if (mineActive && l.user_id !== uid) return false
      if (genus !== 'All' && l.genus !== genus) return false
      if (!q) return true
      const hay = [l.genus, l.species, l.common, l.locality, l.keeper, (l.tags || []).join(' '), l.stage]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [listings, query, genus, mineActive, session])

  function handleListClick() {
    if (session) {
      setEditing(null)
      setShowForm(true)
    } else setShowAuth(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
  }

  async function deleteListing(l) {
    if (!window.confirm('Delete this listing permanently? This cannot be undone.')) return
    const { error } = await supabase.from('listings').delete().eq('id', l.id)
    if (error) {
      alert('Could not delete: ' + error.message)
      return
    }
    setDetail(null)
    await loadListings()
  }

  async function toggleSold(l) {
    const { error } = await supabase.from('listings').update({ sold: !l.sold }).eq('id', l.id)
    if (error) {
      alert('Could not update: ' + error.message)
      return
    }
    const updated = { ...l, sold: !l.sold }
    setDetail((d) => (d && d.id === l.id ? updated : d))
    await loadListings()
  }

  function editListing(l) {
    setDetail(null)
    setEditing(l)
    setShowForm(true)
  }

  return (
    <>
      <header>
        <div className="bar" />
        <div className="head-in">
          <div>
            <div className="wordmark">
              <h1>Ant Sale International</h1>
              <span className="tag">Ant&nbsp;·&nbsp;Marketplace</span>
            </div>
            <p className="sub">
              Browse ant queens, colonies and equipment from across the world! This is a free-to-use ant
              marketplace created by @antsgreece. It's still in development, so please be careful of scammers
              and frauds — purchase from sellers at your own risk. Donations are welcome and necessary to keep
              the page running.{' '}
              <a className="donate" href="https://www.paypal.com/paypalme/antsgreece" target="_blank" rel="noopener noreferrer">
                Donate via PayPal →
              </a>{' '}
              <span className="donate-url">https://www.paypal.com/paypalme/antsgreece</span>
            </p>
          </div>
          <div className="head-right">
            <div className="authbar">
              {session ? (
                <>
                  <span>
                    Signed in as <strong>{session.user.email}</strong>
                  </span>
                  <button className="link" onClick={() => supabase.auth.signOut()}>
                    Sign out
                  </button>
                </>
              ) : (
                <button className="link" onClick={() => setShowAuth(true)}>
                  Log in / Sign up
                </button>
              )}
            </div>
            <button className="btn" onClick={handleListClick}>
              + List a colony
            </button>
          </div>
        </div>
      </header>

      <div className="wrap">
        <div className="controls">
          <div className="search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              placeholder="Search species, locality, keeper…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {session && (
            <button
              className={'chip toggle' + (mineActive ? ' on' : '')}
              onClick={() => setMine((v) => !v)}
              title="Show only the listings you posted"
            >
              {mineActive ? '★ My listings' : '☆ My listings'}
            </button>
          )}
          <span className="count">
            {loading ? 'Loading…' : `${filtered.length} specimen${filtered.length === 1 ? '' : 's'}`}
          </span>
        </div>

        <div className="chips">
          {genera.map((g) => (
            <button key={g} className={'chip' + (g === genus ? ' on' : '')} onClick={() => setGenus(g)}>
              {g === 'All' ? 'All genera' : <span className="bino">{g}</span>}
            </button>
          ))}
        </div>

        <div className="grid">
          {!loading && filtered.length === 0 && (
            <div className="empty-state">
              <span className="bino">Nullus colonia</span>
              {mineActive
                ? "You haven't listed any colonies yet. Click “+ List a colony” to add your first."
                : 'No colonies match your search yet. Try clearing the filter — or list the first one.'}
            </div>
          )}
          {filtered.map((l) => (
            <Card
              key={l.id}
              l={l}
              owner={!!session && l.user_id === session.user.id}
              onOpen={() => setDetail(l)}
            />
          ))}
        </div>
      </div>

      <footer>
        ANT SALE INTERNATIONAL · {listings.length} colonies listed
        <br />
        Listings live in a shared database — visible to everyone. Be accurate and kind.
      </footer>

      {/* detail panel */}
      <div className={'overlay' + (detail ? ' show' : '')} onClick={() => setDetail(null)} />
      <aside className={'panel' + (detail ? ' show' : '')} role="dialog" aria-modal="true" aria-label="Listing detail">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Specimen record</span>
            <h2>{detail ? catCode(detail.id) : '—'}</h2>
          </div>
          <button className="x" onClick={() => setDetail(null)} aria-label="Close">
            ×
          </button>
        </div>
        <div className="panel-body">
          {detail && (
            <Detail
              l={detail}
              owner={!!session && detail.user_id === session.user.id}
              onEdit={() => editListing(detail)}
              onDelete={() => deleteListing(detail)}
              onToggleSold={() => toggleSold(detail)}
            />
          )}
        </div>
      </aside>

      {/* new / edit listing panel */}
      <div className={'overlay' + (showForm ? ' show' : '')} onClick={closeForm} />
      <aside className={'panel' + (showForm ? ' show' : '')} role="dialog" aria-modal="true" aria-label={editing ? 'Edit listing' : 'New listing'}>
        <div className="panel-head">
          <div>
            <span className="eyebrow">{editing ? 'Edit specimen record' : 'Field collection card'}</span>
            <h2>{editing ? 'Edit listing' : 'New listing'}</h2>
          </div>
          <button className="x" onClick={closeForm} aria-label="Close">
            ×
          </button>
        </div>
        <div className="panel-body">
          {session && showForm && (
            <NewListing
              key={editing ? editing.id : 'new'}
              user={session.user}
              existing={editing}
              onDone={async () => {
                const wasNew = !editing
                closeForm()
                await loadListings()
                if (wasNew) setGenus('All')
              }}
            />
          )}
        </div>
      </aside>

      {/* auth panel */}
      <div className={'overlay' + (showAuth ? ' show' : '')} onClick={() => setShowAuth(false)} />
      <aside className={'panel' + (showAuth ? ' show' : '')} role="dialog" aria-modal="true" aria-label="Sign in">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Keeper access</span>
            <h2>Log in or sign up</h2>
          </div>
          <button className="x" onClick={() => setShowAuth(false)} aria-label="Close">
            ×
          </button>
        </div>
        <div className="panel-body">
          <Auth onSignedIn={() => setShowAuth(false)} />
        </div>
      </aside>
    </>
  )
}

/* ------------------------------------------------------------------- card */
function Card({ l, owner, onOpen }) {
  const workers = l.workers > 0 ? `${l.workers} workers` : 'Lone queen'
  return (
    <button className={'card' + (l.sold ? ' sold' : '')} onClick={onOpen}>
      <div className="specimen">
        <span className="catcode">{catCode(l.id)}</span>
        {owner && <span className="owner-dot">Yours</span>}
        {l.sold && <span className="sold-ribbon">Sold</span>}
        {l.image_url ? (
          <img src={l.image_url} alt={`${l.genus} ${l.species || ''}`} />
        ) : (
          <div className="empty">
            <AntGlyph />
          </div>
        )}
        <span className="price-tag">
          {(l.currency || '€') + fmt(l.price)}
        </span>
      </div>
      <div className="card-body">
        <div className="genus-strip">{l.genus}</div>
        <h3 className="name">
          {l.species || 'sp.'}
          {l.common && <span className="common">{l.common}</span>}
        </h3>
        {(l.tags || []).length > 0 && (
          <div className="tagrow">
            {(l.tags || []).slice(0, 3).map((t) => (
              <span className="tg" key={t}>
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="ledger">
          <div className="row">
            <span className="k">Stage</span>
            <span className="v">{stageShort(l.stage)}</span>
          </div>
          <div className="row">
            <span className="k">Colony</span>
            <span className="v">{workers}</span>
          </div>
          <div className="row">
            <span className="k">Locality</span>
            <span className="v">{l.locality || '—'}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

/* ----------------------------------------------------------------- detail */
function Detail({ l, owner, onEdit, onDelete, onToggleSold }) {
  const workers = l.workers > 0 ? `${l.workers}` : '0 (lone queen)'
  return (
    <>
      {l.image_url ? (
        <img className="d-img" src={l.image_url} alt="" />
      ) : (
        <div className="d-img empty-d">
          <AntGlyph />
        </div>
      )}
      {l.sold && <div className="d-soldbadge">● Marked as sold</div>}
      <div className="d-genus">{l.genus}</div>
      <h2 className="d-name">{l.species || 'sp.'}</h2>
      {l.common && <div className="d-common">{l.common}</div>}
      <div className="d-price">{(l.currency || '€') + fmt(l.price)}</div>
      {(l.tags || []).length > 0 && (
        <div className="tagrow" style={{ marginBottom: 20 }}>
          {(l.tags || []).map((t) => (
            <span className="tg" key={t}>
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="d-led">
        <div className="row">
          <span className="k">Stage</span>
          <span>{l.stage || '—'}</span>
        </div>
        <div className="row">
          <span className="k">Workers</span>
          <span>{workers}</span>
        </div>
        <div className="row">
          <span className="k">Locality</span>
          <span>{l.locality || '—'}</span>
        </div>
        <div className="row">
          <span className="k">Listed by</span>
          <span>{l.keeper || 'a keeper'}</span>
        </div>
      </div>
      {l.description && <p className="d-desc">{l.description}</p>}
      <div className="d-contact">
        <div className="cl">Contact the keeper</div>
        <div className="cv">{l.contact}</div>
      </div>
      {owner && (
        <div className="owner-actions">
          <div className="oa-label">You listed this — manage it</div>
          <div className="oa-btns">
            <button className="btn ghost" onClick={onToggleSold}>
              {l.sold ? 'Mark available' : 'Mark as sold'}
            </button>
            <button className="btn ghost" onClick={onEdit}>
              Edit
            </button>
            <button className="btn danger" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------- new listing */
const EMPTY = {
  genus: '',
  species: '',
  common: '',
  stage: 'Founding queen (claustral)',
  workers: '',
  currency: '€',
  price: '',
  locality: '',
  tags: '',
  description: '',
  contact: '',
}

function NewListing({ user, existing, onDone }) {
  const isEdit = !!existing
  const [f, setF] = useState(() =>
    existing
      ? {
          genus: existing.genus || '',
          species: existing.species || '',
          common: existing.common || '',
          stage: existing.stage || 'Founding queen (claustral)',
          workers: existing.workers ? String(existing.workers) : '',
          currency: existing.currency || '€',
          price: existing.price != null ? String(existing.price) : '',
          locality: existing.locality || '',
          tags: (existing.tags || []).join(', '),
          description: existing.description || '',
          contact: existing.contact || '',
        }
      : EMPTY,
  )
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(existing?.image_url || null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  function onFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 4.5 * 1024 * 1024) {
      setErr('Please choose an image under 4.5 MB.')
      return
    }
    setErr('')
    setFile(file)
    setPreview(URL.createObjectURL(file))
  }

  async function publish() {
    setErr('')
    if (!f.genus.trim() || f.price === '' || !f.contact.trim()) {
      setErr('Genus, price and contact are required.')
      return
    }
    setBusy(true)

    let image_url = isEdit ? existing.image_url || null : null
    if (file) {
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('listing-photos').upload(path, file)
      if (upErr) {
        setErr('Photo upload failed: ' + upErr.message)
        setBusy(false)
        return
      }
      image_url = supabase.storage.from('listing-photos').getPublicUrl(path).data.publicUrl
    }

    const base = {
      genus: f.genus.trim(),
      species: f.species.trim(),
      common: f.common.trim(),
      stage: f.stage,
      workers: parseInt(f.workers) || 0,
      currency: f.currency,
      price: Number(f.price),
      locality: f.locality.trim(),
      tags: f.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      description: f.description.trim(),
      contact: f.contact.trim(),
      image_url,
    }

    let error
    if (isEdit) {
      const res = await supabase.from('listings').update(base).eq('id', existing.id)
      error = res.error
    } else {
      const res = await supabase
        .from('listings')
        .insert([{ ...base, user_id: user.id, keeper: (user.email || '').split('@')[0] || 'keeper' }])
      error = res.error
    }

    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    setF(EMPTY)
    setFile(null)
    setPreview(null)
    onDone()
  }

  return (
    <>
      <label className="fld">
        <span className="lab">Photo</span>
        <div className={'drop' + (preview ? ' has' : '')} onClick={() => document.getElementById('file-input').click()}>
          {preview ? <img src={preview} alt="" /> : <div className="dtext">＋ Add a photo of the colony</div>}
        </div>
        <input id="file-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
        <span className="hint">Optional. Uploaded to your Supabase storage bucket.</span>
      </label>

      <div className="two">
        <label className="fld">
          <span className="lab">Genus</span>
          <input className="inp" placeholder="Camponotus" value={f.genus} onChange={(e) => set('genus', e.target.value)} />
        </label>
        <label className="fld">
          <span className="lab">Species</span>
          <input className="inp" placeholder="nicobarensis" value={f.species} onChange={(e) => set('species', e.target.value)} />
        </label>
      </div>

      <label className="fld">
        <span className="lab">Common name (optional)</span>
        <input className="inp" placeholder="e.g. Banded sugar ant" value={f.common} onChange={(e) => set('common', e.target.value)} />
      </label>

      <label className="fld">
        <span className="lab">Stage</span>
        <select value={f.stage} onChange={(e) => set('stage', e.target.value)}>
          <option>Founding queen (claustral)</option>
          <option>Queen + brood (eggs/larvae)</option>
          <option>Queen + workers</option>
          <option>Established colony</option>
        </select>
      </label>

      <div className="two">
        <label className="fld">
          <span className="lab">Worker count</span>
          <input className="inp" type="number" min="0" placeholder="0" value={f.workers} onChange={(e) => set('workers', e.target.value)} />
          <span className="hint">0 for a lone queen</span>
        </label>
        <label className="fld">
          <span className="lab">Price</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <select style={{ flex: '0 0 70px' }} value={f.currency} onChange={(e) => set('currency', e.target.value)}>
              <option>€</option>
              <option>£</option>
              <option>$</option>
            </select>
            <input className="inp" type="number" min="0" step="0.01" placeholder="25" value={f.price} onChange={(e) => set('price', e.target.value)} />
          </div>
        </label>
      </div>

      <label className="fld">
        <span className="lab">Locality</span>
        <input className="inp" placeholder="Athens, GR" value={f.locality} onChange={(e) => set('locality', e.target.value)} />
      </label>

      <label className="fld">
        <span className="lab">Tags (comma-separated)</span>
        <input className="inp" placeholder="Beginner-friendly, Polygynous, Harvester" value={f.tags} onChange={(e) => set('tags', e.target.value)} />
      </label>

      <label className="fld">
        <span className="lab">Description</span>
        <textarea
          placeholder="Care notes, temperament, setup included, collection details…"
          value={f.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>

      <label className="fld">
        <span className="lab">Contact</span>
        <input className="inp" placeholder="email, phone, or @handle" value={f.contact} onChange={(e) => set('contact', e.target.value)} />
      </label>

      {err && <div className="err">{err}</div>}

      <button className="btn" style={{ width: '100%', padding: 15, marginTop: 6 }} onClick={publish} disabled={busy}>
        {busy ? (isEdit ? 'Saving…' : 'Publishing…') : isEdit ? 'Save changes' : 'Publish listing'}
      </button>
    </>
  )
}

/* -------------------------------------------------------------------- auth */
function Auth({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setMsg(error.message)
    else onSignedIn()
  }
  async function signUp() {
    setBusy(true)
    setMsg('')
    const { data, error } = await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMsg(error.message)
    else if (data.session) onSignedIn() // email confirmation disabled
    else setMsg('Account created. Check your email to confirm, then log in.')
  }

  return (
    <>
      <p className="notice">
        Logging in lets you post listings. Anyone can browse without an account.
      </p>
      <label className="fld">
        <span className="lab">Email</span>
        <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <label className="fld">
        <span className="lab">Password</span>
        <input className="inp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </label>
      {msg && <div className="err">{msg}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <button className="btn" style={{ flex: 1 }} onClick={signIn} disabled={busy}>
          {busy ? '…' : 'Log in'}
        </button>
        <button className="btn ghost" style={{ flex: 1 }} onClick={signUp} disabled={busy}>
          Sign up
        </button>
      </div>
    </>
  )
}
