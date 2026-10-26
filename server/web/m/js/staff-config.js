/* 员工端-配置类: 卡类型配置 / 动作库 / 教练档案 / 来源渠道 (对应 PC server/web/admin/js/pages/card-categories.js, training-actions.js, coaches.js, settings.js 里的 SettingsSources) */
(function () {
  function toNum(v, def) {
    if (v === '' || v == null) return def || 0;
    const n = Number(v);
    return isNaN(n) ? (def || 0) : n;
  }

  /* ============ 卡类型配置 ============ */
  const CAT_NUM_FIELDS = ['price', 'original_price', 'expire_days', 'total_counts', 'gift_money', 'sort',
    'book_limit_day', 'book_limit_week', 'book_limit_month30', 'advance_book_limit',
    'free_cancel_total', 'free_cancel_month_overtime', 'cancel_deadline_hours', 'noshow_limit_30d',
    'latest_open_days', 'pause_times', 'pause_max_days', 'purchase_limit', 'milestone_interval'];

  window.Pages.StaffCardCategories = {
    data() {
      return {
        kind: '0', list: [], loading: false,
        popup: false, form: {}, saving: false, open: [],
        kindOpts: [{ v: 1, t: '次卡' }, { v: 2, t: '时间卡' }, { v: 3, t: '储值卡' }, { v: 4, t: '私教卡' }],
        openModeOpts: [{ v: 1, t: '立即开卡' }, { v: 2, t: '首次使用开卡' }, { v: 3, t: '指定日期' }],
        milestoneOpts: [{ v: 0, t: '关闭' }, { v: 1, t: '按课时' }, { v: 2, t: '按天数' }],
      };
    },
    computed: {
      canEdit() { return ['admin', 'manager'].includes((Store.user || {}).role); },
      filtered() {
        if (this.kind === '0') return this.list;
        return this.list.filter(x => String(x.card_kind) === this.kind);
      },
    },
    template: [
      '<div class="page">',
      '  <m-nav title="卡类型配置"></m-nav>',
      '  <van-tabs v-model:active="kind" color="var(--brand)" sticky>',
      '    <van-tab title="全部" name="0"></van-tab>',
      '    <van-tab title="次卡" name="1"></van-tab>',
      '    <van-tab title="时间卡" name="2"></van-tab>',
      '    <van-tab title="储值卡" name="3"></van-tab>',
      '    <van-tab title="私教卡" name="4"></van-tab>',
      '  </van-tabs>',
      '  <div style="margin:10px 12px" v-if="canEdit"><van-button type="primary" block round icon="plus" @click="openAdd">新增卡类型</van-button></div>',
      '  <div v-if="loading" style="text-align:center;padding:40px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!filtered.length" description="暂无卡类型"/>',
      '    <div v-for="c in filtered" :key="c.id" class="rec-item">',
      '      <div class="head">',
      '        <span class="name"><van-tag plain type="primary" style="margin-right:6px">{{ DICT.cardKind[c.card_kind]||\'-\' }}</van-tag>{{ c.title }}</span>',
      '        <van-tag :type="c.status===1?\'success\':\'default\'" round>{{ c.status===1?\'上架\':\'下架\' }}</van-tag>',
      '      </div>',
      '      <div class="muted mt8">',
      '        <span class="price">{{ H.money(c.price) }}</span>',
      '        <span v-if="Number(c.original_price)>Number(c.price)" class="line-through" style="margin-left:6px">{{ H.money(c.original_price) }}</span>',
      '        <span style="margin-left:8px">',
      '          <template v-if="c.card_kind===3">充{{ H.money(c.price) }}赠{{ H.money(c.gift_money) }}</template>',
      '          <template v-else-if="c.total_counts>0">{{ c.total_counts }}次</template>',
      '          <template v-else>不限次</template>',
      '          · {{ c.expire_days }}天有效',
      '        </span>',
      '      </div>',
      '      <div class="muted mt4">开卡方式：{{ DICT.openMode[c.open_card_mode]||\'-\' }} · 线上{{ c.online_sale?\'可售\':\'不可售\' }} · 排序 {{ c.sort }}</div>',
      '      <div class="foot" v-if="canEdit">',
      '        <van-button size="small" round plain @click="openEdit(c)">编辑</van-button>',
      '        <van-button size="small" round :type="c.status===1?\'default\':\'primary\'" plain @click="toggleStatus(c)">{{ c.status===1?\'下架\':\'上架\' }}</van-button>',
      '      </div>',
      '    </div>',
      '  </template>',

      '  <van-popup v-model:show="popup" position="bottom" round safe-area-inset-bottom>',
      '    <div class="pop-scroll">',
      '      <div class="pop-head">{{ form.id ? (\'编辑卡类型 - \'+form.title) : \'新增卡类型\' }}</div>',

      '      <div style="font-size:13px;font-weight:600;color:var(--brand);margin:6px 0 8px">基础信息</div>',
      '      <div class="muted mt4" style="margin-bottom:6px">卡种{{ form.id ? \'（创建后不可修改）\' : \'\' }}</div>',
      '      <div class="unit-seg">',
      '        <span v-for="k in kindOpts" :key="k.v" :class="{on:form.card_kind===k.v}" :style="form.id?\'opacity:.55\':\'\'" @click="!form.id && (form.card_kind=k.v)">{{ k.t }}</span>',
      '      </div>',
      '      <van-field v-model="form.title" label="卡名称" placeholder="如：健身年卡" required/>',
      '      <van-field v-model="form.intro" type="textarea" rows="2" autosize label="简介" placeholder="选填"/>',
      '      <van-field v-model="form.price" type="number" label="售价(¥)" placeholder="必填" required/>',
      '      <van-field v-model="form.original_price" type="number" label="划线原价(¥)" placeholder="选填，用于展示折扣"/>',
      '      <van-field v-model="form.expire_days" type="number" label="有效期(天)" placeholder="必填" required/>',
      '      <van-field v-if="form.card_kind===1||form.card_kind===4" v-model="form.total_counts" type="number" label="总次数/课时" placeholder="必填" required/>',
      '      <van-field v-if="form.card_kind===3" v-model="form.gift_money" type="number" label="赠送金额(¥)" placeholder="选填"/>',
      '      <van-field v-model="form.sort" type="number" label="排序" :border="false"/>',

      '      <div style="font-size:13px;font-weight:600;color:var(--brand);margin:14px 0 8px">课程权限</div>',
      '      <van-field v-model="form.course_permission" type="textarea" rows="2" autosize placeholder="描述该卡可上的课程范围（展示用），如：全部团课 + 自由训练" :border="false"/>',

      '      <van-collapse v-model="open" class="fn-collapse" style="margin:16px 0 0">',
      '        <van-collapse-item title="预约限制" name="book">',
      '          <div class="muted" style="margin:0 0 8px">以下均为 0 表示不限制</div>',
      '          <van-field v-model="form.book_limit_day" type="number" label="每日限约(次)"/>',
      '          <van-field v-model="form.book_limit_week" type="number" label="每周限约(次)"/>',
      '          <van-field v-model="form.book_limit_month30" type="number" label="每30天限约(次)"/>',
      '          <van-field v-model="form.advance_book_limit" type="number" label="同时保留预约数"/>',
      '          <van-field v-model="form.book_time_range" label="可约时段" placeholder="如 08:00-21:00，留空不限"/>',
      '          <van-field v-model="form.group_advance_range" label="团课预约窗口" placeholder="如 7,2 = 提前7天开约,开课前2小时截止" :border="false"/>',
      '        </van-collapse-item>',
      '        <van-collapse-item title="取消与爽约" name="cancel">',
      '          <van-field v-model="form.free_cancel_total" type="number" label="免费取消总次数"/>',
      '          <van-field v-model="form.free_cancel_month_overtime" type="number" label="每月超时取消上限"/>',
      '          <van-field v-model="form.cancel_deadline_hours" type="number" label="取消截止(小时)"/>',
      '          <van-field v-model="form.noshow_limit_30d" type="number" label="30天爽约上限" :border="false"/>',
      '        </van-collapse-item>',
      '        <van-collapse-item title="开卡与暂停" name="open">',
      '          <div class="muted" style="margin:0 0 8px">默认开卡方式</div>',
      '          <div class="unit-seg" style="margin-bottom:10px">',
      '            <span v-for="o in openModeOpts" :key="o.v" :class="{on:form.open_card_mode===o.v}" @click="form.open_card_mode=o.v">{{ o.t }}</span>',
      '          </div>',
      '          <van-field v-model="form.latest_open_days" type="number" label="最迟开卡(天)"/>',
      '          <van-field v-model="form.pause_times" type="number" label="可暂停次数"/>',
      '          <van-field v-model="form.pause_max_days" type="number" label="单次最长暂停(天)"/>',
      '          <van-field v-model="form.free_train_time_range" label="入场时段" placeholder="如 06:30-22:30，留空不限" :border="false"/>',
      '        </van-collapse-item>',
      '        <van-collapse-item title="里程碑" name="milestone">',
      '          <div class="unit-seg" style="margin-bottom:8px">',
      '            <span v-for="m in milestoneOpts" :key="m.v" :class="{on:form.milestone_type===m.v}" @click="form.milestone_type=m.v">{{ m.t }}</span>',
      '          </div>',
      '          <van-field v-if="form.milestone_type>0" v-model="form.milestone_interval" type="number" :label="form.milestone_type===1?\'每N节课\':\'每N天\'" :border="false"/>',
      '          <div class="muted" v-if="form.milestone_type>0" style="margin-top:6px">每{{ form.milestone_interval||\'N\' }}{{ form.milestone_type===1?\'节课\':\'天\' }}生成一次里程碑，提醒教练总结并短信通知会员</div>',
      '        </van-collapse-item>',
      '        <van-collapse-item title="售卖控制" name="sale">',
      '          <van-field label="线上可售"><template #input><van-switch v-model="form.online_sale" :active-value="1" :inactive-value="0" size="20" active-color="var(--brand)"/></template></van-field>',
      '          <van-field label="仅学生可购"><template #input><van-switch v-model="form.student_only" :active-value="1" :inactive-value="0" size="20" active-color="var(--brand)"/></template></van-field>',
      '          <van-field v-model="form.purchase_limit" type="number" label="每人限购(张)"/>',
      '          <van-field v-if="form.id" label="上架状态" :border="false"><template #input><van-switch v-model="form.status" :active-value="1" :inactive-value="0" size="20" active-color="var(--brand)"/></template></van-field>',
      '        </van-collapse-item>',
      '      </van-collapse>',

      '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">保存</van-button></div>',
      '    </div>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      async load() {
        this.loading = true;
        try { this.list = await API.get('/card-categories'); }
        finally { this.loading = false; }
      },
      openAdd() {
        this.form = {
          card_kind: this.kind === '0' ? 1 : Number(this.kind), title: '', intro: '', price: 0, original_price: 0, expire_days: 30,
          total_counts: 10, gift_money: 0, course_permission: '', book_limit_day: 0, book_limit_week: 0, book_limit_month30: 0,
          advance_book_limit: 0, book_time_range: '', group_advance_range: '7,2', free_cancel_total: 0, free_cancel_month_overtime: 0,
          cancel_deadline_hours: 2, noshow_limit_30d: 3, open_card_mode: 1, latest_open_days: 30, pause_times: 0, pause_max_days: 0,
          free_train_time_range: '', online_sale: 0, student_only: 0, purchase_limit: 0, sort: 0, status: 1,
          milestone_type: 0, milestone_interval: 10,
        };
        this.open = [];
        this.popup = true;
      },
      openEdit(row) {
        this.form = JSON.parse(JSON.stringify(row));
        ['price', 'original_price', 'gift_money'].forEach(k => { this.form[k] = Number(this.form[k] || 0); });
        if (this.form.milestone_type == null) this.form.milestone_type = 0;
        if (!this.form.milestone_interval) this.form.milestone_interval = 10;
        this.open = [];
        this.popup = true;
      },
      async save() {
        if (!this.form.title || !String(this.form.title).trim()) return vant.showToast('请填写卡名称');
        if (!this.form.card_kind) return vant.showToast('请选择卡种');
        const body = Object.assign({}, this.form);
        CAT_NUM_FIELDS.forEach(f => { body[f] = toNum(body[f], 0); });
        this.saving = true;
        try {
          if (body.id) await API.put('/card-categories/' + body.id, body);
          else await API.post('/card-categories', body);
          vant.showToast({ message: '保存成功', icon: 'success' });
          this.popup = false;
          this.load();
        } finally { this.saving = false; }
      },
      async toggleStatus(row) {
        const v = row.status === 1 ? 0 : 1;
        await API.put('/card-categories/' + row.id, { status: v });
        vant.showToast({ message: v ? '已上架' : '已下架', icon: 'success' });
        this.load();
      },
    },
    mounted() { this.load(); },
  };

  /* ============ 动作库 ============ */
  window.Pages.StaffTrainingActions = {
    data() {
      return {
        part: '全部',
        parts: ['全部', '胸', '背', '肩', '手臂', '腿', '臀', '核心', '有氧', '拉伸'],
        keyword: '',
        list: [], loading: false,
        popup: false, form: {}, saving: false, partShow: false,
      };
    },
    computed: {
      canEdit() { return ['admin', 'manager', 'coach'].includes((Store.user || {}).role); },
      partCols() { return this.parts.slice(1).map(p => ({ text: p, value: p })); },
    },
    template: [
      '<div class="page">',
      '  <m-nav title="动作库"></m-nav>',
      '  <van-tabs v-model:active="part" color="var(--brand)" sticky @change="load">',
      '    <van-tab v-for="p in parts" :key="p" :title="p" :name="p"></van-tab>',
      '  </van-tabs>',
      '  <van-search v-model="keyword" placeholder="动作名称关键词" show-action @search="load" @clear="load">',
      '    <template #action><div @click="load" style="color:var(--brand)">搜索</div></template>',
      '  </van-search>',
      '  <div style="margin:0 12px 10px" v-if="canEdit"><van-button type="primary" plain block round icon="plus" @click="openAdd">新增自定义动作</van-button></div>',
      '  <div v-if="loading" style="text-align:center;padding:40px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!list.length" description="暂无动作"/>',
      '    <van-swipe-cell v-for="a in list" :key="a.id" :disabled="!(canEdit && a.merchant_id>0)">',
      '      <div class="rec-item" @click="canEdit && a.merchant_id>0 && openEdit(a)">',
      '        <div class="head">',
      '          <span class="name">{{ a.name }} <van-tag plain type="primary" size="small">{{ a.part }}</van-tag></span>',
      '          <van-tag :type="a.merchant_id>0?\'warning\':\'default\'" round>{{ a.merchant_id>0?\'自定义\':\'系统预置\' }}</van-tag>',
      '        </div>',
      '        <div class="muted mt4" v-if="a.equipment">器械：{{ a.equipment }}</div>',
      '        <div class="muted mt4" v-if="a.description">{{ a.description }}</div>',
      '      </div>',
      '      <template #right v-if="canEdit && a.merchant_id>0">',
      '        <div style="height:100%;width:64px;background:var(--danger);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px" @click="del(a)">删除</div>',
      '      </template>',
      '    </van-swipe-cell>',
      '  </template>',

      '  <van-popup v-model:show="popup" position="bottom" round safe-area-inset-bottom>',
      '    <div class="pop-scroll">',
      '      <div class="pop-head">{{ form.id ? (\'编辑动作 - \'+form.name) : \'新增自定义动作\' }}</div>',
      '      <van-field v-model="form.name" label="动作名称" placeholder="如：绳索面拉" required/>',
      '      <van-field :model-value="form.part" label="部位" placeholder="选择部位" readonly is-link required @click="partShow=true"/>',
      '      <van-field v-model="form.equipment" label="器械" placeholder="如：龙门架 / 哑铃 / 自重"/>',
      '      <van-field v-model="form.description" type="textarea" rows="3" autosize label="说明" placeholder="动作要点、注意事项" :border="false"/>',
      '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">保存</van-button></div>',
      '    </div>',
      '  </van-popup>',
      '  <van-popup v-model:show="partShow" position="bottom" round>',
      '    <van-picker :columns="partCols" @confirm="onPart" @cancel="partShow=false" confirm-button-text="确定"></van-picker>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      async load() {
        this.loading = true;
        try {
          const qs = [];
          if (this.part !== '全部') qs.push('part=' + encodeURIComponent(this.part));
          if (this.keyword) qs.push('keyword=' + encodeURIComponent(this.keyword));
          this.list = await API.get('/training-actions' + (qs.length ? '?' + qs.join('&') : ''));
        } finally { this.loading = false; }
      },
      openAdd() {
        this.form = { name: '', part: this.part === '全部' ? '胸' : this.part, equipment: '', description: '' };
        this.popup = true;
      },
      openEdit(row) { this.form = JSON.parse(JSON.stringify(row)); this.popup = true; },
      onPart(v) { this.form.part = v.selectedOptions[0].value; this.partShow = false; },
      async save() {
        if (!this.form.name || !String(this.form.name).trim()) return vant.showToast('请填写动作名称');
        if (!this.form.part) return vant.showToast('请选择部位');
        this.saving = true;
        try {
          if (this.form.id) await API.put('/training-actions/' + this.form.id, this.form);
          else await API.post('/training-actions', this.form);
          vant.showToast({ message: '保存成功', icon: 'success' });
          this.popup = false;
          this.load();
        } finally { this.saving = false; }
      },
      async del(row) {
        try {
          await vant.showConfirmDialog({ title: '删除动作', message: '确定删除自定义动作「' + row.name + '」？', confirmButtonColor: 'var(--danger)' });
        } catch (e) { return; }
        await API.del('/training-actions/' + row.id);
        vant.showToast({ message: '已删除', icon: 'success' });
        this.load();
      },
    },
    mounted() { this.load(); },
  };

  /* ============ 教练档案 ============ */
  window.Pages.StaffCoaches = {
    data() {
      return { list: [], loading: false, popup: false, form: {}, saving: false };
    },
    computed: {
      canEdit() { return ['admin', 'manager'].includes((Store.user || {}).role); },
    },
    template: [
      '<div class="page">',
      '  <m-nav title="教练档案"></m-nav>',
      '  <div style="margin:10px 12px" v-if="canEdit"><van-button type="primary" block round icon="plus" @click="openAdd">新增教练</van-button></div>',
      '  <div v-if="loading" style="text-align:center;padding:40px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!list.length" description="暂无教练"/>',
      '    <div v-for="c in list" :key="c.id" class="rec-item flex">',
      '      <m-avatar :name="c.realname" :size="44"></m-avatar>',
      '      <div class="flex1" style="margin-left:12px">',
      '        <div class="head">',
      '          <span class="name">{{ c.realname }} <span class="muted" style="font-weight:400" v-if="c.nickname">{{ c.nickname }}</span></span>',
      '          <van-tag :type="c.status===1?\'success\':\'default\'" round>{{ c.status===1?\'在职\':\'离职\' }}</van-tag>',
      '        </div>',
      '        <div class="muted mt4">',
      '          <span v-if="Number(c.lesson_price)>0" class="price">{{ H.money(c.lesson_price) }}/节</span>',
      '          <span v-else>课时单价未设置</span>',
      '        </div>',
      '        <div class="muted mt4" v-if="c.good_at">擅长：{{ c.good_at }}</div>',
      '        <div class="foot" v-if="canEdit"><van-button size="small" round plain @click="openEdit(c)">编辑档案</van-button></div>',
      '      </div>',
      '    </div>',
      '  </template>',

      '  <van-popup v-model:show="popup" position="bottom" round safe-area-inset-bottom>',
      '    <div class="pop-scroll">',
      '      <div class="pop-head">{{ form.id ? (\'编辑教练档案 - \'+(form.realname||\'\')) : \'新增教练\' }}</div>',
      '      <template v-if="!form.id">',
      '        <div style="font-size:13px;font-weight:600;color:var(--brand);margin:6px 0 8px">登录账号（员工端/后台登录用）</div>',
      '        <van-field v-model="form.username" label="登录账号" placeholder="如 coach04" required/>',
      '        <van-field v-model="form.password" label="初始密码" placeholder="默认 admin123"/>',
      '        <van-field v-model="form.phone" type="tel" maxlength="11" label="手机号" placeholder="选填"/>',
      '        <div style="font-size:13px;font-weight:600;color:var(--brand);margin:14px 0 8px">教练档案（会员端展示）</div>',
      '      </template>',
      '      <van-field v-model="form.realname" label="姓名" placeholder="教练姓名" required/>',
      '      <van-field v-model="form.nickname" label="昵称" placeholder="选填"/>',
      '      <van-field v-model="form.lesson_price" type="number" label="课时单价(元/节)"/>',
      '      <div class="muted" style="margin:-4px 0 10px">展示给会员端引导自助约课，价格差异是推动会员尝试新教练的抓手</div>',
      '      <van-field v-model="form.good_at" label="擅长" placeholder="如：增肌塑形 · 体态矫正"/>',
      '      <van-field v-model="form.desc" type="textarea" rows="2" autosize label="简介" placeholder="选填"/>',
      '      <van-field v-model="form.detail" type="textarea" rows="4" autosize label="详细介绍" placeholder="认证资质 / 执教经历 / 教学风格等"/>',
      '      <van-field v-model="form.sort" type="number" label="排序" :border="!!form.id"/>',
      '      <van-field v-if="form.id" label="在职状态" :border="false"><template #input><van-switch v-model="form.status" :active-value="1" :inactive-value="0" size="20" active-color="var(--brand)"/></template></van-field>',
      '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="save">{{ form.id ? \'保存\' : \'创建教练\' }}</van-button></div>',
      '    </div>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      async load() {
        this.loading = true;
        try { this.list = await API.get('/coaches'); }
        finally { this.loading = false; }
      },
      openAdd() {
        this.form = { username: '', password: '', phone: '', realname: '', nickname: '', good_at: '', desc: '', detail: '', lesson_price: 0, sort: this.list.length + 1, status: 1 };
        this.popup = true;
      },
      openEdit(row) {
        this.form = JSON.parse(JSON.stringify(row));
        this.form.lesson_price = Number(this.form.lesson_price || 0);
        this.popup = true;
      },
      async save() {
        if (!this.form.realname || !String(this.form.realname).trim()) return vant.showToast('请填写教练姓名');
        if (!this.form.id && (!this.form.username || !String(this.form.username).trim())) return vant.showToast('请填写登录账号');
        const body = Object.assign({}, this.form, {
          lesson_price: toNum(this.form.lesson_price, 0),
          sort: toNum(this.form.sort, 0),
        });
        this.saving = true;
        try {
          if (body.id) {
            await API.put('/coaches/' + body.id, body);
            vant.showToast({ message: '保存成功', icon: 'success' });
          } else {
            await API.post('/coaches', body);
            await vant.showDialog({
              title: '创建成功',
              message: '教练「' + body.realname + '」已创建。\n登录账号：' + body.username + '\n初始密码：' + (body.password || 'admin123') + '\n可用于登录员工端(H5)与管理后台。',
              confirmButtonText: '知道了', confirmButtonColor: 'var(--brand)',
            });
          }
          this.popup = false;
          this.load();
        } finally { this.saving = false; }
      },
    },
    mounted() { this.load(); },
  };

  /* ============ 来源渠道 ============ */
  window.Pages.StaffSources = {
    data() {
      return {
        list: [], loading: false,
        form: { title: '', sort: 0 }, adding: false,
        popup: false, editForm: {}, saving: false,
      };
    },
    computed: {
      canEdit() { return ['admin', 'manager'].includes((Store.user || {}).role); },
    },
    template: [
      '<div class="page">',
      '  <m-nav title="来源渠道"></m-nav>',
      '  <div class="card-box" v-if="canEdit" style="padding:12px 14px 4px">',
      '    <van-field v-model="form.title" label="渠道名称" placeholder="如：抖音团购"/>',
      '    <van-field v-model="form.sort" type="number" label="排序" :border="false"/>',
      '    <div style="margin:8px 0 4px"><van-button type="primary" block round :loading="adding" @click="add">新增渠道</van-button></div>',
      '  </div>',
      '  <div class="sec-title">渠道列表（{{ list.length }}）</div>',
      '  <div v-if="loading" style="text-align:center;padding:40px 0"><van-loading color="var(--brand)">加载中...</van-loading></div>',
      '  <template v-else>',
      '    <van-empty v-if="!list.length" description="暂无来源渠道"/>',
      '    <van-swipe-cell v-for="s in list" :key="s.id" :disabled="!canEdit">',
      '      <div class="rec-item flex" @click="canEdit && openEdit(s)">',
      '        <div class="flex1">',
      '          <span class="name">{{ s.title }}</span>',
      '          <div class="muted mt4">排序 {{ s.sort }} · #{{ s.id }}</div>',
      '        </div>',
      '        <van-icon v-if="canEdit" name="edit" color="var(--c-text-4)"/>',
      '      </div>',
      '      <template #right v-if="canEdit">',
      '        <div style="height:100%;width:64px;background:var(--danger);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px" @click="del(s)">删除</div>',
      '      </template>',
      '    </van-swipe-cell>',
      '  </template>',

      '  <van-popup v-model:show="popup" position="bottom" round safe-area-inset-bottom>',
      '    <div class="pop-scroll">',
      '      <div class="pop-head">编辑渠道</div>',
      '      <van-field v-model="editForm.title" label="渠道名称" required/>',
      '      <van-field v-model="editForm.sort" type="number" label="排序" :border="false"/>',
      '      <div class="mt12"><van-button type="primary" block round :loading="saving" @click="saveEdit">保存</van-button></div>',
      '    </div>',
      '  </van-popup>',
      '</div>',
    ].join('\n'),
    methods: {
      async load() {
        this.loading = true;
        try { this.list = await API.get('/sources'); }
        finally { this.loading = false; }
      },
      async add() {
        if (!this.form.title || !String(this.form.title).trim()) return vant.showToast('请填写渠道名称');
        this.adding = true;
        try {
          await API.post('/sources', { title: this.form.title, sort: toNum(this.form.sort, 0) });
          vant.showToast({ message: '已新增', icon: 'success' });
          this.form = { title: '', sort: 0 };
          this.load();
        } finally { this.adding = false; }
      },
      openEdit(row) { this.editForm = { id: row.id, title: row.title, sort: row.sort }; this.popup = true; },
      async saveEdit() {
        if (!this.editForm.title || !String(this.editForm.title).trim()) return vant.showToast('请填写渠道名称');
        this.saving = true;
        try {
          await API.put('/sources/' + this.editForm.id, { title: this.editForm.title, sort: toNum(this.editForm.sort, 0) });
          vant.showToast({ message: '已保存', icon: 'success' });
          this.popup = false;
          this.load();
        } finally { this.saving = false; }
      },
      async del(row) {
        try {
          await vant.showConfirmDialog({ title: '删除渠道', message: '确定删除渠道「' + row.title + '」？', confirmButtonColor: 'var(--danger)' });
        } catch (e) { return; }
        await API.del('/sources/' + row.id);
        vant.showToast({ message: '已删除', icon: 'success' });
        this.load();
      },
    },
    mounted() { this.load(); },
  };
})();

/* ============================================================
 * 本文件定义的页面 / 建议路由 (需由 m/js/app.js 统一接入路由表):
 *   window.Pages.StaffCardCategories -> /staff/card-categories   卡类型配置(列表+按卡种筛选+新增/编辑+上下架切换；后端无删除接口)
 *   window.Pages.StaffTrainingActions -> /staff/training-actions 动作库(按部位筛选+关键词搜索+新增自定义动作/编辑/删除，系统预置动作只读)
 *   window.Pages.StaffCoaches        -> /staff/coaches            教练档案(列表+新增教练(同时开通登录账号)+编辑档案；后端无删除接口)
 *   window.Pages.StaffSources        -> /staff/sources            来源渠道(列表+新增+编辑名称与排序+删除)
 * ============================================================ */
