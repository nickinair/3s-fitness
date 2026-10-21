/* 员工端-会员查询 / 会员详情(维护) / 录潜客 */
window.Pages.StaffMembers = {
  data() {
    return {
      kw: '',
      list: [],
      stats: null,
      total: 0,
      loading: false,
      listLoading: false,
      finished: false,
      searched: false,
      quick: '',
      page: 1,
      pageSize: 20,
    };
  },
  computed: {
    quickCells() {
      const s = this.stats || {};
      return [
        { k: 'active', l: '在籍', v: s.active_count || 0 },
        { k: 'today_expire', l: '今日到期', v: s.today_expire || 0 },
        { k: 'expired', l: '已过期', v: s.expired_count || 0 },
        { k: 'month_new', l: '本月新增', v: s.month_new || 0 },
      ];
    },
    quickLabel() { const c = this.quickCells.find(x => x.k === this.quick); return c ? c.l : ''; },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="会员查询"></m-nav>',
    '  <van-search v-model="kw" placeholder="姓名 / 昵称 / 手机号" show-action @search="reload" @clear="reload">',
    '    <template #action><div @click="reload" style="color:#0d5e56">搜索</div></template>',
    '  </van-search>',
    // 四个统计可点, 点中即按该口径筛选列表; 再点一次取消
    '  <div class="stat-row tapable" v-if="stats" style="margin-top:12px">',
    '    <div v-for="c in quickCells" :key="c.k" class="stat-cell tap" :class="{on:quick===c.k}" @click="pickQuick(c.k)">',
    '      <div class="v">{{ c.v }}</div><div class="l">{{ c.l }}</div>',
    '    </div>',
    '  </div>',
    '  <div class="qk-bar" style="margin:8px 12px 4px">',
    '    <template v-if="quick">',
    '      <van-tag type="primary" round size="medium">{{ quickLabel }}</van-tag>',
    '      <span class="muted" style="margin-left:8px">共 {{ total }} 人</span>',
    '      <span class="flex1"></span>',
    '      <span class="brand-text" style="font-size:13px" @click="pickQuick(quick)">清除筛选</span>',
    '    </template>',
    '    <template v-else-if="total">',
    '      <span class="muted">共 {{ total }} 位会员</span>',
    '    </template>',
    '  </div>',
    '  <div v-if="loading && !list.length" style="text-align:center;padding:40px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <van-list v-model:loading="listLoading" :finished="finished" :finished-text="list.length ? \'没有更多会员了\' : \'\'" :offset="100" @load="loadMore">',
    '    <van-empty v-if="searched && !loading && !list.length" description="没有符合条件的会员"/>',
    '    <div v-for="m in list" :key="m.id" class="rec-item flex" :class="{black:m.is_black}" @click="$router.push(\'/staff/member/\'+m.id)">',
    '      <m-avatar :name="m.realname||m.nickname" :size="44" :style="m.is_black?{background:\'#ee0a24\'}:{}"></m-avatar>',
    '      <div class="flex1" style="margin-left:12px">',
    '        <div class="name">{{ m.realname || m.nickname || \'未命名\' }}',
    '          <van-tag v-if="m.is_black" type="danger" style="margin-left:4px">黑名单</van-tag>',
    '          <d-tag v-else dict="expireStatus" :v="m.expire_status" style="margin-left:4px"></d-tag>',
    '        </div>',
    '        <div class="muted mt4">{{ m.phone }} <template v-if="m.membership_name">· 业绩归属 {{ m.membership_name }}</template></div>',
    '        <div class="muted mt4" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ m.card_names || \'无持卡\' }}</div>',
    '      </div>',
    '      <van-icon name="arrow" color="#c8c9cc"/>',
    '    </div>',
    '  </van-list>',
    '</div>',
  ].join('\n'),
  methods: {
    // 再点同一个 = 取消筛选
    pickQuick(k) { this.quick = this.quick === k ? '' : k; this.reload(); },
    reload() {
      this.page = 1;
      this.finished = false;
      this.list = [];
      this.fetchPage();
    },
    async fetchPage() {
      if (this.page === 1) this.loading = true;
      try {
        const q = '/members?keyword=' + encodeURIComponent(this.kw.trim())
          + '&page=' + this.page
          + '&size=' + this.pageSize
          + (this.quick ? '&quick=' + this.quick : '');
        const d = await API.get(q);
        const rows = d.list || [];
        this.stats = d.stats;
        this.total = d.total || 0;
        this.searched = true;
        this.list = this.page === 1 ? rows : this.list.concat(rows);
        if (this.list.length >= this.total || rows.length < this.pageSize) {
          this.finished = true;
        } else {
          this.page++;
        }
      } catch (e) {
        this.finished = true;
      } finally {
        this.loading = false;
        this.listLoading = false;
      }
    },
    loadMore() {
      if (this.finished || this.loading) return;
      this.fetchPage();
    },
  },
  mounted() { this.reload(); },
};

