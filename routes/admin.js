const { Router } = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');

module.exports = function(db) {
  const router = Router();
  const auth = authMiddleware(db);
  const admin = adminOnly(db);

  // List all teachers
  router.get('/teachers', auth, admin, (req, res) => {
    const teachers = db.prepare('SELECT id, username, is_admin, created_at FROM teachers').all();
    const result = teachers.map(t => {
      const classes = db.prepare('SELECT id, name FROM classrooms WHERE owner = ?').all(t.username);
      return { ...t, classes };
    });
    res.json(result);
  });

  // Delete/reset a teacher
  router.delete('/teachers/:username', auth, admin, (req, res) => {
    const { username } = req.params;
    if (username === 'admin') return res.status(400).json({ error: '不能删除管理员' });

    const classes = db.prepare('SELECT id FROM classrooms WHERE owner = ?').all(username);
    for (const c of classes) {
      db.prepare('DELETE FROM alliance_requests WHERE classroom_id = ?').run(c.id);
      db.prepare('DELETE FROM alliances WHERE classroom_id = ?').run(c.id);
      db.prepare('DELETE FROM offers WHERE classroom_id = ?').run(c.id);
      db.prepare('DELETE FROM ratings WHERE classroom_id = ?').run(c.id);
      db.prepare('DELETE FROM hidden_logs WHERE classroom_id = ?').run(c.id);
      db.prepare('DELETE FROM news_log WHERE classroom_id = ?').run(c.id);
      db.prepare('DELETE FROM results WHERE classroom_id = ?').run(c.id);
      db.prepare('DELETE FROM decisions WHERE classroom_id = ?').run(c.id);
      db.prepare('DELETE FROM participants WHERE classroom_id = ?').run(c.id);
      db.prepare('DELETE FROM teams WHERE classroom_id = ?').run(c.id);
      db.prepare('DELETE FROM game_state WHERE classroom_id = ?').run(c.id);
    }
    db.prepare('DELETE FROM classrooms WHERE owner = ?').run(username);
    db.prepare('DELETE FROM teachers WHERE username = ?').run(username);

    res.json({ success: true });
  });

  // Search
  router.get('/search', auth, admin, (req, res) => {
    const { classroom_id, student_id, team_name, from_date, to_date, type } = req.query;

    if (type === 'decisions' || !type) {
      let query = `SELECT d.*, p.student_id, p.grade, p.gender, p.role as p_role,
        t.name as team_name, c.name as classroom_name
        FROM decisions d
        JOIN participants p ON d.participant_id = p.id
        JOIN teams t ON d.team_id = t.id
        JOIN classrooms c ON d.classroom_id = c.id
        WHERE 1=1`;
      const params = [];

      if (classroom_id) { query += ' AND d.classroom_id = ?'; params.push(classroom_id); }
      if (student_id) { query += ' AND p.student_id LIKE ?'; params.push(`%${student_id}%`); }
      if (team_name) { query += ' AND t.name LIKE ?'; params.push(`%${team_name}%`); }
      if (from_date) { query += ' AND d.created_at >= ?'; params.push(from_date); }
      if (to_date) { query += ' AND d.created_at <= ?'; params.push(to_date); }
      query += ' ORDER BY d.created_at DESC LIMIT 500';

      const rows = db.prepare(query).all(...params);
      return res.json({ type: 'decisions', data: rows });
    }

    if (type === 'participants') {
      let query = `SELECT p.*, t.name as team_name, c.name as classroom_name
        FROM participants p
        JOIN teams t ON p.team_id = t.id
        JOIN classrooms c ON p.classroom_id = c.id
        WHERE 1=1`;
      const params = [];

      if (classroom_id) { query += ' AND p.classroom_id = ?'; params.push(classroom_id); }
      if (student_id) { query += ' AND p.student_id LIKE ?'; params.push(`%${student_id}%`); }
      if (team_name) { query += ' AND t.name LIKE ?'; params.push(`%${team_name}%`); }
      query += ' ORDER BY p.created_at DESC LIMIT 500';

      const rows = db.prepare(query).all(...params);
      return res.json({ type: 'participants', data: rows });
    }

    if (type === 'results') {
      let query = `SELECT r.*, t.name as team_name, c.name as classroom_name
        FROM results r
        JOIN teams t ON r.team_id = t.id
        JOIN classrooms c ON r.classroom_id = c.id
        WHERE 1=1`;
      const params = [];

      if (classroom_id) { query += ' AND r.classroom_id = ?'; params.push(classroom_id); }
      if (team_name) { query += ' AND t.name LIKE ?'; params.push(`%${team_name}%`); }
      if (from_date) { query += ' AND r.created_at >= ?'; params.push(from_date); }
      if (to_date) { query += ' AND r.created_at <= ?'; params.push(to_date); }
      query += ' ORDER BY r.created_at DESC LIMIT 500';

      const rows = db.prepare(query).all(...params);
      return res.json({ type: 'results', data: rows });
    }

    res.status(400).json({ error: '无效的搜索类型' });
  });

  // Export single classroom
  router.get('/export/:classId', auth, admin, (req, res) => {
    const { format } = req.query;
    const classId = req.params.classId;

    const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ?').get(classId);
    if (!classroom) return res.status(404).json({ error: '教室不存在' });

    const teams = db.prepare('SELECT * FROM teams WHERE classroom_id = ?').all(classId);
    const participants = db.prepare('SELECT * FROM participants WHERE classroom_id = ?').all(classId);
    const decisions = db.prepare('SELECT * FROM decisions WHERE classroom_id = ? ORDER BY year, quarter').all(classId);
    const results = db.prepare('SELECT * FROM results WHERE classroom_id = ? ORDER BY year, quarter').all(classId);
    const ratings = db.prepare('SELECT * FROM ratings WHERE classroom_id = ?').all(classId);
    const alliances = db.prepare('SELECT * FROM alliances WHERE classroom_id = ?').all(classId);
    const offers = db.prepare('SELECT * FROM offers WHERE classroom_id = ?').all(classId);

    if (format === 'csv') {
      const csv = buildFullCSV([classroom], teams, participants, decisions, results, ratings, alliances, offers);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${classId}_export.csv"`);
      return res.send(csv);
    }
    res.json({ classroom, teams, participants, decisions, results, ratings, alliances, offers });
  });

  // Export ALL data across all classrooms
  router.get('/export-all', auth, admin, (req, res) => {
    const { format } = req.query;

    const classrooms = db.prepare('SELECT * FROM classrooms').all();
    const teams = db.prepare('SELECT * FROM teams').all();
    const participants = db.prepare('SELECT * FROM participants').all();
    const decisions = db.prepare('SELECT d.*, p.student_id, p.grade, p.gender, t.name as team_name, c.name as classroom_name FROM decisions d LEFT JOIN participants p ON d.participant_id = p.id LEFT JOIN teams t ON d.team_id = t.id LEFT JOIN classrooms c ON d.classroom_id = c.id ORDER BY d.classroom_id, d.year, d.quarter, d.team_id').all();
    const results = db.prepare('SELECT r.*, t.name as team_name, c.name as classroom_name FROM results r LEFT JOIN teams t ON r.team_id = t.id LEFT JOIN classrooms c ON r.classroom_id = c.id ORDER BY r.classroom_id, r.year, r.quarter').all();
    const ratings = db.prepare('SELECT * FROM ratings ORDER BY classroom_id, year').all();
    const alliances = db.prepare('SELECT * FROM alliances').all();
    const offers = db.prepare('SELECT * FROM offers').all();

    if (format === 'csv') {
      const csv = buildFullCSV(classrooms, teams, participants, decisions, results, ratings, alliances, offers);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="full_database_export.csv"');
      return res.send(csv);
    }

    res.setHeader('Content-Disposition', 'attachment; filename="full_database_export.json"');
    res.json({ classrooms, teams, participants, decisions, results, ratings, alliances, offers });
  });

  function buildFullCSV(classrooms, teams, participants, decisions, results, ratings, alliances, offers) {
    let csv = '﻿'; // BOM for Excel

    // Sheet 1: Teams
    csv += '===== 团队信息 =====\n';
    csv += '教室ID,团队名称,团队代码,密码,现金,累计营收,累计利润,市场份额,技术等级,品牌,情报准确率,综合评分,创建时间\n';
    for (const t of teams) {
      csv += `"${t.classroom_id}","${t.name}","${t.code}","${t.password}",${t.cash},${t.revenue},${t.profit},${t.market_share},${t.tech_level},${t.brand},${t.intel_accuracy},${t.score},"${t.created_at}"\n`;
    }

    // Sheet 2: Participants
    csv += '\n===== 学生信息 =====\n';
    csv += '教室ID,学号,团队ID,角色,年级,性别,年龄,工作年限,岗位年限,风险偏好,决策次数,创建时间\n';
    for (const p of participants) {
      const t = teams.find(x => x.id === p.team_id);
      csv += `"${p.classroom_id}","${p.student_id}","${t?.name || p.team_id}","${p.role}","${p.grade || ''}","${p.gender || ''}",${p.age || ''},${p.work_years},${p.role_years},${p.risk_value},${p.decision_count},"${p.created_at}"\n`;
    }

    // Sheet 3: Decisions (expanded)
    csv += '\n===== 决策记录 =====\n';
    csv += '教室,团队,学号,角色,年,季度,决策内容,提交时间\n';
    for (const d of decisions) {
      const p = participants.find(x => x.id === d.participant_id);
      const t = teams.find(x => x.id === d.team_id);
      const decJson = d.decisions_json || '{}';
      let decStr;
      try {
        const obj = JSON.parse(decJson);
        decStr = Object.entries(obj).map(([k,v]) => `${k}=${v}`).join('; ');
      } catch(e) { decStr = decJson; }
      csv += `"${d.classroom_name || d.classroom_id}","${d.team_name || t?.name || ''}","${d.student_id || p?.student_id || ''}","${d.role}",${d.year},${d.quarter},"${decStr.replace(/"/g, '""')}","${d.created_at}"\n`;
    }

    // Sheet 4: Results
    csv += '\n===== 季度结算结果 =====\n';
    csv += '教室,团队,年,季度,营收,利润,市场份额,评分,反馈,结算时间\n';
    for (const r of results) {
      const t = teams.find(x => x.id === r.team_id);
      csv += `"${r.classroom_name || r.classroom_id}","${r.team_name || t?.name || ''}",${r.year},${r.quarter},${r.revenue},${r.profit},${r.market_share},${r.score},"${(r.feedback || '').replace(/"/g, '""')}","${r.created_at}"\n`;
    }

    // Sheet 5: Ratings
    if (ratings.length > 0) {
      csv += '\n===== 评分记录 =====\n';
      csv += '教室ID,评分人,被评人,类型,分数,年,季度,半年,时间\n';
      for (const r of ratings) {
        csv += `"${r.classroom_id}","${r.from_id}","${r.to_id}","${r.type}",${r.score},${r.year},${r.quarter},${r.half},"${r.created_at}"\n`;
      }
    }

    // Sheet 6: Alliances
    if (alliances.length > 0) {
      csv += '\n===== 联盟记录 =====\n';
      csv += '教室ID,发起团队,目标团队,领域,类型,状态,创建时间\n';
      for (const a of alliances) {
        const ft = teams.find(x => x.id === a.from_team_id);
        const tt = teams.find(x => x.id === a.to_team_id);
        csv += `"${a.classroom_id}","${ft?.name || a.from_team_id}","${tt?.name || a.to_team_id}","${a.field}","${a.type}","${a.status}","${a.created_at}"\n`;
      }
    }

    // Sheet 7: Offers (headhunting + firing)
    if (offers.length > 0) {
      csv += '\n===== 人事变动记录（挖角/裁员） =====\n';
      csv += '教室ID,操作类型,发起团队,目标学号,目标角色,状态,薪资报价(万),支付费用(元),时间\n';
      for (const o of offers) {
        const opType = o.status === 'fired' ? '裁员' : '挖角';
        const statusMap = { pending: '待定', accepted: '已接受', rejected: '已拒绝', fired: '已裁员' };
        csv += `"${o.classroom_id}","${opType}","${o.from_team_name || o.from_team_id}","${o.to_student_id}","${o.target_role}","${statusMap[o.status] || o.status}",${o.salary_offer || 0},${o.cost || 0},"${o.created_at}"\n`;
      }
    }

    return csv;
  }

  // Reset all non-admin teachers
  router.post('/reset-all', auth, admin, (req, res) => {
    const teachers = db.prepare("SELECT username FROM teachers WHERE is_admin = 0").all();
    for (const t of teachers) {
      const classes = db.prepare('SELECT id FROM classrooms WHERE owner = ?').all(t.username);
      for (const c of classes) {
        db.prepare('DELETE FROM alliance_requests WHERE classroom_id = ?').run(c.id);
        db.prepare('DELETE FROM alliances WHERE classroom_id = ?').run(c.id);
        db.prepare('DELETE FROM offers WHERE classroom_id = ?').run(c.id);
        db.prepare('DELETE FROM ratings WHERE classroom_id = ?').run(c.id);
        db.prepare('DELETE FROM hidden_logs WHERE classroom_id = ?').run(c.id);
        db.prepare('DELETE FROM news_log WHERE classroom_id = ?').run(c.id);
        db.prepare('DELETE FROM results WHERE classroom_id = ?').run(c.id);
        db.prepare('DELETE FROM decisions WHERE classroom_id = ?').run(c.id);
        db.prepare('DELETE FROM participants WHERE classroom_id = ?').run(c.id);
        db.prepare('DELETE FROM teams WHERE classroom_id = ?').run(c.id);
        db.prepare('DELETE FROM game_state WHERE classroom_id = ?').run(c.id);
      }
      db.prepare('DELETE FROM classrooms WHERE owner = ?').run(t.username);
    }
    db.prepare("DELETE FROM teachers WHERE is_admin = 0").run();

    res.json({ success: true });
  });

  // List all classrooms (admin overview)
  router.get('/classrooms', auth, admin, (req, res) => {
    const classes = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM teams WHERE classroom_id = c.id) as team_count,
      (SELECT COUNT(*) FROM participants WHERE classroom_id = c.id) as participant_count
      FROM classrooms c ORDER BY c.created_at DESC`).all();
    res.json(classes);
  });

  return router;
};
