/* ─── 더풀 에이전트 대시보드 ─── */

// ─── State ───────────────────────────────────────────────
const state = {
  activeTab: 'agents',
  pollingTimer: null,
  lastUpdate: null,
  initialLoaded: {},  // track first load per tab
};

const AGENT_NAMES_KR = {
  'yun-biseo': '더풀비서',
  'yun-coding-teamjang': '윤코딩팀장',
  'main-admin': '메인관리자봇',
  'yun-cogada': '윤코가다봇',
  'yun-siljang': '윤실장',
  'yun-parksa': '윤박사',
  'okl-observer': '오클옵저버',
  'main': '메인',
  'voice': '보이스',
  'yun-coder': '윤코더',
};

function agentDisplayName(agentId) {
  const kr = AGENT_NAMES_KR[agentId];
  return kr ? `${kr} (${agentId})` : agentId;
}

const TAB_TITLES = {
  agents: '에이전트 현황',
  timeline: '대화 타임라인',
  cron: '크론잡',
  activity: '활동 요약',
  library: '팀 라이브러리',
  activeSessions: '활동 세션',
  journal: '에이전트 일지',
};

// ─── Utils ───────────────────────────────────────────────

function formatTokens(n) {
  if (!n && n !== 0) return '-';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatCost(n) {
  if (!n && n !== 0) return '$0.00';
  return '$' + Number(n).toFixed(2);
}

function relativeTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date)) return '-';
  const now = new Date();
  const diff = Math.floor((now - date) / 1000); // seconds

  if (diff < 0) return '방금 전';
  if (diff < 60) return diff + '초 전';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
  if (diff < 604800) return Math.floor(diff / 86400) + '일 전';
  return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function formatKST(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date)) return '-';
  return date.toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatKSTFull(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  if (isNaN(date)) return '-';
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeClass(status) {
  if (!status) return 'badge-unknown';
  const s = status.toLowerCase();
  if (s === 'running' || s === 'active') return 'badge-running';
  if (s === 'done' || s === 'completed' || s === 'success' || s === 'idle') return 'badge-done';
  if (s === 'sleeping') return 'badge-idle';
  if (s === 'offline') return 'badge-unknown';
  if (s === 'error' || s === 'failed' || s === 'fail') return 'badge-error';
  if (s === 'ok' || s === 'waiting') return 'badge-' + s;
  return 'badge-unknown';
}

function statusLabel(status) {
  if (!status) return '알 수 없음';
  const map = {
    running: '실행 중',
    active: '작업중',
    done: '완료',
    completed: '완료',
    success: '정상',
    error: '오류',
    failed: '실패',
    fail: '실패',
    idle: '대기중',
    sleeping: '휴면',
    offline: '오프라인',
    waiting: '대기',
    ok: '정상',
  };
  return map[status.toLowerCase()] || status;
}

function badge(status) {
  const cls = statusBadgeClass(status);
  const label = statusLabel(status);
  return `<span class="badge ${cls}">${label}</span>`;
}

function statusLamp(status) {
  if (!status) return '⚫';
  const s = status.toLowerCase();
  if (s === 'running' || s === 'active') return '🟢';
  if (s === 'idle') return '🟡';
  if (s === 'sleeping') return '🟠';
  if (s === 'done' || s === 'completed' || s === 'success' || s === 'ok') return '🟡';
  if (s === 'error' || s === 'failed' || s === 'fail') return '🔴';
  if (s === 'offline') return '⚫';
  return '⚫';
}

function showLoading(id, show) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', !show);
}