window.Pages.StaffMemberDetail = {
  data() {
    return {
      d: null, loading: true, tab: 0,
      mShow: false, mType: 1, mContent: '', mSaving: false,
      bodyRecords: [], bShow: false, bSaving: false,
      bForm: { record_date: H.today(), height: '', weight: '', body_fat: '', muscle: '', waist: '', remark: '' },
      eShow: false, eSaving: false,
      eForm: { realname: '', gender: 0, birthday: '', initial_weight: '', target_weight: '', constellation_mbti: '', training_frequency: '', studio_feedback: '', target_compare_photos: [] },
      linkShow: false, linkData: { url: '', token: '', vipName: '' },
      trainingPhotos: [],
      photoShow: false, photoSaving: false, photoUploading: false,
      photoForm: { photo_url: '', photo_date: H.today(), remark: '' },
    };
  },
  computed: {
    p() { return this.d && this.d.profile; },
    parsedPhotos() {
      const p = this.p && this.p.target_compare_photos;
      if (!p) return [];
      if (Array.isArray(p)) return p;
      try { return JSON.parse(p); } catch { return []; }
    },
  },
  template: [
    '<div class="page">',
    '  <m-nav title="会员详情"></m-nav>',
    '  <div v-if="loading" style="text-align:center;padding:60px 0"><van-loading color="#0d5e56">加载中...</van-loading></div>',
    '  <template v-else-if="d">',
    '    <div class="black-warn" v-if="p.is_black"><van-icon name="warning"/> 黑名单会员{{ p.black_reason ? \'：\'+p.black_reason : \'\' }}</div>',
    '    <div class="card-box">',
    '      <div class="flex">',
    '        <m-avatar :name="p.realname||p.nickname" :size="50"></m-avatar>',
    '        <div class="flex1" style="margin-left:12px">',
    '          <div style="font-size:17px;font-weight:700">{{ p.realname || p.nickname }} <span class="muted" style="font-weight:400">{{ DICT.gender[p.gender] }}</span></div>',
    '          <div class="muted mt4">{{ p.phone }}</div>',
    '        </div>',
    '        <div style="text-align:right">',
    '          <d-tag dict="expireStatus" :v="p.expire_status"></d-tag>',
    '          <div style="margin-top:6px;display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap">',
    '            <van-button size="mini" plain round type="warning" @click="openProfileLink">完善链接</van-button>',
    '            <van-button size="mini" plain round type="primary" @click="openEditProfile">编辑资料</van-button>',
    '            <van-button size="mini" plain round icon="photograph" style="color:#0d5e56;border-color:#0d5e56" @click="openAddPhoto">+ 风采</van-button>',
    '          </div>',
    '        </div>',
    '      </div>',
    '      <van-divider style="margin:10px 0"/>',
    '      <div class="muted" style="line-height:2">',
    '        来源：{{ p.source_name || \'-\' }} · 意向：{{ DICT.labelLv[p.label_levels] }}<br/>',
    '        业绩归属：{{ p.membership_name || \'-\' }} · 主教练：{{ p.coach_name || \'-\' }}<template v-if="p.sub_coach_name"> · 副教练：{{ p.sub_coach_name }}</template><br/>',
    '        <template v-if="p.birthday">生日：{{ H.dateOf(p.birthday) }} · </template><template v-if="p.constellation_mbti">星座/MBTI：{{ p.constellation_mbti }}<br/></template>',
    '        <template v-if="p.initial_weight != null || p.target_weight != null">初始体重：{{ p.initial_weight != null ? (p.initial_weight+\'kg\') : \'-\' }} · 目标体重：{{ p.target_weight != null ? (p.target_weight+\'kg\') : \'-\' }}<br/></template>',
    '        <template v-if="p.training_frequency">期望频次：{{ p.training_frequency }}<br/></template>',
    '        <template v-if="p.studio_feedback">会馆反馈：{{ p.studio_feedback }}<br/></template>',
    '        <template v-if="parsedPhotos.length">',
    '          <div style="margin-top:4px">',
    '            <span style="font-size:12px">目标对比图：</span>',
    '            <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">',
    '              <van-image v-for="(img, idx) in parsedPhotos" :key="idx" :src="img" width="50" height="50" radius="4" fit="cover" @click="previewImg(idx)" />',
    '            </div>',
    '          </div>',
    '        </template>',
    '        <template v-if="p.expire_time">最近到期：{{ H.dateOf(p.expire_time) }}<br/></template>',
    '        <template v-if="p.remark">备注:{{ p.remark }}<br/></template>',
    '        注册时间：{{ H.full(p.insert_time) }}',
    '      </div>',
    '    </div>',
    '    <div class="sec-title">持卡（{{ (d.cards||[]).length }}）</div>',
    '    <van-empty v-if="!(d.cards||[]).length" description="无持卡" image-size="60"/>',
    '    <div class="card-box" v-else style="padding:2px 8px">',
    '      <van-cell v-for="c in d.cards" :key="c.id" :title="c.card_type_name" :label="H.cardLeft(c)+\' · \'+H.cardExp(c)" is-link @click="$router.push(\'/staff/card/\'+c.id)">',
    '        <template #value><d-tag dict="cardStatus" :v="c.status"></d-tag></template>',
    '      </van-cell>',
    '    </div>',
    '    <div class="sec-title">最近流水</div>',
    '    <div class="card-box" style="padding:6px 4px 10px">',
    '      <van-tabs v-model:active="tab" color="#0d5e56">',
    '        <van-tab :title="\'收款(\'+(d.recharges||[]).length+\')\'">',
    '          <van-empty v-if="!(d.recharges||[]).length" description="暂无收款" image-size="60"/>',
    '          <van-cell v-for="r in (d.recharges||[]).slice(0,10)" :key="r.id" :title="(DICT.rechargeType[r.type]||\'\')+\' · \'+r.card_type_name" :label="H.full(r.insert_time)">',
    '            <template #value><span class="price">{{ H.money(r.actual_money) }}</span></template>',
    '          </van-cell>',
    '        </van-tab>',
    '        <van-tab :title="\'耗卡(\'+(d.spends||[]).length+\')\'">',
    '          <van-empty v-if="!(d.spends||[]).length" description="暂无耗卡" image-size="60"/>',
    '          <van-cell v-for="s in (d.spends||[]).slice(0,10)" :key="s.id" :title="DICT.spendScene[s.scene]+\' · \'+s.card_type_name" :label="H.full(s.insert_time)">',
    '            <template #value>{{ H.money(s.spend_money) }}</template>',
    '          </van-cell>',
    '        </van-tab>',
    '        <van-tab :title="\'签到(\'+(d.checkins||[]).length+\')\'">',
    '          <van-empty v-if="!(d.checkins||[]).length" description="暂无签到" image-size="60"/>',
    '          <van-cell v-for="c in (d.checkins||[]).slice(0,10)" :key="c.id" :title="H.dt(c.check_in_time)" :label="c.card_type_name" />',
    '        </van-tab>',
    '      </van-tabs>',
    '    </div>',
    '    <div class="sec-title">维护记录（{{ (d.maintains||[]).length }}）<span class="more brand-text" @click="mShow=true"><van-icon name="add-o"/> 新增维护</span></div>',
    '    <van-empty v-if="!(d.maintains||[]).length" description="暂无维护记录" image-size="60"/>',
    '    <div v-else class="card-box" style="padding:2px 8px">',
    '      <van-cell v-for="m in (d.maintains||[]).slice(0,10)" :key="m.id" :label="(m.membership_name||\'\')+\' · \'+H.full(m.insert_time)">',
    '        <template #title><van-tag plain type="primary">{{ DICT.maintainType[m.record_type]||\'其他\' }}</van-tag> <span style="font-size:14px">{{ m.content }}</span></template>',
    '      </van-cell>',
    '    </div>',

    '    <div class="sec-title">体测数据（{{ bodyRecords.length }}）<span class="more brand-text" @click="openBody"><van-icon name="add-o"/> 录入</span></div>',
    '    <van-empty v-if="!bodyRecords.length" description="暂无体测记录" image-size="60"/>',
    '    <div v-else class="card-box" style="padding:2px 8px">',
    '      <van-cell v-for="b in bodyRecords" :key="b.id" :title="H.dateOf(b.record_date)" :label="(b.remark||\'\')+(b.coach_name?(b.remark?\' · \':\'\')+b.coach_name+\' 录入\':\'\')">',
    '        <template #value><span style="font-size:13px">体重 <b>{{ b.weight!=null?H.num(b.weight):\'-\' }}</b>kg · 体脂 <b>{{ b.body_fat!=null?H.num(b.body_fat):\'-\' }}</b>%</span></template>',
    '      </van-cell>',
    '    </div>',
    '    <div class="sec-title">训练风采（{{ trainingPhotos.length }}）<span class="more brand-text" @click="openAddPhoto"><van-icon name="photograph"/> 添加风采</span></div>',
    '    <van-empty v-if="!trainingPhotos.length" description="暂无训练风采照片" image-size="60">',
    '      <template #bottom>',
    '        <van-button size="small" round type="primary" icon="photograph" @click="openAddPhoto" style="margin-top:8px">上传训练风采照片</van-button>',
    '      </template>',
    '    </van-empty>',
    '    <div v-else class="card-box" style="padding:12px">',
    '      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;-webkit-overflow-scrolling:touch">',
    '        <div @click="openAddPhoto" style="flex-shrink:0;width:84px;height:84px;border:1.5px dashed #0d5e56;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f0f9f8;color:#0d5e56;cursor:pointer">',
    '          <van-icon name="plus" size="20"/>',
    '          <span style="font-size:11px;font-weight:600;margin-top:3px">添加风采</span>',
    '        </div>',
    '        <div v-for="(p, idx) in trainingPhotos" :key="p.id" style="flex-shrink:0;width:84px;position:relative" @click="previewTrainingPhoto(idx)">',
    '          <van-image :src="p.photo_url" width="84" height="84" radius="8" fit="cover" style="box-shadow:0 1px 4px rgba(0,0,0,0.08)"/>',
    '          <div @click.stop="delTrainingPhoto(p)" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.55);color:#fff;border-radius:50%;width:18px;height:18px;line-height:17px;text-align:center;font-size:12px;cursor:pointer">×</div>',
    '          <div class="muted" style="font-size:11px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center">{{ p.remark || H.dateOf(p.photo_date) }}</div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </template>',
    '  <van-popup v-model:show="bShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:12px">录入体测数据</div>',
    '      <van-field label="日期">',
    '        <template #input><input type="date" v-model="bForm.record_date" style="border:none;outline:none;background:transparent;font-size:14px;color:#323233"/></template>',
    '      </van-field>',
    '      <van-field v-model="bForm.height" type="number" label="身高(cm)" placeholder="如 165"/>',
    '      <van-field v-model="bForm.weight" type="number" label="体重(kg)" placeholder="如 52.5"/>',
    '      <van-field v-model="bForm.body_fat" type="number" label="体脂率(%)" placeholder="如 24.1"/>',
    '      <van-field v-model="bForm.muscle" type="number" label="肌肉量(kg)" placeholder="选填"/>',
    '      <van-field v-model="bForm.waist" type="number" label="腰围(cm)" placeholder="选填"/>',
    '      <van-field v-model="bForm.remark" label="备注" placeholder="选填" :border="false"/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="bSaving" @click="saveBody">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '  <van-popup v-model:show="mShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px">',
    '      <div style="font-size:16px;font-weight:600;margin-bottom:12px">新增维护记录</div>',
    '      <van-field label="方式">',
    '        <template #input>',
    '          <van-radio-group v-model="mType" direction="horizontal">',
    '            <van-radio :name="1">电话</van-radio><van-radio :name="2">到店</van-radio><van-radio :name="3">微信</van-radio><van-radio :name="4">其他</van-radio>',
    '          </van-radio-group>',
    '        </template>',
    '      </van-field>',
    '      <van-field v-model="mContent" type="textarea" rows="3" label="内容" placeholder="沟通内容 / 跟进要点" maxlength="200" show-word-limit/>',
    '      <div class="mt12"><van-button type="primary" block round :loading="mSaving" @click="saveMaintain">保存</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '  <van-popup v-model:show="eShow" position="bottom" round safe-area-inset-bottom style="max-height:85vh">',
    '    <div style="padding:18px 16px 24px;overflow-y:auto;max-height:80vh">',
    '      <div style="font-size:16px;font-weight:700;margin-bottom:14px;color:#1a1a1a">编辑会员资料</div>',
    '      <van-field v-model="eForm.realname" label="姓名" placeholder="真实姓名"/>',
    '      <van-field label="性别">',
    '        <template #input>',
    '          <van-radio-group v-model="eForm.gender" direction="horizontal">',
    '            <van-radio :name="1">男</van-radio><van-radio :name="2">女</van-radio><van-radio :name="0">未知</van-radio>',
    '          </van-radio-group>',
    '        </template>',
    '      </van-field>',
    '      <van-field label="生日">',
    '        <template #input><input type="date" v-model="eForm.birthday" style="border:none;outline:none;background:transparent;font-size:14px;color:#323233"/></template>',
    '      </van-field>',
    '      <van-field v-model="eForm.initial_weight" type="number" label="初始体重(kg)" placeholder="如 70.5"/>',
    '      <van-field v-model="eForm.target_weight" type="number" label="目标体重(kg)" placeholder="如 62.0"/>',
    '      <van-field v-model="eForm.constellation_mbti" label="星座/MBTI" placeholder="如 天蝎座 / INTJ"/>',
    '      <van-field v-model="eForm.training_frequency" label="训练频次" placeholder="如 每周3-4次"/>',
    '      <van-field v-model="eForm.studio_feedback" type="textarea" rows="2" label="会馆反馈" placeholder="对场馆/课程/教练的建议与反馈"/>',
    '      <div style="padding:10px 16px 4px">',
    '        <div style="font-size:14px;color:#646566;margin-bottom:8px">目标对比图</div>',
    '        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">',
    '          <div v-for="(img, idx) in eForm.target_compare_photos" :key="idx" style="position:relative;width:56px;height:56px;border-radius:6px;overflow:hidden;border:1px solid #ebedf0">',
    '            <van-image :src="img" width="56" height="56" fit="cover"/>',
    '            <div @click="removeEditPhoto(idx)" style="position:absolute;top:0;right:0;background:rgba(0,0,0,0.6);color:#fff;width:18px;height:18px;line-height:18px;text-align:center;font-size:12px">×</div>',
    '          </div>',
    '          <van-uploader :after-read="afterReadPhoto" accept="image/*" max-count="9">',
    '            <div style="width:56px;height:56px;border:1px dashed #dcdee0;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#969799">',
    '              <van-icon name="plus" size="18"/><span style="font-size:10px;margin-top:2px">上传</span>',
    '            </div>',
    '          </van-uploader>',
    '        </div>',
    '      </div>',
    '      <div class="mt12"><van-button type="primary" block round :loading="eSaving" @click="saveProfile">保存资料</van-button></div>',
    '    </div>',
    '  </van-popup>',
    '  <van-popup v-model:show="linkShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 24px;text-align:center">',
    '      <div style="font-size:16px;font-weight:700;margin-bottom:4px">专属资料完善链接 (免登录)</div>',
    '      <div class="muted" style="font-size:12px;margin-bottom:14px">学员：{{ linkData.vipName }} · 打开即送最高 70 积分</div>',
    '      <div id="staff-member-profile-qr" style="display:inline-block;padding:10px;background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.08);margin-bottom:14px;min-width:160px;min-height:160px"></div>',
    '      <div style="margin-bottom:12px;background:#f3f4f6;border-radius:8px;padding:8px 10px;font-size:11px;color:#4b5563;word-break:break-all;text-align:left">',
    '        {{ linkData.url }}',
    '      </div>',
    '      <div style="display:flex;gap:10px">',
    '        <van-button plain round block @click="linkShow=false" style="flex:1">关闭</van-button>',
    '        <van-button type="primary" round block @click="copyLink" style="flex:2;background:#0d5e56;border-color:#0d5e56">复制链接</van-button>',
    '      </div>',
    '      <div class="muted" style="font-size:11px;margin-top:12px;line-height:1.5">',
    '        可将链接复制后直接在微信中发送给学员，学员无需输入密码即可直接进入完善档案。',
    '      </div>',
    '    </div>',
    '  </van-popup>',
    '  <!-- 上传训练风采弹层 -->',
    '  <van-popup v-model:show="photoShow" position="bottom" round safe-area-inset-bottom>',
    '    <div style="padding:20px 16px 28px">',
    '      <div style="font-size:16px;font-weight:700;margin-bottom:4px;color:#1f2937">添加训练风采照片</div>',
    '      <div class="muted" style="font-size:12px;margin-bottom:14px">学员：{{ p ? (p.realname || p.nickname) : \'\' }} · 照片将同步展示于学员端「训练风采」相册</div>',
    '      <van-field label="拍摄日期">',
    '        <template #input><input type="date" v-model="photoForm.photo_date" style="border:none;outline:none;background:transparent;font-size:14px;color:#323233"/></template>',
    '      </van-field>',
    '      <div style="padding:12px 16px 4px">',
    '        <div style="font-size:14px;color:#646566;margin-bottom:8px">照片 <span style="color:#ee0a24">*</span></div>',
    '        <div v-if="photoForm.photo_url" style="position:relative;display:inline-block;width:100px;height:100px;border-radius:8px;overflow:hidden;border:1px solid #ebedf0">',
    '          <van-image :src="photoForm.photo_url" width="100" height="100" fit="cover"/>',
    '          <div @click="photoForm.photo_url=\'\'" style="position:absolute;top:0;right:0;background:rgba(0,0,0,0.6);color:#fff;width:22px;height:22px;line-height:20px;text-align:center;font-size:14px;cursor:pointer">×</div>',
    '        </div>',
    '        <van-uploader v-else :after-read="afterReadTrainingPhoto" accept="image/*" :max-size="5 * 1024 * 1024" @oversize="vant.showToast(\'图片不能超过5MB\')">',
    '          <div style="width:100px;height:100px;border:1.5px dashed #0d5e56;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#0d5e56;background:#f0f9f8">',
    '            <van-icon name="photograph" size="28"/>',
    '            <span style="font-size:11px;font-weight:600;margin-top:4px">{{ photoUploading ? \'上传中...\' : \'选择照片\' }}</span>',
    '          </div>',
    '        </van-uploader>',
    '      </div>',
    '      <van-field v-model="photoForm.remark" label="心得/备注" placeholder="如：深蹲姿势进步显著 / 训练打卡记录" maxlength="50" show-word-limit/>',
    '      <div class="mt16" style="display:flex;gap:10px">',
    '        <van-button plain round block @click="photoShow=false" style="flex:1">取消</van-button>',
    '        <van-button type="primary" round block :loading="photoSaving" @click="saveTrainingPhoto" style="flex:2">保存风采</van-button>',
    '      </div>',
    '    </div>',
    '  </van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await API.get('/members/' + this.$route.params.id); }
      finally { this.loading = false; }
      this.loadBody();
      this.loadTrainingPhotos();
    },
    async loadBody() {
      try { this.bodyRecords = (await API.get('/body-records?vip_id=' + this.$route.params.id, { silent: true })) || []; }
      catch (e) { /* ignore */ }
    },
    openBody() {
      this.bForm = { record_date: H.today(), height: '', weight: '', body_fat: '', muscle: '', waist: '', remark: '' };
      this.bShow = true;
    },
    async saveBody() {
      if (!this.bForm.record_date) return vant.showToast('请选择日期');
      if (!this.bForm.weight && !this.bForm.body_fat) return vant.showToast('请至少填写体重或体脂率');
      this.bSaving = true;
      try {
        await API.post('/body-records', {
          vip_id: Number(this.$route.params.id),
          record_date: this.bForm.record_date,
          height: this.bForm.height === '' ? null : Number(this.bForm.height),
          weight: this.bForm.weight === '' ? null : Number(this.bForm.weight),
          body_fat: this.bForm.body_fat === '' ? null : Number(this.bForm.body_fat),
          muscle: this.bForm.muscle === '' ? null : Number(this.bForm.muscle),
          waist: this.bForm.waist === '' ? null : Number(this.bForm.waist),
          remark: this.bForm.remark,
        });
        this.bShow = false;
        vant.showToast({ message: '已录入', icon: 'success' });
        this.loadBody();
      } finally { this.bSaving = false; }
    },
    async saveMaintain() {
      if (!this.mContent.trim()) return vant.showToast('请填写维护内容');
      this.mSaving = true;
      try {
        await API.post('/maintain-records', { vip_user_id: this.p.id, vip_user_type: 1, record_type: this.mType, content: this.mContent.trim() });
        this.mShow = false; this.mContent = '';
        vant.showToast({ message: '已保存', icon: 'success' });
        this.load();
      } finally { this.mSaving = false; }
    },
    previewImg(idx) {
      vant.showImagePreview({ images: this.parsedPhotos, startPosition: idx });
    },
    openEditProfile() {
      const p = this.p || {};
      let photos = [];
      if (Array.isArray(p.target_compare_photos)) photos = [...p.target_compare_photos];
      else if (typeof p.target_compare_photos === 'string') {
        try { photos = JSON.parse(p.target_compare_photos); } catch { photos = []; }
      }
      this.eForm = {
        realname: p.realname || '',
        gender: p.gender || 0,
        birthday: p.birthday ? H.dateOf(p.birthday) : '',
        initial_weight: p.initial_weight != null ? p.initial_weight : '',
        target_weight: p.target_weight != null ? p.target_weight : '',
        constellation_mbti: p.constellation_mbti || '',
        training_frequency: p.training_frequency || '',
        studio_feedback: p.studio_feedback || '',
        target_compare_photos: photos,
      };
      this.eShow = true;
    },
    async afterReadPhoto(file) {
      try {
        const url = await API.upload(file.file);
        this.eForm.target_compare_photos.push(url);
        vant.showToast({ message: '已上传', icon: 'success' });
      } catch (e) {
        vant.showToast(e.message || '上传失败');
      }
    },
    removeEditPhoto(idx) {
      this.eForm.target_compare_photos.splice(idx, 1);
    },
    async saveProfile() {
      if (!this.eForm.realname.trim()) return vant.showToast('请填写姓名');
      this.eSaving = true;
      try {
        const body = {
          ...this.p,
          realname: this.eForm.realname.trim(),
          gender: this.eForm.gender,
          birthday: this.eForm.birthday || null,
          initial_weight: this.eForm.initial_weight === '' ? null : Number(this.eForm.initial_weight),
          target_weight: this.eForm.target_weight === '' ? null : Number(this.eForm.target_weight),
          constellation_mbti: this.eForm.constellation_mbti.trim() || null,
          training_frequency: this.eForm.training_frequency.trim() || null,
          studio_feedback: this.eForm.studio_feedback.trim() || null,
          target_compare_photos: this.eForm.target_compare_photos,
        };
        await API.put('/members/' + this.p.id, body);
        vant.showToast({ message: '资料已更新', icon: 'success' });
        this.eShow = false;
        this.load();
      } finally { this.eSaving = false; }
    },
    async openProfileLink() {
      try {
        const res = await API.get('/members/' + this.$route.params.id + '/profile-link');
        if (!res) return;
        const fullUrl = window.location.origin + '/m/' + (res.link || res.path);
        this.linkData = {
          url: fullUrl,
          token: res.token,
          vipName: res.vip_name || this.p.realname || '',
        };
        this.linkShow = true;
        this.$nextTick(() => {
          const el = document.getElementById('staff-member-profile-qr');
          if (el) {
            el.innerHTML = '';
            if (window.QRCode) {
              new QRCode(el, { text: fullUrl, width: 160, height: 160, colorDark: '#0d5e56', colorLight: '#ffffff' });
            }
          }
        });
      } catch (e) {
        vant.showToast(e.message || '获取专属链接失败');
      }
    },
    async copyLink() {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(this.linkData.url);
        } else {
          const ta = document.createElement('textarea');
          ta.value = this.linkData.url;
          ta.style.position = 'fixed';
          ta.style.top = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        vant.showToast({ message: '链接已复制到剪贴板', icon: 'success' });
      } catch (e) {
        vant.showToast('复制失败，请长按文本复制');
      }
    },
    async loadTrainingPhotos() {
      try {
        this.trainingPhotos = (await API.get('/members/' + this.$route.params.id + '/training-photos', { silent: true })) || [];
      } catch (e) {
        this.trainingPhotos = [];
      }
    },
    previewTrainingPhoto(idx) {
      vant.showImagePreview({ images: this.trainingPhotos.map(p => p.photo_url), startPosition: idx, closeable: true });
    },
    openAddPhoto() {
      this.photoForm = { photo_url: '', photo_date: H.today(), remark: '' };
      this.photoUploading = false;
      this.photoShow = true;
    },
    async afterReadTrainingPhoto(file) {
      this.photoUploading = true;
      try {
        const url = await API.upload(file.file);
        this.photoForm.photo_url = url;
        vant.showToast({ message: '照片已上传', icon: 'success' });
      } catch (e) {
        vant.showToast(e.message || '照片上传失败');
      } finally {
        this.photoUploading = false;
      }
    },
    async saveTrainingPhoto() {
      if (!this.photoForm.photo_url) return vant.showToast('请先选择照片上传');
      this.photoSaving = true;
      try {
        await API.post('/members/' + this.$route.params.id + '/training-photos', {
          photo_url: this.photoForm.photo_url,
          photo_date: this.photoForm.photo_date || H.today(),
          remark: this.photoForm.remark ? this.photoForm.remark.trim() : null,
        });
        vant.showToast({ message: '训练风采已添加', icon: 'success' });
        this.photoShow = false;
        this.loadTrainingPhotos();
      } catch (e) {
        vant.showToast(e.message || '保存失败');
      } finally {
        this.photoSaving = false;
      }
    },
    delTrainingPhoto(p) {
      vant.showConfirmDialog({
        title: '删除训练风采',
        message: '确定要删除这张训练风采照片吗？',
      }).then(async () => {
        try {
          await API.del('/members/' + this.$route.params.id + '/training-photos/' + p.id);
          vant.showToast({ message: '已删除', icon: 'success' });
          this.loadTrainingPhotos();
        } catch (e) {
          vant.showToast(e.message || '删除失败');
        }
      }).catch(() => {});
    },
  },
  mounted() { this.load(); },
};

