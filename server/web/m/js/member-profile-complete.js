/* 会员免登录专属档案完善与积分奖励页 (SYS-05) */
(function () {
  window.Pages = window.Pages || {};

  const QUICK_CONSTELLATIONS = ['白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座', '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座'];
  const QUICK_MBTI = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'];
  const QUICK_FREQS = ['每周1-2次', '每周3-4次', '每周5次及以上', '工作日每天'];

  window.Pages.CompleteProfile = {
    data() {
      return {
        loading: true,
        submitting: false,
        vip: {},
        items: [],
        completedCount: 0,
        totalCount: 7,
        earnedPoints: 0,
        maxPoints: 70,
        form: {
          realname: '',
          gender: 0,
          birthday: '',
          initial_weight: '',
          target_weight: '',
          target_compare_photos: [],
          constellation_mbti: '',
          training_frequency: '',
          studio_feedback: '',
        },
        uploaderFileList: [],
        showRewardDialog: false,
        rewardResult: {
          pointsGained: 0,
          totalPoints: 0,
          msg: '',
        },
      };
    },
    computed: {
      progressPercent() {
        if (!this.maxPoints) return 0;
        return Math.min(100, Math.round((this.earnedPoints / this.maxPoints) * 100));
      },
      itemMap() {
        const m = {};
        (this.items || []).forEach(it => { m[it.key] = it; });
        return m;
      },
    },
    async mounted() {
      // 检查是否有传入 token
      const qToken = (this.$route.query && this.$route.query.token) || (new URLSearchParams(window.location.search).get('token'));
      if (qToken) {
        localStorage.setItem('m_token', qToken);
        localStorage.setItem('m_type', 'member');
        if (window.Store) {
          window.Store.token = qToken;
          window.Store.type = 'member';
        }
      }
      await this.loadData();
    },
    methods: {
      async loadData() {
        this.loading = true;
        try {
          const res = await API.get('/complete-profile-data');
          if (res) {
            this.vip = res.vip || {};
            this.items = res.items || [];
            this.completedCount = res.completed_count || 0;
            this.totalCount = res.total_count || 7;
            this.earnedPoints = res.earned_points || 0;
            this.maxPoints = res.max_points || 70;

            const v = this.vip;
            this.form.realname = v.realname || v.nickname || '';
            this.form.gender = v.gender != null ? v.gender : 0;
            this.form.birthday = v.birthday ? dayjs(v.birthday).format('YYYY-MM-DD') : '';
            this.form.initial_weight = v.initial_weight != null ? v.initial_weight : '';
            this.form.target_weight = v.target_weight != null ? v.target_weight : '';
            this.form.constellation_mbti = v.constellation_mbti || '';
            this.form.training_frequency = v.training_frequency || '';
            this.form.studio_feedback = v.studio_feedback || '';

            const photos = Array.isArray(v.target_compare_photos) ? v.target_compare_photos : [];
            this.form.target_compare_photos = photos;
            this.uploaderFileList = photos.map(url => ({ url, isImage: true }));
          }
        } catch (e) {
          vant.showFailToast('获取会员专属档案失败，请确认链接有效');
        } finally {
          this.loading = false;
        }
      },
      isItemRewarded(key) {
        return !!(this.itemMap[key] && this.itemMap[key].rewarded);
      },
      appendTag(field, tag) {
        const cur = (this.form[field] || '').trim();
        if (!cur) {
          this.form[field] = tag;
        } else if (!cur.includes(tag)) {
          this.form[field] = cur + ' ' + tag;
        }
      },
      setFreq(val) {
        this.form.training_frequency = val;
      },
      async afterUpload(fileItem) {
        fileItem.status = 'uploading';
        fileItem.message = '上传中...';
        try {
          const res = await API.upload(fileItem.file);
          fileItem.status = 'done';
          fileItem.url = res.url;
          this.syncPhotos();
          vant.showToast('图片上传成功');
        } catch (e) {
          fileItem.status = 'failed';
          fileItem.message = '上传失败';
          vant.showToast(e.message || '上传失败');
        }
      },
      onDeletePhoto(file) {
        this.syncPhotos();
      },
      syncPhotos() {
        this.form.target_compare_photos = this.uploaderFileList
          .filter(f => f.status === 'done' || f.url)
          .map(f => f.url);
      },
      previewPhoto(idx) {
        vant.showImagePreview({
          images: this.form.target_compare_photos,
          startPosition: idx,
        });
      },
      async onSubmit() {
        this.syncPhotos();
        this.submitting = true;
        try {
          const payload = {
            ...this.form,
            initial_weight: this.form.initial_weight !== '' ? Number(this.form.initial_weight) : null,
            target_weight: this.form.target_weight !== '' ? Number(this.form.target_weight) : null,
          };
          const res = await API.post('/complete-profile-submit', payload);
          if (res) {
            this.rewardResult = {
              pointsGained: res.points_gained || 0,
              totalPoints: res.total_points || 0,
              msg: res.msg || '资料保存成功',
            };
            this.showRewardDialog = true;
            await this.loadData();
          }
        } catch (e) {
          vant.showToast(e.message || '保存失败');
        } finally {
          this.submitting = false;
        }
      },
      goToHome() {
        this.$router.push('/');
      },
    },
    template: `
    <div class="complete-profile-page" style="min-height:100vh;background:#f5f7f9;padding-bottom:80px">
      <!-- 顶部沉浸式导航栏 -->
      <van-nav-bar
        title="完善档案 · 领专属积分"
        left-arrow
        @click-left="$router.back()"
        style="--van-nav-bar-background:var(--brand);--van-nav-bar-title-text-color:#fff;--van-nav-bar-icon-color:#fff"
      >
        <template #right>
          <span style="color:#a7f3d0;font-size:13px" @click="goToHome">前往首页</span>
        </template>
      </van-nav-bar>

      <van-loading v-if="loading" style="text-align:center;padding:60px 0" vertical>正在加载会员专属档案...</van-loading>

      <div v-else style="padding:14px">
        <!-- 礼遇积分激励卡片 (极具质感的设计) -->
        <div style="background:linear-gradient(135deg, var(--brand) 0%, #15803d 100%);color:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 6px 16px rgba(var(--brand-rgb),0.22);margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:13px;opacity:0.85">尊贵会员</div>
              <div style="font-size:19px;font-weight:700;margin-top:2px">
                {{ vip.realname || vip.nickname || '3S会员' }}
                <span style="font-size:13px;font-weight:400;opacity:0.9;margin-left:6px">({{ vip.phone || '' }})</span>
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:12px;opacity:0.85">可用积分</div>
              <div style="font-size:22px;font-weight:800;color:#fde047">{{ vip.points || 0 }}</div>
            </div>
          </div>

          <div style="margin-top:14px;background:rgba(255,255,255,0.12);border-radius:10px;padding:10px 12px">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
              <span>🎁 完善档案专属奖励 (最高70分)</span>
              <span style="font-weight:700;color:#fde047">{{ earnedPoints }} / {{ maxPoints }} 分</span>
            </div>
            <van-progress :percentage="progressPercent" stroke-width="8" color="#fde047" track-color="rgba(255,255,255,0.2)" :show-pivot="false" />
            <div style="font-size:11px;opacity:0.85;margin-top:6px;display:flex;justify-content:space-between">
              <span>每填写一项奖 10 积分，已完成 {{ completedCount }} / {{ totalCount }} 项</span>
              <span v-if="earnedPoints < 70">还可再拿 {{ 70 - earnedPoints }} 积分</span>
              <span v-else style="color:#86efac;font-weight:700">✓ 全部奖励已领取</span>
            </div>
          </div>
        </div>

        <!-- 档案填写表单 -->
        <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04);margin-bottom:12px">
          <div style="padding:12px 16px 8px;font-size:14px;font-weight:700;color:var(--c-text);border-bottom:1px solid var(--c-bg-2);display:flex;align-items:center;justify-content:space-between">
            <span>基础信息</span>
            <span style="font-size:12px;color:var(--c-text-3);font-weight:400">核对您的个人基础资料</span>
          </div>
          <van-field v-model="form.realname" label="姓名" placeholder="您的真实姓名" />
          <van-field label="性别">
            <template #input>
              <van-radio-group v-model="form.gender" direction="horizontal">
                <van-radio :name="1">男</van-radio>
                <van-radio :name="2">女</van-radio>
              </van-radio-group>
            </template>
          </van-field>
        </div>

        <!-- 7 项积分档案内容 -->
        <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04);margin-bottom:12px">
          <div style="padding:12px 16px 8px;font-size:14px;font-weight:700;color:var(--c-text);border-bottom:1px solid var(--c-bg-2);display:flex;align-items:center;justify-content:space-between">
            <span>健康与目标档案</span>
            <van-tag type="success" plain>7项专享 · 满额70分</van-tag>
          </div>

          <!-- 1. 初始体重 -->
          <van-field v-model="form.initial_weight" type="number" label="初始体重" placeholder="入会时体重 (kg)">
            <template #extra>
              <van-tag v-if="isItemRewarded('initial_weight')" type="success" round>✓ 已领 10 分</van-tag>
              <van-tag v-else type="warning" plain round>+10 积分</van-tag>
            </template>
          </van-field>

          <!-- 2. 目标体重 -->
          <van-field v-model="form.target_weight" type="number" label="目标体重" placeholder="期望达到的体重 (kg)">
            <template #extra>
              <van-tag v-if="isItemRewarded('target_weight')" type="success" round>✓ 已领 10 分</van-tag>
              <van-tag v-else type="warning" plain round>+10 积分</van-tag>
            </template>
          </van-field>

          <!-- 3. 生日 -->
          <van-field label="生日">
            <template #input>
              <input type="date" v-model="form.birthday" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text);width:100%" />
            </template>
            <template #extra>
              <van-tag v-if="isItemRewarded('birthday')" type="success" round>✓ 已领 10 分</van-tag>
              <van-tag v-else type="warning" plain round>+10 积分</van-tag>
            </template>
          </van-field>

          <!-- 4. 星座 / MBTI -->
          <van-field v-model="form.constellation_mbti" label="星座/MBTI" placeholder="如 天秤座 / INTJ">
            <template #extra>
              <van-tag v-if="isItemRewarded('constellation_mbti')" type="success" round>✓ 已领 10 分</van-tag>
              <van-tag v-else type="warning" plain round>+10 积分</van-tag>
            </template>
          </van-field>
          <div style="padding:4px 16px 12px;background:var(--c-bg-2);border-bottom:1px solid var(--c-bg-2)">
            <div style="font-size:11px;color:var(--c-text-3);margin-bottom:6px">点击快捷填入星座与性格标签：</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">
              <van-tag v-for="c in ['白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手','摩羯','水瓶','双鱼']" :key="c" plain size="small" type="primary" style="cursor:pointer" @click="appendTag('constellation_mbti', c + '座')">{{ c }}</van-tag>
            </div>
            <div style="display:flex;gap:5px;flex-wrap:wrap">
              <van-tag v-for="m in ['INTJ','INFP','ENTP','ENFJ','ISTJ','ESFP','INFJ','ENTJ']" :key="m" plain size="small" style="cursor:pointer;color:var(--brand);border-color:#a7f3d0" @click="appendTag('constellation_mbti', m)">{{ m }}</van-tag>
            </div>
          </div>

          <!-- 5. 期望训练频次 -->
          <van-field v-model="form.training_frequency" label="训练频次" placeholder="如 每周3-4次">
            <template #extra>
              <van-tag v-if="isItemRewarded('training_frequency')" type="success" round>✓ 已领 10 分</van-tag>
              <van-tag v-else type="warning" plain round>+10 积分</van-tag>
            </template>
          </van-field>
          <div style="padding:4px 16px 12px;background:var(--c-bg-2);border-bottom:1px solid var(--c-bg-2)">
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <van-tag v-for="f in ['每周1-2次','每周3-4次','每周5次及以上','工作日每天']" :key="f" :type="form.training_frequency === f ? 'primary' : 'default'" plain size="medium" style="cursor:pointer" @click="setFreq(f)">{{ f }}</van-tag>
            </div>
          </div>

          <!-- 6. 身材目标对比图 -->
          <div style="padding:12px 16px;border-bottom:1px solid var(--c-bg-2)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-size:14px;color:var(--c-text);font-weight:500">身材目标对比照 (最多3张)</span>
              <van-tag v-if="isItemRewarded('target_compare_photos')" type="success" round>✓ 已领 10 分</van-tag>
              <van-tag v-else type="warning" plain round>+10 积分</van-tag>
            </div>
            <div style="font-size:12px;color:var(--c-text-3);margin-bottom:10px">上传您希望达到的身材范例或本人体型记录照片</div>
            <van-uploader
              v-model="uploaderFileList"
              :max-count="3"
              :after-read="afterUpload"
              @delete="onDeletePhoto"
              multiple
            />
          </div>

          <!-- 7. 对会馆建议与期待 -->
          <van-field
            v-model="form.studio_feedback"
            label="对会馆建议"
            type="textarea"
            rows="3"
            placeholder="您对3S运动中心的器材设备、环境卫生、私教指导或服务有任何期待与建议，请畅所欲言..."
            maxlength="200"
            show-word-limit
          >
            <template #extra>
              <van-tag v-if="isItemRewarded('studio_feedback')" type="success" round>✓ 已领 10 分</van-tag>
              <van-tag v-else type="warning" plain round>+10 积分</van-tag>
            </template>
          </van-field>
        </div>

        <div style="font-size:12px;color:var(--c-text-3);text-align:center;line-height:1.6;padding:8px 0">
          • 积分可用于兑换场馆饮品、专属体测或私教课程抵扣<br/>
          • 本链接为您的专属会员链接，无需重新输入账号密码
        </div>
      </div>

      <!-- 底部吸底操作栏 -->
      <div style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:10px 16px;box-shadow:0 -2px 10px rgba(0,0,0,0.06);display:flex;gap:12px;z-index:99;box-sizing:border-box">
        <van-button plain round style="flex:1;border-color:var(--brand);color:var(--brand)" @click="goToHome">进入会员中心</van-button>
        <van-button type="primary" round style="flex:2;background:var(--brand);border-color:var(--brand);font-weight:600" :loading="submitting" @click="onSubmit">
          保存并领取积分 🎁
        </van-button>
      </div>

      <!-- 奖励到账弹窗 -->
      <van-dialog v-model:show="showRewardDialog" :title="rewardResult.pointsGained > 0 ? '🎉 恭喜获得积分奖励！' : '资料保存成功'" show-cancel-button cancel-button-text="继续完善" confirm-button-text="前往首页体验" @confirm="goToHome">
        <div style="padding:18px 20px;text-align:center">
          <div v-if="rewardResult.pointsGained > 0">
            <div style="font-size:40px;margin-bottom:8px">🎁</div>
            <div style="font-size:18px;font-weight:700;color:var(--brand);margin-bottom:6px">
              本次获得 +{{ rewardResult.pointsGained }} 积分
            </div>
            <div style="font-size:14px;color:var(--c-text-2)">
              当前会员积分总额：<span style="color:#d97706;font-weight:700">{{ rewardResult.totalPoints }}</span> 分
            </div>
            <div style="margin-top:12px;font-size:12px;color:var(--c-text-3)">
              积分已即时计入您的会员账户，可随时在【我的】页面查看与消费抵扣。
            </div>
          </div>
          <div v-else>
            <div style="font-size:14px;color:#4b5563">您的档案资料已成功更新保存！</div>
            <div style="margin-top:8px;font-size:12px;color:var(--c-text-3)">当前可用积分：{{ rewardResult.totalPoints }} 分</div>
          </div>
        </div>
      </van-dialog>
    </div>
    `,
  };
})();
