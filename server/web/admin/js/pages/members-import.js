/* 会员批量导入: 粘贴 Excel / 上传 CSV → 预检 → 确认导入
 * 导入会员的初始登录密码 = 手机号后 6 位 */
(function () {
  const HEADERS = [
    ['姓名', 'realname', '必填'],
    ['手机号', 'phone', '必填，11位，同时作为登录账号'],
    ['性别', 'gender', '男/女，可空'],
    ['生日', 'birthday', '2000-01-01，可空'],
    ['卡类型', 'card_title', '卡名称；系统里没有的会自动创建'],
    ['卡种', 'card_kind', '次卡/时间卡/储值卡/私教卡，可空则按卡名推断'],
    ['总次数', 'counts', '留空取卡类型默认次数'],
    ['剩余次数', 'left_counts', '导入时的余次，留空=总次数'],
    ['余额', 'left_money', '储值卡填写'],
    ['剩余赠送金额', 'left_gift_money', '储值卡的赠送余额，可空'],
    ['实收金额', 'actual_money', '历史实收，可空'],
    ['单课价值', 'unit_price', '可空，留空按实收/总次数算'],
    ['开卡日期', 'open_date', '留空=今天'],
    ['开始时间', 'start_date', '可空'],
    ['到期日期', 'expire_date', '留空=按卡类型有效期推算'],
    ['最晚开卡时间', 'latest_open', '待开卡的卡填写，可空'],
    ['状态', 'status', '使用中/已过期/待开卡/已暂停/已停用/已退卡，留空按到期日判断'],
    ['支付方式', 'pay_method', '微信/支付宝/现金/美团大众等，可空'],
    ['门店', 'club', '需与门店名称一致，可空'],
    ['主教练', 'coach', '需与教练姓名一致，可空'],
    ['业绩归属', 'membership', '员工姓名；不在系统里也会按文本保留'],
    ['经手人', 'operator', '原系统的开卡人，可空'],
    ['实体卡号', 'physical_card_no', '可空'],
    ['原系统卡ID', 'ext_card_id', '强烈建议填，重复导入时自动跳过已导入的卡'],
    ['身份证号', 'id_card', '可空'],
    ['身高', 'height', '厘米，可空，会写入体测记录'],
    ['体重', 'weight', '公斤，可空，会写入体测记录'],
    ['地址', 'address', '可空'],
    ['来源', 'source', '可空'],
    ['备注', 'remark', '可空'],
  ];
  const ALIAS = {
    realname: ['姓名', '会员姓名', '真实姓名', '会员名'], phone: ['手机号', '手机', '电话', '联系方式'],
    gender: ['性别'], birthday: ['生日', '出生日期'],
    card_title: ['卡类型', '会员卡', '卡名称', '会员卡名称'], card_kind: ['卡种', '会员卡类型'],
    counts: ['总次数', '总课时', '购买次数', '售卡时的总次数'],
    left_counts: ['剩余次数', '剩余课时', '次数', '余次'],
    left_money: ['余额', '储值余额', '剩余金额', '储值卡剩余本金'],
    left_gift_money: ['剩余赠送金额', '储值卡剩余赠送金额'],
    actual_money: ['实收金额', '实收', '金额', '售卡价格'], unit_price: ['单课价值', '单价', '课时单价'],
    open_date: ['开卡日期', '开卡时间', '购卡日期'], start_date: ['开始时间', '开始日期', '启用日期'],
    expire_date: ['到期日期', '到期时间', '有效期至', '过期时间'], latest_open: ['最晚开卡时间', '最晚开卡日期'],
    status: ['状态', '卡状态'], pay_method: ['支付方式', '付款方式'],
    club: ['门店', '所属门店', '开卡门店', '会员卡所属门店'],
    coach: ['主教练', '教练'], membership: ['业绩归属', '会籍顾问', '顾问', '销售'],
    operator: ['经手人', '创建人', '操作人'],
    physical_card_no: ['实体卡号', '卡号'], ext_card_id: ['原系统卡ID', '会员卡ID', '旧卡ID'],
    id_card: ['身份证号', '身份证'], height: ['身高'], weight: ['体重'], address: ['地址', '住址'],
    source: ['来源', '来源渠道', '加入渠道'], remark: ['备注', '说明'],
  };

  // 支持 CSV(逗号) 与 Excel 粘贴(制表符), 处理引号包裹
  function parseTable(text) {
    const src = String(text || '').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').trim();
    if (!src) return [];
    const sep = (src.split('\n')[0].split('\t').length > src.split('\n')[0].split(',').length) ? '\t' : ',';
    const rows = []; let cur = ['']; let q = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (q) {
        if (ch === '"' && src[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; }
        else if (ch === '"') q = false;
        else cur[cur.length - 1] += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) cur.push('');
      else if (ch === '\n') { rows.push(cur); cur = ['']; }
      else cur[cur.length - 1] += ch;
    }
    rows.push(cur);
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  function toObjects(table) {
    if (table.length < 2) return { rows: [], unknown: [] };
    const head = table[0].map(h => String(h).trim());
    const map = []; const unknown = [];
    head.forEach((h, i) => {
      const key = Object.keys(ALIAS).find(k => ALIAS[k].includes(h) || k === h);
      if (key) map[i] = key; else if (h) unknown.push(h);
    });
    const rows = table.slice(1).map(line => {
      const o = {};
      map.forEach((k, i) => { if (k) o[k] = String(line[i] == null ? '' : line[i]).trim(); });
      return o;
    });
    return { rows, unknown };
  }

  window.AppPages.MembersImport = {
    data() {
      return {
        text: '', rows: [], unknown: [],
        preview: null, stat: null, checking: false, importing: false,
        countRevenue: false, autoCat: true, done: null,
      };
    },
    computed: {
      headerTip() { return HEADERS.map(h => h[0]).join('、'); },
      badRows() { return (this.preview || []).filter(r => !r.ok); },
    },
    template: `
      <div class="page-wrap">
        <div class="box">
          <div class="box-title">1. 准备数据</div>
          <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px">
            <template #title>表头需包含：{{ headerTip }}。姓名与手机号必填，其余可留空。</template>
          </el-alert>
          <el-space wrap style="margin-bottom:10px">
            <el-button @click="downloadTpl" icon="Download">下载导入模板(CSV)</el-button>
            <el-upload :show-file-list="false" accept=".csv,.txt" :before-upload="onFile">
              <el-button icon="Upload">选择 CSV 文件</el-button>
            </el-upload>
            <span class="muted">也可以直接从 Excel 复制整片区域（含表头），粘贴到下方</span>
          </el-space>
          <el-input v-model="text" type="textarea" :rows="8" placeholder="把 Excel 里的内容连同表头一起粘贴到这里" />
          <div style="margin-top:12px">
            <el-button type="primary" :loading="checking" @click="check">预检数据</el-button>
            <span v-if="unknown.length" class="muted" style="margin-left:10px">已忽略无法识别的列：{{ unknown.join('、') }}</span>
          </div>
        </div>

        <div class="box" v-if="preview">
          <div class="box-title">2. 预检结果</div>
          <el-space wrap style="margin-bottom:10px">
            <el-tag type="info">共 {{ stat.total }} 行</el-tag>
            <el-tag type="success">可导入 {{ stat.ok }}</el-tag>
            <el-tag type="danger" v-if="stat.fail">有问题 {{ stat.fail }}</el-tag>
            <el-tag>新建会员 {{ stat.new_member }}</el-tag>
            <el-tag>已有会员 {{ stat.exist_member }}</el-tag>
            <el-tag type="warning">带卡 {{ stat.with_card }}</el-tag>
            <el-tag type="info" v-if="stat.skip">已导过跳过 {{ stat.skip }}</el-tag>
            <el-tag type="danger" v-if="stat.new_categories && stat.new_categories.length" effect="plain">
              将自动创建卡类型 {{ stat.new_categories.length }} 个
            </el-tag>
          </el-space>
          <el-table :data="preview" border size="small" height="420" style="width:100%">
            <el-table-column type="index" label="#" width="50" />
            <el-table-column prop="realname" label="姓名" width="100" />
            <el-table-column prop="phone" label="手机号" width="130" />
            <el-table-column label="会员" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.member_action==='新建会员'?'success':'info'">{{ row.member_action }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="card_desc" label="会员卡" min-width="240" />
            <el-table-column label="校验" min-width="260">
              <template #default="{ row }">
                <span v-if="!row.ok" style="color:var(--danger)">{{ row.errors.join('；') }}</span>
                <span v-else-if="row.skip" style="color:var(--text-muted)">{{ (row.warnings || []).join('；') }}</span>
                <span v-else style="color:var(--text-main)">
                  通过<span v-if="row.warnings && row.warnings.length" style="color:var(--text-sub)">（{{ row.warnings.join('；') }}）</span>
                </span>
              </template>
            </el-table-column>
          </el-table>
          <div style="margin-top:14px">
            <el-checkbox v-model="countRevenue">把「实收金额」计入收款流水与业绩（历史数据一般不勾选）</el-checkbox>
            <el-checkbox v-model="autoCat" style="margin-left:16px">系统里没有的卡类型自动创建（关闭则报错）</el-checkbox>
          </div>
          <div style="margin-top:12px">
            <el-button type="primary" :loading="importing" :disabled="!stat.ok" @click="doImport">
              确认导入 {{ stat.ok }} 条<span v-if="stat.fail">（跳过 {{ stat.fail }} 条有问题的）</span>
            </el-button>
            <span class="muted" style="margin-left:10px">导入会员的初始登录密码为「手机号后 6 位」</span>
          </div>
        </div>

        <div class="box" v-if="done">
          <div class="box-title">3. 导入完成</div>
          <el-result icon="success" :title="'成功导入 ' + done.total + ' 条'"
            :sub-title="'新建会员 ' + done.created_member + ' 人，导入会员卡 ' + done.created_card + ' 张'
              + (done.skipped ? '，跳过已导入 ' + done.skipped + ' 张' : '')
              + (done.created_categories && done.created_categories.length ? '，新建卡类型 ' + done.created_categories.length + ' 个' : '')
              + '；初始密码为手机号后 6 位'">
            <template #extra>
              <el-button type="primary" @click="$router.push('/members')">去会员列表</el-button>
              <el-button @click="reset">再导一批</el-button>
            </template>
          </el-result>
        </div>
      </div>`,
    methods: {
      downloadTpl() {
        const head = HEADERS.map(h => h[0]).join(',');
        const demo = ['张三', '13800001111', '男', '1995-06-01', '私教卡·10课时', '私教卡', '10', '7', '', '', '3800', '380',
          '2026-06-01', '2026-06-01', '2027-05-31', '', '使用中', '微信', '3S健身·巴南店', '李强', '王莉', '王莉',
          '', 'OLD10001', '', '175', '70', '', '朋友介绍', '历史数据'].join(',');
        const blob = new Blob(['\ufeff' + head + '\n' + demo + '\n'], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = '会员导入模板.csv'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
      onFile(file) {
        const rd = new FileReader();
        rd.onload = () => { this.text = String(rd.result || ''); this.check(); };
        rd.readAsText(file, 'utf-8');
        return false;
      },
      async check() {
        const parsed = toObjects(parseTable(this.text));
        this.unknown = parsed.unknown;
        if (!parsed.rows.length) return ElementPlus.ElMessage.warning('没有解析到数据，请确认第一行是表头');
        this.rows = parsed.rows;
        this.checking = true;
        try {
          const d = await api.post('/members/import', { rows: this.rows, commit: false, auto_create_category: this.autoCat });
          this.preview = d.preview; this.stat = d.stat; this.done = null;
        } finally { this.checking = false; }
      },
      async doImport() {
        try {
          await ElementPlus.ElMessageBox.confirm(
            `将导入 ${this.stat.ok} 条数据，新建会员 ${this.stat.new_member} 人。`
            + (this.stat.fail ? `有问题的 ${this.stat.fail} 条会跳过，可修正后再导一次。` : '')
            + '初始登录密码为手机号后 6 位，导入后不可自动撤销。',
            '确认导入', { type: 'warning', confirmButtonText: '确认导入' });
        } catch (e) { return; }
        this.importing = true;
        try {
          // 只提交预检通过的行, 有问题的整行跳过(行号从 1 开始)
          const okLines = new Set(this.preview.filter(x => x.ok).map(x => x.line));
          const rows = this.rows.filter((r, i) => okLines.has(i + 1));
          const d = await api.post('/members/import', { rows, commit: true, count_revenue: this.countRevenue, auto_create_category: this.autoCat });
          this.done = d; this.preview = null; this.stat = null; this.text = '';
          ElementPlus.ElMessage.success('导入完成');
        } finally { this.importing = false; }
      },
      reset() { this.done = null; this.text = ''; this.rows = []; this.preview = null; this.stat = null; },
    },
  };
})();
