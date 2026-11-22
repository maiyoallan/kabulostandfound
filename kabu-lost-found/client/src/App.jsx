import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Package,
  ShieldCheck,
  Bell,
  User,
  MapPin,
  Clock,
  CheckCircle2,
  Camera,
  LogOut,
  Filter,
  ArrowRight,
  MessageCircle,
  AlertTriangle,
  X,
  Menu,
  KeyRound,
} from 'lucide-react';
import { io } from 'socket.io-client';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const localDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const CATS = [
  'Student IDs',
  'Keys',
  'Electronics/Phones',
  'Wallets',
  'Books/Notes',
  'Clothing',
  'Accessories',
  'Other',
];

const LOCS = [
  'Main Library',
  'School of Computing & Bioinformatics',
  'Mess/Dining Hall',
  'Auditorium',
  'Hostels',
  'Gate A',
  'Gate B',
  'Chapel',
  'Lecture Halls',
  'Student Center',
  'Other',
];

async function call(path, { token, ...opts } = {}) {
  const r = await fetch(`${API}/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || 'Request failed');
  return d;
}

function App() {
  const [token, setToken] = useState(sessionStorage.getItem('kabu_token') || '');
  const [user, setUser] = useState(JSON.parse(sessionStorage.getItem('kabu_user') || 'null'));
  const [tab, setTab] = useState('FOUND');
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [resetEmail, setResetEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [claims, setClaims] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [myItems, setMyItems] = useState([]);
  const [activeClaim, setActiveClaim] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [stats, setStats] = useState({ active: 0, returned: 0, found: 0, lost: 0 });
  const socketRef = useRef(null);

  const load = async () => {
    try {
      setItems(
        await call(
          `/items?type=${tab}&q=${encodeURIComponent(q)}&category=${encodeURIComponent(
            category
          )}&location=${encodeURIComponent(location)}&status=${status}`
        )
      );
    } catch (e) {
      setNotice(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [tab, q, category, location, status]);

  useEffect(() => {
    call('/items/stats')
      .then(setStats)
      .catch(() => {});
  }, [items]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      call('/claims/mine', { token }),
      call('/notifications', { token }),
      call('/items/mine', { token }),
    ])
      .then(([c, n, m]) => {
        setClaims(c);
        setNotifications(n);
        setMyItems(m);
      })
      .catch(() => {});
  }, [token]);

  const returned = useMemo(() => items.filter((i) => i.status === 'RESOLVED').length, [items]);

  const saveAuth = (d) => {
    sessionStorage.setItem('kabu_token', d.token);
    sessionStorage.setItem('kabu_user', JSON.stringify(d.user));
    setToken(d.token);
    setUser(d.user);
    setModal('');
    setNotice(`Welcome, @${d.user.username}`);
  };

  async function submitAuth(e) {
    e.preventDefault();
    setBusy(true);

    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f.entries());

    try {
      if (authMode === 'register') {
        await call('/auth/register', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        setResetEmail(body.email.trim().toLowerCase());
        setAuthMode('verify');
        setNotice('A 6-digit verification code has been sent to your email.');
      } else if (authMode === 'verify') {
        const d = await call('/auth/verify', {
          method: 'POST',
          body: JSON.stringify({
            ...body,
            email: (body.email || resetEmail).trim().toLowerCase(),
          }),
        });

        saveAuth(d);
      } else if (authMode === 'forgot') {
        const email = body.email.trim().toLowerCase();

        await call('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });

        setResetEmail(email);
        setAuthMode('reset');
        setNotice('If an account exists for this email, a password-reset code has been sent.');
      } else if (authMode === 'reset') {
        await call('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            email: resetEmail,
            code: body.code,
            newPassword: body.newPassword,
          }),
        });

        setAuthMode('login');
        setNotice('Password changed successfully. You can now sign in.');
      } else {
        const d = await call('/auth/login', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        saveAuth(d);
      }
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitItem(e) {
    e.preventDefault();
    if (!token) {
      setModal('auth');
      return;
    }
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      const body = Object.fromEntries(f.entries());
      const photo = f.get('photo');
      delete body.photo;
      if (photo instanceof File && photo.size) {
        const sig = await call('/upload/signature', {
          token,
          method: 'POST',
          body: JSON.stringify({}),
        });
        const upload = new FormData();
        upload.append('file', photo);
        upload.append('api_key', sig.apiKey);
        upload.append('timestamp', sig.timestamp);
        upload.append('signature', sig.signature);
        upload.append('folder', sig.folder);
        upload.append('transformation', sig.transformation);
        upload.append('allowed_formats', sig.allowedFormats);
        const uploaded = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
          method: 'POST',
          body: upload,
        });
        const image = await uploaded.json();
        if (!uploaded.ok) throw Error(image.error?.message || 'Image upload failed');
        body.imageUrl = image.secure_url;
      }
      body.type = tab;
      body.eventAt = new Date(body.eventAt).toISOString();
      await call('/items', { token, method: 'POST', body: JSON.stringify(body) });
      setModal('');
      setNotice('Your listing has been published.');
      load();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function claimItem(item) {
    if (!token) {
      setModal('auth');
      return;
    }
    const answer = prompt(
      `${item.secretQuestion || 'Describe a private detail that proves this item belongs to you.'}\n\nDo not share passwords, full student numbers, or other sensitive information.`
    );
    if (!answer || answer.trim().length < 3) return;
    try {
      await call('/claims', {
        token,
        method: 'POST',
        body: JSON.stringify({ itemId: item.id, verificationAnswer: answer }),
      });
      setNotice('Claim submitted privately to the finder.');
      const c = await call('/claims/mine', { token });
      setClaims(c);
    } catch (e) {
      setNotice(e.message);
    }
  }

  async function decideClaim(c, decision) {
    try {
      await call(`/claims/${c.id}/decision`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ decision }),
      });
      setClaims(await call('/claims/mine', { token }));
      setNotice(`Claim ${decision.toLowerCase()}.`);
    } catch (e) {
      setNotice(e.message);
    }
  }

  async function resolveItem(id) {
    try {
      await call(`/items/${id}/status`, {
        token,
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED' }),
      });
      load();
      setMyItems(await call('/items/mine', { token }));
      setNotice('Marked as returned. Thank you for helping the community.');
    } catch (e) {
      setNotice(e.message);
    }
  }

  async function openChat(c) {
    setActiveClaim(c);
    setMessages([]);
    setModal('chat');
  }

  useEffect(() => {
    if (!token || !activeClaim || activeClaim.status !== 'ACCEPTED') return;
    let alive = true;
    call(`/claims/${activeClaim.id}/messages`, { token })
      .then((data) => {
        if (alive) setMessages(data);
      })
      .catch((e) => setNotice(e.message));
    const s = io(API, { auth: { token } });
    socketRef.current = s;
    s.emit('join-claim', activeClaim.id);
    s.on('new-message', (m) =>
      setMessages((old) => (old.some((x) => x.id === m.id) ? old : [...old, m]))
    );
    return () => {
      alive = false;
      s.disconnect();
      socketRef.current = null;
    };
  }, [token, activeClaim]);

  function sendMessage(e) {
    e.preventDefault();
    if (!message.trim() || !activeClaim || !socketRef.current) return;
    socketRef.current.emit('send-message', { claimId: activeClaim.id, body: message });
    setMessage('');
  }

  function logout() {
    sessionStorage.removeItem('kabu_token');
    sessionStorage.removeItem('kabu_user');
    setToken('');
    setUser(null);
    setClaims([]);
    setNotifications([]);
    setMyItems([]);
    setActiveClaim(null);
    setMessages([]);
    setMessage('');
    setAuthMode('login');
    setModal('');
    setNotice('You have been signed out successfully.');
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="crest">K</div>
          <div>
            <b>
              KABU <span>Lost &amp; Found</span>
            </b>
            <small>Connect the community. Return what matters.</small>
          </div>
        </div>
        <nav className={mobileMenu ? 'nav open' : 'nav'}>
          <button
            onClick={() => {
              setTab('FOUND');
              setMobileMenu(false);
            }}
            className={tab === 'FOUND' ? 'active' : ''}
          >
            Found Items
          </button>
          <button
            onClick={() => {
              setTab('LOST');
              setMobileMenu(false);
            }}
            className={tab === 'LOST' ? 'active' : ''}
          >
            Lost Requests
          </button>
          <button
            onClick={() => {
              setModal('dashboard');
              setMobileMenu(false);
            }}
          >
            My Dashboard
          </button>
        </nav>
        <div className="top-actions">
          {user ? (
            <>
              <span className="username">@{user.username}</span>
              <button
                className="iconbtn"
                onClick={() => setModal('notifications')}
                aria-label="Notifications"
              >
                <Bell size={19} />
                {notifications.some((n) => !n.readAt) && <i />}
              </button>
              <button className="iconbtn" onClick={logout} aria-label="Sign out">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <button
              className="btn outline"
              onClick={() => {
                setAuthMode('login');
                setModal('auth');
              }}
            >
              Sign in
            </button>
          )}
          <button className="iconbtn mobile" onClick={() => setMobileMenu(!mobileMenu)}>
            <Menu />
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <ShieldCheck size={15} /> KABARAK UNIVERSITY COMMUNITY
            </div>
            <h1>
              Lost something?
              <br />
              <em>Let&apos;s bring it home.</em>
            </h1>
            <p>
              A trusted space for KABU students and staff to report lost belongings, return found
              items, and reconnect with what matters.
            </p>
            <div className="hero-actions">
              <button
                className="btn gold"
                onClick={() => {
                  setTab('FOUND');
                  setModal('post');
                }}
              >
                <Plus size={18} /> I found something
              </button>
              <button
                className="btn light"
                onClick={() => {
                  setTab('LOST');
                  setModal('post');
                }}
              >
                I lost something <ArrowRight size={17} />
              </button>
            </div>
          </div>
          <div className="hero-art">
            <div className="art-circle">
              <Package size={78} />
              <span className="spark s1">✦</span>
              <span className="spark s2">✧</span>
            </div>
            <div className="art-note">
              <CheckCircle2 size={17} /> A little help goes a long way
            </div>
          </div>
        </section>

        <section className="stats">
          <div>
            <strong>{stats.active}</strong>
            <span>Active listings</span>
          </div>
          <div>
            <strong>{stats.returned}</strong>
            <span>Items returned</span>
          </div>
          <div>
            <strong>{stats.found + stats.lost}</strong>
            <span>Community reports</span>
          </div>
          <div className="privacy">
            <ShieldCheck size={22} />
            <span>
              <b>Your privacy matters</b>
              <small>Only usernames are public</small>
            </span>
          </div>
        </section>

        <section className="feed">
          <div className="feed-heading">
            <div>
              <div className="eyebrow maroon">COMMUNITY BOARD</div>
              <h2>{tab === 'FOUND' ? 'Recently found items' : 'Recently reported lost'}</h2>
              <p>Search community listings and help reunite belongings with their owners.</p>
            </div>
            <button className="btn primary" onClick={() => setModal('post')}>
              <Plus size={18} /> Create a report
            </button>
          </div>

          <div className="filters">
            <label className="search">
              <Search size={18} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search items, brands, descriptions..."
              />
            </label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="">All campus locations</option>
              {LOCS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="UNCLAIMED">Unclaimed</option>
              <option value="CLAIM_PENDING">Claim pending</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>

          <div className="cards">
            {items.length ? (
              items.map((item) => (
                <article className="item-card" key={item.id}>
                  <div className="item-photo">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="Item reported" />
                    ) : (
                      <div className="photo-empty">
                        <Package size={42} />
                        <span>No photo supplied</span>
                      </div>
                    )}
                    <span className={`status ${item.status.toLowerCase()}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="item-content">
                    <div className="item-meta">
                      <span>{item.category}</span>
                      <span>
                        <Clock size={13} />
                        {new Date(item.eventAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <div className="item-location">
                      <MapPin size={15} />
                      {item.location}
                      {item.customLocation ? ` · ${item.customLocation}` : ''}
                    </div>
                    <div className="item-footer">
                      <span>
                        Posted by <b>@{item.user.username}</b>
                      </span>
                      {tab === 'FOUND' && item.status !== 'RESOLVED' && (
                        <button className="text-btn" onClick={() => claimItem(item)}>
                          Claim item <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty">
                <Package size={42} />
                <h3>No listings found</h3>
                <p>Try another search or be the first to post a report.</p>
                <button className="btn primary" onClick={() => setModal('post')}>
                  Create a report
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="safety">
          <div>
            <ShieldCheck size={27} />
            <div>
              <b>Safe handovers start with care.</b>
              <p>
                Meet in a public campus location such as the Security Desk or Student Center. Never
                post passwords, full student numbers, or private contact details.
              </p>
            </div>
          </div>
          <span>KABU • COMMUNITY FIRST</span>
        </section>
      </main>

      <footer>
        <b>KABU Lost &amp; Found</b>
        <span>Built for the Kabarak University community · Privacy by design</span>
        <a href="mailto:security@kabarak.ac.ke">Contact campus security</a>
      </footer>

      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}

      {modal && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal('');
          }}
        >
          <div className="dialog">
            <button className="close" onClick={() => setModal('')}>
              <X />
            </button>

            {modal === 'auth' && (
              <>
                <div className="eyebrow maroon">KABU COMMUNITY ACCESS</div>
                <h2>
                  {authMode === 'register'
                    ? 'Create your account'
                    : authMode === 'verify'
                    ? 'Verify your email'
                    : authMode === 'forgot'
                    ? 'Forgot your password?'
                    : authMode === 'reset'
                    ? 'Reset your password'
                    : 'Welcome back'}
                </h2>
                <p className="muted">
                  Public listings display your username only. Your email stays private.
                </p>
                <form onSubmit={submitAuth} className="form">
                  {(authMode === 'login' || authMode === 'register') && (
                    <>
                      <label>
                        Email address
                        <input
                          name="email"
                          type="email"
                          placeholder="name@kabarak.ac.ke"
                          required
                        />
                      </label>
                      {authMode === 'register' && (
                        <label>
                          Username
                          <input
                            name="username"
                            minLength="3"
                            maxLength="24"
                            placeholder="your_username"
                            required
                          />
                        </label>
                      )}
                      <label>
                        Password
                        <input
                          name="password"
                          type="password"
                          minLength={authMode === 'register' ? 10 : 1}
                          placeholder={
                            authMode === 'register' ? 'At least 10 characters' : 'Your password'
                          }
                          required
                        />
                      </label>
                    </>
                  )}
                  {authMode === 'verify' && (
                    <>
                      <label>
                        Email address
                        <input
                          name="email"
                          type="email"
                          defaultValue={resetEmail}
                          required
                        />
                      </label>
                      <label>
                        6-digit verification code
                        <input
                          name="code"
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          maxLength="6"
                          required
                        />
                      </label>
                    </>
                  )}
                  {authMode === 'forgot' && (
                    <label>
                      Registered email address
                      <input
                        name="email"
                        type="email"
                        placeholder="Your registered email"
                        required
                      />
                    </label>
                  )}
                  {authMode === 'reset' && (
                    <>
                      <label>
                        Email address
                        <input name="email" type="email" value={resetEmail} readOnly />
                      </label>
                      <label>
                        6-digit reset code
                        <input
                          name="code"
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          maxLength="6"
                          required
                        />
                      </label>
                      <label>
                        New password
                        <input
                          name="newPassword"
                          type="password"
                          minLength="10"
                          maxLength="72"
                          placeholder="At least 10 characters"
                          required
                        />
                      </label>
                    </>
                  )}
                  <button className="btn primary full" disabled={busy}>
                    {busy
                      ? 'Please wait...'
                      : authMode === 'verify'
                      ? 'Verify and continue'
                      : authMode === 'register'
                      ? 'Create account'
                      : authMode === 'forgot'
                      ? 'Send reset code'
                      : authMode === 'reset'
                      ? 'Change password'
                      : 'Sign in'}
                  </button>
                </form>
                <div className="switch-auth">
                  {authMode === 'login' ? (
                    <>
                      <button onClick={() => setAuthMode('forgot')}>Forgot password?</button>
                      <p>
                        New here?{' '}
                        <button onClick={() => setAuthMode('register')}>Create an account</button>
                      </p>
                    </>
                  ) : authMode === 'register' ? (
                    <>
                      Already registered?{' '}
                      <button onClick={() => setAuthMode('login')}>Sign in</button>
                    </>
                  ) : authMode === 'verify' ? (
                    <>
                      Need a new code?{' '}
                      <button
                        onClick={async () => {
                          const email = document.querySelector('[name=email]')?.value;
                          if (email)
                            try {
                              await call('/auth/resend', {
                                method: 'POST',
                                body: JSON.stringify({ email }),
                              });
                              setNotice('New code sent.');
                            } catch (e) {
                              setNotice(e.message);
                            }
                        }}
                      >
                        Resend code
                      </button>
                    </>
                  ) : authMode === 'forgot' ? (
                    <button onClick={() => setAuthMode('login')}>Back to sign in</button>
                  ) : (
                    <button onClick={() => setAuthMode('forgot')}>Request another reset code</button>
                  )}
                </div>
                <small className="fine">
                  Kabarak email addresses are accepted. Gmail accounts require prior approval by the
                  university portal administrator.
                </small>
              </>
            )}

            {modal === 'post' && (
              <>
                <div className="eyebrow maroon">COMMUNITY REPORT</div>
                <h2>{tab === 'FOUND' ? 'Report a found item' : 'Report something lost'}</h2>
                <p className="muted">
                  Please avoid sharing sensitive personal information in descriptions or photos.
                </p>
                <form className="form" onSubmit={submitItem}>
                  <label>
                    Item title
                    <input
                      name="title"
                      placeholder="e.g. Black HP laptop charger"
                      required
                      minLength="3"
                      maxLength="100"
                    />
                  </label>
                  <label>
                    Category
                    <select name="category" required>
                      {CATS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Description
                    <textarea
                      name="description"
                      rows="3"
                      placeholder="Describe visible details. Keep one private detail for ownership checks."
                      required
                      minLength="10"
                    />
                  </label>
                  <label>
                    Private verification prompt (found items only)
                    <input
                      name="secretQuestion"
                      placeholder="e.g. What is engraved on the back?"
                    />
                  </label>
                  <label>
                    Photo (optional)
                    <input name="photo" type="file" accept="image/*" capture="environment" />
                    <small>
                      Take a photo with your camera or choose one from your gallery. Images are
                      compressed during upload.
                    </small>
                  </label>
                  <label>
                    Campus location
                    <select name="location">
                      {LOCS.map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Additional location detail
                    <input
                      name="customLocation"
                      placeholder="Building, room, or nearby landmark"
                    />
                  </label>
                  <label>
                    {tab === 'FOUND' ? 'Date and time found' : 'Date and time last seen'}
                    <input
                      name="eventAt"
                      type="datetime-local"
                      required
                      defaultValue={localDateTime()}
                    />
                  </label>
                  {tab === 'FOUND' && (
                    <label>
                      Current custody / collection point
                      <select name="custody">
                        <option>With me (contact via username)</option>
                        <option>Main Gate Security Office</option>
                        <option>Dean of Students Office</option>
                        <option>Library Front Desk</option>
                      </select>
                    </label>
                  )}
                  <button className="btn primary full" disabled={busy}>
                    {busy ? 'Publishing...' : 'Publish report'}
                  </button>
                </form>
              </>
            )}

            {modal === 'dashboard' && (
              <>
                <div className="eyebrow maroon">YOUR SPACE</div>
                <h2>My Dashboard</h2>
                {!user ? (
                  <p className="muted">Sign in to see your listings, claims, chats and alerts.</p>
                ) : (
                  <>
                    <p className="muted">
                      Signed in as <b>@{user.username}</b>
                    </p>
                    <h3>My listings</h3>
                    {myItems.map((i) => (
                      <div className="dash-row" key={i.id}>
                        <span>
                          <b>{i.title}</b>
                          <small>
                            {i.type} · {i.status}
                          </small>
                        </span>
                        {i.status !== 'RESOLVED' && (
                          <button className="text-btn" onClick={() => resolveItem(i.id)}>
                            Mark returned
                          </button>
                        )}
                      </div>
                    ))}
                    <h3>Claims &amp; handovers</h3>
                    {claims.map((c) => (
                      <div className="dash-row" key={c.id}>
                        <span>
                          <b>{c.item.title}</b>
                          <small>
                            Claim by @{c.claimant.username} · {c.status}
                            {c.ownerId === user.id && c.verificationAnswer
                              ? ` · Verification: ${c.verificationAnswer}`
                              : ''}
                          </small>
                        </span>
                        {c.ownerId === user.id && c.status === 'PENDING' ? (
                          <span>
                            <button
                              className="text-btn"
                              onClick={() => decideClaim(c, 'ACCEPTED')}
                            >
                              Accept
                            </button>{' '}
                            <button
                              className="text-btn danger"
                              onClick={() => decideClaim(c, 'REJECTED')}
                            >
                              Decline
                            </button>
                          </span>
                        ) : c.status === 'ACCEPTED' ? (
                          <button className="text-btn" onClick={() => openChat(c)}>
                            Open chat
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {modal === 'notifications' && (
              <>
                <div className="eyebrow maroon">UPDATES</div>
                <h2>Notifications</h2>
                {notifications.length ? (
                  notifications.map((n) => (
                    <div className="dash-row" key={n.id}>
                      <span>
                        <b>{n.title}</b>
                        <small>{n.body}</small>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="muted">No notifications yet.</p>
                )}
              </>
            )}

            {modal === 'chat' && (
              <>
                <div className="eyebrow maroon">PRIVATE HANDOVER CHAT</div>
                <h2>Claim conversation</h2>
                <p className="muted">
                  Only the finder and claimant can access this claim conversation.
                </p>
                {activeClaim?.status === 'ACCEPTED' ? (
                  <>
                    <div className="chat-log">
                      {messages.map((m) => (
                        <div className="chat-message" key={m.id}>
                          <b>{m.sender}</b>
                          <p>{m.body}</p>
                        </div>
                      ))}
                    </div>
                    <form className="chat-form" onSubmit={sendMessage}>
                      <input
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Arrange a safe campus handover..."
                      />
                      <button className="btn primary">Send</button>
                    </form>
                  </>
                ) : (
                  <p>Chat becomes available after the finder accepts the claim.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;