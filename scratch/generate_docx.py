#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成《3S-fitness 健身连锁加盟战略规划与模式设计建议书》Word 文档（v1.2 增强版）
包含全套高精架构图、三种加盟模式横向对比表及未来 90 天行动看板
"""

import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

DIAGRAM_DIR = '/Users/nickni/Desktop/fitness-app/scratch/diagrams'

def set_cell_background(cell, hex_color):
    """设置单元格背景颜色"""
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=140, bottom=140, left=180, right=180):
    """设置单元格内边距 (单位 dxa, 20 dxa = 1 pt)"""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'''
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{left}" w:type="dxa"/>
            <w:right w:w="{right}" w:type="dxa"/>
        </w:tcMar>
    ''')
    tcPr.append(tcMar)

def set_table_borders(table, color="CBD5E1", sz="6", val="single"):
    """为表格设置优雅的灰色细边框"""
    tblPr = table._tbl.tblPr
    borders = parse_xml(f'''
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:left w:val="none"/>
            <w:right w:val="none"/>
            <w:insideH w:val="{val}" w:sz="{sz}" w:space="0" w:color="{color}"/>
            <w:insideV w:val="none"/>
        </w:tblBorders>
    ''')
    tblPr.append(borders)

def add_callout(doc, text_list, title="战略提示 / 核心指引"):
    """添加高亮提示框（左侧粗边框、浅色背景）"""
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    
    cell = tbl.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, "F1F5F9")  # 浅蓝灰
    set_cell_margins(cell, top=160, bottom=160, left=240, right=200)
    
    # 设置左侧加粗强调边框
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="none"/>
            <w:left w:val="single" w:sz="24" w:space="0" w:color="1E3A8A"/>
            <w:bottom w:val="none"/>
            <w:right w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(4)
    run_title = p.add_run(f"【{title}】\n")
    run_title.font.name = "微软雅黑"
    run_title.font.size = Pt(10.5)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)
    
    for line in text_list:
        p_line = cell.add_paragraph()
        p_line.paragraph_format.space_before = Pt(1)
        p_line.paragraph_format.space_after = Pt(2)
        p_line.paragraph_format.line_spacing = 1.2
        run = p_line.add_run(line)
        run.font.name = "微软雅黑"
        run.font.size = Pt(9.5)
        run.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
        
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def format_table(table, col_widths, col_names, data_rows, align_right_cols=[]):
    """格式化数据表格"""
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_table_borders(table, color="CBD5E1", sz="6")
    
    # 表头
    hdr_cells = table.rows[0].cells
    for i, name in enumerate(col_names):
        hdr_cells[i].text = name
        hdr_cells[i].width = col_widths[i]
        set_cell_background(hdr_cells[i], "1E3A8A")  # 深蓝
        set_cell_margins(hdr_cells[i], top=160, bottom=160, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if i in align_right_cols else WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(2)
        for r in p.runs:
            r.font.name = "微软雅黑"
            r.font.size = Pt(9.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            
    # 数据行
    for r_idx, row_data in enumerate(data_rows):
        row = table.add_row()
        row_cells = row.cells
        bg_color = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"
        for i, val in enumerate(row_data):
            row_cells[i].text = str(val)
            row_cells[i].width = col_widths[i]
            set_cell_background(row_cells[i], bg_color)
            set_cell_margins(row_cells[i], top=110, bottom=110, left=140, right=140)
            p = row_cells[i].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if i in align_right_cols else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.2
            for r in p.runs:
                r.font.name = "微软雅黑"
                r.font.size = Pt(9.0)
                r.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
                
    doc_p = table._tbl.getparent().add_paragraph() if hasattr(table._tbl.getparent(), 'add_paragraph') else None
    if doc_p:
        doc_p.paragraph_format.space_after = Pt(6)

def set_run_font(run, name="微软雅黑", size_pt=10.5, bold=False, color_rgb=(0x33, 0x33, 0x33), italic=False):
    run.font.name = name
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor(*color_rgb)
    rPr = run._r.get_or_add_rPr()
    rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} w:ascii="{name}" w:hAnsi="{name}" w:eastAsia="{name}" w:cs="{name}"/>')
    rPr.append(rFonts)

def add_p(doc, text="", space_before=0, space_after=6, line_spacing=1.3, bold=False, color_rgb=(0x33, 0x33, 0x33), size_pt=10.5, align=WD_ALIGN_PARAGRAPH.LEFT):
    p = doc.add_paragraph()
    p.alignment = align
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = line_spacing
    if text:
        run = p.add_run(text)
        set_run_font(run, "微软雅黑", size_pt, bold, color_rgb)
    return p

def add_h1(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(20)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(text)
    set_run_font(run, "微软雅黑", 15.5, bold=True, color_rgb=(0x0F, 0x17, 0x2A))
    pPr = p._p.get_or_add_pPr()
    pBdr = parse_xml(f'''
        <w:pBdr {nsdecls("w")}>
            <w:bottom w:val="single" w:sz="12" w:space="4" w:color="1E3A8A"/>
        </w:pBdr>
    ''')
    pPr.append(pBdr)
    return p

def add_h2(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(text)
    set_run_font(run, "微软雅黑", 12.5, bold=True, color_rgb=(0x1E, 0x3A, 0x8A))
    return p

def add_h3(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(9)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(text)
    set_run_font(run, "微软雅黑", 10.5, bold=True, color_rgb=(0x33, 0x41, 0x55))
    return p

def add_picture_with_caption(doc, img_name, caption, width=Inches(6.4)):
    """向文档中插入架构图并附带专业图注"""
    img_path = os.path.join(DIAGRAM_DIR, img_name)
    if not os.path.exists(img_path):
        print(f"Warning: Image {img_path} not found.")
        return
    
    p_img = doc.add_paragraph()
    p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_img.paragraph_format.space_before = Pt(10)
    p_img.paragraph_format.space_after = Pt(4)
    p_img.paragraph_format.keep_with_next = True
    run_img = p_img.add_run()
    run_img.add_picture(img_path, width=width)
    
    p_cap = doc.add_paragraph()
    p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_cap.paragraph_format.space_before = Pt(0)
    p_cap.paragraph_format.space_after = Pt(12)
    run_cap = p_cap.add_run(caption)
    set_run_font(run_cap, "微软雅黑", 9.0, bold=False, italic=True, color_rgb=(0x64, 0x74, 0x8B))

def main():
    doc = Document()
    
    # 页面边距设置 (上、下、左、右各 1 英寸)
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        
    # ==================== 封面 / 标题块 ====================
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(36)
    title_p.paragraph_format.space_after = Pt(8)
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_title = title_p.add_run("《3S-fitness 健身连锁加盟战略规划与模式设计建议书》")
    set_run_font(r_title, "微软雅黑", 22, bold=True, color_rgb=(0x0F, 0x17, 0x2A))
    
    sub_p = doc.add_paragraph()
    sub_p.paragraph_format.space_before = Pt(0)
    sub_p.paragraph_format.space_after = Pt(26)
    sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_sub = sub_p.add_run("从“直营负重”到“合伙裂变”：轻资产连锁化扩张战略全景方案（含全套高清架构图与财务模型）")
    set_run_font(r_sub, "微软雅黑", 12, bold=False, color_rgb=(0x47, 0x55, 0x69))
    
    meta_tbl = doc.add_table(rows=4, cols=2)
    meta_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        ("品牌全称", "3S-fitness 健身（3S运动中心）"),
        ("当前基石", "已成功运营 2 家直营门店，跑通单店盈利模型，拥有自研多端 SaaS 数字化底座"),
        ("规划主体", "3S 品牌战略发展委员会 & 商业模式咨询专家组"),
        ("密级属性", "核心商业机密 · 内部决策规划专供（v1.2 决策与实操增强版）")
    ]
    for idx, (k, v) in enumerate(meta_data):
        row = meta_tbl.rows[idx]
        row.cells[0].width = Inches(1.8)
        row.cells[1].width = Inches(4.2)
        set_cell_background(row.cells[0], "F1F5F9")
        set_cell_background(row.cells[1], "FFFFFF")
        set_cell_margins(row.cells[0], 80, 80, 120, 120)
        set_cell_margins(row.cells[1], 80, 80, 120, 120)
        
        p0 = row.cells[0].paragraphs[0]
        p0.paragraph_format.space_after = Pt(0)
        r0 = p0.add_run(k)
        set_run_font(r0, "微软雅黑", 9.5, bold=True, color_rgb=(0x33, 0x41, 0x55))
        
        p1 = row.cells[1].paragraphs[0]
        p1.paragraph_format.space_after = Pt(0)
        r1 = p1.add_run(v)
        set_run_font(r1, "微软雅黑", 9.5, bold=False, color_rgb=(0x1E, 0x29, 0x3B))
        
    set_table_borders(meta_tbl, color="CBD5E1", sz="4")
    
    doc.add_paragraph().paragraph_format.space_after = Pt(14)
    
    # 战略前言
    add_callout(doc, [
        "当前 3S-fitness 两家直营门店虽然跑通了单店模型并实现了健康盈利，但决策层深刻意识到：重资产直营模式对资金流和管理精力消耗极大，未来的扩张空间有限、规模化天花板明显，且难以实现核心骨干教练的深度利益绑定。",
        "面对当前健身存量市场的竞争，纯靠直营无法实现品牌的指数级增长。商业破局的关键，在于从'经营门店'彻底转型为'赋能门店'。",
        "将 3S-fitness 的品牌、交付标准、课程体系与自研四端 IT 系统进行标准化打包输出，以合伙人模式实现品牌的轻资产连锁化扩张。本建议书系统提供从 0-1 到 1-10 跃迁的落地路径及全套架构拓扑支撑。"
    ], title="战略前言：打破直营天花板，开启平台赋能型跃迁")

    # ==================== 模块一 ====================
    add_h1(doc, "模块一：行业对标与模式破局解析")
    
    add_h2(doc, "1.1 中田健身核心商业模式的底层逻辑与优劣势剖析")
    add_p(doc, "中田健身在全国开设千家门店的商业本质，不是传统意义上的招商加盟，而是打造了一个'以教练为核心生产力、去中心化的小微合伙孵化平台'：")
    
    add_p(doc, "• 极致轻资产：选址多在非核心商圈住宅底商或商住楼，面积严格控制在 120-180㎡，装修简约偏工业风，器械实用为主，单店硬件总投入仅 20-30 万元。")
    add_p(doc, "• 全员教练包店制：店内无前台、无销售顾问、无专职保洁。教练既是服务交付者，又是销售转化者；店长即首席主力教练，最大限度压缩了刚性固定人力支出。")
    add_p(doc, "• 封闭式内部合伙：早期绝不对外部热钱开放加盟，只允许在体系内经过考核、达到特定业绩与服务标准的骨干教练出资承包门店，利益与店长全面绑定。")
    add_p(doc, "• 低单价、短周期卡制：单价多在 150-200 元/节（或包月包季制），门槛极低，主打'高频次+无压迫感沟通'，靠会员高续课率撑起高坪效。")

    col_w = [Inches(1.2), Inches(2.6), Inches(2.7)]
    cols = ["评估维度", "核心竞争优势（Why It Scales）", "潜在瓶颈与死穴（Where It Breaks）"]
    rows = [
        ["资本效率", "单店投资小，回本周期极短（通常 6-10 个月），现金流抗风险能力极强。", "单店营收天花板极低（月流水多在 8-15 万元），对高净值中产缺乏溢价能力。"],
        ["组织自驱", "教练实现'零风险创业'，离职率极低，店长对耗卡与客户交付拥有绝对责任心。", "极度依赖教练个人体力与人际交往，一旦主力教练疲倦、流动，单店业绩易断崖式跳水。"],
        ["标准化度", "动作极简，复制试错成本极低。", "环境设施相对简陋、缺乏私密感与品质感；服务依赖个人风格，易被离职教练'1:1 像素级抄袭'另立山头。"]
    ]
    tbl1 = doc.add_table(rows=1, cols=3)
    format_table(tbl1, col_w, cols, rows)
    
    add_h2(doc, "1.2 3S-fitness 破局直营瓶颈的'差异化战略定位'")
    add_p(doc, "3S-fitness 若盲目照搬中田的'低价小黑屋'打法，不仅会瓦解现有直营店建立的品牌调性，更会迅速卷入恶性价格泥潭。3S-fitness 必须确立'品质升维、课程复合、数字驱动的中高端精品健身工作室赋能平台'：")
    
    add_p(doc, "（1）空间体验升维：精致型中高端社区私教与健康管理中心")
    add_p(doc, "• 空间定位在 180-260㎡，高于中田但远轻于传统大馆。配备独立干湿分离淋浴、专属更衣柜与专业体测洽谈区，营造'女性友好、中产舒适'的第三健康空间，支撑 300-450 元/节的客单价。")
    add_p(doc, "• 租金红线把控：月租金必须牢牢锁定在预计月均耗卡总额的 18% - 22% 安全线内，严控固定重负。")
    
    add_p(doc, "（2）交付模式升维：'1对1定制私教 + 4-6人精品小班课'复合坪效模型")
    add_p(doc, "• 在白天非黄金时段引入基于心率与功能性训练的'精品小班课'，客单降至 80-120 元/人，但教练单小时总产出达 400-600 元，单位工时产能提升 2-3 倍，极大地拉升了非峰值时段的场地坪效。")
    
    add_p(doc, "（3）技术基建降维：自研四端 SaaS 构建不可替代的数字化护城河")
    add_p(doc, "• 依托自研四端系统（会员端、员工端、门店管理端、平台总后台），实现约课引擎控制、手机端手写电子合同签约、双向确认消课、预收与耗卡自动清算。形成中田模式无法比拟的合规防飞单壁垒与加盟穿透力。")

    # 插入架构图 1
    add_picture_with_caption(
        doc, 'arch_1_positioning.png',
        '【架构图 1-1】现代健身行业三大商业模式矩阵解构与 3S-fitness 差异化破局路径'
    )

    # ==================== 模块二 ====================
    add_h1(doc, "模块二：标准化复制体系建设（SOP系统搭建）")
    
    add_h2(doc, "2.1 开放加盟前必须完成的五大核心底座")
    add_p(doc, "连锁加盟绝非简单输出招牌，必须将两家直营店的经营经验提炼为标准代码化的'即插即用'操作底座：")
    
    add_p(doc, "1. 选址营建 SOP：商圈半径 1.5km 优质中产客群网格算法；租金占比 ≤ 22% 刚性红线；输出标准 CAD 施工图及 3D 视觉手册；核心器械总部集采联采，单店硬装+软装成本控制在 800 - 1100 元/㎡。")
    add_p(doc, "2. 培训认证 SOP (3S 学院)：四阶认证进阶体系（通识3天+技术急救7天+体验跟岗7天+商业通识7天）；理论实操双 90 分上岗红线；专属系统工号权限鉴权，无认证不开通约课消课权限。")
    add_p(doc, "3. 客户全生命周期 SOP：体验课 60 分钟标准服务脚本；训练负荷数据移动端即时留痕；耗卡进度达 60% 自动触发续约预警；定期体测复查与社群主动关怀。")
    add_p(doc, "4. 销售转化与合同合规 SOP：顾问式咨询流程，痛点深度深挖；卡种模板后台统一配置并明码标价，严禁私自打折赠课；全面推行会员端手写电子合同签约，杜绝法律纠纷。")
    add_p(doc, "5. 财务风控与结算 SOP：严格坚守预收（负债）与耗卡（真实营收）双轨分立；预收资金进入共管监管专户；仅按当期核销耗卡净利润分红；经营数据每日自动日清月结对账。")

    # 插入架构图 2
    add_picture_with_caption(
        doc, 'arch_2_sop_pillars.png',
        '【架构图 2-1】3S-fitness 连锁复制五大标准化底座全景图（SOP 运营矩阵体系）'
    )

    add_h2(doc, "2.2 3S-fitness 核心 SOP 落地交付与考核框架")
    col_w2 = [Inches(1.2), Inches(2.6), Inches(2.7)]
    cols2 = ["运营模块", "核心标准化交付物（SOP 工具）", "验收标准与责任主体"]
    rows2 = [
        ["1. 筹备建店", "•《单店选址测算打分表》\n•《3S标准SI施工工艺规范》\n•《首批设备及物料采购清单》", "选址得分 ≥ 85分；工期偏差 ≤ 3天；总部空间工程部审核签字。"],
        ["2. 人才认证", "•《教练标准工作手册与禁令》\n•《3S体态与动作库交付大纲》\n•《店长日常管理每日打卡清单》", "理论考试 ≥ 90分，实操考核通过；系统发放专属工号；总部教培中心主理。"],
        ["3. 客户运营", "•《体验课 60分钟标准服务脚本》\n•《会员运动健康档案规范》\n•《耗卡预警与续客激活流程》", "体验课转化率 ≥ 35%；训练日志记录率 100%；月度流失率 ≤ 8%；店长负责。"],
        ["4. 经营合规", "•《财务预收与耗卡核算规范》\n•《突发客诉与意外伤害应急预案》\n•《红线违规处理及清退条例》", "账实相符度 100%；电子合同签署率 100%；无账外飞单；财务部与法务部直管。"]
    ]
    tbl2 = doc.add_table(rows=1, cols=3)
    format_table(tbl2, col_w2, cols2, rows2)

    # ==================== 模块三 ====================
    add_h1(doc, "模块三：单店盈利模型与加盟政策设计")
    
    add_h2(doc, "3.1 加盟机制选型：为什么必须坚持'双轨递进混合制'？")
    add_p(doc, "为化解'外部加盟商自作主张甩手失控'与'内部员工资金匮乏'的矛盾，3S-fitness 确立双轨递进策略：")
    add_p(doc, "• 0-10 阶段采用内部合伙人孵化制：新店店长必须由 3S 内部培养考核合格的金牌教练担任，出资 30% 享有 40% 超额利润分红，极度激发自驱力。")
    add_p(doc, "• 10-50 阶段引入外部资本联营托管制：投资人出资 80% 享分红，门店经营权与人事权 100% 交由总部委派店长全盘托管，投资人不干涉日常管理。")

    add_h2(doc, "3.2 费用结构设计与商业逻辑")
    add_p(doc, "1. 品牌授权费：30,000 - 50,000 元/店（3年期）。设立准入门槛，覆盖总部前期商誉与研发成本。")
    add_p(doc, "2. 履约保证金：20,000 元/店（期满无违规全额退还）。针对私自收款、飞单、恶性客诉等行为设立质押担保。")
    add_p(doc, "3. 筹备辅导费：15,000 元/店（一次性）。覆盖空间设计、设备集采对接及开业驻店带教 7 天。")
    add_p(doc, "4. SaaS 系统使用费：1,000 - 1,200 元/月/店。覆盖云服务器、短信、多端升级及运维成本。")
    add_p(doc, "5. 品牌管理抽成：月度实际耗卡金额的 3% - 5%。坚持按'真实核销耗卡'而非'预收流水'抽成，倒逼总部将全部资源投入交付与续费赋能。")

    add_h2(doc, "3.3 【投资回报与分成比例测算参考模型】（三种模式横向对比表）")
    add_p(doc, "以下基于 200㎡ 标准精品工作室（全店 4 人编制，月交付 360 节课，实收单价 320 元，月耗卡营收 115,200 元，净利润 25,772 元）进行全面对比模拟：")

    col_w3 = [Inches(1.5), Inches(1.7), Inches(1.7), Inches(1.6)]
    cols3 = ["评估与分配维度", "模式A：内部合伙孵化制 (推荐)", "模式B：外部资本联营托管", "模式C：传统纯特许加盟 (对比)"]
    rows3 = [
        ["单店总投资额", "约 40 - 43 万元", "约 40 - 43 万元", "约 40 - 43 万元"],
        ["出资与股权结构", "店长 30% (约13万)\n总部 70% (约30万)", "投资人 80% (约34.4万)\n店长技术10% + 总部10%", "外部加盟商 100%\n(自负盈亏)"],
        ["管理运营主体", "金牌店长（合伙人）驻店主理", "总部委派店长，投资人不干涉", "外部加盟商自主管理"],
        ["品牌授权及筹建费", "3.5 万元 (内部优惠)", "5.0 万元 (全额收取)", "5.0 - 6.0 万元"],
        ["履约保证金", "2.0 万元", "2.0 万元", "2.0 万元"],
        ["月度 SaaS 系统费", "1,000 元/月", "1,200 元/月", "1,500 元/月"],
        ["月度耗卡营业收入", "115,200 元 (360节×320元)", "115,200 元 (360节×320元)", "115,200 元 (预估)"],
        ["总部管理费 (4%)", "4,608 元/月", "4,608 元/月", "5,760 元/月 (按5%计提)"],
        ["门店月度经营净利", "25,772 元", "25,772 元", "24,620 元"],
        ["利润分红分配机制", "店长超额分红 40% (10,300元)\n总部股权分红 60% (15,472元)", "投资人享 75% (19,329元)\n委派店长 15% (3,865元)\n总部管理 10% (2,577元)", "净利润 100% 归加盟商自留\n(约 24,620 元)"],
        ["店长月度综合收益", "约 2.48 万元/月\n(底薪+带课提成+分红)", "约 1.84 万元/月\n(底薪+带课提成+分红)", "领市场化固定工资与提成\n(约 1.2 - 1.5 万元/月)"],
        ["投资人回本周期", "约 19 个月 (年收益18.6万)\n店长合伙人约 13 个月", "约 18 个月 (年收益23.2万)", "约 18 - 24 个月\n(高度依赖个人经验)"],
        ["治理逻辑与评价", "极高自驱力，员工变老板，\n飞单率趋近于零，适合早期打样。", "解决扩张资金瓶颈，实现资本\n与专业运营分离，适合规模化。", "极易失控变形，私收现金与\n退费纠纷频发，强烈不建议。"]
    ]
    tbl3 = doc.add_table(rows=1, cols=4)
    format_table(tbl3, col_w3, cols3, rows3)

    # 插入架构图 3
    add_picture_with_caption(
        doc, 'arch_3_financial_model.png',
        '【架构图 3-1】3S-fitness 单店股权架构与月度超额分红全链路资金模型图'
    )

    # ==================== 模块四 ====================
    add_h1(doc, "模块四：总部赋能与强管控体系")
    
    add_h2(doc, "4.1 总部核心强赋能机制（输入生产要素）")
    add_p(doc, "1. 人（人才供应链）：3S 学院持续为门店轮训输送认证教练，破解单店招聘荒；每季度推出 1-2 门全新功能性课包（如体态矫正、产后核心修复）。")
    add_p(doc, "2. 财（数字化财务透明中台）：双向消课后系统自动清算，资金安全托管，经营账本每日通过移动端穿透展示，投资人随时随地查账。")
    add_p(doc, "3. 物（集采供应链降低 Capex）：核心力量器械、减震地胶、智能门禁与软装由总部直接对接厂家，单店建店成本降低 15% - 20%。")
    add_p(doc, "4. 流（全域流量运营与就近调度）：美团、大众点评、抖音由总部官方专区代运营，线上线索 15 分钟内智能分派至周边门店承接转化。")

    add_h2(doc, "4.2 总部核心强管控机制（守住品牌红线）")
    add_p(doc, "1. 三条高压红线（违者直接除名与清退）：")
    add_p(doc, "• 红线一（私自收款与飞单）：店内款项必须经 3S 系统结算；查实一律没收 2 万元保证金，通报全系统并移交司法追究职务侵占责任。")
    add_p(doc, "• 红线二（虚假消课与代签名）：严禁代刷码或伪造学员确认；查实扣罚当月提成并通报，重犯撤换店长。")
    add_p(doc, "• 红线三（重大客诉与骚扰纠纷）：设立总部直通 400 维权专线，重大恶性客诉一票否决。")
    add_p(doc, "2. 动态门店评级机制：每月综合评分。A 级（≥90分）奖励管理费返还并优先开新店；D 级（<60分 或 连续两月亏损）启动强制托管回购或摘牌退出机制。")

    # 插入架构图 4
    add_picture_with_caption(
        doc, 'arch_4_saas_governance.png',
        '【架构图 4-1】3S-fitness 总部-门店赋能与管控拓扑图（人·财·物·流与数据闭环）'
    )

    # ==================== 模块五 ====================
    add_h1(doc, "模块五：冷启动与扩张发展路径（Roadmap）")
    
    add_h2(doc, "5.1 第一阶段（0-1 阶段，前 1-6 个月）：打造'黄埔军校'与打样第 3 家合伙店")
    add_p(doc, "• 直营店升级为标准实验室：100% 普及移动端手写电子合同签约与双向消课确认，沉淀数字化经营日志。")
    add_p(doc, "• 选拔首批合伙人管培生：从直营店选拔 2 名资深教练，系统学习 P&L 财务分析、排班与客情维护。")
    add_p(doc, "• 7:3 内部出资打样第 3 家合伙店：总部出资 70%、准店长出资 30%，完整跑通合伙协议、分成清算与 SaaS 运转闭环，形成《3S 筹备开业 45 天作战图》。")

    add_h2(doc, "5.2 第二阶段（1-10 阶段，第 7-18 个月）：初期区域扩张与蜂窝式选址")
    add_p(doc, "• 核心策略：'同城打透，蜂窝加密'。在同城以 2.5-3.5 公里为半径密集开店，全市共享公域投放，单店获客成本降低 60%，教练可跨店就近调配补位。")

    col_w7 = [Inches(1.5), Inches(2.2), Inches(2.8)]
    cols7 = ["选址模型类别", "目标客群特征", "核心区位、面积与租金标准"]
    rows7 = [
        ["模型 A：高档社区临街底商型", "中产家庭、全职妈妈、自由职业者；续费率极高。", "面积 180-220㎡；租金 80-120元/㎡/月；1.5km常住人口≥2.5万人；临街展示面佳。"],
        ["模型 B：核心商务写字楼配套型", "企业白领、金融/IT高管；午间与晚间潮汐明显。", "面积 200-260㎡；租金 120-160元/㎡/月；具备高品质独立干湿分离淋浴。"],
        ["模型 C：青年文创街区特色型", "年轻创意客群、小资青年；社群属性强、爱拍照打卡。", "面积 220-300㎡；租金 60-90元/㎡/月；层高建议 ≥ 3.8米，利于小班课拓展。"]
    ]
    tbl7 = doc.add_table(rows=1, cols=3)
    format_table(tbl7, col_w7, cols7, rows7)

    # 插入架构图 5
    add_picture_with_caption(
        doc, 'arch_5_roadmap.png',
        '【架构图 5-1】3S-fitness 连锁化扩张发展路线图（0-1-10-50 演进蓝图）'
    )

    # ==================== 模块六 ====================
    add_h1(doc, "模块六：核心风险提示与规避策略")
    
    add_h2(doc, "6.1 风险一：私教'飞单'与私下转账结算（熟人经济背叛）")
    add_p(doc, "• 防控机制一（硬件联动）：智能门禁与系统深度打通，无预约无法开门，场内核心照明与器械不予激活。")
    add_p(doc, "• 防控机制二（利益牵引）：飞单定性为职务侵占，扣罚 2 万元保证金并终身取消合伙分红资格，合伙收益远超飞单小利。")
    add_p(doc, "• 防控机制三（用户端合规）：合同明确未经官方支付课程不受意外险保障；实名举报私收现金者奖励 10 节免费私教。")

    add_h2(doc, "6.2 风险二：合伙人'翅膀硬了'带走会员、另立山头")
    add_p(doc, "• 防控机制一（数据公有）：会员档案全存储在平台总库，员工端脱敏显示，离职即冻结权限，无法导出资产。")
    add_p(doc, "• 防控机制二（竞业限制）：退伙后 2 年内不得在原门店周边 3 公里内开店，违约金为过去 12 个月耗卡流水的 50%。")
    add_p(doc, "• 防控机制三（永久导师分红）：老店长带出合格新店长开新店，老店长永久享有新店 3% - 5% 净利润分红，化敌为友做大平台。")

    add_h2(doc, "6.3 风险三：预收款沉淀资金挪用与'资金断链'暴雷")
    add_p(doc, "• 防控机制一（共管专户）：所有预收资金统一归集共管专户，加盟商后台仅有查看权，无权随意提现。")
    add_p(doc, "• 防控机制二（只分耗卡净利）：分红唯一基准为'当月核销耗卡收入 - 刚性Opex'，未消耗预收款留作沉淀资金，彻底打破庞氏预售陷阱。")

    add_h2(doc, "6.4 风险四：加盟法律性质不规范引发的行政处罚与合同纠纷")
    add_p(doc, "• 前期过渡架构（单店有限合伙企业 LLP）：在未满足'两店一年'特许经营备案前，一律不签加盟合同，改签《项目合作联营协议》并注册设立单店有限合伙企业。")
    add_p(doc, "• GP/LP 分工：3S 总部担任 GP（占股1%行使100%管理决策权），投资人/店长担任 LP（占股99%享有分红权），合法合规规避行政壁垒。")
    add_p(doc, "• 后续升级：待两家直营店满 1 年后，由总部法务快速完成商务部特许经营备案，正式步入正规特许经营快车道。")

    # 插入架构图 6
    add_picture_with_caption(
        doc, 'arch_6_legal_llp.png',
        '【架构图 6-1】0-10 阶段单店有限合伙企业（LLP）合规法律与治理架构图'
    )

    # ==================== 总结与工作看板 ====================
    add_h1(doc, "战略总结与未来 90 天落地行动看板")
    
    col_w8 = [Inches(1.5), Inches(2.5), Inches(2.5)]
    cols8 = ["推进阶段", "核心攻坚战役与关键交付物", "成果衡量与验收标准"]
    rows8 = [
        ["第 1 - 30 天\n(系统与标准固化)", "• 数字化双轨固化：完成四端 SaaS 后台耗卡核销与资金监管功能联调\n• 编制《3S 核心岗位 SOP 汇编手册 (v1.0)》", "2家直营店电子合同签署率 100%；\n预收与耗卡财务日报一键生成；\n形成可打印的装订版工作手册。"],
        ["第 31 - 60 天\n(人才与机制打磨)", "• 启动首期'3S 学院合伙人训练营'\n• 确定首批 2 名管培店长选拔名单\n• 确定第 3 家合伙打样店选址商圈", "2名骨干教练通过商业考核认证；\n完成《单店合伙协议》法务审核；\n选址评估得分 ≥ 85分。"],
        ["第 61 - 90 天\n(样板店开业落地)", "• 注册设立首个'单店合伙企业 LLP'\n• 7:3 内部出资落地第 3 家门店\n• 跑通分成结算与线上派单闭环", "新店按期开业，工期偏差 ≤ 3天；\n首月消课量突破 180 节；\n全流程跑通，正式对外招募合伙人！"]
    ]
    tbl8 = doc.add_table(rows=1, cols=3)
    format_table(tbl8, col_w8, cols8, rows8)

    # 保存文档
    output_path = "/Users/nickni/Desktop/fitness-app/3S-fitness健身连锁加盟战略规划与模式设计建议书.docx"
    doc.save(output_path)
    print(f"Updated Word document successfully created at: {output_path}")

if __name__ == "__main__":
    main()
