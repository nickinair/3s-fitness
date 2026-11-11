#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成《3S-fitness 健身连锁加盟战略规划与模式设计建议书》配套全套高精架构图（优化拓扑版）
"""

import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
import matplotlib.patches as patches

# 字体配置 (macOS 系统华文黑体)
FONT_PATH = '/System/Library/Fonts/STHeiti Medium.ttc'
FONT_TITLE = FontProperties(fname=FONT_PATH, size=13, weight='bold')
FONT_SUBTITLE = FontProperties(fname=FONT_PATH, size=10, weight='bold')
FONT_BODY = FontProperties(fname=FONT_PATH, size=9)
FONT_SM = FontProperties(fname=FONT_PATH, size=8)

OUTPUT_DIR = '/Users/nickni/Desktop/fitness-app/scratch/diagrams'
os.makedirs(OUTPUT_DIR, exist_ok=True)

def draw_card(ax, x, y, w, h, bg_color, border_color='#CBD5E1', border_width=1.2, radius=0.08):
    """绘制高质感圆角卡片"""
    box = patches.FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0.02,rounding_size={radius}",
        fc=bg_color, ec=border_color, lw=border_width, zorder=2
    )
    ax.add_patch(box)
    return box

def draw_arrow(ax, x1, y1, x2, y2, color='#64748B', lw=1.5, style='->'):
    """绘制连线箭头"""
    ax.annotate(
        '', xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(arrowstyle=style, color=color, lw=lw, shrinkA=4, shrinkB=4, mutation_scale=12),
        zorder=3
    )

# =========================================================================
# 架构图 1：商业定位与模式解构矩阵图
# =========================================================================
def generate_diagram_1():
    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.2)
    ax.axis('off')

    draw_card(ax, 0.2, 0.2, 9.6, 4.8, '#F8FAFC', '#E2E8F0', border_width=1)
    ax.text(5.0, 4.65, '图 1-1：健身行业三大商业模式对比与 3S-fitness 差异化破局定位',
            fontproperties=FONT_TITLE, color='#0F172A', ha='center', va='center')

    # 左侧：传统大型俱乐部
    draw_card(ax, 0.6, 0.6, 2.7, 3.7, '#FFFFFF', '#CBD5E1')
    draw_card(ax, 0.6, 3.7, 2.7, 0.6, '#EF4444', '#DC2626')
    ax.text(1.95, 4.0, '传统综合俱乐部\n(威尔仕/一兆韦德类)', fontproperties=FONT_SUBTITLE, color='#FFFFFF', ha='center', va='center')
    t1 = [
        "• 体量：1000-3000㎡ (重资产)",
        "• 盈利核：年卡预售 + 资金沉淀",
        "• 痛点：高租金、高固定人力",
        "• 销售：高压逼单销售、骚扰多",
        "• 结局：退卡挤兑易暴雷跑路"
    ]
    for idx, txt in enumerate(t1):
        ax.text(0.8, 3.25 - idx*0.55, txt, fontproperties=FONT_BODY, color='#334155', va='center')

    # 中间：低端私教工作室
    draw_card(ax, 3.65, 0.6, 2.7, 3.7, '#FFFFFF', '#CBD5E1')
    draw_card(ax, 3.65, 3.7, 2.7, 0.6, '#F59E0B', '#D97706')
    ax.text(5.0, 4.0, '低端私教工作室\n(中田健身等平价模式)', fontproperties=FONT_SUBTITLE, color='#FFFFFF', ha='center', va='center')
    t2 = [
        "• 体量：120-180㎡ (轻资产)",
        "• 定价：150-200元/节 (偏低)",
        "• 优势：教练包店、无推销、保本低",
        "• 瓶颈：环境简陋、靠体力堆单",
        "• 隐患：单店流水低、易被山寨"
    ]
    for idx, txt in enumerate(t2):
        ax.text(3.85, 3.25 - idx*0.55, txt, fontproperties=FONT_BODY, color='#334155', va='center')

    # 右侧：3S-fitness 破局定位
    draw_card(ax, 6.7, 0.6, 2.7, 3.7, '#EFF6FF', '#2563EB', border_width=2)
    draw_card(ax, 6.7, 3.7, 2.7, 0.6, '#1E3A8A', '#1E3A8A')
    ax.text(8.05, 4.0, '3S-fitness 破局模式\n(品质精品工作室+SaaS)', fontproperties=FONT_SUBTITLE, color='#FFFFFF', ha='center', va='center')
    t3 = [
        "★ 空间：180-260㎡ 精品现代轻奢",
        "★ 客单：300-450元/节 (中高端)",
        "★ 课程：1v1私教 + 4-6人小班课",
        "★ 机制：金牌店长合伙 + 超额分红",
        "★ 护城河：自研四端SaaS双向核销"
    ]
    for idx, txt in enumerate(t3):
        ax.text(6.9, 3.25 - idx*0.55, txt, fontproperties=FONT_SUBTITLE, color='#1E3A8A', va='center')

    path = os.path.join(OUTPUT_DIR, 'arch_1_positioning.png')
    plt.savefig(path, bbox_inches='tight')
    plt.close()
    print("Generated:", path)

# =========================================================================
# 架构图 2：标准化复制五大核心底座架构图 (SOP全景图)
# =========================================================================
def generate_diagram_2():
    fig, ax = plt.subplots(figsize=(10, 5.0), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.0)
    ax.axis('off')

    draw_card(ax, 0.2, 0.2, 9.6, 4.6, '#F8FAFC', '#E2E8F0', border_width=1)
    ax.text(5.0, 4.45, '图 2-1：3S-fitness 连锁复制五大标准化底座（SOP 体系全景图）',
            fontproperties=FONT_TITLE, color='#0F172A', ha='center', va='center')

    modules = [
        ("1. 选址营建底座", "#2563EB", [
            "• 1.5km 优质客群画像",
            "• 租金比 ≤ 22% 警戒线",
            "• 模块化 SI 工艺手册",
            "• 核心器械总部集采"
        ]),
        ("2. 人才认证底座", "#059669", [
            "• 3S 学院 4 阶认证考评",
            "• 理论实操双 90 分准入",
            "• 专属系统工号权限鉴权",
            "• 金牌店长管培体系"
        ]),
        ("3. 服务交付底座", "#0284C7", [
            "• 体验课 60min 标准动线",
            "• 训练数据移动端即时留痕",
            "• 耗卡达 60% 续约预警",
            "• 月度会员健康复测"
        ]),
        ("4. 销售转化底座", "#D97706", [
            "• 顾问式咨询痛点深挖",
            "• 全线卡种后台明码标价",
            "• 严禁私下打折与赠课",
            "• 手机手写电子合同签约"
        ]),
        ("5. 财务风控底座", "#7C3AED", [
            "• 预收 vs 耗卡双轨分立",
            "• 资金进入共管监管专户",
            "• 仅按耗卡营业收入分红",
            "• 移动端实时查看对账单"
        ])
    ]

    for i, (title, color, items) in enumerate(modules):
        x = 0.5 + i * 1.84
        draw_card(ax, x, 1.4, 1.74, 2.7, '#FFFFFF', '#CBD5E1')
        draw_card(ax, x, 3.6, 1.74, 0.5, color, color)
        ax.text(x + 0.87, 3.85, title, fontproperties=FONT_SUBTITLE, color='#FFFFFF', ha='center', va='center')
        for j, it in enumerate(items):
            ax.text(x + 0.1, 3.25 - j * 0.46, it, fontproperties=FONT_SM, color='#334155', va='center')

    draw_card(ax, 0.5, 0.5, 9.0, 0.65, '#1E3A8A', '#1E3A8A')
    ax.text(5.0, 0.82, '底层数字化支撑平台：3S 自研四端 SaaS（会员端 · 员工端 · 门店管理后台 · 平台总控大盘）',
            fontproperties=FONT_SUBTITLE, color='#FFFFFF', ha='center', va='center')

    path = os.path.join(OUTPUT_DIR, 'arch_2_sop_pillars.png')
    plt.savefig(path, bbox_inches='tight')
    plt.close()
    print("Generated:", path)

# =========================================================================
# 架构图 3：单店合伙机制与超额利润分成架构图
# =========================================================================
def generate_diagram_3():
    fig, ax = plt.subplots(figsize=(10, 5.2), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.2)
    ax.axis('off')

    draw_card(ax, 0.2, 0.2, 9.6, 4.8, '#F8FAFC', '#E2E8F0', border_width=1)
    ax.text(5.0, 4.65, '图 3-1：3S-fitness 单店合伙人股权架构与月度超额分红模型图',
            fontproperties=FONT_TITLE, color='#0F172A', ha='center', va='center')

    draw_card(ax, 0.8, 3.4, 3.8, 0.9, '#FFFFFF', '#2563EB', border_width=1.5)
    ax.text(2.7, 3.95, '总部 / 财务投资人 (出资 70%)', fontproperties=FONT_SUBTITLE, color='#1E3A8A', ha='center', va='center')
    ax.text(2.7, 3.65, '出资约 30 万元 · 享有股权分红 60%', fontproperties=FONT_BODY, color='#64748B', ha='center', va='center')

    draw_card(ax, 5.4, 3.4, 3.8, 0.9, '#EFF6FF', '#1E3A8A', border_width=1.5)
    ax.text(7.3, 3.95, '店长合伙人 (出资 30% + 技术管理)', fontproperties=FONT_SUBTITLE, color='#1E3A8A', ha='center', va='center')
    ax.text(7.3, 3.65, '出资约 13 万元 · 享有经营超额分红 40%', fontproperties=FONT_BODY, color='#059669', ha='center', va='center')

    draw_card(ax, 2.0, 2.15, 6.0, 0.85, '#FFFFFF', '#CBD5E1')
    ax.text(5.0, 2.65, '月度实际耗卡营业收入：115,200 元 (100%)', fontproperties=FONT_SUBTITLE, color='#0F172A', ha='center', va='center')
    ax.text(5.0, 2.35, '扣除：房租水电2.75万 + 员工底薪1.0万 + 提成4.03万 + 推广0.4万 + 管理费(4%)0.56万',
            fontproperties=FONT_SM, color='#64748B', ha='center', va='center')

    draw_arrow(ax, 2.7, 3.4, 4.0, 3.0)
    draw_arrow(ax, 7.3, 3.4, 6.0, 3.0)
    draw_arrow(ax, 5.0, 2.15, 5.0, 1.7)

    draw_card(ax, 2.5, 0.6, 5.0, 0.95, '#ECFDF5', '#10B981', border_width=1.5)
    ax.text(5.0, 1.25, '门店月度经营净利润池：25,772 元 (净利率 22.4%)', fontproperties=FONT_SUBTITLE, color='#065F46', ha='center', va='center')
    ax.text(5.0, 0.88, '严格基于当期已交付消课净收益分红，绝不触碰未耗卡预收款！', fontproperties=FONT_SM, color='#047857', ha='center', va='center')

    draw_card(ax, 0.6, 0.6, 1.7, 1.1, '#F1F5F9', '#CBD5E1')
    ax.text(1.45, 1.35, '投资人分红', fontproperties=FONT_SM, color='#475569', ha='center', va='center', weight='bold')
    ax.text(1.45, 1.05, '15,472 元/月', fontproperties=FONT_SUBTITLE, color='#1E3A8A', ha='center', va='center')
    ax.text(1.45, 0.78, '年化收益 18.6万', fontproperties=FONT_SM, color='#64748B', ha='center', va='center')
    draw_arrow(ax, 2.5, 1.1, 2.3, 1.1)

    draw_card(ax, 7.7, 0.6, 1.7, 1.1, '#EFF6FF', '#2563EB')
    ax.text(8.55, 1.35, '店长合伙人月收', fontproperties=FONT_SM, color='#2563EB', ha='center', va='center', weight='bold')
    ax.text(8.55, 1.05, '24,800 元/月', fontproperties=FONT_SUBTITLE, color='#DC2626', ha='center', va='center')
    ax.text(8.55, 0.78, '底薪+课提+分红', fontproperties=FONT_SM, color='#1E3A8A', ha='center', va='center')
    draw_arrow(ax, 7.5, 1.1, 7.7, 1.1)

    path = os.path.join(OUTPUT_DIR, 'arch_3_financial_model.png')
    plt.savefig(path, bbox_inches='tight')
    plt.close()
    print("Generated:", path)

# =========================================================================
# 架构图 4：总部-门店赋能与管控拓扑图 (Topology)
# =========================================================================
def generate_diagram_4():
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.5)
    ax.axis('off')

    draw_card(ax, 0.2, 0.2, 9.6, 5.1, '#F8FAFC', '#E2E8F0', border_width=1)
    ax.text(5.0, 5.0, '图 4-1：3S-fitness 总部-门店赋能与管控拓扑图 (人·财·物·流与数据闭环)',
            fontproperties=FONT_TITLE, color='#0F172A', ha='center', va='center')

    # 1. 顶部：总部赋能与管控大脑 (4个中心)
    draw_card(ax, 0.6, 3.8, 8.8, 0.9, '#1E3A8A', '#1E3A8A')
    ax.text(5.0, 4.45, '【3S-fitness 品牌总部赋能与管控大脑】', fontproperties=FONT_SUBTITLE, color='#FFFFFF', ha='center', va='center')
    
    hq_sub = [
        ("流量中台 (公域投放/线索派单)", 1.7),
        ("3S学院 (人才输送/课程研发)", 3.9),
        ("供应链部 (设备集采/SI工程)", 6.1),
        ("督导风控部 (财务审计/稽查清退)", 8.3)
    ]
    for name, cx in hq_sub:
        ax.text(cx, 4.05, name, fontproperties=FONT_SM, color='#E2E8F0', ha='center', va='center', weight='bold')

    # 2. 中上：下行生产要素强赋能通道 (4根柱子)
    down_items = [
        ("【流】大众点评/抖音线索\n15分钟智能就近派单", 0.6, '#EFF6FF', '#3B82F6'),
        ("【人】认证教练轮训输送\n+ 季度专项新课包", 2.85, '#ECFDF5', '#10B981'),
        ("【物】核心器械厂家集采\n(成本降15%) + SI落地", 5.1, '#FEF3C7', '#F59E0B'),
        ("【法】自研SaaS四端授权\n+ 5大标准运营SOP", 7.35, '#F5F3FF', '#8B5CF6')
    ]
    for text, x, bg, border in down_items:
        draw_card(ax, x, 2.7, 2.05, 0.85, bg, border, border_width=1.2)
        ax.text(x + 1.025, 3.12, text, fontproperties=FONT_SM, color='#1E293B', ha='center', va='center', weight='bold')
        draw_arrow(ax, x + 1.025, 3.8, x + 1.025, 3.55, color='#2563EB', lw=1.5)
        draw_arrow(ax, x + 1.025, 2.7, x + 1.025, 2.45, color='#2563EB', lw=1.5)

    # 3. 中下：单店终端交付实体
    draw_card(ax, 0.6, 1.5, 5.8, 0.95, '#FFFFFF', '#1E3A8A', border_width=1.8)
    ax.text(3.5, 2.15, '【单店交付终端 (合伙门店)】金牌店长 + 教练组 + 200㎡精致空间',
            fontproperties=FONT_SUBTITLE, color='#1E3A8A', ha='center', va='center')
    ax.text(3.5, 1.75, '日常业务闭环：会员扫码进门 -> 移动手写合同 -> 教练发起消课 -> 学员手机确认 -> 自动扣减',
            fontproperties=FONT_SM, color='#475569', ha='center', va='center')

    # 4. 右侧：上行数据穿透与强监控节点
    draw_card(ax, 6.7, 1.25, 2.7, 1.2, '#FEF2F2', '#EF4444', border_width=1.5)
    ax.text(8.05, 2.2, '【上行数据监控节点】', fontproperties=FONT_SUBTITLE, color='#991B1B', ha='center', va='center')
    t_up = [
        "• 业务闭环：双向核销数据",
        "• 资金穿透：预收共管清分",
        "• 质检反馈：400客诉/NPS",
        "• 巡查审计：神秘客暗访"
    ]
    for idx, txt in enumerate(t_up):
        ax.text(6.85, 1.88 - idx*0.22, txt, fontproperties=FONT_SM, color='#7F1D1D', va='center')
    
    draw_arrow(ax, 6.4, 1.95, 6.7, 1.95, color='#EF4444', lw=1.5)
    draw_arrow(ax, 8.05, 2.45, 8.05, 3.8, color='#EF4444', lw=1.5)

    # 5. 底部：动态评级与清退治理闭环
    draw_card(ax, 0.6, 0.45, 8.8, 0.75, '#FFFFFF', '#64748B', border_width=1.2)
    ax.text(1.8, 0.82, '【动态评级治理闭环】', fontproperties=FONT_SUBTITLE, color='#0F172A', ha='center', va='center')
    
    r_items = [
        ("A级店 (≥90分)：管理费返还 0.5% + 优先开新店", 4.0, '#065F46'),
        ("C级店 (60-74分)：亮黄牌 + 督导驻店整改14天", 6.2, '#B45309'),
        ("D级店 (<60分)：折旧回购 / 强制清退", 8.2, '#B91C1C')
    ]
    for text, cx, col in r_items:
        ax.text(cx, 0.82, text, fontproperties=FONT_SM, color=col, ha='center', va='center', weight='bold')

    path = os.path.join(OUTPUT_DIR, 'arch_4_saas_governance.png')
    plt.savefig(path, bbox_inches='tight')
    plt.close()
    print("Generated (Enhanced Topology):", path)

# =========================================================================
# 架构图 5：连锁扩张三阶段路线图 (Roadmap)
# =========================================================================
def generate_diagram_5():
    fig, ax = plt.subplots(figsize=(10, 4.8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.8)
    ax.axis('off')

    draw_card(ax, 0.2, 0.2, 9.6, 4.4, '#F8FAFC', '#E2E8F0', border_width=1)
    ax.text(5.0, 4.25, '图 5-1：3S-fitness 连锁化扩张发展路线图（0-1-10-50 演进蓝图）',
            fontproperties=FONT_TITLE, color='#0F172A', ha='center', va='center')

    phases = [
        ("阶段一：黄埔军校打样期", "前 1 - 6 个月 (0-1)", "#2563EB", [
            "• 两家直营店全面推行电子合同",
            "• 输出全套 5 大标准化 SOP 手册",
            "• 培养孵化首批 2 名准店长合伙人",
            "• 7:3 内部合伙开设第 3 家样板店",
            "• 跑通分账与多端 SaaS 运转闭环"
        ]),
        ("阶段二：同城蜂窝加密期", "第 7 - 18 个月 (1-10)", "#059669", [
            "• 同城以 2.5-3.5km 网格加密布局",
            "• 开出 8 - 10 家高标准合伙店",
            "• 本地生活公域投放集约化，降获客成本",
            "• 建立区域督导制度与流动巡访",
            "• 实现同城区域第一品牌认知心智"
        ]),
        ("阶段三：跨区域成网期", "第 19 - 36 个月 (10-50)", "#7C3AED", [
            "• 进军周边核心二线与省会城市",
            "• 开放外部财务资本联营托管",
            "• 设备器械供应链完全实现规模集采",
            "• 3S 学院独立公司化，源源不断输送人才",
            "• 完成商务部特许经营备案，冲刺资本化"
        ])
    ]

    for i, (title, sub, color, items) in enumerate(phases):
        x = 0.6 + i * 3.0
        draw_card(ax, x, 0.5, 2.8, 3.2, '#FFFFFF', '#CBD5E1')
        draw_card(ax, x, 3.1, 2.8, 0.6, color, color)
        ax.text(x + 1.4, 3.5, title, fontproperties=FONT_SUBTITLE, color='#FFFFFF', ha='center', va='center')
        ax.text(x + 1.4, 3.25, sub, fontproperties=FONT_SM, color='#FFFFFF', ha='center', va='center')
        for j, it in enumerate(items):
            ax.text(x + 0.15, 2.75 - j * 0.44, it, fontproperties=FONT_BODY, color='#334155', va='center')
        if i < 2:
            draw_arrow(ax, x + 2.85, 2.1, x + 3.0, 2.1, color='#94A3B8', lw=2.0)

    path = os.path.join(OUTPUT_DIR, 'arch_5_roadmap.png')
    plt.savefig(path, bbox_inches='tight')
    plt.close()
    print("Generated:", path)

# =========================================================================
# 架构图 6：单店有限合伙企业（LLP）合规法律架构图
# =========================================================================
def generate_diagram_6():
    fig, ax = plt.subplots(figsize=(10, 4.8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4.8)
    ax.axis('off')

    draw_card(ax, 0.2, 0.2, 9.6, 4.4, '#F8FAFC', '#E2E8F0', border_width=1)
    ax.text(5.0, 4.25, '图 6-1：0-10 阶段单店有限合伙企业（LLP）合规法律与治理架构图',
            fontproperties=FONT_TITLE, color='#0F172A', ha='center', va='center')

    draw_card(ax, 3.2, 1.7, 3.6, 1.8, '#FFFFFF', '#1E3A8A', border_width=2)
    ax.text(5.0, 3.15, '【单店有限合伙企业 (LLP)】', fontproperties=FONT_SUBTITLE, color='#1E3A8A', ha='center', va='center')
    ax.text(5.0, 2.8, '如：某市某区三埃斯健身服务合伙企业', fontproperties=FONT_SM, color='#64748B', ha='center', va='center')
    ax.text(5.0, 2.35, '• 独立报税 · 独立核算 · 闭环运营\n• 规避未满 1 年直营的特许经营行政壁垒\n• 总部全流程 SaaS 穿透管理',
            fontproperties=FONT_SM, color='#334155', ha='center', va='center')

    draw_card(ax, 0.6, 1.7, 2.2, 1.8, '#EFF6FF', '#2563EB', border_width=1.5)
    ax.text(1.7, 3.2, '普通合伙人 (GP)\n【3S 品牌总部】', fontproperties=FONT_SUBTITLE, color='#1E3A8A', ha='center', va='center')
    t_gp = [
        "• 股权出资：1%",
        "• 行使 100% 经营决策权",
        "• 负责输出品牌、SOP与系统",
        "• 人事任免与资金监管权"
    ]
    for i, it in enumerate(t_gp):
        ax.text(0.75, 2.65 - i*0.28, it, fontproperties=FONT_SM, color='#334155', va='center')

    draw_card(ax, 7.2, 1.7, 2.2, 1.8, '#F0FDF4', '#16A34A', border_width=1.5)
    ax.text(8.3, 3.2, '有限合伙人 (LP)\n【店长 / 财务投资人】', fontproperties=FONT_SUBTITLE, color='#166534', ha='center', va='center')
    t_lp = [
        "• 股权出资：99%",
        "• 享有绝大部分利润分红权",
        "• 不干涉日常经营决策",
        "• 承担有限财产责任"
    ]
    for i, it in enumerate(t_lp):
        ax.text(7.35, 2.65 - i*0.28, it, fontproperties=FONT_SM, color='#334155', va='center')

    draw_arrow(ax, 2.8, 2.6, 3.2, 2.6, lw=2, color='#2563EB')
    draw_arrow(ax, 7.2, 2.6, 6.8, 2.6, lw=2, color='#16A34A')

    draw_card(ax, 1.0, 0.45, 8.0, 0.85, '#FEF3C7', '#D97706', border_width=1.2)
    ax.text(5.0, 0.95, '【法务合规平滑过渡战略】', fontproperties=FONT_SUBTITLE, color='#92400E', ha='center', va='center')
    ax.text(5.0, 0.65, '前期通过有限合伙企业（LLP）设立单店；待两家直营店满 1 年后，总部迅速推进商务部特许经营备案，向正规特许经营全面升级！',
            fontproperties=FONT_SM, color='#78350F', ha='center', va='center')

    path = os.path.join(OUTPUT_DIR, 'arch_6_legal_llp.png')
    plt.savefig(path, bbox_inches='tight')
    plt.close()
    print("Generated:", path)

if __name__ == '__main__':
    generate_diagram_1()
    generate_diagram_2()
    generate_diagram_3()
    generate_diagram_4()
    generate_diagram_5()
    generate_diagram_6()
    print("All 6 architecture diagrams generated successfully!")
