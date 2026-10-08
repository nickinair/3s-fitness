# 健身房管理系统 API 契约

Base URL: `http://localhost:8090/api`

## 通用约定
- 响应格式恒为 `{code, msg, data}`；`code=0` 成功，非 0 为业务错误（HTTP 仍为 200），`msg` 为中文错误提示直接可展示给用户。401/403 会返回 HTTP 401/403。
- 认证：请求头 `Authorization: Bearer <token>`。员工与会员是两套登录。
- 分页请求：`?page=1&size=20`；分页响应 `data: {list, total, page}`。
- 列表导出：加 `?export=csv` 直接下载 CSV（members/cards/finance 明细支持）。
- 门店切换：admin 角色可传请求头 `X-Club-Id: <clubId>`；其他角色固定本店。
- 时间格式均为 `YYYY-MM-DD HH:mm:ss` 字符串；金额为字符串或数字（DECIMAL）。

## 角色
`platform`平台 / `admin`商户管理员 / `manager`店长 / `membership`会籍顾问 / `reception`前台 / `coach`教练

## 字典（前端需要映射展示）
- card_kind: 1次卡 2时间卡 3储值卡 4私教卡
- 会员卡 status: 0待开卡 1使用中 2已过期 3已暂停 4已停用 5已退卡
- 会员 expire_status: 0无卡 1在籍 2已过期
- 私教预约 status: 0待确认 1已确认 2已取消 3已完成 4已爽约; confirm_status: 0无 1待学员确认消课 2已确认
- 团课预约 status: 0候补 1已约 2已核销 3已取消 4已爽约
- 收款流水 type: 1开卡 2续卡 3充值 4退卡；耗卡 scene: 1自由训练 2私教消课 3团课核销 4储值消费 5爽约扣次
- pay_method: wechat微信 alipay支付宝 cash现金 pos刷卡 transfer转账
- 维护 record_type: 1电话 2到店 3微信 4其他; label_levels: 0无 1A 2B 3C
- 排课 status: 1正常 2已取消 3已结课
- 员工 role 同上角色表

## 认证
- POST /auth/login {username,password} → {token, user:{id,username,realname,role,merchant_id,club_id,coach_id}}
- POST /auth/member/login {phone,password} → {token,user}
- POST /auth/member/register {phone,realname,password,gender}
- POST /auth/change-password {old_password,new_password} (员工)

演示账号（密码均 admin123）: platform平台 / admin商户 / manager01店长 / sale01顾问 / front01前台 / coach01教练。会员: 13911110001~16 密码 123456。

## 通用配置（员工端）
- GET /clubs; PUT /clubs/:id {name,address,phone,intro,open_time}
- GET /sources; POST /sources {title,sort}; DELETE /sources/:id
- GET /staff; POST /staff {username,password,realname,phone,role,club_id}; PUT /staff/:id {realname,phone,role,club_id,status}; POST /staff/:id/reset-password {password}
- GET /notices; POST /notices {title,content}
- GET /logs （admin/manager）

## 会员
- GET /members?status=active|expired|none|all&keyword&card_type_id&membership_id&coach_id&expire_within&page&size
  → {list,total,stats:{active_count,today_expire,expired_count,month_new}}；list 项含 card_count, card_names
- GET /members/overview → {counts:{total,active,expired,none}, trend[{month,cnt}], byCard[{name,cnt}], bySource[{name,cnt}]}
- GET /members/:id → {profile, cards, recharges, spends, maintains, checkins, ptBookings, groupBookings, contracts}
- POST /members {phone,realname,nickname,gender,birthday,id_card_number,address,source_id,source_name,membership_id,membership_name,coach_id,coach_name,label_levels,remark}（手机号重复返回 code=1001 与提示）
- PUT /members/:id 同上字段
- POST /members/assign {ids:[],membership_id,membership_name,coach_id,coach_name,type:'member'|'potential'}
- POST /members/:id/blacklist {is_black:0|1, reason}
- 潜客: GET /potentials?keyword&label&converted=0|1; POST /potentials; PUT /potentials/:id; POST /potentials/:id/convert
- 维护: GET /maintain-records?vip_user_id&vip_user_type=1|2&membership_id; POST /maintain-records {vip_user_id,vip_user_type,record_type,content,is_todo,todo_time}

