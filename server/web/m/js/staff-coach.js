/* 员工端-教练: 我的课表 / 预约管理 / 我的学员 / 我的业绩 / 休息设置 */
(function () {
  // 管理员没有教练档案, 选一位教练后即可使用教练的全部功能
  let picked = 0;
  let selfChecked = false;   // 本次打开是否已向服务端核实过本人教练身份
  const selfId = () => (Store.user && Store.user.coach_id) || 0;
  const coachId = () => selfId() || picked || 0;

  const CoachPick = {
    data() { return { coachList: [], coachPick: false, myPick: 0, needPick: !selfId() }; },
    computed: {
      coachCols() { return this.coachList.map(c => ({ text: c.realname, value: c.id })); },
      curCoachName() {
        const id = this.myPick || coachId();
        const c = this.coachList.find(x => x.id === id);
        return c ? c.realname : '请选择教练';
      },
    },
    methods: {
      // 页面 load 前调用: 管理员首次进入时拉教练列表并默认选中第一位
      async ensureCoach() {
        // 登录后才绑定教练档案时本地缓存里 coach_id 还是 0, 先向服务端核实, 有档案就只看本人
        if (!selfId() && !selfChecked) {
          selfChecked = true;
          try {
            const me = await API.get('/coaches/me', { silent: true });
            if (me && me.id) Store.user = Object.assign({}, Store.user, { coach_id: me.id });
          } catch (e) { /* 纯管理岗无档案, 走教练选择 */ }
        }
        this.needPick = !selfId();
        if (!this.needPick) return true;
        if (!this.coachList.length) {
          const d = await API.get('/coaches');
          this.coachList = (d && d.list) || d || [];
        }
        if (!picked && this.coachList.length) picked = this.coachList[0].id;
        this.myPick = coachId();
        return !!coachId();
      },
      onPickCoach(v) {
        const val = v && v.selectedValues ? v.selectedValues[0] : v;
        picked = val; this.myPick = val; this.coachPick = false;
        if (this.load) {
          const p = this.load();
          if (p && p.then) {
            p.then(() => {
              if (this.viewMode === 'week' && this.autoScrollWeekGrid) this.autoScrollWeekGrid();
            });
          }
        }
      },
    },
  };

  // 顶部"当前教练"切换条 + 选择弹层, 仅管理员可见
  const PICK_BAR = [
    '  <div v-if="needPick" class="coach-pick" @click="coachPick=true">',
    '    <van-icon name="manager-o"/><span style="margin-left:6px">当前教练</span>',
    '    <div class="flex1"></div><b>{{ curCoachName }}</b><van-icon name="exchange" style="margin-left:6px"/>',
    '  </div>',
    '  <van-popup v-model:show="coachPick" position="bottom" round>',
    '    <van-picker title="选择教练" :columns="coachCols" @confirm="onPickCoach" @cancel="coachPick=false"/>',
    '  </van-popup>',
  ].join('\n');

  window.Pages.CoachSchedule = {
    data() {
      const today = H.today();
      const d = dayjs(today);
      const day = d.day();
      const diff = day === 0 ? -6 : 1 - day;
      const initialMonday = d.add(diff, 'day').format('YYYY-MM-DD');
      const qView = this.$route && this.$route.query && this.$route.query.view;
      return {
        viewMode: qView === 'day' ? 'day' : 'week', // 默认展示周视图: 周视图在前, 日视图在右
        showCancelled: false, // 日视图默认隐藏已取消课程
        days: H.monthDays(),
        date: today,
        d: null,
        weekMonday: initialMonday,
        weekData: null,
        loading: true,
        hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
        detailShow: false,
        curItem: null,
        planEditor: { show: false, booking: null },
        editingPlan: false,
        planText: '',
        planSaving: false,
      };
    },
    computed: {
      items() {
        if (!this.d) return [];
        const arr = [];
        (this.d.bookings || []).forEach(b => arr.push({
          id: b.id, rawBooking: b, vipId: b.vip_id, key: 'pt' + b.id, time: b.from_time, timeEnd: b.to_time, kind: 'pt',
          title: b.course_title || '私教课', sub: '学员 ' + b.realname, studentName: b.realname, phone: b.phone,
          status: b.status, confirm: b.confirm_status, lesson_plan: b.lesson_plan,
        }));
        (this.d.classes || []).forEach(c => arr.push({
          id: c.id, key: 'g' + c.id, time: H.time(c.start_time), timeEnd: H.time(c.end_time), kind: 'group',
          title: c.title, sub: (c.classroom_name || '') + ' · ' + c.booked_count + '/' + c.people_count + '人',
          classroom: c.classroom_name, status: c.status,
        }));
        return arr.sort((a, b) => a.time < b.time ? -1 : 1);
      },
      activeItems() {
        return (this.items || []).filter(it => Number(it.status) !== 2);
      },
      cancelledItems() {
        return (this.items || []).filter(it => Number(it.status) === 2);
      },
      rests() { return (this.d && this.d.rests) || []; },
      weekSunday() {
        return dayjs(this.weekMonday).add(6, 'day').format('YYYY-MM-DD');
      },
      isCurrentWeek() {
        return this.weekMonday === this.calcMonday(H.today());
      },
      weekLabel() {
        const m = dayjs(this.weekMonday);
        const s = dayjs(this.weekSunday);
        return m.format('YYYY年M月D日') + ' ~ ' + s.format('M月D日');
      },
      curMonthLabel() {
        const m = dayjs(this.weekMonday);
        const s = dayjs(this.weekSunday);
        if (m.format('M') === s.format('M')) {
          return m.format('M月');
        }
        return m.format('M') + '/' + s.format('M月');
      },
      nowLineTop() {
        const now = dayjs();
        const min = now.hour() * 60 + now.minute();
        if (min < 420 || min > 1440) return null;
        return Math.round(((min - 420) / 60) * 52);
      },
      weekSchedule() {
        if (!this.weekData) return [];
        const W_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const res = [];
        const mon = dayjs(this.weekMonday);
        const today = H.today();
        const bookings = this.weekData.bookings || [];
        const classes = this.weekData.classes || [];
        const rests = this.weekData.rests || [];

        function parseMin(t) {
          if (!t) return 0;
          const parts = t.split(':');
          return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
        }

        for (let i = 0; i < 7; i++) {
          const cur = mon.add(i, 'day');
          const dStr = cur.format('YYYY-MM-DD');
          const dayBookings = bookings.filter(b => H.dateOf(b.date) === dStr);
          const dayClasses = classes.filter(c => H.dateOf(c.start_time) === dStr);
          const dayRests = rests.filter(r => H.dateOf(r.rest_date) === dStr);

          const items = [];
          dayBookings.forEach(b => {
            const sMin = parseMin(b.from_time);
            let eMin = parseMin(b.to_time);
            if (eMin <= sMin) eMin = sMin + 60;
            items.push({
              id: b.id,
              rawBooking: b,
              vipId: b.vip_id,
              key: 'pt' + b.id,
              kind: 'pt',
              title: b.course_title || '私教课',
              studentName: b.realname || '学员',
              shortName: b.realname || '学员',
              phone: b.phone,
              time: b.from_time,
              timeEnd: b.to_time,
              startMin: sMin,
              endMin: eMin,
              durationMin: eMin - sMin,
              dateStr: dStr,
              dateFormatted: cur.format('M月D日') + ' ' + W_NAMES[i],
              shortDate: cur.format('M-D'),
              status: b.status,
              confirm: b.confirm_status,
              lesson_plan: b.lesson_plan,
              cardInfo: b.card_type_name ? (b.card_type_name + ' · 扣' + (b.card_deduct_num || 1) + '课时') : '',
              remark: b.remark,
              col: 0,
              totalCols: 1,
            });
          });

          dayClasses.forEach(c => {
            const sTime = H.time(c.start_time);
            const eTime = H.time(c.end_time);
            const sMin = parseMin(sTime);
            let eMin = parseMin(eTime);
            if (eMin <= sMin) eMin = sMin + 60;
            items.push({
              id: c.id,
              key: 'g' + c.id,
              kind: 'group',
              title: c.title,
              studentName: c.title,
              shortName: c.title,
              time: sTime,
              timeEnd: eTime,
              startMin: sMin,
              endMin: eMin,
              durationMin: eMin - sMin,
              dateStr: dStr,
              dateFormatted: cur.format('M月D日') + ' ' + W_NAMES[i],
              shortDate: cur.format('M-D'),
              classroom: c.classroom_name,
              bookedCount: c.booked_count,
              peopleCount: c.people_count,
              cardInfo: (c.classroom_name || '') + ' · ' + c.booked_count + '/' + c.people_count + '人',
              col: 0,
              totalCols: 1,
            });
          });

          items.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

          // 重叠时间分列展示算法 (与主流日历一致)
          const clusters = [];
          let curCluster = [];
          let clusterEnd = -1;
          items.forEach(it => {
            if (curCluster.length === 0) {
              curCluster.push(it);
              clusterEnd = it.endMin;
            } else if (it.startMin < clusterEnd) {
              curCluster.push(it);
              if (it.endMin > clusterEnd) clusterEnd = it.endMin;
            } else {
              clusters.push(curCluster);
              curCluster = [it];
              clusterEnd = it.endMin;
            }
          });
          if (curCluster.length) clusters.push(curCluster);

          clusters.forEach(cl => {
            const colEnds = [];
            cl.forEach(it => {
              let placedCol = -1;
              for (let c = 0; c < colEnds.length; c++) {
                if (colEnds[c] <= it.startMin) {
                  placedCol = c;
                  colEnds[c] = it.endMin;
                  break;
                }
              }
              if (placedCol === -1) {
                placedCol = colEnds.length;
                colEnds.push(it.endMin);
              }
              it.col = placedCol;
            });
            const totalCols = colEnds.length;
            cl.forEach(it => {
              it.totalCols = totalCols;
              it.widthPct = 100 / totalCols;
              it.leftPct = it.col * (100 / totalCols);
            });
          });

          const timedRests = [];
          let allDayRest = false;
          dayRests.forEach(r => {
            if (r.from_time && r.to_time) {
              const sMin = parseMin(r.from_time);
              const eMin = parseMin(r.to_time);
              timedRests.push({ ...r, startMin: sMin, endMin: eMin });
            } else {
              allDayRest = true;
            }
          });

          res.push({
            date: dStr,
            dayNum: cur.format('D'),
            d: cur.format('MM-DD'),
            w: W_NAMES[i],
            isToday: dStr === today,
            isPast: cur.isBefore(dayjs().startOf('day')),
            items,
            rests: dayRests,
            timedRests,
            allDayRest,
          });
        }
        return res;
      },
      weekStats() {
        const ws = this.weekSchedule;
        let pt = 0, group = 0, rest = 0;
        ws.forEach(d => {
          d.items.forEach(it => {
            if (it.kind === 'pt') pt++;
            else if (it.kind === 'group') group++;
          });
          if (d.rests.length) rest++;
        });
        return { pt, group, rest };
      },
    },
    template: [
      '<div class="page">',
      '  <m-nav :title="needPick ? \'教练课表\' : \'我的课表\'"></m-nav>',
      PICK_BAR,
      '  <div style="padding:10px 16px 6px;display:flex;justify-content:center;background:var(--c-card);border-bottom:1px solid var(--c-line)">',
      '    <div style="display:inline-flex;background:var(--c-bg-2);border-radius:20px;padding:3px">',
      '      <div @click="switchView(\'week\')" style="padding:5px 22px;border-radius:18px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s" :style="viewMode===\'week\'?\'background:var(--brand);color:#fff;box-shadow:0 2px 6px rgba(var(--brand-rgb),0.25)\':\'color:var(--c-text-2)\'">周视图</div>',
      '      <div @click="switchView(\'day\')" style="padding:5px 22px;border-radius:18px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s" :style="viewMode===\'day\'?\'background:var(--brand);color:#fff;box-shadow:0 2px 6px rgba(var(--brand-rgb),0.25)\':\'color:var(--c-text-2)\'">日视图</div>',
      '    </div>',
      '  </div>',
      /* === 日视图 === */
      '  <template v-if="viewMode===\'day\'">',
      '    <div class="day-strip" ref="strip">',
      '      <div v-for="dd in days" :key="dd.date" class="day-item" :class="{on:dd.date===date, past:dd.past}" @click="pick(dd.date)">',
      '        <div class="w">{{ dd.w }}</div><div class="d">{{ dd.d }}</div>',
      '      </div>',
      '    </div>',
      '    <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '    <template v-else>',
      '      <div class="pending-bar" v-for="r in rests" :key="r.id" style="background:var(--brand-soft);border-color:var(--brand-line);color:var(--brand)">',
      '        <van-icon name="underway-o"/><span style="margin-left:8px">休息：{{ r.from_time ? (r.from_time+\' - \'+r.to_time) : \'全天\' }}{{ r.remark? \' · \'+r.remark : \'\' }}</span>',
      '      </div>',
      '      <van-empty v-if="!items.length" description="当日暂无课程安排"/>',
      '      <div v-else-if="!activeItems.length && cancelledItems.length" style="text-align:center;padding:36px 16px 12px;color:var(--c-text-3);font-size:13px">',
      '        <van-icon name="passed" size="30" color="var(--c-text-4)" style="display:block;margin-bottom:6px"/>当日暂无待上课程',
      '      </div>',
      '      <!-- 待上/有效课程列表 -->',
      '      <div v-for="it in activeItems" :key="it.key" class="course-item">',
      '        <div class="course-time"><div class="b">{{ it.time }}</div><div class="e">{{ it.timeEnd }}</div></div>',
      '        <div class="flex1" style="min-width:0">',
      '          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">',
      '            <div class="title" style="flex:1;min-width:0">{{ it.title }} <van-tag :type="it.kind===\'pt\'?\'primary\':\'success\'" plain style="margin-left:4px">{{ it.kind===\'pt\'?\'私教\':\'团课\' }}</van-tag></div>',
      '            <d-tag v-if="it.kind===\'pt\'" dict="ptStatus" :v="it.status" style="flex-shrink:0"></d-tag>',
      '          </div>',
      '          <div class="muted mt4" style="display:flex;justify-content:space-between;align-items:center">',
      '            <span :style="it.vipId ? \'cursor:pointer\' : \'\'" @click="it.vipId && $router.push(\'/staff/member/\' + it.vipId)">{{ it.sub }}</span>',
      '            <span v-if="it.vipId" @click="$router.push(\'/staff/member/\' + it.vipId)" style="color:var(--brand);font-size:12px;cursor:pointer"><van-icon name="user-o"/> 学员风采</span>',
      '          </div>',
      '          <lesson-plan-card v-if="it.kind===\'pt\'" :plan="it.lesson_plan" :booking="it" :can-edit="true" @edit="openPlanEditor(it)"/>',
      '        </div>',
      '      </div>',
      '      <!-- 已取消课程区域（默认隐藏，下拉到底部可点击展开） -->',
      '      <div v-if="cancelledItems.length" style="padding:16px 16px 24px;text-align:center">',
      '        <div class="cancelled-toggle-btn" @click="showCancelled=!showCancelled">',
      '          <van-icon :name="showCancelled ? \'arrow-up\' : \'arrow-down\'" size="13"/>',
      '          <span>{{ showCancelled ? \'收起已取消课程\' : (\'显示已取消课程 (\' + cancelledItems.length + \')\') }}</span>',
      '        </div>',
      '      </div>',
      '      <div v-if="showCancelled && cancelledItems.length" style="margin-bottom:24px">',
      '        <div v-for="it in cancelledItems" :key="it.key" class="course-item cancelled">',
      '          <div class="course-time"><div class="b">{{ it.time }}</div><div class="e">{{ it.timeEnd }}</div></div>',
      '          <div class="flex1" style="min-width:0">',
      '            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">',
      '              <div class="title" style="flex:1;min-width:0">{{ it.title }} <van-tag type="default" plain style="margin-left:4px">{{ it.kind===\'pt\'?\'私教\':\'团课\' }}</van-tag></div>',
      '              <d-tag v-if="it.kind===\'pt\'" dict="ptStatus" :v="it.status" style="flex-shrink:0"></d-tag>',
      '            </div>',
      '            <div class="muted mt4">{{ it.sub }}</div>',
      '            <lesson-plan-card v-if="it.kind===\'pt\' && it.lesson_plan" :plan="it.lesson_plan" :booking="it" :can-edit="false"/>',
      '          </div>',
      '        </div>',
      '      </div>',
      '    </template>',
      '  </template>',
      /* === 周视图 (参考图二: 2D时间网格) === */
      '  <template v-else>',
      '    <div class="timetable-wrap">',
      '      <div class="timetable-nav">',
      '        <van-button size="small" plain round icon="arrow-left" @click="prevWeek">上周</van-button>',
      '        <div style="text-align:center">',
      '          <div style="font-weight:700;font-size:14px;color:var(--c-title)">{{ weekLabel }}</div>',
      '          <div class="muted" style="font-size:11px;margin-top:2px">',
      '            共 {{ weekStats.pt }} 节私教 · {{ weekStats.group }} 节团课<template v-if="weekStats.rest"> · 休息 {{ weekStats.rest }} 天</template>',
      '          </div>',
      '        </div>',
      '        <div style="display:flex;gap:4px">',
      '          <van-button v-if="!isCurrentWeek" size="small" plain round type="primary" @click="goCurrentWeek">本周</van-button>',
      '          <van-button size="small" plain round icon="arrow" @click="nextWeek">下周</van-button>',
      '        </div>',
      '      </div>',
      '      <!-- 顶部固定行: 月份 + 7天星期与日期 (对齐图二) -->',
      '      <div class="timetable-header">',
      '        <div class="timetable-month-cell">{{ curMonthLabel }}</div>',
      '        <div class="timetable-days-row">',
      '          <div v-for="day in weekSchedule" :key="day.date" class="timetable-day-col-head" :class="{\'is-today\': day.isToday}" @click="jumpToDay(day.date)">',
      '            <div class="timetable-date-num" :class="{\'is-today\': day.isToday}">{{ day.dayNum }}</div>',
      '            <div class="timetable-week-name">{{ day.w }}</div>',
      '            <div v-if="day.allDayRest" style="margin-top:1px"><span style="font-size:9px;padding:0 3px;border-radius:3px;background:var(--c-bg-2);color:var(--c-text-2)">休</span></div>',
      '          </div>',
      '        </div>',
      '      </div>',
      '      <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载周课表中...</van-loading></div>',
      '      <!-- 二维时间网格主体 (左侧时间轴 + 右侧7列网格) -->',
      '      <div v-else class="timetable-body" ref="timeBody">',
      '        <div class="timetable-time-axis" :style="{ height: (17 * 52) + \'px\' }">',
      '          <div v-for="(h, idx) in hours" :key="h" class="timetable-time-label" :style="{ top: (idx * 52) + \'px\' }">',
      '            {{ String(h).padStart(2, \'0\') + \':00\' }}',
      '          </div>',
      '        </div>',
      '        <div class="timetable-grid-area" :style="{ height: (17 * 52) + \'px\' }">',
      '          <div v-for="day in weekSchedule" :key="day.date" class="timetable-col" :class="{\'is-today\': day.isToday}">',
      '            <!-- 当前时间指示线 -->',
      '            <div v-if="day.isToday && nowLineTop !== null" class="timetable-now-line" :style="{ top: nowLineTop + \'px\' }">',
      '              <div class="timetable-now-dot"></div>',
      '            </div>',
      '            <!-- 休息时段 -->',
      '            <div v-for="r in day.timedRests" :key="\'r\'+r.id" class="timetable-rest-block" :style="calcRestStyle(r)">',
      '              <span>休 {{ r.from_time }}-{{ r.to_time }}</span>',
      '            </div>',
      '            <!-- 课程卡片 (参考图二: 浅暖杏色底 + 橙方块 ▪ + 学员姓名) -->',
      '            <div v-for="it in day.items" :key="it.key" class="timetable-card" :class="[it.kind, it.status === 2 ? \'cancelled\' : \'\']" :style="calcCardStyle(it)" @click="openItemDetail(it)">',
      '              <div class="timetable-card-head">',
      '                <span class="timetable-card-bullet">▪</span>',
      '                <span class="timetable-card-title">{{ it.shortName }}</span>',
      '              </div>',
      '              <div v-if="(it.durationMin || 60) >= 45" class="timetable-card-time">{{ it.time }}</div>',
      '            </div>',
      '          </div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </template>',
      '  <!-- 课程详情底部抽屉 (支持查看及快捷修改本节课训练计划) -->',
      '  <van-popup v-model:show="detailShow" position="bottom" round safe-area-inset-bottom style="max-height:85vh">',
      '    <div v-if="curItem" style="padding:16px 18px 24px">',
      '      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">',
      '        <div style="display:flex;align-items:center;gap:6px">',
      '          <span style="font-size:16px;font-weight:700;color:var(--c-title)">{{ curItem.title }}</span>',
      '          <van-tag :type="curItem.kind===\'pt\'?\'primary\':\'success\'" plain size="small">{{ curItem.kind===\'pt\'?\'私教\':\'团课\' }}</van-tag>',
      '          <d-tag v-if="curItem.kind===\'pt\'" dict="ptStatus" :v="curItem.status"></d-tag>',
      '        </div>',
      '        <van-icon name="cross" size="18" color="var(--c-text-3)" @click="detailShow=false" style="cursor:pointer"/>',
      '      </div>',
      '      <div style="background:var(--c-bg-2);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:13px;line-height:1.8">',
      '        <div style="display:flex;justify-content:space-between" v-if="curItem.studentName">',
      '          <span class="muted">学员：</span>',
      '          <span style="font-weight:600;color:var(--c-title)">{{ curItem.studentName }} <span v-if="curItem.phone" style="font-weight:400;color:var(--c-text-2)">({{ curItem.phone }})</span></span>',
      '        </div>',
      '        <div style="display:flex;justify-content:space-between">',
      '          <span class="muted">上课时间：</span>',
      '          <span style="font-weight:600;color:var(--brand)">{{ curItem.dateFormatted }} {{ curItem.time }}-{{ curItem.timeEnd }}</span>',
      '        </div>',
      '        <div style="display:flex;justify-content:space-between" v-if="curItem.classroom">',
      '          <span class="muted">教室：</span>',
      '          <span>{{ curItem.classroom }}</span>',
      '        </div>',
      '        <div style="display:flex;justify-content:space-between" v-if="curItem.cardInfo">',
      '          <span class="muted">课时信息：</span>',
      '          <span>{{ curItem.cardInfo }}</span>',
      '        </div>',
      '        <div style="display:flex;justify-content:space-between" v-if="curItem.remark">',
      '          <span class="muted">预约备注：</span>',
      '          <span>{{ curItem.remark }}</span>',
      '        </div>',
      '      </div>',
      '      <!-- SYS-03 本节课训练计划 (图片缩略图+点击放大+图二编辑器) -->',
      '      <div v-if="curItem.kind===\'pt\'" style="margin-bottom:16px">',
      '        <lesson-plan-card :plan="curItem.lesson_plan" :booking="curItem" :can-edit="true" @edit="openPlanEditor(curItem)"/>',
      '      </div>',
      '      <div style="display:flex;gap:10px">',
      '        <van-button v-if="curItem.vipId" block round plain icon="user-o" type="primary" @click="$router.push(\'/staff/member/\' + curItem.vipId); detailShow=false" style="flex:1">学员详情/风采</van-button>',
      '        <van-button block round plain icon="calendar-o" @click="jumpToDay(curItem.dateStr)" style="flex:1">查看该日详情（{{ curItem.shortDate }}）</van-button>',
      '      </div>',
      '    </div>',
      '  </van-popup>',
      '  <plan-editor-popup v-model="planEditor.show" :booking="planEditor.booking" @saved="onPlanSaved"/>',
      '</div>',
    ].join('\n'),
    methods: {
      calcMonday(dStr) {
        const d = dayjs(dStr || H.today());
        const day = d.day();
        const diff = day === 0 ? -6 : 1 - day;
        return d.add(diff, 'day').format('YYYY-MM-DD');
      },
      switchView(mode) {
        if (this.viewMode === mode) return;
        this.viewMode = mode;
        if (mode === 'day') {
          this.showCancelled = false;
          this.load();
          this.scrollDay();
        } else {
          this.weekMonday = this.calcMonday(this.date);
          this.load().then(() => this.autoScrollWeekGrid());
        }
      },
      prevWeek() {
        this.weekMonday = dayjs(this.weekMonday).subtract(7, 'day').format('YYYY-MM-DD');
        this.load().then(() => this.autoScrollWeekGrid());
      },
      nextWeek() {
        this.weekMonday = dayjs(this.weekMonday).add(7, 'day').format('YYYY-MM-DD');
        this.load().then(() => this.autoScrollWeekGrid());
      },
      goCurrentWeek() {
        this.weekMonday = this.calcMonday(H.today());
        this.load().then(() => this.autoScrollWeekGrid());
      },
      jumpToDay(dateStr) {
        this.date = dateStr;
        this.viewMode = 'day';
        this.showCancelled = false;
        this.detailShow = false;
        this.load();
        this.scrollDay();
      },
      pick(d) { this.date = d; this.showCancelled = false; this.load(); this.scrollDay(); },
      scrollDay() {
        this.$nextTick(() => {
          const strip = this.$refs.strip; if (!strip) return;
          const el = strip.querySelector('.day-item.on'); if (!el) return;
          strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.offsetWidth / 2, behavior: 'auto' });
        });
      },
      autoScrollWeekGrid() {
        this.$nextTick(() => {
          setTimeout(() => {
            const body = this.$refs.timeBody;
            if (!body) return;
            let minStart = 1440;
            (this.weekSchedule || []).forEach(day => {
              (day.items || []).forEach(it => {
                if (it.startMin && it.startMin < minStart) {
                  minStart = it.startMin;
                }
              });
            });
            const targetMin = minStart < 1440 ? Math.max(420, minStart - 30) : 510;
            const targetTop = Math.round(((targetMin - 420) / 60) * 52);
            body.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
          }, 50);
        });
      },
      calcCardStyle(it) {
        const sMin = Math.max(420, it.startMin || 420);
        const eMin = Math.min(1440, it.endMin || (sMin + 60));
        const top = Math.round(((sMin - 420) / 60) * 52);
        const duration = Math.max(25, eMin - sMin);
        const height = Math.max(26, Math.round((duration / 60) * 52) - 2);
        const widthPct = it.widthPct || 100;
        const leftPct = it.leftPct || 0;
        return {
          top: top + 'px',
          height: height + 'px',
          left: 'calc(' + leftPct + '% + 1px)',
          width: 'calc(' + widthPct + '% - 2px)',
        };
      },
      calcRestStyle(r) {
        const sMin = Math.max(420, r.startMin || 420);
        const eMin = Math.min(1440, r.endMin || (sMin + 60));
        const top = Math.round(((sMin - 420) / 60) * 52);
        const duration = Math.max(20, eMin - sMin);
        const height = Math.max(20, Math.round((duration / 60) * 52) - 2);
        return {
          top: top + 'px',
          height: height + 'px',
        };
      },
      openItemDetail(it) {
        this.curItem = it;
        this.planText = it.lesson_plan || '';
        this.editingPlan = false;
        this.detailShow = true;
      },
      openPlanEditor(it) {
        this.planEditor = { show: true, booking: it };
      },
      onPlanSaved(e) {
        if (this.curItem && this.curItem.id === e.booking.id) {
          this.curItem.lesson_plan = e.raw;
          if (this.curItem.rawBooking) {
            this.curItem.rawBooking.lesson_plan = e.raw;
          }
        }
        if (this.items) {
          const target = this.items.find(it => it.id === e.booking.id);
          if (target) target.lesson_plan = e.raw;
        }
        if (this.weekData && this.weekData.bookings) {
          const wb = this.weekData.bookings.find(b => b.id === e.booking.id);
          if (wb) wb.lesson_plan = e.raw;
        }
      },
      async load() {
        this.loading = true;
        try {
          if (!(await this.ensureCoach())) { this.d = null; this.weekData = null; return; }
          const cid = coachId();
          if (this.viewMode === 'day') {
            this.d = await API.get('/coaches/' + cid + '/schedule?from=' + this.date + '&to=' + this.date);
          } else {
            const mon = this.weekMonday;
            const sun = dayjs(mon).add(6, 'day').format('YYYY-MM-DD');
            this.weekData = await API.get('/coaches/' + cid + '/schedule?from=' + mon + '&to=' + sun);
          }
        } finally { this.loading = false; }
      },
    },
    mixins: [CoachPick],
    mounted() {
      this.load().then(() => {
        if (this.viewMode === 'week') this.autoScrollWeekGrid();
      });
      this.scrollDay();
    },
  };

  window.Pages.CoachBookings = {
    data() { return { days: H.monthDays(), date: H.today(), list: [], loading: true, doing: 0, planEditor: { show: false, booking: null } }; },
    template: [
      '<div class="page">',
      '  <m-nav title="预约管理"></m-nav>',
      '  <div class="day-strip" ref="strip">',
      '    <div v-for="dd in days" :key="dd.date" class="day-item" :class="{on:dd.date===date, past:dd.past}" @click="pick(dd.date)">',
      '      <div class="w">{{ dd.w }}</div><div class="d">{{ dd.d }}</div>',
      '    </div>',
      '  </div>',
      '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!list.length" :description="H.day(date) + \'暂无预约\'"/>',
      '    <div v-for="b in list" :key="b.id" class="rec-item">',
      '      <div class="head">',
      '        <span class="name">{{ b.realname }} <span class="muted" style="font-weight:400;font-size:12px">{{ b.course_title }}</span></span>',
      '        <span><d-tag dict="ptStatus" :v="b.status"></d-tag>',
      '          <van-tag v-if="b.status===1 && b.confirm_status===1" type="warning" round style="margin-left:4px">待学员确认</van-tag></span>',
      '      </div>',
      '      <div class="bk-time mt8"><van-icon name="clock-o" size="13"/> <b>{{ b.from_time }}-{{ b.to_time }}</b>',
      '        <span class="bk-day">{{ H.day(b.date) }}（{{ H.week(b.date) }}）</span></div>',
      '      <div class="muted mt4">上课教练：{{ b.coach_name || \'未指定\' }}</div>',
      '      <div class="muted mt4">{{ b.card_type_name }} · 扣{{ b.card_deduct_num }}课时<template v-if="b.remark"> · 备注：{{ b.remark }}</template></div>',
      '      <lesson-plan-card :plan="b.lesson_plan" :booking="b" :can-edit="b.status===0 || b.status===1" @edit="openPlanEditor(b)"/>',
      '      <div class="foot" v-if="b.status===0 || b.status===1">',
      '        <template v-if="b.status===0">',
      '          <van-button size="small" round plain @click="cancel(b)">拒绝</van-button>',
      '          <van-button size="small" round type="primary" :loading="doing===b.id" @click="confirm(b)">确认预约</van-button>',
      '        </template>',
      '        <template v-else>',
      '          <template v-if="b.confirm_status!==1">',
      '            <van-button v-if="isPast(b)" size="small" round plain type="danger" @click="noshow(b)">标记爽约</van-button>',
      '            <van-button v-if="isPast(b)" size="small" round plain type="warning" @click="startFinish(b)">发起学员确认</van-button>',
      '            <van-button v-if="isPast(b)" size="small" round type="primary" :loading="doing===b.id" @click="finishNow(b)">确认销课</van-button>',
      '          </template>',
      '          <van-button size="small" round plain @click="cancel(b)">取消预约</van-button>',
      '        </template>',
      '      </div>',
      '    </div>',
      '  </template>',
      '  <plan-editor-popup v-model="planEditor.show" :booking="planEditor.booking" @saved="onPlanSaved"/>',
      '</div>',
    ].join('\n'),
    methods: {
      isPast(b) { return H.isPast(H.dateOf(b.date) + ' ' + b.to_time); },
      qs() { return 'date=' + this.date + '&order=asc'; },   // 单日视图, 按上课时间从早到晚
      pick(d) { this.date = d; this.load(); this.scrollDay(); },
      scrollDay() {
        this.$nextTick(() => {
          const strip = this.$refs.strip; if (!strip) return;
          const el = strip.querySelector('.day-item.on'); if (!el) return;
          strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.offsetWidth / 2, behavior: 'auto' });
        });
      },
      async load(silent = false) {
        if (!silent) this.loading = true;
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        try {
          const d = await API.get('/ptrain-bookings?size=100&' + this.qs());
          this.list = d.list || [];
        } finally {
          if (!silent) this.loading = false;
          if (silent) {
            this.$nextTick(() => {
              window.scrollTo({ top: scrollY, behavior: 'instant' });
            });
          }
        }
      },
      async confirm(b) {
        this.doing = b.id;
        try {
          await API.post('/ptrain-bookings/' + b.id + '/confirm');
          vant.showToast({ message: '已确认预约', icon: 'success' });
          this.load(true);
        } finally { this.doing = 0; }
      },
      async cancel(b) {
        // 原因留给后端按当前操作人兜底(管理员代取消时不会错记成教练)
        let reason = '';
        try {
          const r = await vant.showDialog({
            title: '取消预约', confirmButtonColor: 'var(--brand)', showCancelButton: true,
            message: b.realname + ' ' + H.day(b.date) + ' ' + b.from_time + '\n取消后该时段释放；课时在销课时才扣，不受影响',
          });
          reason = (r && r.value) || '';
        } catch (e) { return; }
        await API.post('/ptrain-bookings/' + b.id + '/cancel', reason ? { reason } : {});
        vant.showToast('已取消');
        this.load(true);
      },
      // 教练直接销课(纪要4.1现状: 教练手动点销课、课时随之扣减); 学员确认为可选双保险
      async finishNow(b) {
        try { await vant.showConfirmDialog({ title: '确认销课', message: b.realname + ' ' + H.day(b.date) + ' ' + b.from_time + ' 本节课已上完？将扣减 ' + (b.card_deduct_num || 1) + ' 课时并短信通知学员。', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
        this.doing = b.id;
        try {
          await API.post('/ptrain-bookings/' + b.id + '/finish', {});
          vant.showToast({ message: '已销课', icon: 'success' });
          this.load(true);
        } finally { this.doing = 0; }
      },
      async noshow(b) {
        try { await vant.showConfirmDialog({ title: '标记爽约', message: '确定将 ' + b.realname + ' 本节课标记为爽约吗？', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
        await API.post('/ptrain-bookings/' + b.id + '/noshow');
        vant.showToast('已标记爽约');
        this.load(true);
      },
      async startFinish(b) {
        try { await vant.showConfirmDialog({ title: '发起消课', message: '向 ' + b.realname + ' 发起本节课消课确认？学员确认后自动扣课时。', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
        this.doing = b.id;
        try {
          const r = await API.post('/ptrain-bookings/' + b.id + '/start-finish');
          vant.showDialog({ title: '已发起消课', message: (r && r.msg) || '请学员在小程序「待确认消课」中确认', confirmButtonColor: 'var(--brand)' });
          this.load(true);
        } finally { this.doing = 0; }
      },
      openPlanEditor(b) {
        this.planEditor = { show: true, booking: b };
      },
      onPlanSaved(e) {
        const b = this.list.find(x => x.id === e.booking.id);
        if (b) b.lesson_plan = e.raw;
      },
    },
    mounted() { this.load(); this.scrollDay(); },
  };

  window.Pages.CoachStudents = {
    data() { return { list: [], loading: true }; },
    template: [
      '<div class="page">',
      '  <m-nav :title="needPick ? \'学员管理\' : \'我的学员\'"></m-nav>',
      PICK_BAR,
      '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!list.length" description="暂无学员"/>',
      '    <div v-for="s in list" :key="s.card_id" class="rec-item flex" @click="$router.push(\'/staff/member/\' + s.id)" style="cursor:pointer">',
      '      <m-avatar :name="s.realname" :size="44"></m-avatar>',
      '      <div class="flex1" style="margin-left:12px">',
      '        <div class="name">{{ s.realname }}',
      '          <van-tag v-if="!s.lessons_30d" color="var(--c-bg-2)" text-color="var(--c-text-2)" style="margin-left:4px">30天未上课</van-tag>',
      '        </div>',
      '        <div class="muted mt4">{{ s.phone }} · {{ s.card_type_name }}</div>',
      '        <div class="muted mt4">剩余 <b class="brand-text">{{ s.left_counts }}</b>/{{ s.counts }} 课时 · 近30天 {{ s.lessons_30d }} 节 · 最近 {{ s.last_lesson_time ? H.day(s.last_lesson_time) : \'从未上课\' }}</div>',
      '      </div>',
      '      <van-icon name="arrow" color="var(--c-text-4)" style="align-self:center;margin-left:6px"/>',
      '    </div>',
      '  </template>',
      '</div>',
    ].join('\n'),
    mixins: [CoachPick],
    methods: {
      async load() {
        this.loading = true;
        try {
          if (!(await this.ensureCoach())) { this.list = []; return; }
          this.list = await API.get('/coaches/' + coachId() + '/students');
        } finally { this.loading = false; }
      },
    },
    mounted() { this.load(); },
  };

  window.Pages.CoachPerf = {
    data() { return { rows: [], loading: true, month: dayjs().format('YYYY-MM'), isCoach: (Store.user || {}).role === 'coach' }; },
    computed: {
      mine() { return this.rows.find(r => r.id === coachId()) || { lessons: 0, spend_money: 0, sales_money: 0, sales_orders: 0 }; },
    },
    template: [
      '<div class="page">',
      '  <m-nav :title="isCoach ? \'我的业绩\' : \'教练业绩\'"></m-nav>',
      '  <div v-if="loading" style="text-align:center;padding:50px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <div class="muted" style="padding:12px 16px 0">{{ month }} 月度统计</div>',
      '    <template v-if="isCoach">',
      '      <div class="kpi-grid">',
      '        <div class="kpi"><div class="l">本月消课课时</div><div class="v">{{ H.num(mine.lessons) }} <span style="font-size:12px;font-weight:400">节</span></div></div>',
      '        <div class="kpi"><div class="l">本月耗课金额</div><div class="v">{{ H.money(mine.spend_money) }}</div></div>',
      '        <div class="kpi"><div class="l">名下卖卡业绩</div><div class="v">{{ H.money(mine.sales_money) }}</div></div>',
      '        <div class="kpi"><div class="l">卖卡成单</div><div class="v">{{ mine.sales_orders }} <span style="font-size:12px;font-weight:400">单</span></div></div>',
      '      </div>',
      '    </template>',
      '    <div class="sec-title" v-if="!isCoach">课时排行</div>',
      '    <div class="card-box" v-if="!isCoach" style="padding:2px 8px">',
      '      <van-cell v-for="(r,i) in rows" :key="r.id" :title="(i+1)+\'. \'+r.realname" :label="\'耗课 \'+H.money(r.spend_money)+\' · 卖卡 \'+H.money(r.sales_money)">',
      '        <template #value><b>{{ H.num(r.lessons) }} 节</b></template>',
      '      </van-cell>',
      '    </div>',
      '    <div class="rpt-export-row" @click="exportCsv()">导出本期数据 <van-icon name="arrow" size="11"/></div>',
      '  </template>',
      '</div>',
    ].join('\n'),
    methods: {
      exportCsv() {
        var url = '/api/coaches/performance?month=' + this.month + '&export=csv';
        window.open(url + '&token=' + encodeURIComponent(Store.token));
      },
    },
    async mounted() {
      try { this.rows = await API.get('/coaches/performance?month=' + this.month); }
      finally { this.loading = false; }
    },
  };

  window.Pages.CoachRests = {
    data() {
      return {
        list: [], loading: true,
        show: false, form: { rest_date: '', allDay: true, from_time: '10:00', to_time: '12:00', remark: '' },
        saving: false,
      };
    },
    template: [
      '<div class="page">',
      '  <m-nav :title="needPick ? \'教练休息设置\' : \'休息设置\'"></m-nav>',
      PICK_BAR,
      '  <div class="muted" style="padding:12px 16px 0">设置休息后，对应时段会员将无法预约{{ needPick ? \'该教练\' : \'您\' }}的私教课。</div>',
      '  <div style="margin:12px 16px"><van-button type="primary" block round icon="plus" @click="openAdd">新增休息</van-button></div>',
      '  <div v-if="loading" style="text-align:center;padding:40px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!list.length" description="暂无休息安排"/>',
      '    <div v-for="r in list" :key="r.id" class="rec-item flex">',
      '      <van-icon name="underway-o" size="24" color="var(--brand)"/>',
      '      <div class="flex1" style="margin-left:12px">',
      '        <div class="name">{{ H.day(r.rest_date) }}（{{ H.week(r.rest_date) }}）</div>',
      '        <div class="muted mt4">{{ r.from_time ? (r.from_time+\' - \'+r.to_time) : \'全天休息\' }}{{ r.remark ? \' · \'+r.remark : \'\' }}</div>',
      '      </div>',
      '      <van-button size="small" round plain type="danger" @click="del(r)">删除</van-button>',
      '    </div>',
      '  </template>',
      '  <van-popup v-model:show="show" position="bottom" round safe-area-inset-bottom>',
      '    <div style="padding:20px 16px 24px">',
      '      <div style="font-size:16px;font-weight:600;margin-bottom:12px">新增休息</div>',
      '      <van-field label="日期">',
      '        <template #input><input type="date" v-model="form.rest_date" style="border:none;outline:none;background:transparent;font-size:14px"/></template>',
      '      </van-field>',
      '      <van-field label="全天休息">',
      '        <template #input><van-switch v-model="form.allDay" size="20" active-color="var(--brand)"/></template>',
      '      </van-field>',
      '      <template v-if="!form.allDay">',
      '        <van-field label="开始时间"><template #input><input type="time" v-model="form.from_time" style="border:none;outline:none;background:transparent;font-size:14px"/></template></van-field>',
      '        <van-field label="结束时间"><template #input><input type="time" v-model="form.to_time" style="border:none;outline:none;background:transparent;font-size:14px"/></template></van-field>',
      '      </template>',
      '      <van-field v-model="form.remark" label="备注" placeholder="选填" :border="false"/>',
      '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">保存</van-button></div>',
      '    </div>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      openAdd() { this.form = { rest_date: H.today(), allDay: true, from_time: '10:00', to_time: '12:00', remark: '' }; this.show = true; },
      async load() {
        this.loading = true;
        try {
          if (!(await this.ensureCoach())) { this.list = []; return; }
          this.list = await API.get('/coach-rests?coach_id=' + coachId() + '&from=' + dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
        } finally { this.loading = false; }
      },
      async save() {
        if (!this.form.rest_date) return vant.showToast('请选择日期');
        if (!this.form.allDay && (!this.form.from_time || !this.form.to_time)) return vant.showToast('请选择时段');
        this.saving = true;
        try {
          await API.post('/coach-rests', {
            coach_id: coachId(), rest_date: this.form.rest_date,
            from_time: this.form.allDay ? '' : this.form.from_time,
            to_time: this.form.allDay ? '' : this.form.to_time,
            remark: this.form.remark,
          });
          this.show = false;
          vant.showToast({ message: '已添加', icon: 'success' });
          this.load();
        } finally { this.saving = false; }
      },
      async del(r) {
        try { await vant.showConfirmDialog({ title: '删除休息', message: '确定删除 ' + H.day(r.rest_date) + ' 的休息安排吗？', confirmButtonColor: 'var(--brand)' }); } catch (e) { return; }
        await API.del('/coach-rests/' + r.id);
        vant.showToast('已删除');
        this.load();
      },
    },
    mixins: [CoachPick],
    mounted() { this.load(); },
  };
})();
