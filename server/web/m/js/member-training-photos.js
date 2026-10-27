/* 会员端-「训练风采」专属相册 (SYS-13) */
(function () {
  window.Pages = window.Pages || {};

  window.Pages.MemberTrainingPhotos = {
    data() {
      return {
        loading: true,
        list: [],
        groups: [],
        currentMonth: '',
        currentMonthCount: 0,
        monthlyLimit: 5,
        remainingQuota: 5,
        totalCount: 0,

        // 上传弹窗
        showUpload: false,
        uploading: false,
        uploadFileList: [],
        uploadForm: {
          photo_url: '',
          photo_date: dayjs().format('YYYY-MM-DD'),
          remark: '',
        },

        // 详情查看弹窗
        showDetail: false,
        activePhoto: null,
        deleting: false,
      };
    },
    computed: {
      quotaPercent() {
        if (!this.monthlyLimit) return 0;
        return Math.min(100, Math.round((this.currentMonthCount / this.monthlyLimit) * 100));
      },
    },
    async mounted() {
      await this.loadData();
    },
    methods: {
      async loadData() {
        this.loading = true;
        try {
          const res = await API.get('/member/training-photos');
          if (res) {
            this.list = res.list || [];
            this.groups = res.groups || [];
            this.currentMonth = res.current_month || dayjs().format('YYYY-MM');
            this.currentMonthCount = res.current_month_count || 0;
            this.monthlyLimit = res.monthly_limit || 5;
            this.remainingQuota = res.remaining_quota != null ? res.remaining_quota : 5;
            this.totalCount = res.total_count || 0;
          }
        } catch (e) {
          vant.showToast(e.message || '加载相册失败');
        } finally {
          this.loading = false;
        }
      },
      openUploadModal() {
        if (this.remainingQuota <= 0) {
          return vant.showDialog({
            title: '本月额度已满',
            message: '您本月已上传 5 张训练风采照片（达到自然月上限）。下月1日将自动恢复 5 张额度！',
            confirmButtonText: '我知道了',
            confirmButtonColor: 'var(--brand)',
          });
        }
        this.uploadFileList = [];
        this.uploadForm = {
          photo_url: '',
          photo_date: dayjs().format('YYYY-MM-DD'),
          remark: '',
        };
        this.showUpload = true;
      },
      async afterUpload(fileItem) {
        fileItem.status = 'uploading';
        fileItem.message = '上传中...';
        try {
          const res = await API.upload(fileItem.file);
          fileItem.status = 'done';
          fileItem.url = res.url;
          this.uploadForm.photo_url = res.url;
          vant.showToast('图片上传成功');
        } catch (e) {
          fileItem.status = 'failed';
          fileItem.message = '上传失败';
          vant.showToast(e.message || '图片上传失败');
        }
      },
      async submitUpload() {
        if (!this.uploadForm.photo_url) {
          return vant.showToast('请先选择或拍摄训练照片');
        }
        this.uploading = true;
        try {
          await API.post('/member/training-photos', this.uploadForm);
          vant.showToast({ message: '上传成功！已收入风采相册', icon: 'success' });
          this.showUpload = false;
          await this.loadData();
        } catch (e) {
          vant.showToast(e.message || '提交失败');
        } finally {
          this.uploading = false;
        }
      },
      viewPhoto(photo) {
        this.activePhoto = photo;
        this.showDetail = true;
      },
      previewAll(startPhoto) {
        const urls = this.list.map(p => p.photo_url);
        const idx = this.list.findIndex(p => p.id === startPhoto.id);
        vant.showImagePreview({
          images: urls,
          startPosition: Math.max(0, idx),
        });
      },
      async deletePhoto(photo) {
        try {
          await vant.showConfirmDialog({
            title: '删除照片',
            message: '确定要删除这张训练风采照片吗？',
            confirmButtonText: '确定删除',
            confirmButtonColor: 'var(--danger)',
          });
        } catch {
          return;
        }

        this.deleting = true;
        try {
          await API.del('/member/training-photos/' + photo.id);
          vant.showToast({ message: '照片已删除', icon: 'success' });
          this.showDetail = false;
          await this.loadData();
        } catch (e) {
          vant.showToast(e.message || '删除失败');
        } finally {
          this.deleting = false;
        }
      },
      formatDate(d) {
        return d ? dayjs(d).format('YYYY-MM-DD') : '';
      },
    },
    template: `
    <div class="page training-photos-page" style="min-height:100vh;background:var(--c-bg);padding-bottom:50px">
      <!-- 顶部导航 -->
      <van-nav-bar
        title="训练风采"
        left-arrow
        @click-left="$router.back()"
      >
        <template #right>
          <span style="color:var(--c-title);font-size:14px;font-weight:600" @click="openUploadModal">
            + 上传照片
          </span>
        </template>
      </van-nav-bar>

      <div style="padding:14px">
        <!-- 每月限额与成长激励卡片 -->
        <div style="background:var(--brand);color:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 6px 16px rgba(var(--brand-rgb),0.22);margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:17px;font-weight:700">📸 训练风采专属相册</div>
              <div style="font-size:12px;opacity:0.85;margin-top:3px">每月限5张 · 见证身体与体能的蜕变</div>
            </div>
            <div style="text-align:right">
              <van-tag :type="remainingQuota > 0 ? 'success' : 'warning'" round size="medium">
                {{ remainingQuota > 0 ? '还可上传 ' + remainingQuota + ' 张' : '本月额度已满' }}
              </van-tag>
            </div>
          </div>

          <!-- 额度进度条 -->
          <div style="margin-top:14px;background:rgba(255,255,255,0.12);border-radius:10px;padding:10px 12px">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
              <span>本月额度使用 ({{ currentMonth }})</span>
              <span style="font-weight:700;color:#fff">{{ currentMonthCount }} / {{ monthlyLimit }} 张</span>
            </div>
            <van-progress :percentage="quotaPercent" stroke-width="8" color="#fff" track-color="rgba(255,255,255,0.2)" :show-pivot="false" />
            <div style="font-size:11px;opacity:0.8;margin-top:6px;display:flex;justify-content:space-between">
              <span>累计已收录 {{ totalCount }} 张蜕变瞬间</span>
              <span>次月1日额度自动重置</span>
            </div>
          </div>
        </div>

        <van-loading v-if="loading" style="text-align:center;padding:50px 0" vertical>正在加载相册...</van-loading>

        <!-- 空状态 -->
        <div v-else-if="!list.length" style="background:#fff;border-radius:12px;padding:40px 16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
          <div style="font-size:44px;margin-bottom:10px">🏋️‍♂️</div>
          <div style="font-size:15px;font-weight:600;color:var(--c-text);margin-bottom:4px">还没有训练风采照片</div>
          <div style="font-size:12px;color:var(--c-text-3);margin-bottom:18px">记录每一次暴汗打卡，留住最好的自己</div>
          <van-button type="primary" round style="background:var(--brand);border-color:var(--brand);padding:0 24px" @click="openUploadModal">
            立即上传首张照片
          </van-button>
        </div>

        <!-- 按月份分组的照片瀑布画廊 -->
        <div v-else>
          <div v-for="g in groups" :key="g.month_key" style="margin-bottom:18px">
            <!-- 月份组标题 -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding:0 4px">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:15px;font-weight:700;color:var(--c-title)">{{ g.label }}</span>
                <van-tag type="primary" plain round size="small">{{ g.count }} 张</van-tag>
              </div>
              <span v-if="g.month_key === currentMonth" style="font-size:11px;color:var(--brand);font-weight:500">本月</span>
            </div>

            <!-- 照片网格 (2列瀑布质感布局) -->
            <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:10px">
              <div
                v-for="p in g.photos"
                :key="p.id"
                style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.06);display:flex;flex-direction:column;cursor:pointer"
                @click="viewPhoto(p)"
              >
                <!-- 照片封面 -->
                <div style="position:relative;width:100%;padding-top:100%;background:var(--c-line)">
                  <img
                    :src="p.photo_url"
                    style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover"
                    loading="lazy"
                  />
                  <!-- 日期水印角标 -->
                  <div style="position:absolute;bottom:6px;left:6px;background:rgba(0,0,0,0.55);color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;backdrop-filter:blur(2px)">
                    {{ formatDate(p.photo_date) }}
                  </div>
                </div>

                <!-- 备注/心得文字 -->
                <div style="padding:8px 10px;flex:1;display:flex;flex-direction:column;justify-content:space-between">
                  <div style="font-size:12px;color:var(--c-text);line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">
                    {{ p.remark || '训练打卡记录' }}
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
                    <span style="font-size:10px;color:var(--c-text-3)">{{ p.month_key }}</span>
                    <van-icon name="arrow" size="12" color="var(--c-text-3)" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 上传弹窗 -->
      <van-popup v-model:show="showUpload" position="bottom" round safe-area-inset-bottom>
        <div style="padding:20px 16px 24px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-size:16px;font-weight:700">上传训练风采照片</div>
            <van-tag type="success" plain round>本月还可上传 {{ remainingQuota }} 张</van-tag>
          </div>

          <div style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">
            记录健身蜕变历程（单月限5张，支持展示于专属相册流）。
          </div>

          <!-- 图片上传器 -->
          <div style="padding:8px 0 12px">
            <div style="font-size:13px;color:var(--c-text);font-weight:600;margin-bottom:8px">照片 (必填)</div>
            <van-uploader
              v-model="uploadFileList"
              :max-count="1"
              :after-read="afterUpload"
              upload-text="拍照/选图"
            />
          </div>

          <!-- 拍摄/记录日期 -->
          <van-field label="记录日期">
            <template #input>
              <input type="date" v-model="uploadForm.photo_date" style="border:none;outline:none;background:transparent;font-size:14px;color:var(--c-text);width:100%" />
            </template>
          </van-field>

          <!-- 训练心得/备注 -->
          <van-field
            v-model="uploadForm.remark"
            label="训练心得"
            type="textarea"
            rows="2"
            maxlength="100"
            show-word-limit
            placeholder="写下今天的训练成就或心得随笔（如：深蹲50kg打卡、核心突破等）"
            style="margin-bottom:14px"
          />

          <div style="display:flex;gap:10px;margin-top:10px">
            <van-button plain round block @click="showUpload=false" style="flex:1">取消</van-button>
            <van-button type="primary" round block :loading="uploading" style="flex:2;background:var(--brand);border-color:var(--brand)" @click="submitUpload">
              发布到相册 📸
            </van-button>
          </div>
        </div>
      </van-popup>

      <!-- 照片详情与操作弹窗 -->
      <van-dialog
        v-model:show="showDetail"
        :title="activePhoto ? formatDate(activePhoto.photo_date) + ' 训练记录' : '照片详情'"
        show-cancel-button
        cancel-button-text="大图预览"
        confirm-button-text="关闭"
        @cancel="previewAll(activePhoto)"
      >
        <div v-if="activePhoto" style="padding:14px 18px">
          <div style="border-radius:10px;overflow:hidden;margin-bottom:12px;background:#000;text-align:center" @click="previewAll(activePhoto)">
            <img :src="activePhoto.photo_url" style="max-width:100%;max-height:280px;object-fit:contain;vertical-align:middle" />
          </div>

          <div style="background:var(--c-bg-2);border-radius:8px;padding:10px 12px;margin-bottom:12px">
            <div style="font-size:13px;font-weight:600;color:var(--c-text);margin-bottom:4px">心得随笔：</div>
            <div style="font-size:13px;color:var(--c-text-2);line-height:1.5">
              {{ activePhoto.remark || '暂未填写训练心得' }}
            </div>
            <div style="font-size:11px;color:var(--c-text-3);margin-top:6px">
              记录日期：{{ formatDate(activePhoto.photo_date) }} · 归属月份：{{ activePhoto.month_key }}
            </div>
          </div>

          <div style="text-align:right">
            <van-button size="small" type="danger" plain round :loading="deleting" @click="deletePhoto(activePhoto)">
              <van-icon name="delete-o" /> 删除此照片
            </van-button>
          </div>
        </div>
      </van-dialog>
    </div>
    `,
  };
})();
