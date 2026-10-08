/* 会员数据重新导入 (覆盖更新版)
 * Excel: /Users/nickni/Desktop/111会员卡报表信息 (2026-9-26-23：00).xlsx
 *
 * 策略:
 * 1. 会员档案 (biz_vip_user): 按手机号匹配，已有则覆盖更新所有字段
 * 2. 会员卡 (biz_member_card): 按 ext_card_id 匹配，已有则覆盖更新，没有则新增
 * 3. 收款流水 (biz_card_recharge): 计入收款流水
 *
 * 用法: node reimport-members.js [--dry-run]
 *   --dry-run  只预览不执行
 */

const XLSX = require('xlsx');
const dayjs = require('./server/node_modules/dayjs');
const bcrypt = require('./server/node_modules/bcryptjs');
const db = require('./server/src/db');

const FILE = '/Users/nickni/Desktop/111会员卡报表信息 (2026-9-26-23：00).xlsx';
const MERCHANT_ID = 1;
const DRY_RUN = process.argv.includes('--dry-run');

// 门店名映射 (旧系统名 → 新系统名)
const CLUB_MAP = {
  '3S运动中心-南坪店': '3S健身·南坪店',
  '3s运动中心-南坪店': '3S健身·南坪店',
  '3S运动中心-巴南店': '3S健身·巴南店',
  '3s运动中心-巴南店': '3S健身·巴南店',
};

// 支付方式映射
const PAY_ALIAS = {
  '微信': 'wechat', '微信支付': 'wechat',
  '支付宝': 'alipay',
  '现金': 'cash',
  '美团/大众': 'meituan', '美团': 'meituan', '大众点评': 'meituan',
  '其他': 'other',
};

// 性别映射
const GENDER_MAP = { '男': 1, '女': 2, '未知': 0 };

// 去掉 emoji/空格 用于名字匹配
const EMO = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\s]+/gu;
const normName = (v) => {
  const raw = String(v || '').trim();
  const n = raw.replace(EMO, '').toLowerCase();
  return n || raw.toLowerCase();
};

