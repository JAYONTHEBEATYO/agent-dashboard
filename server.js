const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { promisify } = require('util');
const { glob } = require('fs/promises');

const execAsync = promisify(exec);
const app = express();
const PORT = 3001;

// CORS
app.use((req, res, next) => {
  res.header("Cross-Origin-Opener-Policy", "same-origin");
  res.header("Cross-Origin-Embedder-Policy", "require-corp");
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Utility: run openclaw sessions --json --all-agents
async function fetchAllSessions() {
  const { stdout } = await execAsync('openclaw sessions --json --all-agents', { timeout: 15000 });
  const data = JSON.parse(stdout);
  return data.sessions || [];
}

// Simple in-memory cache for fetchAllSessions (10s TTL)
let _sessionsCache = null;
let _sessionsCacheTime = 0;
const SESSIONS_CACHE_TTL = 30000; // 30 seconds

async function fetchAllSessionsCached() {
  const now = Date.now();
  if (_sessionsCache && (now - _sessionsCacheTime) < SESSIONS_CACHE_TTL) {
    return _sessionsCache;
  }
  _sessionsCache = await fetchAllSessions();
  _sessionsCacheTime = now;
  return _sessionsCache;
}

// Utility: glob JSONL files for all agents
async function getAllJsonlFiles() {
  const agentsDir = '/home/thefool/.openclaw/agents';
  try {
    const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    
    const files = [];
    for (const agentId of agentDirs) {
      const sessionsDir = path.join(agentsDir, agentId, 'sessions');
      if (!fs.existsSync(sessionsDir)) continue;
      const jsonlFiles = fs.readdirSync(sessionsDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ agentId, filePath: path.join(sessionsDir, f), sessionId: f.replace('.jsonl', '') }));
      files.push(...jsonlFiles);
    }
    return files;
  } catch (e) {
    return [];
  }
}

// Utility: parse a JSONL file and return all message objects
async function parseJsonlFile(filePath) {
  return new Promise((resolve) => {
    const messages = [];
    if (!fs.existsSync(filePath)) return resolve(messages);
    
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const obj = JSON.parse(trimmed);
        messages.push(obj);
      } catch {
        // skip invalid lines
      }
    });
    
    rl.on('close', () => resolve(messages));
    rl.on('error', () => resolve(messages));
  });
}

// Fast: get last line of JSONL file only
function getLastJsonlLine(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length === 0) return null;
    const last = lines[lines.length - 1].trim();
    if (!last) return null;
    return JSON.parse(last);
  } catch {
    return null;
  }
}

