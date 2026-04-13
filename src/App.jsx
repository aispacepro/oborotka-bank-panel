import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  LayoutDashboard, Zap, Users, TrendingUp, AlertTriangle, Archive, CreditCard, Ban, Download, Settings,
  Search, ChevronRight, ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, AlertCircle,
  Eye, Plus, X, Check, Loader2, Info, ArrowLeft, Command, Shield, FileText, Hash,
  Building2, Calendar, ExternalLink, Pen, Mail, Phone, Lock, Unlock, ToggleLeft, ToggleRight,
  RefreshCw, Filter, MoreVertical, ArrowUpRight, ArrowDownRight, ChevronLeft, Bell,
  Inbox, GitBranch
} from "lucide-react";

// ─── THEME ───
const B = {
  accent: "#1E40AF", accentL: "#DBEAFE",
  green: "#059669", greenL: "#D1FAE5",
  red: "#DC2626", redL: "#FEE2E2",
  yellow: "#D97706", yellowL: "#FEF3C7",
  orange: "#EA580C",
  purple: "#7C3AED", purpleL: "#F3E8FF",
  t1: "#1E293B", t2: "#64748B", t3: "#94A3B8",
  border: "#E2E8F0", bg: "#F8FAFC", sidebar: "#0F172A",
};

// ─── DATA ───
const COMPANIES = [
  {id:1, name:"ООО «СитиБетонСтрой»", unp:"169066611", role:"creditor", status:"active",
   regDate:"2026-01-15", director:"Дерябина О.Н.", phone:"+375 29 123-45-67",
   limit:830000, used:450000, available:380000, rate:25, scoringClass:"—",
   scoringType:"simplified", riskLevel:"low"},
  {id:2, name:"ООО «БелТехСнаб»", unp:"190456789", role:"debtor", status:"active",
   regDate:"2026-01-15", director:"Петров И.В.", limit:200000, used:85000,
   available:115000, rate:25, scoringClass:"A", scoringType:"full", riskLevel:"low",
   scoring:{quantitative:78, qualitative:82, total:160, maxScore:200}},
  {id:3, name:"ЧУП «СтройИнвест»", unp:"290123456", role:"debtor", status:"active",
   regDate:"2026-02-01", director:"Козлов А.В.", limit:150000, used:60000,
   available:90000, rate:30, scoringClass:"B", scoringType:"full", riskLevel:"medium",
   scoring:{quantitative:62, qualitative:65, total:127, maxScore:200}},
  {id:4, name:"ООО «АгроТрейд Плюс»", unp:"390456789", role:"debtor", status:"active",
   regDate:"2026-01-20", director:"Сидоров Н.А.", limit:180000, used:120000,
   available:60000, rate:25, scoringClass:"A", scoringType:"full", riskLevel:"low",
   scoring:{quantitative:75, qualitative:80, total:155, maxScore:200}},
  {id:5, name:"ИП Козловский А.В.", unp:"790123456", role:"debtor", status:"rejected",
   regDate:"2026-03-18", director:"Козловский А.В.", limit:0, used:0,
   rate:0, scoringClass:"CC", scoringType:"full", riskLevel:"high",
   scoring:{quantitative:28, qualitative:35, total:63, maxScore:200}},
  {id:6, name:"ООО «ГрандЛогистик»", unp:"690012345", role:"debtor", status:"active",
   regDate:"2026-01-15", director:"Лукашенко В.В.", limit:150000, used:25000,
   available:125000, rate:25, scoringClass:"A", scoringType:"full", riskLevel:"low",
   scoring:{quantitative:72, qualitative:78, total:150, maxScore:200}},
];

const ALL_DEALS = [
  {id:"УС-2026-0042", creditorId:1, debtorId:2, amount:45000, shipDate:"2026-03-15",
   dueDate:"2026-06-13", status:"active", term:90, discount:2774, toReceive:42226,
   daysLeft:83, docType:"ttn", ecpBank:"signed", ecpCreditor:"signed", ecpDebtor:"confirmed",
   supAg:"ДС №42 к ГД №1", funded:true, fundedDate:"2026-03-18"},
  {id:"УС-2026-0041", creditorId:1, debtorId:3, amount:60000, shipDate:"2026-03-10",
   dueDate:"2026-05-09", status:"active", term:60, discount:2022, toReceive:57978,
   daysLeft:48, docType:"act", ecpBank:"signed", ecpCreditor:"signed", ecpDebtor:"pending",
   supAg:"ДС №41 к ГД №1", funded:true, fundedDate:"2026-03-13"},
  {id:"УС-2026-0040", creditorId:1, debtorId:4, amount:120000, shipDate:"2026-03-01",
   dueDate:"2026-05-30", status:"active", term:90, discount:7397, toReceive:112603,
   daysLeft:69, docType:"ttn", ecpBank:"signed", ecpCreditor:"signed", ecpDebtor:"confirmed",
   supAg:"ДС №40 к ГД №1", funded:true, fundedDate:"2026-03-04"},
  {id:"УС-2026-0035", creditorId:1, debtorId:6, amount:25000, shipDate:"2026-01-15",
   dueDate:"2026-03-16", status:"overdue", term:60, discount:1233, toReceive:23767,
   daysLeft:-28, docType:"act", ecpBank:"signed", ecpCreditor:"signed", ecpDebtor:"confirmed",
   supAg:"ДС №35 к ГД №1", funded:true, fundedDate:"2026-01-18"},
  {id:"УС-2026-0036", creditorId:1, debtorId:2, amount:30000, shipDate:"2026-02-01",
   dueDate:"2026-04-02", status:"paid", term:60, discount:1233, toReceive:28767,
   daysLeft:0, docType:"ttn", ecpBank:"signed", ecpCreditor:"signed", ecpDebtor:"confirmed",
   supAg:"ДС №36 к ГД №1", funded:true, paidDate:"2026-03-28"},
];

const PIPELINE = [
  // INBOX
  {id:"REQ-013", type:"debtor_scoring", company:"ООО «ТрансЛогистик»", unp:"490123456",
   creditorId:1, stage:"inbox", procedure:"inbox", priority:"medium", created:"2026-03-24", slaStart:"2026-03-24",
   recommendedLimit:150000, recommendedProcedure:"simple",
   docs:{anketa:true, balanceQ4:true, pl:true, consentBki:true, consentOeb:true}, comments:[]},
  {id:"REQ-014", type:"deal_funding", dealId:"УС-2026-0047", creditorId:1, debtorId:4,
   amount:450000, stage:"inbox", procedure:"inbox", priority:"high", created:"2026-03-25", slaStart:"2026-03-25",
   recommendedProcedure:"full",
   checks:{antiduble:true, bisc:true, limit:true, overdue:true, stoplist:true},
   docs:{ttn:true, esfchf:true, supAg:"pending_bank_ecp"}, comments:[]},
  {id:"REQ-015", type:"creditor_onboarding", company:"ООО «СтройМастер»", unp:"190999888",
   stage:"inbox", procedure:"inbox", priority:"low", created:"2026-03-25", slaStart:"2026-03-25",
   recommendedProcedure:"simple",
   docs:{anketa:true, consent_bki:true, consent_oeb:true, balance:false}, comments:[]},
  // SIMPLE
  {id:"REQ-001", type:"creditor_onboarding", company:"ООО «СитиБетонСтрой»", unp:"169066611",
   stage:"funded", procedure:"simple", priority:"medium", created:"2026-01-10", slaStart:"2026-01-10",
   docs:{anketa:true, consent_bki:true, consent_oeb:true, balance:true},
   comments:[{user:"Иванов А.С.",date:"2026-01-12",text:"Стоп-лист чист, Легат ОК."}]},
  {id:"REQ-002", type:"debtor_scoring", company:"ООО «НовоТрейд»", unp:"590123456",
   creditorId:1, stage:"received", procedure:"simple", priority:"high", created:"2026-03-20", slaStart:"2026-03-20",
   docs:{anketa:true, balanceQ4:true, pl:true, consentBki:true, consentOeb:true}, comments:[]},
  {id:"REQ-003", type:"debtor_scoring", company:"ЧУП «ЕвроКомплект»", unp:"194567890",
   creditorId:1, stage:"expertise", procedure:"simple", priority:"medium", created:"2026-03-15", slaStart:"2026-03-16",
   expertise:{ka:true, legal:false, oeb:true, orz:false},
   docs:{anketa:true, balanceQ4:true, pl:true, consentBki:true, consentOeb:true},
   comments:[{user:"Смирнов Д.К.",date:"2026-03-17",text:"КА завершён. Ждём ЮУ и ОРЗ."}]},
  {id:"REQ-005", type:"deal_funding", dealId:"УС-2026-0043", creditorId:1, debtorId:2,
   amount:55000, stage:"decision", procedure:"simple", priority:"high", created:"2026-03-22", slaStart:"2026-03-22",
   checks:{antiduble:true, bisc:true, limit:true, overdue:true, stoplist:true},
   docs:{ttn:true, esfchf:true, supAg:"pending_bank_ecp"},
   comments:[{user:"Иванов А.С.",date:"2026-03-22",text:"Все автопроверки пройдены."}]},
  {id:"REQ-008", type:"deal_funding", dealId:"УС-2026-0045", creditorId:1, debtorId:6,
   amount:35000, stage:"funded", procedure:"simple", priority:"low", created:"2026-03-05", slaStart:"2026-03-05",
   checks:{antiduble:true, bisc:true, limit:true, overdue:true, stoplist:true},
   docs:{ttn:true, esfchf:true, supAg:"signed"},
   comments:[{user:"Петрова Н.А.",date:"2026-03-08",text:"Профинансировано 35 000 BYN."}]},
  {id:"REQ-009", type:"debtor_scoring", company:"ООО «БелАгроХим»", unp:"390888123",
   creditorId:1, stage:"received", procedure:"simple", priority:"low", created:"2026-03-25", slaStart:"2026-03-25",
   docs:{anketa:true, balanceQ4:false, pl:false, consentBki:true, consentOeb:true}, comments:[]},
  {id:"REQ-010", type:"creditor_onboarding", company:"ООО «ПромСервис Плюс»", unp:"190777456",
   stage:"expertise", procedure:"simple", priority:"medium", created:"2026-03-21", slaStart:"2026-03-21",
   docs:{anketa:true, consent_bki:true, consent_oeb:true, balance:false},
   expertise:{stoplist:true, legat:true, profit:false},
   comments:[{user:"Козлова Е.В.",date:"2026-03-22",text:"Стоп-лист и Легат чисты."}]},
  {id:"REQ-011", type:"debtor_scoring", company:"ИП Козловский А.В.", unp:"790123456",
   creditorId:1, stage:"rejected", procedure:"simple", priority:"medium", created:"2026-03-18", slaStart:"2026-03-18",
   rejectReason:"Скоринг-класс CC (63/200).", rejectDate:"2026-03-20", rejectedBy:"Иванов А.С.",
   docs:{anketa:true, balanceQ4:true, pl:true, consentBki:true, consentOeb:true},
   expertise:{ka:true, legal:true, oeb:true, orz:true},
   comments:[{user:"Иванов А.С.",date:"2026-03-20",text:"Отклонено. Класс CC."}]},
  // FULL (>400K / complex)
  {id:"REQ-004", type:"debtor_scoring", company:"ООО «ТехноГрупп»", unp:"290567890",
   creditorId:1, stage:"expertise", procedure:"full", priority:"medium", created:"2026-03-12", slaStart:"2026-03-13",
   recommendedLimit:500000,
   expertise:{ka:true, legal:true, oeb:false, orz:true},
   docs:{anketa:true, balanceQ4:true, pl:true, consentBki:true, consentOeb:true},
   comments:[{user:"Козлова Е.В.",date:"2026-03-14",text:"Лимит >400K — направлено на КК."}]},
  {id:"REQ-006", type:"deal_funding", dealId:"УС-2026-0044", creditorId:1, debtorId:4,
   amount:80000, stage:"committee", procedure:"full", priority:"medium", created:"2026-03-18", slaStart:"2026-03-19",
   committeeDate:"2026-03-26", committeeProtocol:"",
   checks:{antiduble:true, bisc:true, limit:true, overdue:true, stoplist:true},
   docs:{ttn:true, esfchf:true, supAg:"signed"},
   comments:[{user:"Иванов А.С.",date:"2026-03-20",text:"Направлено на КК вручную."}]},
  {id:"REQ-007", type:"debtor_scoring", company:"ИП Сергеев В.А.", unp:"790555123",
   creditorId:1, stage:"pre_decision", procedure:"full", priority:"high", created:"2026-03-10", slaStart:"2026-03-11",
   recommendedLimit:450000,
   expertise:{ka:true, legal:true, oeb:true, orz:true},
   docs:{anketa:true, balanceQ4:true, pl:true, consentBki:true, consentOeb:true},
   comments:[{user:"Смирнов Д.К.",date:"2026-03-13",text:"Все экспертизы завершены. Лимит 450K — готовлю для КК."}]},
  {id:"REQ-012", type:"deal_funding", dealId:"УС-2026-0046", creditorId:1, debtorId:3,
   amount:95000, stage:"rejected", procedure:"full", priority:"high", created:"2026-03-14", slaStart:"2026-03-14",
   rejectReason:"КК отклонил — превышение лимита.", rejectDate:"2026-03-16", rejectedBy:"Кредитный комитет",
   checks:{antiduble:true, bisc:true, limit:false, overdue:true, stoplist:true},
   docs:{ttn:true, esfchf:true, supAg:"pending_bank_ecp"},
   comments:[{user:"Иванов А.С.",date:"2026-03-16",text:"КК отклонил. Протокол №12."}]},
];

const STOPLIST = [
  {id:1, type:"legal", unp:"891234567", name:"ООО «ФейкТрейд»", reason:"Стоп-лист НБРБ",
   addedBy:"Комплаенс", addedDate:"2026-01-10"},
  {id:2, type:"person", personalId:"3150190A001PB5", name:"Иванов И.И.",
   reason:"Учредитель в стоп-листе", addedBy:"Комплаенс", addedDate:"2026-02-15"},
];

