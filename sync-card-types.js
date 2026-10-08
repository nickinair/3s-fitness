/* 按旧系统「会员卡列表」同步卡类型: 有效天数 / 总次数 / 售价 / 在线售卖
 * 背景: 这 9 个卡类型是 09-21 导入会员卡时自动创建的, 只有名称正确,
 *       有效天数一律 365、总次数 0、售价 0、online_sale=0, 导致会员端购卡页「暂无在售卡」。
 * 课时单价 = 售价 ÷ 总次数, 同步后自动正确(如 私教固定时间卡 2200/10 = 220/节)。
 */
const db = require('./server/src/db');

// title 精确匹配现有记录; 没有的会新建。kind: 1次卡 2时间卡 3储值卡 4私教卡
const CARDS = [
  // 名称,                       卡种, 有效天数, 总次数, 售价,   在线售卖, 排序
  ['新人专享私教体验课两节(2次卡)', 4, 10,  2,  99,    1, 1],
  ['私教次卡(1次卡)',              4, 90,  1,  300,   1, 2],
  ['私教固定时间卡(10次卡)',        4, 70,  10, 2200,  1, 3],
  ['30天20次私教课(20次卡)',        4, 30,  20, 3500,  1, 4],
  ['私教月卡(月卡)',               2, 30,  0,  3500,  1, 5],
  ['期限次卡(1次卡)',              1, 7,   1,  200,   1, 6],
  ['开业活动10次卡(10次卡)',        1, 70,  10, 1880,  1, 7],
  ['巴南3s(10次卡)',               1, 60,  10, 2300,  1, 8],
  ['自助训练时间卡(月卡)',          2, 30,  0,  299,   1, 9],
  // 以下不对外售卖(内部/赠送性质), 仅保留数据供开卡选择
  ['生日课(1次卡)',                1, 7,   1,  136,   0, 20],
  ['巴南店FS(1次卡)',              1, 90,  1,  0.1,   0, 21],
  ['巴南FS拉伸(1次卡)',            1, 30,  1,  0.01,  0, 22],
];

(async () => {
  const mid = 1;
  const club = await db.queryOne('SELECT id FROM biz_club WHERE merchant_id=? ORDER BY sort,id', [mid]);
  const rows = [];
  await db.tx(async (t) => {
    for (const [title, kind, days, counts, price, online, sort] of CARDS) {
      const cur = await t.queryOne('SELECT id FROM biz_card_category WHERE merchant_id=? AND title=?', [mid, title]);
      if (cur) {
        await t.exec(
          `UPDATE biz_card_category SET card_kind=?, expire_days=?, total_counts=?, price=?, online_sale=?, sort=?, status=1
           WHERE id=?`, [kind, days, counts, price, online, sort, cur.id]);
        rows.push({ 卡类型: title, 操作: '更新', 有效天数: days, 总次数: counts || '不限', 售价: price, 在线售卖: online ? '是' : '否' });
      } else {
        await t.exec(
          `INSERT INTO biz_card_category (merchant_id, club_id, card_kind, title, expire_days, total_counts, price, online_sale, sort, status)
           VALUES (?,?,?,?,?,?,?,?,?,1)`, [mid, club ? club.id : 1, kind, title, days, counts, price, online, sort]);
        rows.push({ 卡类型: title, 操作: '新建', 有效天数: days, 总次数: counts || '不限', 售价: price, 在线售卖: online ? '是' : '否' });
      }
    }
  });
  console.log('=== 同步结果 ===');
  console.table(rows);

  const onsale = await db.query(
    `SELECT title 卡类型, expire_days 有效天数, total_counts 次数, price 售价,
            CASE WHEN total_counts>0 THEN ROUND(price/total_counts,2) ELSE NULL END 课时单价
     FROM biz_card_category WHERE merchant_id=1 AND status=1 AND online_sale=1 ORDER BY sort,id`);
  console.log('=== 会员端购卡页将展示(在售) ===');
  console.table(onsale);
  process.exit(0);
})().catch(e => { console.error('❌ 同步失败, 事务已回滚:', e.message); process.exit(1); });
