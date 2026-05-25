const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth');

module.exports = function(db) {
  const router = Router();
  const auth = authMiddleware(db);

  // Submit decision
  router.post('/', auth, (req, res) => {
    if (req.session.user_type !== 'student') {
      return res.status(403).json({ error: '只有学生可以提交决策' });
    }

    const { decisions } = req.body;
    if (!decisions) return res.status(400).json({ error: '缺少决策数据' });

    const { classroom_id, team_id, participant_id, role } = req.session;

    const gameState = db.prepare('SELECT * FROM game_state WHERE classroom_id = ?').get(classroom_id);
    if (!gameState) return res.status(404).json({ error: '游戏状态不存在' });
    if (gameState.locked) return res.status(400).json({ error: '当前已锁定，无法提交' });

    const existing = db.prepare(
      'SELECT id FROM decisions WHERE team_id = ? AND participant_id = ? AND role = ? AND year = ? AND quarter = ?'
    ).get(team_id, participant_id, role, gameState.year, gameState.quarter);
    if (existing) return res.status(400).json({ error: '本季度已提交过决策' });

    db.prepare(`INSERT INTO decisions (classroom_id, team_id, participant_id, role, year, quarter, decisions_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      classroom_id, team_id, participant_id, role,
      gameState.year, gameState.quarter, JSON.stringify(decisions)
    );

    db.prepare('UPDATE participants SET decision_count = decision_count + 1 WHERE id = ?').run(participant_id);
    const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(participant_id);

    res.json({ success: true, decisionCount: participant.decision_count });
  });

  // Check if submitted this quarter
  router.get('/check', auth, (req, res) => {
    if (req.session.user_type !== 'student') {
      return res.status(403).json({ error: '只有学生可以查询' });
    }

    const { classroom_id, team_id, participant_id, role } = req.session;
    const gameState = db.prepare('SELECT * FROM game_state WHERE classroom_id = ?').get(classroom_id);
    if (!gameState) return res.json({ submitted: false });

    const existing = db.prepare(
      'SELECT id FROM decisions WHERE team_id = ? AND participant_id = ? AND role = ? AND year = ? AND quarter = ?'
    ).get(team_id, participant_id, role, gameState.year, gameState.quarter);

    res.json({ submitted: !!existing, year: gameState.year, quarter: gameState.quarter });
  });

  // Update risk value
  router.post('/risk', auth, (req, res) => {
    if (req.session.user_type !== 'student') {
      return res.status(403).json({ error: '只有学生可以更新' });
    }

    const { risk_value } = req.body;
    if (risk_value === undefined || risk_value < 1 || risk_value > 7) {
      return res.status(400).json({ error: '风险偏好值需在1-7之间' });
    }

    const gameState = db.prepare('SELECT * FROM game_state WHERE classroom_id = ?').get(req.session.classroom_id);
    const quarterStr = `${gameState.year}-${gameState.quarter}`;

    db.prepare('UPDATE participants SET risk_value = ?, last_risk_quarter = ? WHERE id = ?')
      .run(risk_value, quarterStr, req.session.participant_id);

    res.json({ success: true });
  });

  // Get all decisions for a classroom (teacher view)
  router.get('/classroom/:classId', auth, (req, res) => {
    if (req.session.user_type !== 'teacher') {
      return res.status(403).json({ error: '需要教师权限' });
    }
    const { year, quarter } = req.query;
    let query = 'SELECT d.*, p.student_id, p.role as p_role, t.name as team_name FROM decisions d JOIN participants p ON d.participant_id = p.id JOIN teams t ON d.team_id = t.id WHERE d.classroom_id = ?';
    const params = [req.params.classId];

    if (year) { query += ' AND d.year = ?'; params.push(parseInt(year)); }
    if (quarter) { query += ' AND d.quarter = ?'; params.push(parseInt(quarter)); }
    query += ' ORDER BY d.created_at DESC';

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  });

  return router;
};
