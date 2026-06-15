import { useState, useEffect, useMemo, useRef } from 'react'
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

const fmt = (n) => (Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(2))
const stageShort = (s) => (s ? s.replace(' (claustral)', '').replace(' (eggs/larvae)', '') : '—')

// The three kinds of listing the marketplace supports
const KINDS = {
  sale: { label: 'For sale', filter: 'For sale', badge: 'For sale', title: 'List a colony', eyebrow: 'Field collection card' },
  wanted: { label: 'Wanted', filter: 'Wanted ads', badge: 'Wanted', title: 'Post a wanted ad', eyebrow: 'Buyer request' },
  list: { label: 'Sales list', filter: 'Sales lists', badge: 'Sales list', title: 'Publish a sales list', eyebrow: 'Bulk stock list' },
}
const kindOf = (l) => l.type || 'sale'
// Word shown when a listing is closed out, by type
const closedWord = (type) => (type === 'wanted' ? 'found' : type === 'list' ? 'closed' : 'sold')
// Reports needed before a listing is auto-covered with a "reported" banner
const REPORT_THRESHOLD = 5

/* --------------------------------------------------------------------- app */
export default function App() {
  const [session, setSession] = useState(null)
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [genus, setGenus] = useState('All')
  const [kind, setKind] = useState('all') // 'all' | 'sale' | 'wanted' | 'list'

  const [detail, setDetail] = useState(null) // listing object or null
  const [showForm, setShowForm] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [mine, setMine] = useState(false) // filter: only my listings
  const [editing, setEditing] = useState(null) // listing being edited, or null
  const [formType, setFormType] = useState('sale') // which kind the form creates
  const [showWarn, setShowWarn] = useState(true) // legal-compliance gate on entry
  const [verifiedIds, setVerifiedIds] = useState(() => new Set()) // user ids with a verified badge

  // auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // load listings + verified sellers
  useEffect(() => {
    loadListings()
    loadVerified()
  }, [])

  async function loadVerified() {
    const { data, error } = await supabase.from('profiles').select('id').eq('verified', true)
    if (!error && data) setVerifiedIds(new Set(data.map((r) => r.id)))
  }

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

  // open a listing from a shared ?l=<id> link, once, after first load
  const deepLinkRef = useRef(false)
  useEffect(() => {
    if (deepLinkRef.current || loading) return
    deepLinkRef.current = true
    const id = new URLSearchParams(window.location.search).get('l')
    if (id) {
      const found = listings.find((x) => x.id === id)
      if (found) setDetail(found)
    }
  }, [loading, listings])

  // keep the URL in sync with the open listing so links are shareable
  useEffect(() => {
    const url = new URL(window.location.href)
    if (detail) url.searchParams.set('l', detail.id)
    else url.searchParams.delete('l')
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [detail])

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
      if (kind !== 'all' && kindOf(l) !== kind) return false
      if (genus !== 'All' && l.genus !== genus) return false
      if (!q) return true
      const hay = [l.genus, l.species, l.common, l.title, l.locality, l.keeper, (l.tags || []).join(' '), l.stage, l.description]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [listings, query, genus, kind, mineActive, session])

  function openNew(type) {
    if (!session) {
      setShowAuth(true)
      return
    }
    setEditing(null)
    setFormType(type)
    setShowForm(true)
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
    setFormType(kindOf(l))
    setShowForm(true)
  }

  async function reportListing(l) {
    if (!session) {
      setShowAuth(true)
      return
    }
    const { error } = await supabase
      .from('reports')
      .insert([{ listing_id: l.id, reporter_id: session.user.id }])
    if (error) {
      if (error.code === '23505') {
        alert('You have already reported this listing — thanks.')
      } else {
        alert('Could not submit report: ' + error.message)
      }
      return
    }
    // optimistic local bump so the count + cover update immediately
    setDetail((d) => (d && d.id === l.id ? { ...d, report_count: (d.report_count || 0) + 1 } : d))
    alert('Thanks — this listing has been reported for review.')
    await loadListings()
  }

  return (
    <>
      {showWarn && (
        <div className="warn-overlay">
          <div className="warn-box" role="alertdialog" aria-modal="true" aria-labelledby="warn-title">
            <button className="warn-x" onClick={() => setShowWarn(false)} aria-label="Close">
              ×
            </button>
            <div className="warn-eyebrow">Please read</div>
            <h2 id="warn-title">Warning</h2>
            <p>
              ONLY sell or buy legally permitted species, using legal forms of shipping and the correct
              permits.
            </p>
            <button className="btn" onClick={() => setShowWarn(false)}>
              I understand
            </button>
          </div>
        </div>
      )}

      <header>
        <div className="bar" />
        <div className="head-in">
          <div className="head-left">
            <div className="wordmark">
              <h1>Ant Sale International</h1>
              <span className="tag">Ant&nbsp;·&nbsp;Marketplace</span>
            </div>
            <div className="sub">
              <p className="sub-lead">
                Browse ant queens, colonies &amp; equipment from across the world! A free marketplace by
                <strong> @antsgreece</strong>.
              </p>
              <p className="sub-donate">
                Donations keep the page running.{' '}
                <a className="donate" href="https://www.paypal.com/paypalme/antsgreece" target="_blank" rel="noopener noreferrer">
                  Donate via PayPal →
                </a>{' '}
                <span className="donate-url">paypal.com/paypalme/antsgreece</span>
              </p>
            </div>
          </div>
          <div className="head-right">
            <p className="head-warn">
              ⚠ Still in development. Buy &amp; sell at your own risk: watch out for scammers, frauds and
              illegal listings.
            </p>
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
            <div className="actions">
              <button className="btn" onClick={() => openNew('sale')}>
                + List a colony
              </button>
              <button className="btn ghost" onClick={() => openNew('wanted')} title="Post what you're looking to buy">
                + Post a wanted ad
              </button>
              <button className="btn ghost" onClick={() => openNew('list')} title="Publish a bulk stock list with many species">
                + Publish a sales list
              </button>
            </div>
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

        <div className="chips kinds">
          <button className={'chip' + (kind === 'all' ? ' on' : '')} onClick={() => setKind('all')}>
            All types
          </button>
          {Object.entries(KINDS).map(([k, info]) => (
            <button key={k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>
              {info.filter}
            </button>
          ))}
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
                ? "You haven't posted anything yet. Use the buttons up top to list a colony, post a wanted ad, or publish a sales list."
                : 'Nothing matches your filters yet. Try clearing them — or post the first listing.'}
            </div>
          )}
          {filtered.map((l) => (
            <Card
              key={l.id}
              l={l}
              owner={!!session && l.user_id === session.user.id}
              verified={verifiedIds.has(l.user_id)}
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
            <h2>{detail ? KINDS[kindOf(detail)].badge : '—'}</h2>
          </div>
          <button className="x" onClick={() => setDetail(null)} aria-label="Close">
            ×
          </button>
        </div>
        <div className="panel-body">
          {detail && (
            <Detail
              l={detail}
              user={session?.user || null}
              owner={!!session && detail.user_id === session.user.id}
              verified={verifiedIds.has(detail.user_id)}
              onEdit={() => editListing(detail)}
              onDelete={() => deleteListing(detail)}
              onToggleSold={() => toggleSold(detail)}
              onReport={() => reportListing(detail)}
            />
          )}
        </div>
      </aside>

      {/* new / edit listing panel */}
      <div className={'overlay' + (showForm ? ' show' : '')} onClick={closeForm} />
      <aside className={'panel' + (showForm ? ' show' : '')} role="dialog" aria-modal="true" aria-label={editing ? 'Edit listing' : KINDS[formType].title}>
        <div className="panel-head">
          <div>
            <span className="eyebrow">{editing ? 'Edit ' + KINDS[formType].label.toLowerCase() : KINDS[formType].eyebrow}</span>
            <h2>{editing ? 'Edit listing' : KINDS[formType].title}</h2>
          </div>
          <button className="x" onClick={closeForm} aria-label="Close">
            ×
          </button>
        </div>
        <div className="panel-body">
          {session && showForm && (
            <NewListing
              key={editing ? editing.id : 'new-' + formType}
              user={session.user}
              existing={editing}
              type={formType}
              onDone={async () => {
                const wasNew = !editing
                const t = formType
                closeForm()
                await loadListings()
                if (wasNew) {
                  setGenus('All')
                  setKind(t)
                }
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
function Card({ l, owner, verified, onOpen }) {
  const type = kindOf(l)
  const isSale = type === 'sale'
  const isWanted = type === 'wanted'
  const isList = type === 'list'
  const workers = l.workers > 0 ? `${l.workers} workers` : 'Lone queen'
  const itemCount = isList
    ? (l.description || '').split('\n').map((s) => s.trim()).filter(Boolean).length
    : 0
  const reported = (l.report_count || 0) >= REPORT_THRESHOLD

  return (
    <button className={'card k-' + type + (l.sold ? ' sold' : '') + (reported ? ' reported' : '')} onClick={onOpen}>
      {reported && (
        <div className="reported-cover">
          <span className="rc-big">⚑ Reported</span>
          <span className="rc-sub">Flagged by the community — under review</span>
        </div>
      )}
      <div className="specimen">
        <span className={'catcode cat-' + type}>{KINDS[type].badge}</span>
        {owner && <span className="owner-dot">Yours</span>}
        {l.sold && <span className="sold-ribbon">{closedWord(type)}</span>}
        {isSale && l.image_url ? (
          <img src={l.image_url} alt={`${l.genus} ${l.species || ''}`} />
        ) : (
          <div className="empty">
            <AntGlyph />
          </div>
        )}
        {isSale && <span className="price-tag">{(l.currency || '€') + fmt(l.price)}</span>}
        {isWanted && (
          <span className="price-tag wanted-tag">
            {l.price != null ? 'Budget ' + (l.currency || '€') + fmt(l.price) : 'Open offer'}
          </span>
        )}
      </div>

      <div className="card-body">
        {verified && <span className="verified-chip" title="Verified seller">✓ Verified seller</span>}
        {isList ? (
          <>
            <div className="genus-strip">Sales list</div>
            <h3 className="name listname">{l.title || 'Stock list'}</h3>
            {l.description && <p className="list-preview">{l.description}</p>}
            <div className="ledger">
              <div className="row">
                <span className="k">Items</span>
                <span className="v">{itemCount || '—'}</span>
              </div>
              <div className="row">
                <span className="k">Locality</span>
                <span className="v">{l.locality || '—'}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="genus-strip">{isWanted ? 'Looking for' : l.genus}</div>
            <h3 className="name">
              {isWanted ? l.genus + (l.species ? ' ' + l.species : '') : l.species || 'sp.'}
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
              {isWanted ? (
                <div className="row">
                  <span className="k">Budget</span>
                  <span className="v">{l.price != null ? (l.currency || '€') + fmt(l.price) : 'Open'}</span>
                </div>
              ) : (
                <div className="row">
                  <span className="k">Colony</span>
                  <span className="v">{workers}</span>
                </div>
              )}
              <div className="row">
                <span className="k">Locality</span>
                <span className="v">{l.locality || '—'}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </button>
  )
}

/* ----------------------------------------------------------------- detail */
function Detail({ l, user, owner, verified, onEdit, onDelete, onToggleSold, onReport }) {
  const type = kindOf(l)
  const isSale = type === 'sale'
  const isWanted = type === 'wanted'
  const isList = type === 'list'
  const workers = l.workers > 0 ? `${l.workers}` : '0 (lone queen)'
  const cw = closedWord(type)
  const reports = l.report_count || 0
  const reported = reports >= REPORT_THRESHOLD
  const [copied, setCopied] = useState(false)

  function copyShare() {
    const url = `${window.location.origin}/?l=${l.id}`
    const done = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, done)
    else done()
  }

  return (
    <>
      {reported && (
        <div className="d-reported">⚑ This listing has been reported by the community and is under review. Proceed with caution.</div>
      )}
      {verified && <div className="d-verified">✓ Verified seller</div>}
      {isSale && l.image_url ? (
        <img className="d-img" src={l.image_url} alt="" />
      ) : (
        <div className="d-img empty-d">
          <AntGlyph />
        </div>
      )}
      {l.sold && <div className="d-soldbadge">● Marked as {cw}</div>}

      <div className="d-genus">{isList ? 'Sales list' : isWanted ? 'Looking for' : l.genus}</div>
      <h2 className={'d-name' + (isList ? ' listname' : '')}>
        {isList ? l.title || 'Stock list' : isWanted ? l.genus + (l.species ? ' ' + l.species : '') : l.species || 'sp.'}
      </h2>
      {l.common && <div className="d-common">{l.common}</div>}

      {isSale && <div className="d-price">{(l.currency || '€') + fmt(l.price)}</div>}
      {isWanted && (
        <div className="d-price">{l.price != null ? 'Budget: ' + (l.currency || '€') + fmt(l.price) : 'Open offer'}</div>
      )}

      <button className="share-btn" onClick={copyShare} title="Copy a direct link to this listing">
        {copied ? '✓ Link copied' : '🔗 Copy share link'}
      </button>

      {(l.tags || []).length > 0 && (
        <div className="tagrow" style={{ marginBottom: 20 }}>
          {(l.tags || []).map((t) => (
            <span className="tg" key={t}>
              {t}
            </span>
          ))}
        </div>
      )}

      {isList ? (
        <>
          {l.description && <pre className="d-list">{l.description}</pre>}
          <div className="d-led">
            <div className="row">
              <span className="k">Locality</span>
              <span>{l.locality || '—'}</span>
            </div>
            <div className="row">
              <span className="k">Listed by</span>
              <span>{l.keeper || 'a keeper'}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="d-led">
            <div className="row">
              <span className="k">Stage</span>
              <span>{l.stage || '—'}</span>
            </div>
            {!isWanted && (
              <div className="row">
                <span className="k">Workers</span>
                <span>{workers}</span>
              </div>
            )}
            <div className="row">
              <span className="k">Locality</span>
              <span>{l.locality || '—'}</span>
            </div>
            <div className="row">
              <span className="k">{isWanted ? 'Wanted by' : 'Listed by'}</span>
              <span>{l.keeper || 'a keeper'}</span>
            </div>
          </div>
          {l.description && <p className="d-desc">{l.description}</p>}
        </>
      )}

      <div className="d-contact">
        <div className="cl">{isWanted ? 'Contact the buyer' : 'Contact the seller'}</div>
        <div className="cv">{l.contact}</div>
      </div>

      {!owner && (
        <div className="report-row">
          <button className="report-btn" onClick={onReport} title="Flag this listing for review">
            ⚑ Report listing
          </button>
          {reports > 0 && (
            <span className="report-count">
              {reports} report{reports === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      {owner && (
        <div className="owner-actions">
          <div className="oa-label">You posted this — manage it</div>
          <div className="oa-btns">
            <button className="btn ghost" onClick={onToggleSold}>
              {l.sold ? 'Mark active' : 'Mark as ' + cw}
            </button>
            <button className="btn ghost" onClick={onEdit}>
              Edit
            </button>
            <button className="btn danger" onClick={onDelete}>
              Delete
            </button>
          </div>
          {reports > 0 && <div className="oa-reports">⚑ {reports} report{reports === 1 ? '' : 's'} on this listing</div>}
        </div>
      )}

      <Comments listingId={l.id} user={user} />
    </>
  )
}

/* --------------------------------------------------------------- comments */
function Comments({ listingId, user }) {
  const [items, setItems] = useState([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: true })
    if (!error) setItems(data || [])
    setLoaded(true)
  }

  useEffect(() => {
    setLoaded(false)
    setItems([])
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId])

  async function post() {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    const author_name = (user.email || '').split('@')[0] || 'user'
    const { error } = await supabase
      .from('comments')
      .insert([{ listing_id: listingId, user_id: user.id, author_name, body: text }])
    setBusy(false)
    if (error) {
      alert('Could not post comment: ' + error.message)
      return
    }
    setBody('')
    load()
  }

  async function remove(id) {
    if (!window.confirm('Delete your comment?')) return
    const { error } = await supabase.from('comments').delete().eq('id', id)
    if (error) {
      alert('Could not delete: ' + error.message)
      return
    }
    load()
  }

  return (
    <div className="comments">
      <div className="cm-head">Comments{loaded ? ` (${items.length})` : ''}</div>
      {loaded && items.length === 0 && <p className="cm-empty">No comments yet — start the conversation.</p>}
      <ul className="cm-list">
        {items.map((c) => (
          <li className="cm-item" key={c.id}>
            <div className="cm-meta">
              <span className="cm-author">{c.author_name || 'user'}</span>
              <span className="cm-date">{new Date(c.created_at).toLocaleDateString()}</span>
            </div>
            <div className="cm-body">{c.body}</div>
            {user && user.id === c.user_id && (
              <button className="cm-del" onClick={() => remove(c.id)}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {user ? (
        <div className="cm-form">
          <textarea
            placeholder="Ask a question or leave a comment…"
            value={body}
            maxLength={500}
            onChange={(e) => setBody(e.target.value)}
          />
          <button className="btn" disabled={busy || !body.trim()} onClick={post}>
            {busy ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      ) : (
        <p className="cm-login">Log in to leave a comment.</p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- new listing */
const EMPTY = {
  title: '',
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

function NewListing({ user, existing, type = 'sale', onDone }) {
  const isEdit = !!existing
  const isSale = type === 'sale'
  const isWanted = type === 'wanted'
  const isList = type === 'list'
  const [f, setF] = useState(() =>
    existing
      ? {
          title: existing.title || '',
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
    if (isList) {
      if (!f.title.trim() || !f.description.trim() || !f.contact.trim()) {
        setErr('A title, the stock list, and a contact are required.')
        return
      }
    } else if (isWanted) {
      if (!f.genus.trim() || !f.contact.trim()) {
        setErr('Genus and contact are required.')
        return
      }
    } else {
      if (!f.genus.trim() || f.price === '' || !f.contact.trim()) {
        setErr('Genus, price and contact are required.')
        return
      }
    }
    setBusy(true)

    let image_url = isEdit ? existing.image_url || null : null
    if (isSale && file) {
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
      type,
      title: isList ? f.title.trim() || null : null,
      genus: f.genus.trim() || null,
      species: f.species.trim() || null,
      common: f.common.trim() || null,
      stage: isList ? null : f.stage,
      workers: isSale ? parseInt(f.workers) || 0 : 0,
      currency: f.currency,
      price: f.price === '' ? null : Number(f.price),
      locality: f.locality.trim() || null,
      tags: f.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      description: f.description.trim() || null,
      contact: f.contact.trim(),
      image_url: isSale ? image_url : null,
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

  const submitLabel = isEdit
    ? busy
      ? 'Saving…'
      : 'Save changes'
    : busy
    ? 'Publishing…'
    : isWanted
    ? 'Post wanted ad'
    : isList
    ? 'Publish sales list'
    : 'Publish listing'

  const localityField = (
    <label className="fld">
      <span className="lab">{isWanted ? 'Your location' : 'Locality'}</span>
      <input className="inp" placeholder="Athens, GR" value={f.locality} onChange={(e) => set('locality', e.target.value)} />
    </label>
  )
  const contactField = (
    <label className="fld">
      <span className="lab">Contact</span>
      <input className="inp" placeholder="email, phone, or @handle" value={f.contact} onChange={(e) => set('contact', e.target.value)} />
    </label>
  )

  return (
    <>
      {isList ? (
        <>
          <label className="fld">
            <span className="lab">List title</span>
            <input className="inp" placeholder="e.g. June 2026 stock list" value={f.title} onChange={(e) => set('title', e.target.value)} />
          </label>

          <label className="fld">
            <span className="lab">The list — one item per line</span>
            <textarea
              className="listinput"
              rows={10}
              placeholder={'Camponotus nicobarensis / 10 workers / €25\nLasius niger / queen + brood / €12\nMessor barbarus / founding queen / €9'}
              value={f.description}
              onChange={(e) => set('description', e.target.value)}
            />
            <span className="hint">Free-form. Suggested format: Genus species / colony size / price — one per line.</span>
          </label>

          <label className="fld">
            <span className="lab">Default currency (optional)</span>
            <select style={{ maxWidth: 90 }} value={f.currency} onChange={(e) => set('currency', e.target.value)}>
              <option>€</option>
              <option>£</option>
              <option>$</option>
            </select>
          </label>

          {localityField}
          {contactField}
        </>
      ) : (
        <>
          {isSale && (
            <label className="fld">
              <span className="lab">Photo</span>
              <div className={'drop' + (preview ? ' has' : '')} onClick={() => document.getElementById('file-input').click()}>
                {preview ? <img src={preview} alt="" /> : <div className="dtext">＋ Add a photo of the colony</div>}
              </div>
              <input id="file-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
              <span className="hint">Optional. Uploaded to your Supabase storage bucket.</span>
            </label>
          )}

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
            <span className="lab">{isWanted ? 'Stage wanted' : 'Stage'}</span>
            <select value={f.stage} onChange={(e) => set('stage', e.target.value)}>
              {isWanted && <option>Any stage</option>}
              <option>Founding queen (claustral)</option>
              <option>Queen + brood (eggs/larvae)</option>
              <option>Queen + workers</option>
              <option>Established colony</option>
            </select>
          </label>

          {isWanted ? (
            <label className="fld">
              <span className="lab">Budget (optional)</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <select style={{ flex: '0 0 70px' }} value={f.currency} onChange={(e) => set('currency', e.target.value)}>
                  <option>€</option>
                  <option>£</option>
                  <option>$</option>
                </select>
                <input
                  className="inp"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="max you'll pay"
                  value={f.price}
                  onChange={(e) => set('price', e.target.value)}
                />
              </div>
              <span className="hint">Leave blank for an open offer.</span>
            </label>
          ) : (
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
          )}

          {localityField}

          <label className="fld">
            <span className="lab">Tags (comma-separated)</span>
            <input className="inp" placeholder="Beginner-friendly, Polygynous, Harvester" value={f.tags} onChange={(e) => set('tags', e.target.value)} />
          </label>

          <label className="fld">
            <span className="lab">{isWanted ? 'Details of what you want' : 'Description'}</span>
            <textarea
              placeholder={
                isWanted
                  ? 'Quantity, acceptable stages, where you can receive shipping, budget notes…'
                  : 'Care notes, temperament, setup included, collection details…'
              }
              value={f.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>

          {contactField}
        </>
      )}

      {err && <div className="err">{err}</div>}

      <button className="btn" style={{ width: '100%', padding: 15, marginTop: 6 }} onClick={publish} disabled={busy}>
        {submitLabel}
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