## 会员卡
- GET /card-categories?kind&status; POST /card-categories; PUT /card-categories/:id
  字段: card_kind,title,intro,expire_days,total_counts,price,original_price,gift_money,course_permission,book_limit_day/week/month30,advance_book_limit,free_cancel_total,free_cancel_month_overtime,noshow_limit_30d,pause_times,pause_max_days,open_card_mode(1立即2首次使用3指定日期),latest_open_days,book_time_range,group_advance_range("7,2"=提前7天开约/前2小时截止),cancel_deadline_hours,free_train_time_range("06:30-22:30"),online_sale,purchase_limit,student_only,cover_img,sort,status
- POST /cards/open {vip_id 或 new_member:{realname,phone,gender,source_id,source_name}, card_type_id, actual_money, retainage, pay_method, open_card_mode, open_date, membership_id, membership_name, coach_id, coach_name, remark} → {cardId,contractId,contract_number}
- POST /cards/:id/renew {add_counts,add_days,actual_money,gift_money,pay_method,membership_id,membership_name,remark}
- POST /cards/:id/pause {days}; POST /cards/:id/resume
- POST /cards/:id/stop {reason}; POST /cards/:id/enable （admin/manager）
- POST /cards/:id/refund {refund_money,reason,pay_method} （admin/manager）
- PUT /cards/:id {expire_time,left_counts,left_money,membership_id,membership_name,coach_id,coach_name,remark,reason} 改卡（admin/manager）
- GET /cards?vip_id&status&kind&keyword&card_type_id&expire_within → {list,total}
- GET /cards/:id → {card,recharges,spends,category}
- GET /contracts?keyword&sign_status; GET /contracts/:id → 含 content 正文与 sign_img

## 教练
- GET /coaches?status; PUT /coaches/:id {realname,nickname,good_at,desc,detail,sort,status}
- GET /ptrain-courses; POST/PUT /ptrain-courses/:id {title,course_type,duration,people_count,card_scope:[],coach_ids:[],intro,sort,status}
- GET /coach-rests?coach_id&from&to; POST /coach-rests {coach_id,rest_date,from_time,to_time,remark}; DELETE /coach-rests/:id
- GET /coaches/:id/slots?date&duration → [{from_time,to_time,available,reason}]
- GET /coaches/:id/schedule?from&to → {bookings,classes,rests}
- POST /ptrain-bookings {coach_id,vip_id,course_id,date,from_time,card_id,remark} 员工/教练代约（直接已确认）
- GET /ptrain-bookings?coach_id&vip_id&date&date_from&date_to&status&keyword （教练角色自动只看自己）
- POST /ptrain-bookings/:id/confirm | /cancel {reason} | /noshow
- POST /ptrain-bookings/:id/start-finish 教练发起消课（→待学员确认）
- POST /ptrain-bookings/:id/finish {remark} 员工代确认消课（admin/manager/reception）
- POST /ptrain-records/manual {vip_id,coach_id,card_id,costs,remark} 补消课（admin/manager）
- GET /ptrain-records?coach_id&vip_id&month
- GET /coaches/:id/students → [{id,realname,phone,card_type_name,left_counts,counts,expire_time,last_lesson_time,lessons_30d}]
- GET /coaches/performance?month → [{id,realname,lessons,spend_money,sales_money,sales_orders}]

