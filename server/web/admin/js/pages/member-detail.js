/* 会员详情 */
window.AppPages.MemberDetail = {
  name: 'MemberDetailPage',
  data() {
    return {
      d: null, loading: false, tab: 'recharges',
      user: Auth.getUser() || {},
      Fmt: window.Fmt, DICT: window.DICT,
      // 维护
      mtForm: { record_type: 1, content: '' }, mtSaving: false,
      // 合同查看
      contractDlg: false, contract: null,
      // 编辑
      editDlg: false, form: {}, sources: [], coaches: [], saving: false, uploadingPhoto: false,
      // 体测
      bodyRecords: [], bodyDlg: false, bodyForm: {}, bodySaving: false,
      // 里程碑
      milestones: [],
      // 专属完善链接
      profileLinkDlg: false, profileLinkData: { url: '', token: '', vipName: '' },
      // 训练风采相册
      trainingPhotos: [], loadingPhotos: false,
      photoDlg: false, photoSaving: false, photoUploading: false,
      photoForm: { photo_url: '', photo_date: dayjs().format('YYYY-MM-DD'), remark: '' },
    };
  },
  computed: {
    id() { return this.$route.params.id; },
    profile() { return this.d ? this.d.profile : {}; },
    comparePhotos() {
      const p = this.profile && this.profile.target_compare_photos;
      if (!p) return [];
      if (Array.isArray(p)) return p;
      try { return JSON.parse(p); } catch { return []; }
    },
    formPhotos() {
      const p = this.form && this.form.target_compare_photos;
      if (!p) return [];
      if (Array.isArray(p)) return p;
      try { return JSON.parse(p); } catch { return []; }
    },
    // 体重 + 体脂率 双 y 轴趋势
    bodyChart() {
      const rows = [...this.bodyRecords].sort((a, b) => (String(a.record_date) > String(b.record_date) ? 1 : -1));
      if (rows.length < 2) return null;
      return {
        tooltip: { trigger: 'axis' },
        legend: { data: ['体重(kg)', '体脂率(%)'], top: 0 },
        grid: { left: 56, right: 56, top: 36, bottom: 28 },
        xAxis: { type: 'category', data: rows.map(r => Fmt.date(r.record_date)), boundaryGap: false },
        yAxis: [
          { type: 'value', name: '体重(kg)', scale: true },
          { type: 'value', name: '体脂率(%)', scale: true },
        ],
        series: [
          { name: '体重(kg)', type: 'line', smooth: true, connectNulls: true, itemStyle: { color: '#0d5e56' },
            areaStyle: { opacity: .1 }, data: rows.map(r => r.weight != null ? Number(r.weight) : null) },
          { name: '体脂率(%)', type: 'line', smooth: true, connectNulls: true, yAxisIndex: 1, itemStyle: { color: '#c98a2d' },
            data: rows.map(r => r.body_fat != null ? Number(r.body_fat) : null) },
        ],
      };
    },
  },
  template: `
  <div v-loading="loading">
    <div class="card-box" v-if="d">
      <div style="display:flex;gap:16px;align-items:flex-start;">
        <div class="avatar-circle">{{ (profile.realname || '?').slice(0, 1) }}</div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:18px;font-weight:700;color:var(--text-main)">{{ profile.realname || '未命名' }}</span>
            <dict-tag dict="expireStatus" :value="profile.expire_status" />
            <dict-tag v-if="profile.label_levels" dict="labelLevel" :value="profile.label_levels" />
            <el-tag v-if="profile.is_black" type="danger" size="small">黑名单：{{ profile.black_reason || '无原因' }}</el-tag>
          </div>
          <div class="profile-grid">
            <div><span class="lab">手机号</span>{{ profile.phone }}</div>
            <div><span class="lab">性别</span>{{ DICT.gender[profile.gender] }}</div>
            <div><span class="lab">生日</span>{{ Fmt.date(profile.birthday) || '-' }}</div>
            <div><span class="lab">星座/MBTI</span>{{ profile.constellation_mbti || '-' }}</div>
            <div><span class="lab">初始体重</span>{{ profile.initial_weight != null ? (profile.initial_weight + ' kg') : '-' }}</div>
            <div><span class="lab">目标体重</span>{{ profile.target_weight != null ? (profile.target_weight + ' kg') : '-' }}</div>
            <div><span class="lab">训练频次</span>{{ profile.training_frequency || '-' }}</div>
            <div><span class="lab">来源</span>{{ profile.source_name || '-' }}</div>
            <div><span class="lab">主教练</span>{{ profile.coach_name || '-' }}</div>
            <div><span class="lab">副教练</span>{{ profile.sub_coach_name || '-' }}</div>
            <div><span class="lab">最近签到</span>{{ Fmt.time(profile.last_sign_time) }}</div>
            <div><span class="lab">建档时间</span>{{ Fmt.time(profile.insert_time) }}</div>
            <div style="grid-column: span 2"><span class="lab">会馆反馈</span>{{ profile.studio_feedback || '-' }}</div>
            <div style="grid-column: span 2" v-if="comparePhotos.length">
              <span class="lab">目标对比图</span>
              <div style="display:inline-flex;gap:8px;vertical-align:middle;margin-top:4px">
                <el-image v-for="(img, idx) in comparePhotos" :key="idx" :src="img" :preview-src-list="comparePhotos" fit="cover" style="width:54px;height:54px;border-radius:6px;cursor:pointer;border:1px solid #e5e7eb" />
              </div>
            </div>
            <div style="grid-column: span 2"><span class="lab">备注</span>{{ profile.remark || '-' }}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <el-button type="success" plain @click="openProfileLinkDialog">
            <el-icon style="margin-right:4px"><Share /></el-icon>专属完善链接 (免登录+送70分)
          </el-button>
          <el-button type="primary" @click="$router.push({ path: '/card-open', query: { vip_id: profile.id } })">开卡</el-button>
          <el-button @click="tab = 'maintains'">维护</el-button>
          <el-button @click="openEdit">编辑</el-button>
        </div>
      </div>
    </div>

    <div class="card-box" v-if="d">
      <div class="box-title">权益快照 <span class="text-muted" style="font-weight:400">共 {{ d.cards.length }} 张卡</span></div>
      <div class="rights-cards" v-if="d.cards.length">
        <div v-for="c in d.cards" :key="c.id" class="right-card" :class="[ 'k' + c.card_kind, [2,4,5].includes(c.status) ? 'dead' : '' ]"
          style="cursor:pointer" @click="$router.push('/cards/' + c.id)">
          <div class="rc-tag">{{ DICT.cardStatus[c.status] }}</div>
          <div class="rc-title">{{ c.card_type_name }} <span style="opacity:.75;font-size:12px">· {{ DICT.cardKind[c.card_kind] }}</span></div>
          <div class="rc-main">
            <template v-if="c.card_kind === 3">余额 {{ Fmt.money(c.left_money) }}</template>
            <template v-else-if="c.card_kind === 2">时间卡</template>
            <template v-else>剩 {{ c.left_counts }}<small style="font-size:13px;opacity:.8">/{{ c.counts }}次</small></template>
          </div>
          <div class="rc-sub">{{ c.expire_time ? '有效期至 ' + Fmt.date(c.expire_time) : '待开卡' }} · 实收{{ Fmt.money(c.actual_money) }}</div>
        </div>
      </div>
      <el-empty v-else description="暂无会员卡" :image-size="70" />
    </div>

    <div class="card-box" v-if="d">
      <el-tabs v-model="tab">
        <el-tab-pane label="收款流水" name="recharges">
          <el-table border :data="d.recharges" size="small" stripe>
            <el-table-column label="时间" width="140"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
            <el-table-column prop="card_type_name" label="卡类型" min-width="120" />
            <el-table-column label="类型" width="76"><template #default="{ row }"><dict-tag dict="rechargeType" :value="row.type" /></template></el-table-column>
            <el-table-column label="金额" width="110"><template #default="{ row }"><span class="money">{{ Fmt.money(row.actual_money) }}</span></template></el-table-column>
            <el-table-column label="支付方式" width="90"><template #default="{ row }">{{ DICT.payMethod[row.pay_method] || row.pay_method }}</template></el-table-column>
            <el-table-column prop="membership_name" label="业绩归属" width="100" />
            <el-table-column prop="ope_username" label="经手人" width="100" />
            <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="耗卡流水" name="spends">
          <el-table border :data="d.spends" size="small" stripe>
            <el-table-column label="时间" width="140"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
            <el-table-column prop="card_type_name" label="卡类型" min-width="120" />
            <el-table-column label="场景" width="90"><template #default="{ row }"><dict-tag dict="spendScene" :value="row.scene" /></template></el-table-column>
            <el-table-column prop="costs" label="扣减" width="70" />
            <el-table-column label="耗卡金额" width="110"><template #default="{ row }"><span class="money">{{ Fmt.money(row.spend_money) }}</span></template></el-table-column>
            <el-table-column prop="coach_name" label="教练" width="90" />
            <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="维护记录" name="maintains">
          <el-form inline :model="mtForm" style="margin-bottom:6px">
            <el-form-item label="方式">
              <el-select v-model="mtForm.record_type" style="width:100px">
                <el-option v-for="(v,k) in DICT.maintainType" :key="k" :value="Number(k)" :label="v" />
              </el-select>
            </el-form-item>
            <el-form-item style="width:380px"><el-input v-model="mtForm.content" placeholder="填写维护/回访内容" /></el-form-item>
            <el-form-item><el-button type="primary" :loading="mtSaving" @click="saveMaintain">新增维护记录</el-button></el-form-item>
          </el-form>
          <el-table border :data="d.maintains" size="small" stripe>
            <el-table-column label="时间" width="140"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
            <el-table-column label="方式" width="70"><template #default="{ row }">{{ DICT.maintainType[row.record_type] || '-' }}</template></el-table-column>
            <el-table-column prop="membership_name" label="会籍顾问" width="100" />
            <el-table-column prop="content" label="内容" min-width="240" show-overflow-tooltip />
            <el-table-column label="操作" width="70">
              <template #default="{ row }">
                <el-button v-if="['admin','manager'].includes((user||{}).role)" link type="danger" size="small" @click="delMaintain(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="签到记录" name="checkins">
          <el-table border :data="d.checkins" size="small" stripe>
            <el-table-column label="入场时间" width="150"><template #default="{ row }">{{ Fmt.time(row.check_in_time) }}</template></el-table-column>
            <el-table-column label="出场时间" width="150"><template #default="{ row }">{{ row.check_out_time ? Fmt.time(row.check_out_time) : '在场' }}</template></el-table-column>
            <el-table-column prop="card_type_name" label="使用卡" min-width="130" />
            <el-table-column prop="ope_username" label="经手人" width="110" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="私教预约" name="pt">
          <el-table border :data="d.ptBookings" size="small" stripe>
            <el-table-column label="日期" width="100"><template #default="{ row }">{{ row.date ? Fmt.date(row.date) : '-' }}</template></el-table-column>
            <el-table-column label="时段" width="110"><template #default="{ row }">{{ row.from_time }}-{{ row.to_time }}</template></el-table-column>
            <el-table-column prop="course_title" label="课程" min-width="110" />
            <el-table-column prop="coach_name" label="教练" width="90" />
            <el-table-column prop="card_type_name" label="扣课卡" min-width="120" />
            <el-table-column label="状态" width="90"><template #default="{ row }"><dict-tag dict="ptStatus" :value="row.status" /></template></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="团课预约" name="group">
          <el-table border :data="d.groupBookings" size="small" stripe>
            <el-table-column label="上课时间" width="150"><template #default="{ row }">{{ Fmt.time(row.class_start_time) }}</template></el-table-column>
            <el-table-column prop="syllabus_title" label="课程" min-width="120" />
            <el-table-column prop="card_type_name" label="扣课卡" min-width="120" />
            <el-table-column prop="card_deduct_num" label="扣次" width="60" />
            <el-table-column label="状态" width="90"><template #default="{ row }"><dict-tag dict="groupBookStatus" :value="row.status" /></template></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="体测数据" name="body">
          <div class="search-bar" style="margin-bottom:8px">
            <div class="text-muted">共 {{ bodyRecords.length }} 条体测记录</div>
            <div style="flex:1"></div>
            <el-button type="primary" plain size="small" @click="openBodyDlg">录入体测</el-button>
          </div>
          <div v-if="bodyChart" style="margin-bottom:12px"><v-chart :option="bodyChart" height="280px" /></div>
          <el-alert v-else type="info" :closable="false" style="margin-bottom:12px"
            title="体测数据不足 2 条，暂无法绘制体重/体脂率趋势图，请先录入体测" />
          <el-table border :data="bodyRecords" size="small" stripe>
            <el-table-column label="日期" width="110"><template #default="{ row }">{{ Fmt.date(row.record_date) }}</template></el-table-column>
            <el-table-column label="身高(cm)" width="90"><template #default="{ row }">{{ row.height != null ? row.height : '-' }}</template></el-table-column>
            <el-table-column label="体重(kg)" width="90"><template #default="{ row }">{{ row.weight != null ? row.weight : '-' }}</template></el-table-column>
            <el-table-column label="体脂率(%)" width="90"><template #default="{ row }">{{ row.body_fat != null ? row.body_fat : '-' }}</template></el-table-column>
            <el-table-column label="肌肉量(kg)" width="94"><template #default="{ row }">{{ row.muscle != null ? row.muscle : '-' }}</template></el-table-column>
            <el-table-column label="胸围(cm)" width="86"><template #default="{ row }">{{ row.bust != null ? row.bust : '-' }}</template></el-table-column>
            <el-table-column label="腰围(cm)" width="86"><template #default="{ row }">{{ row.waist != null ? row.waist : '-' }}</template></el-table-column>
            <el-table-column label="臀围(cm)" width="86"><template #default="{ row }">{{ row.hip != null ? row.hip : '-' }}</template></el-table-column>
            <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
            <el-table-column label="操作" width="70" fixed="right">
              <template #default="{ row }"><el-button link type="danger" size="small" @click="delBody(row)">删除</el-button></template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="里程碑" name="milestones">
          <el-timeline v-if="milestones.length" style="padding-top:6px">
            <el-timeline-item v-for="m in milestones" :key="m.id" :timestamp="Fmt.time(m.insert_time)"
              :type="m.status === 1 ? 'success' : 'warning'" placement="top">
              <div style="font-weight:600;margin-bottom:4px">
                {{ m.type === 1 ? '第' + m.node_value + '节课' : '第' + m.node_value + '天' }}
                <dict-tag dict="milestoneStatus" :value="m.status" style="margin-left:6px" />
                <span class="text-muted" style="font-weight:400;margin-left:6px" v-if="m.card_type_name">{{ m.card_type_name }}</span>
              </div>
              <div v-if="m.status === 1" style="background:var(--el-color-primary-light-9);border-radius:8px;padding:10px 12px;line-height:1.7;white-space:pre-wrap;font-size:13px">{{ m.summary }}</div>
              <div v-else class="text-muted">教练尚未填写总结（{{ m.coach_name || '未分配教练' }}）</div>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无里程碑" :image-size="70" />
        </el-tab-pane>
        <el-tab-pane label="合同" name="contracts">
          <el-table border :data="d.contracts" size="small" stripe>
            <el-table-column prop="contract_num" label="合同号" width="200" />
            <el-table-column prop="title" label="标题" min-width="160" />
            <el-table-column label="签署状态" width="100"><template #default="{ row }"><dict-tag dict="signStatus" :value="row.sign_status" /></template></el-table-column>
            <el-table-column label="签署时间" width="150"><template #default="{ row }">{{ Fmt.time(row.sign_time) }}</template></el-table-column>
            <el-table-column label="创建时间" width="150"><template #default="{ row }">{{ Fmt.time(row.insert_time) }}</template></el-table-column>
            <el-table-column label="操作" width="90">
              <template #default="{ row }"><el-button link type="primary" size="small" @click="viewContract(row)">查看合同</el-button></template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="训练风采" name="trainingPhotos">
          <div v-loading="loadingPhotos" style="padding:10px 0">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <span class="text-muted" style="font-size:13px">共 {{ trainingPhotos.length }} 张训练风采照片（与学员端及教练手机端实时同步）</span>
              <el-button type="primary" size="small" icon="Plus" @click="openUploadPhoto">上传训练风采</el-button>
            </div>
            <div v-if="!trainingPhotos.length">
              <el-empty description="该会员暂未上传训练风采照片" :image-size="70">
                <el-button type="primary" size="small" icon="Plus" @click="openUploadPhoto">上传第一张训练风采</el-button>
              </el-empty>
            </div>
            <div v-else style="display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:16px">
              <div v-for="p in trainingPhotos" :key="p.id" style="background:var(--el-fill-color-light);border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.06);display:flex;flex-direction:column;position:relative">
                <el-image :src="p.photo_url" :preview-src-list="trainingPhotos.map(x => x.photo_url)" fit="cover" style="width:100%;height:180px" />
                <el-button link type="danger" size="small" icon="Delete" style="position:absolute;top:6px;right:6px;background:rgba(255,255,255,0.85);padding:4px 6px;border-radius:4px" @click="deletePhoto(p)">删除</el-button>
                <div style="padding:10px;font-size:13px">
                  <div style="font-weight:600;color:var(--text-main);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ p.remark || '训练打卡记录' }}</div>
                  <div style="display:flex;justify-content:space-between;color:var(--text-secondary);font-size:11px">
                    <span>{{ Fmt.date(p.photo_date) }}</span>
                    <span>{{ p.month_key }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 合同查看 -->
    <el-dialog v-model="contractDlg" :title="contract ? contract.title + '（' + contract.contract_num + '）' : '合同'" width="680px">
      <template v-if="contract">
        <div style="margin-bottom:10px">
          <dict-tag dict="signStatus" :value="contract.sign_status" size="default" />
          <span class="text-muted" style="margin-left:10px" v-if="contract.sign_status === 1">签署于 {{ Fmt.time(contract.sign_time) }}</span>
        </div>
        <div class="contract-body">{{ contract.content }}</div>
        <div v-if="contract.sign_status === 1 && contract.sign_img" style="margin-top:12px">
          <div class="text-muted" style="margin-bottom:6px">会员签名：</div>
          <img :src="contract.sign_img" style="max-height:110px;border:1px dashed #ccc;border-radius:8px;background:#fff" />
        </div>
      </template>
    </el-dialog>

    <!-- 录入体测 -->
    <el-dialog v-model="bodyDlg" :title="'录入体测 - ' + (profile.realname || '')" width="520px" destroy-on-close>
      <el-form :model="bodyForm" label-width="90px">
        <el-form-item label="体测日期" required>
          <el-date-picker v-model="bodyForm.record_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-row :gutter="10">
          <el-col :span="12"><el-form-item label="身高(cm)"><el-input-number v-model="bodyForm.height" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="体重(kg)"><el-input-number v-model="bodyForm.weight" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="体脂率(%)"><el-input-number v-model="bodyForm.body_fat" :min="0" :max="100" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="肌肉量(kg)"><el-input-number v-model="bodyForm.muscle" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="胸围(cm)"><el-input-number v-model="bodyForm.bust" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="腰围(cm)"><el-input-number v-model="bodyForm.waist" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="臀围(cm)"><el-input-number v-model="bodyForm.hip" :min="0" :precision="1" controls-position="right" style="width:100%" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="bodyForm.remark" placeholder="如：训练1个月复测" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bodyDlg=false">取消</el-button>
        <el-button type="primary" :loading="bodySaving" @click="saveBody">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑档案 -->
    <el-dialog v-model="editDlg" title="编辑会员档案" width="620px" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-row :gutter="14">
          <el-col :span="12"><el-form-item label="姓名"><el-input v-model="form.realname" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="昵称"><el-input v-model="form.nickname" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="性别">
            <el-radio-group v-model="form.gender"><el-radio :value="1">男</el-radio><el-radio :value="2">女</el-radio><el-radio :value="0">未知</el-radio></el-radio-group>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="生日"><el-date-picker v-model="form.birthday" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="来源渠道">
            <el-select v-model="form.source_id" clearable style="width:100%" @change="onSourceChange">
              <el-option v-for="s in sources" :key="s.id" :value="s.id" :label="s.title" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="意向标签">
            <el-select v-model="form.label_levels" style="width:100%">
              <el-option :value="0" label="无" /><el-option :value="1" label="A" /><el-option :value="2" label="B" /><el-option :value="3" label="C" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="主教练">
            <el-select v-model="form.coach_id" clearable style="width:100%" @change="onCoachChange">
              <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="副教练">
            <el-select v-model="form.sub_coach_id" clearable style="width:100%" @change="onSubCoachChange">
              <el-option v-for="c in coaches" :key="c.id" :value="c.id" :label="c.realname" />
            </el-select>
          </el-form-item></el-col>
          <el-col :span="12"><el-form-item label="身份证号"><el-input v-model="form.id_card_number" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="住址"><el-input v-model="form.address" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="初始体重(kg)"><el-input-number v-model="form.initial_weight" :min="20" :max="250" :precision="1" controls-position="right" placeholder="kg" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="目标体重(kg)"><el-input-number v-model="form.target_weight" :min="20" :max="250" :precision="1" controls-position="right" placeholder="kg" style="width:100%" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="星座/MBTI"><el-input v-model="form.constellation_mbti" placeholder="如：天蝎座 / INTJ" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="训练频次"><el-input v-model="form.training_frequency" placeholder="如：每周3-4次" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="会馆反馈"><el-input v-model="form.studio_feedback" type="textarea" :rows="2" placeholder="会员对场馆设施/课程安排/教练服务的反馈与建议" /></el-form-item></el-col>
          <el-col :span="24"><el-form-item label="目标对比图">
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              <div v-for="(img, idx) in formPhotos" :key="idx" style="position:relative;width:60px;height:60px;border-radius:6px;overflow:hidden;border:1px solid #dcdfe6">
                <el-image :src="img" fit="cover" style="width:100%;height:100%" />
                <div @click="removePhoto(idx)" style="position:absolute;top:0;right:0;background:rgba(0,0,0,0.6);color:#fff;width:18px;height:18px;line-height:18px;text-align:center;cursor:pointer;font-size:12px;border-bottom-left-radius:4px">×</div>
              </div>
              <el-upload :show-file-list="false" accept="image/*" :before-upload="uploadComparePhoto">
                <el-button size="small" type="primary" plain :loading="uploadingPhoto">+ 上传对比图</el-button>
              </el-upload>
            </div>
          </el-form-item></el-col>
          <el-col :span="24"><el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item></el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="editDlg=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="profileLinkDlg" title="会员专属完善资料链接 (免登录)" width="520px" destroy-on-close>
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:15px;font-weight:600;color:var(--text-main);margin-bottom:6px">
          会员：{{ profileLinkData.vipName }}
        </div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
          专属免登录链接（有效时长30天），会员打开即可完善7项档案并最高获得 70 积分奖励
        </div>
        <div id="admin-profile-qr" style="display:inline-block;padding:12px;background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.08);margin-bottom:16px;min-width:170px;min-height:170px"></div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <el-input :model-value="profileLinkData.url" readonly select-all-on-focus />
          <el-button type="primary" @click="copyProfileLink">复制链接</el-button>
        </div>
        <div style="margin-top:14px;padding:10px 14px;background:var(--el-fill-color-light);border-radius:6px;font-size:12px;color:var(--text-secondary);text-align:left;line-height:1.6">
          💡 <b>使用提示：</b><br/>
          1. 复制链接后，可通过微信直接发送给学员；<br/>
          2. 也可让学员直接使用微信扫描上方二维码；<br/>
          3. 学员补充初始体重、目标对比照等档案后，系统将自动下发积分并在会员详情实时同步。
        </div>
      </div>
    </el-dialog>

    <!-- 训练风采上传弹窗 -->
    <el-dialog v-model="photoDlg" title="上传会员训练风采照片" width="500px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="拍摄日期">
          <el-date-picker v-model="photoForm.photo_date" type="date" value-format="YYYY-MM-DD" placeholder="选择拍摄日期" style="width:100%"/>
        </el-form-item>
        <el-form-item label="照片文件" required>
          <div style="display:flex;flex-direction:column;gap:8px">
            <el-upload :show-file-list="false" accept="image/*" :before-upload="uploadTrainingPhotoFile">
              <el-button size="small" type="primary" plain :loading="photoUploading">+ 选择并上传照片</el-button>
            </el-upload>
            <div v-if="photoForm.photo_url" style="margin-top:6px">
              <img :src="photoForm.photo_url" style="width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid #dcdfe6"/>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="心得/备注">
          <el-input v-model="photoForm.remark" type="textarea" :rows="2" placeholder="如：深蹲姿势进步显著 / 训练打卡记录" maxlength="50" show-word-limit/>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="photoDlg=false">取消</el-button>
        <el-button type="primary" :loading="photoSaving" @click="submitPhoto">确认保存</el-button>
      </template>
    </el-dialog>
  </div>`,
  methods: {
    async load() {
      this.loading = true;
      try { this.d = await api.get('/members/' + this.id); }
      finally { this.loading = false; }
      this.loadExtras();
    },
    async loadExtras() {
      try { this.bodyRecords = await api.get('/body-records', { vip_id: this.id }) || []; } catch (e) { this.bodyRecords = []; }
      try {
        const d = await api.get('/milestones', { vip_id: this.id, size: 100 });
        this.milestones = d.list || [];
      } catch (e) { this.milestones = []; }
    },
    /* ---- 体测 ---- */
    openBodyDlg() {
      this.bodyForm = { record_date: dayjs().format('YYYY-MM-DD'), weight: null, body_fat: null, muscle: null, bust: null, waist: null, hip: null, remark: '' };
      this.bodyDlg = true;
    },
    async saveBody() {
      if (!this.bodyForm.record_date) return ElementPlus.ElMessage.warning('请选择体测日期');
      if (this.bodyForm.weight == null && this.bodyForm.body_fat == null) return ElementPlus.ElMessage.warning('请至少填写体重或体脂率');
      this.bodySaving = true;
      try {
        await api.post('/body-records', Object.assign({ vip_id: Number(this.id) }, this.bodyForm));
        ElementPlus.ElMessage.success('体测已录入');
        this.bodyDlg = false;
        this.loadExtras();
      } finally { this.bodySaving = false; }
    },
    delBody(row) {
      ElementPlus.ElMessageBox.confirm('确定删除 ' + Fmt.date(row.record_date) + ' 的体测记录？', '删除体测', { type: 'warning' })
        .then(async () => {
          await api.del('/body-records/' + row.id);
          ElementPlus.ElMessage.success('已删除');
          this.loadExtras();
        }).catch(() => {});
    },
    async viewContract(row) {
      this.contract = await api.get('/contracts/' + row.id);
      this.contractDlg = true;
    },
    delMaintain(row) {
      ElementPlus.ElMessageBox.confirm('确定删除这条维护记录？（会记入操作日志）', '删除维护记录', { type: 'warning' })
        .then(async () => {
          await api.del('/maintain-records/' + row.id);
          ElementPlus.ElMessage.success('已删除');
          this.load();
        }).catch(() => {});
    },
    async saveMaintain() {
      if (!this.mtForm.content) return ElementPlus.ElMessage.warning('请填写维护内容');
      this.mtSaving = true;
      try {
        await api.post('/maintain-records', { vip_user_id: this.profile.id, vip_user_type: 1, record_type: this.mtForm.record_type, content: this.mtForm.content });
        ElementPlus.ElMessage.success('已记录');
        this.mtForm.content = '';
        this.load();
      } finally { this.mtSaving = false; }
    },
    async openEdit() {
      if (!this.sources.length) this.sources = await api.get('/sources');
      if (!this.coaches.length) this.coaches = await api.get('/coaches', { status: 1 });
      this.form = JSON.parse(JSON.stringify(this.profile));
      if (!this.form.coach_id) this.form.coach_id = null;
      if (!this.form.sub_coach_id) this.form.sub_coach_id = null;
      if (typeof this.form.target_compare_photos === 'string') {
        try { this.form.target_compare_photos = JSON.parse(this.form.target_compare_photos); } catch { this.form.target_compare_photos = []; }
      } else if (!Array.isArray(this.form.target_compare_photos)) {
        this.form.target_compare_photos = [];
      }
      this.editDlg = true;
    },
    async uploadComparePhoto(file) {
      if (file.size > 5 * 1024 * 1024) { ElementPlus.ElMessage.warning('图片不能超过 5MB'); return false; }
      this.uploadingPhoto = true;
      try {
        const fd = new FormData(); fd.append('file', file);
        const resp = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + Auth.getToken() }, body: fd });
        const j = await resp.json();
        if (j.code !== 0) throw new Error(j.msg || '上传失败');
        if (!Array.isArray(this.form.target_compare_photos)) this.form.target_compare_photos = [];
        this.form.target_compare_photos.push(j.data.url);
        ElementPlus.ElMessage.success('已上传');
      } catch (e) { ElementPlus.ElMessage.error(e.message || '上传失败'); }
      finally { this.uploadingPhoto = false; }
      return false;
    },
    removePhoto(idx) {
      if (!Array.isArray(this.form.target_compare_photos)) return;
      this.form.target_compare_photos.splice(idx, 1);
    },
    onSourceChange(v) {
      const s = this.sources.find(x => x.id === v);
      this.form.source_name = s ? s.title : '';
    },
    onCoachChange(v) {
      const c = this.coaches.find(x => x.id === v);
      this.form.coach_name = c ? c.realname : '';
    },
    onSubCoachChange(v) {
      const c = this.coaches.find(x => x.id === v);
      this.form.sub_coach_name = c ? c.realname : '';
    },
    async save() {
      this.saving = true;
      try {
        await api.put('/members/' + this.profile.id, this.form);
        ElementPlus.ElMessage.success('保存成功');
        this.editDlg = false;
        this.load();
      } finally { this.saving = false; }
    },
    async openProfileLinkDialog() {
      try {
        const res = await api.get('/members/' + this.id + '/profile-link');
        if (!res) return;
        const fullUrl = window.location.origin + '/m/' + (res.link || res.path);
        this.profileLinkData = {
          url: fullUrl,
          token: res.token,
          vipName: res.vip_name || this.profile.realname || '',
        };
        this.profileLinkDlg = true;
        this.$nextTick(() => {
          const el = document.getElementById('admin-profile-qr');
          if (el) {
            el.innerHTML = '';
            if (window.QRCode) {
              new QRCode(el, { text: fullUrl, width: 170, height: 170, colorDark: '#0d5e56', colorLight: '#ffffff' });
            }
          }
        });
      } catch (e) {
        ElementPlus.ElMessage.error(e.message || '获取专属链接失败');
      }
    },
    async copyProfileLink() {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(this.profileLinkData.url);
        } else {
          const ta = document.createElement('textarea');
          ta.value = this.profileLinkData.url;
          ta.style.position = 'fixed';
          ta.style.top = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        ElementPlus.ElMessage.success('专属完善资料链接已复制到剪贴板！');
      } catch (e) {
        ElementPlus.ElMessage.error('复制失败，请手动长按复制');
      }
    },
    async loadTrainingPhotos() {
      this.loadingPhotos = true;
      try {
        this.trainingPhotos = (await api.get('/members/' + this.id + '/training-photos')) || [];
      } catch (e) {
        this.trainingPhotos = [];
      } finally {
        this.loadingPhotos = false;
      }
    },
    openUploadPhoto() {
      this.photoForm = { photo_url: '', photo_date: dayjs().format('YYYY-MM-DD'), remark: '' };
      this.photoDlg = true;
    },
    async uploadTrainingPhotoFile(file) {
      if (file.size > 5 * 1024 * 1024) { ElementPlus.ElMessage.warning('图片不能超过 5MB'); return false; }
      this.photoUploading = true;
      try {
        const url = await api.upload(file);
        this.photoForm.photo_url = url;
        ElementPlus.ElMessage.success('照片已上传');
      } catch (e) { ElementPlus.ElMessage.error(e.message || '上传失败'); }
      finally { this.photoUploading = false; }
      return false;
    },
    async submitPhoto() {
      if (!this.photoForm.photo_url) return ElementPlus.ElMessage.warning('请先选择并上传照片');
      this.photoSaving = true;
      try {
        await api.post('/members/' + this.id + '/training-photos', {
          photo_url: this.photoForm.photo_url,
          photo_date: this.photoForm.photo_date || dayjs().format('YYYY-MM-DD'),
          remark: this.photoForm.remark ? this.photoForm.remark.trim() : null,
        });
        ElementPlus.ElMessage.success('训练风采照片已添加');
        this.photoDlg = false;
        this.loadTrainingPhotos();
      } catch (e) {
        ElementPlus.ElMessage.error(e.message || '保存失败');
      } finally {
        this.photoSaving = false;
      }
    },
    async deletePhoto(p) {
      try {
        await ElementPlus.ElMessageBox.confirm('确定要删除这张训练风采照片吗？', '提示', { type: 'warning' });
        await api.del('/members/' + this.id + '/training-photos/' + p.id);
        ElementPlus.ElMessage.success('已删除');
        this.loadTrainingPhotos();
      } catch (e) { /* ignore cancel */ }
    },
  },
  watch: {
    '$route.params.id'() { if (this.$route.path.startsWith('/members/')) this.load(); },
    tab(v) { if (v === 'trainingPhotos' && !this.trainingPhotos.length) this.loadTrainingPhotos(); },
  },
  mounted() { this.load(); },
};
