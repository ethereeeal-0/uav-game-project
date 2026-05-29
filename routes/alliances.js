const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth');

module.exports = function(db) {
  const router = Router();
  const auth = authMiddleware(db);

  // Get alliances for a team
  router.get('/team/:teamId', auth, (req, res) => {
    const alliances = db.prepare(`
      SELECT a.*, 
             CASE WHEN a.from_team_id = ? THEN a.to_team_id ELSE a.from_team_id END AS partner_id,
             CASE WHEN a.from_team_id = ? THEN t2.name ELSE t1.name END AS partner_name
      FROM alliances a
      JOIN teams t1 ON a.from_team_id = t1.id
      JOIN teams t2 ON a.to_team_id = t2.id
      WHERE (a.from_team_id = ? OR a.to_team_id = ?) AND a.status = 'active'
    `).all(req.params.teamId, req.params.teamId, req.params.teamId, req.params.teamId);
    res.json(alliances);
  });

  // Get all alliances in classroom (teacher)
  router.get('/classroom/:classId', auth, (req, res) => {
    const alliances = db.prepare('SELECT * FROM alliances WHERE classroom_id = ? ORDER BY created_at DESC')
      .all(req.params.classId);
    res.json(alliances);
  });

  // Send alliance request
  router.post('/requests', auth, (req, res) => {
    if (req.session.user_type !== 'student') {
      return res.status(403).json({ error: '需要学生身份' });
    }

    const { to_team_id, field, type } = req.body;
    if (!to_team_id || !field || !type) {
      return res.status(400).json({ error: '缺少参数' });
    }

    const { classroom_id, team_id } = req.session;

    const existingAlliance = db.prepare(`
      SELECT id FROM alliances
      WHERE classroom_id = ?
        AND status = 'active'
        AND field = ?
        AND type = ?
        AND ((from_team_id = ? AND to_team_id = ?) OR (from_team_id = ? AND to_team_id = ?))
    `).get(classroom_id, field, type, team_id, to_team_id, to_team_id, team_id);

    if (existingAlliance) {
      return res.status(400).json({ error: '联盟已建立' });
    }

    const duplicateRequest = db.prepare(`
      SELECT id FROM alliance_requests
      WHERE classroom_id = ?
        AND from_team_id = ?
        AND to_team_id = ?
        AND field = ?
        AND type = ?
        AND status = 'pending'
    `).get(classroom_id, team_id, to_team_id, field, type);

    if (duplicateRequest) {
      return res.status(400).json({ error: '已发送相同联盟意向，请等待对方处理' });
    }

    db.prepare(`INSERT INTO alliance_requests (classroom_id, from_team_id, to_team_id, field, type)
      VALUES (?, ?, ?, ?, ?)`).run(classroom_id, team_id, to_team_id, field, type);

    const team = db.prepare('SELECT name FROM teams WHERE id = ?').get(team_id);
    db.prepare('INSERT INTO hidden_logs (classroom_id, message) VALUES (?, ?)')
      .run(classroom_id, `${team.name} 发送联盟请求至 ${to_team_id}，领域: ${field}`);

    res.json({ success: true });
  });

  // Get incoming alliance requests
  router.get('/requests/incoming', auth, (req, res) => {
    if (req.session.user_type !== 'student') return res.json([]);
    const requests = db.prepare(
      "SELECT ar.*, t.name as from_team_name FROM alliance_requests ar JOIN teams t ON ar.from_team_id = t.id WHERE ar.to_team_id = ? AND ar.status = 'pending'"
    ).all(req.session.team_id);
    res.json(requests);
  });

  // Get sent alliance requests
  router.get('/requests/sent', auth, (req, res) => {
    if (req.session.user_type !== 'student') return res.json([]);
    const requests = db.prepare(
      'SELECT ar.*, t.name as to_team_name FROM alliance_requests ar JOIN teams t ON ar.to_team_id = t.id WHERE ar.from_team_id = ?'
    ).all(req.session.team_id);
    res.json(requests);
  });

  // Respond to alliance request
  router.post('/requests/:id/respond', auth, (req, res) => {
    const { action } = req.body;
    if (!['accepted', 'rejected'].includes(action)) {
      return res.status(400).json({ error: '无效操作' });
    }

    const request = db.prepare('SELECT * FROM alliance_requests WHERE id = ?').get(req.params.id);
    if (!request) return res.status(404).json({ error: '请求不存在' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: '该请求已处理' });
    }

    db.prepare('UPDATE alliance_requests SET status = ? WHERE id = ?').run(action, request.id);

    if (action === 'accepted') {
      const existingAlliance = db.prepare(`
        SELECT * FROM alliances
        WHERE classroom_id = ?
          AND status = 'active'
          AND field = ?
          AND ((from_team_id = ? AND to_team_id = ?) OR (from_team_id = ? AND to_team_id = ?))
      `).get(
        request.classroom_id,
        request.field,
        request.from_team_id,
        request.to_team_id,
        request.to_team_id,
        request.from_team_id
      );

      const gameState = db.prepare('SELECT * FROM game_state WHERE classroom_id = ?').get(request.classroom_id);
      const currentHalf = gameState.year * 2 + (gameState.quarter > 2 ? 2 : 1);
      const expireHalf = currentHalf + 1;

      if (!existingAlliance) {
        db.prepare(`INSERT INTO alliances (classroom_id, from_team_id, to_team_id, field, type, expire_half)
          VALUES (?, ?, ?, ?, ?, ?)`).run(
          request.classroom_id, request.from_team_id, request.to_team_id,
          request.field, request.type, expireHalf
        );
      } else if (existingAlliance.type !== request.type) {
        db.prepare(`UPDATE alliances SET type = ?, expire_half = ?, created_at = datetime('now') WHERE id = ?`).run(
          request.type,
          expireHalf,
          existingAlliance.id
        );
      }

      db.prepare('INSERT INTO hidden_logs (classroom_id, message) VALUES (?, ?)')
        .run(request.classroom_id, `联盟建立: ${request.from_team_id} ↔ ${request.to_team_id}，领域: ${request.field}`);
    }

    res.json({ success: true });
  });

  // Dissolve alliance
  router.delete('/:id', auth, (req, res) => {
    const alliance = db.prepare('SELECT * FROM alliances WHERE id = ?').get(req.params.id);
    if (!alliance) return res.status(404).json({ error: '联盟不存在' });

    db.prepare("UPDATE alliances SET status = 'dissolved' WHERE id = ?").run(alliance.id);

    db.prepare('INSERT INTO hidden_logs (classroom_id, message) VALUES (?, ?)')
      .run(alliance.classroom_id, `联盟解散: ${alliance.from_team_id} ↔ ${alliance.to_team_id}`);

    res.json({ success: true });
  });

  // Intelligence invest
  router.post('/intel-invest', auth, (req, res) => {
    if (req.session.user_type !== 'student') {
      return res.status(403).json({ error: '需要学生身份' });
    }

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.session.team_id);
    const cost = 30000;
    if (team.cash < cost) return res.status(400).json({ error: '资金不足' });

    db.prepare('UPDATE teams SET cash = cash - ? WHERE id = ?').run(cost, team.id);
    const updatedTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(team.id);

    res.json({ success: true, cash: updatedTeam.cash });
  });

  return router;
};
