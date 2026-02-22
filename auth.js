// ============================================================
//  auth.js  —  Supabase 인증 + 클라우드 동기화
// ============================================================


// ────────────────────────────────────────────────────────────
// ✅ 앱 고정 Supabase 설정 (기기마다 입력할 필요 없음)
// 아래 2줄을 본인 Supabase 프로젝트 값으로 교체하세요.
// Project Settings → API 에서 확인
// ────────────────────────────────────────────────────────────
const SUPABASE_URL = 'REPLACE_WITH_YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'REPLACE_WITH_YOUR_SUPABASE_ANON_KEY';

// ── Supabase 클라이언트 ──
let _supabase = null;

function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.startsWith('REPLACE_')) return false;
  try {
    _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  } catch(e) {
    console.error('Supabase init 실패:', e);
    return false;
  }
}

// ── 설정 모달 (고정 설정 버전에서는 사용하지 않음) ──
function showSetupModal() {
  alert('이 앱은 Supabase 설정이 코드에 고정돼 있어요.
SUPABASE_URL / SUPABASE_ANON_KEY를 올바르게 넣었는지 확인해주세요.');
}
function closeSetupModal() {}


// ── 동기화 상태 표시 ──
function setSyncStatus(msg, state) {
  // state: 'idle' | 'syncing' | 'ok' | 'err'
  const bar  = document.getElementById('sync-bar');
  const text = document.getElementById('sync-status-text');
  if (!bar || !text) return;
  bar.className = 'sync-bar sync-' + (state || 'idle');
  text.textContent = msg;
}

// ── 클라우드에서 불러오기 ──
async function cloudLoad(userId) {
  setSyncStatus('☁️ 불러오는 중...', 'syncing');
  try {
    const { data, error } = await _supabase
      .from('stock_data')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      // 앱 전역 변수에 주입
      rows          = Array.isArray(data.rows)         ? data.rows          : [];
      closeMap      = (data.close_map && typeof data.close_map === 'object') ? data.close_map : {};
      collapsedDates= (data.collapsed_dates && typeof data.collapsed_dates === 'object') ? data.collapsed_dates : {};

      const bd = (data.base_date || '').trim();
      if (bd) {
        const el = document.getElementById('asOfDate');
        if (el) el.value = bd;
        localStorage.setItem(ASOF_KEY, bd);
      }

      // 로컬 스토리지도 갱신 (오프라인 대비)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
      localStorage.setItem(CLOSE_KEY,   JSON.stringify(closeMap));
      localStorage.setItem(COLLAPSE_KEY,JSON.stringify(collapsedDates));
    }

    renderFull();
    setSyncStatus('✅ 동기화 완료', 'ok');
    setTimeout(() => setSyncStatus('☁️ 자동 저장 중', 'idle'), 2500);
  } catch(e) {
    setSyncStatus('❌ 불러오기 실패: ' + e.message, 'err');
  }
}

// ── 클라우드에 저장 (upsert) ──
let _saveTimer = null;
function scheduleCloudSave() {
  if (!_supabase || !currentUserId) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  setSyncStatus('✏️ 저장 대기중...', 'idle');
  _saveTimer = setTimeout(() => doCloudSave(), 1200);
}

async function doCloudSave() {
  if (!_supabase || !currentUserId) return;
  setSyncStatus('☁️ 저장 중...', 'syncing');
  try {
    const payload = {
      user_id:         currentUserId,
      rows:            rows,
      close_map:       closeMap,
      collapsed_dates: collapsedDates,
      base_date:       document.getElementById('asOfDate')?.value || '',
      updated_at:      new Date().toISOString(),
    };
    const { error } = await _supabase
      .from('stock_data')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) throw error;
    setSyncStatus('✅ 저장 완료', 'ok');
    setTimeout(() => setSyncStatus('☁️ 자동 저장 중', 'idle'), 2000);
  } catch(e) {
    setSyncStatus('❌ 저장 실패: ' + e.message, 'err');
  }
}

// ── 현재 로그인 사용자 ──
let currentUserId = null;

// ── 앱 화면 전환 ──
function showApp(user) {
  currentUserId = user.id;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display   = 'block';

  const emailEl = document.getElementById('userEmail');
  if (emailEl) emailEl.textContent = user.email || user.user_metadata?.email || '';

  // 앱 초기화 (app.js의 init 함수 호출)
  initApp();
  cloudLoad(user.id);
}

function showLogin() {
  currentUserId = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display   = 'none';
}

