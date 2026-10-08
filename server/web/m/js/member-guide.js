/* 会员端-使用引导: 首页 banner「查看使用引导」的落地页 */
window.Pages.MemberGuide = {
  data() {
    return {
      steps: [
        { icon: 'cart-o', t: '买卡', d: '在首页点「买卡」挑选合适的卡种，提交购卡意向后工作人员会联系你到店办理。已有卡的可以直接约课。', to: '/buy' },
        { icon: 'calendar-o', t: '约课', d: '底部点「约课」进入。私教课先选教练，再在时间轴上左右滑动挑一个空闲时段；团课在第二个页签直接报名。', to: '/schedule' },
        { icon: 'clock-o', t: '改约或取消', d: '在「我的 → 我的预约」里可以取消预约。请尽量提前操作，临近上课取消可能会计入爽约。', to: '/my-bookings' },
        { icon: 'passed', t: '确认消课', d: '上完私教课，教练提交消课后你会收到提醒，在「待确认消课」里确认，课时才会扣减。', to: '/pending-confirms' },
        { icon: 'credit-pay', t: '查看会员卡', d: '「我的卡」可以看到每张卡的剩余次数、余额和到期时间，点进去还能看消费明细。', to: '/my-cards' },
        { icon: 'todo-list-o', t: '训练计划', d: '教练为你制定的计划会推送到「训练计划」，里面有每个动作的组数、次数和重量。', to: '/plans' },
        { icon: 'medal-o', t: '里程碑', d: '每完成 10 节课或训练满 30 天，教练会为你做一次阶段总结，可在「里程碑」查看身体数据变化。', to: '/milestones' },
        { icon: 'shield-o', t: '账号与安全', d: '「我的 → 账号与安全」可以更换手机号、修改登录密码，都需要先做身份验证。', to: '/security' },
      ],
    };
  },
  template: [
    '<div class="page">',
    '  <m-nav title="使用引导"></m-nav>',
    '  <div class="guide-hero">',
    '    <div class="t">新系统全面升级</div>',
    '    <div class="s">花一分钟了解怎么用，约课买卡都在手机上完成</div>',
    '  </div>',
    '  <div class="card-box" style="padding:4px 0">',
    '    <div v-for="(g,i) in steps" :key="g.t" class="guide-item" @click="$router.push(g.to)">',
    '      <div class="gi-no">{{ i+1 }}</div>',
    '      <div class="flex1">',
    '        <div class="gi-t"><van-icon :name="g.icon" color="#0d5e56" style="margin-right:6px;vertical-align:-2px"/>{{ g.t }}</div>',
    '        <div class="gi-d">{{ g.d }}</div>',
    '      </div>',
    '      <van-icon name="arrow" color="#c8c9cc"/>',
    '    </div>',
    '  </div>',
    '  <div class="muted" style="padding:10px 18px 24px;line-height:1.8">还有问题？到店找前台或你的教练，也可以在「我的 → 我的合同」里查看已签署的条款。</div>',
    '  <div style="margin:0 16px 30px"><van-button type="primary" block round @click="$router.push(\'/schedule\')">开始约课</van-button></div>',
    '</div>',
  ].join('\n'),
};