## 团课
- GET /group-courses; POST/PUT /group-courses/:id {title,duration,difficulty,deduct_num,card_scope,intro,tags,status}
- GET /classrooms; POST/PUT /classrooms/:id {title,capacity,status}
- GET /syllabus?from&to&coach_id （周视图数据）
- GET /syllabus/:id → {syllabus, bookings}
- POST /syllabus {group_id,coach_id,classroom_id,start_time,people_count,lower_limit,deduct_num,is_vipuser_sub,self_cancel}
- PUT /syllabus/:id; POST /syllabus/:id/cancel {reason}
- POST /syllabus/copy-week {from_week_start,to_week_start} （YYYY-MM-DD 周一）
- POST /syllabus/:id/book {vip_id,card_id} 代约（满员自动候补 → data.waitlist=true）
- POST /syllabus-bookings/:id/cancel {reason}（正式取消后候补自动转正）
- POST /syllabus-bookings/:id/checkin 到课核销（扣次+耗课流水）
- POST /syllabus/:id/settle 课后结算（未到→爽约）
- GET /syllabus-bookings?syllabus_id&vip_id&status&date&keyword

## 签到
- POST /checkin {vip_id, card_id?, store_fee?} → {card_type_name,deduct_info,realname}（不传 card_id 自动选卡: 时间卡>次卡>储值卡；黑名单/场内未出场会报错）
- POST /checkin/:id/out 出场; POST /checkin/:id/ring {ring_no,ring_status}
- GET /checkins?date&keyword&in_gym=1
- GET /checkin-report?from&to → {byDay,byHour}

## 财务
- GET /finance/dashboard?date → {date,today:{new_members,today_expire,active_members,recharge_money,spend_money,group_classes,pt_lessons,checkins,group_spend,pt_spend,train_spend},yesterday:{同},classes[],ptToday[]}
- GET /finance/monthly?month=YYYY-MM → {cur,prev,memberTrend,revenueTrend,byCardType,spendByScene,sales,coachHours}
- GET /finance/recharges?from&to&type&pay_method&keyword&membership_id → {list,total,sum}
- GET /finance/spends?from&to&scene&keyword → {list,total,sum}
- GET /finance/sales?month → {list:[{membership_id,name,orders,money,new_orders,renew_money}],details}（membership 角色只看自己）

## 会员端 H5（/api/member/*, 会员 token）
- GET /member/home → {clubs,banners,vip,cards,upcoming,pendingConfirm,notices}
- GET /member/card-categories （在线可售）
- POST /member/buy-card {card_type_id} （模拟微信支付成功）→ {cardId,contractId}
- GET /member/my-cards; GET /member/my-cards/:id → {card,recharges,spends}
- GET /member/schedule?date; GET /member/schedule/:id/available-cards; POST /member/schedule/:id/book {card_id}
- GET /member/coaches; GET /member/coaches/:id → {coach,courses}; GET /member/coaches/:id/slots?date&duration
- GET /member/my-pt-cards?course_id; POST /member/pt-bookings {coach_id,course_id,date,from_time,card_id}（→待教练确认）
- GET /member/my-bookings → {pt,group}; POST /member/pt-bookings/:id/cancel; POST /member/group-bookings/:id/cancel
- GET /member/pending-confirms; POST /member/pt-bookings/:id/confirm-finish （学员确认消课）
- POST /member/checkin {card_id?} 自助签到; GET /member/my-checkins
- GET /member/my-contracts; GET /member/my-contracts/:id; POST /member/my-contracts/:id/sign {sign_img: base64}
- GET/PUT /member/profile

## 平台端（/api/platform/*, platform token）
- GET /platform/stats → {stats:{merchants,active_merchants,clubs,members,staff,month_revenue,total_revenue},trend,byMerchant}
- GET /platform/merchants; POST /platform/merchants {name,contact,phone,expire_time,club_name,club_address,admin_username,admin_password}; PUT /platform/merchants/:id {..status..}
- GET /platform/merchants/:id/clubs; POST /platform/merchants/:id/clubs
- GET /platform/notices; POST /platform/notices {merchant_id,title,content}; DELETE /platform/notices/:id
- GET /platform/logs?merchant_id

---
# v2 增量（2026-09-07 需求会）