// ── 로그인 메시지 ──
function setLoginMsg(msg, isErr) {
  const el = document.getElementById('login-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isErr ? '#dc2626' : '#16a34a';
}

// ── DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', () => {

  // 설정 저장
  document.getElementById('cfgSaveBtn').addEventListener('click', () => {
    const url = document.getElementById('cfgUrl').value.trim();
    const key = document.getElementById('cfgKey').value.trim();
    if (!url || !key) { alert('URL과 Key를 모두 입력해주세요.'); return; }
    localStorage.setItem(CFG_URL_KEY, url);
    localStorage.setItem(CFG_KEY_KEY, key);
    if (initSupabase()) {
      closeSetupModal();
      setLoginMsg('✅ 연결 성공! 이제 로그인할 수 있어요.', false);
    } else {
      alert('Supabase 연결에 실패했어요. URL/Key를 다시 확인해주세요.');
    }
  });

  // 설정 모달 바깥 클릭 닫기
  document.getElementById('setup-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('setup-modal')) closeSetupModal();
  });

  // Supabase 초기화 시도
  const ready = initSupabase();

  if (!ready) {
    // 설정 미완료: 안내만 표시
    setLoginMsg('Supabase 설정이 필요해요.\n코드에서 SUPABASE_URL / SUPABASE_ANON_KEY를 확인해주세요.', true);
  } else {
    // 세션 확인
    _supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        showApp(session.user);
      }
    });

    // 인증 상태 변경 감지
    _supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) showApp(session.user);
      else showLogin();
    });
  }

  // Google 로그인
  document.getElementById('loginGoogleBtn').addEventListener('click', async () => {
    if (!_supabase) { setLoginMsg('Supabase 설정이 올바르지 않아요. 코드의 SUPABASE_URL/KEY를 확인해주세요.', true); return; }
    const { error } = await _supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: (location.origin + location.pathname) }
    });
    if (error) setLoginMsg('Google 로그인 실패: ' + error.message, true);
  });

  // 이메일 로그인
  document.getElementById('loginEmailBtn').addEventListener('click', async () => {
    if (!_supabase) { setLoginMsg('Supabase 설정이 올바르지 않아요. 코드의 SUPABASE_URL/KEY를 확인해주세요.', true); return; }
    const email = document.getElementById('loginEmail').value.trim();
    const pw    = document.getElementById('loginPassword').value;
    if (!email || !pw) { setLoginMsg('이메일과 비밀번호를 입력해주세요.', true); return; }
    setLoginMsg('로그인 중...', false);
    const { error } = await _supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setLoginMsg('로그인 실패: ' + error.message, true);
  });

  // 이메일 회원가입
  document.getElementById('signupEmailBtn').addEventListener('click', async () => {
    if (!_supabase) { setLoginMsg('Supabase 설정이 올바르지 않아요. 코드의 SUPABASE_URL/KEY를 확인해주세요.', true); return; }
    const email = document.getElementById('loginEmail').value.trim();
    const pw    = document.getElementById('loginPassword').value;
    if (!email || !pw) { setLoginMsg('이메일과 비밀번호를 입력해주세요.', true); return; }
    if (pw.length < 6) { setLoginMsg('비밀번호는 6자 이상이어야 해요.', true); return; }
    setLoginMsg('가입 중...', false);
    const { error } = await _supabase.auth.signUp({ email, password: pw });
    if (error) setLoginMsg('가입 실패: ' + error.message, true);
    else setLoginMsg('✅ 가입 완료! 이메일 인증 후 로그인해주세요.', false);
  });

  // 로그아웃
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (_supabase) await _supabase.auth.signOut();
    showLogin();
  });

  // 백업 다운로드
  document.getElementById('gsBackupBtn')?.addEventListener('click', () => {
    const payload = {
      version: 1, exportedAt: new Date().toISOString(),
      rows, closeMap, collapsedDates,
      baseDate: document.getElementById('asOfDate')?.value || '',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stock-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // 백업 복원
  document.getElementById('gsRestoreFile')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const obj = JSON.parse(txt);
      rows           = Array.isArray(obj.rows) ? obj.rows : [];
      closeMap       = obj.closeMap || {};
      collapsedDates = obj.collapsedDates || {};
      const bd = (obj.baseDate || '').trim();
      if (bd) { document.getElementById('asOfDate').value = bd; localStorage.setItem(ASOF_KEY, bd); }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
      localStorage.setItem(CLOSE_KEY,   JSON.stringify(closeMap));
      localStorage.setItem(COLLAPSE_KEY,JSON.stringify(collapsedDates));
      renderFull();
      scheduleCloudSave();
      setSyncStatus('✅ 복원 완료 — 클라우드에 저장 중...', 'ok');
    } catch(err) {
      alert('복원 실패: ' + err.message);
    } finally { e.target.value = ''; }
  });
});