window.Pages.StaffPotential = {
  data() {
    return {
      form: { realname: '', phone: '', gender: 1, source_id: 0, source_name: '', label_levels: 1, remark: '' },
      sources: [], srcShow: false, saving: false,
    };
  },
  computed: { srcCols() { return this.sources.map(s => ({ text: s.title, value: s.id })); } },
  template: [
    '<div class="page">',
    '  <m-nav title="录入潜客"></m-nav>',
    '  <div class="card-box" style="padding:6px 0">',
    '    <van-field v-model="form.realname" label="姓名" placeholder="潜客姓名" />',
    '    <van-field v-model="form.phone" type="tel" maxlength="11" label="手机号" placeholder="11位手机号" />',
    '    <van-field label="性别">',
    '      <template #input><van-radio-group v-model="form.gender" direction="horizontal"><van-radio :name="1">男</van-radio><van-radio :name="2">女</van-radio></van-radio-group></template>',
    '    </van-field>',
    '    <van-field :model-value="form.source_name" label="来源" placeholder="选择来源渠道" readonly is-link @click="srcShow=true"/>',
    '    <van-field label="意向等级">',
    '      <template #input>',
    '        <van-radio-group v-model="form.label_levels" direction="horizontal">',
    '          <van-radio :name="1">A 高</van-radio><van-radio :name="2">B 中</van-radio><van-radio :name="3">C 低</van-radio>',
    '        </van-radio-group>',
    '      </template>',
    '    </van-field>',
    '    <van-field v-model="form.remark" type="textarea" rows="2" label="备注" placeholder="需求 / 训练目标 / 跟进要点" :border="false"/>',
    '  </div>',
    '  <div style="margin:20px 16px">',
    '    <van-button type="primary" block round :loading="saving" @click="save">保存潜客</van-button>',
    '  </div>',
    '  <van-popup v-model:show="srcShow" position="bottom" round><van-picker :columns="srcCols" @confirm="onSrc" @cancel="srcShow=false" confirm-button-text="确定"/></van-popup>',
    '</div>',
  ].join('\n'),
  methods: {
    onSrc(v) { this.form.source_id = v.selectedOptions[0].value; this.form.source_name = v.selectedOptions[0].text; this.srcShow = false; },
    async save() {
      if (!this.form.realname) return vant.showToast('请填写姓名');
      if (!/^1\d{10}$/.test(this.form.phone)) return vant.showToast('请输入正确的手机号');
      this.saving = true;
      try {
        await API.post('/potentials', this.form);
        vant.showToast({ message: '潜客已录入', icon: 'success' });
        this.form = { realname: '', phone: '', gender: 1, source_id: 0, source_name: '', label_levels: 1, remark: '' };
      } finally { this.saving = false; }
    },
  },
  async mounted() {
    try { this.sources = await API.get('/sources', { silent: true }); } catch (e) { /* ignore */ }
  },
};
