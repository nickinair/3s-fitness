/* 上线前清理: 保留昨天(09-21)导入的真实会员/卡/流水 + 真实教练, 其余种子与测试数据清除
 * 全程单事务, 任一步失败整体回滚。执行前已做全库备份。
 */
const db = require('./server/src/db');

const REAL_VIP = "(SELECT id FROM biz_vip_user WHERE is_import=1)";
const REAL_CARD = "(SELECT id FROM biz_member_card WHERE ext_card_id<>'')";
const DEL_COACH = '(1,2,3,5)';                          // 李强/张伟/陈晨/王涛
const DEL_USER = '(3,4,5,6,7,8,9,10,12,13,14)';         // 演示员工 + 已停用测试账号
const DEL_CAT = '(1,2,3,4,5,6,7)';                      // 演示卡类型

// 顺序: 明细 → 流水 → 主体 → 配置
const STEPS = [
  ['耗卡流水',        `DELETE FROM biz_card_spend WHERE vip_id NOT IN ${REAL_VIP}`],
  ['消课记录',        `DELETE FROM biz_ptrain_record WHERE vip_id NOT IN ${REAL_VIP}`],
  ['私教预约(保留真实会员的7条)', `DELETE FROM biz_ptrain_bespeak_record WHERE vip_id NOT IN ${REAL_VIP}`],
  ['团课预约',        `DELETE FROM biz_syllabus_subscribe_record WHERE vip_id NOT IN ${REAL_VIP}`],
  ['团课排课(全部已过去)', `DELETE FROM biz_syllabus_group`],
  ['签到记录',        `DELETE FROM biz_checkin_record WHERE vip_id NOT IN ${REAL_VIP}`],
  ['体测(保留导入的2条)', `DELETE FROM biz_body_record WHERE vip_id NOT IN ${REAL_VIP}`],
  ['里程碑',          `DELETE FROM biz_milestone WHERE vip_id NOT IN ${REAL_VIP}`],
  ['训练计划',        `DELETE FROM biz_training_plan WHERE vip_id NOT IN ${REAL_VIP}`],
  ['维护记录',        `DELETE FROM biz_maintain_record WHERE vip_user_id NOT IN ${REAL_VIP}`],
  ['购卡意向',        `DELETE FROM biz_card_intent WHERE vip_id NOT IN ${REAL_VIP}`],
  ['潜在客户',        `DELETE FROM biz_user_potential`],
  ['教练休息设置',    `DELETE FROM biz_coach_rest WHERE coach_id IN ${DEL_COACH}`],
  ['合同',            `DELETE FROM biz_club_contract`],
  ['收款流水(保留导入卡的238条)', `DELETE FROM biz_card_recharge WHERE card_id NOT IN ${REAL_CARD}`],
  ['会员卡(非导入)',  `DELETE FROM biz_member_card WHERE ext_card_id=''`],
  ['会员-门店关联',   `DELETE FROM biz_user_club WHERE vip_user_id NOT IN ${REAL_VIP}`],
  ['会员(种子+测试)', `DELETE FROM biz_vip_user WHERE is_import<>1`],
  ['演示卡类型',      `DELETE FROM biz_card_category WHERE id IN ${DEL_CAT}`],
  ['停用教练档案',    `DELETE FROM biz_club_coach WHERE id IN ${DEL_COACH}`],
  ['演示员工账号',    `DELETE FROM sys_user WHERE id IN ${DEL_USER}`],
  ['短信记录',        `DELETE FROM biz_sms_log`],
  ['操作日志',        `DELETE FROM sys_log`],
];

(async () => {
  const report = await db.tx(async (t) => {
    const out = [];
    for (const [label, sql] of STEPS) {
      const r = await t.exec(sql);
      out.push({ 步骤: label, 删除行数: r.affectedRows });
    }
    return out;
  });
  console.log('=== 清理完成(已提交) ===');
  console.table(report);
  console.log('合计删除:', report.reduce((s, x) => s + x.删除行数, 0), '行');
  process.exit(0);
})().catch(e => { console.error('❌ 清理失败, 事务已回滚, 数据未改动:', e.message); process.exit(1); });
