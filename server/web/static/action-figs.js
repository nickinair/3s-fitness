/**
 * 动作示意图(线条小人) —— 移动端/管理后台共用
 *
 * 每个动作用 2~4 个关键姿势描述(各关节的绝对角度), 正向运动学算出关节坐标后:
 *   - ActionFig.svg(name)  生成 SVG(关键姿势之间循环动画, SMIL, 不依赖 JS)
 *   - ActionFig.draw(ctx, name, x, y, w, h)  画到 canvas(训练计划海报用, 画动作的「发力位」静帧)
 *   - ActionFig.match(name, part)  按动作名匹配姿势, 匹配不到返回 null(宁可不画, 也不画错)
 * 坐标: viewBox 0 0 160 120, 地面 y=109; 角度 0=向右, 90=向下, -90=向上; 侧视图人朝右。
 * 颜色全部用 currentColor, 由外层 CSS 决定(跟随主题)。
 */
(function () {
  const root = typeof window !== 'undefined' ? window : {};
  // 所有动作统一: 同一比例尺、同一线宽(躯干/四肢/脚 BW), 头部同一大小
  const BW = 6;
  const L = { torso: 33, neck: 5, head: 7.5, uarm: 18, farm: 16, thigh: 23, shin: 22, foot: 8 };
  const GROUND = 109;
  const rad = d => d * Math.PI / 180;
  const pt = (p, a, l) => [p[0] + Math.cos(rad(a)) * l, p[1] + Math.sin(rad(a)) * l];
  const STAND = { torso: -90, thigh: 90, shin: 90, uarm: 92, farm: 90 };

  /* ---------- 姿势 → 关节 ---------- */
  function solve(f, view) {
    const len = Object.assign({}, L, f.len || {});
    const J = { hp: [0, 0] };
    J.nk = pt(J.hp, f.torso, len.torso);
    J.sh = pt(J.hp, f.torso, len.torso * 0.9);
    J.hd = pt(J.nk, f.head != null ? f.head : f.torso, len.neck + len.head);
    const front = view === 'front';
    const shR = front ? [J.sh[0] + 7, J.sh[1]] : J.sh;
    const shL = front ? [J.sh[0] - 7, J.sh[1]] : J.sh;
    const hpR = front ? [J.hp[0] + 5, J.hp[1]] : J.hp;
    const hpL = front ? [J.hp[0] - 5, J.hp[1]] : J.hp;
    const m = a => 180 - a;   // 正视图左右镜像
    const arm = (s, ua, fa, ul, fl) => { const e = pt(s, ua, ul); return [e, pt(e, fa, fl)]; };
    const leg = (h, ta, sa, fa, tl, sl) => { const k = pt(h, ta, tl); const a = pt(k, sa, sl); return [k, a, pt(a, fa, len.foot)]; };
    [J.el, J.wr] = arm(shR, f.uarm, f.farm, len.uarm, len.farm);
    [J.kn, J.an, J.to] = leg(hpR, f.thigh, f.shin, f.foot != null ? f.foot : 0, len.thigh, len.shin);
    if (front) {
      [J.el2, J.wr2] = arm(shL, f.uarm2 != null ? f.uarm2 : m(f.uarm), f.farm2 != null ? f.farm2 : m(f.farm), len.uarm2 || len.uarm, len.farm2 || len.farm);
      [J.kn2, J.an2, J.to2] = leg(hpL, f.thigh2 != null ? f.thigh2 : m(f.thigh), f.shin2 != null ? f.shin2 : m(f.shin), f.foot2 != null ? f.foot2 : 180, len.thigh2 || len.thigh, len.shin2 || len.shin);
      J.shR = shR; J.shL = shL; J.hpR = hpR; J.hpL = hpL;
    } else {
      if (f.uarm2 != null) [J.el2, J.wr2] = arm(J.sh, f.uarm2, f.farm2, len.uarm, len.farm);
      if (f.thigh2 != null) [J.kn2, J.an2, J.to2] = leg(J.hp, f.thigh2, f.shin2, f.foot2 != null ? f.foot2 : 0, len.thigh, len.shin);
    }
    const at = f.at || ['an', 80, GROUND - 1];
    const ref = J[at[0]];
    const dx = at[1] - ref[0]; const dy = at[2] - ref[1];
    Object.keys(J).forEach((k) => { J[k] = [J[k][0] + dx, J[k][1] + dy]; });
    return J;
  }

  /* ---------- 器械/负重 ---------- */
  const line = (a, b, w, o) => ({ t: 'l', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: w || 2, o: o == null ? 0.55 : o });
  const circ = (c, r, fill, o, w) => ({ t: 'c', cx: c[0], cy: c[1], r, fill: !!fill, o: o == null ? 0.55 : o, w: w || 2 });
  const rect = (x, y, w, h, o) => ({ t: 'r', x, y, w, h, o: o == null ? 0.22 : o });
  const loadAt = (type, p, J, view) => {
    if (!type || !p) return [];
    if (type === 'bb') {
      if (view === 'front' && J.wr2) {
        const l = J.wr2; const r = J.wr;
        return [line([l[0] - 10, l[1]], [r[0] + 10, r[1]], 2.4, 0.7), rect(l[0] - 13, l[1] - 7, 4, 14, 0.6), rect(r[0] + 9, r[1] - 7, 4, 14, 0.6)];
      }
      return [circ(p, 9, false, 0.6, 2.2), circ(p, 2, true, 0.7)];
    }
    if (type === 'db') {
      const out = [circ(p, 4.6, true, 0.65)];
      if (view === 'front' && J.wr2) out.push(circ(J.wr2, 4.6, true, 0.65));
      return out;
    }
    if (type === 'kb') return [circ([p[0], p[1] + 6], 6, true, 0.65), circ([p[0], p[1] + 1], 3, false, 0.65, 1.6)];
    return [];
  };

  /* ---------- 动作库 ---------- */
  const S = (o) => Object.assign({}, STAND, o);
  // 跪撑基础姿势: 远侧膝盖跪地在髋部正下方、小腿贴地, 双手直臂撑地在肩膀正下方
  const QUAD = (o) => Object.assign({ torso: -20, thigh: 90, shin: 180, foot: 180, thigh2: 90, shin2: 180, foot2: 180, uarm: 90, farm: 90, uarm2: 90, farm2: 90, at: ['kn2', 62, 105] }, o);
  const BENCH = [rect(40, 82, 74, 5), line([50, 87], [50, GROUND], 2, 0.3), line([104, 87], [104, GROUND], 2, 0.3)];
  const SEAT = (x, y, w) => [rect(x, y, w || 26, 5), line([x + (w || 26) / 2, y + 5], [x + (w || 26) / 2, GROUND], 2, 0.3)];
  const lying = (o) => Object.assign({ torso: 180, thigh: 8, shin: 82, foot: 0, at: ['hp', 98, 79] }, o);
  const cableTo = (from, j) => (J) => [line(from, J[j], 1.4, 0.45), circ(from, 3, false, 0.45, 1.6)];

  const P = {
    squat_bb: { load: 'bb', loadAt: 'sh', frames: [S({ uarm: 150, farm: -40 }), S({ torso: -58, thigh: 12, shin: 112, uarm: 175, farm: -30 })], cue: '挺胸收腹，臀部向后坐，膝盖与脚尖同向，大腿蹲至与地面平行' },
    squat: { load: 'db', frames: [S({ uarm: 110, farm: -70 }), S({ torso: -62, thigh: 12, shin: 112, uarm: 130, farm: -40 })], cue: '重心在脚掌中部，臀部向后坐，起身时臀腿发力' },
    lunge: { load: 'db', frames: [S({ thigh: 80, shin: 95, thigh2: 112, shin2: 98, foot2: 10, at: ['an', 95, 108] }), S({ thigh: 8, shin: 95, thigh2: 100, shin2: 172, foot2: 175, at: ['an', 95, 108] })], cue: '前腿膝盖不超过脚尖太多，后腿膝盖下沉接近地面，上身保持直立' },
    deadlift: { load: 'bb', still: 0, frames: [S({ torso: -28, thigh: 60, shin: 98 }), S({})], cue: '背部挺直，杠铃贴着腿上下，用臀部和腿的力量站起' },
    rdl: { load: 'bb', still: 0, frames: [S({ torso: -30, thigh: 82, shin: 92 }), S({})], cue: '膝盖微屈，臀部向后推，感受大腿后侧拉伸，背部始终挺直' },
    bench_press: { load: 'bb', props: BENCH, frames: [lying({ uarm: -90, farm: -90 }), lying({ uarm: 52, farm: -88 })], cue: '肩胛骨收紧贴住凳面，下放到胸部，向上推起时不要锁死手肘' },
    incline_press: { load: 'db', props: [{ t: 'p', pts: [[38, 60], [92, 84], [92, 89], [36, 65]], o: 0.22 }, ...SEAT(86, 84, 30)], frames: [{ torso: -152, thigh: 8, shin: 85, uarm: -70, farm: -70, at: ['hp', 94, 82] }, { torso: -152, thigh: 8, shin: 85, uarm: 70, farm: -80, at: ['hp', 94, 82] }], cue: '凳面上斜 30°左右，推起时重量在上胸正上方' },
    // 坐姿斜上推胸(器械): 靠背和上身向后倾斜约 35°, 双手沿垂直于上身的方向斜向上推出
    incline_seated: (() => {
      // 靠背: 沿上身方向、向身体后方偏移的一块斜板
      const hip = [70, 80]; const d = [Math.cos(rad(-125)), Math.sin(rad(-125))];
      const back = [d[1], -d[0]];   // 上身方向逆时针转 90°, 指向身体后方
      const p1 = [hip[0] + back[0] * 5, hip[1] + back[1] * 5]; const p2 = [hip[0] + d[0] * 40 + back[0] * 5, hip[1] + d[1] * 40 + back[1] * 5];
      const p3 = [p2[0] + back[0] * 6, p2[1] + back[1] * 6]; const p4 = [p1[0] + back[0] * 6, p1[1] + back[1] * 6];
      return {
        props: [{ t: 'p', pts: [p1, p2, p3, p4], o: 0.22 }, ...SEAT(58, 82, 30)],
        frames: [
          { torso: -125, thigh: 0, shin: 88, uarm: 120, farm: -40, at: ['hp', 70, 79] },
          { torso: -125, thigh: 0, shin: 88, uarm: -35, farm: -35, at: ['hp', 70, 79] },
        ],
        props2: (J) => [line([J.wr[0] - 3, J.wr[1] + 4], [J.wr[0] + 3, J.wr[1] - 4], 3.2, 0.5)],
        cue: '背部贴紧倾斜的靠背，握住把手从胸前沿斜上方推出，推到手臂接近伸直，感受上胸发力，慢慢回放',
      };
    })(),
    // 坐姿推肩: 坐在带靠背的凳上, 从肩部向正上方推起
    seated_ohp: { view: 'front', load: 'db', props: [rect(68, 40, 24, 46, 0.18), rect(64, 82, 32, 5), line([80, 87], [80, GROUND], 2, 0.3)], frames: [{ torso: -90, thigh: 70, shin: 90, len: { thigh: 10, shin: 21 }, uarm: 8, farm: -86, at: ['hp', 80, 80] }, { torso: -90, thigh: 70, shin: 90, len: { thigh: 10, shin: 21 }, uarm: -78, farm: -86, at: ['hp', 80, 80] }], cue: '背部贴紧靠背，核心收紧，哑铃从肩部两侧向正上方推起，不要耸肩，慢慢下放到耳朵高度' },
    chest_press: { props: [...SEAT(58, 80), rect(52, 40, 5, 42)], frames: [{ torso: -90, thigh: 0, shin: 88, uarm: 170, farm: -5, at: ['hp', 70, 79] }, { torso: -90, thigh: 0, shin: 88, uarm: 2, farm: 0, at: ['hp', 70, 79] }], cue: '背部贴紧靠垫，向前推到手臂接近伸直，慢慢回放' },
    fly_top: { view: 'front', props: [rect(66, 30, 28, 80, 0.16)], load: 'db', frames: [{ torso: -90, thigh: 90, shin: 90, uarm: 8, farm: 12, at: ['hp', 80, 82], len: { thigh: 14, shin: 14 } }, { torso: -90, thigh: 90, shin: 90, uarm: -55, farm: -110, at: ['hp', 80, 82], len: { thigh: 14, shin: 14, uarm: 11, farm: 9 } }], cue: '躺在凳上，手肘微屈，像抱大树一样把哑铃从两侧合拢到胸前' },
    cable_fly: { view: 'front', frames: [S({ uarm: -14, farm: -32 }), S({ uarm: 35, farm: 178 })], props2: (J) => [line([10, 14], J.wr2, 1.3, 0.4), line([150, 14], J.wr, 1.3, 0.4)], cue: '身体微前倾，手肘微屈，双手从两侧向身体前下方合拢' },
    pec_deck: { view: 'front', props: [rect(66, 80, 28, 5)], frames: [{ torso: -90, thigh: 90, shin: 90, uarm: 0, farm: -90, at: ['hp', 80, 80], len: { thigh: 12, shin: 18 } }, { torso: -90, thigh: 90, shin: 90, uarm: 178, farm: -90, at: ['hp', 80, 80], len: { thigh: 12, shin: 18, uarm: 6 } }], cue: '坐直，前臂贴住挡板，用胸部发力把双臂向中间夹拢' },
    pushup: { frames: [{ torso: 208, thigh: 28, shin: 28, foot: 5, uarm: 90, farm: 90, at: ['wr', 52, 108] }, { torso: 199, thigh: 19, shin: 19, foot: 5, uarm: 45, farm: 135, at: ['wr', 52, 108] }], cue: '身体从头到脚保持一条直线，下放到胸部接近地面，核心收紧' },
    pullup: { view: 'front', props: [line([36, 8], [124, 8], 3, 0.5)], frames: [{ torso: -90, thigh: 90, shin: 90, len: { shin: 16 }, uarm: -50, farm: -80, at: ['wr', 101.4, 8] }, { torso: -90, thigh: 90, shin: 90, len: { shin: 16 }, uarm: 6, farm: -100, at: ['wr', 102, 8] }], cue: '双手正握略宽于肩，用背部发力把身体拉起到下巴过杠（手肘向下向外打开），再慢慢下放' },
    // 大剪刀: 正面看, 身后两根长力臂交叉成 X(交叉点在上背后方), 每根力臂上端是把手、对侧下端挂配重片;
    // 手把把手向下拉时力臂绕交叉点转动, 配重端抬起, 整个 X 像剪刀一样开合
    big_scissors: {
      view: 'front',
      props: [rect(66, 86, 28, 5), rect(56, 78, 48, 6, 0.32), rect(70, 104, 20, 5), line([80, 91], [80, 104], 3, 0.3)],
      props2: (J) => {
        const PIV = [80, 50];
        const lever = (w) => {
          const dx = PIV[0] - w[0]; const dy = PIV[1] - w[1]; const l = Math.hypot(dx, dy) || 1;
          const ux = dx / l; const uy = dy / l;
          const top = [w[0] - ux * 9, w[1] - uy * 9];          // 把手上方露出的一截力臂
          const end = [PIV[0] + ux * 54, PIV[1] + uy * 54];    // 对侧下端: 配重片
          return [line(top, end, 5, 0.2), circ(end, 10, false, 0.26, 3), circ(end, 2.5, true, 0.26),
            line([w[0] - ux * 2 - 3, w[1] + 4], [w[0] + 3 - ux * 2, w[1] - 4], 3.2, 0.4)];   // 把手
        };
        return [...lever(J.wr2), ...lever(J.wr), circ(PIV, 3, true, 0.3)];
      },
      frames: [
        { torso: -90, thigh: 70, shin: 90, len: { thigh: 10, shin: 21 }, uarm: -55, farm: -72, at: ['hp', 80, 80] },
        { torso: -90, thigh: 70, shin: 90, len: { thigh: 10, shin: 21 }, uarm: 18, farm: -95, at: ['hp', 80, 80] },
      ],
      cue: '坐稳，大腿压在挡板下，双手握住两侧把手，挺胸，用背部把把手向下、向后拉到肩部两侧（身后 X 形力臂随之张开），顶峰夹紧肩胛骨，再慢慢放回',
    },
    pulldown: { props: [...SEAT(58, 80), rect(70, 64, 20, 4)], frames: [{ torso: -96, thigh: 0, shin: 88, uarm: -82, farm: -86, at: ['hp', 70, 79] }, { torso: -100, thigh: 0, shin: 88, uarm: 100, farm: -72, at: ['hp', 70, 79] }], props2: (J) => [line([76, 6], J.wr, 1.4, 0.45), circ([76, 6], 3, false, 0.45, 1.6)], cue: '挺胸，把横杆拉到上胸，感受背部肌肉收缩，手臂只是挂钩' },
    seated_row: { props: [rect(40, 92, 40, 5), rect(118, 82, 4, 22)], frames: [{ torso: -70, thigh: -6, shin: 2, foot: -80, uarm: 2, farm: 2, at: ['hp', 58, 91] }, { torso: -95, thigh: -6, shin: 2, foot: -80, uarm: 140, farm: 8, at: ['hp', 58, 91] }], props2: cableTo([150, 88], 'wr'), cue: '挺胸坐直，把手柄拉向腹部，肩胛骨向后夹紧，不要后仰借力' },
    // 单臂哑铃划船: 同侧膝盖和手撑在凳子上, 另一只脚站地, 空出的手臂把哑铃拉到腰侧
    one_arm_row: { load: 'db', props: [rect(30, 88, 76, 5), line([40, 93], [40, GROUND], 2, 0.3), line([98, 93], [98, GROUND], 2, 0.3)], frames: [{ torso: -12, thigh: 100, shin: 95, foot: 0, thigh2: 90, shin2: 180, foot2: 180, uarm: 76, farm: 84, uarm2: 100, farm2: 80, at: ['kn2', 60, 85] }, { torso: -12, thigh: 100, shin: 95, foot: 0, thigh2: 90, shin2: 180, foot2: 180, uarm: 168, farm: 82, uarm2: 100, farm2: 80, at: ['kn2', 60, 85] }], cue: '同侧膝盖和手撑在凳上，背部放平，另一只手把哑铃沿身体拉向腰侧，手肘贴近身体，顶端停顿再慢放' },
    bent_row: { load: 'bb', frames: [S({ torso: -32, thigh: 72, shin: 100 }), S({ torso: -32, thigh: 72, shin: 100, uarm: 172, farm: 78 })], cue: '俯身约 45°，背部挺直，把重量拉向腹部，手肘贴近身体' },
    straight_pulldown: { frames: [S({ torso: -72, uarm: -28, farm: -26 }), S({ torso: -72, uarm: 70, farm: 72 })], props2: cableTo([128, 8], 'wr'), cue: '手臂伸直，用背部的力量把绳索压到大腿前，感受背阔肌发力' },
    ohp: { load: 'db', frames: [S({ uarm: 112, farm: -78 }), S({ uarm: -86, farm: -88 })], cue: '收紧核心，从肩膀位置向正上方推起，不要过度后仰' },
    lateral_raise: { view: 'front', load: 'db', frames: [S({ uarm: 82, farm: 86 }), S({ uarm: 2, farm: 4 })], cue: '手肘微屈，从身体两侧抬到与肩同高，不要耸肩' },
    front_raise: { load: 'db', frames: [S({ uarm: 88, farm: 88 }), S({ uarm: 0, farm: -2 })], cue: '手臂伸直向前抬到与肩同高，慢慢放下，身体不要晃' },
    rear_fly: { view: 'front', load: 'db', frames: [S({ torso: -90, len: { torso: 22 }, uarm: 88, farm: 90 }), S({ torso: -90, len: { torso: 22 }, uarm: 4, farm: 8 })], cue: '俯身约 60°，手臂向两侧打开，感受肩后侧和上背发力' },
    face_pull: { frames: [S({ uarm: -6, farm: -4 }), S({ uarm: -14, farm: -160 })], props2: cableTo([150, 30], 'wr'), cue: '把绳索拉向面部，手肘抬高向两侧打开，夹紧肩胛骨' },
    upright_row: { view: 'front', load: 'bb', frames: [S({ uarm: 98, farm: 92 }), S({ uarm: -12, farm: 128 })], cue: '握距与肩同宽，手肘带动把杠铃沿身体拉到胸前，手肘高于手腕' },
    curl: { load: 'db', frames: [S({ uarm: 84, farm: 86 }), S({ uarm: 82, farm: -58 })], cue: '大臂贴住身体不动，用肱二头肌把重量弯举起来，慢慢下放' },
    pushdown: { frames: [S({ torso: -80, uarm: 98, farm: -38 }), S({ torso: -80, uarm: 98, farm: 88 })], props2: cableTo([112, 8], 'wr'), cue: '大臂夹紧身体，只动前臂把绳索压到底，感受手臂后侧发力' },
    skull_crusher: { load: 'db', props: BENCH, frames: [lying({ uarm: -105, farm: 168 }), lying({ uarm: -100, farm: -100 })], cue: '大臂保持不动，前臂向头后方弯曲再伸直' },
    dips: { props: [line([66, 58], [104, 58], 3, 0.5), line([100, 58], [100, GROUND], 2, 0.3)], frames: [{ torso: -86, thigh: 100, shin: 140, uarm: 90, farm: 90, at: ['wr', 84, 58] }, { torso: -80, thigh: 100, shin: 140, uarm: 172, farm: 60, at: ['wr', 84, 58] }], cue: '身体微前倾，下降到大臂与地面平行，再撑起' },
    leg_press: { props: [{ t: 'p', pts: [[30, 60], [70, 92], [70, 97], [28, 66]], o: 0.22 }], frames: [{ torso: -150, thigh: -70, shin: 18, foot: -70, uarm: 95, farm: 10, at: ['hp', 70, 90] }, { torso: -150, thigh: -38, shin: -36, foot: -110, uarm: 95, farm: 10, at: ['hp', 70, 90] }], props2: (J) => [line([J.an[0] - 6, J.an[1] - 12], [J.an[0] + 9, J.an[1] + 8], 4, 0.5)], cue: '下背贴紧靠垫，双脚与肩同宽踩实，膝盖不要内扣也不要锁死' },
    leg_ext: { props: [...SEAT(56, 78), rect(52, 40, 5, 40)], frames: [{ torso: -92, thigh: 0, shin: 90, uarm: 100, farm: 30, at: ['hp', 68, 77] }, { torso: -92, thigh: 0, shin: 2, foot: -80, uarm: 100, farm: 30, at: ['hp', 68, 77] }], props2: (J) => [circ([J.an[0], J.an[1] - 4], 4, true, 0.4)], cue: '坐稳，用大腿前侧把小腿抬到接近伸直，停顿一下再慢慢放下' },
    leg_curl: { props: [rect(36, 82, 90, 5), line([50, 87], [50, GROUND], 2, 0.3), line([115, 87], [115, GROUND], 2, 0.3)], frames: [{ torso: 180, thigh: 0, shin: 0, foot: 90, uarm: 160, farm: 175, at: ['hp', 80, 79] }, { torso: 180, thigh: 0, shin: -110, foot: -20, uarm: 160, farm: 175, at: ['hp', 80, 79] }], props2: (J) => [circ([J.an[0] + 3, J.an[1] - 2], 4, true, 0.4)], cue: '趴稳，髋部贴住凳面，用大腿后侧把小腿向臀部弯起' },
    calf_raise: { props: [rect(86, 104, 26, 5)], frames: [S({ foot: 4, at: ['to', 104, 103] }), S({ foot: 52, at: ['to', 104, 103] })], cue: '前脚掌站在台阶边缘，脚跟尽量下放再全力踮起，顶端停顿' },
    glute_bridge: { frames: [{ torso: 180, thigh: -45, shin: 70, foot: 0, uarm: 8, farm: 2, at: ['nk', 44, 102] }, { torso: 160, thigh: -10, shin: 82, foot: 0, uarm: 18, farm: 2, at: ['nk', 44, 102] }], cue: '双脚踩实，用臀部发力把髋部顶起到身体成一条直线，顶端夹紧臀部' },
    hip_thrust: { load: 'bb', loadAt: 'hp', props: [rect(24, 80, 26, 5), line([37, 85], [37, GROUND], 2, 0.3)], frames: [{ torso: -150, thigh: -40, shin: 76, uarm: 40, farm: 20, at: ['nk', 44, 80] }, { torso: 180, thigh: -2, shin: 90, uarm: 40, farm: 20, at: ['nk', 44, 80] }], cue: '上背靠住凳子，杠铃放在髋部，用臀部把髋部顶起到与地面平行' },
    hip_abduction: { view: 'front', props: [rect(64, 80, 32, 5)], frames: [{ torso: -90, thigh: 92, shin: 90, len: { thigh: 9 }, uarm: 95, farm: 80, at: ['hp', 80, 80] }, { torso: -90, thigh: 22, shin: 96, len: { thigh: 15 }, uarm: 95, farm: 80, at: ['hp', 80, 80] }], cue: '坐直，膝盖抵住挡板向外打开，感受臀部外侧发力' },
    // 跪撑抬腿系列(双手撑在肩膀正下方、双膝跪在髋部正下方): 小狗=抬起的腿屈膝约 90° 脚底朝上; 大狗=腿向后伸直;
    // 猎鸟狗=腿向后伸直同时对侧手臂向前伸直。近侧(黑)为动作腿/动作手, 远侧(灰)为支撑
    dog_bent: { props: [rect(26, 107, 104, 3, 0.16)], frames: [QUAD({}), QUAD({ thigh: 186, shin: -88, foot: 180 })], cue: '跪撑，手在肩下、膝在髋下，背部平直，一条腿保持屈膝约 90° 向后上方抬起，脚底朝向天花板，臀部发力，不要塌腰' },
    dog_straight: { props: [rect(26, 107, 104, 3, 0.16)], frames: [QUAD({}), QUAD({ thigh: 188, shin: 188, foot: 188 })], cue: '跪撑，手在肩下、膝在髋下，一条腿向后伸直抬到与身体同高，臀部收紧，骨盆保持水平不要转动' },
    bird_dog: { props: [rect(26, 107, 104, 3, 0.16)], frames: [QUAD({}), QUAD({ thigh: 186, shin: 186, foot: 186, uarm: 6, farm: 2 })], cue: '跪撑，同时把一侧手臂向前、对侧腿向后伸直，身体保持稳定一条直线，停顿后换边' },
    kickback: { props: [rect(126, 40, 5, 69)], frames: [S({ torso: -55, thigh: 95, shin: 92, thigh2: 90, shin2: 90, uarm: 20, farm: 10, at: ['an', 76, 108] }), S({ torso: -55, thigh: 150, shin: 150, foot: 60, thigh2: 90, shin2: 90, uarm: 20, farm: 10, at: ['an2', 76, 108] })], cue: '上身稳定，支撑腿微屈，用臀部把腿向后上方踢，不要塌腰' },
    plank: { frames: [{ torso: -168, thigh: 12, shin: 12, foot: 30, uarm: 90, farm: 180, at: ['el', 52, 107] }, { torso: -167, thigh: 13, shin: 12, foot: 30, uarm: 90, farm: 180, at: ['el', 52, 107] }], cue: '前臂撑地，从头到脚一条直线，收紧腹部和臀部，不要塌腰撅臀' },
    side_plank: { frames: [{ torso: -165, thigh: 15, shin: 15, foot: 10, uarm: 90, farm: 180, uarm2: -95, farm2: -95, at: ['el', 52, 107] }, { torso: -170, thigh: 10, shin: 10, foot: 10, uarm: 90, farm: 180, uarm2: -95, farm2: -95, at: ['el', 52, 107] }], cue: '侧身前臂撑地，髋部抬起使身体成一条直线，保持呼吸' },
    crunch: { frames: [{ torso: 180, thigh: -50, shin: 66, foot: 0, uarm: -40, farm: -30, at: ['hp', 86, 103] }, { torso: -148, thigh: -50, shin: 66, foot: 0, uarm: -20, farm: -10, at: ['hp', 86, 103] }], cue: '下背贴地，用腹部把肩膀卷离地面，不要用手拉脖子' },
    hanging_raise: { props: [line([40, 3], [120, 3], 3, 0.5)], frames: [{ torso: -90, thigh: 92, shin: 120, uarm: -90, farm: -90, at: ['wr', 80, 3] }, { torso: -92, thigh: 0, shin: 4, uarm: -90, farm: -90, at: ['wr', 80, 3] }], cue: '悬垂在单杠上，用腹部把腿抬起到与地面平行，避免身体大幅摆动' },
    russian_twist: { view: 'front', frames: [{ torso: -90, len: { torso: 28, thigh: 14, shin: 14 }, thigh: -50, shin: 80, uarm: 140, farm: 165, uarm2: 120, farm2: 150, at: ['hp', 80, 100] }, { torso: -90, len: { torso: 28, thigh: 14, shin: 14 }, thigh: -50, shin: 80, uarm: 60, farm: 30, uarm2: 40, farm2: 15, at: ['hp', 80, 100] }], cue: '坐姿上身后仰约 45°，双脚离地，转动上身把双手带到身体两侧' },
    mountain_climber: { frames: [{ torso: -28, thigh: 152, shin: 152, foot: 175, thigh2: 40, shin2: 172, foot2: 175, uarm: 90, farm: 90, at: ['wr', 112, 108] }, { torso: -28, thigh: 40, shin: 172, foot: 175, thigh2: 152, shin2: 152, foot2: 175, uarm: 90, farm: 90, at: ['wr', 112, 108] }], cue: '高位平板支撑，双腿快速交替向胸前提膝，臀部不要抬高' },
    ab_wheel: { frames: [{ torso: -50, thigh: 82, shin: 180, foot: 180, uarm: 80, farm: 82, at: ['kn', 60, 106] }, { torso: -12, thigh: 160, shin: 180, foot: 180, uarm: 8, farm: 8, at: ['kn', 60, 106] }], props2: (J) => [circ([J.wr[0], J.wr[1] + 1], 5.5, false, 0.6, 2.2)], cue: '跪姿，收紧腹部慢慢把健腹轮向前推出，再用腹部力量拉回' },
    run: { props: [rect(28, 104, 104, 5), line([126, 104], [138, 52], 3, 0.35)], frames: [{ torso: -82, thigh: 35, shin: 110, foot: 10, thigh2: 118, shin2: 150, foot2: 60, uarm: 130, farm: 50, uarm2: 50, farm2: -40, at: ['hp', 76, 58] }, { torso: -82, thigh: 118, shin: 150, foot: 60, thigh2: 35, shin2: 110, foot2: 10, uarm: 50, farm: -40, uarm2: 130, farm2: 50, at: ['hp', 76, 58] }], cue: '身体微前倾，步频稳定，前脚掌或全脚掌落地，手臂自然前后摆动' },
    high_knees: { frames: [S({ thigh: -8, shin: 92, thigh2: 90, shin2: 90, uarm: 130, farm: 40, uarm2: 50, farm2: -50, at: ['an2', 80, 108] }), S({ thigh: 90, shin: 90, thigh2: -8, shin2: 92, uarm: 50, farm: -50, uarm2: 130, farm2: 40, at: ['an', 80, 108] })], cue: '原地快速交替抬膝到髋部高度，配合摆臂，前脚掌着地' },
    elliptical: { props: [rect(40, 100, 80, 5), line([118, 100], [122, 40], 3, 0.35)], frames: [{ torso: -84, thigh: 70, shin: 105, foot: 10, thigh2: 105, shin2: 90, uarm: 30, farm: -40, at: ['hp', 78, 54] }, { torso: -84, thigh: 105, shin: 90, foot: 10, thigh2: 70, shin2: 105, uarm: 50, farm: -20, at: ['hp', 78, 54] }], cue: '身体直立，双脚踩稳踏板，手脚协调推拉，保持匀速' },
    bike: { props: [line([66, 58], [82, 58], 4, 0.5), line([74, 58], [84, 96], 2.4, 0.4), line([84, 96], [118, 52], 2.4, 0.4), line([112, 52], [124, 52], 3, 0.5), circ([86, 94], 9, false, 0.35)], frames: [{ torso: -42, thigh: 15, shin: 105, foot: 5, thigh2: 70, shin2: 70, uarm: 60, farm: 10, at: ['hp', 74, 56] }, { torso: -42, thigh: 70, shin: 70, foot: 5, thigh2: 15, shin2: 105, uarm: 60, farm: 10, at: ['hp', 74, 56] }], cue: '调好座椅高度，腿在最低点微屈，核心收紧，保持踏频' },
    rower: { props: [rect(24, 100, 120, 5)], frames: [{ torso: -58, thigh: -55, shin: 52, foot: -40, uarm: 8, farm: 6, at: ['hp', 58, 96] }, { torso: -112, thigh: -4, shin: 2, foot: -80, uarm: 135, farm: -10, at: ['hp', 58, 96] }], props2: cableTo([146, 92], 'wr'), cue: '先蹬腿、再后仰、最后拉手，回程顺序相反，保持节奏' },
    stair: { props: [{ t: 'pl', pts: [[30, 109], [30, 103], [62, 103], [62, 97], [94, 97], [94, 91], [130, 91]], o: 0.35 }], frames: [{ torso: -84, thigh: 15, shin: 95, thigh2: 82, shin2: 95, uarm: 100, farm: 60, at: ['an2', 50, 102] }, { torso: -84, thigh: 82, shin: 95, thigh2: 15, shin2: 95, uarm: 70, farm: 30, at: ['an', 80, 96] }], cue: '身体直立不要趴在扶手上，整只脚踩上台阶，匀速攀爬' },
    jump_rope: { view: 'front', frames: [S({ uarm: 75, farm: 15, at: ['an', 85, 108] }), S({ uarm: 75, farm: 15, thigh: 94, shin: 86, at: ['an', 85, 101] })], props2: (J, i) => [{ t: 'q', x1: J.wr2[0], y1: J.wr2[1], cx: 80, cy: i === 0 ? -6 : 128, x2: J.wr[0], y2: J.wr[1], o: 0.5, w: 1.4 }], cue: '用手腕摇绳，前脚掌着地轻跳，膝盖微屈缓冲' },
    burpee: { still: 1, frames: [S({ uarm: -85, farm: -90, at: ['an', 96, 108] }), S({ torso: -40, thigh: 8, shin: 118, uarm: 90, farm: 88, at: ['an', 96, 108] }), { torso: -28, thigh: 152, shin: 152, foot: 175, uarm: 90, farm: 90, at: ['wr', 112, 108] }], cue: '下蹲双手撑地 → 双脚向后跳成平板 → 收回 → 起跳双手上举' },
    jumping_jack: { view: 'front', frames: [S({ uarm: 84, farm: 88, thigh: 92, shin: 90, at: ['hp', 80, 64] }), S({ uarm: -55, farm: -75, thigh: 72, shin: 76, at: ['hp', 80, 62] })], cue: '跳起时双脚分开、双手头顶击掌，落地时还原，前脚掌着地' },
    battle_rope: { frames: [S({ torso: -68, thigh: 40, shin: 112, uarm: 30, farm: -25 }), S({ torso: -68, thigh: 40, shin: 112, uarm: 62, farm: 45 })], props2: (J, i) => [{ t: 'q', x1: J.wr[0], y1: J.wr[1], cx: 128, cy: i === 0 ? 70 : 118, x2: 152, y2: 104, o: 0.5, w: 2 }], cue: '半蹲，核心收紧，双臂快速上下甩动让绳子形成波浪' },
    foam_roller: { props2: () => [circ([104, 101], 7, false, 0.6, 2.4)], frames: [{ torso: -125, thigh: 4, shin: 0, foot: -60, uarm: 100, farm: 100, at: ['hp', 70, 95] }, { torso: -125, thigh: 4, shin: 0, foot: -60, uarm: 100, farm: 100, at: ['hp', 84, 95] }], cue: '把泡沫轴放在酸痛部位下方，用手撑地控制身体前后缓慢滚动' },
    // 伟大伸展: 深弓步, 一只手撑在前脚内侧地面, 另一只手臂向上打开旋转, 眼睛跟随上举的手
    greatest_stretch: { frames: [{ torso: -14, thigh: 15, shin: 95, foot: 0, thigh2: 140, shin2: 150, foot2: 175, uarm: 118, farm: 150, uarm2: 72, farm2: 84, at: ['an', 92, 108] }, { torso: -14, head: -70, thigh: 15, shin: 95, foot: 0, thigh2: 140, shin2: 150, foot2: 175, uarm: -92, farm: -92, uarm2: 72, farm2: 84, at: ['an', 92, 108] }], cue: '大弓步，后腿伸直，同侧手撑在前脚内侧，另一只手臂向上打开带动胸椎旋转，眼睛看向上方的手，左右交替' },
    stretch: { frames: [{ torso: -82, thigh: -2, shin: 0, foot: -80, uarm: -80, farm: -86, at: ['hp', 56, 101] }, { torso: -22, thigh: -2, shin: 0, foot: -80, uarm: 12, farm: 8, at: ['hp', 56, 101] }], cue: '坐姿双腿伸直，从髋部向前折叠伸手够脚尖，每个部位保持 20~30 秒，不要弹振' },
    leg_swing: { frames: [S({ thigh: 40, shin: 70, thigh2: 90, shin2: 90, uarm: 0, farm: 0, at: ['an2', 80, 108] }), S({ thigh: 130, shin: 112, thigh2: 90, shin2: 90, uarm: 0, farm: 0, at: ['an2', 80, 108] })], cue: '扶稳后腿前后摆动，幅度由小到大，热身 1~2 组即可' },
    arm_circle: { view: 'front', frames: [S({ uarm: 0, farm: 0 }), S({ uarm: -60, farm: -60 }), S({ uarm: -2, farm: -2 }), S({ uarm: 55, farm: 60 })], cue: '双臂侧平举，由小到大画圈，前后各转 10~15 圈' },
    kb_swing: { load: 'kb', still: 0, frames: [S({ torso: -30, thigh: 68, shin: 98, uarm: 110, farm: 112 }), S({ uarm: 2, farm: 0 })], cue: '用髋部爆发把壶铃荡到胸前高度，不是用手臂往上抬' },
  };

  /* ---------- 名称匹配: 先具体后宽泛, 匹配不到就不画 ---------- */
  const RULES = [
    [/伟大.*(伸展|拉伸)|最伟大的?(伸展|拉伸)/, 'greatest_stretch'],
    // 带限定词的先匹配(否则会被后面宽泛的「划船」「弯举」等吃掉)
    [/坐[姿式].*(推肩|肩推|推举|肩上推)|坐[姿式].*(哑铃|杠铃).*推肩/, 'seated_ohp'],
    [/(坐[姿式]|器械).*(斜上|上斜).*推|斜上推胸|上斜推胸/, 'incline_seated'],
    [/直立划船|直立提拉/, 'upright_row'], [/划船机/, 'rower'], [/腿弯举|俯卧弯举/, 'leg_curl'], [/腿屈伸/, 'leg_ext'],
    [/上斜.*(推|卧|固定)|哑铃上斜/, 'incline_press'], [/反向飞鸟|俯身.*飞鸟|反飞鸟/, 'rear_fly'], [/哑铃飞鸟|仰卧飞鸟|平板飞鸟/, 'fly_top'],
    [/绳索夹胸|龙门架|飞鸟/, 'cable_fly'], [/蝴蝶机|夹胸/, 'pec_deck'],
    [/坐姿推胸|器械推胸|推胸/, 'chest_press'], [/臂屈伸.*(仰卧|躺)|仰卧臂屈伸|碎颅|颅骨/, 'skull_crusher'],
    [/双杠/, 'dips'], [/卧推/, 'bench_press'], [/俯卧撑/, 'pushup'],
    [/引体/, 'pullup'], [/大剪刀|剪刀下拉|分动式.*(下拉|划船)/, 'big_scissors'], [/下拉/, 'pulldown'], [/直臂/, 'straight_pulldown'], [/坐姿划船|器械划船|绳索划船/, 'seated_row'],
    [/划船机/, 'rower'], [/单[臂手边侧].*划船/, 'one_arm_row'], [/划船|T杠|抱拉/, 'bent_row'], [/罗马尼亚|直腿硬拉|早安|山羊挺|羊氏挺身|挺身|燕氏平衡/, 'rdl'], [/硬拉/, 'deadlift'],
    [/面拉/, 'face_pull'], [/直立划船|直立提拉/, 'upright_row'], [/侧平举/, 'lateral_raise'], [/前平举|开车/, 'front_raise'],
    [/推举|肩推|推肩|过头推|实力推|火箭推|上推|抓推|抓举/, 'ohp'], [/弯举/, 'curl'], [/下压|臂屈伸|曲臂伸|曲伸|绳索三头/, 'pushdown'],
    [/腿举|倒蹬/, 'leg_press'], [/腿屈伸/, 'leg_ext'], [/腿弯举|俯卧弯举/, 'leg_curl'], [/提踵/, 'calf_raise'],
    [/保加利亚|箭步|[弓公]步|分腿蹲/, 'lunge'], [/杠铃深蹲|颈后深蹲|哈克|史密斯.*蹲/, 'squat_bb'], [/深蹲|高脚杯|蹲|螃蟹步/, 'squat'],
    [/臀推/, 'hip_thrust'], [/臀桥/, 'glute_bridge'], [/髋?[外内][展收]/, 'hip_abduction'], [/猎鸟狗|鸟狗/, 'bird_dog'], [/大狗/, 'dog_straight'], [/小狗|驴踢/, 'dog_bent'], [/后踢|俯身抬腿/, 'kickback'],
    [/侧平板|侧板支撑|侧桥|哥本哈根/, 'side_plank'], [/平板支撑|平板|四足|交替摸肩|摸肩|熊爬|超人式/, 'plank'], [/卷腹|仰卧起坐|仰卧抬腿|交替抬腿|左右抬腿|支撑抬腿|死虫/, 'crunch'], [/举腿/, 'hanging_raise'],
    [/俄罗斯转体|转体|炮筒.*(横移|翻转)/, 'russian_twist'], [/登山/, 'mountain_climber'], [/健腹轮|腹轮/, 'ab_wheel'],
    [/高抬腿/, 'high_knees'], [/跑|慢跑|快走/, 'run'], [/椭圆/, 'elliptical'], [/单车|骑行|动感/, 'bike'], [/爬楼|台阶机|跳箱|上箱|跳台阶/, 'stair'],
    [/跳绳/, 'jump_rope'], [/波比|毛毛虫|摸高跳/, 'burpee'], [/开合跳/, 'jumping_jack'], [/战[绳神胜]/, 'battle_rope'],
    [/泡沫轴|筋膜/, 'foam_roller'], [/肩部环绕|绕肩|手臂绕环/, 'arm_circle'], [/动态热身|摆腿|下肢激活/, 'leg_swing'], [/拉伸|伸展/, 'stretch'],
    [/壶铃|药球.*砸|药下砸/, 'kb_swing'],
  ];
  // 门店动作库里由 AI 识别/人工指定的示意图(动作名 → 图形), 优先于内置规则; 值为 '' 表示明确不画
  let CUSTOM = {};
  function ruleKey(n) { const r = RULES.find(([re]) => re.test(n)); return r ? r[1] : null; }
  function match(name, figKey) {
    const n = String(name || '').replace(/\s/g, '');
    if (!n) return null;
    let key = figKey !== undefined && figKey !== null ? figKey : (Object.prototype.hasOwnProperty.call(CUSTOM, n) ? CUSTOM[n] : ruleKey(n));
    if (!key || !P[key]) return null;
    let load = P[key].load || '';
    if (load) {
      if (/哑铃/.test(n)) load = 'db';
      else if (/杠铃|史密斯|T杠/.test(n)) load = 'bb';
      else if (/壶铃/.test(n)) load = 'kb';
      else if (/绳索|器械|自重|徒手/.test(n)) load = '';
    }
    return { key, load, cue: P[key].cue };
  }

  /* ---------- 帧 → 图元 ---------- */
  function prims(key, load, i) {
    const p = P[key];
    const f = p.frames[i];
    const J = solve(f, p.view);
    const out = [];
    out.push(Object.assign(line([10, GROUND + 1], [150, GROUND + 1], 1.5, 0.22), { ground: true }));
    (p.props || []).forEach(x => out.push(x));
    if (p.props2) p.props2(J, i).forEach(x => out.push(x));
    const far = 0.32; const bw = BW;
    const limb = (a, b, o) => out.push(line(a, b, bw, o));
    if (J.el2) { limb(p.view === 'front' ? J.shL : J.sh, J.el2, p.view === 'front' ? 1 : far); limb(J.el2, J.wr2, p.view === 'front' ? 1 : far); }
    if (J.kn2) { limb(p.view === 'front' ? J.hpL : J.hp, J.kn2, p.view === 'front' ? 1 : far); limb(J.kn2, J.an2, p.view === 'front' ? 1 : far); out.push(line(J.an2, J.to2, bw, p.view === 'front' ? 1 : far)); }
    if (p.view === 'front') { limb(J.shL, J.shR, 1); limb(J.hpL, J.hpR, 1); }
    limb(J.hp, J.nk, 1);
    limb(p.view === 'front' ? J.hpR : J.hp, J.kn, 1); limb(J.kn, J.an, 1); limb(J.an, J.to, 1);
    // 侧视图里近侧手臂常与躯干重叠, 先描一圈底色勾边再画手臂, 保证看得清
    if (p.view !== 'front') { out.push(Object.assign(line(J.sh, J.el, bw + 3, 1), { halo: true })); out.push(Object.assign(line(J.el, J.wr, bw + 3, 1), { halo: true })); }
    limb(p.view === 'front' ? J.shR : J.sh, J.el, 1); limb(J.el, J.wr, 1);
    out.push(circ(J.hd, L.head, true, 1));
    loadAt(load, J[p.loadAt || 'wr'], J, p.view).forEach(x => out.push(x));
    return out;
  }

  const f1 = n => Math.round(n * 10) / 10;
  const ATTR = { l: ['x1', 'y1', 'x2', 'y2'], c: ['cx', 'cy'], r: ['x', 'y'], q: ['d'], p: ['points'], pl: ['points'] };
  const valOf = (pr, a) => {
    if (a === 'd') return `M${f1(pr.x1)} ${f1(pr.y1)} Q${f1(pr.cx)} ${f1(pr.cy)} ${f1(pr.x2)} ${f1(pr.y2)}`;
    if (a === 'points') return pr.pts.map(q => `${f1(q[0])},${f1(q[1])}`).join(' ');
    return f1(pr[a]);
  };

  // 统一画框: 所有动作用同样大小的 4:3 画框(人物大小、线条粗细完全一致), 地面线对齐在同一高度,
  // 只按各自内容的水平中心左右居中
  const BOX_W = 160; const BOX_H = 120; const BOX_BOTTOM = GROUND + 5;
  function contentBox(frames) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
    frames.forEach(list => list.forEach((pr) => {
      if (pr.ground) return;
      if (pr.t === 'l') { add(pr.x1, pr.y1, pr.w / 2); add(pr.x2, pr.y2, pr.w / 2); }
      else if (pr.t === 'c') add(pr.cx, pr.cy, pr.r);
      else if (pr.t === 'r') { add(pr.x, pr.y, 0); add(pr.x + pr.w, pr.y + pr.h, 0); }
      else if (pr.t === 'q') { add(pr.x1, pr.y1, 1); add(pr.x2, pr.y2, 1); add((pr.x1 + pr.x2) / 2, (pr.y1 + pr.y2 + pr.cy * 2) / 4, 1); }
      else if (pr.pts) pr.pts.forEach(q => add(q[0], q[1], 1));
    }));
    return { x0, y0, x1, y1 };
  }
  function fitBox(frames) {
    const c = contentBox(frames);
    return { x: (c.x0 + c.x1) / 2 - BOX_W / 2, y: BOX_BOTTOM - BOX_H, w: BOX_W, h: BOX_H };
  }

  function svg(name, opt) {
    opt = opt || {};
    const m = typeof name === 'object' ? name : match(name);
    if (!m || !P[m.key]) return '';
    const p = P[m.key];
    const n = p.frames.length;
    const frames = p.frames.map((_, i) => prims(m.key, m.load, i));
    const anim = opt.anim !== false;
    const dur = n > 2 ? n * 1.1 : 2.6;
    // 两帧: 起始→发力位→停顿→还原; 多帧: 依次循环
    const seq = n === 2 ? [0, 1, 1, 0, 0] : [...frames.keys(), 0];
    const kt = n === 2 ? '0;0.38;0.55;0.92;1' : seq.map((_, i) => f1(i / (seq.length - 1))).join(';');
    // 静态缩略图显示最有辨识度的一帧(默认发力位, 硬拉类显示屈髋位)
    const still = opt.frame != null ? opt.frame : (p.still != null ? p.still : (n === 2 ? 1 : 0));
    const els = frames[0].map((pr, idx) => {
      const base = frames[still][idx];
      const st = `stroke="currentColor" stroke-opacity="${pr.o}" stroke-width="${pr.w || 2}" stroke-linecap="round" stroke-linejoin="round"`;
      const anims = (anim ? ATTR[pr.t] : []).map((a) => {
        const vals = seq.map(i => valOf(frames[i][idx], a));
        if (vals.every(v => v === vals[0])) return '';
        return `<animate attributeName="${a}" values="${vals.join(';')}" keyTimes="${kt}" dur="${dur}s" repeatCount="indefinite"/>`;
      }).join('');
      if (pr.t === 'l' && pr.halo) return `<line x1="${valOf(base, 'x1')}" y1="${valOf(base, 'y1')}" x2="${valOf(base, 'x2')}" y2="${valOf(base, 'y2')}" stroke-width="${pr.w}" stroke-linecap="round" style="stroke:var(--afig-bg,#fff)">${anims}</line>`;
      if (pr.t === 'l') return `<line x1="${valOf(base, 'x1')}" y1="${valOf(base, 'y1')}" x2="${valOf(base, 'x2')}" y2="${valOf(base, 'y2')}" ${st}>${anims}</line>`;
      if (pr.t === 'c') return `<circle cx="${valOf(base, 'cx')}" cy="${valOf(base, 'cy')}" r="${pr.r}" ${pr.fill ? `fill="currentColor" fill-opacity="${pr.o}" stroke="none"` : `fill="none" ${st}`}>${anims}</circle>`;
      if (pr.t === 'r') return `<rect x="${valOf(base, 'x')}" y="${valOf(base, 'y')}" width="${pr.w}" height="${pr.h}" rx="2" fill="currentColor" fill-opacity="${pr.o}">${anims}</rect>`;
      if (pr.t === 'q') return `<path d="${valOf(base, 'd')}" fill="none" ${st}>${anims}</path>`;
      if (pr.t === 'p') return `<polygon points="${valOf(base, 'points')}" fill="currentColor" fill-opacity="${pr.o}">${anims}</polygon>`;
      if (pr.t === 'pl') return `<polyline points="${valOf(base, 'points')}" fill="none" ${st}>${anims}</polyline>`;
      return '';
    }).join('');
    const size = opt.size ? ` width="${opt.size}" height="${f1(opt.size * 0.75)}"` : '';
    const b = fitBox(frames);
    return `<svg class="afig" viewBox="${f1(b.x)} ${f1(b.y)} ${f1(b.w)} ${f1(b.h)}"${size} xmlns="http://www.w3.org/2000/svg" aria-label="${m.key}">${els}</svg>`;
  }

  // canvas 静帧(训练计划海报): 画在 (x,y,w,h) 区域内
  function draw(ctx, name, x, y, w, h, color, bg) {
    const m = typeof name === 'object' ? name : match(name);
    if (!m || !P[m.key]) return false;
    const p = P[m.key];
    const list = prims(m.key, m.load, p.still != null ? p.still : (p.frames.length === 2 ? 1 : 0));
    const b = fitBox(p.frames.map((_, i) => prims(m.key, m.load, i)));
    const s = Math.min(w / b.w, h / b.h);
    const ox = x + (w - b.w * s) / 2 - b.x * s; const oy = y + (h - b.h * s) / 2 - b.y * s;
    const X = v => ox + v * s; const Y = v => oy + v * s;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    list.forEach((pr) => {
      if (pr.ground && (pr.x1 < b.x || pr.x2 > b.x + b.w)) pr = Object.assign({}, pr, { x1: b.x + 4, x2: b.x + b.w - 4 });
      ctx.globalAlpha = pr.halo ? 1 : pr.o;
      ctx.strokeStyle = pr.halo ? (bg || '#fff') : color; ctx.fillStyle = color;
      ctx.lineWidth = (pr.w || 2) * s;
      ctx.beginPath();
      if (pr.t === 'l') { ctx.moveTo(X(pr.x1), Y(pr.y1)); ctx.lineTo(X(pr.x2), Y(pr.y2)); ctx.stroke(); }
      else if (pr.t === 'c') { ctx.arc(X(pr.cx), Y(pr.cy), pr.r * s, 0, Math.PI * 2); if (pr.fill) ctx.fill(); else ctx.stroke(); }
      else if (pr.t === 'r') { ctx.fillRect(X(pr.x), Y(pr.y), pr.w * s, pr.h * s); }
      else if (pr.t === 'q') { ctx.moveTo(X(pr.x1), Y(pr.y1)); ctx.quadraticCurveTo(X(pr.cx), Y(pr.cy), X(pr.x2), Y(pr.y2)); ctx.stroke(); }
      else if (pr.t === 'p' || pr.t === 'pl') { pr.pts.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); if (pr.t === 'p') { ctx.closePath(); ctx.fill(); } else ctx.stroke(); }
    });
    ctx.restore();
    return true;
  }

  // 每种图形的中文说明(管理端下拉选择 / 服务端让 AI 归类时用)
  const LABELS = {
    squat_bb: '杠铃深蹲(杠铃扛肩下蹲)', squat: '徒手/哑铃深蹲', lunge: '箭步蹲/弓步/分腿蹲', deadlift: '硬拉(屈膝从地面拉起)', rdl: '罗马尼亚硬拉(直腿屈髋)',
    bench_press: '平板卧推(躺凳上推)', incline_press: '上斜卧推', chest_press: '坐姿器械推胸', incline_seated: '坐姿斜上推胸(靠背倾斜的器械)', seated_ohp: '坐姿推肩(带靠背)', fly_top: '仰卧飞鸟', cable_fly: '绳索夹胸/站姿飞鸟',
    pec_deck: '蝴蝶机夹胸', pushup: '俯卧撑', pullup: '引体向上', big_scissors: '大剪刀(坐姿分动式高位下拉/划船器械)', pulldown: '高位下拉', seated_row: '坐姿划船(绳索/器械)',
    bent_row: '俯身划船(杠铃/哑铃/T杠)', one_arm_row: '单臂哑铃划船(单膝单手撑凳)', greatest_stretch: '伟大伸展(弓步+单手撑地+单臂上举旋转)', straight_pulldown: '直臂下压', ohp: '肩上推举', lateral_raise: '侧平举', front_raise: '前平举',
    rear_fly: '俯身反向飞鸟', face_pull: '面拉', upright_row: '直立划船', curl: '二头弯举', pushdown: '三头下压',
    skull_crusher: '仰卧臂屈伸', dips: '双杠臂屈伸', leg_press: '腿举', leg_ext: '腿屈伸', leg_curl: '俯卧腿弯举',
    calf_raise: '提踵', glute_bridge: '臀桥', hip_thrust: '杠铃臀推', hip_abduction: '髋外展', kickback: '绳索后踢腿(站姿)', dog_bent: '小狗/驴踢(跪撑屈膝抬腿)', dog_straight: '大狗(跪撑直腿后抬)', bird_dog: '猎鸟狗(跪撑对侧手脚伸直)',
    plank: '平板支撑', side_plank: '侧平板支撑', crunch: '卷腹', hanging_raise: '悬垂举腿', russian_twist: '俄罗斯转体',
    mountain_climber: '登山跑', ab_wheel: '健腹轮', run: '跑步/跑步机', high_knees: '高抬腿', elliptical: '椭圆机',
    bike: '单车/骑行', rower: '划船机', stair: '爬楼/台阶', jump_rope: '跳绳', burpee: '波比跳',
    jumping_jack: '开合跳', battle_rope: '战绳', foam_roller: '泡沫轴放松', stretch: '坐姿体前屈/拉伸', leg_swing: '摆腿/动态热身',
    arm_circle: '手臂绕环', kb_swing: '壶铃摆动',
  };
  const api = {
    _contentBox: (k) => contentBox(P[k].frames.map((_, i) => prims(k, P[k].load || '', i))), _box: { w: BOX_W, h: BOX_H, bottom: BOX_BOTTOM },
    match, svg, draw, keys: Object.keys(P), labels: LABELS, ruleKey: n => ruleKey(String(n || '').replace(/\s/g, '')),
    cueOf: k => (P[k] || {}).cue || '',
    setCustom(map) { CUSTOM = {}; Object.keys(map || {}).forEach((k) => { CUSTOM[String(k).replace(/\s/g, '')] = map[k] || ''; }); },
  };
  root.ActionFig = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