function truncate(str, max = 120) {
  if (!str) return '';
  if (typeof str !== 'string') str = JSON.stringify(str);
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ─── Header Clock ─────────────────────────────────────────

function updateClock() {
  const el = document.getElementById('current-time');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function updateLastUpdate() {
  const el = document.getElementById('last-update');
  if (!el) return;
  if (!state.lastUpdate) {
    el.textContent = '업데이트 중...';
    return;
  }
  const t = state.lastUpdate.toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  el.textContent = `마지막 업데이트: ${t}`;
}

// ─── API Fetch ─────────────────────────────────────────────

async function apiFetch(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Detail Panel ─────────────────────────────────────────

let detailPanelState = {
  agentId: null,
  data: null,
  activeTab: 'workspace',
};

// Open detail panel for an agent
async function openDetailPanel(agentId) {
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-panel-content');
  if (!panel || !content) return;

  panel.classList.remove('hidden');
  content.innerHTML = '<div class="loading" style="padding:60px 0"><div class="spinner"></div><span>불러오는 중...</span></div>';

  detailPanelState.agentId = agentId;
  detailPanelState.activeTab = 'workspace';

  try {
    const data = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}/detail`);
    detailPanelState.data = data;
    renderDetailPanelHeader(agentId, data);
    renderDetailPanelTab('workspace', data);
  } catch (err) {
    content.innerHTML = errorState(err);
  }
}

function closeDetailPanel() {
  const panel = document.getElementById('detail-panel');
  if (panel) panel.classList.add('hidden');
  detailPanelState.agentId = null;
  detailPanelState.data = null;
}

function renderDetailPanelHeader(agentId, data) {
  const header = document.getElementById('detail-panel-header');
  if (!header) return;

  // Find latest session info
  const latestSession = data.sessions?.[0] || {};
  const model = latestSession.model || '-';
  const status = latestSession.status || 'unknown';

  header.innerHTML = `
    <div class="detail-panel-header-top">
      <div class="detail-panel-title">
        <div class="detail-agent-kr">${esc(agentDisplayName(agentId))}</div>
        <div class="detail-agent-en">${esc(agentId)}</div>
      </div>
      <button class="detail-panel-close" id="detail-panel-close-btn">✕</button>
    </div>
    <div class="detail-panel-meta">
      <span class="detail-model">${esc(model)}</span>
      ${badge(status)}
    </div>
  `;

  document.getElementById('detail-panel-close-btn')?.addEventListener('click', closeDetailPanel);
}

function renderDetailPanelTab(tab, data) {
  const content = document.getElementById('detail-panel-content');
  if (!content) return;

  detailPanelState.activeTab = tab;

  // Update tab buttons
  document.querySelectorAll('.detail-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  if (tab === 'workspace') {
    const files = data.workspace?.files || [];
    if (files.length === 0) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📁</div><div class="empty-state-text">워크스페이스 비어있음</div></div>';
      return;
    }
    content.innerHTML = `
      <div class="detail-panel-path">${esc(data.workspace?.path || '')}</div>
      <table class="detail-table">
        <thead><tr><th>이름</th><th>크기</th><th>수정일</th></tr></thead>
        <tbody>
          ${files.map(f => `
            <tr class="detail-file-row ${isPreviewable(f.name) ? 'previewable' : ''}" 
                data-path="${esc(data.workspace.path)}/${esc(f.name)}"
                data-name="${esc(f.name)}">
              <td><span class="file-icon">${f.isDir ? '📁' : '📄'}</span> ${esc(f.name)}</td>
              <td class="td-muted">${f.isDir ? '-' : formatFileSize(f.size)}</td>
              <td class="td-muted">${relativeTime(f.modified)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="file-preview" id="file-preview"></div>
    `;

    // File click handlers
    content.querySelectorAll('.detail-file-row.previewable').forEach(row => {
      row.addEventListener('click', () => loadFilePreview(row.dataset.path, row.dataset.name));
    });

  } else if (tab === 'settings') {
    const files = data.agentConfig?.files || [];
    if (files.length === 0) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚙️</div><div class="empty-state-text">설정 파일 없음</div></div>';
      return;
    }
    content.innerHTML = `
      <div class="detail-panel-path">${esc(data.agentConfig?.path || '')}</div>
      <table class="detail-table">
        <thead><tr><th>이름</th><th>크기</th><th>수정일</th></tr></thead>
        <tbody>
          ${files.map(f => `
            <tr class="detail-file-row ${f.name.endsWith('.json') ? 'previewable' : ''}"
                data-path="${esc(data.agentConfig.path)}/${esc(f.name)}"
                data-name="${esc(f.name)}">
              <td><span class="file-icon">${f.isDir ? '📁' : '📄'}</span> ${esc(f.name)}</td>
              <td class="td-muted">${f.isDir ? '-' : formatFileSize(f.size)}</td>
              <td class="td-muted">${relativeTime(f.modified)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="file-preview" id="file-preview"></div>
    `;

    content.querySelectorAll('.detail-file-row.previewable').forEach(row => {
      row.addEventListener('click', () => loadFilePreview(row.dataset.path, row.dataset.name));
    });

  } else if (tab === 'sessions') {
    const sessions = data.sessions || [];
    if (sessions.length === 0) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🗂️</div><div class="empty-state-text">세션 없음</div></div>';
      return;
    }
    content.innerHTML = `
      <table class="detail-table">
        <thead><tr><th>세션 ID</th><th>토큰</th><th>모델</th><th>시간</th></tr></thead>
        <tbody>
          ${sessions.map(s => `
            <tr>
              <td><code style="font-size:11px">${esc(s.sessionId || '-')}</code></td>
              <td>${formatTokens(s.totalTokens)}</td>
              <td class="td-muted" style="font-size:11px">${esc(s.model || '-')}</td>
              <td class="td-muted">${relativeTime(s.updatedAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

  } else if (tab === 'recent') {
    const messages = data.recentMessages || [];
    if (messages.length === 0) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💬</div><div class="empty-state-text">최근 대화 없음</div></div>';
      return;
    }
    content.innerHTML = `
      <div class="chat-bubbles">
        ${messages.map(msg => `
          <div class="chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}">
            <div class="chat-role">${msg.role === 'user' ? '👤' : '🤖'}</div>
            <div class="chat-text">${esc(msg.text || '')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

function isPreviewable(name) {
  return /\.(md|json|yaml|yml|txt|js|ts|html|css|sh|mdx)$/i.test(name);
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function loadFilePreview(filePath, fileName) {
  try {
    const agentId = detailPanelState.agentId;
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/file?path=${encodeURIComponent(filePath)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let text = await res.text();

    // Pretty-print JSON
    if (fileName.endsWith('.json')) {
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {}
    }

    const isMd = fileName.endsWith('.md');
    const rendered = isMd ? simpleMarkdown(text) : `<pre class="code-block"><code>${esc(text)}</code></pre>`;
    openBigModal(fileName, `<div class="md-body">${rendered}</div>`);
  } catch (err) {
    openBigModal('오류', `<div style="color:var(--error);padding:24px">${esc(err.message)}</div>`);
  }
}

// ─── Tab: Agents ──────────────────────────────────────────

async function loadAgents() {
  const isFirst = !state.initialLoaded['agents'];
  if (isFirst) showLoading('loading-agents', true);
  const grid = document.getElementById('agent-grid');

  try {
    const data = await apiFetch('/api/agents');
    state.lastUpdate = new Date();
    updateLastUpdate();

    const agents = Array.isArray(data) ? data : (data.agents || []);

    if (agents.length === 0) {
      grid.innerHTML = emptyState('🤖', '에이전트 데이터 없음');
      return;
    }

    grid.innerHTML = agents.map(a => {
      const agentId = a.agentId || a.key || a.name || '알 수 없음';
      return `
      <div class="card agent-card clickable-card" data-agent-id="${esc(agentId)}">
        <div class="agent-card-header">
          <div class="agent-header-left">
            <span class="agent-lamp">${statusLamp(a.status)}</span>
            <div>
              <div class="agent-name">${esc(agentDisplayName(agentId))}</div>
              <div class="agent-model">${esc(a.model || '-')}</div>
            </div>
          </div>
          ${badge(a.status)}
        </div>
        <div class="agent-stats">
          <div class="stat-item">
            <span class="stat-label">토큰</span>
            <span class="stat-value">${formatTokens(a.totalTokens)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">비용</span>
            <span class="stat-value">${formatCost(a.estimatedCostUsd)}</span>
          </div>
        </div>
        <div class="agent-last-active">
          🕐 마지막 활동: ${a.lastActivityAgo || relativeTime(a.latestUpdatedAt || a.endedAt || a.startedAt || a.lastActivity)}
        </div>
      </div>
    `}).join('');

    // Attach click handlers for detail panel
    grid.querySelectorAll('.clickable-card').forEach(card => {
      card.addEventListener('click', () => {
        openDetailPanel(card.dataset.agentId);
      });
    });
    state.initialLoaded['agents'] = true;
  } catch (err) {
    grid.innerHTML = errorState(err);
  } finally {
    if (isFirst) showLoading('loading-agents', false);
  }
}

// ─── Tab: Timeline ────────────────────────────────────────

function extractAgentName(sessionKey) {
  if (!sessionKey) return '알 수 없음';
  // agent:yun-biseo:telegram:direct:xxx → yun-biseo
  const parts = sessionKey.split(':');
  if (parts.length >= 2 && parts[0] === 'agent') return parts[1];
  return sessionKey;
}

function extractTextContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const texts = content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text);
    return texts.join('\n');
  }
  return JSON.stringify(content);
}

function cleanTimelineText(text) {
  if (!text) return '';
  // Strip leading timestamp like [Wed 2026-04-01 01:45 GMT+9]
  let cleaned = text.replace(/^\[.*?GMT[+-]\d+\]\s*/i, '');
  // Strip "OpenClaw runtime context (internal)..." blocks
  if (cleaned.startsWith('OpenClaw runtime context')) return '🔧 (내부 시스템 이벤트)';
  return cleaned;
}

async function loadTimeline() {
  const isFirst = !state.initialLoaded['timeline'];
  if (isFirst) showLoading('loading-timeline', true);
  const list = document.getElementById('timeline-list');

  try {
    const data = await apiFetch('/api/timeline');
    state.lastUpdate = new Date();
    updateLastUpdate();

    const items = Array.isArray(data) ? data : (data.messages || data.timeline || []);

    if (items.length === 0) {
      list.innerHTML = emptyState('💬', '타임라인 데이터 없음');
      return;
    }

    list.innerHTML = items.map(item => {
      // Extract sender from provenance.sourceSessionKey
      const senderRaw = extractAgentName(item.provenance?.sourceSessionKey);
      const sender = agentDisplayName(senderRaw);
      // Receiver is the agent that received the message
      const receiver = item.agentId ? agentDisplayName(item.agentId) : '';
      
      // Extract readable text from content
      const rawText = item.textPreview || extractTextContent(item.content);
      const preview = truncate(cleanTimelineText(rawText), 200);
      const ts = item.timestamp || item.createdAt || item.time;

      return `
        <div class="card timeline-item">
          <div class="timeline-header">
            <span class="timeline-time">${formatKST(ts)}</span>
            <div class="timeline-route">
              <span class="timeline-sender">${esc(sender)}</span>
              ${receiver ? `<span class="timeline-arrow">→</span><span class="timeline-receiver">${esc(receiver)}</span>` : ''}
            </div>
            <span style="margin-left:auto">${badge(item.status || 'done')}</span>
          </div>
          <div class="timeline-preview">${esc(preview)}</div>
        </div>
      `;
    }).join('');
    state.initialLoaded['timeline'] = true;
  } catch (err) {
    list.innerHTML = errorState(err);
  } finally {
    if (isFirst) showLoading('loading-timeline', false);
  }
}

// ─── Tab: Cron ────────────────────────────────────────────

async function loadCron() {
  const isFirst = !state.initialLoaded['cron'];
  if (isFirst) showLoading('loading-cron', true);
  const tbody = document.getElementById('cron-tbody');

  try {
    const data = await apiFetch('/api/cron');
    state.lastUpdate = new Date();
    updateLastUpdate();

    const jobs = Array.isArray(data) ? data : (data.jobs || data.crons || []);

    if (jobs.length === 0) {
      document.getElementById('cron-table-wrapper').innerHTML = emptyState('⏰', '크론잡 없음');
      return;
    }

    tbody.innerHTML = jobs.map(job => `
      <tr>
        <td>${esc(job.name || job.id || '-')}</td>
        <td><code style="font-size:12px;color:#a78bfa">${esc(job.schedule || '-')}</code></td>
        <td class="td-muted">${formatKSTFull(job.next)}</td>
        <td class="td-muted">${relativeTime(job.last || job.lastRun)}</td>
        <td>${badge(job.status)}</td>
        <td class="td-muted">${esc(job.agentId || job.target || job.agent || '-')}</td>
      </tr>
    `).join('');
    state.initialLoaded['cron'] = true;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--error);padding:24px">${err.message}</td></tr>`;
  } finally {
    if (isFirst) showLoading('loading-cron', false);
  }
}

// ─── Tab: Activity ────────────────────────────────────────

async function loadActivity() {
  const isFirst = !state.initialLoaded['activity'];
  if (isFirst) showLoading('loading-activity', true);
  const grid = document.getElementById('activity-grid');

  try {
    const data = await apiFetch('/api/agents');
    state.lastUpdate = new Date();
    updateLastUpdate();

    const agents = Array.isArray(data) ? data : (data.agents || []);

    if (agents.length === 0) {
      grid.innerHTML = emptyState('📊', '활동 데이터 없음');
      return;
    }

    // Group by agentId/key
    const grouped = {};
    for (const a of agents) {
      const key = a.agentId || a.key || a.name || '알 수 없음';
      if (!grouped[key]) {
        grouped[key] = {
          name: key,
          model: a.model || '-',
          sessions: 0,
          totalTokens: 0,
          totalCost: 0,
          lastActivity: null,
          status: a.status,
        };
      }
      grouped[key].sessions += 1;
      grouped[key].totalTokens += (a.totalTokens || 0);
      grouped[key].totalCost += (a.estimatedCostUsd || 0);

      const ts = a.endedAt || a.startedAt || a.lastActivity;
      if (ts && (!grouped[key].lastActivity || new Date(ts) > new Date(grouped[key].lastActivity))) {
        grouped[key].lastActivity = ts;
        grouped[key].status = a.status;
      }
    }

    const items = Object.values(grouped);

    grid.innerHTML = items.map(a => `
      <div class="card activity-card">
        <div class="activity-card-header">
          <div class="activity-agent-name">${esc(agentDisplayName(a.name))}</div>
          ${badge(a.status)}
        </div>
        <div class="activity-stats">
          <div class="activity-stat">
            <span class="activity-stat-label">오늘 세션</span>
            <span class="activity-stat-value">${a.sessions}</span>
          </div>
          <div class="activity-stat">
            <span class="activity-stat-label">총 토큰</span>
            <span class="activity-stat-value">${formatTokens(a.totalTokens)}</span>
          </div>
          <div class="activity-stat">
            <span class="activity-stat-label">총 비용</span>
            <span class="activity-stat-value">${formatCost(a.totalCost)}</span>
          </div>
          <div class="activity-stat">
            <span class="activity-stat-label">모델</span>
            <span class="activity-stat-value" style="font-size:12px;word-break:break-all">${esc(a.model)}</span>
          </div>
        </div>
        <div class="activity-last">
          🕐 마지막 활동: ${relativeTime(a.lastActivity)}
        </div>
      </div>
    `).join('');
    state.initialLoaded['activity'] = true;
  } catch (err) {
    grid.innerHTML = errorState(err);
  } finally {
    if (isFirst) showLoading('loading-activity', false);
  }
}

// ─── Tab: Library ─────────────────────────────────────────

function fileIcon(ext) {
  if (ext === '.md') return '📄';
  if (ext === '.json') return '📋';
  return '📁';
}

function simpleMarkdown(text) {
  if (!text) return '';
  let html = esc(text);

  // Code blocks (must be before inline code)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="md-code"><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Headers (# ## ###)
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Unordered lists (- item)
  html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/(<li class="md-li">.*<\/li>\n?)+/g, '<ul class="md-ul">$&</ul>');

  // Ordered lists (1. item)
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-li">$1</li>');

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="md-hr">');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

async function loadLibrary() {
  const isFirst = !state.initialLoaded['library'];
  if (isFirst) showLoading('loading-library', true);
  const container = document.getElementById('library-container');

  try {
    const data = await apiFetch('/api/library');
    state.lastUpdate = new Date();
    updateLastUpdate();

    const files = Array.isArray(data) ? data : (data.files || []);

    if (files.length === 0) {
      container.innerHTML = emptyState('📚', '파일이 없습니다');
      return;
    }

    container.innerHTML = `
      <div class="library-grid">
        ${files.map(f => `
          <div class="card library-card clickable-card" data-name="${esc(f.name)}">
            <div class="library-card-icon">${fileIcon(f.extension)}</div>
            <div class="library-card-info">
              <div class="library-card-name">${esc(f.name)}</div>
              <div class="library-card-meta">${formatFileSize(f.size)} · ${relativeTime(f.modified)}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="library-preview" id="library-preview"></div>
    `;

    // Attach click handlers
    container.querySelectorAll('.library-card').forEach(card => {
      card.addEventListener('click', () => loadLibraryFile(card.dataset.name));
    });
    state.initialLoaded['library'] = true;
  } catch (err) {
    container.innerHTML = errorState(err);
  } finally {
    if (isFirst) showLoading('loading-library', false);
  }
}

async function loadLibraryFile(name) {
  try {
    const res = await fetch(`/api/library/file?name=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const isMd = name.endsWith('.md');
    const rendered = isMd ? simpleMarkdown(text) : `<pre class="code-block"><code>${esc(text)}</code></pre>`;
    openBigModal(name, `<div class="md-body">${rendered}</div>`);
  } catch (err) {
    openBigModal('오류', `<div style="color:var(--error);padding:24px">${esc(err.message)}</div>`);
  }
}

// ─── Big Modal ────────────────────────────────────────────

function openBigModal(title, html) {
  // Remove existing modal
  const existing = document.getElementById('big-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'big-modal';
  overlay.innerHTML = `
    <div class="big-modal-overlay"></div>
    <div class="big-modal-container">
      <div class="big-modal-header">
        <span class="big-modal-title">${esc(title)}</span>
        <button class="big-modal-close" id="big-modal-close-btn">✕</button>
      </div>
      <div class="big-modal-body">${html}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Event listeners
  document.getElementById('big-modal-close-btn').addEventListener('click', closeBigModal);
  overlay.querySelector('.big-modal-overlay').addEventListener('click', closeBigModal);
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      closeBigModal();
      document.removeEventListener('keydown', escHandler);
    }
  });
}

function closeBigModal() {
  const modal = document.getElementById('big-modal');
  if (modal) modal.remove();
}

// ─── Tab: Active Sessions ─────────────────────────────────

async function loadActiveSessions() {
  const isFirst = !state.initialLoaded['activeSessions'];
  if (isFirst) showLoading('loading-active-sessions', true);
  const container = document.getElementById('active-sessions-container');

  try {
    const data = await apiFetch('/api/active-sessions');
    state.lastUpdate = new Date();
    updateLastUpdate();

    const sessions = Array.isArray(data) ? data : (data.sessions || []);

    if (sessions.length === 0) {
      container.innerHTML = emptyState('🔄', '현재 실행 중인 세션 없음');
      return;
    }

    container.innerHTML = `
      <div class="active-sessions-list">
        ${sessions.map(s => `
          <div class="card active-session-card">
            <div class="active-session-header">
              <span class="active-session-lamp">🟢</span>
              <span class="active-session-agent">${esc(agentDisplayName(s.agentId || 'unknown'))}</span>
              ${badge(s.status || 'running')}
            </div>
            <div class="active-session-meta">
              <div class="active-session-meta-item">
                <span class="meta-label">모델</span>
                <span class="meta-value">${esc(s.model || '-')}</span>
              </div>
              <div class="active-session-meta-item">
                <span class="meta-label">토큰</span>
                <span class="meta-value">${formatTokens(s.totalTokens)}</span>
              </div>
              <div class="active-session-meta-item">
                <span class="meta-label">세션</span>
                <span class="meta-value" style="font-size:10px;word-break:break-all">${esc(s.sessionId || '-')}</span>
              </div>
              <div class="active-session-meta-item">
                <span class="meta-label">경과</span>
                <span class="meta-value">${s.runtimeMs ? Math.floor(s.runtimeMs / 1000) + 's' : '-'}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    state.initialLoaded['activeSessions'] = true;
  } catch (err) {
    container.innerHTML = errorState(err);
  } finally {
    if (isFirst) showLoading('loading-active-sessions', false);
  }
}

// ─── Tab: Journal ─────────────────────────────────────────

async function loadJournal() {
  const isFirst = !state.initialLoaded['journal'];
  if (isFirst) showLoading('loading-journal', true);
  const container = document.getElementById('journal-container');

  try {
    const data = await apiFetch('/api/journal');
    state.lastUpdate = new Date();
    updateLastUpdate();

    const entries = Array.isArray(data) ? data : (data.entries || []);

    if (entries.length === 0) {
      container.innerHTML = emptyState('📝', '일지 파일 없음');
      return;
    }

    // Group by date
    const byDate = {};
    for (const entry of entries) {
      if (!byDate[entry.date]) byDate[entry.date] = [];
      byDate[entry.date].push(entry);
    }

    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    container.innerHTML = `
      <div class="journal-list">
        ${dates.map(date => `
          <div class="journal-date-group">
            <div class="journal-date-label">${esc(date)}</div>
            <div class="journal-cards">
              ${byDate[date].map(entry => `
                <div class="card journal-card clickable-card"
                     data-agent-id="${esc(entry.agentId)}"
                     data-filename="${esc(entry.filename)}">
                  <div class="journal-card-agent">${esc(agentDisplayName(entry.agentId))}</div>
                  <div class="journal-card-file">${esc(entry.filename)}</div>
                  <div class="journal-card-meta">${formatFileSize(entry.size)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Attach click handlers
    container.querySelectorAll('.journal-card').forEach(card => {
      card.addEventListener('click', () => openJournalFile(card.dataset.agentId, card.dataset.filename));
    });
    state.initialLoaded['journal'] = true;
  } catch (err) {
    container.innerHTML = errorState(err);
  } finally {
    if (isFirst) showLoading('loading-journal', false);
  }
}

async function openJournalFile(agentId, filename) {
  try {
    const res = await fetch(`/api/journal/${encodeURIComponent(agentId)}/${encodeURIComponent(filename)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const isMd = filename.endsWith('.md');
    const rendered = isMd ? simpleMarkdown(text) : `<pre class="code-block"><code>${esc(text)}</code></pre>`;
    const title = `${agentDisplayName(agentId)} — ${filename}`;
    openBigModal(title, `<div class="md-body">${rendered}</div>`);
  } catch (err) {
    openBigModal('오류', `<div style="color:var(--error);padding:24px">${esc(err.message)}</div>`);
  }
}

// ─── Helper HTML ──────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emptyState(icon, text) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><div class="empty-state-text">${text}</div></div>`;
}

function errorState(err) {
  return `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text" style="color:var(--error)">오류: ${esc(err.message)}</div></div>`;
}

// ─── Tab Switching ────────────────────────────────────────

const TAB_LOADERS = {
  agents: loadAgents,
  timeline: loadTimeline,
  cron: loadCron,
  activity: loadActivity,
  library: loadLibrary,
  activeSessions: loadActiveSessions,
  journal: loadJournal,
};

function switchTab(tabId) {
  if (state.activeTab === tabId && state.pollingTimer) return;

  // Stop old polling
  if (state.pollingTimer) {
    clearInterval(state.pollingTimer);
    state.pollingTimer = null;
  }

  // Update menu
  document.querySelectorAll('.menu-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });

  // Update panels
  document.querySelectorAll('.tab-panel').forEach(el => {
    el.classList.toggle('active', el.id === 'tab-' + tabId);
  });

  // Update header title
  const titleEl = document.getElementById('header-title');
  if (titleEl) titleEl.textContent = TAB_TITLES[tabId] || tabId;

  state.activeTab = tabId;

  // Load immediately
  const loader = TAB_LOADERS[tabId];
  if (loader) {
    loader();
    // Poll every 10 seconds
    state.pollingTimer = setInterval(loader, 30000);
  }
}

// ─── Init ─────────────────────────────────────────────────

function init() {
  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Sidebar menu clicks
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.dataset.tab);
    });
  });

  // Start with agents tab
  switchTab('agents');
}

// ─── Detail Panel Tab Switcher ─────────────────────────────

function initDetailPanelTabs() {
  document.querySelectorAll('.detail-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!detailPanelState.data) return;
      renderDetailPanelTab(btn.dataset.tab, detailPanelState.data);
    });
  });
}

// ─── Init ─────────────────────────────────────────────────

function init() {
  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Sidebar menu clicks
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.dataset.tab);
    });
  });

  // Init detail panel tabs
  initDetailPanelTabs();

  // Close detail panel on backdrop click
  const panel = document.getElementById('detail-panel');
  if (panel) {
    panel.addEventListener('click', (e) => {
      if (e.target === panel) closeDetailPanel();
    });
  }

  // Start with agents tab
  switchTab('agents');
}

document.addEventListener('DOMContentLoaded', init);
