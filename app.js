/* Read-only guest playback for CCFOLIA jukebox; only guest presence is written. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const videoPattern = /^[A-Za-z0-9_-]{11}$/;
  const room = new URL(location.href).searchParams.get('room') || '';
  const VALID_ROOM = /^[A-Za-z0-9_-]{4,180}$/.test(room);
  // Legacy clients publish a 30-second heartbeat; new clients publish join/leave events only.
  const LEGACY_STALE_AFTER = 95000;
  const state = {
    db: null, nickname: '', roomId: room, joined: false, ref: null,
    sessionId: '', playback: null, playlists: [], listeners: [],
    subs: [], clock: null, player: null, youtubeReady: false,
    currentVideo: '', currentRevision: null, playerTime: 0, volume: 70,
    playbackError: '', autoplayBlocked: false, selectedPlaylistId: ''
  };

  const text = (id, value) => { const node = $(id); if (node) node.textContent = String(value || ''); };
  function status(value, error = false) {
    text('connection-status', value);
    $('connection-status').style.color = error ? '#ffabab' : '';
    $('live-pill').classList.toggle('connected', !error && state.joined);
  }
  const timestampMs = stamp => {
    if (!stamp) return 0;
    if (typeof stamp.toMillis === 'function') return stamp.toMillis();
    if (typeof stamp.seconds === 'number') return stamp.seconds * 1000 + Number(stamp.nanoseconds || 0) / 1e6;
    if (typeof stamp._seconds === 'number') return stamp._seconds * 1000 + Number(stamp._nanoseconds || 0) / 1e6;
    return 0;
  };
  const fmt = value => {
    const sec = Math.max(0, Math.floor(Number(value) || 0));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  const playbackPosition = p => {
    if (!p) return 0;
    const base = Math.max(0, Number(p.position) || 0);
    const changed = timestampMs(p.changedAt);
    return p.playing && changed > 0 && changed <= Date.now()
      ? base + Math.max(0, Date.now() - changed) / 1000 : base;
  };
  const sessionKey = 'ccsp-jb-guest-session-v1';
  function getSession() {
    let id = '';
    try { id = sessionStorage.getItem(sessionKey) || ''; } catch (_) {}
    if (!/^web-[a-z0-9-]{12,80}$/.test(id)) {
      // Browser's crypto.randomUUID in HTTPS; entropy fallback for local previews.
      const rand = window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,15)}`;
      id = 'web-' + rand;
      try { sessionStorage.setItem(sessionKey, id); } catch (_) {}
    }
    return id;
  }
  function addTextItem(parent, className, value) {
    const el = document.createElement('span');
    el.className = className;
    el.textContent = value;
    parent.append(el);
    return el;
  }
  function renderListeners() {
    const list = $('listeners-list');
    list.replaceChildren();
    const active = state.listeners.filter(l => l.listening === true && (
      l.presenceMode === 'event' || timestampMs(l.updatedAt) > Date.now() - LEGACY_STALE_AFTER));
    text('listener-count', String(active.length));
    if (!active.length) { addTextItem(list, 'empty', '없음'); return; }
    for (const entry of active) {
      const row = document.createElement('div'); row.className = 'person';
      const name = String(entry.name || entry.playerId || '청취자').slice(0, 48);
      addTextItem(row, 'dot', name.slice(0,1).toUpperCase());
      addTextItem(row, 'person-name', name);
      if (entry.id === state.sessionId) addTextItem(row, 'person-you', '나');
      list.append(row);
    }
  }
  function renderTabs() {
    const target = $('playlist-tabs');
    target.replaceChildren();
    const selected = state.playlists[0];
    if (!state.playlists.length) {
      addTextItem(target, 'empty', '플레이리스트 없음');
      return null;
    }
    for (const playlist of state.playlists.slice(0,1)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '룸';
      button.title = button.textContent;
      button.className = 'jb-tab' + (playlist.id === selected?.id ? ' is-active' : '');
      button.setAttribute('aria-pressed', String(playlist.id === selected?.id));
      button.addEventListener('click', () => {
        state.selectedPlaylistId = playlist.id;
        renderQueue();
      });
      target.append(button);
    }
    return selected;
  }
  function renderQueue() {
    const target = $('queue'); target.replaceChildren();
    const playlist = renderTabs();
    if (!playlist?.tracks?.length) { addTextItem(target, 'empty', '곡 없음'); return; }
    playlist.tracks.forEach((track, idx) => {
      const row = document.createElement('div');
      row.className = 'queue-row' + (
        playlist.id === state.playback?.playlistId &&
        track.videoId === state.playback?.videoId &&
        Number(state.playback?.trackIndex) === idx ? ' now' : '');
      addTextItem(row, 'num', String(idx + 1) + '.');
      const title = addTextItem(row, 'queue-title', String(track.title || track.videoId || '곡').slice(0, 120));
      title.title = title.textContent;
      target.append(row);
    });
  }
  function renderPlaying() {
    const p = state.playback;
    text('track-title', p?.title || '재생 중인 곡 없음');
    text('repeat-label', ({off:'반복 없음', one:'한 곡 반복', all:'전체 반복'})[p?.repeatMode] || '전체 반복');
    text('playing-badge', p?.playing ? '재생 중' : (p?.videoId ? '일시정지' : '대기 중'));
    updateTime();
    renderQueue();
  }
  function updateTime() {
    const p = state.playback;
    const pos = playbackPosition(p);
    text('track-time', fmt(pos));
    const duration = state.youtubeReady ? Math.max(0, Number(state.player?.getDuration?.() || 0)) : 0;
    $('progress-fill').style.width = duration > 0 ? `${Math.min(100,Math.max(0,pos/duration*100))}%` : '0%';
    // Snapshot changes refresh event-based listeners; only legacy heartbeats need expiry.
    if (Math.floor(Date.now()/1000) % 10 === 0) renderListeners();
  }
  async function writePresence(leaving = false) {
    if (!state.ref) return;
    try {
      if (leaving) return await state.ref.delete();
      await state.ref.set({
        guest: true, playerId: 'web:' + state.sessionId, name: state.nickname,
        listening: true, presenceMode: 'event', updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, {merge:false});
    } catch (error) { status('청취자 상태 저장 실패: ' + (error.code || error.message), true); }
  }
  let youtubePromise = null;
  function startYouTube() {
    if (youtubePromise) return youtubePromise;
    youtubePromise = new Promise((resolve, reject) => {
      if (window.YT?.Player) { resolve(window.YT); return; }
      let cancelled = false;
      const onReady = () => { if (!cancelled) resolve(window.YT); };
      window.onYouTubeIframeAPIReady = onReady;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
      script.onerror = () => { cancelled = true; reject(Error('YouTube API를 불러오지 못했어.')); };
      document.head.append(script);
    });
    return youtubePromise;
  }
  async function mountYoutube() {
    try {
      const YT = await startYouTube();
      if (!state.joined) return;
      state.player = new YT.Player('youtube-player', {
        width: '480', height:'270', playerVars: {playsinline:1, rel:0, controls:1},
        events: {
          onReady: event => {
            if (!state.joined) return;
            state.youtubeReady = true;
            event.target.setVolume(state.volume);
            syncPlayback();
          },
          onStateChange: event => {
            if (event.data === YT.PlayerState.PLAYING) {
              state.autoplayBlocked = false;
              status('연결됨');
            }
          },
          onAutoplayBlocked: () => {
            state.autoplayBlocked = true;
            status('재생 허용 필요');
          },
          onError: event => status('이 YouTube 영상은 재생이 제한될 수 있어. (오류 '+event.data+')', true)
        }
      });
    } catch (err) { status(err.message, true); }
  }
  function syncPlayback(forceCatchUp = false) {
    if (!state.youtubeReady || !state.player || !state.joined) return;
    const p = state.playback;
    if (!p || !videoPattern.test(p.videoId || '')) {
      if (state.currentVideo) state.player.pauseVideo();
      return;
    }
    const position = playbackPosition(p), revision = Number(p.revision || 0);
    try {
      if (state.currentVideo !== p.videoId) {
        state.currentVideo = p.videoId;
        state.currentRevision = revision;
        if (p.playing) state.player.loadVideoById({videoId:p.videoId,startSeconds:position});
        else state.player.cueVideoById({videoId:p.videoId,startSeconds:position});
        return;
      }
      // A revision represents an actual GM action. Never rewind on a polling tick.
      if (state.currentRevision !== revision) {
        state.currentRevision = revision;
        const currentSeconds = Number(state.player.getCurrentTime?.() || 0);
        if (Math.abs(currentSeconds-position) > 1.5) state.player.seekTo(position, true);
      } else if (forceCatchUp && p.playing && timestampMs(p.changedAt) > 0 && timestampMs(p.changedAt) <= Date.now()) {
        const currentSeconds = Number(state.player.getCurrentTime?.() || 0);
        if (position-currentSeconds > 10) state.player.seekTo(position,true);
      }
      if (p.playing) {
        if (state.player.getPlayerState() !== YT.PlayerState.PLAYING) state.player.playVideo();
      } else {
        if (state.player.getPlayerState() === YT.PlayerState.PLAYING) state.player.pauseVideo();
      }
    } catch (err) { status('플레이어 동기화 오류: '+err.message,true); }
  }
  function subscribe(ref, accept) {
    const unsubscribe = ref.onSnapshot(accept, err => status('Firestore 연결 오류: '+(err.code || err.message),true));
    state.subs.push(unsubscribe);
  }
  function connect() {
    const doc = state.db.collection('jukeboxRooms').doc(state.roomId);
    subscribe(doc.collection('playback').doc('current'), snapshot => {
      state.playback = snapshot.exists ? snapshot.data() : null;
      renderPlaying(); syncPlayback();
      if (state.playback) status('연결됨');
      else status('연결됨 · 대기 중');
    });
    subscribe(doc.collection('playlists').orderBy('order').limit(1), snapshot => {
      state.playlists = snapshot.docs.map(d => ({id:d.id,...d.data(),tracks:Array.isArray(d.data().tracks)?d.data().tracks:[]}));
      renderQueue();
    });
    subscribe(doc.collection('listeners'), snapshot => {
      state.listeners = snapshot.docs.map(d => ({id:d.id,...d.data()})); renderListeners();
    });
  }
  async function join(event) {
    event.preventDefault();
    $('join-error').hidden = true;
    const name = $('nickname').value.trim().slice(0,30);
    if (!VALID_ROOM) { text('join-error','유효한 룸 초대 링크가 아니야. GM에게 링크를 다시 요청해 줘.'); $('join-error').hidden=false; return; }
    if (!name) { text('join-error','닉네임을 입력해 줘.'); $('join-error').hidden=false; return; }
    const button = $('join-form').querySelector('button'); button.disabled = true;
    try {
      if (!window.firebase?.firestore || !window.CCSP_FIREBASE_CONFIG?.projectId) throw Error('Firebase 설정을 불러오지 못했어.');
      if (!firebase.apps.length) firebase.initializeApp(window.CCSP_FIREBASE_CONFIG);
      state.db = firebase.firestore();
      state.nickname = name;
      state.sessionId = getSession();
      state.volume = Number($('volume').value);
      state.joined = true;
      exitCleanupQueued = false;
      state.ref = state.db.collection('jukeboxRooms').doc(state.roomId).collection('listeners').doc(state.sessionId);
      try { localStorage.setItem('ccsp-jb-guest-nickname',name); } catch (_) {}
      text('my-name',name);
      $('my-identity').hidden = false;
      $('join-card').hidden = true; $('listener-app').hidden = false;
      await writePresence();
      if (!state.joined) return;
      state.clock = setInterval(updateTime,1000);
      connect();
      mountYoutube();
    } catch (err) {
      $('my-identity').hidden = true;
      $('listener-app').hidden = true; $('join-card').hidden = false;
      state.joined = false;
      text('join-error',err.message);
      $('join-error').hidden=false;
      status('연결 오류: '+err.message,true);
    } finally { button.disabled = false; }
  }
  async function leave() {
    state.joined = false;
    for (const unsub of state.subs.splice(0)) try { unsub(); } catch (_) {}
    clearInterval(state.clock);
    await writePresence(true);
    state.ref = null; state.youtubeReady=false;state.currentVideo='';state.currentRevision=null;
    try { state.player?.destroy(); } catch (_) {}
    state.player=null;state.playback=null;state.playlists=[];state.listeners=[];
    $('video-wrap').replaceChildren(Object.assign(document.createElement('div'),{id:'youtube-player'}));
    $('listener-app').hidden=true;$('join-card').hidden=false;
    $('my-identity').hidden = true;
    state.selectedPlaylistId = '';
    setLibraryCollapsed(false);
    setExtrasCollapsed(false);
    $('live-pill').classList.remove('connected');
  }

  function setExtrasCollapsed(collapsed) {
    const button = $('toggle-extras');
    $('player-details').hidden = Boolean(collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));
    button.title = collapsed ? '재생 정보 펼치기' : '재생 정보 접기';
    button.setAttribute('aria-label', button.title);
    button.classList.toggle('is-collapsed', Boolean(collapsed));
  }
  function setLibraryCollapsed(collapsed) {
    const folded = Boolean(collapsed);
    document.querySelector('.shell').classList.toggle('library-collapsed', folded);
    $('toggle-library').setAttribute('aria-expanded', String(!folded));
    $('toggle-library-reopen').hidden = !folded;
  }
  $('toggle-extras').addEventListener('click', () => {
    setExtrasCollapsed(!$('player-details').hidden);
  });
  $('toggle-library').addEventListener('click', () => setLibraryCollapsed(true));
  $('toggle-library-reopen').addEventListener('click', () => setLibraryCollapsed(false));
  $('join-form').addEventListener('submit',join);
  $('leave-button').addEventListener('click',leave);
  $('allow-play').addEventListener('click', () => {
    if (!state.youtubeReady || !state.player) return status('플레이어 준비 중');
    try {
      state.player.setVolume(state.volume);
      syncPlayback();
      if (state.playback?.playing) state.player.playVideo();
      status('재생 요청됨');
    } catch (error) { status('재생 허용 오류: '+error.message,true); }
  });
  $('volume').addEventListener('input',event => {
    state.volume = Number(event.target.value); text('volume-value',String(state.volume)+'%');
    try { state.player?.setVolume(state.volume); } catch (_) {}
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.joined) syncPlayback(true);
  });
  // Closing a tab cannot guarantee completion of an async Firestore delete.
  // Request cleanup on pagehide, with beforeunload as a fallback; prevent duplicate requests.
  let exitCleanupQueued = false;
  function requestExitCleanup() {
    if (!state.joined || !state.ref || exitCleanupQueued) return;
    exitCleanupQueued = true;
    state.ref.delete().catch(() => {});
  }
  window.addEventListener('pagehide', requestExitCleanup);
  window.addEventListener('beforeunload', requestExitCleanup);
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    exitCleanupQueued = false;
    // A BFCache restoration reverses a previous pagehide cleanup.
    if (state.joined) writePresence();
  });
  try { $('nickname').value = localStorage.getItem('ccsp-jb-guest-nickname') || ''; } catch (_) {}
  text('room-label', VALID_ROOM ? 'ROOM · '+room.slice(0,12) : '잘못된 링크');
  if (!VALID_ROOM) { text('join-error','유효하지 않은 룸 주소입니다.'); $('join-error').hidden=false; $('join-form').querySelector('button').disabled=true; }
})();
