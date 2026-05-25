const { Router } = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const { processQuarter } = require('../lib/simulation');

module.exports = function(db) {
  const router = Router();
  const auth = authMiddleware(db);

  // Get game state
  router.get('/:classId/state', auth, (req, res) => {
    const gameState = db.prepare('SELECT * FROM game_state WHERE classroom_id = ?').get(req.params.classId);
    if (!gameState) return res.status(404).json({ error: '教室不存在' });

    const totalParticipants = db.prepare('SELECT COUNT(*) as c FROM participants WHERE classroom_id = ?')
      .get(req.params.classId).c;
    const submittedThisQuarter = db.prepare(
      'SELECT COUNT(DISTINCT participant_id) as c FROM decisions WHERE classroom_id = ? AND year = ? AND quarter = ?'
    ).get(req.params.classId, gameState.year, gameState.quarter).c;

    res.json({ ...gameState, totalParticipants, submittedThisQuarter });
  });

  // Advance quarter (teacher)
  router.post('/:classId/advance', auth, teacherOnly, (req, res) => {
    const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(req.params.classId);
    if (!classroom) return res.status(404).json({ error: '教室不存在' });
    if (classroom.owner !== req.session.teacher_username) {
      return res.status(403).json({ error: '只能操作自己的教室' });
    }

    const result = processQuarter(db, req.params.classId);
    res.json(result);
  });

  // Toggle lock
  router.post('/:classId/lock', auth, teacherOnly, (req, res) => {
    const gameState = db.prepare('SELECT * FROM game_state WHERE classroom_id = ?').get(req.params.classId);
    if (!gameState) return res.status(404).json({ error: '教室不存在' });

    const newLocked = gameState.locked ? 0 : 1;
    db.prepare('UPDATE game_state SET locked = ? WHERE classroom_id = ?').run(newLocked, req.params.classId);

    db.prepare('INSERT INTO hidden_logs (classroom_id, message) VALUES (?, ?)')
      .run(req.params.classId, newLocked ? '教师锁定了决策提交' : '教师解锁了决策提交');

    res.json({ locked: !!newLocked });
  });

  // Reset classroom data
  router.post('/:classId/reset', auth, teacherOnly, (req, res) => {
    const classId = req.params.classId;
    const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(classId);
    if (!classroom || classroom.owner !== req.session.teacher_username) {
      return res.status(403).json({ error: '无权操作' });
    }

    db.prepare('DELETE FROM alliance_requests WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM alliances WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM offers WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM ratings WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM hidden_logs WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM news_log WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM results WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM decisions WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM participants WHERE classroom_id = ?').run(classId);
    db.prepare('DELETE FROM teams WHERE classroom_id = ?').run(classId);
    db.prepare('UPDATE game_state SET year = 1, quarter = 1, locked = 0 WHERE classroom_id = ?').run(classId);

    res.json({ success: true });
  });

  // Broadcast
  router.post('/:classId/broadcast', auth, teacherOnly, (req, res) => {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: '请填写标题和内容' });

    db.prepare('INSERT INTO news_log (classroom_id, title, content) VALUES (?, ?, ?)')
      .run(req.params.classId, title, content);

    db.prepare('INSERT INTO hidden_logs (classroom_id, message) VALUES (?, ?)')
      .run(req.params.classId, `教师发送广播: ${title}`);

    res.json({ success: true });
  });

  // Random event
  router.post('/:classId/random-event', auth, teacherOnly, (req, res) => {
    const events = [
      { title: '政策利好', content: '政府出台无人机产业扶持政策，行业整体景气度上升' },
      { title: '原材料涨价', content: '全球芯片短缺导致核心零部件价格上涨15%，成本压力增大' },
      { title: '竞争加剧', content: '新厂商涌入市场，价格战一触即发，利润空间受到挤压' }
    ];
    const event = events[Math.floor(Math.random() * events.length)];

    db.prepare('INSERT INTO news_log (classroom_id, title, content) VALUES (?, ?, ?)')
      .run(req.params.classId, event.title, event.content);

    res.json(event);
  });

  // Get rankings
  router.get('/:classId/rankings', auth, (req, res) => {
    const teams = db.prepare('SELECT id, name, score, cash, market_share, tech_level, intel_accuracy FROM teams WHERE classroom_id = ? ORDER BY score DESC')
      .all(req.params.classId);
    res.json(teams);
  });

  // Get news
  router.get('/:classId/news', auth, (req, res) => {
    const news = db.prepare('SELECT * FROM news_log WHERE classroom_id = ? ORDER BY id DESC LIMIT 50')
      .all(req.params.classId);
    res.json(news);
  });

  // Get hidden logs (teacher only)
  router.get('/:classId/logs', auth, teacherOnly, (req, res) => {
    const logs = db.prepare('SELECT * FROM hidden_logs WHERE classroom_id = ? ORDER BY id DESC LIMIT 100')
      .all(req.params.classId);
    res.json(logs);
  });

  return router;
};