const BANK_DOCS = [
  // Генеральные договоры
  {id:1, name:"ГД №1 — ООО «СитиБетонСтрой»", type:"gd", client:"ООО «СитиБетонСтрой»", clientId:1, link:"—", date:"2026-01-15", ecpBank:"signed", ecpCreditor:"signed", ecpDebtor:"—", signHistory:[{who:"Кредитор",date:"2026-01-15",ip:"192.168.1.10"},{who:"Банк",date:"2026-01-15",ip:"10.0.0.1"}]},
  // Согласия
  {id:2, name:"Согласие БКИ — СитиБетонСтрой", type:"consent_bki", client:"ООО «СитиБетонСтрой»", clientId:1, link:"—", date:"2026-01-15", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  {id:3, name:"Согласие ОЭБ — СитиБетонСтрой", type:"consent_oeb", client:"ООО «СитиБетонСтрой»", clientId:1, link:"—", date:"2026-01-15", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  {id:4, name:"Согласие ПД — СитиБетонСтрой", type:"consent_pd", client:"ООО «СитиБетонСтрой»", clientId:1, link:"—", date:"2026-01-15", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  // Анкеты
  {id:5, name:"Анкета (Прил.12) — СитиБетонСтрой", type:"anketa", client:"ООО «СитиБетонСтрой»", clientId:1, link:"—", date:"2026-01-15", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  // Отчётность
  {id:6, name:"Баланс Q4 2025 — СитиБетонСтрой", type:"report", client:"ООО «СитиБетонСтрой»", clientId:1, link:"—", date:"2026-01-20", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  {id:7, name:"P&L Q4 2025 — СитиБетонСтрой", type:"report", client:"ООО «СитиБетонСтрой»", clientId:1, link:"—", date:"2026-01-20", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  // УС-2026-0042: ДС + ТТН + ЭСЧФ + Уведомление
  {id:8, name:"ДС №42 к ГД №1", type:"ds", client:"ООО «СитиБетонСтрой»", clientId:1, link:"УС-2026-0042", date:"2026-03-15", ecpBank:"signed", ecpCreditor:"signed", ecpDebtor:"confirmed", signHistory:[{who:"Кредитор",date:"2026-03-15",ip:"192.168.1.10"},{who:"Банк",date:"2026-03-16",ip:"10.0.0.1"},{who:"Должник",date:"2026-03-17",ip:"172.16.0.5"}]},
  {id:9, name:"ТТН №42 — БелТехСнаб", type:"ttn", client:"ООО «БелТехСнаб»", clientId:2, link:"УС-2026-0042", date:"2026-03-15", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  {id:10, name:"ЭСЧФ №42 — БелТехСнаб", type:"esfchf", client:"ООО «БелТехСнаб»", clientId:2, link:"УС-2026-0042", date:"2026-03-15", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  {id:11, name:"Уведомление — БелТехСнаб (УС-0042)", type:"notify", client:"ООО «БелТехСнаб»", clientId:2, link:"УС-2026-0042", date:"2026-03-16", ecpBank:"signed", ecpCreditor:"signed", ecpDebtor:"confirmed"},
  // УС-2026-0041
  {id:12, name:"ДС №41 к ГД №1", type:"ds", client:"ООО «СитиБетонСтрой»", clientId:1, link:"УС-2026-0041", date:"2026-03-10", ecpBank:"signed", ecpCreditor:"signed", ecpDebtor:"pending"},
  {id:13, name:"Акт ВР №41 — СтройИнвест", type:"act", client:"ЧУП «СтройИнвест»", clientId:3, link:"УС-2026-0041", date:"2026-03-10", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  {id:14, name:"ЭСЧФ №41 — СтройИнвест", type:"esfchf", client:"ЧУП «СтройИнвест»", clientId:3, link:"УС-2026-0041", date:"2026-03-10", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  {id:15, name:"Уведомление — СтройИнвест (УС-0041)", type:"notify", client:"ЧУП «СтройИнвест»", clientId:3, link:"УС-2026-0041", date:"2026-03-11", ecpBank:"signed", ecpCreditor:"signed", ecpDebtor:"pending"},
  // УС-2026-0040
  {id:16, name:"ДС №40 к ГД №1", type:"ds", client:"ООО «СитиБетонСтрой»", clientId:1, link:"УС-2026-0040", date:"2026-03-01", ecpBank:"signed", ecpCreditor:"signed", ecpDebtor:"confirmed"},
  {id:17, name:"ТТН №40 — АгроТрейд Плюс", type:"ttn", client:"ООО «АгроТрейд Плюс»", clientId:4, link:"УС-2026-0040", date:"2026-03-01", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  // УС-2026-0043 (pending)
  {id:18, name:"ДС №43 к ГД №1 (ожидает)", type:"ds", client:"ООО «СитиБетонСтрой»", clientId:1, link:"УС-2026-0043", date:"2026-03-22", ecpBank:"pending", ecpCreditor:"signed", ecpDebtor:"—"},
  {id:19, name:"ТТН №43 — БелТехСнаб", type:"ttn", client:"ООО «БелТехСнаб»", clientId:2, link:"УС-2026-0043", date:"2026-03-22", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
  {id:20, name:"ЭСЧФ №43 — БелТехСнаб", type:"esfchf", client:"ООО «БелТехСнаб»", clientId:2, link:"УС-2026-0043", date:"2026-03-22", ecpBank:"—", ecpCreditor:"signed", ecpDebtor:"—"},
];
const DOC_TYPE_LABELS = {gd:"Ген. договор",ds:"Допсоглашение",ttn:"ТТН",act:"Акт ВР",esfchf:"ЭСЧФ",consent_bki:"Согласие БКИ",consent_oeb:"Согласие ОЭБ",consent_pd:"Согласие ПД",notify:"Уведомление",anketa:"Анкета (Прил.12)",report:"Отчётность"};

const SCORING_QUANTITATIVE = [
  "Коэффициент текущей ликвидности",
  "Коэффициент финансового левериджа",
  "Рентабельность активов ROA",
  "EBITDA margin",
  "Оборачиваемость активов",
  "Коэффициент автономии",
  "Рентабельность продаж",
  "Чистые активы / уставный фонд",
  "Динамика выручки",
  "Долговая нагрузка / EBITDA",
];
const SCORING_QUALITATIVE = [
  "Срок работы компании",
  "Директор / судимости / сменяемость",
  "Отрасль / сезонность",
  "Кредитная история",
  "Рыночная позиция / конкуренция",
];

const BANK_NAV = [
  {id:"dashboard", label:"Дашборд", icon:LayoutDashboard},
  {id:"inbox", label:"Заявки", icon:Inbox, badge:3},
  {id:"pipeline-simple", label:"Конвейер (упрощённый)", icon:Zap},
  {id:"pipeline-full", label:"Конвейер (кред. комитет)", icon:Shield},
  {id:"clients", label:"Клиенты", icon:Users},
  {id:"portfolio", label:"Портфель", icon:TrendingUp},
  {id:"overdue", label:"Просрочки", icon:AlertTriangle, badge:1},
  {id:"documents", label:"Документы", icon:Archive},
  {id:"rates", label:"Ставки и лимиты", icon:CreditCard},
  {id:"stoplist", label:"Стоп-листы", icon:Ban},
  {id:"abs", label:"Выгрузки АБС", icon:Download},
  {id:"scoring-admin", label:"Скоринг", icon:GitBranch},
  {id:"settings", label:"Настройки", icon:Settings},
];

const RATE_SCENARIOS = [
  {name:"Премиум", annual:20.5, bank:15.5, platform:5.0, total:20.5, d30:1.69, d60:3.37, d90:5.05},
  {name:"Стандарт", annual:25, bank:15.5, platform:7.5, total:23.0, d30:2.05, d60:4.11, d90:6.16},
  {name:"Повышенный", annual:30, bank:15.5, platform:10.0, total:25.5, d30:2.47, d60:4.93, d90:7.40},
];

const ABS_EXPORTS = [
  {id:1, name:"Реестр новых договоров", desc:"Открытие счетов 21-10, 38-19, 99-71", icon:FileText},
  {id:2, name:"Реестр уступок за период", desc:"Субдоговоры-транши", icon:FileText},
  {id:3, name:"Реестр погашений", desc:"Закрытые уступки", icon:FileText},
  {id:4, name:"Форма 2501 для БКИ", desc:"Инструкция НБРБ №291, по должнику", icon:Shield},
  {id:5, name:"Ведомость дисконта", desc:"Начисленный дисконт за период", icon:CreditCard},
];

const EXPORT_LOG = [
  {date:"2026-03-20", type:"Реестр уступок за период", user:"Иванов А.С."},
  {date:"2026-03-15", type:"Форма 2501 для БКИ", user:"Иванов А.С."},
  {date:"2026-03-01", type:"Ведомость дисконта", user:"Петрова Н.А."},
];

const BANK_USERS = [
  {id:1, name:"Иванов А.С.", role:"Специалист для решений", email:"ivanov@neobank.by", status:"active"},
  {id:2, name:"Петрова Н.А.", role:"УСКО", email:"petrova@neobank.by", status:"active"},
  {id:3, name:"Смирнов Д.К.", role:"Аналитик", email:"smirnov@neobank.by", status:"active"},
  {id:4, name:"Козлова Е.В.", role:"Комплаенс", email:"kozlova@neobank.by", status:"inactive"},
];

// ─── UTILS ───
const fmt = n => new Intl.NumberFormat("ru-BY").format(n);
const fmtByn = n => `${fmt(n)} BYN`;
const getCompany = id => COMPANIES.find(c=>c.id===id);
const getCreditorName = id => getCompany(id)?.name || "—";
const getDebtorName = id => getCompany(id)?.name || "—";

const scoringClass = total => {
  if(total>=160) return {cls:"AA",color:B.green,risk:"минимальный",maxLimit:500000,rate:20.5};
  if(total>=130) return {cls:"A",color:"#059669",risk:"низкий",maxLimit:300000,rate:25};
  if(total>=100) return {cls:"BB",color:B.yellow,risk:"умеренный",maxLimit:200000,rate:25};
  if(total>=70) return {cls:"B",color:B.orange,risk:"повышенный",maxLimit:100000,rate:30};
  return {cls:"CC",color:B.red,risk:"высокий → отказ",maxLimit:0,rate:0};
};

const FUND_MONTHS = [
  {month:"Янв", v:145000, deals:2}, {month:"Фев", v:65000, deals:2}, {month:"Мар", v:225000, deals:3},
];

// ─── SHARED COMPONENTS ───
const Card = ({children, className="", ...rest}) => (
  <div className={`bg-white rounded-2xl border border-slate-200 ${className}`} {...rest}>{children}</div>
);

const Btn = ({children,variant="primary",size="md",onClick,disabled,icon:Icon,className=""}) => {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 whitespace-nowrap";
  const sz = {sm:"px-3 py-1.5 text-xs",md:"px-5 py-2.5 text-sm",lg:"px-6 py-3 text-base"}[size];
  const vars = {
    primary:`text-white shadow-sm ${disabled?"opacity-50 cursor-not-allowed":"hover:shadow-md hover:-translate-y-0.5"}`,
    secondary:"bg-slate-100 text-slate-700 hover:bg-slate-200",
    ghost:"text-slate-600 hover:bg-slate-100",
    success:`text-white ${disabled?"opacity-50":"hover:-translate-y-0.5"}`,
    danger:"bg-red-50 text-red-600 hover:bg-red-100"
  }[variant];
  const bg = variant==="primary"?{background:B.accent}:variant==="success"?{background:B.green}:undefined;
  return <button onClick={disabled?undefined:onClick} className={`${base} ${sz} ${vars} ${className}`} style={bg}>{Icon&&<Icon size={size==="sm"?14:16}/>}{children}</button>;
};

const Modal = ({open,onClose,title,children,wide}) => {
  if(!open) return null;
  return <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:9999,overflow:"auto",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:48,paddingBottom:48}} onClick={onClose}>
    <div className={`bg-white rounded-2xl shadow-2xl ${wide?"w-full max-w-3xl":"w-full max-w-lg"} flex flex-col mx-4`} style={{maxHeight:"85vh"}} onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0"><h2 className="text-lg font-bold" style={{color:B.t1}}>{title}</h2><button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} className="text-slate-400"/></button></div>
      <div className="p-6 overflow-y-auto flex-1">{children}</div>
    </div>
  </div>;
};

const Toast = ({message,type="success",onClose}) => {
  useEffect(()=>{const t=setTimeout(onClose,3000);return()=>clearTimeout(t)},[onClose]);
  const bg = type==="success"?B.green:type==="error"?B.red:B.accent;
  return <div className="fixed top-6 right-6 z-[100]"><div className="flex items-center gap-3 px-5 py-3 rounded-xl text-white text-sm font-medium shadow-lg" style={{background:bg}}>{type==="success"?<CheckCircle size={18}/>:<Info size={18}/>}{message}</div></div>;
};

const InfoTooltip = ({text,children}) => {
  const [show,setShow]=useState(false);
  const ref=useRef(null);
  const [pos,setPos]=useState({right:false});
  const onEnter=()=>{setShow(true);if(ref.current){const r=ref.current.getBoundingClientRect();setPos({right:r.left+140>window.innerWidth})}};
  return <span className="relative inline-flex items-center gap-1">{children}<span ref={ref} className="inline-flex items-center justify-center w-4 h-4 rounded-full cursor-help shrink-0" style={{background:show?"#E2E8F0":"#F1F5F9"}} onMouseEnter={onEnter} onMouseLeave={()=>setShow(false)}><Info size={10} style={{color:show?B.t1:B.t3}}/></span>{show&&<span className="absolute z-[100] top-full mt-2 px-3 py-2 rounded-xl text-xs text-white font-medium shadow-lg" style={{background:B.t1,maxWidth:260,minWidth:140,whiteSpace:"normal",lineHeight:"1.5",textAlign:"left",right:pos.right?0:undefined,left:pos.right?undefined:0}}>{text}</span>}</span>;
};

const StatusBadge = ({status,size="sm"}) => {
  const map = {
    active:{label:"Активная",bg:B.greenL,color:B.green},
    paid:{label:"Оплачена",bg:"#E0E7FF",color:B.accent},
    overdue:{label:"Просрочена",bg:B.redL,color:B.red},
    pending:{label:"Ожидает",bg:B.yellowL,color:B.yellow},
    signed:{label:"Подписан",bg:B.greenL,color:B.green},
    confirmed:{label:"Подтверждён",bg:B.greenL,color:B.green},
    rejected:{label:"Отклонён",bg:B.redL,color:B.red},
    received:{label:"Получена",bg:B.yellowL,color:B.yellow},
    expertise:{label:"Экспертиза",bg:B.purpleL,color:B.purple},
    decision:{label:"Решение",bg:B.accentL,color:B.accent},
    processing:{label:"Оформление",bg:"#FFF7ED",color:B.orange},
    funded:{label:"Профинансировано",bg:B.greenL,color:B.green},
    high:{label:"Высокий",bg:B.redL,color:B.red},
    medium:{label:"Средний",bg:B.yellowL,color:B.yellow},
    low:{label:"Низкий",bg:B.greenL,color:B.green},
    inactive:{label:"Неактивен",bg:"#F1F5F9",color:B.t3},
  };
  const s = map[status]||{label:status,bg:"#F1F5F9",color:B.t3};
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-lg font-semibold ${size==="sm"?"text-xs":"text-sm"}`} style={{background:s.bg,color:s.color}}>{s.label}</span>;
};

const KPICard = ({label,value,sub,icon:Icon,color,trend,tooltip}) => (
  <Card className="p-5">
    <div className="flex items-start justify-between mb-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:color+"18"}}><Icon size={20} style={{color}}/></div>
      {trend&&<span className={`text-xs font-semibold flex items-center gap-0.5 ${trend>0?"text-emerald-600":"text-red-500"}`}>{trend>0?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>}{Math.abs(trend)}%</span>}
    </div>
    <div className="text-2xl font-bold mb-1" style={{color:B.t1,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{value}</div>
    <div className="text-xs font-medium flex items-center gap-1" style={{color:B.t2}}>
      {tooltip?<InfoTooltip text={tooltip}>{label}</InfoTooltip>:label}
    </div>
    {sub&&<div className="text-xs mt-1" style={{color:B.t3}}>{sub}</div>}
  </Card>
);

const PageHeader = ({title,breadcrumbs,onBack,actions}) => (
  <div className="mb-6">
    {breadcrumbs&&<div className="flex items-center gap-1.5 text-xs mb-2" style={{color:B.t3}}>
      {onBack&&<button onClick={onBack} className="flex items-center gap-1 hover:text-slate-600 mr-1"><ArrowLeft size={14}/>Назад</button>}
      {breadcrumbs.map((b,i)=><span key={i} className="flex items-center gap-1.5">{i>0&&<ChevronRight size={12}/>}<span className={i===breadcrumbs.length-1?"font-medium text-slate-600":""}>{b}</span></span>)}
    </div>}
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h1 className="text-xl font-bold" style={{color:B.t1}}>{title}</h1>
      {actions&&<div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  </div>
);

const SearchBar = ({value,onChange,placeholder="Поиск..."}) => (
  <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300" style={{color:B.t1}}/></div>
);

const TabFilter = ({tabs,active,onChange}) => (
  <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 overflow-x-auto" style={{maxWidth:"100%"}}>
    {tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${active===t.id?"bg-white text-slate-800 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>{t.label}{t.badge!=null&&<span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold" style={{background:active===t.id?B.accentL:"transparent",color:active===t.id?B.accent:B.t3}}>{t.badge}</span>}</button>)}
  </div>
);

// ─── MAIN APP ───
export default function App() {
  const [active, setActive] = useState("dashboard");
  const [navStack, setNavStack] = useState([]);
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState(null);
  const [globalSearch, setGlobalSearch] = useState(false);
  const [gsQuery, setGsQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const pushNav = useCallback((page) => {
    setNavStack(s=>[...s, active]);
    setActive(page);
  }, [active]);

  const popNav = useCallback(() => {
    setNavStack(s=>{
      const next = [...s];
      const prev = next.pop();
      if(prev) setActive(prev);
      return next;
    });
  }, []);

  // Cmd+K
  useEffect(()=>{
    const h = e => {if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setGlobalSearch(true);setGsQuery("")}};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  // Global search results
  const gsResults = useMemo(()=>{
    if(!gsQuery.trim()) return [];
    const q = gsQuery.toLowerCase();
    const results = [];
    COMPANIES.forEach(c=>{if(c.name.toLowerCase().includes(q)||c.unp.includes(q)) results.push({label:c.name,sub:`УНП ${c.unp} · ${c.role==="creditor"?"Кредитор":"Должник"}`,page:"clients",icon:Users})});
    ALL_DEALS.forEach(d=>{if(d.id.toLowerCase().includes(q)) results.push({label:d.id,sub:`${fmtByn(d.amount)} · ${getCreditorName(d.creditorId)}`,page:"portfolio",icon:TrendingUp})});
    PIPELINE.forEach(p=>{if(p.id.toLowerCase().includes(q)||p.company?.toLowerCase().includes(q)) results.push({label:p.id,sub:p.company||`Финансирование ${p.dealId}`,page:"pipeline",icon:Zap})});
    return results.slice(0,8);
  },[gsQuery]);

  const themeClass = dark ? "bg-slate-900" : "";
  const mainBg = dark ? "#0F172A" : B.bg;
  const cardBg = dark ? "#1E293B" : "#FFFFFF";

  return (
    <div className="flex h-screen overflow-hidden" style={{fontFamily:"'Plus Jakarta Sans',sans-serif",background:mainBg}}>
      {/* ─── SIDEBAR ─── */}
      <aside className={`${sidebarOpen?"w-64":"w-20"} shrink-0 flex flex-col transition-all duration-300`} style={{background:B.sidebar}}>
        <div className="p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{background:B.accent}}>
              <Building2 size={18} className="text-white"/>
            </div>
            {sidebarOpen&&<div className="min-w-0"><div className="text-sm font-bold text-white truncate">Oborotka.by</div><div className="text-[10px] text-slate-400 truncate">ЗАО «Нео Банк Азия»</div></div>}
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          {BANK_NAV.map(item=>{
            const isActive = active===item.id || (navStack.length>0 && navStack[0]===item.id);
            const Icon = item.icon;
            return <button key={item.id} onClick={()=>{setActive(item.id);setNavStack([])}} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${isActive?"text-white":"text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`} style={isActive?{background:B.accent}:undefined}>
              <Icon size={18} className="shrink-0"/>
              {sidebarOpen&&<span className="text-[13px] leading-tight">{item.label}</span>}
              {sidebarOpen&&item.badge&&<span className="ml-auto px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-red-500 text-white">{item.badge}</span>}
            </button>;
          })}
        </nav>
        <div className="p-4 border-t border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{background:"#334155"}}>ИА</div>
            {sidebarOpen&&<div className="min-w-0"><div className="text-xs font-semibold text-white truncate">Иванов А.С.</div><div className="text-[10px] text-slate-500 truncate">Специалист для решений</div></div>}
          </div>
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 shrink-0 flex items-center justify-between px-6 border-b" style={{background:cardBg,borderColor:B.border}}>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-slate-100"><LayoutDashboard size={16} style={{color:B.t2}}/></button>
          <div className="flex items-center gap-3">
            <button onClick={()=>{setGlobalSearch(true);setGsQuery("")}} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-400 hover:border-slate-300">
              <Search size={14}/><span>Поиск</span><span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono">⌘K</span>
            </button>
            <button className="relative p-2 rounded-lg hover:bg-slate-100"><Bell size={16} style={{color:B.t2}}/><span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500"/></button>
            <button onClick={()=>setDark(!dark)} className="p-2 rounded-lg hover:bg-slate-100">{dark?<ToggleRight size={16} style={{color:B.accent}}/>:<ToggleLeft size={16} style={{color:B.t3}}/>}</button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6" style={{background:mainBg}}>
          {active==="dashboard"&&<DashboardPage pushNav={pushNav} setToast={setToast}/>}
          {active==="inbox"&&<InboxPage setToast={setToast}/>}
          {active==="pipeline-simple"&&<PipelinePage mode="simple" setToast={setToast}/>}
          {active==="pipeline-full"&&<PipelinePage mode="full" setToast={setToast}/>}
          {active==="clients"&&<ClientsPage pushNav={pushNav} setToast={setToast}/>}
          {active==="client-detail"&&<ClientDetailPage popNav={popNav} pushNav={pushNav} setToast={setToast}/>}
          {active==="portfolio"&&<PortfolioPage pushNav={pushNav} setToast={setToast}/>}
          {active==="deal-detail"&&<DealDetailPage popNav={popNav} setToast={setToast}/>}
          {active==="overdue"&&<OverduePage pushNav={pushNav} setToast={setToast}/>}
          {active==="documents"&&<DocumentsPage setToast={setToast}/>}
          {active==="rates"&&<RatesPage setToast={setToast}/>}
          {active==="stoplist"&&<StoplistPage setToast={setToast}/>}
          {active==="abs"&&<AbsPage setToast={setToast}/>}
          {active==="scoring-admin"&&<ScoringPage setToast={setToast}/>}
          {active==="settings"&&<SettingsPage setToast={setToast}/>}
        </div>
      </main>

      {/* Toast */}
      {toast&&<Toast message={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}

      {/* Global Search Modal */}
      {globalSearch&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:9999,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)"}} onClick={()=>setGlobalSearch(false)}>
        <div className="max-w-lg mx-auto mt-24" onClick={e=>e.stopPropagation()}>
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
              <Search size={18} style={{color:B.t3}}/><input autoFocus value={gsQuery} onChange={e=>setGsQuery(e.target.value)} placeholder="Поиск клиентов, уступок, заявок..." className="flex-1 text-sm outline-none" style={{color:B.t1}}/>
              <kbd className="px-2 py-0.5 rounded bg-slate-100 text-[10px] text-slate-400 font-mono">ESC</kbd>
            </div>
            {gsResults.length>0&&<div className="py-2 max-h-80 overflow-y-auto">{gsResults.map((r,i)=><button key={i} onClick={()=>{setActive(r.page);setGlobalSearch(false)}} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 text-left">
              <r.icon size={16} style={{color:B.t3}}/><div><div className="text-sm font-medium" style={{color:B.t1}}>{r.label}</div><div className="text-xs" style={{color:B.t3}}>{r.sub}</div></div>
            </button>)}</div>}
            {gsQuery&&gsResults.length===0&&<div className="p-8 text-center text-sm" style={{color:B.t3}}>Ничего не найдено</div>}
          </div>
        </div>
      </div>}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 8px; }
        .mono { font-family: 'JetBrains Mono', monospace; }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════
// PAGE 1: DASHBOARD
// ═══════════════════════════════════════
function DashboardPage({pushNav, setToast}) {
  const activeDeals = ALL_DEALS.filter(d=>d.status==="active");
  const overdueDeals = ALL_DEALS.filter(d=>d.status==="overdue");
  const totalPortfolio = activeDeals.reduce((s,d)=>s+d.amount,0)+overdueDeals.reduce((s,d)=>s+d.amount,0);
  const totalDiscount = ALL_DEALS.filter(d=>d.status!=="paid").reduce((s,d)=>s+d.discount,0);
  const bankIncome = Math.round(totalDiscount * 0.655); // 15.5/23.67 avg
  const platformIncome = totalDiscount - bankIncome;
  const activeClients = COMPANIES.filter(c=>c.status==="active").length;
  const pendingPipeline = PIPELINE.filter(p=>p.stage!=="funded").length;

  const pieData = [
    {name:"30 дней", value: activeDeals.filter(d=>d.term<=30).reduce((s,d)=>s+d.amount,0)||15000, fill:B.accent},
    {name:"60 дней", value: activeDeals.filter(d=>d.term>30&&d.term<=60).reduce((s,d)=>s+d.amount,0), fill:B.purple},
    {name:"90 дней", value: activeDeals.filter(d=>d.term>60).reduce((s,d)=>s+d.amount,0), fill:B.green},
  ];

  return <div>
    <PageHeader title="Дашборд" breadcrumbs={["Главная"]}/>

    <div className="grid grid-cols-2 gap-4 mb-4">
      <KPICard label="Активный портфель" value={fmtByn(totalPortfolio)} icon={TrendingUp} color={B.accent} trend={12} tooltip="Сумма всех активных и просроченных уступок"/>
      <KPICard label="Заявки на решение" value={pendingPipeline} sub="ожидают обработки" icon={Zap} color={B.yellow} tooltip="Количество заявок в конвейере"/>
    </div>
    <div className="grid grid-cols-2 gap-4 mb-4">
      <KPICard label="Просрочки" value={`${overdueDeals.length} / ${fmtByn(overdueDeals.reduce((s,d)=>s+d.amount,0))}`} icon={AlertTriangle} color={B.red} tooltip="Количество и сумма просроченных уступок"/>
      <KPICard label="Доход банка (мес)" value={fmtByn(bankIncome)} icon={Building2} color={B.green} trend={8} tooltip="15.5% от суммы дисконтов"/>
    </div>
    <div className="grid grid-cols-2 gap-4 mb-6">
      <KPICard label="Доход платформы (мес)" value={fmtByn(platformIncome)} icon={CreditCard} color={B.purple} tooltip="(Общая ставка − 15.5%) от дисконтов"/>
      <KPICard label="Клиентов" value={activeClients} sub="активных на платформе" icon={Users} color={B.accent} tooltip="Количество активных компаний"/>
    </div>

    <div className="grid grid-cols-2 gap-6">
      {/* Pipeline tasks */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold" style={{color:B.t1}}>Заявки на решение</h3>
          <button onClick={()=>pushNav("pipeline")} className="text-xs font-semibold hover:underline" style={{color:B.accent}}>Все заявки →</button>
        </div>
        <div className="space-y-2">
          {PIPELINE.map(p=><button key={p.id} onClick={()=>pushNav("pipeline")} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-left border border-slate-100">
            <div className={`w-2 h-2 rounded-full shrink-0`} style={{background:p.priority==="high"?B.red:B.yellow}}/>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate" style={{color:B.t1}}><span className="mono">{p.id}</span> · {p.company||p.dealId}</div>
              <div className="text-[10px] mt-0.5" style={{color:B.t3}}>{p.type==="debtor_scoring"?"Скоринг должника":"Финансирование"} · {p.created}</div>
            </div>
            <StatusBadge status={p.stage}/>
          </button>)}
        </div>
      </Card>

      {/* Portfolio by term */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>
          <InfoTooltip text="Распределение активного портфеля по срокам уступок">Портфель по срокам</InfoTooltip>
        </h3>
        <div className="flex items-center gap-6">
          <ResponsiveContainer width={180} height={180}>
            <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" strokeWidth={2} stroke="#fff">
              {pieData.map((e,i)=><Cell key={i} fill={e.fill}/>)}
            </Pie></PieChart>
          </ResponsiveContainer>
          <div className="space-y-3">{pieData.map((d,i)=><div key={i} className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{background:d.fill}}/><div><div className="text-xs font-semibold" style={{color:B.t1}}>{d.name}</div><div className="text-xs" style={{color:B.t2}}>{fmtByn(d.value)}</div></div></div>)}</div>
        </div>
      </Card>

      {/* Overdue banner */}
      {overdueDeals.length>0&&<Card className="p-5 col-span-1" style={{background:B.redL,borderColor:"#FECACA"}}>
        <div className="flex items-center gap-3 mb-3"><AlertTriangle size={20} style={{color:B.red}}/><h3 className="text-sm font-bold" style={{color:B.red}}>Просроченные уступки</h3></div>
        {overdueDeals.map(d=><div key={d.id} className="flex items-center justify-between py-2 border-b border-red-200 last:border-0">
          <div><div className="text-xs font-semibold mono" style={{color:B.t1}}>{d.id}</div><div className="text-[10px]" style={{color:B.red}}>{getDebtorName(d.debtorId)} · {Math.abs(d.daysLeft)} дн. просрочки</div></div>
          <span className="text-xs font-bold" style={{color:B.red}}>{fmtByn(d.amount)}</span>
        </div>)}
      </Card>}

      {/* Funding by month */}
      <Card className="p-5 col-span-1">
        <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Финансирование по месяцам</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={FUND_MONTHS}><CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
            <XAxis dataKey="month" tick={{fontSize:12,fill:B.t3}}/><YAxis tick={{fontSize:11,fill:B.t3}} tickFormatter={v=>fmt(v)}/>
            <Tooltip formatter={v=>fmtByn(v)} labelStyle={{color:B.t1}} contentStyle={{borderRadius:12,border:`1px solid ${B.border}`}}/>
            <Bar dataKey="v" fill={B.accent} radius={[6,6,0,0]} name="Объём"/>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  </div>;
}

// ═══════════════════════════════════════
// PIPELINE CONSTANTS
// ═══════════════════════════════════════
const SIMPLE_STAGES = [
  {id:"received",label:"Получена",color:B.yellow},
  {id:"expertise",label:"Экспертиза",color:B.purple},
  {id:"decision",label:"Решение",color:B.accent},
  {id:"processing",label:"Оформление",color:B.orange},
  {id:"funded",label:"Выполнено",color:B.green},
  {id:"rejected",label:"Отклонено",color:B.red},
];
const FULL_STAGES = [
  {id:"received",label:"Получена",color:B.yellow},
  {id:"expertise",label:"Экспертиза",color:B.purple},
  {id:"pre_decision",label:"Подготовка КК",color:"#6366F1"},
  {id:"committee",label:"Кредитный комитет",color:B.accent},
  {id:"processing",label:"Оформление",color:B.orange},
  {id:"funded",label:"Выполнено",color:B.green},
  {id:"rejected",label:"Отклонено",color:B.red},
];
const TYPE_LABELS = {debtor_scoring:"Скоринг должника",deal_funding:"Финансирование",creditor_onboarding:"Онбординг кредитора"};
const DOC_KEY_LABELS = {anketa:"Анкета (Прил.12)",balanceQ4:"Баланс Q4 2025",balance:"Баланс",pl:"Отчёт о прибылях и убытках",consentBki:"Согласие на проверку БКИ",consentOeb:"Согласие на проверку ОЭБ",consent_bki:"Согласие БКИ",consent_oeb:"Согласие ОЭБ",ttn:"ТТН (товарно-транспортная накладная)",esfchf:"ЭСЧФ (электронный счёт-фактура)",supAg:"Допсоглашение к ГД"};
const SLA_DAYS_SIMPLE = {debtor_scoring:5, deal_funding:3, creditor_onboarding:3};
const SLA_DAYS_FULL = {debtor_scoring:10, deal_funding:7, creditor_onboarding:3};

function calcSlaDays(created) {
  const c = new Date(created);
  const now = new Date("2026-03-26");
  return Math.max(0, Math.floor((now - c) / 86400000));
}

// ═══════════════════════════════════════
// INBOX PAGE
// ═══════════════════════════════════════
function InboxPage({setToast}) {
  const [data, setData] = useState(PIPELINE.filter(p=>p.procedure==="inbox").map(p=>({...p})));
  const [selectedReq, setSelectedReq] = useState(null);

  const routeTo = (id, procedure) => {
    setData(prev=>prev.filter(p=>p.id!==id));
    setToast({msg:`${id} направлен в ${procedure==="simple"?"упрощённый конвейер":"Кредитный комитет"}`,type:"success"});
  };

  if(selectedReq) {
    const p = selectedReq;
    return <div>
      <PageHeader title={`Заявка ${p.id}`} breadcrumbs={["Заявки",p.id]} onBack={()=>setSelectedReq(null)}/>
      <div className="grid gap-6" style={{gridTemplateColumns:"1fr 300px"}}>
        <div className="space-y-5 min-w-0">
          <Card className="p-5">
            <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Информация</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div><span style={{color:B.t3}}>Тип:</span><div className="font-semibold mt-0.5" style={{color:B.accent}}>{TYPE_LABELS[p.type]}</div></div>
              <div><span style={{color:B.t3}}>Компания:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{p.company||p.dealId}</div></div>
              {p.unp&&<div><span style={{color:B.t3}}>УНП:</span><div className="font-semibold mono mt-0.5" style={{color:B.t1}}>{p.unp}</div></div>}
              {p.amount&&<div><span style={{color:B.t3}}>Сумма:</span><div className="font-bold mt-0.5" style={{color:B.t1}}>{fmtByn(p.amount)}</div></div>}
              {p.recommendedLimit&&<div><span style={{color:B.t3}}>Рек. лимит:</span><div className="font-bold mt-0.5" style={{color:B.t1}}>{fmtByn(p.recommendedLimit)}</div></div>}
              <div><span style={{color:B.t3}}>Дата создания:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{p.created}</div></div>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Документы</h3>
            <div className="space-y-1.5">{Object.entries(p.docs||{}).map(([k,v])=><div key={k} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
              {v?<CheckCircle size={13} style={{color:B.green}}/>:<Clock size={13} style={{color:B.yellow}}/>}
              <span className="text-xs" style={{color:B.t1}}>{DOC_KEY_LABELS[k]||k}</span>
            </div>)}</div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Рекомендация системы</h3>
            <div className={`p-4 rounded-xl text-center mb-4 ${p.recommendedProcedure==="simple"?"bg-green-50 border border-green-200":"bg-blue-50 border border-blue-200"}`}>
              <div className="text-lg font-black" style={{color:p.recommendedProcedure==="simple"?B.green:B.accent}}>{p.recommendedProcedure==="simple"?"Упрощённый":"Кредитный комитет"}</div>
              <div className="text-[10px] mt-1" style={{color:B.t3}}>
                {p.type==="creditor_onboarding"?"Онбординг — всегда упрощённый":
                 (p.amount||p.recommendedLimit||0)>400000?"Сумма/лимит > 400K BYN":"Сумма/лимит ≤ 400K BYN"}
              </div>
            </div>
            <div className="space-y-2">
              <Btn size="md" variant="success" icon={Zap} className="w-full" onClick={()=>{routeTo(p.id,"simple");setSelectedReq(null)}}>В упрощённый конвейер</Btn>
              <Btn size="md" icon={Shield} className="w-full" onClick={()=>{routeTo(p.id,"full");setSelectedReq(null)}}>На Кредитный комитет</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>;
  }

  return <div>
    <PageHeader title="Входящие заявки" breadcrumbs={["Заявки"]}/>
    <div className="grid grid-cols-2 gap-4 mb-5">
      <KPICard label="Ожидают распределения" value={data.length} icon={Inbox} color={B.yellow} tooltip="Заявки, которые ещё не направлены в конвейер"/>
      <KPICard label="Всего за сегодня" value={data.filter(p=>p.created>="2026-03-25").length} icon={Clock} color={B.accent}/>
    </div>
    {data.length===0?<Card className="p-16 text-center"><CheckCircle size={40} style={{color:B.green}} className="mx-auto mb-3"/><div className="text-lg font-bold" style={{color:B.green}}>Все заявки распределены ✓</div><div className="text-xs mt-1" style={{color:B.t3}}>Нет новых заявок для распределения</div></Card>:
    <div className="space-y-2">{data.map(p=>{
      const tc = {debtor_scoring:{c:B.accent,bg:B.accentL},deal_funding:{c:B.green,bg:B.greenL},creditor_onboarding:{c:B.purple,bg:B.purpleL}}[p.type]||{c:B.t2,bg:"#F1F5F9"};
      return <Card key={p.id} className="hover:shadow-md transition-all cursor-pointer" onClick={()=>setSelectedReq(p)}>
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold mono text-xs" style={{color:B.accent}}>{p.id}</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{background:tc.bg,color:tc.c}}>{TYPE_LABELS[p.type]}</span>
              {p.amount&&<span className="font-bold mono text-xs" style={{color:B.t1}}>{fmtByn(p.amount)}</span>}
              {p.recommendedLimit&&<span className="text-[10px]" style={{color:B.t3}}>лимит ~{fmtByn(p.recommendedLimit)}</span>}
            </div>
            <div className="text-sm font-medium truncate" style={{color:B.t1}}>{p.company||p.dealId}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${p.recommendedProcedure==="simple"?"bg-green-50 border border-green-200":"bg-blue-50 border border-blue-200"}`} style={{color:p.recommendedProcedure==="simple"?B.green:B.accent}}>
              {p.recommendedProcedure==="simple"?"→ Упрощённый":"→ КК"}
            </div>
            <ChevronRight size={16} style={{color:B.t3}}/>
          </div>
        </div>
      </Card>;
    })}</div>}
  </div>;
}

// ═══════════════════════════════════════
// UNIFIED PIPELINE PAGE (mode: simple | full)
// ═══════════════════════════════════════
function PipelinePage({mode, setToast}) {
  const isSimple = mode==="simple";
  const stages = isSimple ? SIMPLE_STAGES : FULL_STAGES;
  const slaMap = isSimple ? SLA_DAYS_SIMPLE : SLA_DAYS_FULL;
  const title = isSimple ? "Конвейер (упрощённый)" : "Конвейер (Кредитный комитет)";

  const [stageFilter, setStageFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedReq, setSelectedReq] = useState(null);
  const [pipelineData, setPipelineData] = useState(PIPELINE.filter(p=>p.procedure===mode).map(p=>({...p})));

  const active = pipelineData.filter(p=>p.stage!=="funded"&&p.stage!=="rejected");
  const slaBreaches = active.filter(p=>calcSlaDays(p.created)>(slaMap[p.type]||5)).length;

  const filtered = pipelineData.filter(p=>{
    if(stageFilter!=="all"&&p.stage!==stageFilter) return false;
    if(typeFilter!=="all"&&p.type!==typeFilter) return false;
    if(search){const q=search.toLowerCase();return p.id.toLowerCase().includes(q)||(p.company||"").toLowerCase().includes(q)||(p.unp||"").includes(q)||(p.dealId||"").toLowerCase().includes(q)}
    return true;
  });

  const cyclePriority = (id) => {
    const cycle = {low:"medium",medium:"high",high:"low"};
    setPipelineData(prev=>prev.map(p=>p.id===id?{...p,priority:cycle[p.priority]||"medium"}:p));
    setToast({msg:"Приоритет изменён",type:"success"});
  };

  if(selectedReq) return <PipelineDetailView req={selectedReq} mode={mode} pipelineData={pipelineData} setPipelineData={setPipelineData} onBack={()=>setSelectedReq(null)} setToast={setToast}/>;

  // Group by stage
  const stageOrder = stages.map(s=>s.id);
  const groups = stageOrder.map(sid=>({stage:stages.find(s=>s.id===sid), items:filtered.filter(p=>p.stage===sid)})).filter(g=>g.items.length>0);

  return <div>
    <PageHeader title={title} breadcrumbs={[title]}/>

    {/* Pipeline funnel */}
    <Card className="p-3 mb-4">
      <div className="flex gap-1 overflow-x-auto">
        {stages.map(st=>{
          const count = pipelineData.filter(p=>p.stage===st.id).length;
          const isActive = stageFilter===st.id;
          return <button key={st.id} onClick={()=>setStageFilter(isActive?"all":st.id)} className={`p-2 rounded-xl border-2 text-center transition-all shrink-0 ${isActive?"shadow-md -translate-y-0.5":"hover:shadow-sm"}`} style={{borderColor:isActive?st.color:B.border,background:isActive?st.color+"12":"white",width:stages.length>6?100:undefined,flex:stages.length<=6?"1 1 0%":undefined}}>
            <div className="text-lg font-black leading-none" style={{color:st.color}}>{count}</div>
            <div className="text-[10px] font-semibold mt-1 leading-tight" style={{color:isActive?st.color:B.t2,whiteSpace:"normal"}}>{st.label}</div>
          </button>;
        })}
      </div>
    </Card>

    {/* Filters */}
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <TabFilter tabs={[{id:"all",label:"Все"},{id:"debtor_scoring",label:"Скоринг"},{id:"deal_funding",label:"Финанс."},{id:"creditor_onboarding",label:"Онбординг"}]} active={typeFilter} onChange={setTypeFilter}/>
        {stageFilter!=="all"&&<button onClick={()=>setStageFilter("all")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold" style={{borderColor:B.accent,color:B.accent,background:B.accentL}}>
          {stages.find(s=>s.id===stageFilter)?.label}<X size={12}/>
        </button>}
      </div>
      <div className="flex items-center gap-3">
        {slaBreaches>0&&<span className="text-xs font-bold px-2 py-1 rounded-lg" style={{background:B.redL,color:B.red}}>⚠ {slaBreaches} просроч. SLA</span>}
        <div className="w-56 shrink-0"><SearchBar value={search} onChange={setSearch} placeholder="Номер, компания..."/></div>
      </div>
    </div>

    {/* Grouped list */}
    {groups.length===0?<Card className="p-10 text-center text-sm" style={{color:B.t3}}>Заявки не найдены</Card>:
    <div className="space-y-4">{groups.map(g=>{
      const isDoneGroup = g.stage.id==="funded"||g.stage.id==="rejected";
      return <div key={g.stage.id}>
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className="w-2.5 h-2.5 rounded-full" style={{background:g.stage.color}}/>
          <span className="text-xs font-bold uppercase tracking-wider" style={{color:g.stage.color}}>{g.stage.label}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{background:g.stage.color+"15",color:g.stage.color}}>{g.items.length}</span>
          <div className="flex-1 h-px" style={{background:g.stage.color+"30"}}/>
        </div>
        <div className="space-y-1.5">{g.items.map(p=>{
          const slaDays = calcSlaDays(p.created);
          const slaMax = slaMap[p.type]||5;
          const slaOver = !isDoneGroup&&slaDays>slaMax;
          const slaPct = Math.min((slaDays/slaMax)*100,100);
          const isRejected = p.stage==="rejected";
          const tc = {debtor_scoring:{c:B.accent,bg:B.accentL},deal_funding:{c:B.green,bg:B.greenL},creditor_onboarding:{c:B.purple,bg:B.purpleL}}[p.type]||{c:B.t2,bg:"#F1F5F9"};
          const priC = {high:B.red,medium:B.yellow,low:B.green}[p.priority]||B.t3;
          return <Card key={p.id} className={`transition-all cursor-pointer ${isDoneGroup?"opacity-50 hover:opacity-80":"hover:shadow-md hover:-translate-y-0.5"}`}
            onClick={()=>setSelectedReq(p)}
            style={slaOver?{borderLeft:`3px solid ${B.red}`}:isRejected?{borderLeft:`3px solid ${B.red}`,background:"#FFFBFB"}:{}}>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="shrink-0" onClick={e=>{e.stopPropagation();if(!isDoneGroup)cyclePriority(p.id)}} title={p.priority}>
                <div className={`w-3 h-3 rounded-full ${isDoneGroup?"":"cursor-pointer hover:ring-2 hover:ring-offset-1"} transition-all`} style={{background:priC}}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold mono text-xs" style={{color:isRejected?B.red:B.accent}}>{p.id}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{background:tc.bg,color:tc.c}}>{TYPE_LABELS[p.type]}</span>
                  {p.amount&&<span className="font-bold mono text-xs" style={{color:B.t1}}>{fmtByn(p.amount)}</span>}
                </div>
                <div className="text-xs font-medium truncate" style={{color:B.t1}}>{p.company||p.dealId}</div>
                {isRejected&&p.rejectReason&&<div className="text-[10px] truncate mt-0.5" style={{color:B.red}}>{p.rejectReason}</div>}
              </div>
              <div className="shrink-0 w-16 text-right">
                {isDoneGroup?<span className="text-[10px]" style={{color:B.t3}}>{p.created}</span>:
                <div><div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-1"><div className="h-full rounded-full" style={{width:`${slaPct}%`,background:slaOver?B.red:slaPct>70?B.yellow:B.green}}/></div>
                <div className="text-[10px] mono font-semibold" style={{color:slaOver?B.red:B.t2}}>{slaDays}/{slaMax}д</div></div>}
              </div>
              <ChevronRight size={16} style={{color:B.t3}} className="shrink-0"/>
            </div>
          </Card>;
        })}</div>
      </div>;
    })}</div>}
  </div>;
}

// ─── Pipeline Detail View ───
function PipelineDetailView({req, mode, pipelineData, setPipelineData, onBack, setToast}) {
  const [signing, setSigning] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [limitInput, setLimitInput] = useState("");
  const [rateSelect, setRateSelect] = useState("");
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState(req.comments||[]);
  const [expertise, setExpertise] = useState(req.expertise||{});
  const [committeeDate, setCommitteeDate] = useState(req.committeeDate||"");
  const [committeeProtocol, setCommitteeProtocol] = useState(req.committeeProtocol||"");

  const isSimple = mode==="simple";
  const isFull = mode==="full";
  const isScoring = req.type==="debtor_scoring";
  const isFunding = req.type==="deal_funding";
  const isOnboarding = req.type==="creditor_onboarding";
  const isRejected = req.stage==="rejected";
  const slaMap = isSimple ? SLA_DAYS_SIMPLE : SLA_DAYS_FULL;

  const debtor = req.debtorId ? getCompany(req.debtorId) : null;
  const debtorRate = debtor?.rate || 25;
  const debtorTerm = isFunding ? 60 : 0;
  const slaDays = calcSlaDays(req.created);
  const slaMax = slaMap[req.type]||5;
  const slaOver = req.stage!=="funded"&&req.stage!=="rejected"&&slaDays>slaMax;

  const mockQuantScores = [8,7,6,9,7,8,6,7,8,6];
  const mockQualScores = [16,14,15,18,15];
  const totalScore = mockQuantScores.reduce((a,b)=>a+b,0)+mockQualScores.reduce((a,b)=>a+b,0);
  const sc = scoringClass(totalScore);

  useEffect(()=>{if(!rateSelect) setRateSelect(isScoring?String(sc.rate):String(debtorRate))},[]);

  const handleApprove = () => {setSigning(true);setTimeout(()=>{setSigning(false);setToast({msg:`${req.id}: Одобрено и подписано ЭЦП`,type:"success"})},2000)};
  const handleReject = () => {setToast({msg:`${req.id}: Отклонено`,type:"error"});setRejectModal(false)};
  const handleFund = () => {setSigning(true);setTimeout(()=>{setSigning(false);setToast({msg:`${req.id}: Профинансировано`,type:"success"})},2000)};
  const handleCommitteeApprove = () => {setSigning(true);setTimeout(()=>{setSigning(false);setToast({msg:`${req.id}: КК одобрил. Протокол ${committeeProtocol}`,type:"success"})},2000)};

  const toggleExpertise = (key) => {
    const next = {...expertise, [key]:!expertise[key]};
    setExpertise(next);
    addComment(`Экспертиза ${key.toUpperCase()} ${next[key]?"завершена":"переоткрыта"}`);
  };
  const addComment = (text) => {if(!text?.trim())return;setComments(prev=>[...prev,{user:"Иванов А.С.",date:"2026-03-26",text}]);setNewComment("")};

  const scoringExpertises = [{key:"ka",label:"КА",full:"Кредитный аналитик",sla:null},{key:"legal",label:"ЮУ",full:"Юридическое управл.",sla:2},{key:"oeb",label:"ОЭБ",full:"Служба безопасности",sla:null},{key:"orz",label:"ОРЗ",full:"Оценка рисков",sla:2}];
  const onboardingExpertises = [{key:"stoplist",label:"Стоп-лист",full:"Проверка НБРБ",sla:null},{key:"legat",label:"Легат",full:"Проверка Легат",sla:null},{key:"profit",label:"Прибыль/ЧА",full:"Проверка ЧА",sla:null}];
  const activeExpertises = isOnboarding ? onboardingExpertises : scoringExpertises;
  const allExpertisesDone = activeExpertises.every(ex=>expertise[ex.key]);
  const discount = isFunding ? Math.round(req.amount * debtorRate / 365 * debtorTerm) : 0;
  const isCommitteeStage = req.stage==="committee"||req.stage==="pre_decision";
  const isDone = req.stage==="funded"||req.stage==="rejected";

  // Stage workflow
  const stageList = isSimple ? SIMPLE_STAGES : FULL_STAGES;
  const activeStages = stageList.filter(s=>s.id!=="rejected");
  const currentIdx = activeStages.findIndex(s=>s.id===req.stage);
  const nextStage = currentIdx>=0&&currentIdx<activeStages.length-1 ? activeStages[currentIdx+1] : null;

  const advanceStage = () => {
    if(!nextStage||isDone) return;
    setPipelineData(prev=>prev.map(p=>p.id===req.id?{...p,stage:nextStage.id}:p));
    addComment(`Этап изменён: ${stageList.find(s=>s.id===req.stage)?.label} → ${nextStage.label}`);
    setToast({msg:`${req.id}: переведена на этап «${nextStage.label}»`,type:"success"});
    onBack();
  };

  return <div>
    <PageHeader title={`Заявка ${req.id}`} breadcrumbs={[isSimple?"Конвейер (упрощ.)":"Конвейер (КК)",req.id]} onBack={onBack}
      actions={<div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{background:isSimple?B.greenL:B.accentL,color:isSimple?B.green:B.accent}}>{isSimple?"Упрощённый":"Кредитный комитет"}</span>
        <span className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{background:B.accentL,color:B.accent}}>{TYPE_LABELS[req.type]}</span>
        <StatusBadge status={req.stage} size="md"/>
        {slaOver&&<span className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{background:B.redL,color:B.red}}>SLA {slaDays}/{slaMax}д ⚠</span>}
      </div>}/>

    {isRejected&&<Card className="p-4 mb-5" style={{background:B.redL,borderColor:"#FECACA"}}>
      <div className="flex items-start gap-3"><XCircle size={20} style={{color:B.red}} className="shrink-0 mt-0.5"/>
        <div className="min-w-0"><div className="text-sm font-bold" style={{color:B.red}}>Заявка отклонена</div>
        {req.rejectReason&&<div className="text-xs mt-1" style={{color:B.t1}}>{req.rejectReason}</div>}
        <div className="text-xs mt-1" style={{color:B.t3}}>Отклонил: {req.rejectedBy||"—"} · {req.rejectDate||"—"}</div></div>
      </div>
    </Card>}

    {/* Workflow progress */}
    {!isRejected&&<Card className="p-4 mb-5">
      <div className="flex items-center gap-1">
        {activeStages.map((st,idx)=>{
          const isCurrent = st.id===req.stage;
          const isPast = idx<currentIdx;
          const isFut = idx>currentIdx;
          return <div key={st.id} className="flex items-center flex-1 min-w-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg w-full ${isCurrent?"font-bold":"font-medium"}`}
              style={{background:isCurrent?st.color+"15":isPast?B.greenL+"80":"transparent",border:isCurrent?`2px solid ${st.color}`:"2px solid transparent"}}>
              {isPast&&<CheckCircle size={12} style={{color:B.green}}/>}
              {isCurrent&&<div className="w-2 h-2 rounded-full shrink-0" style={{background:st.color}}/>}
              <span className="text-[10px] truncate" style={{color:isCurrent?st.color:isPast?B.green:B.t3}}>{st.label}</span>
            </div>
            {idx<activeStages.length-1&&<ChevronRight size={12} style={{color:B.t3}} className="shrink-0 mx-0.5"/>}
          </div>;
        })}
      </div>
      {nextStage&&!isDone&&<div className="mt-3 flex items-center justify-end gap-2">
        <span className="text-[10px]" style={{color:B.t3}}>Следующий этап: <strong style={{color:nextStage.color}}>{nextStage.label}</strong></span>
        <Btn size="sm" variant="success" icon={ChevronRight} onClick={advanceStage}>Перевести →</Btn>
      </div>}
    </Card>}

    <div className="grid gap-6" style={{gridTemplateColumns:"1fr 280px"}}>
      <div className="space-y-5 min-w-0">
        {/* Info */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>{isScoring?"Информация о компании":isFunding?"Информация об уступке":"Онбординг кредитора"}</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            {(isScoring||isOnboarding)&&<><div><span style={{color:B.t3}}>Компания:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{req.company}</div></div>
            <div><span style={{color:B.t3}}>УНП:</span><div className="font-semibold mono mt-0.5" style={{color:B.t1}}>{req.unp}</div></div></>}
            {isFunding&&<><div><span style={{color:B.t3}}>Кредитор:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{getCreditorName(req.creditorId)}</div></div>
            <div><span style={{color:B.t3}}>Должник:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{getDebtorName(req.debtorId)}</div></div>
            <div><span style={{color:B.t3}}>Сумма:</span><div className="font-bold mt-0.5" style={{color:B.t1}}>{fmtByn(req.amount)}</div></div></>}
            <div><span style={{color:B.t3}}>Создана:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{req.created}</div></div>
          </div>
          <div className={`mt-4 flex items-center gap-3 p-3 rounded-xl ${slaOver?"bg-red-50 border border-red-200":"bg-slate-50"}`}>
            <Clock size={16} style={{color:slaOver?B.red:B.t3}}/>
            <span className="text-xs font-semibold" style={{color:slaOver?B.red:B.t1}}>SLA: {slaDays} из {slaMax} дней</span>
          </div>
        </Card>

        {/* Scoring (for debtor_scoring) */}
        {isScoring&&<Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Скоринг-карта</h3>
          <div className="mb-4"><div className="text-xs font-semibold mb-2" style={{color:B.t2}}>Количественные ({mockQuantScores.reduce((a,b)=>a+b,0)}/100)</div>
          <div className="space-y-1.5">{SCORING_QUANTITATIVE.map((name,i)=><div key={i} className="flex items-center gap-2">
            <div className="text-[11px] truncate" style={{color:B.t1,maxWidth:160}}>{i+1}. {name}</div>
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{width:`${mockQuantScores[i]*10}%`,background:mockQuantScores[i]>=7?B.green:mockQuantScores[i]>=5?B.yellow:B.red}}/></div>
            <span className="text-[10px] font-bold w-7 text-right mono" style={{color:B.t1}}>{mockQuantScores[i]}/10</span>
          </div>)}</div></div>
          <div className="mb-4"><div className="text-xs font-semibold mb-2" style={{color:B.t2}}>Качественные ({mockQualScores.reduce((a,b)=>a+b,0)}/100)</div>
          <div className="space-y-1.5">{SCORING_QUALITATIVE.map((name,i)=><div key={i} className="flex items-center gap-2">
            <div className="text-[11px] truncate" style={{color:B.t1,maxWidth:160}}>{i+1}. {name}</div>
            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{width:`${mockQualScores[i]*5}%`,background:mockQualScores[i]>=14?B.green:mockQualScores[i]>=10?B.yellow:B.red}}/></div>
            <span className="text-[10px] font-bold w-7 text-right mono" style={{color:B.t1}}>{mockQualScores[i]}/20</span>
          </div>)}</div></div>
          <div className="flex items-center gap-4 p-4 rounded-xl" style={{background:sc.color+"10",border:`1px solid ${sc.color}30`}}>
            <div className="text-3xl font-black" style={{color:sc.color}}>{sc.cls}</div>
            <div><div className="text-sm font-bold" style={{color:B.t1}}>Итого: {totalScore}/200</div><div className="text-xs" style={{color:B.t2}}>Риск: {sc.risk} · Лимит: до {fmtByn(sc.maxLimit)} · Ставка: {sc.rate}%</div></div>
          </div>
        </Card>}

        {/* Auto-checks for funding */}
        {isFunding&&<Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Автоматические проверки</h3>
          <div className="space-y-1.5">{[{key:"antiduble",label:"Антидубль"},{key:"bisc",label:"blank.bisc.by"},{key:"limit",label:"Лимит достаточен"},{key:"overdue",label:"Нет просрочки"},{key:"stoplist",label:"Стоп-лист чист"}].map(ck=><div key={ck.key} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
            {req.checks?.[ck.key]?<CheckCircle size={14} style={{color:B.green}}/>:<XCircle size={14} style={{color:B.red}}/>}
            <span className="text-xs" style={{color:B.t1}}>{ck.label}</span>
          </div>)}</div>
          <div className="mt-4 p-3 rounded-xl bg-slate-50 text-xs"><div className="grid grid-cols-3 gap-2">
            <div><span style={{color:B.t3}}>Сумма:</span><div className="font-bold" style={{color:B.t1}}>{fmtByn(req.amount)}</div></div>
            <div><span style={{color:B.t3}}>Дисконт:</span><div className="font-bold" style={{color:B.orange}}>{fmtByn(discount)}</div></div>
            <div><span style={{color:B.t3}}>К перечислению:</span><div className="font-bold" style={{color:B.green}}>{fmtByn(req.amount-discount)}</div></div>
          </div></div>
        </Card>}

        {/* Expertises */}
        {(isScoring||isOnboarding)&&<Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Экспертизы</h3>
          <div className="grid grid-cols-2 gap-2">{activeExpertises.map(ex=>{
            const done = expertise[ex.key];
            return <button key={ex.key} onClick={()=>toggleExpertise(ex.key)} className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${done?"border-green-200 bg-green-50":"border-yellow-200 bg-yellow-50"}`}>
              {done?<CheckCircle size={16} style={{color:B.green}}/>:<Clock size={16} style={{color:B.yellow}}/>}
              <div className="min-w-0"><div className="text-xs font-semibold" style={{color:B.t1}}>{ex.label}</div><div className="text-[10px] truncate" style={{color:B.t3}}>{ex.full}</div></div>
              {ex.sla&&<span className="text-[9px] font-bold px-1 py-0.5 rounded shrink-0" style={{background:done?B.greenL:B.yellowL,color:done?B.green:B.yellow}}>SLA {ex.sla}д</span>}
            </button>;
          })}</div>
        </Card>}

        {/* Committee section (full mode only) */}
        {isFull&&isCommitteeStage&&<Card className="p-5" style={{borderColor:B.accent+"40"}}>
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{color:B.accent}}><Shield size={16}/>Кредитный комитет</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Дата заседания</label>
            <input type="date" value={committeeDate} onChange={e=>setCommitteeDate(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono" style={{color:B.t1}}/></div>
            <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Протокол №</label>
            <input value={committeeProtocol} onChange={e=>setCommitteeProtocol(e.target.value)} placeholder="Напр. №13" className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono" style={{color:B.t1}}/></div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 text-xs mb-4" style={{color:B.t2}}>
            Кворум: 3 из 5 членов комитета. {allExpertisesDone?"Все экспертизы завершены.":"⚠ Не все экспертизы завершены."}
          </div>
          <div className="flex gap-2">
            <Btn size="md" variant="success" icon={signing?Loader2:Check} disabled={signing||!committeeDate} className="flex-1" onClick={handleCommitteeApprove}>{signing?"Оформление...":"Решение КК: Одобрить"}</Btn>
            <Btn size="md" variant="danger" icon={XCircle} className="flex-1" onClick={()=>setRejectModal(true)}>Отклонить</Btn>
          </div>
        </Card>}

        {/* Comments */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Комментарии</h3>
          <div className="space-y-1.5 mb-3 max-h-36 overflow-y-auto">{comments.length===0?<div className="text-xs py-2 text-center" style={{color:B.t3}}>Нет</div>:
          comments.map((c,i)=><div key={i} className="flex gap-2 text-xs p-2 rounded-lg bg-slate-50"><div className="w-1 rounded-full shrink-0" style={{background:B.accent}}/><div className="min-w-0"><div style={{color:B.t1}}>{c.text}</div><div className="mt-0.5" style={{color:B.t3}}>{c.user} · {c.date}</div></div></div>)}</div>
          <div className="flex gap-2"><input value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addComment(newComment)} placeholder="Заметка..." className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100" style={{color:B.t1}}/><Btn size="sm" onClick={()=>addComment(newComment)} disabled={!newComment.trim()}>Добавить</Btn></div>
        </Card>
      </div>

      {/* Right column */}
      <div className="space-y-5">
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Документы</h3>
          <div className="space-y-1.5">{Object.entries(req.docs||{}).map(([key,val])=><div key={key} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
            {(val===true||val==="signed")?<CheckCircle size={13} style={{color:B.green}}/>:<Clock size={13} style={{color:B.yellow}}/>}
            <span className="text-[11px] truncate" style={{color:B.t1}}>{DOC_KEY_LABELS[key]||key}</span>
          </div>)}</div>
        </Card>

        {/* Decision */}
        {!isCommitteeStage&&<Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>{isFunding?"Финансирование":"Решение"}</h3>
          {isScoring&&!isRejected&&<>
            <div className="mb-3"><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Лимит (BYN)</label>
            <input value={limitInput||sc.maxLimit} onChange={e=>setLimitInput(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono" style={{color:B.t1}}/></div>
            <div className="mb-3"><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Ставка (%)</label>
            <select value={rateSelect} onChange={e=>setRateSelect(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100" style={{color:B.t1}}>
              <option value="20.5">20.5%</option><option value="25">25%</option><option value="30">30%</option>
            </select></div>
          </>}
          {isRejected?<div className="p-3 rounded-xl text-xs text-center" style={{background:B.redL,color:B.red}}>Отклонена {req.rejectDate}</div>:
          <div className="space-y-2">
            {isFunding?<Btn size="md" icon={signing?Loader2:Pen} onClick={handleFund} disabled={signing} className="w-full">{signing?"Подписание...":"Подписать и профинансировать"}</Btn>
            :<Btn size="md" icon={signing?Loader2:Pen} onClick={handleApprove} disabled={signing||(!allExpertisesDone&&!isOnboarding)} className="w-full">{signing?"Подписание...":"Одобрить и подписать ЭЦП"}</Btn>}
            <Btn variant="danger" size="md" icon={XCircle} onClick={()=>setRejectModal(true)} className="w-full">Отклонить</Btn>
          </div>}
        </Card>}
      </div>
    </div>

    <Modal open={rejectModal} onClose={()=>setRejectModal(false)} title="Отклонить заявку">
      <div className="space-y-4">
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Причина</label>
        <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Причина отклонения..." style={{color:B.t1}}/></div>
        <Btn variant="danger" onClick={handleReject} icon={XCircle} className="w-full">Подтвердить отклонение</Btn>
      </div>
    </Modal>
  </div>;
}

// ═══════════════════════════════════════
// PAGE 3: CLIENTS
// ═══════════════════════════════════════
function ClientsPage({pushNav, setToast}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);

  const filtered = COMPANIES.filter(c=>{
    if(filter==="creditors"&&c.role!=="creditor") return false;
    if(filter==="debtors"&&c.role!=="debtor") return false;
    if(search){const q=search.toLowerCase();return c.name.toLowerCase().includes(q)||c.unp.includes(q)}
    return true;
  });

  if(selectedClient) return <ClientDetailView client={selectedClient} onBack={()=>setSelectedClient(null)} setToast={setToast}/>;

  return <div>
    <PageHeader title="Клиенты" breadcrumbs={["Клиенты"]}/>
    <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
      <TabFilter tabs={[{id:"all",label:"Все",badge:COMPANIES.length},{id:"creditors",label:"Кредиторы",badge:COMPANIES.filter(c=>c.role==="creditor").length},{id:"debtors",label:"Должники",badge:COMPANIES.filter(c=>c.role==="debtor").length}]} active={filter} onChange={setFilter}/>
      <div className="w-64 shrink-0"><SearchBar value={search} onChange={setSearch} placeholder="Название, УНП..."/></div>
    </div>

    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{minWidth:750}}>
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Компания</th>
          <th className="px-2 py-2.5 text-left font-semibold" style={{color:B.t3}}>УНП</th>
          <th className="px-2 py-2.5 text-left font-semibold" style={{color:B.t3}}>Роль</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Скоринг</th>
          <th className="px-2 py-2.5 text-right font-semibold" style={{color:B.t3}}>Лимит</th>
          <th className="px-2 py-2.5 text-right font-semibold" style={{color:B.t3}}>Использ.</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Ставка</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Статус</th>
        </tr></thead>
        <tbody>{filtered.map((c,i)=>{
          const sc2 = c.scoring ? scoringClass(c.scoring.total) : null;
          return <tr key={c.id} onClick={()=>setSelectedClient(c)} className={`border-b border-slate-50 cursor-pointer hover:bg-blue-50/50 transition-colors ${i%2===1?"bg-slate-50/30":""}`}>
            <td className="px-3 py-2.5 font-semibold" style={{color:B.t1}}>{c.name}</td>
            <td className="px-2 py-2.5 mono" style={{color:B.t2}}>{c.unp}</td>
            <td className="px-2 py-2.5" style={{color:B.t2}}>{c.role==="creditor"?"Кредитор":"Должник"}</td>
            <td className="px-2 py-2.5 text-center">{sc2?<span className="font-bold px-2 py-0.5 rounded" style={{background:sc2.color+"18",color:sc2.color}}>{c.scoringClass}</span>:<span style={{color:B.t3}}>—</span>}</td>
            <td className="px-2 py-2.5 font-semibold text-right mono" style={{color:B.t1}}>{c.limit?fmtByn(c.limit):"—"}</td>
            <td className="px-2 py-2.5 text-right mono" style={{color:B.t2}}>{c.used!=null?fmtByn(c.used):"—"}</td>
            <td className="px-2 py-2.5 text-center mono" style={{color:B.t1}}>{c.rate?`${c.rate}%`:"—"}</td>
            <td className="px-2 py-2.5 text-center"><StatusBadge status={c.status}/></td>
          </tr>})}</tbody>
      </table>
      </div>
    </Card>
  </div>;
}

function ClientDetailView({client, onBack, setToast}) {
  const [limitModal, setLimitModal] = useState(false);
  const [rateModal, setRateModal] = useState(false);
  const [newLimit, setNewLimit] = useState(client.limit||0);
  const [newRate, setNewRate] = useState(client.rate||25);

  const clientDeals = ALL_DEALS.filter(d=>d.creditorId===client.id||d.debtorId===client.id);
  const sc2 = client.scoring ? scoringClass(client.scoring.total) : null;
  const relatedCompanies = client.role==="creditor"
    ? COMPANIES.filter(c=>c.role==="debtor"&&ALL_DEALS.some(d=>d.creditorId===client.id&&d.debtorId===c.id))
    : COMPANIES.filter(c=>c.role==="creditor"&&ALL_DEALS.some(d=>d.debtorId===client.id&&d.creditorId===c.id));

  const historyLog = [
    {date:"2026-01-15", action:"Регистрация на платформе", user:"Система"},
    {date:"2026-01-16", action:`Лимит установлен: ${fmtByn(client.limit||0)}`, user:"Иванов А.С."},
    {date:"2026-02-01", action:`Ставка изменена: ${client.rate}%`, user:"Иванов А.С."},
  ];

  return <div>
    <PageHeader title={client.name} breadcrumbs={["Клиенты",client.name]} onBack={onBack}
      actions={<div className="flex gap-2">
        <Btn size="sm" variant="secondary" icon={CreditCard} onClick={()=>setLimitModal(true)}>Изменить лимит</Btn>
        <Btn size="sm" variant="secondary" icon={TrendingUp} onClick={()=>setRateModal(true)}>Изменить ставку</Btn>
        <Btn size="sm" variant="danger" icon={Lock}>Заблокировать</Btn>
      </div>}/>

    <div className="grid gap-6" style={{gridTemplateColumns:"1fr 280px"}}>
      <div className="space-y-5 min-w-0">
        {/* Info */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Общие данные</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div><span style={{color:B.t3}}>Наименование:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{client.name}</div></div>
            <div><span style={{color:B.t3}}>УНП:</span><div className="font-semibold mono mt-0.5" style={{color:B.t1}}>{client.unp}</div></div>
            <div><span style={{color:B.t3}}>Директор:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{client.director}</div></div>
            <div><span style={{color:B.t3}}>Регистрация:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{client.regDate}</div></div>
            <div><span style={{color:B.t3}}>Роль:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{client.role==="creditor"?"Кредитор (поставщик)":"Должник (покупатель)"}</div></div>
            <div><span style={{color:B.t3}}>Скоринг:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{client.scoringType==="full"?"Полный":"Упрощённый"}</div></div>
          </div>
        </Card>

        {/* Scoring */}
        {sc2&&<Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Скоринг</h3>
          <div className="flex items-center gap-4 p-3 rounded-xl" style={{background:sc2.color+"10"}}>
            <div className="text-3xl font-black" style={{color:sc2.color}}>{client.scoringClass}</div>
            <div>
              <div className="text-sm font-bold" style={{color:B.t1}}>{client.scoring.total} / {client.scoring.maxScore}</div>
              <div className="text-xs" style={{color:B.t2}}>Количественные: {client.scoring.quantitative} · Качественные: {client.scoring.qualitative}</div>
            </div>
          </div>
        </Card>}

        {/* Deals */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Уступки ({clientDeals.length})</h3>
          {clientDeals.length>0?<table className="w-full text-xs">
            <thead><tr className="border-b border-slate-100"><th className="px-3 py-2 text-left" style={{color:B.t3}}>№</th><th className="px-3 py-2 text-right" style={{color:B.t3}}>Сумма</th><th className="px-3 py-2 text-left" style={{color:B.t3}}>Срок</th><th className="px-3 py-2" style={{color:B.t3}}>Статус</th></tr></thead>
            <tbody>{clientDeals.map(d=><tr key={d.id} className="border-b border-slate-50">
              <td className="px-3 py-2 mono font-semibold" style={{color:B.accent}}>{d.id}</td>
              <td className="px-3 py-2 text-right mono font-semibold" style={{color:B.t1}}>{fmtByn(d.amount)}</td>
              <td className="px-3 py-2" style={{color:B.t2}}>{d.term} дн.</td>
              <td className="px-3 py-2"><StatusBadge status={d.status}/></td>
            </tr>)}</tbody>
          </table>:<div className="text-xs py-4 text-center" style={{color:B.t3}}>Нет уступок</div>}
        </Card>

        {/* Related companies */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Связи: {client.role==="creditor"?"покупатели":"поставщики"}</h3>
          {relatedCompanies.length>0?<div className="space-y-2">{relatedCompanies.map(rc=><div key={rc.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
            <div><div className="text-xs font-semibold" style={{color:B.t1}}>{rc.name}</div><div className="text-[10px] mono" style={{color:B.t3}}>УНП {rc.unp}</div></div>
            <StatusBadge status={rc.status}/>
          </div>)}</div>:<div className="text-xs py-4 text-center" style={{color:B.t3}}>Нет связей</div>}
        </Card>
      </div>

      {/* Right column */}
      <div className="space-y-5">
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Лимит и ставка</h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between"><span style={{color:B.t3}}>Общий лимит:</span><span className="font-bold mono" style={{color:B.t1}}>{fmtByn(client.limit||0)}</span></div>
            <div className="flex justify-between"><span style={{color:B.t3}}>Использовано:</span><span className="font-semibold mono" style={{color:B.orange}}>{fmtByn(client.used||0)}</span></div>
            <div className="flex justify-between"><span style={{color:B.t3}}>Доступно:</span><span className="font-bold mono" style={{color:B.green}}>{fmtByn(client.available||0)}</span></div>
            {client.limit>0&&<div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{width:`${((client.used||0)/(client.limit))*100}%`,background:B.accent}}/>
            </div>}
            <div className="pt-2 border-t border-slate-100 flex justify-between"><span style={{color:B.t3}}>Ставка:</span><span className="font-bold mono" style={{color:B.accent}}>{client.rate?`${client.rate}%`:"—"}</span></div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Документы клиента</h3>
          <div className="space-y-1.5">
            {["Анкета (Прил.12)","Согласие БКИ","Согласие ОЭБ","Баланс Q4 2025","Отчёт о прибыли"].map((d,i)=><div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
              <CheckCircle size={13} style={{color:B.green}}/><span className="text-xs" style={{color:B.t1}}>{d}</span>
              <button className="ml-auto"><Eye size={13} style={{color:B.t3}}/></button>
            </div>)}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>История</h3>
          <div className="space-y-2">
            {historyLog.map((h,i)=><div key={i} className="flex gap-3 text-xs">
              <div className="w-1 rounded-full shrink-0" style={{background:B.border}}/>
              <div><div className="font-medium" style={{color:B.t1}}>{h.action}</div><div style={{color:B.t3}}>{h.date} · {h.user}</div></div>
            </div>)}
          </div>
        </Card>
      </div>
    </div>

    {/* Limit modal */}
    <Modal open={limitModal} onClose={()=>setLimitModal(false)} title="Изменить лимит">
      <div className="space-y-4">
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Текущий лимит</label><div className="text-sm font-bold mono" style={{color:B.t1}}>{fmtByn(client.limit||0)}</div></div>
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Новый лимит (BYN)</label><input type="number" value={newLimit} onChange={e=>setNewLimit(+e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono" style={{color:B.t1}}/></div>
        <Btn onClick={()=>{setLimitModal(false);setToast({msg:`Лимит ${client.name} изменён: ${fmtByn(newLimit)}`,type:"success"})}} className="w-full">Сохранить</Btn>
      </div>
    </Modal>

    {/* Rate modal */}
    <Modal open={rateModal} onClose={()=>setRateModal(false)} title="Изменить ставку">
      <div className="space-y-4">
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Текущая ставка</label><div className="text-sm font-bold mono" style={{color:B.t1}}>{client.rate}%</div></div>
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Новая ставка</label>
        <select value={newRate} onChange={e=>setNewRate(+e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100" style={{color:B.t1}}>
          <option value={20.5}>20.5% (Премиум)</option><option value={25}>25% (Стандарт)</option><option value={30}>30% (Повышенный)</option>
        </select></div>
        <Btn onClick={()=>{setRateModal(false);setToast({msg:`Ставка ${client.name} изменена: ${newRate}%`,type:"success"})}} className="w-full">Сохранить</Btn>
      </div>
    </Modal>
  </div>;
}

function ClientDetailPage({popNav,pushNav,setToast}) {
  return <div><PageHeader title="Детали клиента" breadcrumbs={["Клиенты","Детали"]} onBack={popNav}/></div>;
}

// ═══════════════════════════════════════
// PAGE 4: PORTFOLIO
// ═══════════════════════════════════════
function PortfolioPage({pushNav, setToast}) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedDeal, setSelectedDeal] = useState(null);

  const filtered = ALL_DEALS.filter(d=>{
    if(filter==="active"&&d.status!=="active") return false;
    if(filter==="paid"&&d.status!=="paid") return false;
    if(filter==="overdue"&&d.status!=="overdue") return false;
    if(search){const q=search.toLowerCase();return d.id.toLowerCase().includes(q)||getCreditorName(d.creditorId).toLowerCase().includes(q)||getDebtorName(d.debtorId).toLowerCase().includes(q)}
    return true;
  });

  const activeAll = ALL_DEALS.filter(d=>d.status==="active"||d.status==="overdue");
  const totalPortfolio = activeAll.reduce((s,d)=>s+d.amount,0);
  const avgCheck = Math.round(totalPortfolio / (activeAll.length||1));
  const avgTerm = Math.round(activeAll.reduce((s,d)=>s+d.term,0)/(activeAll.length||1));
  const war = activeAll.length>0?(activeAll.reduce((s,d)=>s+d.amount*(d.term<=30?20.5:d.term<=60?25:25),0)/totalPortfolio).toFixed(1):0;

  if(selectedDeal) return <DealDetailView deal={selectedDeal} onBack={()=>setSelectedDeal(null)} setToast={setToast}/>;

  return <div>
    <PageHeader title="Портфель" breadcrumbs={["Портфель"]}/>

    <div className="grid grid-cols-2 gap-4 mb-6">
      <KPICard label="Общий портфель" value={fmtByn(totalPortfolio)} icon={TrendingUp} color={B.accent} tooltip="Все активные + просроченные"/>
      <KPICard label="Средний чек" value={fmtByn(avgCheck)} icon={CreditCard} color={B.purple}/>
      <KPICard label="Средний срок" value={`${avgTerm} дн.`} icon={Clock} color={B.yellow}/>
      <KPICard label="WAR" value={`${war}%`} icon={TrendingUp} color={B.green} tooltip="Средневзвешенная ставка"/>
    </div>

    <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
      <TabFilter tabs={[{id:"all",label:"Все",badge:ALL_DEALS.length},{id:"active",label:"Активные",badge:ALL_DEALS.filter(d=>d.status==="active").length},{id:"paid",label:"Оплаченные",badge:ALL_DEALS.filter(d=>d.status==="paid").length},{id:"overdue",label:"Просроченные",badge:ALL_DEALS.filter(d=>d.status==="overdue").length}]} active={filter} onChange={setFilter}/>
      <div className="w-64 shrink-0"><SearchBar value={search} onChange={setSearch} placeholder="Номер, кредитор, должник..."/></div>
    </div>

    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{minWidth:800}}>
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-2 py-2.5 text-left font-semibold" style={{color:B.t3}}>№</th>
          <th className="px-2 py-2.5 text-left font-semibold" style={{color:B.t3}}>Кредитор</th>
          <th className="px-2 py-2.5 text-left font-semibold" style={{color:B.t3}}>Должник</th>
          <th className="px-2 py-2.5 text-right font-semibold" style={{color:B.t3}}>Сумма</th>
          <th className="px-2 py-2.5 text-right font-semibold" style={{color:B.t3}}>Дисконт</th>
          <th className="px-2 py-2.5 text-right font-semibold" style={{color:B.t3}}>К перечисл.</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Срок</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Дней</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Статус</th>
        </tr></thead>
        <tbody>{filtered.map((d,i)=><tr key={d.id} onClick={()=>setSelectedDeal(d)} className={`border-b border-slate-50 cursor-pointer hover:bg-blue-50/50 transition-colors ${i%2===1?"bg-slate-50/30":""}`}>
          <td className="px-2 py-2.5 font-semibold mono" style={{color:B.accent}}>{d.id}</td>
          <td className="px-2 py-2.5" style={{color:B.t1}}>{getCreditorName(d.creditorId)}</td>
          <td className="px-2 py-2.5" style={{color:B.t1}}>{getDebtorName(d.debtorId)}</td>
          <td className="px-2 py-2.5 font-semibold text-right mono" style={{color:B.t1}}>{fmtByn(d.amount)}</td>
          <td className="px-2 py-2.5 text-right mono" style={{color:B.orange}}>{fmtByn(d.discount)}</td>
          <td className="px-2 py-2.5 font-semibold text-right mono" style={{color:B.green}}>{fmtByn(d.toReceive)}</td>
          <td className="px-2 py-2.5 text-center" style={{color:B.t2}}>{d.term}д</td>
          <td className="px-2 py-2.5 text-center mono" style={{color:d.daysLeft<0?B.red:B.t1}}>{d.status==="paid"?"—":d.daysLeft}</td>
          <td className="px-2 py-2.5 text-center"><StatusBadge status={d.status}/></td>
        </tr>)}</tbody>
      </table>
      </div>
    </Card>
  </div>;
}

function DealDetailView({deal, onBack, setToast}) {
  const creditor = getCompany(deal.creditorId);
  const debtor = getCompany(deal.debtorId);

  const timeline = [
    {label:"Создание", date:deal.shipDate, done:true},
    {label:"ДС подписано", date:deal.fundedDate||"—", done:deal.ecpBank==="signed"},
    {label:"Финансирование", date:deal.fundedDate||"—", done:deal.funded},
    {label:"Оплата", date:deal.paidDate||"—", done:deal.status==="paid"},
  ];

  return <div>
    <PageHeader title={`Уступка ${deal.id}`} breadcrumbs={["Портфель",deal.id]} onBack={onBack}
      actions={<StatusBadge status={deal.status} size="md"/>}/>

    <div className="grid gap-6" style={{gridTemplateColumns:"1fr 280px"}}>
      <div className="space-y-5 min-w-0">
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Стороны</h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
              <div className="text-[10px] font-semibold mb-1" style={{color:B.accent}}>Кредитор</div>
              <div className="font-bold" style={{color:B.t1}}>{creditor?.name}</div>
              <div className="mono mt-1" style={{color:B.t3}}>УНП {creditor?.unp}</div>
            </div>
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-100">
              <div className="text-[10px] font-semibold mb-1" style={{color:B.purple}}>Должник</div>
              <div className="font-bold" style={{color:B.t1}}>{debtor?.name}</div>
              <div className="mono mt-1" style={{color:B.t3}}>УНП {debtor?.unp}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-semibold mb-1" style={{color:B.t2}}>Банк</div>
              <div className="font-bold" style={{color:B.t1}}>ЗАО «Нео Банк Азия»</div>
              <div className="mt-1" style={{color:B.t3}}>г. Минск</div>
            </div>
          </div>
        </Card>

        {/* Timeline */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Timeline</h3>
          <div className="flex items-center gap-2">
            {timeline.map((t,i)=><div key={i} className="flex-1 flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${t.done?"text-white":"border-2 border-slate-200"}`} style={t.done?{background:B.green}:undefined}>
                {t.done?<Check size={14}/>:<span className="text-xs font-bold" style={{color:B.t3}}>{i+1}</span>}
              </div>
              <div className="text-[10px] font-semibold text-center" style={{color:t.done?B.green:B.t3}}>{t.label}</div>
              <div className="text-[10px] text-center" style={{color:B.t3}}>{t.date}</div>
              {i<timeline.length-1&&<div className="absolute"/>}
            </div>)}
          </div>
        </Card>

        {/* Finances */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Финансы</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div><span style={{color:B.t3}}>Сумма уступки:</span><div className="text-lg font-bold mono mt-0.5" style={{color:B.t1}}>{fmtByn(deal.amount)}</div></div>
            <div><span style={{color:B.t3}}>Дисконт:</span><div className="text-lg font-bold mono mt-0.5" style={{color:B.orange}}>{fmtByn(deal.discount)}</div></div>
            <div><span style={{color:B.t3}}>К перечислению кредитору:</span><div className="text-lg font-bold mono mt-0.5" style={{color:B.green}}>{fmtByn(deal.toReceive)}</div></div>
            <div><span style={{color:B.t3}}>Срок / Дней осталось:</span><div className="text-lg font-bold mono mt-0.5" style={{color:B.t1}}>{deal.term} дн. / {deal.status==="paid"?"—":deal.daysLeft}</div></div>
          </div>
          <div className="mt-3 p-2.5 rounded-lg bg-slate-50 text-[10px]" style={{color:B.t3}}>
            Формула: {fmt(deal.amount)} × ({getCompany(deal.debtorId)?.rate||25}% / 365) × {deal.term} дн. = {fmtByn(deal.discount)}
          </div>
        </Card>
      </div>

      {/* Right */}
      <div className="space-y-5">
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Документы</h3>
          <div className="space-y-2">
            {[{label:deal.docType==="ttn"?"ТТН":"Акт",status:true},{label:"ЭСЧФ",status:true},{label:deal.supAg,status:true},{label:"Уведомление",status:deal.ecpDebtor==="confirmed"}].map((doc,i)=><div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50">
              {doc.status?<CheckCircle size={14} style={{color:B.green}}/>:<Clock size={14} style={{color:B.yellow}}/>}
              <span className="text-xs flex-1" style={{color:B.t1}}>{doc.label}</span>
              <Eye size={13} style={{color:B.t3}} className="cursor-pointer"/>
            </div>)}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Подписание</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
              <span style={{color:B.t2}}>Кредитор</span>
              {deal.ecpCreditor==="signed"?<span className="flex items-center gap-1 font-semibold" style={{color:B.green}}><CheckCircle size={12}/>Подписал</span>:<span style={{color:B.yellow}}>Ожидает</span>}
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
              <span style={{color:B.t2}}>Банк</span>
              {deal.ecpBank==="signed"?<span className="flex items-center gap-1 font-semibold" style={{color:B.green}}><CheckCircle size={12}/>Подписал</span>:<span style={{color:B.yellow}}>Ожидает</span>}
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
              <span style={{color:B.t2}}>Должник</span>
              {deal.ecpDebtor==="confirmed"?<span className="flex items-center gap-1 font-semibold" style={{color:B.green}}><CheckCircle size={12}/>Подтвердил</span>:<span style={{color:B.yellow}}>Ожидает</span>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>;
}

function DealDetailPage({popNav, setToast}) {
  return <div><PageHeader title="Уступка" breadcrumbs={["Портфель","Уступка"]} onBack={popNav}/></div>;
}

// ═══════════════════════════════════════
// PAGE 5: OVERDUE
// ═══════════════════════════════════════
function OverduePage({pushNav, setToast}) {
  const overdueDeals = ALL_DEALS.filter(d=>d.status==="overdue");

  const getReservePercent = (days) => {
    if(days>=180) return 100;
    if(days>=31) return 50;
    if(days>=8) return 20;
    return 5;
  };

  const reserveScale = [
    {day:0,pct:5,color:B.green},{day:8,pct:20,color:B.yellow},{day:31,pct:50,color:B.orange},{day:180,pct:100,color:B.red}
  ];

  return <div>
    <PageHeader title="Просрочки" breadcrumbs={["Просрочки"]}/>

    {/* Reserve scale visual */}
    <Card className="p-5 mb-6">
      <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>
        <InfoTooltip text="Шкала формирования резерва по просроченным уступкам согласно внутренней политике банка">Шкала резервов</InfoTooltip>
      </h3>
      <div className="flex items-end gap-0 h-24">
        {reserveScale.map((r,i)=><div key={i} className="flex-1 flex flex-col items-center justify-end">
          <div className="text-xs font-bold mb-1" style={{color:r.color}}>{r.pct}%</div>
          <div className="w-full rounded-t-lg" style={{height:`${r.pct*0.8}px`,background:r.color+"30",borderTop:`3px solid ${r.color}`}}/>
          <div className="text-[10px] mt-1 font-medium" style={{color:B.t3}}>День {r.day}{i===3?"+":""}</div>
        </div>)}
      </div>
    </Card>

    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{minWidth:750}}>
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>№</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Должник</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Кредитор</th>
          <th className="px-3 py-2.5 text-right font-semibold" style={{color:B.t3}}>Сумма</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Дней</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Резерв</th>
          <th className="px-3 py-2.5 text-right font-semibold" style={{color:B.t3}}>Резерв BYN</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Действия</th>
        </tr></thead>
        <tbody>{overdueDeals.map((d,i)=>{
          const daysPast = Math.abs(d.daysLeft);
          const resPct = getReservePercent(daysPast);
          const resByn = Math.round(d.amount * resPct / 100);
          return <tr key={d.id} className={`border-b border-slate-50 ${i%2===1?"bg-red-50/20":""}`}>
            <td className="px-3 py-2.5 font-semibold mono" style={{color:B.red}}>{d.id}</td>
            <td className="px-3 py-2.5 font-medium" style={{color:B.t1}}>{getDebtorName(d.debtorId)}</td>
            <td className="px-3 py-2.5" style={{color:B.t2}}>{getCreditorName(d.creditorId)}</td>
            <td className="px-3 py-2.5 font-bold text-right mono" style={{color:B.t1}}>{fmtByn(d.amount)}</td>
            <td className="px-2 py-2.5 font-bold text-center" style={{color:B.red}}>{daysPast}</td>
            <td className="px-2 py-2.5 font-bold text-center" style={{color:B.orange}}>{resPct}%</td>
            <td className="px-3 py-2.5 font-bold text-right mono" style={{color:B.red}}>{fmtByn(resByn)}</td>
            <td className="px-2 py-2.5 text-center">
              <div className="flex items-center justify-center gap-1">
                <Btn size="sm" variant="danger" onClick={()=>setToast({msg:`Пеня начислена по ${d.id}`,type:"success"})}>Пеня</Btn>
                <Btn size="sm" variant="ghost" onClick={()=>setToast({msg:`Претензия направлена`,type:"info"})}>Претензия</Btn>
              </div>
            </td>
          </tr>})}
        </tbody>
      </table>
      </div>
      {overdueDeals.length===0&&<div className="p-10 text-center text-sm" style={{color:B.t3}}>Нет просроченных уступок</div>}
    </Card>

    <div className="mt-4 p-4 rounded-xl text-xs" style={{background:B.accentL,color:B.accent}}>
      <InfoTooltip text="Безрегрессный факторинг — риск неоплаты полностью на банке">
        <span className="font-semibold">Безрегрессный факторинг:</span> регресс к кредитору НЕВОЗМОЖЕН. Recovery rate: ~50%.
      </InfoTooltip>
    </div>
  </div>;
}

// ═══════════════════════════════════════
// PAGE 6: DOCUMENTS
// ═══════════════════════════════════════
function DocumentsPage({setToast}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [signing, setSigning] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);

  const pendingBank = BANK_DOCS.filter(d=>d.ecpBank==="pending");
  const signedAll = BANK_DOCS.filter(d=>{
    const allSigned = (d.ecpBank==="signed"||d.ecpBank==="—")&&(d.ecpCreditor==="signed"||d.ecpCreditor==="—")&&(d.ecpDebtor==="confirmed"||d.ecpDebtor==="—");
    return allSigned;
  });
  const waitingClient = BANK_DOCS.filter(d=>d.ecpBank==="signed"&&d.ecpDebtor==="pending");

  const filtered = BANK_DOCS.filter(d=>{
    if(statusFilter==="pending"&&d.ecpBank!=="pending") return false;
    if(statusFilter==="signed"&&!signedAll.includes(d)) return false;
    if(statusFilter==="waiting"&&!waitingClient.includes(d)) return false;
    if(typeFilter!=="all"&&d.type!==typeFilter) return false;
    if(search){const q=search.toLowerCase();return d.name.toLowerCase().includes(q)||d.client.toLowerCase().includes(q)||(d.link||"").toLowerCase().includes(q)}
    return true;
  });

  const signDoc = (name) => {
    setSigning(true);
    setTimeout(()=>{setSigning(false);setToast({msg:`${name} подписан ЭЦП`,type:"success"})},1500);
  };

  const ecpIcon = status => {
    if(status==="signed") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap" style={{color:B.green}}><CheckCircle size={11}/>Подписан</span>;
    if(status==="confirmed") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap" style={{color:B.green}}><CheckCircle size={11}/>Подтв.</span>;
    if(status==="pending") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap" style={{color:B.yellow}}><Clock size={11}/>Ожидает</span>;
    return <span className="text-[10px]" style={{color:B.t3}}>—</span>;
  };

  const docTypeColor = type => {
    const m = {gd:B.accent,ds:B.accent,ttn:B.green,act:B.green,esfchf:B.purple,consent_bki:B.yellow,consent_oeb:B.yellow,consent_pd:B.yellow,notify:B.orange,anketa:B.purple,report:B.t2};
    return m[type]||B.t3;
  };

  const uniqueTypes = [...new Set(BANK_DOCS.map(d=>d.type))];

  // Document detail card
  if(selectedDoc) return <div>
    <PageHeader title={selectedDoc.name} breadcrumbs={["Документы",selectedDoc.name]} onBack={()=>setSelectedDoc(null)}
      actions={<div className="flex gap-2">
        {selectedDoc.ecpBank==="pending"&&<Btn size="sm" icon={Pen} onClick={()=>{setToast({msg:`${selectedDoc.name} подписан ЭЦП`,type:"success"});setSelectedDoc(null)}}>Подписать ЭЦП</Btn>}
        <Btn size="sm" variant="secondary" icon={Download} onClick={()=>setToast({msg:`${selectedDoc.name} — скачан PDF`,type:"info"})}>Скачать PDF</Btn>
      </div>}/>
    <div className="grid gap-6" style={{gridTemplateColumns:"1fr 280px"}}>
      <div className="space-y-5 min-w-0">
        {/* Preview placeholder */}
        <Card className="overflow-hidden">
          <div className="h-64 flex items-center justify-center" style={{background:"#F1F5F9"}}>
            <div className="text-center"><FileText size={48} style={{color:B.t3}}/><div className="text-sm mt-2 font-medium" style={{color:B.t3}}>Превью документа</div><div className="text-xs mt-1" style={{color:B.t3}}>{selectedDoc.name}</div></div>
          </div>
        </Card>
        {/* Info */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Информация</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div><span style={{color:B.t3}}>Тип:</span><div className="font-semibold mt-0.5" style={{color:docTypeColor(selectedDoc.type)}}>{DOC_TYPE_LABELS[selectedDoc.type]||selectedDoc.type}</div></div>
            <div><span style={{color:B.t3}}>Клиент:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{selectedDoc.client}</div></div>
            <div><span style={{color:B.t3}}>Привязка:</span><div className="font-semibold mono mt-0.5" style={{color:B.accent}}>{selectedDoc.link||"—"}</div></div>
            <div><span style={{color:B.t3}}>Дата:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{selectedDoc.date}</div></div>
          </div>
        </Card>
        {/* Sign history */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>История подписания</h3>
          <div className="space-y-2">
            {(selectedDoc.signHistory||[]).map((h,i)=><div key={i} className="flex items-center gap-3 text-xs p-2.5 rounded-lg bg-slate-50">
              <CheckCircle size={14} style={{color:B.green}}/>
              <div className="flex-1 min-w-0"><span className="font-semibold" style={{color:B.t1}}>{h.who}</span><span className="ml-2" style={{color:B.t3}}>{h.date}</span></div>
              <span className="mono text-[10px]" style={{color:B.t3}}>IP: {h.ip}</span>
            </div>)}
            {!(selectedDoc.signHistory?.length)&&<div className="text-xs py-3 text-center" style={{color:B.t3}}>Нет данных о подписании</div>}
          </div>
        </Card>
      </div>
      {/* Right */}
      <div className="space-y-5">
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Статус ЭЦП</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50"><span style={{color:B.t2}}>Кредитор</span>{ecpIcon(selectedDoc.ecpCreditor)}</div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50"><span style={{color:B.t2}}>Банк</span>{ecpIcon(selectedDoc.ecpBank)}</div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50"><span style={{color:B.t2}}>Должник</span>{ecpIcon(selectedDoc.ecpDebtor)}</div>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Связанные документы</h3>
          <div className="space-y-1.5">
            {BANK_DOCS.filter(d=>d.link===selectedDoc.link&&d.id!==selectedDoc.id&&selectedDoc.link&&selectedDoc.link!=="—").map(d=><button key={d.id} onClick={()=>setSelectedDoc(d)} className="w-full flex items-center gap-2 p-2 rounded-lg bg-slate-50 hover:bg-blue-50 text-left text-xs transition-colors">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{background:docTypeColor(d.type)}}/>
              <span className="truncate font-medium" style={{color:B.t1}}>{d.name}</span>
            </button>)}
            {(!selectedDoc.link||selectedDoc.link==="—"||BANK_DOCS.filter(d=>d.link===selectedDoc.link&&d.id!==selectedDoc.id).length===0)&&<div className="text-xs py-2 text-center" style={{color:B.t3}}>Нет связанных</div>}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Действия</h3>
          <div className="space-y-2">
            {selectedDoc.ecpBank==="pending"&&<Btn size="sm" icon={Pen} className="w-full" onClick={()=>{setToast({msg:`${selectedDoc.name} подписан ЭЦП`,type:"success"});setSelectedDoc(null)}}>Подписать ЭЦП</Btn>}
            <Btn size="sm" variant="secondary" icon={Download} className="w-full" onClick={()=>setToast({msg:"PDF скачан",type:"info"})}>Скачать PDF</Btn>
            <Btn size="sm" variant="ghost" icon={Eye} className="w-full" onClick={()=>setToast({msg:"Открыто в просмотре",type:"info"})}>Просмотреть</Btn>
          </div>
        </Card>
      </div>
    </div>
  </div>;

  return <div>
    <PageHeader title="Документы" breadcrumbs={["Документы"]}/>

    {/* KPI */}
    <div className="grid grid-cols-2 gap-4 mb-5">
      <KPICard label="Всего документов" value={BANK_DOCS.length} icon={Archive} color={B.accent}/>
      <KPICard label="Ожидают подписи банка" value={pendingBank.length} sub={pendingBank.length>0?"требуют действия":undefined} icon={Pen} color={pendingBank.length>0?B.yellow:B.green}/>
      <KPICard label="Подписаны всеми" value={signedAll.length} icon={CheckCircle} color={B.green}/>
      <KPICard label="Ожидают клиента" value={waitingClient.length} icon={Clock} color={waitingClient.length>0?B.orange:B.green}/>
    </div>

    {/* Filters row 1: status */}
    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <TabFilter tabs={[
        {id:"all",label:"Все",badge:BANK_DOCS.length},
        {id:"pending",label:"Подписать банком",badge:pendingBank.length},
        {id:"signed",label:"Подписан всеми"},
        {id:"waiting",label:"Ожидает клиента",badge:waitingClient.length},
      ]} active={statusFilter} onChange={setStatusFilter}/>
      <div className="w-64 shrink-0"><SearchBar value={search} onChange={setSearch} placeholder="Документ, клиент, уступка..."/></div>
    </div>

    {/* Filters row 2: type pills */}
    <div className="flex items-center gap-1.5 mb-4 flex-wrap">
      <button onClick={()=>setTypeFilter("all")} className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all" style={typeFilter==="all"?{background:B.accent,color:"white",borderColor:B.accent}:{background:"white",color:B.t2,borderColor:B.border}}>Все типы</button>
      {uniqueTypes.map(t=><button key={t} onClick={()=>setTypeFilter(typeFilter===t?"all":t)} className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all" style={typeFilter===t?{background:docTypeColor(t),color:"white",borderColor:docTypeColor(t)}:{background:"white",color:docTypeColor(t),borderColor:B.border}}>
        {DOC_TYPE_LABELS[t]||t}<span className="ml-1 opacity-70">{BANK_DOCS.filter(d=>d.type===t).length}</span>
      </button>)}
    </div>

    {/* Table */}
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{minWidth:750}}>
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-2 py-2.5 text-left font-semibold" style={{color:B.t3}}>Документ</th>
          <th className="px-2 py-2.5 text-left font-semibold" style={{color:B.t3}}>Клиент</th>
          <th className="px-2 py-2.5 text-left font-semibold" style={{color:B.t3}}>Привязка</th>
          <th className="px-2 py-2.5 text-left font-semibold" style={{color:B.t3}}>Дата</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Кредитор</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Банк</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Должник</th>
          <th className="px-2 py-2.5 text-center font-semibold w-24" style={{color:B.t3}}>Действия</th>
        </tr></thead>
        <tbody>{filtered.map((d,i)=>{
          const needsSign = d.ecpBank==="pending";
          return <tr key={d.id} onClick={()=>setSelectedDoc(d)}
            className={`border-b border-slate-50 cursor-pointer transition-colors hover:bg-blue-50/40 ${i%2===1?"bg-slate-50/30":""}`}
            style={needsSign?{borderLeft:`3px solid ${B.yellow}`,background:"#FFFBEB08"}:{}}>
            <td className="px-2 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{background:docTypeColor(d.type)}}/>
                <div className="min-w-0"><div className="font-semibold truncate" style={{color:B.t1,maxWidth:200}}>{d.name}</div>
                <div className="text-[10px] truncate" style={{color:docTypeColor(d.type)}}>{DOC_TYPE_LABELS[d.type]||d.type}</div></div>
              </div>
            </td>
            <td className="px-2 py-2"><div className="truncate" style={{color:B.t1,maxWidth:140}}>{d.client}</div></td>
            <td className="px-2 py-2 mono whitespace-nowrap" style={{color:d.link&&d.link!=="—"?B.accent:B.t3}}>{d.link||"—"}</td>
            <td className="px-2 py-2 whitespace-nowrap" style={{color:B.t3}}>{d.date}</td>
            <td className="px-2 py-2 text-center">{ecpIcon(d.ecpCreditor)}</td>
            <td className="px-2 py-2 text-center">{ecpIcon(d.ecpBank)}</td>
            <td className="px-2 py-2 text-center">{ecpIcon(d.ecpDebtor)}</td>
            <td className="px-2 py-2 text-center" onClick={e=>e.stopPropagation()}>
              <div className="flex items-center justify-center gap-1">
                {needsSign&&<Btn size="sm" icon={Pen} onClick={()=>setToast({msg:`${d.name} подписан ЭЦП`,type:"success"})}>Подписать</Btn>}
                <button onClick={()=>setToast({msg:`${d.name} — скачан`,type:"info"})} className="p-1.5 rounded-lg hover:bg-slate-100" title="Скачать PDF"><Download size={13} style={{color:B.t3}}/></button>
              </div>
            </td>
          </tr>})}</tbody>
      </table>
      </div>
      {filtered.length===0&&<div className="p-8 text-center text-sm" style={{color:B.t3}}>Документы не найдены</div>}
    </Card>
  </div>;
}

// ═══════════════════════════════════════
// PAGE 7: RATES & LIMITS
// ═══════════════════════════════════════
function RatesPage({setToast}) {
  const clientRates = COMPANIES.filter(c=>c.role==="debtor"&&c.status==="active").map(d=>{
    const creditors = [...new Set(ALL_DEALS.filter(dl=>dl.debtorId===d.id).map(dl=>dl.creditorId))];
    return {debtor:d, creditors, rate:d.rate};
  });

  const discountSheet = [
    {month:"Март 2026", deals:3, volume:225000, discountTotal:12193, bankIncome:Math.round(12193*0.65), platformIncome:Math.round(12193*0.35)},
    {month:"Февраль 2026", deals:1, volume:30000, discountTotal:1233, bankIncome:Math.round(1233*0.65), platformIncome:Math.round(1233*0.35)},
    {month:"Январь 2026", deals:1, volume:25000, discountTotal:1233, bankIncome:Math.round(1233*0.65), platformIncome:Math.round(1233*0.35)},
  ];

  return <div>
    <PageHeader title="Ставки и лимиты" breadcrumbs={["Ставки и лимиты"]}/>

    {/* Rate scenarios */}
    <Card className="mb-6 overflow-hidden">
      <div className="p-5 pb-0">
      <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>
        <InfoTooltip text="Банк всегда получает 15.5%. Формула: сумма × (ставка/365) × дни.">Ценовые сценарии</InfoTooltip>
      </h3>
      </div>
      <div className="overflow-x-auto px-5 pb-5">
      <table className="w-full text-xs" style={{minWidth:550}}>
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Сценарий</th>
          <th className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>Годовая</th>
          <th className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>Банк</th>
          <th className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>Платформа</th>
          <th className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>Общая</th>
          <th className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>30 дн.</th>
          <th className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>60 дн.</th>
          <th className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>90 дн.</th>
        </tr></thead>
        <tbody>{RATE_SCENARIOS.map((r,i)=><tr key={i} className="border-b border-slate-50">
          <td className="px-3 py-2.5 font-semibold" style={{color:B.t1}}>{r.name}</td>
          <td className="px-3 py-2.5 text-center mono font-bold" style={{color:B.accent}}>{r.annual}%</td>
          <td className="px-3 py-2.5 text-center mono" style={{color:B.green}}>{r.bank}%</td>
          <td className="px-3 py-2.5 text-center mono" style={{color:B.purple}}>{r.platform}%</td>
          <td className="px-3 py-2.5 text-center mono font-bold" style={{color:B.t1}}>{r.total}%</td>
          <td className="px-3 py-2.5 text-center mono" style={{color:B.t2}}>{r.d30}%</td>
          <td className="px-3 py-2.5 text-center mono" style={{color:B.t2}}>{r.d60}%</td>
          <td className="px-3 py-2.5 text-center mono" style={{color:B.t2}}>{r.d90}%</td>
        </tr>)}</tbody>
      </table>
      </div>
    </Card>

    {/* Client rates */}
    <Card className="mb-6 overflow-hidden">
      <div className="p-5 pb-0">
      <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>
        <InfoTooltip text="Один кредитор — разные ставки по разным должникам">Ставки по клиентам</InfoTooltip>
      </h3>
      </div>
      <div className="overflow-x-auto px-5 pb-5">
      <table className="w-full text-xs" style={{minWidth:550}}>
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Кредитор</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Должник</th>
          <th className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>Ставка</th>
          <th className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>Сценарий</th>
          <th className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>Действие</th>
        </tr></thead>
        <tbody>{clientRates.map((cr,i)=><tr key={i} className="border-b border-slate-50">
          <td className="px-3 py-2.5 font-medium" style={{color:B.t1}}>{cr.creditors.map(id=>getCreditorName(id)).join(", ")}</td>
          <td className="px-3 py-2.5 font-medium" style={{color:B.t1}}>{cr.debtor.name}</td>
          <td className="px-3 py-2.5 text-center mono font-bold" style={{color:B.accent}}>{cr.rate}%</td>
          <td className="px-3 py-2.5 text-center" style={{color:B.t2}}>{cr.rate<=20.5?"Премиум":cr.rate<=25?"Стандарт":"Повышенный"}</td>
          <td className="px-3 py-2.5 text-center"><Btn size="sm" variant="ghost" onClick={()=>setToast({msg:`Изменение ставки для ${cr.debtor.name}`,type:"info"})}>Изменить</Btn></td>
        </tr>)}</tbody>
      </table>
      </div>
    </Card>

    {/* Discount statement */}
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-5 pb-0 mb-4">
        <h3 className="text-sm font-bold" style={{color:B.t1}}>Ведомость начисленного дисконта</h3>
        <Btn size="sm" variant="secondary" icon={Download} onClick={()=>setToast({msg:"Ведомость выгружена в Excel",type:"success"})}>Скачать Excel</Btn>
      </div>
      <div className="overflow-x-auto px-5 pb-5">
      <table className="w-full text-xs" style={{minWidth:550}}>
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Месяц</th>
          <th className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>Уступок</th>
          <th className="px-3 py-2.5 text-right font-semibold" style={{color:B.t3}}>Объём</th>
          <th className="px-3 py-2.5 text-right font-semibold" style={{color:B.t3}}>Дисконт</th>
          <th className="px-3 py-2.5 text-right font-semibold" style={{color:B.t3}}>Доход банка</th>
          <th className="px-3 py-2.5 text-right font-semibold" style={{color:B.t3}}>Доход платформы</th>
        </tr></thead>
        <tbody>{discountSheet.map((r,i)=><tr key={i} className="border-b border-slate-50">
          <td className="px-3 py-2.5 font-medium" style={{color:B.t1}}>{r.month}</td>
          <td className="px-3 py-2.5 text-center mono" style={{color:B.t2}}>{r.deals}</td>
          <td className="px-3 py-2.5 text-right mono font-semibold" style={{color:B.t1}}>{fmtByn(r.volume)}</td>
          <td className="px-3 py-2.5 text-right mono" style={{color:B.orange}}>{fmtByn(r.discountTotal)}</td>
          <td className="px-3 py-2.5 text-right mono font-semibold" style={{color:B.green}}>{fmtByn(r.bankIncome)}</td>
          <td className="px-3 py-2.5 text-right mono" style={{color:B.purple}}>{fmtByn(r.platformIncome)}</td>
        </tr>)}</tbody>
      </table>
      </div>
    </Card>
  </div>;
}

// ═══════════════════════════════════════
// PAGE 8: STOPLIST
// ═══════════════════════════════════════
function StoplistPage({setToast}) {
  const [items, setItems] = useState(STOPLIST);
  const [addModal, setAddModal] = useState(false);
  const [checkUnp, setCheckUnp] = useState("");
  const [checkResult, setCheckResult] = useState(null);
  const [newEntry, setNewEntry] = useState({type:"legal",unp:"",name:"",reason:""});

  const handleCheck = () => {
    const found = items.find(i=>i.unp===checkUnp||(i.personalId&&i.personalId===checkUnp));
    setCheckResult(found ? {found:true, item:found} : {found:false});
  };

  const handleAdd = () => {
    const entry = {id:items.length+1, ...newEntry, addedBy:"Иванов А.С.", addedDate:"2026-03-22"};
    setItems([...items, entry]);
    setAddModal(false);
    setNewEntry({type:"legal",unp:"",name:"",reason:""});
    setToast({msg:"Запись добавлена в стоп-лист",type:"success"});
  };

  const handleDelete = (id) => {
    setItems(items.filter(i=>i.id!==id));
    setToast({msg:"Запись удалена из стоп-листа",type:"info"});
  };

  return <div>
    <PageHeader title="Стоп-листы" breadcrumbs={["Стоп-листы"]}
      actions={<div className="flex gap-2">
        <Btn size="sm" variant="secondary" icon={Download} onClick={()=>setToast({msg:"Импорт CSV/Excel",type:"info"})}>Импорт</Btn>
        <Btn size="sm" icon={Plus} onClick={()=>setAddModal(true)}>Добавить</Btn>
      </div>}/>

    {/* Quick check */}
    <Card className="p-5 mb-6">
      <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Проверить УНП / личный номер</h3>
      <div className="flex gap-2">
        <input value={checkUnp} onChange={e=>setCheckUnp(e.target.value)} placeholder="Введите УНП или личный номер" className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono" style={{color:B.t1}}/>
        <Btn size="md" icon={Search} onClick={handleCheck}>Проверить</Btn>
      </div>
      {checkResult&&<div className={`mt-3 p-3 rounded-xl text-xs font-medium ${checkResult.found?"bg-red-50 border border-red-200":"bg-green-50 border border-green-200"}`} style={{color:checkResult.found?B.red:B.green}}>
        {checkResult.found?`⚠ Найден: ${checkResult.item.name} — ${checkResult.item.reason}`:"✅ Не найден в стоп-листе"}
      </div>}
    </Card>

    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{minWidth:700}}>
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>УНП / Личный №</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Тип</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Наименование / ФИО</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Основание</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Добавлен</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Кем</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}></th>
        </tr></thead>
        <tbody>{items.map((s,i)=><tr key={s.id} className={`border-b border-slate-50 ${i%2===1?"bg-slate-50/30":""}`}>
          <td className="px-3 py-2.5 font-semibold mono" style={{color:B.red}}>{s.unp||s.personalId}</td>
          <td className="px-3 py-2.5" style={{color:B.t2}}>{s.type==="legal"?"ЮЛ":"ФЛ"}</td>
          <td className="px-3 py-2.5 font-medium" style={{color:B.t1}}>{s.name}</td>
          <td className="px-3 py-2.5" style={{color:B.t2}}>{s.reason}</td>
          <td className="px-3 py-2.5" style={{color:B.t3}}>{s.addedDate}</td>
          <td className="px-3 py-2.5" style={{color:B.t3}}>{s.addedBy}</td>
          <td className="px-2 py-2.5 text-center"><Btn size="sm" variant="danger" onClick={()=>handleDelete(s.id)}>Удалить</Btn></td>
        </tr>)}</tbody>
      </table>
      </div>
    </Card>

    {/* Add modal */}
    <Modal open={addModal} onClose={()=>setAddModal(false)} title="Добавить в стоп-лист">
      <div className="space-y-4">
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Тип</label>
        <select value={newEntry.type} onChange={e=>setNewEntry({...newEntry,type:e.target.value})} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}>
          <option value="legal">Юридическое лицо</option><option value="person">Физическое лицо</option>
        </select></div>
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>УНП / Личный номер</label><input value={newEntry.unp} onChange={e=>setNewEntry({...newEntry,unp:e.target.value})} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/></div>
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Наименование / ФИО</label><input value={newEntry.name} onChange={e=>setNewEntry({...newEntry,name:e.target.value})} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}/></div>
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Основание</label><input value={newEntry.reason} onChange={e=>setNewEntry({...newEntry,reason:e.target.value})} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}/></div>
        <Btn onClick={handleAdd} className="w-full">Добавить</Btn>
      </div>
    </Modal>
  </div>;
}

// ═══════════════════════════════════════
// PAGE 9: ABS EXPORTS
// ═══════════════════════════════════════
function AbsPage({setToast}) {
  const [dateFrom, setDateFrom] = useState("2026-03-01");
  const [dateTo, setDateTo] = useState("2026-03-31");

  return <div>
    <PageHeader title="Выгрузки АБС" breadcrumbs={["Выгрузки АБС"]}/>

    <Card className="p-5 mb-6">
      <div className="flex items-center gap-4 mb-4">
        <h3 className="text-sm font-bold" style={{color:B.t1}}>
          <InfoTooltip text="АБС разработана SoftClub. Полная интеграция 4-6 мес. Сейчас — Excel-выгрузки для ручного ввода.">Фаза 1: Excel-выгрузки для УСКО</InfoTooltip>
        </h3>
      </div>

      <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-slate-50">
        <span className="text-xs font-medium" style={{color:B.t2}}>Период:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 mono" style={{color:B.t1}}/>
        <span className="text-xs" style={{color:B.t3}}>—</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 mono" style={{color:B.t1}}/>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {ABS_EXPORTS.map(exp=><button key={exp.id} onClick={()=>setToast({msg:`${exp.name} — файл сформирован`,type:"success"})} className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition-all text-left">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:B.accentL}}><exp.icon size={18} style={{color:B.accent}}/></div>
          <div className="flex-1">
            <div className="text-sm font-semibold" style={{color:B.t1}}>{exp.name}</div>
            <div className="text-xs mt-0.5" style={{color:B.t3}}>{exp.desc}</div>
          </div>
          <Download size={18} style={{color:B.accent}}/>
        </button>)}
      </div>
    </Card>

    <Card className="p-5">
      <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Лог выгрузок</h3>
      <table className="w-full text-xs">
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Дата</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Тип выгрузки</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Пользователь</th>
        </tr></thead>
        <tbody>{EXPORT_LOG.map((l,i)=><tr key={i} className="border-b border-slate-50">
          <td className="px-3 py-2.5" style={{color:B.t2}}>{l.date}</td>
          <td className="px-3 py-2.5 font-medium" style={{color:B.t1}}>{l.type}</td>
          <td className="px-3 py-2.5" style={{color:B.t3}}>{l.user}</td>
        </tr>)}</tbody>
      </table>
    </Card>
  </div>;
}