// 日期格式化
const normDate = (v) => {
  if (!v) return null;
  const s = String(v).trim().replace(/[./]/g, '-');
  if (!/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return null;
  const d = dayjs(s.length <= 10 ? s : s.slice(0, 19));
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : null;
};

const normDateEOD = (v) => {
  if (!v) return null;
  const s = String(v).trim().replace(/[./]/g, '-');
  if (!/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return null;
  const d = dayjs(s.length <= 10 ? s : s.slice(0, 19));
  return d.isValid() ? d.endOf('day').format('YYYY-MM-DD HH:mm:ss') : null;
};

// 安全取数字
const numOr = (v, dft) => {
  if (v == null || String(v).trim() === '' || /^(nan|--|null|undefined)$/i.test(String(v).trim())) return dft;
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? dft : n;
};

const txt = (v) => {
  const s = String(v == null ? '' : v).trim();
  return /^(nan|--|null|undefined|none)$/i.test(s) ? '' : s;
};

// 解析状态字段: "已过期" / "剩¥xxx" / "未开卡"
function parseStatus(statusStr, openStatus, expireTime) {
  const s = txt(statusStr);
  if (s === '已过期') return 2;
  if (txt(openStatus) === '未开卡') return 0;
  // "剩¥xxx" 表示使用中
  if (s.startsWith('剩')) return 1;
  // 根据过期时间判断
  if (expireTime && dayjs(expireTime).isBefore(dayjs())) return 2;
  return 1;
}

(async () => {
  console.log(DRY_RUN ? '🔍 预览模式 (不写入数据库)\n' : '🚀 正式执行模式\n');

  // 1. 读取 Excel
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`📊 读取到 ${data.length} 条记录`);

  // 2. 加载系统数据
  const [clubs, cats, staffAll] = await Promise.all([
    db.query('SELECT id, name FROM biz_club WHERE merchant_id=?', [MERCHANT_ID]),
    db.query('SELECT id, title, card_kind, total_counts, expire_days, price, gift_money FROM biz_card_category WHERE merchant_id=?', [MERCHANT_ID]),
    db.query('SELECT id, realname FROM sys_user WHERE merchant_id=? AND status=1', [MERCHANT_ID]),
  ]);

  const findClub = (name) => {
    const mapped = CLUB_MAP[name] || name;
    return clubs.find(c => normName(c.name) === normName(mapped));
  };
  const findCat = (title) => cats.find(c => normName(c.title) === normName(title));
  const findStaff = (name) => staffAll.find(s => normName(s.realname) === normName(name));

  // 3. 加载已有的 ext_card_id 映射
  const existCards = await db.query(
    'SELECT id, ext_card_id, vip_id FROM biz_member_card WHERE merchant_id=? AND ext_card_id != ""',
    [MERCHANT_ID]
  );
  const extToCard = new Map(existCards.map(c => [c.ext_card_id, c]));

  // 4. 加载已有会员(按手机号)
  const existMembers = await db.query(
    'SELECT id, phone, realname FROM biz_vip_user WHERE merchant_id=?', [MERCHANT_ID]
  );
  const phoneToVip = new Map(existMembers.map(m => [m.phone, m]));

  // 统计
  const stats = {
    total: data.length,
    member_updated: 0, member_created: 0,
    card_updated: 0, card_created: 0,
    card_skipped: 0,
    recharge_created: 0,
    errors: [],
  };

  // 追踪本次已处理的手机号(避免同一会员重复更新档案)
  const processedPhones = new Set();

  // 5. 逐条处理
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const line = i + 1;

    try {
      // 解析字段
      const realname = txt(row['会员名']);
      let phone = txt(row['手机号']).replace(/\D/g, '');
      // 手机号修正: 188960788113 → 18960788113 (用户确认)
      if (phone === '188960788113') phone = '18960788113';
      const cardTitle = txt(row['会员卡名称']);
      const cardKindName = txt(row['会员卡类型']);
      const extCardId = String(row['会员卡ID'] || '').trim();
      const clubName = txt(row['会员卡所属门店']);
      const consultant = txt(row['会籍顾问']);
      const creator = txt(row['创建人']);
      const openDate = normDate(row['开卡时间']);
      const startDate = normDate(row['开始时间']);
      const expireDate = normDateEOD(row['过期时间']);
      const actualMoney = numOr(row['售卡价格'], 0);
      const totalCounts = numOr(row['售卡时的总次数'], 0);
      const leftCounts = numOr(row['剩余次数'], 0);
      const unitPrice = numOr(row['单课价值'], 0);
      const leftMoney = numOr(row['储值卡剩余本金'], 0);
      const leftGiftMoney = numOr(row['储值卡剩余赠送金额'], 0);
      const payMethod = PAY_ALIAS[txt(row['支付方式'])] || 'other';
      const gender = GENDER_MAP[txt(row['性别'])] || 0;
      const birthday = row['生日'] ? ((normDate(row['生日']) || '').slice(0, 10) || null) : null;
      const idCard = txt(row['身份证号']);
      const height = numOr(row['身高'], 0);
      const weight = numOr(row['体重'], 0);
      const address = txt(row['地址']);
      const source = txt(row['加入渠道']);
      const remark = txt(row['备注']);
      const physicalCardNo = txt(row['实体卡号']);
      const latestOpen = normDate(row['最晚开卡时间']);
      const status = parseStatus(row['状态'], row['开卡状态'], expireDate);

      // 校验
      if (!realname) { stats.errors.push(`行${line}: 缺少会员名`); continue; }
      if (!/^1[3-9]\d{9}$/.test(phone)) { stats.errors.push(`行${line}: 手机号格式不正确: ${phone}`); continue; }
      if (!extCardId) { stats.errors.push(`行${line}: 缺少会员卡ID`); continue; }

      // 匹配门店
      const club = findClub(clubName);
      const clubId = club ? club.id : 1; // 默认巴南店

      // 匹配卡类型
      const cat = findCat(cardTitle);
      if (!cat) { stats.errors.push(`行${line}: 卡类型「${cardTitle}」不存在`); continue; }

      // 匹配员工
      const ms = consultant ? findStaff(consultant) : null;
      const ope = creator ? findStaff(creator) : null;

      if (DRY_RUN) {
        // 预览模式: 只统计
        const existCard = extToCard.get(extCardId);
        if (existCard) stats.card_updated++;
        else stats.card_created++;

        if (!processedPhones.has(phone)) {
          const existV = phoneToVip.get(phone);
          if (existV) stats.member_updated++;
          else stats.member_created++;
          processedPhones.add(phone);
        }
        continue;
      }

      // === 正式执行 ===
      await db.tx(async (t) => {
        let vipId;
        const existV = phoneToVip.get(phone);

        // ----- 会员档案 UPSERT -----
        if (!processedPhones.has(phone)) {
          if (existV) {
            // 覆盖更新会员档案
            await t.exec(
              `UPDATE biz_vip_user SET
                realname=?, gender=?, birthday=?,
                id_card_number=IF(?<>'', ?, id_card_number),
                address=IF(?<>'', ?, address),
                membership_id=?, membership_name=?,
                is_import=1
              WHERE id=? AND merchant_id=?`,
              [
                realname, gender, birthday,
                idCard, idCard,
                address, address,
                ms ? ms.id : 0, ms ? ms.realname : txt(consultant),
                existV.id, MERCHANT_ID,
              ]
            );
            vipId = existV.id;
            stats.member_updated++;
          } else {
            // 新建会员
            const pwd = await bcrypt.hash(phone.slice(-6), 10);
            vipId = await t.insert(
              `INSERT INTO biz_vip_user (merchant_id,phone,password,realname,nickname,gender,birthday,id_card_number,address,
                source_name,membership_id,membership_name,is_import,remark)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
              [
                MERCHANT_ID, phone, pwd, realname, realname, gender, birthday, idCard, address,
                source, ms ? ms.id : 0, ms ? ms.realname : txt(consultant), remark || '数据导入',
              ]
            );
            await t.exec('INSERT IGNORE INTO biz_user_club (vip_user_id, club_id) VALUES (?,?)', [vipId, clubId]);
            phoneToVip.set(phone, { id: vipId, phone, realname });
            stats.member_created++;
          }
          processedPhones.add(phone);
        }
        vipId = phoneToVip.get(phone).id;

        // ----- 会员卡 UPSERT -----
        const existCard = extToCard.get(extCardId);
        const isStore = cat.card_kind === 3;
        const unit = unitPrice || (totalCounts > 0 ? +(actualMoney / totalCounts).toFixed(2) : 0);

        if (existCard) {
          // 覆盖更新已有卡
          await t.exec(
            `UPDATE biz_member_card SET
              club_id=?, card_kind=?, card_type_id=?, card_type_name=?,
              counts=?, left_counts=?, unit_price=?, actual_money=?,
              sum_money=?, left_money=?, left_gift_money=?,
              open_card_time=?, start_use_time=?, expire_time=?, expire_days=?,
              latest_open_time=?,
              membership_id=?, membership_name=?,
              ope_username=?,
              pay_method=?, realname=?, phone=?,
              physical_card_no=?, status=?,
              remark=?
            WHERE id=?`,
            [
              clubId, cat.card_kind, cat.id, cat.title,
              totalCounts, leftCounts, unit, actualMoney,
              isStore ? leftMoney + leftGiftMoney : 0, isStore ? leftMoney : 0, isStore ? leftGiftMoney : 0,
              status === 0 ? null : openDate, status === 0 ? null : startDate, expireDate, cat.expire_days || 365,
              latestOpen || (status === 0 ? expireDate : null),
              ms ? ms.id : 0, ms ? ms.realname : txt(consultant),
              ope ? ope.realname : txt(creator),
              payMethod, realname, phone,
              physicalCardNo, status,
              remark || '数据覆盖导入',
              existCard.id,
            ]
          );
          stats.card_updated++;
        } else {
          // 新增卡
          const cn = `IM${extCardId}`;
          const cardId = await t.insert(
            `INSERT INTO biz_member_card (merchant_id,club_id,vip_id,card_kind,card_type_id,card_type_name,
              counts,left_counts,sum_money,left_money,left_gift_money,unit_price,actual_money,retainage,
              open_card_mode,open_card_time,start_use_time,expire_time,expire_days,latest_open_time,
              contract_number,membership_id,membership_name,ope_user_id,ope_username,
              pay_method,realname,phone,source_port,remark,status,ext_card_id,physical_card_no)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,1,?,?,?,?,?,?,?,?,0,?,?,?,?,3,?,?,?,?)`,
            [
              MERCHANT_ID, clubId, vipId, cat.card_kind, cat.id, cat.title,
              totalCounts, leftCounts,
              isStore ? leftMoney + leftGiftMoney : 0, isStore ? leftMoney : 0, isStore ? leftGiftMoney : 0,
              unit, actualMoney,
              status === 0 ? null : openDate, status === 0 ? null : startDate, expireDate, cat.expire_days || 365,
              latestOpen || (status === 0 ? expireDate : null),
              cn, ms ? ms.id : 0, ms ? ms.realname : txt(consultant),
              ope ? ope.realname : txt(creator),
              payMethod, realname, phone,
              remark || '数据导入', status, extCardId, physicalCardNo,
            ]
          );

          // 收款流水
          if (actualMoney > 0) {
            await t.insert(
              `INSERT INTO biz_card_recharge (merchant_id,club_id,card_id,vip_id,card_kind,card_type_id,card_type_name,
                type,actual_money,gift_money,counts,expire_days,pay_method,
                membership_id,membership_name,ope_user_id,ope_username,
                realname,phone,contract_number,is_new_user,remark,insert_time)
               VALUES (?,?,?,?,?,?,?,1,?,0,?,?,?,?,?,0,?,?,?,?,0,?,?)`,
              [
                MERCHANT_ID, clubId, cardId, vipId, cat.card_kind, cat.id, cat.title,
                actualMoney, totalCounts, cat.expire_days || 365, payMethod,
                ms ? ms.id : 0, ms ? ms.realname : txt(consultant),
                ope ? ope.realname : txt(creator),
                realname, phone, cn, '历史数据导入', openDate || dayjs().format('YYYY-MM-DD HH:mm:ss'),
              ]
            );
            stats.recharge_created++;
          }

          extToCard.set(extCardId, { id: cardId, ext_card_id: extCardId, vip_id: vipId });
          stats.card_created++;
        }
      });

    } catch (err) {
      stats.errors.push(`行${line}: ${err.message}`);
    }
  }

  // 6. 更新会员到期快照
  if (!DRY_RUN) {
    console.log('\n⏳ 更新会员到期快照...');
    await db.exec(`UPDATE biz_vip_user v SET
      expire_time = (SELECT MAX(expire_time) FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)),
      expire_status = CASE
        WHEN EXISTS (SELECT 1 FROM biz_member_card c WHERE c.vip_id=v.id AND c.status IN (0,1,3)) THEN 1
        WHEN EXISTS (SELECT 1 FROM biz_member_card c WHERE c.vip_id=v.id) THEN 2
        ELSE 0 END
      WHERE v.merchant_id=?`, [MERCHANT_ID]);
  }

  // 7. 输出结果
  console.log('\n========== 导入结果 ==========');
  console.log(`📋 总记录: ${stats.total}`);
  console.log(`👤 会员档案: 更新 ${stats.member_updated} 人, 新增 ${stats.member_created} 人`);
  console.log(`💳 会员卡: 覆盖更新 ${stats.card_updated} 张, 新增 ${stats.card_created} 张`);
  console.log(`💰 收款流水: 新增 ${stats.recharge_created} 条`);
  if (stats.errors.length) {
    console.log(`\n❌ 错误 (${stats.errors.length} 条):`);
    stats.errors.forEach(e => console.log(`  - ${e}`));
  }
  console.log('================================\n');

  if (DRY_RUN) {
    console.log('ℹ️  以上为预览结果，数据库未做任何修改。');
    console.log('    去掉 --dry-run 参数即可正式执行。');
  } else {
    console.log('✅ 导入完成！');
  }

  process.exit(0);
})().catch(e => {
  console.error('❌ 导入失败:', e);
  process.exit(1);
});