## 规则变化
- 私教代约 POST /ptrain-bookings 仅 admin/manager 可调用（教练/前台 403）——教练端不做代约
- 消耗/收款流水的 club_id 一律=卡的归属门店(开卡店)，跨店上课不改变归属
- 门店已改名: 1=3S健身·巴南店 2=3S健身·南坪店
- POST /cards/open 新增 club_id 参数（开卡门店，默认当前店，表单需显眼展示）
- 会员 coach_id/coach_name 语义=主教练；新增 sub_coach_id/sub_coach_name 副教练（POST/PUT /members 支持；注意 PUT 必须回传 coach 字段否则会清空）
- biz_club_coach 新增 lesson_price 课时单价（展示口径）；PUT /coaches/:id 已支持 lesson_price 字段（编辑档案时务必回传，否则清零）
- 卡类型新增 milestone_type(0关 1按课时 2按天数)/milestone_interval 字段（POST/PUT /card-categories 均支持）
- 会员端 GET /member/coaches 返回结构变为 {list, my_coach_id, my_sub_coach_id}，list 项含 lesson_price
- 会员端购卡: POST /member/buy-card 已删除 → POST /member/card-intents {card_type_id, remark}（提交购卡意向，线下收款）；GET /member/my-card-intents

## 新端点（员工端，均需 staff token）
- 体测: GET /body-records?vip_id；POST /body-records {vip_id,record_date,weight,body_fat,muscle,bust,waist,hip,remark}；DELETE /body-records/:id
- 里程碑: GET /milestones?status=0|1&vip_id&keyword（教练角色自动只看自己名下）→{list,total}；GET /milestones/pending-count→{count}；POST /milestones/:id/summary {summary}
  字段: realname/coach_name/type(1按课时2按天)/node_value/status(0待总结1已总结)/summary/summary_time/card_type_name
- 动作库: GET /training-actions?part&keyword（part: 胸/背/肩/手臂/腿/臀/核心/有氧/拉伸; merchant_id=0 为系统预置不可改）；POST/PUT/DELETE /training-actions(/:id) {name,part,equipment,description}
- 训练计划: GET /training-plans?vip_id&coach_id&is_template&keyword→{list,total}；GET/POST/PUT/DELETE /training-plans(/:id)
  {title, vip_id(0=模板), coach_id(非教练角色需传), plan_date, items:[{action_name,sets,reps,unit(次/秒/分钟),weight,rest,remark,part?}], note, is_template}
  POST /training-plans/parse {text} → items[]（AI/语音一句话解析, 如"卧推4组12次60kg，跑步机20分钟"）
  POST /training-plans/:id/push（推送会员+短信）
- 购卡意向: GET /card-intents?status=0待跟进|1已开卡|2已关闭→{list,total}；GET /card-intents/pending-count；POST /card-intents/:id/close {remark}（开卡时自动核销为已开卡）
- 短信记录: GET /sms-logs?scene&keyword（admin/manager）→{list,total,monthCount}；scene: buy_card购卡/lesson_done销课/card_low卡将耗尽/milestone里程碑/plan_push计划推送/intent意向确认；status 0=模拟发送(未配置腾讯云凭证)
- 教练消耗统计: GET /finance/coach-consume?from&to→{ranking:[{coach_id,name,lessons,money,group_classes}],daily:[{d,coach_id,coach_name,lessons,money}]}；&export=csv 导出
- 消课记录导出: GET /ptrain-records?...&export=csv
- 月报新增 open_cards 开卡数字段（finance/monthly cur/prev 内）

## 新端点（会员端，member token）
- GET /member/milestones → {milestones[], bodyRecords[], totalLessons}
- GET /member/body-records
- GET /member/training-plans；GET /member/training-plans/:id（items 为 JSON 字符串需 parse）
- POST /member/card-intents；GET /member/my-card-intents
- GET /member/profile 新增 coach_id/sub_coach_id/sub_coach_name