// ═══════════════════════════════════════
// PAGE 10: SETTINGS
// ═══════════════════════════════════════
function SettingsPage({setToast}) {
  const [repayOrder, setRepayOrder] = useState("gk"); // gk or proportional
  const [penaltyPrincipal, setPenaltyPrincipal] = useState("0.1");
  const [penaltyDiscount, setPenaltyDiscount] = useState("0.05");
  const [emailNotifs, setEmailNotifs] = useState({newDeal:true, overdue:true, payment:true, scoring:true, stoplist:true});
  const [reserveDay0, setReserveDay0] = useState("5");
  const [reserveDay8, setReserveDay8] = useState("20");
  const [reserveDay31, setReserveDay31] = useState("50");
  const [reserveDay180, setReserveDay180] = useState("100");

  return <div>
    <PageHeader title="Настройки" breadcrumbs={["Настройки"]}/>

    <div className="space-y-6">
      {/* Users */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold" style={{color:B.t1}}>Пользователи банка</h3>
          <Btn size="sm" icon={Plus} onClick={()=>setToast({msg:"Добавление пользователя",type:"info"})}>Добавить</Btn>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-slate-100"><th className="px-3 py-2 text-left" style={{color:B.t3}}>ФИО</th><th className="px-3 py-2 text-left" style={{color:B.t3}}>Роль</th><th className="px-3 py-2 text-left" style={{color:B.t3}}>Email</th><th className="px-3 py-2" style={{color:B.t3}}>Статус</th></tr></thead>
          <tbody>{BANK_USERS.map(u=><tr key={u.id} className="border-b border-slate-50">
            <td className="px-3 py-2.5 font-medium" style={{color:B.t1}}>{u.name}</td>
            <td className="px-3 py-2.5" style={{color:B.t2}}>{u.role}</td>
            <td className="px-3 py-2.5 mono" style={{color:B.t3}}>{u.email}</td>
            <td className="px-3 py-2.5 text-center"><StatusBadge status={u.status==="active"?"active":"inactive"}/></td>
          </tr>)}</tbody>
        </table>
        </div>
      </Card>

      {/* System params */}
      <div className="grid grid-cols-2 gap-5">
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>
            <InfoTooltip text="(а) ГК РБ: основной → дисконт. (б) Пропорционально.">Очерёдность погашения</InfoTooltip>
          </h3>
          <div className="flex gap-3">
            <button onClick={()=>setRepayOrder("gk")} className={`flex-1 p-3 rounded-xl border text-xs text-left ${repayOrder==="gk"?"border-blue-300 bg-blue-50":"border-slate-200 hover:bg-slate-50"}`}>
              <div className="font-semibold" style={{color:repayOrder==="gk"?B.accent:B.t1}}>ГК РБ</div>
              <div className="mt-0.5" style={{color:B.t3}}>Основной → Дисконт</div>
            </button>
            <button onClick={()=>setRepayOrder("prop")} className={`flex-1 p-3 rounded-xl border text-xs text-left ${repayOrder==="prop"?"border-blue-300 bg-blue-50":"border-slate-200 hover:bg-slate-50"}`}>
              <div className="font-semibold" style={{color:repayOrder==="prop"?B.accent:B.t1}}>Пропорционально</div>
              <div className="mt-0.5" style={{color:B.t3}}>Равномерное распределение</div>
            </button>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Тарифный план пеней</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] font-medium mb-1 block" style={{color:B.t3}}>По основному долгу (%/день)</label>
            <input value={penaltyPrincipal} onChange={e=>setPenaltyPrincipal(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 mono" style={{color:B.t1}}/></div>
            <div><label className="text-[10px] font-medium mb-1 block" style={{color:B.t3}}>По дисконту (%/день)</label>
            <input value={penaltyDiscount} onChange={e=>setPenaltyDiscount(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 mono" style={{color:B.t1}}/></div>
          </div>
          <div className="text-[10px] mt-2" style={{color:B.t3}}>Начало начисления: следующий календарный день после просрочки</div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Резервирование</h3>
          <div className="grid grid-cols-4 gap-2">
            {[{label:"День 0",val:reserveDay0,set:setReserveDay0},{label:"День 8",val:reserveDay8,set:setReserveDay8},{label:"День 31",val:reserveDay31,set:setReserveDay31},{label:"День 180",val:reserveDay180,set:setReserveDay180}].map((r,i)=><div key={i}>
              <label className="text-[10px] font-medium mb-1 block" style={{color:B.t3}}>{r.label}</label>
              <div className="flex items-center gap-1"><input value={r.val} onChange={e=>r.set(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 mono text-center" style={{color:B.t1}}/><span className="text-xs" style={{color:B.t3}}>%</span></div>
            </div>)}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Email-уведомления</h3>
          <div className="space-y-2">
            {[{key:"newDeal",label:"Новая уступка"},{key:"overdue",label:"Просрочка"},{key:"payment",label:"Оплата"},{key:"scoring",label:"Скоринг завершён"},{key:"stoplist",label:"Изменение стоп-листа"}].map(n=><label key={n.key} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 cursor-pointer">
              <span className="text-xs font-medium" style={{color:B.t1}}>{n.label}</span>
              <button onClick={()=>setEmailNotifs({...emailNotifs,[n.key]:!emailNotifs[n.key]})}>{emailNotifs[n.key]?<ToggleRight size={20} style={{color:B.accent}}/>:<ToggleLeft size={20} style={{color:B.t3}}/>}</button>
            </label>)}
          </div>
        </Card>
      </div>
    </div>

    <div className="mt-6 flex justify-end">
      <Btn onClick={()=>setToast({msg:"Настройки сохранены",type:"success"})} icon={Check}>Сохранить настройки</Btn>
    </div>
  </div>;
}

// ═══════════════════════════════════════
// PAGE 11: SCORING MODEL ADMIN
// ═══════════════════════════════════════
const DEFAULT_QUANT = [
  {id:1, name:"Коэф. текущей ликвидности", maxScore:10, weight:1.0, enabled:true, desc:"Оборотные активы / Краткосрочные обязательства. Норма ≥1.5"},
  {id:2, name:"Коэф. финансового левериджа", maxScore:10, weight:1.0, enabled:true, desc:"Заёмный капитал / Собственный капитал. Чем ниже — тем лучше"},
  {id:3, name:"Рентабельность активов ROA", maxScore:10, weight:1.0, enabled:true, desc:"Чистая прибыль / Средние активы × 100%"},
  {id:4, name:"EBITDA margin", maxScore:10, weight:1.0, enabled:true, desc:"EBITDA / Выручка × 100%. Показатель операционной эффективности"},
  {id:5, name:"Оборачиваемость активов", maxScore:10, weight:1.0, enabled:true, desc:"Выручка / Средние активы. Эффективность использования активов"},
  {id:6, name:"Коэф. автономии", maxScore:10, weight:1.0, enabled:true, desc:"Собственный капитал / Валюта баланса. Норма ≥0.5"},
  {id:7, name:"Рентабельность продаж", maxScore:10, weight:1.0, enabled:true, desc:"Чистая прибыль / Выручка × 100%"},
  {id:8, name:"Чистые активы / уставный фонд", maxScore:10, weight:1.0, enabled:true, desc:"Соотношение ЧА к уставному фонду. Должно быть ≥1"},
  {id:9, name:"Динамика выручки", maxScore:10, weight:1.0, enabled:true, desc:"Темп роста выручки за последние 12 мес. (%)"},
  {id:10, name:"Долговая нагрузка / EBITDA", maxScore:10, weight:1.0, enabled:true, desc:"Общий долг / EBITDA. Норма ≤3.0"},
];

const DEFAULT_QUAL = [
  {id:101, name:"Срок работы компании", maxScore:20, weight:1.0, enabled:true, desc:"Количество лет с момента регистрации. >5 лет — максимум"},
  {id:102, name:"Директор / судимости / сменяемость", maxScore:20, weight:1.0, enabled:true, desc:"Проверка директора по базам, частота смены руководства"},
  {id:103, name:"Отрасль / сезонность", maxScore:20, weight:1.0, enabled:true, desc:"Оценка отрасли: стабильность, сезонность, перспективы"},
  {id:104, name:"Кредитная история", maxScore:20, weight:1.0, enabled:true, desc:"Данные из БКИ: наличие просрочек, текущие обязательства"},
  {id:105, name:"Рыночная позиция / конкуренция", maxScore:20, weight:1.0, enabled:true, desc:"Доля рынка, количество конкурентов, устойчивость позиции"},
];

const DEFAULT_CLASSES = [
  {id:"AA", minScore:160, maxScore:200, risk:"Минимальный", maxLimit:500000, rate:20.5, color:B.green},
  {id:"A",  minScore:130, maxScore:159, risk:"Низкий", maxLimit:300000, rate:25, color:"#059669"},
  {id:"BB", minScore:100, maxScore:129, risk:"Умеренный", maxLimit:200000, rate:25, color:B.yellow},
  {id:"B",  minScore:70,  maxScore:99,  risk:"Повышенный", maxLimit:100000, rate:30, color:B.orange},
  {id:"CC", minScore:0,   maxScore:69,  risk:"Высокий → отказ", maxLimit:0, rate:0, color:B.red},
];

const COLOR_PRESETS = [
  {label:"Зелёный", value:B.green},
  {label:"Тёмно-зелёный", value:"#059669"},
  {label:"Жёлтый", value:B.yellow},
  {label:"Оранжевый", value:B.orange},
  {label:"Красный", value:B.red},
  {label:"Синий", value:B.accent},
  {label:"Фиолетовый", value:B.purple},
];

function ScoringPage({setToast}) {
  const [quantItems, setQuantItems] = useState(DEFAULT_QUANT.map(q=>({...q})));
  const [qualItems, setQualItems] = useState(DEFAULT_QUAL.map(q=>({...q})));
  const [classes, setClasses] = useState(DEFAULT_CLASSES.map(c=>({...c})));
  const [decisionThreshold, setDecisionThreshold] = useState(400000);
  const [version, setVersion] = useState("v1.0");
  const [addQuantModal, setAddQuantModal] = useState(false);
  const [addQualModal, setAddQualModal] = useState(false);
  const [newIndicator, setNewIndicator] = useState({name:"", maxScore:10, weight:1.0, desc:""});
  const [changeLog, setChangeLog] = useState([
    {date:"2026-01-15", user:"Иванов А.С.", action:"Модель создана (v1.0)"},
    {date:"2026-02-10", user:"Смирнов Д.К.", action:"Вес ROA изменён: 1.0 → 1.2"},
    {date:"2026-03-05", user:"Иванов А.С.", action:"Порог класса BB: 100 → 95 (отменено)"},
  ]);

  // Simulator state
  const [simQuantScores, setSimQuantScores] = useState(quantItems.map(()=>0));
  const [simQualScores, setSimQualScores] = useState(qualItems.map(()=>0));
  const [simOpen, setSimOpen] = useState(false);

  // Calculated totals
  const quantMax = quantItems.filter(q=>q.enabled).reduce((s,q)=>s+Math.round(q.maxScore*q.weight),0);
  const qualMax = qualItems.filter(q=>q.enabled).reduce((s,q)=>s+Math.round(q.maxScore*q.weight),0);
  const totalMax = quantMax + qualMax;

  // Simulator calculations
  const simQuantTotal = quantItems.reduce((s,q,i)=>s+(q.enabled?Math.round(simQuantScores[i]*q.weight):0),0);
  const simQualTotal = qualItems.reduce((s,q,i)=>s+(q.enabled?Math.round(simQualScores[i]*q.weight):0),0);
  const simTotal = simQuantTotal + simQualTotal;
  const simClass = classes.find(c=>simTotal>=c.minScore&&simTotal<=c.maxScore) || classes[classes.length-1];

  // Handlers
  const updateQuant = (id, field, value) => {
    setQuantItems(prev=>prev.map(q=>q.id===id?{...q,[field]:value}:q));
    logChange(`Кол. показатель «${quantItems.find(q=>q.id===id)?.name}»: ${field} изменён`);
  };
  const updateQual = (id, field, value) => {
    setQualItems(prev=>prev.map(q=>q.id===id?{...q,[field]:value}:q));
    logChange(`Кач. показатель «${qualItems.find(q=>q.id===id)?.name}»: ${field} изменён`);
  };
  const updateClass = (id, field, value) => {
    setClasses(prev=>prev.map(c=>c.id===id?{...c,[field]:value}:c));
  };

  const logChange = (action) => {
    setChangeLog(prev=>[{date:new Date().toISOString().slice(0,10), user:"Иванов А.С.", action},...prev].slice(0,20));
  };

  const addIndicator = (type) => {
    if(!newIndicator.name.trim()) return;
    const item = {id:Date.now(), name:newIndicator.name, maxScore:+newIndicator.maxScore||10, weight:+newIndicator.weight||1.0, enabled:true, desc:newIndicator.desc||""};
    if(type==="quant") {
      setQuantItems(prev=>[...prev, item]);
      setSimQuantScores(prev=>[...prev, 0]);
    } else {
      setQualItems(prev=>[...prev, item]);
      setSimQualScores(prev=>[...prev, 0]);
    }
    setNewIndicator({name:"", maxScore:type==="quant"?10:20, weight:1.0, desc:""});
    setAddQuantModal(false); setAddQualModal(false);
    logChange(`Добавлен ${type==="quant"?"количественный":"качественный"} показатель: ${item.name}`);
    setToast({msg:`Показатель «${item.name}» добавлен`,type:"success"});
  };

  const removeIndicator = (type, id) => {
    const name = (type==="quant"?quantItems:qualItems).find(q=>q.id===id)?.name;
    if(type==="quant") {
      const idx = quantItems.findIndex(q=>q.id===id);
      setQuantItems(prev=>prev.filter(q=>q.id!==id));
      setSimQuantScores(prev=>prev.filter((_,i)=>i!==idx));
    } else {
      const idx = qualItems.findIndex(q=>q.id===id);
      setQualItems(prev=>prev.filter(q=>q.id!==id));
      setSimQualScores(prev=>prev.filter((_,i)=>i!==idx));
    }
    logChange(`Удалён показатель: ${name}`);
    setToast({msg:`Показатель «${name}» удалён`,type:"info"});
  };

  const resetDefaults = () => {
    setQuantItems(DEFAULT_QUANT.map(q=>({...q})));
    setQualItems(DEFAULT_QUAL.map(q=>({...q})));
    setClasses(DEFAULT_CLASSES.map(c=>({...c})));
    setDecisionThreshold(400000);
    setSimQuantScores(DEFAULT_QUANT.map(()=>0));
    setSimQualScores(DEFAULT_QUAL.map(()=>0));
    logChange("Модель сброшена к стандартным параметрам");
    setToast({msg:"Модель сброшена к стандартным параметрам",type:"info"});
  };

  const saveNewVersion = () => {
    const v = parseFloat(version.replace("v",""))+0.1;
    setVersion(`v${v.toFixed(1)}`);
    logChange(`Сохранена новая версия модели: v${v.toFixed(1)}`);
    setToast({msg:`Скоринговая модель сохранена как v${v.toFixed(1)}`,type:"success"});
  };

  const resetSimulator = () => {
    setSimQuantScores(quantItems.map(()=>0));
    setSimQualScores(qualItems.map(()=>0));
  };

  // Shared indicator table renderer
  const IndicatorTable = ({items, type, onUpdate, onRemove, simScores, setSimScores}) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{minWidth:600}}>
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-3 py-2.5 text-left font-semibold w-8" style={{color:B.t3}}>#</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Показатель</th>
          <th className="px-3 py-2.5 text-center font-semibold w-20" style={{color:B.t3}}>Макс. балл</th>
          <th className="px-3 py-2.5 text-center font-semibold w-20" style={{color:B.t3}}>
            <InfoTooltip text="Множитель значимости. 1.0 = стандартный, 1.5 = повышенный, 0.5 = пониженный">Вес</InfoTooltip>
          </th>
          <th className="px-3 py-2.5 text-center font-semibold w-24" style={{color:B.t3}}>
            <InfoTooltip text="Макс. балл × Вес = Взвешенный балл">Взвешенный</InfoTooltip>
          </th>
          <th className="px-3 py-2.5 text-center font-semibold w-16" style={{color:B.t3}}>Вкл</th>
          <th className="px-3 py-2.5 text-center font-semibold w-10" style={{color:B.t3}}></th>
        </tr></thead>
        <tbody>{items.map((item,idx)=><tr key={item.id} className={`border-b border-slate-50 ${!item.enabled?"opacity-40":""} ${idx%2===1?"bg-slate-50/30":""}`}>
          <td className="px-3 py-2.5 text-center font-semibold" style={{color:B.t3}}>{idx+1}</td>
          <td className="px-3 py-2.5">
            <div className="font-medium" style={{color:B.t1}}>{item.name}</div>
            {item.desc&&<div className="text-[10px] mt-0.5" style={{color:B.t3}}>{item.desc}</div>}
          </td>
          <td className="px-3 py-2.5 text-center">
            <input type="number" min={1} max={100} value={item.maxScore} onChange={e=>onUpdate(item.id,"maxScore",+e.target.value||1)}
              className="w-14 px-1.5 py-1 text-center text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono" style={{color:B.t1}}/>
          </td>
          <td className="px-3 py-2.5 text-center">
            <input type="number" min={0.1} max={3.0} step={0.1} value={item.weight} onChange={e=>onUpdate(item.id,"weight",+e.target.value||0.1)}
              className="w-14 px-1.5 py-1 text-center text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono" style={{color:B.t1}}/>
          </td>
          <td className="px-3 py-2.5 text-center">
            <span className="mono font-bold text-xs" style={{color:item.enabled?B.accent:B.t3}}>{Math.round(item.maxScore*item.weight)}</span>
          </td>
          <td className="px-3 py-2.5 text-center">
            <button onClick={()=>onUpdate(item.id,"enabled",!item.enabled)}>
              {item.enabled?<ToggleRight size={20} style={{color:B.accent}}/>:<ToggleLeft size={20} style={{color:B.t3}}/>}
            </button>
          </td>
          <td className="px-3 py-2.5 text-center">
            <button onClick={()=>onRemove(type, item.id)} className="p-1 rounded-lg hover:bg-red-50"><X size={14} style={{color:B.red}}/></button>
          </td>
        </tr>)}</tbody>
      </table>
    </div>
  );

  return <div>
    <PageHeader title="Скоринговая модель" breadcrumbs={["Скоринг"]}
      actions={<div className="flex items-center gap-2">
        <span className="px-2.5 py-1 rounded-lg text-xs font-bold mono" style={{background:B.accentL,color:B.accent}}>{version}</span>
        <Btn size="sm" variant="secondary" icon={RefreshCw} onClick={resetDefaults}>Сбросить</Btn>
        <Btn size="sm" variant="secondary" icon={Download} onClick={()=>setToast({msg:"Модель выгружена в Excel",type:"success"})}>Экспорт</Btn>
        <Btn size="sm" icon={Check} onClick={saveNewVersion}>Сохранить версию</Btn>
      </div>}/>

    <div className="grid grid-cols-3 gap-4 mb-6">
      <KPICard label="Макс. количественных" value={quantMax} sub={`${quantItems.filter(q=>q.enabled).length} показателей`} icon={TrendingUp} color={B.accent} tooltip="Сумма взвешенных максимальных баллов активных количественных показателей"/>
      <KPICard label="Макс. качественных" value={qualMax} sub={`${qualItems.filter(q=>q.enabled).length} показателей`} icon={Shield} color={B.purple} tooltip="Сумма взвешенных максимальных баллов активных качественных показателей"/>
      <KPICard label="Общий максимум" value={totalMax} sub={`${quantItems.filter(q=>q.enabled).length+qualItems.filter(q=>q.enabled).length} показателей`} icon={CheckCircle} color={B.green} tooltip="Количественные + Качественные. Пороги классов настраиваются ниже."/>
    </div>

    {/* ═══ SECTION 1: Quantitative ═══ */}
    <Card className="mb-6">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-bold flex items-center gap-2" style={{color:B.t1}}>
          <TrendingUp size={16} style={{color:B.accent}}/>
          <InfoTooltip text="Финансовые показатели на основе баланса и отчёта о прибылях. Каждый оценивается от 0 до макс. балла.">Количественные показатели</InfoTooltip>
          <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-lg" style={{background:B.accentL,color:B.accent}}>Макс: {quantMax}</span>
        </h3>
        <Btn size="sm" icon={Plus} onClick={()=>{setNewIndicator({name:"",maxScore:10,weight:1.0,desc:""});setAddQuantModal(true)}}>Добавить</Btn>
      </div>
      <IndicatorTable items={quantItems} type="quant" onUpdate={updateQuant} onRemove={removeIndicator}/>
    </Card>

    {/* ═══ SECTION 2: Qualitative ═══ */}
    <Card className="mb-6">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-bold flex items-center gap-2" style={{color:B.t1}}>
          <Shield size={16} style={{color:B.purple}}/>
          <InfoTooltip text="Экспертные оценки аналитика. Каждый оценивается от 0 до макс. балла.">Качественные показатели</InfoTooltip>
          <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-lg" style={{background:B.purpleL,color:B.purple}}>Макс: {qualMax}</span>
        </h3>
        <Btn size="sm" icon={Plus} onClick={()=>{setNewIndicator({name:"",maxScore:20,weight:1.0,desc:""});setAddQualModal(true)}}>Добавить</Btn>
      </div>
      <IndicatorTable items={qualItems} type="qual" onUpdate={updateQual} onRemove={removeIndicator}/>
    </Card>

    {/* ═══ SECTION 3: Classes & Thresholds ═══ */}
    <Card className="mb-6">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-bold flex items-center gap-2" style={{color:B.t1}}>
          <CreditCard size={16} style={{color:B.yellow}}/>
          <InfoTooltip text="Диапазоны баллов определяют класс должника, рекомендуемый лимит и ставку. Пороги не должны пересекаться.">Классы и пороги</InfoTooltip>
          <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-lg" style={{background:B.yellowL,color:B.yellow}}>Общий максимум: {totalMax}</span>
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{minWidth:650}}>
          <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
            <th className="px-3 py-2.5 text-center font-semibold w-16" style={{color:B.t3}}>Класс</th>
            <th className="px-3 py-2.5 text-center font-semibold w-20" style={{color:B.t3}}>Мин. баллов</th>
            <th className="px-3 py-2.5 text-center font-semibold w-20" style={{color:B.t3}}>Макс. баллов</th>
            <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Риск</th>
            <th className="px-3 py-2.5 text-right font-semibold w-28" style={{color:B.t3}}>Макс. лимит</th>
            <th className="px-3 py-2.5 text-center font-semibold w-24" style={{color:B.t3}}>Рек. ставка</th>
            <th className="px-3 py-2.5 text-center font-semibold w-20" style={{color:B.t3}}>Цвет</th>
          </tr></thead>
          <tbody>{classes.map((cls,i)=><tr key={cls.id} className={`border-b border-slate-50 ${i%2===1?"bg-slate-50/30":""}`}>
            <td className="px-3 py-3 text-center">
              <span className="text-lg font-black" style={{color:cls.color}}>{cls.id}</span>
            </td>
            <td className="px-3 py-3 text-center">
              <input type="number" min={0} max={totalMax} value={cls.minScore} onChange={e=>updateClass(cls.id,"minScore",+e.target.value)}
                className="w-14 px-1.5 py-1 text-center text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono" style={{color:B.t1}}/>
            </td>
            <td className="px-3 py-3 text-center">
              <input type="number" min={0} max={totalMax} value={cls.maxScore} onChange={e=>updateClass(cls.id,"maxScore",+e.target.value)}
                className="w-14 px-1.5 py-1 text-center text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono" style={{color:B.t1}}/>
            </td>
            <td className="px-3 py-3">
              <input value={cls.risk} onChange={e=>updateClass(cls.id,"risk",e.target.value)}
                className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100" style={{color:B.t1}}/>
            </td>
            <td className="px-3 py-3 text-right">
              <input type="number" min={0} step={10000} value={cls.maxLimit} onChange={e=>updateClass(cls.id,"maxLimit",+e.target.value)}
                className="w-24 px-1.5 py-1 text-right text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono" style={{color:B.t1}}/>
            </td>
            <td className="px-3 py-3 text-center">
              <select value={cls.rate} onChange={e=>updateClass(cls.id,"rate",+e.target.value)}
                className="w-20 px-1 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 text-center" style={{color:B.t1}}>
                <option value={20.5}>20.5%</option><option value={25}>25%</option><option value={30}>30%</option><option value={0}>—</option>
              </select>
            </td>
            <td className="px-3 py-3 text-center">
              <select value={cls.color} onChange={e=>updateClass(cls.id,"color",e.target.value)}
                className="w-16 px-1 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none" style={{color:cls.color,fontWeight:700}}>
                {COLOR_PRESETS.map(cp=><option key={cp.value} value={cp.value} style={{color:cp.value}}>{cp.label}</option>)}
              </select>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-3">
        <span className="text-xs font-medium" style={{color:B.t2}}>
          <InfoTooltip text="Лимит до указанной суммы одобряется уполномоченным лицом. Свыше — выносится на Кредитный комитет.">Порог принятия решений:</InfoTooltip>
        </span>
        <span className="text-xs" style={{color:B.t2}}>Лимит ≤</span>
        <input type="number" step={50000} value={decisionThreshold} onChange={e=>setDecisionThreshold(+e.target.value)}
          className="w-28 px-2 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono text-center" style={{color:B.t1}}/>
        <span className="text-xs" style={{color:B.t2}}>BYN → уполномоченное лицо. Выше → Кредитный комитет.</span>
      </div>
    </Card>

    {/* ═══ SECTION 4: Simulator ═══ */}
    <Card className="mb-6">
      <button onClick={()=>setSimOpen(!simOpen)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
        <h3 className="text-sm font-bold flex items-center gap-2" style={{color:B.t1}}>
          <Zap size={16} style={{color:B.green}}/>Тест скоринговой модели (симулятор)
        </h3>
        {simOpen?<ChevronUp size={18} style={{color:B.t3}}/>:<ChevronDown size={18} style={{color:B.t3}}/>}
      </button>

      {simOpen&&<div className="px-5 pb-5 border-t border-slate-100 pt-4">
        {/* Result card */}
        <div className="flex items-center gap-4 p-4 rounded-xl mb-5" style={{background:simClass.color+"10",border:`2px solid ${simClass.color}30`}}>
          <div className="text-4xl font-black" style={{color:simClass.color}}>{simClass.id}</div>
          <div className="flex-1">
            <div className="text-sm font-bold" style={{color:B.t1}}>Итого: {simTotal} / {totalMax}</div>
            <div className="text-xs" style={{color:B.t2}}>Количественные: {simQuantTotal} · Качественные: {simQualTotal}</div>
            <div className="text-xs mt-0.5" style={{color:B.t2}}>Риск: {simClass.risk} · Лимит: до {simClass.maxLimit>0?fmtByn(simClass.maxLimit):"отказ"} · Ставка: {simClass.rate?`${simClass.rate}%`:"—"}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {simTotal>=decisionThreshold&&simClass.maxLimit>0&&<span className="text-[10px] px-2 py-0.5 rounded-lg font-semibold" style={{background:B.yellowL,color:B.yellow}}>Кредитный комитет</span>}
            <Btn size="sm" variant="ghost" icon={RefreshCw} onClick={resetSimulator}>Сбросить</Btn>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden mb-5 relative">
          <div className="h-full rounded-full transition-all duration-300" style={{width:`${Math.min((simTotal/totalMax)*100,100)}%`,background:`linear-gradient(90deg, ${B.red}, ${B.orange}, ${B.yellow}, ${B.green})`}}/>
          {classes.map(cls=><div key={cls.id} className="absolute top-0 h-full border-r-2 border-white/80" style={{left:`${(cls.minScore/totalMax)*100}%`}}>
            <span className="absolute -top-4 text-[9px] font-bold" style={{color:cls.color,transform:"translateX(-50%)"}}>{cls.id}</span>
          </div>)}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Quantitative sliders */}
          <div>
            <div className="text-xs font-semibold mb-3 flex items-center gap-2" style={{color:B.accent}}>
              <TrendingUp size={14}/>Количественные ({simQuantTotal}/{quantMax})
            </div>
            <div className="space-y-3">
              {quantItems.map((item,idx)=>item.enabled&&<div key={item.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium truncate mr-2" style={{color:B.t1}}>{item.name}</span>
                  <span className="text-[11px] font-bold mono shrink-0" style={{color:B.accent}}>{simQuantScores[idx]}/{item.maxScore}</span>
                </div>
                <input type="range" min={0} max={item.maxScore} value={simQuantScores[idx]||0}
                  onChange={e=>setSimQuantScores(prev=>{const n=[...prev];n[idx]=+e.target.value;return n})}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{background:`linear-gradient(to right, ${B.accent} ${((simQuantScores[idx]||0)/item.maxScore)*100}%, #E2E8F0 ${((simQuantScores[idx]||0)/item.maxScore)*100}%)`}}/>
              </div>)}
            </div>
          </div>

          {/* Qualitative sliders */}
          <div>
            <div className="text-xs font-semibold mb-3 flex items-center gap-2" style={{color:B.purple}}>
              <Shield size={14}/>Качественные ({simQualTotal}/{qualMax})
            </div>
            <div className="space-y-3">
              {qualItems.map((item,idx)=>item.enabled&&<div key={item.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium truncate mr-2" style={{color:B.t1}}>{item.name}</span>
                  <span className="text-[11px] font-bold mono shrink-0" style={{color:B.purple}}>{simQualScores[idx]}/{item.maxScore}</span>
                </div>
                <input type="range" min={0} max={item.maxScore} value={simQualScores[idx]||0}
                  onChange={e=>setSimQualScores(prev=>{const n=[...prev];n[idx]=+e.target.value;return n})}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{background:`linear-gradient(to right, ${B.purple} ${((simQualScores[idx]||0)/item.maxScore)*100}%, #E2E8F0 ${((simQualScores[idx]||0)/item.maxScore)*100}%)`}}/>
              </div>)}
            </div>
          </div>
        </div>
      </div>}
    </Card>

    {/* ═══ Change log ═══ */}
    <Card className="p-5">
      <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{color:B.t1}}>
        <Clock size={16} style={{color:B.t3}}/>История изменений
      </h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {changeLog.map((log,i)=><div key={i} className="flex items-start gap-3 text-xs py-1.5">
          <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{background:i===0?B.accent:B.border}}/>
          <div className="flex-1"><span className="font-medium" style={{color:B.t1}}>{log.action}</span></div>
          <span className="shrink-0" style={{color:B.t3}}>{log.user} · {log.date}</span>
        </div>)}
      </div>
    </Card>

    {/* Add Quantitative modal */}
    <Modal open={addQuantModal} onClose={()=>setAddQuantModal(false)} title="Добавить количественный показатель">
      <div className="space-y-4">
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Название</label>
        <input value={newIndicator.name} onChange={e=>setNewIndicator({...newIndicator,name:e.target.value})} placeholder="Например: Коэф. покрытия процентов" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100" style={{color:B.t1}}/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Макс. балл</label>
          <input type="number" value={newIndicator.maxScore} onChange={e=>setNewIndicator({...newIndicator,maxScore:+e.target.value})} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/></div>
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Вес</label>
          <input type="number" step={0.1} min={0.1} max={3} value={newIndicator.weight} onChange={e=>setNewIndicator({...newIndicator,weight:+e.target.value})} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/></div>
        </div>
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Описание / формула</label>
        <textarea value={newIndicator.desc} onChange={e=>setNewIndicator({...newIndicator,desc:e.target.value})} rows={2} placeholder="Краткое пояснение..." className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100" style={{color:B.t1}}/></div>
        <Btn onClick={()=>addIndicator("quant")} className="w-full" icon={Plus}>Добавить показатель</Btn>
      </div>
    </Modal>

    {/* Add Qualitative modal */}
    <Modal open={addQualModal} onClose={()=>setAddQualModal(false)} title="Добавить качественный показатель">
      <div className="space-y-4">
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Название</label>
        <input value={newIndicator.name} onChange={e=>setNewIndicator({...newIndicator,name:e.target.value})} placeholder="Например: Репутация в отрасли" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100" style={{color:B.t1}}/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Макс. балл</label>
          <input type="number" value={newIndicator.maxScore} onChange={e=>setNewIndicator({...newIndicator,maxScore:+e.target.value})} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/></div>
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Вес</label>
          <input type="number" step={0.1} min={0.1} max={3} value={newIndicator.weight} onChange={e=>setNewIndicator({...newIndicator,weight:+e.target.value})} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/></div>
        </div>
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Описание</label>
        <textarea value={newIndicator.desc} onChange={e=>setNewIndicator({...newIndicator,desc:e.target.value})} rows={2} placeholder="Краткое пояснение..." className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100" style={{color:B.t1}}/></div>
        <Btn onClick={()=>addIndicator("qual")} className="w-full" icon={Plus}>Добавить показатель</Btn>
      </div>
    </Modal>
  </div>;
}