// GET /api/agents — agent list with latest session state
app.get('/api/agents', async (req, res) => {
  try {
    const sessions = await fetchAllSessionsCached();
    
    // Group sessions by agentId, pick the most recent (first, since sorted by updatedAt desc)
    const agentMap = {};
    for (const session of sessions) {
      const agentId = session.agentId;
      if (!agentId) continue;
      if (!agentMap[agentId] || session.updatedAt > agentMap[agentId].latestUpdatedAt) {
        agentMap[agentId] = {
          agentId,
          latestSessionKey: session.key,
          latestSessionId: session.sessionId,
          latestUpdatedAt: session.updatedAt,
          model: session.model,
          modelProvider: session.modelProvider,
          totalTokens: session.totalTokens,
          inputTokens: session.inputTokens,
          outputTokens: session.outputTokens,
          estimatedCostUsd: session.estimatedCostUsd || null,
          contextTokens: session.contextTokens,
          sessionCount: 0,
          sessions: []
        };
      }
      agentMap[agentId].sessionCount++;
      const isSubagent = session.key && session.key.includes(':subagent:');
      if (isSubagent) {
        agentMap[agentId].subagentCount = (agentMap[agentId].subagentCount || 0) + 1;
      }
      // Only keep top 3 sessions per agent for grid display
      if (agentMap[agentId].sessions.length < 3) {
        agentMap[agentId].sessions.push({
          key: session.key,
          sessionId: session.sessionId,
          updatedAt: session.updatedAt,
          ageMs: session.ageMs,
          totalTokens: session.totalTokens,
          model: session.model,
          kind: session.kind,
          isSubagent,
        });
      }
    }
    
    const now = Date.now();
    const agents = Object.values(agentMap).sort((a, b) => b.latestUpdatedAt - a.latestUpdatedAt).map(agent => {
      const ageMs = now - agent.latestUpdatedAt;
      let status = 'unknown';
      let statusLabel = '알 수 없음';
      if (ageMs < 2 * 60 * 1000) {
        status = 'active';
        statusLabel = '작업중';
      } else if (ageMs < 30 * 60 * 1000) {
        status = 'idle';
        statusLabel = '대기중';
      } else if (ageMs < 24 * 60 * 60 * 1000) {
        status = 'sleeping';
        statusLabel = '휴면';
      } else {
        status = 'offline';
        statusLabel = '오프라인';
      }
      const lastActivityAgo = ageMs < 60000
        ? `${Math.floor(ageMs/1000)}초 전`
        : ageMs < 3600000
          ? `${Math.floor(ageMs/60000)}분 전`
          : ageMs < 86400000
            ? `${Math.floor(ageMs/3600000)}시간 전`
            : `${Math.floor(ageMs/86400000)}일 전`;

      // Get current task from latest session's last message (only for active/idle agents)
      let currentTask = '';
      if (ageMs < 30 * 60 * 1000 && agent.latestSessionId) {
        try {
          const sessionsDir = `/home/thefool/.openclaw/agents/${agent.agentId}/sessions`;
          const jsonlPath = path.join(sessionsDir, `${agent.latestSessionId}.jsonl`);
          const lastMsg = getLastJsonlLine(jsonlPath);
          if (lastMsg) {
            const content = lastMsg.message?.content || lastMsg.content || '';
            let text = '';
            if (Array.isArray(content)) {
              text = content.filter(c => c.type === 'text' && c.text).map(c => c.text).join('\n');
            } else if (typeof content === 'string') {
              text = content;
            } else if (typeof content === 'object' && content !== null) {
              text = content.text || '';
            }
            if (text) {
              // Remove internal template markers, tool artifacts, system messages
              text = text.replace(/\$\{[^}]+\}/g, ' ');
              text = text.replace(/\[\[[^\]]+\]\]/g, ' ');
              text = text.replace(/```[\s\S]*?```/g, ' ');
              // Skip Conversation info / system metadata / command output
              text = text.replace(/^Conversation info[\s\S]*$/gm, ' ');
              text = text.replace(/^Command (still )?running[\s\S]*$/gm, ' ');
              text = text.replace(/^System:[\s\S]*$/gm, ' ');
              text = text.replace(/^\[.*?\][^\[]*$/gm, ' '); // skip [prefix] lines
              // Take last meaningful line
              const lines = text.split('\n').filter(l => {
                const t = l.trim();
                return t.length > 8 && !t.startsWith('{') && !t.startsWith('[[') && !t.startsWith('Command');
              });
              text = lines[lines.length - 1] || lines[0] || '';
              text = text.replace(/\s+/g, ' ').trim();
              if (text.length > 10) {
                currentTask = text.length > 45 ? text.slice(0, 45) + '…' : text;
              }
            }
          }
        } catch {}
      }

      return { ...agent, status, statusLabel, lastActivityAgo, ageMs, currentTask };
    });
    res.json({ agents, count: agents.length });
  } catch (err) {
    console.error('/api/agents error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions — recent active sessions list
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await fetchAllSessions();
    // Return top 50 sessions sorted by updatedAt desc
    const sorted = sessions
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 50);
    res.json({ sessions: sorted, count: sorted.length });
  } catch (err) {
    console.error('/api/sessions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cron — cron jobs status
app.get('/api/cron', async (req, res) => {
  try {
    const { stdout } = await execAsync('openclaw cron list --json', { timeout: 15000 });
    const data = JSON.parse(stdout);
    // data.jobs or data itself
    const jobs = data.jobs || (Array.isArray(data) ? data : []);
    res.json({ jobs, count: jobs.length });
  } catch (err) {
    console.error('/api/cron error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/timeline — recent inter_session messages, latest 50, time-sorted
app.get('/api/timeline', async (req, res) => {
  try {
    const files = await getAllJsonlFiles();
    const interSessionMessages = [];
    
    // Process files in parallel (batched to avoid fd exhaustion)
    const BATCH_SIZE = 10;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(async ({ agentId, filePath, sessionId }) => {
        const messages = await parseJsonlFile(filePath);
        return messages
          .filter(obj => 
            obj.type === 'message' && 
            obj.message && 
            obj.message.provenance && 
            obj.message.provenance.kind === 'inter_session'
          )
          .map(obj => ({
            agentId,
            sessionId,
            messageId: obj.id,
            timestamp: obj.message.timestamp || obj.timestamp,
            timestampIso: obj.timestamp,
            role: obj.message.role,
            content: obj.message.content,
            provenance: obj.message.provenance,
            // Extract clean text preview
            textPreview: (() => {
              let text = '';
              if (Array.isArray(obj.message.content)) {
                text = obj.message.content
                  .filter(c => c.type === 'text' && c.text)
                  .map(c => c.text)
                  .join('\n');
              } else if (typeof obj.message.content === 'string') {
                text = obj.message.content;
              }
              // Strip leading timestamp
              text = text.replace(/^\[.*?GMT[+-]\d+\]\s*/i, '');
              return text.slice(0, 2000);
            })(),
            fullText: (() => {
              let text = '';
              if (Array.isArray(obj.message.content)) {
                text = obj.message.content
                  .filter(c => c.type === 'text' && c.text)
                  .map(c => c.text)
                  .join('\n');
              } else if (typeof obj.message.content === 'string') {
                text = obj.message.content;
              }
              text = text.replace(/^\[.*?GMT[+-]\d+\]\s*/i, '');
              return text;
            })()
          }));
      }));
      interSessionMessages.push(...results.flat());
    }
    
    // Sort by timestamp descending, take top 50
    const sorted = interSessionMessages
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 50);
    
    res.json({ timeline: sorted, count: sorted.length });
  } catch (err) {
    console.error('/api/timeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:agentId/detail — workspace, config, sessions, recent messages
app.get('/api/agents/:agentId/detail', async (req, res) => {
  try {
    const { agentId } = req.params;

    // Workspace files
    const workspacePath = `/home/thefool/.openclaw/workspace-${agentId}`;
    let workspaceFiles = [];
    try {
      const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
      workspaceFiles = entries.map(entry => {
        const fullPath = path.join(workspacePath, entry.name);
        let size = 0, modified = null;
        try {
          const stat = fs.statSync(fullPath);
          size = stat.size;
          modified = stat.mtime.toISOString();
        } catch {}
        return { name: entry.name, isDir: entry.isDirectory(), size, modified };
      });
    } catch {}

    // Agent config files
    const agentConfigPath = `/home/thefool/.openclaw/agents/${agentId}/agent`;
    let agentConfigFiles = [];
    try {
      const entries = fs.readdirSync(agentConfigPath, { withFileTypes: true });
      agentConfigFiles = entries.map(entry => {
        const fullPath = path.join(agentConfigPath, entry.name);
        let size = 0, modified = null;
        try {
          const stat = fs.statSync(fullPath);
          size = stat.size;
          modified = stat.mtime.toISOString();
        } catch {}
        return { name: entry.name, isDir: entry.isDirectory(), size, modified };
      });
    } catch {}

    // Sessions filtered by agentId, recent 10
    const sessions = await fetchAllSessions();
    const filtered = sessions
      .filter(s => s.agentId === agentId)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 10)
      .map(s => ({
        key: s.key,
        sessionId: s.sessionId,
        updatedAt: s.updatedAt,
        totalTokens: s.totalTokens,
        model: s.model,
        kind: s.kind,
        status: s.status,
      }));

    // Recent messages from most recent session's JSONL
    let recentMessages = [];
    if (filtered.length > 0) {
      const latestSession = filtered[0];
      const sessionsDir = `/home/thefool/.openclaw/agents/${agentId}/sessions`;
      const jsonlPath = path.join(sessionsDir, `${latestSession.sessionId}.jsonl`);
      try {
        const messages = await parseJsonlFile(jsonlPath);
        recentMessages = messages
          .slice(-20)
          .map(msg => {
            let text = '';
            const content = msg.message?.content || msg.content;
            if (Array.isArray(content)) {
              text = content.filter(c => c.type === 'text' && c.text).map(c => c.text).join('\n');
            } else if (typeof content === 'string') {
              text = content;
            } else if (typeof content === 'object' && content !== null) {
              text = content.text || JSON.stringify(content);
            }
            return {
              role: msg.message?.role || msg.role || 'unknown',
              text: truncateText(text, 300),
              timestamp: msg.message?.timestamp || msg.timestamp,
            };
          });
      } catch {}
    }

    res.json({
      workspace: { path: workspacePath, files: workspaceFiles },
      agentConfig: { path: agentConfigPath, files: agentConfigFiles },
      sessions: filtered,
      recentMessages,
    });
  } catch (err) {
    console.error(`/api/agents/${req.params.agentId}/detail error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:agentId/subagents — all subagent sessions for this agent
app.get('/api/agents/:agentId/subagents', async (req, res) => {
  try {
    const { agentId } = req.params;
    const sessions = await fetchAllSessions();
    const agentSessions = sessions
      .filter(s => s.agentId === agentId && s.key && s.key.includes(':subagent:'))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const subagents = agentSessions.map(s => {
      // Use ageMs as proxy: updated within 2min = active
      const ageMs = s.ageMs || 0;
      const isActive = ageMs < 2 * 60 * 1000;
      let task = '작업중';
      if (!isActive) {
        task = '대기중';
      } else {
        // Extract hint from session key (e.g. cron job name, subagent purpose)
        const key = s.key || '';
        // Try to get meaningful task name from key parts
        const parts = key.split(':');
        let hint = '';
        if (parts.length >= 3) {
          hint = parts[parts.length - 1];
          // Clean up UUID-like strings
          if (hint.length > 15) hint = '';
        }
        task = hint || '서브작업 진행중';
      }
      let lastActivity = '';
      try {
        const sessionsDir = `/home/thefool/.openclaw/agents/${agentId}/sessions`;
        const jsonlPath = path.join(sessionsDir, `${s.sessionId}.jsonl`);
        const stat = fs.statSync(jsonlPath);
        lastActivity = stat.mtime.toISOString();
      } catch {}
      return {
        sessionId: s.sessionId,
        key: s.key,
        model: s.model,
        modelOverride: s.modelOverride,
        status: s.status,
        updatedAt: s.updatedAt,
        ageMs: s.ageMs,
        totalTokens: s.totalTokens,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        task,
        isActive,
        lastActivity,
      };
    });
    res.json({ subagents, count: subagents.length });
  } catch (err) {
    console.error(`/api/agents/${req.params.agentId}/subagents error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/library — list files AND folders in team-library directory
app.get('/api/library', async (req, res) => {
  try {
    const libraryDir = '/home/thefool/team-library/';
    if (!fs.existsSync(libraryDir)) {
      return res.json({ files: [], folders: [], count: 0 });
    }
    const entries = fs.readdirSync(libraryDir, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile())
      .map(e => {
        const fullPath = path.join(libraryDir, e.name);
        const stat = fs.statSync(fullPath);
        const ext = path.extname(e.name).toLowerCase();
        return {
          name: e.name,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          extension: ext,
        };
      });
    const folders = entries
      .filter(e => e.isDirectory())
      .map(e => ({ name: e.name }));
    res.json({ files, folders, count: files.length + folders.length });
  } catch (err) {
    console.error('/api/library error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/library/tree — recursive folder tree for team-library
app.get('/api/library/tree', async (req, res) => {
  try {
    const libraryDir = '/home/thefool/team-library/';
    function buildTree(dir, base = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const result = [];
      for (const e of entries) {
        const relPath = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) {
          result.push({ name: e.name, path: relPath, type: 'folder', children: buildTree(path.join(dir, e.name), relPath) });
        } else {
          const fullPath = path.join(dir, e.name);
          const stat = fs.statSync(fullPath);
          result.push({ name: e.name, path: relPath, type: 'file', size: stat.size, modified: stat.mtime.toISOString(), extension: path.extname(e.name).toLowerCase() });
        }
      }
      return result;
    }
    const tree = buildTree(libraryDir);
    res.json({ tree });
  } catch (err) {
    console.error('/api/library/tree error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/library/ls — list contents of a specific folder path
app.get('/api/library/ls', async (req, res) => {
  try {
    const libraryDir = '/home/thefool/team-library/';
    const requestedPath = req.query.path || '';
    // Security: prevent path traversal
    const fullDir = path.join(libraryDir, requestedPath);
    if (!path.resolve(fullDir).startsWith(path.resolve(libraryDir))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!fs.existsSync(fullDir)) {
      return res.json({ files: [], folders: [], count: 0 });
    }
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    const files = entries.filter(e => e.isFile()).map(e => {
      const fullPath = path.join(fullDir, e.name);
      const stat = fs.statSync(fullPath);
      return { name: e.name, size: stat.size, modified: stat.mtime.toISOString(), extension: path.extname(e.name).toLowerCase() };
    });
    const folders = entries.filter(e => e.isDirectory()).map(e => ({ name: e.name }));
    res.json({ files, folders, count: files.length + folders.length });
  } catch (err) {
    console.error('/api/library/ls error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/library/file — serve a file from team-library with security check
app.get('/api/library/file', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ error: 'name query param required' });
    }

    // Security: path traversal prevention
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return res.status(403).json({ error: 'Forbidden: invalid filename' });
    }

    const libraryDir = '/home/thefool/team-library/';
    const filePath = path.join(libraryDir, name);

    // Ensure it's under libraryDir
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(libraryDir)) {
      return res.status(403).json({ error: 'Forbidden: path outside library' });
    }

    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Directory not allowed' });
    }

    // Max 100KB
    if (stat.size > 100 * 1024) {
      return res.status(400).json({ error: 'File too large (max 100KB)' });
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    res.type('text/plain; charset=utf-8').send(content);
  } catch (err) {
    console.error('/api/library/file error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/active-sessions — running sessions only
app.get('/api/active-sessions', async (req, res) => {
  try {
    const sessions = await fetchAllSessions();
    const running = sessions
      .filter(s => s.status === 'running' || s.status === 'active')
      .map(s => ({
        agentId: s.agentId,
        sessionId: s.sessionId,
        key: s.key,
        model: s.model,
        totalTokens: s.totalTokens,
        startedAt: s.startedAt,
        runtimeMs: s.runtimeMs || s.ageMs,
      }));
    res.json({ sessions: running, count: running.length });
  } catch (err) {
    console.error('/api/active-sessions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subagents — all sessions grouped by agent with subagent tree
app.get('/api/subagents', async (req, res) => {
  try {
    const sessions = await fetchAllSessions();
    const result = {};
    for (const s of sessions) {
      const aid = s.agentId || 'unknown';
      if (!result[aid]) result[aid] = [];
      result[aid].push({
        agentId: aid,
        sessionId: s.sessionId,
        key: s.key,
        kind: s.kind,
        model: s.model,
        modelOverride: s.modelOverride,
        status: s.status,
        updatedAt: s.updatedAt,
        ageMs: s.ageMs,
        totalTokens: s.totalTokens,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
      });
    }
    res.json({ agents: result, totalSessions: sessions.length });
  } catch (err) {
    console.error('/api/subagents error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/journal — list all agent memory/*.md files
app.get('/api/journal', async (req, res) => {
  try {
    const agentsDir = '/home/thefool/.openclaw/agents';
    const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const entries = [];
    for (const agentId of agentDirs) {
      const memoryDir = `/home/thefool/.openclaw/workspace-${agentId}/memory`;
      if (!fs.existsSync(memoryDir)) continue;
      try {
        const files = fs.readdirSync(memoryDir, { withFileTypes: true })
          .filter(f => f.isFile() && f.name.endsWith('.md'));
        for (const file of files) {
          const fullPath = path.join(memoryDir, file.name);
          const stat = fs.statSync(fullPath);
          // Extract date from filename: YYYY-MM-DD.md
          const dateMatch = file.name.match(/^(\d{4}-\d{2}-\d{2})/);
          entries.push({
            agentId,
            date: dateMatch ? dateMatch[1] : file.name.replace('.md', ''),
            filename: file.name,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }
      } catch {}
    }

    // Sort by date descending
    entries.sort((a, b) => b.date.localeCompare(a.date));
    res.json({ entries, count: entries.length });
  } catch (err) {
    console.error('/api/journal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/journal/:agentId/:filename — serve journal file content
app.get('/api/journal/:agentId/:filename', async (req, res) => {
  try {
    const { agentId, filename } = req.params;

    // Security: no path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(403).json({ error: 'Forbidden: invalid filename' });
    }

    const filePath = `/home/thefool/.openclaw/workspace-${agentId}/memory/${filename}`;
    const resolved = path.resolve(filePath);

    if (!resolved.startsWith(`/home/thefool/.openclaw/workspace-${agentId}/memory/`)) {
      return res.status(403).json({ error: 'Forbidden: path outside journal directory' });
    }

    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(resolved);
    if (stat.size > 100 * 1024) {
      return res.status(400).json({ error: 'File too large (max 100KB)' });
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    res.type('text/plain; charset=utf-8').send(content);
  } catch (err) {
    console.error(`/api/journal/:agentId/:filename error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:agentId/file — serve file content with security check
app.get('/api/agents/:agentId/file', async (req, res) => {
  try {
    const { agentId } = req.params;
    const requestedPath = req.query.path;

    if (!requestedPath) {
      return res.status(400).json({ error: 'path query param required' });
    }

    // Security: path must be under /home/thefool/.openclaw/
    const resolved = path.resolve(requestedPath);
    if (!resolved.startsWith('/home/thefool/.openclaw/')) {
      return res.status(403).json({ error: 'Forbidden: path outside allowed directory' });
    }

    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Directory not allowed' });
    }

    // Max 50KB
    if (stat.size > 50 * 1024) {
      return res.status(400).json({ error: 'File too large (max 50KB)' });
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    res.type('text/plain').send(content);
  } catch (err) {
    console.error(`/api/agents/${req.params.agentId}/file error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper: truncate text
function truncateText(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// GET /api/activity/:agentId — today's session stats for given agent
app.get('/api/activity/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const sessions = await fetchAllSessions();
    
    // Today in KST (UTC+9)
    const nowMs = Date.now();
    const KST_OFFSET = 9 * 60 * 60 * 1000;
    const todayStartKST = new Date(nowMs + KST_OFFSET);
    todayStartKST.setUTCHours(0, 0, 0, 0);
    const todayStartMs = todayStartKST.getTime() - KST_OFFSET;
    
    const agentSessions = sessions.filter(s => 
      s.agentId === agentId && 
      s.updatedAt >= todayStartMs
    );
    
    const totalTokens = agentSessions.reduce((sum, s) => sum + (s.totalTokens || 0), 0);
    const inputTokens = agentSessions.reduce((sum, s) => sum + (s.inputTokens || 0), 0);
    const outputTokens = agentSessions.reduce((sum, s) => sum + (s.outputTokens || 0), 0);
    const estimatedCostUsd = agentSessions.reduce((sum, s) => sum + (s.estimatedCostUsd || 0), 0);
    const lastActivity = agentSessions.length > 0 
      ? Math.max(...agentSessions.map(s => s.updatedAt || 0))
      : null;
    
    res.json({
      agentId,
      today: {
        sessionCount: agentSessions.length,
        totalTokens,
        inputTokens,
        outputTokens,
        estimatedCostUsd,
        lastActivityAt: lastActivity,
        sessions: agentSessions.map(s => ({
          key: s.key,
          sessionId: s.sessionId,
          updatedAt: s.updatedAt,
          totalTokens: s.totalTokens,
          model: s.model
        }))
      }
    });
  } catch (err) {
    console.error(`/api/activity/${req.params.agentId} error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Agent Dashboard server running on http://localhost:${PORT}`);
});
