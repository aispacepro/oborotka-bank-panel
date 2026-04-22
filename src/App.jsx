import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  LayoutDashboard, Zap, Users, TrendingUp, AlertTriangle, Archive, CreditCard, Ban, Download, Settings,
  Search, ChevronRight, ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, AlertCircle,
  Eye, Plus, X, Check, Loader2, Info, ArrowLeft, ArrowRight, Command, Shield, FileText, Hash,
  Building2, Calendar, ExternalLink, Pen, Mail, Phone, Lock, Unlock, ToggleLeft, ToggleRight,
  RefreshCw, Filter, MoreVertical, ArrowUpRight, ArrowDownRight, ChevronLeft, Bell,
  Inbox, GitBranch, Package, Star, Activity, User
} from "lucide-react";

// ─── usePersistedState: unified sessionStorage hook ───
// Replaces the pattern of useState+useEffect wrapping sessionStorage with try/catch
function usePersistedState(key, initialValue, validate) {
  const [value, setValue] = useState(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved === null) return initialValue;
      const parsed = (saved.startsWith("{") || saved.startsWith("[")) ? JSON.parse(saved) : saved;
      if (validate && !validate(parsed)) return initialValue;
      return parsed;
    } catch(e) { return initialValue; }
  });
  useEffect(() => {
    try {
      const toStore = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
      sessionStorage.setItem(key, toStore);
    } catch(e) {}
  }, [key, value]);
  return [value, setValue];
}

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

// ─── ROLES & ACCESS ───
const DEFAULT_USER = {
  id: 1,
  name: "Смирнов Д.К.",
  position: "Специалист для решений",
  role: "admin",
};

const ROLE_ACCESS = {
  admin: {
    label: "Администратор",
    description: "Полный доступ ко всем модулям и этапам",
    modules: "all",
    stages: "all",
    assignmentStages: "all",
    canViewAuditLog: true,
    canRequestLimitReview: true,
    color: "#0F172A",
    icon: "👑",
  },
  analyst: {
    label: "Кредитный аналитик",
    description: "Верифицирует скоринг. ≤50K подписывает сам. >50K передаёт ЛПР.",
    modules: ["dashboard", "pipeline", "clients", "scoring-admin"],
    stages: ["analyst_verification", "grey_zone"],
    assignmentStages: [],
    color: "#1E40AF",
    icon: "👤",
  },
  lpr: {
    label: "Лицо принимающее решение",
    description: "Одобряет заявки свыше 50K. Подписывает Решение ЭЦП.",
    modules: ["dashboard", "pipeline", "clients"],
    stages: ["lpr_decision"],
    assignmentStages: [],
    color: "#7C3AED",
    icon: "✍️",
  },
  usko_prepare: {
    label: "УСКО — оформление договоров",
    description: "Вносит номер счёта из АБС, генерирует ген.договор, обрабатывает уступки.",
    modules: ["dashboard", "pipeline", "clients", "documents", "assignments"],
    stages: ["contract_preparation", "client_activation"],
    assignmentStages: ["usko_checking", "ds_preparing", "payment_approved"],
    canRequestLimitReview: true,
    color: "#EA580C",
    icon: "📄",
  },
  signer: {
    label: "Подписант договоров",
    description: "Подписывает ген.договоры и допсоглашения ЭЦП банка.",
    modules: ["dashboard", "pipeline", "documents", "assignments"],
    stages: ["contract_signing"],
    assignmentStages: ["ds_signing_bank"],
    color: "#06B6D4",
    icon: "🔏",
  },
};

// Access control functions
function canAccessModule(user, moduleId) {
  const access = ROLE_ACCESS[user.role];
  if (!access) return false;
  if (access.modules === "all") return true;
  return access.modules.includes(moduleId);
}
function canActOnStage(user, stageId) {
  const access = ROLE_ACCESS[user.role];
  if (!access) return false;
  if (access.stages === "all") return true;
  return access.stages.includes(stageId);
}
function getMyStages(user) {
  const access = ROLE_ACCESS[user.role];
  if (!access || access.stages === "all") return null; // null = all
  return access.stages;
}

// SLA = 1 рабочий день на ВСЮ фазу одобрения (от подачи заявки до принятия решения).
// Одобрение = analyst_verification → lpr_decision (для >50K).
// Скоринг теперь автоматически попадает сразу в analyst_verification (без ручного "Взять в работу").
// После одобрения идут этапы оформления договора — у них свои нормативы (не SLA одобрения).
const APPROVAL_STAGES = ["analyst_verification", "lpr_decision", "grey_zone"];

// Нормативы на этапы оформления (после одобрения). Отдельный SLA от одобрения.
const POST_APPROVAL_SLA = {
  contract_preparation: 2,
  contract_signing: 1,
  client_signing: 5, // у клиента своё — банк на это не влияет, но трекаем
  client_activation: 1,
};

// Подсчёт рабочих дней между двумя датами (простая версия: пн-пт, без праздников)
function businessDaysBetween(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (to <= from) return 0;
  let days = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const toMid = new Date(to);
  toMid.setHours(0, 0, 0, 0);
  while (cursor < toMid) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

function isInApprovalPhase(stage) {
  return APPROVAL_STAGES.includes(stage);
}

// Основная функция: сколько рабочих дней прошло с подачи заявки (для фазы одобрения)
// или с начала текущего этапа (для пост-одобрения)
function getDaysOnStage(req) {
  const now = new Date("2026-03-26");
  if (isInApprovalPhase(req.stage)) {
    // Для фазы одобрения считаем с момента ПОДАЧИ заявки (created)
    return businessDaysBetween(req.created, now);
  }
  // Для пост-одобрения — с начала текущего этапа
  const start = req.stageStartDate || req.created;
  return businessDaysBetween(start, now);
}

function getSlaLimit(stage, tier) {
  if (isInApprovalPhase(stage)) return 1; // 1 рабочий день на всё одобрение
  return POST_APPROVAL_SLA[stage] ?? 5;
}

function isOverdue(req) {
  return getDaysOnStage(req) > getSlaLimit(req.stage, req.tier);
}

// ─── UNIFIED TASK HUB ───
// Collects tasks from all modules (pipeline, assignments, documents) for the current user,
// categorized by urgency/state so the user sees everything in correct priority order.
function collectAllMyTasks(user, data) {
  const {pipeline = [], assignments = [], documents = []} = data || {};
  const myPipelineStages = getMyStages(user);
  const myAssignmentStages = getMyAssignmentStages(user);
  const allTasks = [];

  // 1. Pipeline tasks (заявки на моих стадиях)
  pipeline.forEach(p => {
    if (p.stage === "rejected" || p.stage === "active") return;
    if (myPipelineStages !== null && !myPipelineStages.includes(p.stage)) return;
    const days = getDaysOnStage(p);
    const limit = getSlaLimit(p.stage, p.tier);
    const overdue = days > limit;
    // Sub-categorize by state
    let category;
    if (overdue) category = "urgent";
    else if (p.stage === "analyst_verification" && !p.analystTakenBy) category = "new";
    else if (p.stage === "grey_zone") category = "review";
    else if (p.stage === "client_signing") category = "waiting_client";
    else category = "in_progress";

    allTasks.push({
      type: "pipeline",
      id: p.id,
      title: p.company || p.id,
      subtitle: PIPELINE_STAGES.find(s => s.id === p.stage)?.label || p.stage,
      amount: p.requestedAmount,
      days, limit, overdue,
      priority: p.priority || "medium",
      category,
      icon: Zap,
      color: B.accent,
      action: getMainActionLabel(p.stage, user.role),
      raw: p,
    });
  });

  // 2. Assignment tasks (уступки на моих стадиях)
  if (myAssignmentStages.length > 0) {
    assignments.forEach(a => {
      if (!myAssignmentStages.includes(a.stage)) return;
      const days = getAssignmentDaysOnStage(a);
      const slaInfo = getAssignmentSlaInfo(a);
      const overdue = isAssignmentBankOverdue(a);
      const waitingClient = isAssignmentWaitingClient(a);
      let category;
      if (overdue) category = "urgent";
      else if (waitingClient) category = "waiting_client";
      else category = "in_progress";

      const stageInfo = ASSIGNMENT_STAGES.find(s => s.id === a.stage);
      allTasks.push({
        type: "assignment",
        id: a.id,
        title: `Уступка к ${a.dealId}`,
        subtitle: stageInfo?.label || a.stage,
        amount: a.amount,
        days, limit: slaInfo.days, overdue,
        priority: "medium",
        category,
        icon: Package,
        color: "#EA580C",
        action: a.stage === "ds_preparing" ? "подготовить ДС"
          : a.stage === "ds_signing_bank" ? "подписать ЭЦП банка"
          : a.stage === "payment_approved" ? "провести оплату"
          : a.stage === "usko_checking" ? "проверить документы"
          : "обработать",
        raw: a,
      });
    });
  }

  // 3. Document tasks (документы на моей подписи/действии)
  const userRole = user.role;
  documents.forEach(d => {
    // Signer: подписывает pending_bank ген.договоры/ДС
    if (userRole === "signer" && d.status === "pending_bank") {
      allTasks.push({
        type: "document",
        id: d.id,
        title: d.title,
        subtitle: "Ожидает подписи банка",
        amount: null,
        days: null, limit: null, overdue: false,
        priority: "high",
        category: "urgent_sign",
        icon: FileText,
        color: "#06B6D4",
        action: "подписать ЭЦП",
        raw: d,
      });
    }
    // USKO: документы в draft — нужно сгенерировать/подготовить
    if ((userRole === "usko_prepare" || userRole === "admin") && d.status === "draft") {
      allTasks.push({
        type: "document",
        id: d.id,
        title: d.title,
        subtitle: "Черновик — нужно сгенерировать",
        amount: null,
        days: null, limit: null, overdue: false,
        priority: "medium",
        category: "new",
        icon: FileText,
        color: "#EA580C",
        action: "сгенерировать",
        raw: d,
      });
    }
    // Expiring client documents (менее 7 дней до истечения)
    if ((userRole === "usko_prepare" || userRole === "analyst" || userRole === "admin")
      && d.validity?.daysRemaining != null
      && d.validity.daysRemaining >= 0
      && d.validity.daysRemaining <= 7) {
      allTasks.push({
        type: "document",
        id: d.id,
        title: d.title,
        subtitle: `Истекает через ${d.validity.daysRemaining}д`,
        amount: null,
        days: null, limit: null, overdue: d.validity.daysRemaining === 0,
        priority: d.validity.daysRemaining <= 2 ? "high" : "medium",
        category: "expiring",
        icon: FileText,
        color: B.yellow,
        action: "обновить",
        raw: d,
      });
    }
  });

  return allTasks;
}

// ─── getClientStatus: compute client status from pipeline + stoplist ───
// Returns one of: "active", "inactive", "rejected", "grey_zone", "stoplist"
function getClientStatus(client, pipeline, stoplist) {
  // Check stoplist first
  const inStoplist = (stoplist || []).some(s => s.unp === client.unp);
  if (inStoplist) return "stoplist";

  // Find most recent request in pipeline for this client
  const requests = (pipeline || []).filter(p => p.creditorId === client.id);
  if (requests.length === 0) {
    // No active request — use company's own status
    if (client.status === "rejected") return "rejected";
    if (client.status === "grey_zone") return "grey_zone";
    if (client.status === "active") return "active";
    return "inactive";
  }

  // Get most recent (by created date)
  const latest = [...requests].sort((a, b) => new Date(b.created||0) - new Date(a.created||0))[0];
  if (latest.stage === "active") return "active";
  if (latest.stage === "rejected") return "rejected";
  if (latest.stage === "grey_zone") return "grey_zone";
  // Any in-process stage means inactive
  return "inactive";
}

// Helper: find the most recent request for a client (used for banners in detail view)
function getLatestClientRequest(client, pipeline) {
  const requests = (pipeline || []).filter(p => p.creditorId === client.id);
  if (requests.length === 0) return null;
  return [...requests].sort((a, b) => new Date(b.created||0) - new Date(a.created||0))[0];
}

// Count tasks per module for current user (for dynamic sidebar badges)
function countMyTasks(user, data) {
  const tasks = collectAllMyTasks(user, data);
  const result = {pipeline: 0, assignments: 0, documents: 0, urgent: 0};
  tasks.forEach(t => {
    if (t.type === "pipeline") result.pipeline++;
    else if (t.type === "assignment") result.assignments++;
    else if (t.type === "document") result.documents++;
    if (t.category === "urgent" || t.category === "urgent_sign") result.urgent++;
  });
  return result;
}

// ─── PIPELINE UX UTILITIES (UX redesign) ───
function selectHeroTask(tasks) {
  if (!tasks || tasks.length === 0) return null;
  // 1. Самые просроченные (давно)
  const overdue = tasks.filter(isOverdue);
  if (overdue.length > 0) {
    return overdue.slice().sort((a, b) => getDaysOnStage(b) - getDaysOnStage(a))[0];
  }
  // 2. Высокий приоритет
  const highPriority = tasks.filter(t => t.priority === "high");
  if (highPriority.length > 0) {
    return highPriority.slice().sort((a, b) => getDaysOnStage(b) - getDaysOnStage(a))[0];
  }
  // 3. По давности
  return tasks.slice().sort((a, b) => getDaysOnStage(b) - getDaysOnStage(a))[0];
}

function getClientSilenceDays(req) {
  if (!["client_signing"].includes(req.stage)) return 0;
  const history = req.history || [];
  const lastClientAction = history.slice().reverse().find(h =>
    h.userRole === "client" || h.userRole === "supplier" || h.userRole === "debtor"
  );
  const now = new Date("2026-03-26");
  const ref = lastClientAction ? new Date(lastClientAction.date) : new Date(req.stageStartDate || req.created);
  return Math.max(0, Math.floor((now - ref) / 86400000));
}

function getAverageDaysOnStage(stage, tier) {
  // Mock benchmark data for demo
  const averages = {
    analyst_verification: tier === "simple" ? 0.3 : 1.2,
    lpr_decision: 0.8,
    contract_preparation: 0.4,
    contract_signing: 0.3,
    client_signing: 1.5,
    client_activation: 0.2,
  };
  return averages[stage] ?? null;
}

function getMainActionLabel(stage, role) {
  const labels = {
    analyst_verification: "верифицировать",
    lpr_decision: "принять решение",
    contract_preparation: "сгенерировать договор",
    contract_signing: "подписать ЭЦП",
    client_signing: "проверить подпись клиента",
    client_activation: "активировать клиента",
    grey_zone: "реанимировать",
  };
  return labels[stage] || "обработать";
}

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
  // analyst_verification — автоматически после скоринга (scoring_received этап убран)
  {id:"REQ-001", type:"debtor_scoring", company:"ООО «НовоТрейд»", unp:"590123456",
   creditorId:1, stage:"analyst_verification", stageStartDate:"2026-03-24", priority:"high", created:"2026-03-24",
   requestedAmount:30000, tier:"simple", scoringClass:"B", scoringTotal:135, legat:"clean", bki:"good",
   docs:{consentBki:true, legat:true}, comments:[],
   expectedDebtors:[{companyId:2, name:"ООО «БелТехСнаб»", expectedVolume:30000}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-03-24 10:10"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-03-24 10:12"},
   ]},
  {id:"REQ-002", type:"debtor_scoring", company:"ЧУП «ЕвроКомплект»", unp:"194567890",
   creditorId:1, stage:"analyst_verification", stageStartDate:"2026-03-25", priority:"medium", created:"2026-03-25",
   requestedAmount:45000, tier:"simple", scoringClass:"A", scoringTotal:165, legat:"clean", bki:"good",
   docs:{consentBki:true, legat:true}, comments:[],
   expectedDebtors:[{companyId:2, name:"ООО «БелТехСнаб»", expectedVolume:25000},{companyId:7, name:"ООО «ПромТорг»", expectedVolume:20000}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-03-25 09:03"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-03-25 09:04"},
   ]},

  // analyst_verification (взятые в работу)
  {id:"REQ-003", type:"debtor_scoring", company:"ООО «ТехноГрупп»", unp:"290567890",
   creditorId:1, stage:"analyst_verification", stageStartDate:"2026-03-18", priority:"high", created:"2026-03-18",
   requestedAmount:180000, tier:"extended", scoringClass:"A", scoringTotal:155,
   legat:"clean", bki:"good", balanceProvided:true, netAssets:"positive",
   docs:{consentBki:true, legat:true, balanceOpu:true}, comments:[],
   expectedDebtors:[{companyId:2, name:"ООО «БелТехСнаб»", expectedVolume:100000},{companyId:7, name:"ООО «ПромТорг»", expectedVolume:80000}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-03-18 11:15"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-03-18 11:16"},
   ]},
  {id:"REQ-004", type:"debtor_scoring", company:"ИП Сергеев В.А.", unp:"790555123",
   creditorId:1, stage:"analyst_verification", stageStartDate:"2026-03-20", priority:"high", created:"2026-03-20",
   requestedAmount:40000, tier:"simple", scoringClass:"A", scoringTotal:170,
   legat:"clean", bki:"good",
   docs:{consentBki:true, legat:true}, comments:[],
   expectedDebtors:[{companyId:2, name:"ООО «БелТехСнаб»", expectedVolume:40000}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-03-20 14:20"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-03-20 14:21"},
   ]},

  // lpr_decision
  {id:"REQ-005", type:"debtor_scoring", company:"ООО «АтомСтрой»", unp:"291234567",
   creditorId:1, stage:"lpr_decision", stageStartDate:"2026-03-23", priority:"high", created:"2026-03-20",
   requestedAmount:250000, tier:"extended", scoringClass:"A", scoringTotal:160,
   legat:"clean", bki:"good", balanceProvided:true, netAssets:"positive",
   expectedDebtors:[{companyId:2, name:"ООО «БелТехСнаб»", expectedVolume:150000},{companyId:7, name:"ООО «ПромТорг»", expectedVolume:70000},{companyId:8, name:"ЗАО «МегаСтрой»", expectedVolume:30000}],
   analystVerifiedBy:"Смирнов Д.К.", analystVerifiedDate:"2026-03-23",
   docs:{consentBki:true, legat:true, balanceOpu:true},
   comments:[{user:"Смирнов Д.К.",date:"2026-03-23",text:"Скоринг подтверждён, верифицировано. Передано ЛПР."}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-03-20 09:10"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-03-20 09:11"},
     {action:"verified", user:"Смирнов Д.К.", userRole:"analyst", date:"2026-03-23 14:22", comment:"Скоринг ок, клиент надёжный"},
   ]},

  // contract_preparation
  {id:"REQ-006", type:"debtor_scoring", company:"ООО «ТрансБел»", unp:"590123457",
   creditorId:1, stage:"contract_preparation", stageStartDate:"2026-03-20", priority:"medium", created:"2026-03-18",
   requestedAmount:100000, tier:"extended", scoringClass:"A", scoringTotal:162,
   approvedLimit:100000, approvedRate:25, decisionDate:"2026-03-20", decisionBy:"Иванов А.С. (ЛПР)",
   accountNumber:"",
   docs:{consentBki:true, legat:true, balanceOpu:true, decision:"signed"},
   comments:[{user:"Иванов А.С.",date:"2026-03-20",text:"Одобрено 100K. Ожидаем формирования ген.договора."}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-03-18 09:00"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-03-18 09:02"},
     {action:"verified", user:"Смирнов Д.К.", userRole:"analyst", date:"2026-03-19 11:30", comment:null},
     {action:"approved", user:"Иванов А.С.", userRole:"lpr", date:"2026-03-20 10:15", comment:"Одобрено 100K"},
   ]},

  // contract_signing
  {id:"REQ-007", type:"debtor_scoring", company:"ЧУП «СтройАктив»", unp:"190345678",
   creditorId:1, stage:"contract_signing", stageStartDate:"2026-03-19", priority:"medium", created:"2026-03-16",
   requestedAmount:45000, tier:"simple", scoringClass:"B", scoringTotal:130,
   approvedLimit:45000, approvedRate:25, decisionDate:"2026-03-18", decisionBy:"Смирнов Д.К. (Аналитик)",
   accountNumber:"3819000012345",
   docs:{consentBki:true, legat:true, decision:"signed", generalContract:"pending_bank"},
   comments:[{user:"Петрова Н.А.",date:"2026-03-19",text:"Ген.договор сформирован, номер счёта 3819000012345. Передан на подпись."}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-03-16 10:00"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-03-16 10:01"},
     {action:"approved", user:"Смирнов Д.К.", userRole:"analyst", date:"2026-03-18 12:00", comment:null},
     {action:"contract_generated", user:"Петрова Н.А.", userRole:"usko_prepare", date:"2026-03-19 09:15", comment:"Счёт из АБС"},
   ]},

  // client_signing
  {id:"REQ-008", type:"debtor_scoring", company:"ООО «БелТехСнаб»", unp:"190456789",
   creditorId:1, stage:"client_signing", stageStartDate:"2026-03-16", priority:"low", created:"2026-03-14",
   requestedAmount:35000, tier:"simple", scoringClass:"A", scoringTotal:150,
   approvedLimit:35000, approvedRate:25, accountNumber:"3819000012346",
   docs:{consentBki:true, legat:true, decision:"signed", generalContract:"signed_bank"},
   comments:[{user:"Подписант",date:"2026-03-16",text:"Договор подписан банком, отправлен клиенту."}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-03-14 11:30"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-03-14 11:31"},
     {action:"approved", user:"Смирнов Д.К.", userRole:"analyst", date:"2026-03-15 10:00", comment:null},
     {action:"contract_generated", user:"Петрова Н.А.", userRole:"usko_prepare", date:"2026-03-15 14:20", comment:null},
     {action:"contract_signed_bank", user:"Татьяна К.", userRole:"signer", date:"2026-03-16 09:00", comment:null},
   ]},

  // client_activation
  {id:"REQ-009", type:"debtor_scoring", company:"ООО «АгроТрейд»", unp:"390456789",
   creditorId:1, stage:"client_activation", stageStartDate:"2026-03-12", priority:"medium", created:"2026-03-10",
   requestedAmount:60000, tier:"extended", scoringClass:"A", scoringTotal:158,
   approvedLimit:60000, approvedRate:25, accountNumber:"3819000012347",
   docs:{consentBki:true, legat:true, decision:"signed", generalContract:"signed_all"},
   comments:[{user:"Клиент",date:"2026-03-12",text:"Договор подписан клиентом ЭЦП."}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-03-10 14:00"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-03-10 14:01"},
     {action:"verified", user:"Смирнов Д.К.", userRole:"analyst", date:"2026-03-10 16:30", comment:null},
     {action:"approved", user:"Иванов А.С.", userRole:"lpr", date:"2026-03-11 10:00", comment:null},
     {action:"contract_generated", user:"Петрова Н.А.", userRole:"usko_prepare", date:"2026-03-11 14:00", comment:null},
     {action:"contract_signed_bank", user:"Татьяна К.", userRole:"signer", date:"2026-03-12 09:30", comment:null},
     {action:"contract_signed_client", user:"ООО «АгроТрейд»", userRole:null, date:"2026-03-12 15:00", comment:null},
   ]},

  // active
  {id:"REQ-010", type:"debtor_scoring", company:"ООО «СитиБетонСтрой»", unp:"169066611",
   creditorId:1, stage:"active", stageStartDate:"2026-01-15", priority:"medium", created:"2026-01-10",
   requestedAmount:500000, tier:"extended", scoringClass:"A", scoringTotal:168,
   approvedLimit:500000, approvedRate:25, accountNumber:"3819000001234",
   assignmentIds:["ASG-001","ASG-002","ASG-003","ASG-004","ASG-005","ASG-006"],
   docs:{consentBki:true, legat:true, decision:"signed", generalContract:"signed_all"},
   comments:[{user:"УСКО",date:"2026-01-15",text:"Сделка активирована. Ген.договор №1 действует."}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-01-10 10:00"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-01-10 10:01"},
     {action:"approved", user:"Иванов А.С.", userRole:"lpr", date:"2026-01-12 14:00", comment:null},
     {action:"activated", user:"Петрова Н.А.", userRole:"usko_prepare", date:"2026-01-15 11:00", comment:null},
   ]},

  // rejected
  {id:"REQ-011", type:"debtor_scoring", company:"ИП Козловский А.В.", unp:"790123456",
   creditorId:1, stage:"rejected", stageStartDate:"2026-03-19", priority:"medium", created:"2026-03-18",
   requestedAmount:40000, tier:"simple", scoringClass:"CC", scoringTotal:63,
   legat:"issue", bki:"bad", rejectZone:"black",
   rejectReason:"Чёрная зона: отрицательная КИ, Легат issues.",
   rejectDate:"2026-03-19", rejectedBy:"Автоотказ (система)",
   docs:{consentBki:true, legat:true},
   comments:[{user:"Система",date:"2026-03-19",text:"Автоотказ. Чёрная зона скоринга."}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-03-18 15:00"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-03-18 15:01"},
     {action:"rejected", user:"Автоотказ (система)", userRole:null, date:"2026-03-19 08:00", comment:"Чёрная зона"},
   ]},

  // grey_zone
  {id:"REQ-012", type:"debtor_scoring", company:"ООО «БелАгроХим»", unp:"390888123",
   creditorId:1, stage:"grey_zone", stageStartDate:"2026-03-15", priority:"low", created:"2026-03-15",
   requestedAmount:35000, tier:"simple", scoringClass:"B", scoringTotal:95,
   legat:"clean", bki:"average",
   docs:{consentBki:true, legat:true},
   comments:[{user:"Система",date:"2026-03-15",text:"Пограничный клиент: балл 95. Требует ручного рассмотрения."}],
   history:[
     {action:"created", user:"Система", userRole:null, date:"2026-03-15 12:00"},
     {action:"scoring_completed", user:"Автоматика", userRole:null, date:"2026-03-15 12:01"},
     {action:"moved_to_grey", user:"Система", userRole:null, date:"2026-03-15 12:02", comment:"Балл 95 — серая зона"},
   ]},
];

const ASSIGNMENTS = [
  // Paid (history)
  {id:"ASG-001", dealId:"REQ-010", creditorId:1, debtorId:2, amount:45000, discount:2774, toReceive:42226,
   stage:"paid", stageStartDate:"2026-03-15", createdDate:"2026-03-10", shippingDate:"2026-03-08",
   ttnNumber:"ТТН-45",
   uskoTakenBy:"Петрова Н.А.", uskoTakenDate:"2026-03-12",
   dsNumber:"ДС-REQ-010-001", dsDate:"2026-03-12",
   signedByBank:"Татьяна К.", signedByBankDate:"2026-03-12",
   signedByClientDate:"2026-03-13",
   paymentApprovedBy:"Петрова Н.А.", paymentApprovedDate:"2026-03-14",
   paidDate:"2026-03-15",
   docs:{
     dkp:{status:"signed",date:"2026-03-10"}, ttn:{status:"signed",date:"2026-03-10"},
     actReconciliation:{status:"signed",date:"2026-03-11",signedBy:"ООО «БелТехСнаб»"},
     supplementaryAgreement:{status:"signed_all",date:"2026-03-13"},
     notification:{status:"sent",date:"2026-03-10 10:16"},
   },
   history:[
     {action:"docs_uploaded",user:"ООО «СитиБетонСтрой»",userRole:"supplier",date:"2026-03-10 10:15"},
     {action:"debtor_notified",user:"Платформа",userRole:"system",date:"2026-03-10 10:16"},
     {action:"debtor_confirmed",user:"ООО «БелТехСнаб»",userRole:"debtor",date:"2026-03-11 14:30"},
     {action:"checked_ok",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-03-12 09:00",comment:"Комплект полный"},
     {action:"ds_generated",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-03-12 09:15"},
     {action:"ds_signed_bank",user:"Татьяна К.",userRole:"signer",date:"2026-03-12 10:00"},
     {action:"ds_signed_client",user:"ООО «СитиБетонСтрой»",userRole:"supplier",date:"2026-03-13 11:00"},
     {action:"payment_approved",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-03-14 14:00"},
     {action:"paid",user:"Автоматика",userRole:"system",date:"2026-03-15 09:00",comment:"42 226 BYN"},
   ]},

  // UCKO check — SLA bank
  {id:"ASG-002", dealId:"REQ-010", creditorId:1, debtorId:2, amount:30000,
   stage:"usko_checking", stageStartDate:"2026-03-24", createdDate:"2026-03-22",
   ttnNumber:"ТТН-48",
   docs:{
     dkp:{status:"signed",date:"2026-03-22"}, ttn:{status:"signed",date:"2026-03-22"},
     actReconciliation:{status:"signed",date:"2026-03-24",signedBy:"ООО «БелТехСнаб»"},
   },
   history:[
     {action:"docs_uploaded",user:"ООО «СитиБетонСтрой»",userRole:"supplier",date:"2026-03-22 15:00"},
     {action:"debtor_notified",user:"Платформа",userRole:"system",date:"2026-03-22 15:01"},
     {action:"debtor_confirmed",user:"ООО «БелТехСнаб»",userRole:"debtor",date:"2026-03-24 11:30"},
   ]},

  // Debtor confirming (client waiting, opened but didn't sign)
  {id:"ASG-003", dealId:"REQ-010", creditorId:1, debtorId:4, amount:25000,
   stage:"debtor_confirming", stageStartDate:"2026-03-23", createdDate:"2026-03-23",
   ttnNumber:"ТТН-49",
   docs:{dkp:{status:"signed"}, ttn:{status:"signed"}},
   clientActivity:{
     debtor:{notifiedAt:"2026-03-23 10:01", lastOpenedAt:"2026-03-24 09:15", lastActive:"2026-03-24 09:15"},
   },
   history:[
     {action:"docs_uploaded",user:"ООО «СитиБетонСтрой»",userRole:"supplier",date:"2026-03-23 10:00"},
     {action:"debtor_notified",user:"Платформа",userRole:"system",date:"2026-03-23 10:01"},
     {action:"debtor_opened_notification",user:"ООО «АгроТрейд Плюс»",userRole:"debtor",date:"2026-03-24 09:15"},
   ]},

  // Signer — bank SLA critical
  {id:"ASG-004", dealId:"REQ-010", creditorId:1, debtorId:2, amount:18000, discount:1110, toReceive:16890,
   stage:"ds_signing_bank", stageStartDate:"2026-03-23", createdDate:"2026-03-22", shippingDate:"2026-03-20",
   ttnNumber:"ТТН-50",
   uskoTakenBy:"Петрова Н.А.", uskoTakenDate:"2026-03-24",
   dsNumber:"ДС-REQ-010-004", dsDate:"2026-03-25",
   docs:{
     dkp:{status:"signed"}, ttn:{status:"signed"}, actReconciliation:{status:"signed"},
     supplementaryAgreement:{status:"pending_bank", number:"ДС-REQ-010-004"},
   },
   history:[
     {action:"docs_uploaded",user:"ООО «СитиБетонСтрой»",date:"2026-03-22 14:00"},
     {action:"debtor_confirmed",user:"ООО «БелТехСнаб»",date:"2026-03-23 11:00"},
     {action:"checked_ok",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-03-24"},
     {action:"ds_generated",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-03-25"},
   ]},

  // Returned to supplier
  {id:"ASG-005", dealId:"REQ-010", creditorId:1, debtorId:2, amount:12000,
   stage:"returned_to_supplier", stageStartDate:"2026-03-24", createdDate:"2026-03-23",
   ttnNumber:"ТТН-51",
   returnReason:{issues:["ttn_illegible","dkp_missing"], comment:"ТТН нечитаемая, ДКП не приложен", returnedBy:"Петрова Н.А.", returnedAt:"2026-03-24 14:00"},
   docs:{ttn:{status:"uploaded_with_issues"}},
   history:[
     {action:"docs_uploaded",user:"ООО «СитиБетонСтрой»",date:"2026-03-23 15:00"},
     {action:"returned_to_supplier",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-03-24 14:00",comment:"ТТН нечитаемая, ДКП не приложен"},
   ]},

  // DS signing client — waiting, didn't open
  {id:"ASG-006", dealId:"REQ-010", creditorId:1, debtorId:2, amount:22000, discount:1356, toReceive:20644,
   stage:"ds_signing_client", stageStartDate:"2026-03-18", createdDate:"2026-03-18", shippingDate:"2026-03-15",
   ttnNumber:"ТТН-52",
   uskoTakenBy:"Петрова Н.А.", uskoTakenDate:"2026-03-18",
   dsNumber:"ДС-REQ-010-006", dsDate:"2026-03-18",
   signedByBank:"Татьяна К.", signedByBankDate:"2026-03-18",
   docs:{supplementaryAgreement:{status:"pending_client", number:"ДС-REQ-010-006", date:"2026-03-18"}},
   clientActivity:{
     supplier:{notifiedAt:"2026-03-18 11:00", lastOpenedAt:null},
   },
   history:[
     {action:"ds_signed_bank",user:"Татьяна К.",userRole:"signer",date:"2026-03-18 11:00"},
   ]},
];

// ─── NOTIFICATIONS ───
const NOTIFICATIONS = [
  {id:"n1", userRole:"analyst", type:"new_task",
   title:"Новая заявка на верификацию", subtext:"REQ-003 · ООО «ТехноГрупп» · 180 000 BYN",
   link:{page:"pipeline", reqId:"REQ-003"}, createdAt:"2026-03-26 10:30", read:false},
  {id:"n2", userRole:"analyst", type:"new_task",
   title:"Новая заявка на верификацию", subtext:"REQ-004 · ИП Сергеев В.А. · 40 000 BYN",
   link:{page:"pipeline", reqId:"REQ-004"}, createdAt:"2026-03-26 09:15", read:false},
  {id:"n3", userRole:"lpr", type:"new_task",
   title:"Заявка на принятие решения", subtext:"REQ-005 · ООО «АтомСтрой» · 250 000 BYN",
   link:{page:"pipeline", reqId:"REQ-005"}, createdAt:"2026-03-26 11:00", read:false},
  {id:"n4", userRole:"usko_prepare", type:"new_task",
   title:"Заявка на оформление договора", subtext:"REQ-006 · ООО «ТрансБел» · 100 000 BYN",
   link:{page:"pipeline", reqId:"REQ-006"}, createdAt:"2026-03-25 16:22", read:false},
  {id:"n5", userRole:"usko_prepare", type:"new_task",
   title:"Новая уступка на проверку", subtext:"ASG-002 · 30 000 BYN",
   link:{page:"assignments", asgId:"ASG-002"}, createdAt:"2026-03-26 08:30", read:false},
  {id:"n6", userRole:"usko_prepare", type:"client_waiting_long",
   title:"Клиент не отвечает 8 дней", subtext:"ASG-006 · ожидание подписи ДС",
   link:{page:"assignments", asgId:"ASG-006"}, createdAt:"2026-03-26 09:00", read:false},
  {id:"n7", userRole:"signer", type:"new_task",
   title:"Документ на подпись ЭЦП", subtext:"REQ-007 · ЧУП «СтройАктив»",
   link:{page:"pipeline", reqId:"REQ-007"}, createdAt:"2026-03-26 10:00", read:false},
  {id:"n8", userRole:"signer", type:"new_task",
   title:"ДС на подпись ЭЦП", subtext:"ASG-004 · 18 000 BYN",
   link:{page:"assignments", asgId:"ASG-004"}, createdAt:"2026-03-25 14:30", read:false},
  {id:"n9", userRole:"signer", type:"sla_warning",
   title:"SLA банка близок к лимиту", subtext:"ASG-004 · на этапе 2 дня (лимит 1д)",
   link:{page:"assignments", asgId:"ASG-004"}, createdAt:"2026-03-26 12:00", read:false},
  {id:"n10", userRole:"admin", type:"sla_breach",
   title:"SLA банка нарушен", subtext:"ASG-004 · подписант тянет",
   link:{page:"assignments", asgId:"ASG-004"}, createdAt:"2026-03-26 09:00", read:false},
];

// ─── AUDIT LOG ───
const AUDIT_LOG = [
  {id:"log-1", date:"2026-03-26 14:22:14", userId:1, userName:"Смирнов Д.К.", userRole:"analyst",
   action:"verify_and_sign", objectType:"request", objectId:"REQ-006",
   details:{amount:100000, rate:25, ecpUsed:true, ipAddress:"10.0.0.1"}},
  {id:"log-2", date:"2026-03-26 10:15:33", userId:3, userName:"Петрова Н.А.", userRole:"usko_prepare",
   action:"contract_generated", objectType:"request", objectId:"REQ-007",
   details:{accountNumber:"3819000012345", ipAddress:"10.0.0.2"}},
  {id:"log-3", date:"2026-03-26 14:30:45", userId:4, userName:"Татьяна К.", userRole:"signer",
   action:"returned_to_usko", objectType:"request", objectId:"REQ-007",
   details:{issues:["wrong_account","wrong_amount"], comment:"Неверные реквизиты счёта", ipAddress:"10.0.0.3"}},
  {id:"log-4", date:"2026-03-25 16:00:12", userId:2, userName:"Иванов А.С.", userRole:"lpr",
   action:"approved", objectType:"request", objectId:"REQ-009",
   details:{amount:60000, rate:25, ecpUsed:true, ipAddress:"10.0.0.4"}},
  {id:"log-5", date:"2026-03-25 09:00:00", userId:5, userName:"Козлова Е.В.", userRole:"admin",
   action:"stoplist_added", objectType:"stoplist", objectId:"790123456",
   details:{name:"ИП Козловский А.В.", reason:"Чёрная зона: отрицательная КИ", ipAddress:"10.0.0.5"}},
  {id:"log-6", date:"2026-03-24 14:00:30", userId:3, userName:"Петрова Н.А.", userRole:"usko_prepare",
   action:"returned_to_supplier", objectType:"assignment", objectId:"ASG-005",
   details:{issues:["ttn_illegible","dkp_missing"], comment:"ТТН нечитаемая, ДКП не приложен", ipAddress:"10.0.0.2"}},
  {id:"log-7", date:"2026-03-23 14:22:55", userId:1, userName:"Смирнов Д.К.", userRole:"analyst",
   action:"verified", objectType:"request", objectId:"REQ-005",
   details:{recommendation:"approve", comment:"Скоринг ок", ipAddress:"10.0.0.1"}},
  {id:"log-8", date:"2026-03-22 10:00:00", userId:5, userName:"Козлова Е.В.", userRole:"admin",
   action:"scoring_model_updated", objectType:"settings", objectId:"scoring-v2",
   details:{changed:"weights", ipAddress:"10.0.0.5"}},
  {id:"log-9", date:"2026-03-20 09:00:00", userId:5, userName:"Козлова Е.В.", userRole:"admin",
   action:"login", objectType:"user", objectId:"5",
   details:{ipAddress:"10.0.0.5"}},
  {id:"log-10", date:"2026-03-15 09:00:00", userId:3, userName:"Петрова Н.А.", userRole:"usko_prepare",
   action:"activated", objectType:"request", objectId:"REQ-010",
   details:{limit:500000, ipAddress:"10.0.0.2"}},
];

// Registry of all documents in the system — each doc has a unique ID + full history.
// Documents can be referenced from multiple places (заявки, уступки) — but each has ONE detail page.
const DOCUMENTS_REGISTRY = [
  // ═══ CATEGORY: CLIENT (постоянные документы клиента) ═══

  // ─── Генеральные договоры ───
  {id:"DOC-GEN-001", docType:"generalContract", title:"Генеральный договор факторинга №1",
   category:"client",
   relatedTo:{reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"285 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-01-14", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"creditor", label:"Кредитор", status:"signed", signedBy:"ООО «СитиБетонСтрой»", signedAt:"2026-01-14 15:30", method:"ЭЦП клиента"},
     {party:"bank", label:"Банк", status:"signed", signedBy:"Татьяна К.", signedAt:"2026-01-14 10:00", method:"ЭЦП банка"},
     {party:"debtor", label:"Должник", status:"na"},
   ],
   createdAt:"2026-01-13 14:00", createdBy:"Петрова Н.А. (УСКО)",
   history:[
     {action:"generated",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-01-13 14:00",comment:"Номер счёта из АБС: 3819000001234"},
     {action:"signed_bank",user:"Татьяна К.",userRole:"signer",date:"2026-01-14 10:00"},
     {action:"sent_to_client",user:"Система",date:"2026-01-14 10:01"},
     {action:"signed_client",user:"ООО «СитиБетонСтрой»",userRole:"client",date:"2026-01-14 15:30"},
   ]},

  {id:"DOC-GEN-007", docType:"generalContract", title:"Генеральный договор факторинга №7",
   category:"client",
   relatedTo:{reqId:"REQ-007", clientId:3, company:"ЧУП «СтройАктив»"},
   status:"pending_bank", fileFormat:"PDF", fileSize:"278 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-19", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"creditor", label:"Кредитор", status:"signed", signedBy:"ЧУП «СтройАктив»", signedAt:"2026-03-19 11:00", method:"ЭЦП клиента"},
     {party:"bank", label:"Банк", status:"pending"},
     {party:"debtor", label:"Должник", status:"na"},
   ],
   createdAt:"2026-03-19 09:15", createdBy:"Петрова Н.А. (УСКО)",
   history:[
     {action:"generated",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-03-19 09:15",comment:"Счёт 3819000012345"},
     {action:"signed_client",user:"ЧУП «СтройАктив»",userRole:"client",date:"2026-03-19 11:00"},
   ]},

  // ─── Решения о предоставлении факторинга ───
  {id:"DOC-DEC-005", docType:"decision", title:"Решение о предоставлении факторинга №05",
   category:"client",
   relatedTo:{reqId:"REQ-005", clientId:5, company:"ООО «АтомСтрой»"},
   status:"pending_bank", fileFormat:"PDF", fileSize:"142 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-25", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"bank", label:"ЛПР Банк", status:"pending"},
     {party:"creditor", label:"Кредитор", status:"na"},
     {party:"debtor", label:"Должник", status:"na"},
   ],
   createdAt:"2026-03-25 10:15", createdBy:"Система (автогенерация)",
   history:[
     {action:"generated",user:"Система",date:"2026-03-25 10:15",comment:"Автогенерация по шаблону после одобрения ЛПР"},
   ]},

  {id:"DOC-DEC-006", docType:"decision", title:"Решение о предоставлении факторинга №06",
   category:"client",
   relatedTo:{reqId:"REQ-006", clientId:6, company:"ООО «ТрансБел»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"138 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-20", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"bank", label:"ЛПР Банк", status:"signed", signedBy:"Иванов А.С.", signedAt:"2026-03-20 10:15", method:"ЭЦП"},
   ],
   createdAt:"2026-03-20 10:15", createdBy:"Система",
   history:[
     {action:"generated",user:"Система",date:"2026-03-20 10:15"},
     {action:"signed",user:"Иванов А.С.",userRole:"lpr",date:"2026-03-20 10:15"},
   ]},

  // ─── Согласия (с истекающим сроком) ───
  {id:"DOC-CBKI-001", docType:"consentBki", title:"Согласие на проверку БКИ — СитиБетонСтрой",
   category:"client",
   relatedTo:{reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"42 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-02-27", expiresAt:"2026-03-29", daysRemaining:3},
   signatureChain:[
     {party:"creditor", label:"Клиент", status:"signed", signedBy:"ООО «СитиБетонСтрой»", signedAt:"2026-02-27 10:00", method:"ЭЦП"},
   ],
   createdAt:"2026-02-27 10:00", createdBy:"ООО «СитиБетонСтрой»",
   history:[
     {action:"uploaded",user:"ООО «СитиБетонСтрой»",userRole:"client",date:"2026-02-27 10:00"},
   ]},

  {id:"DOC-COEB-001", docType:"consentOeb", title:"Согласие ОЭБ — СитиБетонСтрой",
   category:"client",
   relatedTo:{reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"38 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-01-15", expiresAt:"2026-04-15", daysRemaining:20},
   signatureChain:[
     {party:"creditor", label:"Клиент", status:"signed", signedBy:"ООО «СитиБетонСтрой»", signedAt:"2026-01-15 14:30", method:"ЭЦП"},
   ],
   createdAt:"2026-01-15 14:30", createdBy:"ООО «СитиБетонСтрой»",
   history:[
     {action:"uploaded",user:"ООО «СитиБетонСтрой»",userRole:"client",date:"2026-01-15 14:30"},
   ]},

  {id:"DOC-CBKI-003", docType:"consentBki", title:"Согласие БКИ — СтройИнвест",
   category:"client",
   relatedTo:{reqId:"REQ-008", clientId:3, company:"ЧУП «СтройАктив»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"40 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-01", expiresAt:"2026-03-31", daysRemaining:5},
   signatureChain:[
     {party:"creditor", label:"Клиент", status:"signed", signedBy:"ЧУП «СтройАктив»", signedAt:"2026-03-01 10:00", method:"ЭЦП"},
   ],
   createdAt:"2026-03-01 10:00", createdBy:"ЧУП «СтройАктив»",
   history:[
     {action:"uploaded",user:"ЧУП «СтройАктив»",userRole:"client",date:"2026-03-01 10:00"},
   ]},

  // ─── Анкета клиента ───
  {id:"DOC-ANK-001", docType:"anketa", title:"Анкета (Прил.12) — СитиБетонСтрой",
   category:"client",
   relatedTo:{reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"156 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-01-15", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"creditor", label:"Клиент", status:"signed", signedBy:"ООО «СитиБетонСтрой»", signedAt:"2026-01-15 12:00", method:"ЭЦП"},
   ],
   createdAt:"2026-01-15 12:00", createdBy:"ООО «СитиБетонСтрой»",
   history:[
     {action:"uploaded",user:"ООО «СитиБетонСтрой»",userRole:"client",date:"2026-01-15 12:00"},
   ]},

  // ─── Баланс ОПУ ───
  {id:"DOC-BAL-001", docType:"balanceOpu", title:"Баланс ОПУ Q4 2025 — СитиБетонСтрой",
   category:"client",
   relatedTo:{reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"224 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-01-20", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"creditor", label:"Клиент", status:"signed", signedBy:"ООО «СитиБетонСтрой»", signedAt:"2026-01-20 16:00", method:"ЭЦП"},
   ],
   createdAt:"2026-01-20 16:00", createdBy:"ООО «СитиБетонСтрой»",
   history:[
     {action:"uploaded",user:"ООО «СитиБетонСтрой»",userRole:"client",date:"2026-01-20 16:00",comment:"Отчётность за Q4 2025"},
   ]},

  // ═══ CATEGORY: ASSIGNMENT (документы уступок) ═══

  // ─── Допсоглашения ───
  {id:"DOC-SUPAG-001", docType:"supplementaryAgreement", title:"Допсоглашение №01 к ГД №1 (ASG-001)",
   category:"assignment",
   relatedTo:{assignmentId:"ASG-001", reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»", generalContractId:"DOC-GEN-001"},
   status:"signed_all", fileFormat:"PDF", fileSize:"112 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-12", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"creditor", label:"Кредитор", status:"signed", signedBy:"ООО «СитиБетонСтрой»", signedAt:"2026-03-13 11:00", method:"ЭЦП клиента"},
     {party:"bank", label:"Банк", status:"signed", signedBy:"Татьяна К.", signedAt:"2026-03-12 10:00", method:"ЭЦП банка"},
     {party:"debtor", label:"Должник", status:"na"},
   ],
   createdAt:"2026-03-12 09:15", createdBy:"Петрова Н.А. (УСКО)",
   history:[
     {action:"generated",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-03-12 09:15",comment:"Сумма уступки 45 000 BYN"},
     {action:"signed_bank",user:"Татьяна К.",userRole:"signer",date:"2026-03-12 10:00"},
     {action:"signed_client",user:"ООО «СитиБетонСтрой»",userRole:"supplier",date:"2026-03-13 11:00"},
   ]},

  {id:"DOC-SUPAG-004", docType:"supplementaryAgreement", title:"Допсоглашение №04 к ГД №1 (ASG-004)",
   category:"assignment",
   relatedTo:{assignmentId:"ASG-004", reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»", generalContractId:"DOC-GEN-001"},
   status:"pending_bank", fileFormat:"PDF", fileSize:"108 KB",
   version:2, previousVersionId:"DOC-SUPAG-004-V1",
   validity:{issueDate:"2026-03-25", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"creditor", label:"Кредитор", status:"signed", signedBy:"ООО «СитиБетонСтрой»", signedAt:"2026-03-25 10:00", method:"ЭЦП клиента"},
     {party:"bank", label:"Банк", status:"pending"},
     {party:"debtor", label:"Должник", status:"na"},
   ],
   createdAt:"2026-03-25 09:30", createdBy:"Петрова Н.А. (УСКО)",
   history:[
     {action:"generated",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-03-25 09:30", comment: "Повторная генерация — исправлена сумма"},
     {action:"signed_client",user:"ООО «СитиБетонСтрой»",userRole:"supplier",date:"2026-03-25 10:00"},
   ]},

  // ─── Предыдущая (вернули на доработку) версия DOC-SUPAG-004 ───
  {id:"DOC-SUPAG-004-V1", docType:"supplementaryAgreement", title:"Допсоглашение №04 (v1, возвращено)",
   category:"assignment",
   relatedTo:{assignmentId:"ASG-004", reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»", generalContractId:"DOC-GEN-001"},
   status:"rejected", fileFormat:"PDF", fileSize:"107 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-24", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"creditor", label:"Кредитор", status:"signed", signedBy:"ООО «СитиБетонСтрой»", signedAt:"2026-03-24 15:00", method:"ЭЦП клиента"},
     {party:"bank", label:"Банк", status:"rejected", signedBy:"Татьяна К.", signedAt:"2026-03-25 09:10", method:"Возврат УСКО"},
     {party:"debtor", label:"Должник", status:"na"},
   ],
   createdAt:"2026-03-24 14:00", createdBy:"Петрова Н.А. (УСКО)",
   history:[
     {action:"generated",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-03-24 14:00"},
     {action:"signed_client",user:"ООО «СитиБетонСтрой»",userRole:"supplier",date:"2026-03-24 15:00"},
     {action:"returned",user:"Татьяна К.",userRole:"signer",date:"2026-03-25 09:10",comment:"Неверная сумма в ДС: указано 18 000, должно быть 18 500"},
   ]},

  {id:"DOC-SUPAG-006", docType:"supplementaryAgreement", title:"Допсоглашение №06 к ГД №1 (ASG-006)",
   category:"assignment",
   relatedTo:{assignmentId:"ASG-006", reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»", generalContractId:"DOC-GEN-001"},
   status:"pending_client", fileFormat:"PDF", fileSize:"110 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-18", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"creditor", label:"Кредитор", status:"pending"},
     {party:"bank", label:"Банк", status:"signed", signedBy:"Татьяна К.", signedAt:"2026-03-18 11:00", method:"ЭЦП банка"},
     {party:"debtor", label:"Должник", status:"na"},
   ],
   createdAt:"2026-03-18 10:00", createdBy:"Петрова Н.А. (УСКО)",
   history:[
     {action:"generated",user:"Петрова Н.А.",userRole:"usko_prepare",date:"2026-03-18 10:00"},
     {action:"signed_bank",user:"Татьяна К.",userRole:"signer",date:"2026-03-18 11:00"},
   ]},

  // ─── ТТН ───
  {id:"DOC-TTN-045", docType:"ttn", title:"ТТН-45 — отгрузка от СитиБетонСтрой",
   category:"assignment",
   relatedTo:{assignmentId:"ASG-001", reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"95 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-08", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"creditor", label:"Поставщик", status:"signed", signedBy:"ООО «СитиБетонСтрой»", signedAt:"2026-03-10 10:15", method:"ЭЦП"},
   ],
   createdAt:"2026-03-10 10:15", createdBy:"ООО «СитиБетонСтрой»",
   history:[
     {action:"uploaded",user:"ООО «СитиБетонСтрой»",userRole:"supplier",date:"2026-03-10 10:15"},
   ]},

  {id:"DOC-TTN-048", docType:"ttn", title:"ТТН-48 — отгрузка от СитиБетонСтрой",
   category:"assignment",
   relatedTo:{assignmentId:"ASG-002", reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"98 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-20", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"creditor", label:"Поставщик", status:"signed", signedBy:"ООО «СитиБетонСтрой»", signedAt:"2026-03-22 15:00", method:"ЭЦП"},
   ],
   createdAt:"2026-03-22 15:00", createdBy:"ООО «СитиБетонСтрой»",
   history:[
     {action:"uploaded",user:"ООО «СитиБетонСтрой»",userRole:"supplier",date:"2026-03-22 15:00"},
   ]},

  // ─── ДКП ───
  {id:"DOC-DKP-048", docType:"dkp", title:"ДКП-48 — купля-продажа СитиБетонСтрой→БелТехСнаб",
   category:"assignment",
   relatedTo:{assignmentId:"ASG-002", reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"76 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-18", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"creditor", label:"Поставщик", status:"signed", signedBy:"ООО «СитиБетонСтрой»", signedAt:"2026-03-22 15:00", method:"ЭЦП"},
     {party:"debtor", label:"Покупатель", status:"signed", signedBy:"ООО «БелТехСнаб»", signedAt:"2026-03-22 15:00", method:"ЭЦП"},
   ],
   createdAt:"2026-03-22 15:00", createdBy:"ООО «СитиБетонСтрой»",
   history:[
     {action:"uploaded",user:"ООО «СитиБетонСтрой»",userRole:"supplier",date:"2026-03-22 15:00"},
   ]},

  // ─── Акты сверки ───
  {id:"DOC-ACT-001", docType:"actReconciliation", title:"Акт сверки — ASG-001 (БелТехСнаб)",
   category:"assignment",
   relatedTo:{assignmentId:"ASG-001", reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»", debtor:"ООО «БелТехСнаб»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"86 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-10", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"debtor", label:"Должник", status:"signed", signedBy:"ООО «БелТехСнаб»", signedAt:"2026-03-11 14:30", method:"ЭЦП должника"},
   ],
   createdAt:"2026-03-10 10:16", createdBy:"Платформа",
   history:[
     {action:"generated",user:"Платформа",date:"2026-03-10 10:16",comment:"Автогенерация на основании ТТН-45"},
     {action:"sent",user:"Платформа",date:"2026-03-10 10:16",comment:"Отправлен должнику"},
     {action:"signed",user:"ООО «БелТехСнаб»",userRole:"debtor",date:"2026-03-11 14:30"},
   ]},

  {id:"DOC-ACT-003", docType:"actReconciliation", title:"Акт сверки — ASG-003 (АгроТрейд)",
   category:"assignment",
   relatedTo:{assignmentId:"ASG-003", reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»", debtor:"ООО «АгроТрейд Плюс»"},
   status:"pending_client", fileFormat:"PDF", fileSize:"82 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-23", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"debtor", label:"Должник", status:"pending"},
   ],
   createdAt:"2026-03-23 10:01", createdBy:"Платформа",
   history:[
     {action:"generated",user:"Платформа",date:"2026-03-23 10:01"},
     {action:"sent",user:"Платформа",date:"2026-03-23 10:01",comment:"Отправлен должнику"},
     {action:"opened",user:"ООО «АгроТрейд Плюс»",userRole:"debtor",date:"2026-03-24 09:15",comment:"Открыл уведомление, не подписал"},
   ]},

  // ─── Уведомления ───
  {id:"DOC-NOTIF-001", docType:"notification", title:"Уведомление об уступке — ASG-001",
   category:"assignment",
   relatedTo:{assignmentId:"ASG-001", reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»", debtor:"ООО «БелТехСнаб»"},
   status:"signed_all", fileFormat:"PDF", fileSize:"58 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-10", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"bank", label:"Платформа", status:"signed", signedBy:"Платформа", signedAt:"2026-03-10 10:16", method:"Автогенерация"},
     {party:"debtor", label:"Должник", status:"signed", signedBy:"ООО «БелТехСнаб»", signedAt:"2026-03-11 09:15", method:"Подтверждение получения"},
   ],
   createdAt:"2026-03-10 10:16", createdBy:"Платформа (автогенерация)",
   history:[
     {action:"generated",user:"Платформа",date:"2026-03-10 10:16"},
     {action:"sent",user:"Платформа",date:"2026-03-10 10:16",comment:"Отправлено должнику"},
     {action:"opened",user:"ООО «БелТехСнаб»",userRole:"debtor",date:"2026-03-11 09:15"},
   ]},

  {id:"DOC-NOTIF-003", docType:"notification", title:"Уведомление об уступке — ASG-003",
   category:"assignment",
   relatedTo:{assignmentId:"ASG-003", reqId:"REQ-010", clientId:1, company:"ООО «СитиБетонСтрой»", debtor:"ООО «АгроТрейд Плюс»"},
   status:"sent", fileFormat:"PDF", fileSize:"56 KB",
   version:1, previousVersionId:null,
   validity:{issueDate:"2026-03-23", expiresAt:null, daysRemaining:null},
   signatureChain:[
     {party:"bank", label:"Платформа", status:"signed", signedBy:"Платформа", signedAt:"2026-03-23 10:01", method:"Автогенерация"},
     {party:"debtor", label:"Должник", status:"pending"},
   ],
   createdAt:"2026-03-23 10:01", createdBy:"Платформа (автогенерация)",
   history:[
     {action:"generated",user:"Платформа",date:"2026-03-23 10:01"},
     {action:"sent",user:"Платформа",date:"2026-03-23 10:01",comment:"Отправлено должнику"},
     {action:"opened",user:"ООО «АгроТрейд Плюс»",userRole:"debtor",date:"2026-03-24 09:15",comment:"Открыл, не подписал"},
   ]},
];

const DOC_TYPE_LABELS = {
  decision:"Решение о предоставлении факторинга",
  generalContract:"Генеральный договор факторинга",
  gd:"Ген. договор",
  supplementaryAgreement:"Допсоглашение",
  ds:"Допсоглашение",
  notification:"Уведомление об уступке",
  notify:"Уведомление",
  dkp:"Договор купли-продажи (ДКП)",
  ttn:"Товарно-транспортная накладная (ТТН)",
  actReconciliation:"Акт сверки",
  act:"Акт ВР",
  esfchf:"ЭСЧФ",
  balanceOpu:"Баланс ОПУ",
  legat:"Выписка Легат",
  bki:"Кредитный отчёт БКИ",
  consentBki:"Согласие на проверку БКИ",
  consent_bki:"Согласие БКИ",
  consent_oeb:"Согласие ОЭБ",
  consent_pd:"Согласие ПД",
  anketa:"Анкета клиента",
  report:"Отчётность",
};

const DOC_STATUS_LABELS = {
  signed:"Подписан",
  signed_all:"Подписан всеми сторонами",
  signed_bank:"Подписан банком",
  signed_client:"Подписан клиентом",
  pending_bank:"Ожидает подписи банка",
  pending_client:"Ожидает подписи клиента",
  sent:"Отправлен",
  uploaded_with_issues:"Загружен с замечаниями",
  draft:"Черновик",
};

const DOC_ACTION_LABELS = {
  generated:"Сгенерирован по шаблону",
  uploaded:"Загружен",
  linked:"Привязан к сделке",
  sent:"Отправлен",
  opened:"Открыт",
  signed:"Подписан",
  signed_bank:"Подписан банком",
  signed_client:"Подписан клиентом",
  sent_to_client:"Отправлен клиенту",
  returned:"Возвращён на доработку",
};

// ═══════════════════════════════════════
// DOCUMENT UTILITY FUNCTIONS
// ═══════════════════════════════════════
function getClientDocuments(clientId) {
  return DOCUMENTS_REGISTRY.filter(d =>
    d.category === "client" && d.relatedTo?.clientId === clientId
  );
}

function getAssignmentDocuments(assignmentId) {
  return DOCUMENTS_REGISTRY.filter(d =>
    d.relatedTo?.assignmentId === assignmentId
  );
}

function getPendingSignDocuments(userRole) {
  if (userRole !== "signer") return [];
  return DOCUMENTS_REGISTRY.filter(d =>
    d.signatureChain?.some(s => s.party === "bank" && s.status === "pending")
  );
}

function getActiveProcessDocuments() {
  return DOCUMENTS_REGISTRY.filter(d =>
    ["pending_bank", "pending_client", "draft", "sent"].includes(d.status)
  );
}

function getExpiringDocuments(daysBefore = 7) {
  return DOCUMENTS_REGISTRY.filter(d => {
    if (!d.validity?.expiresAt) return false;
    const days = d.validity.daysRemaining;
    return days != null && days >= 0 && days <= daysBefore;
  });
}

function getDocumentDaysOnStage(doc) {
  if (!doc.history?.length) return 0;
  const lastEvent = doc.history[doc.history.length - 1];
  const now = new Date("2026-03-26");
  const then = new Date(lastEvent.date);
  return Math.max(0, Math.floor((now - then) / 86400000));
}

// ─── Document process phases (unified with pipeline/assignments) ───
const DOC_PROCESS_PHASES = [
  {id:"draft",      label:"Черновики",    icon:"📝", colors:{bg:"#F1F5F9", fg:B.t2},   description:"Создаётся / в подготовке"},
  {id:"in_process", label:"В процессе",   icon:"⏳", colors:{bg:B.yellowL, fg:B.yellow}, description:"Отправлено, ожидает первую подпись"},
  {id:"pending",    label:"На подписи",   icon:"🔏", colors:{bg:"#CFFAFE", fg:"#06B6D4"}, description:"Ожидает чьей-то подписи"},
  {id:"completed",  label:"Завершённые",  icon:"✅", colors:{bg:B.greenL, fg:B.green},  description:"Полностью подписан"},
  {id:"expiring",   label:"Истекающие",   icon:"📅", colors:{bg:"#FFEDD5", fg:B.orange}, description:"Истекают через ≤7 дней"},
];

function getDocPhase(doc) {
  if (doc.status === "signed_all") return "completed";
  if (doc.status === "draft") return "draft";
  if (doc.validity?.daysRemaining != null && doc.validity.daysRemaining >= 0 && doc.validity.daysRemaining <= 7) return "expiring";
  if (doc.status === "pending_bank" || doc.status === "pending_client") return "pending";
  if (doc.status === "sent" || doc.status === "signed_bank" || doc.status === "signed_client") return "in_process";
  return "in_process";
}

// Unified document filtering
function filterDocuments(docs, filters, currentUser) {
  return docs.filter(d => {
    const {phase, docType, clientId, party, search, myActionOnly} = filters;
    if (phase && phase !== "all" && getDocPhase(d) !== phase) return false;
    if (docType && docType !== "all" && d.docType !== docType) return false;
    if (clientId && clientId !== "all" && String(d.relatedTo?.clientId) !== String(clientId)) return false;
    if (party === "bank" && !d.signatureChain?.some(s => s.party === "bank" && s.status === "pending")) return false;
    if (party === "client" && !d.signatureChain?.some(s => (s.party === "creditor" || s.party === "debtor") && s.status === "pending")) return false;
    if (myActionOnly && currentUser) {
      if (currentUser.role === "signer") {
        if (!d.signatureChain?.some(s => s.party === "bank" && s.status === "pending")) return false;
      } else if (currentUser.role === "usko_prepare") {
        // УСКО работает с черновиками и документами на стадии процесса
        const phase = getDocPhase(d);
        if (phase !== "draft" && phase !== "in_process") return false;
      }
    }
    if (search) {
      const q = search.toLowerCase();
      if (!(d.title?.toLowerCase().includes(q)
        || d.id?.toLowerCase().includes(q)
        || (d.relatedTo?.company||"").toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

// Count by phase for KPI strip
function countDocsByPhase(docs) {
  const counts = {total: docs.length, draft: 0, in_process: 0, pending: 0, completed: 0, expiring: 0};
  docs.forEach(d => {
    const phase = getDocPhase(d);
    counts[phase] = (counts[phase] || 0) + 1;
  });
  return counts;
}

// Average signing time (days) for completed documents
function getAvgSigningTime(docs) {
  const completed = docs.filter(d => d.status === "signed_all" && d.history?.length >= 2);
  if (completed.length === 0) return null;
  const total = completed.reduce((s, d) => {
    const first = new Date(d.history[0].date);
    const last = new Date(d.history[d.history.length-1].date);
    return s + Math.max(0, Math.floor((last - first) / 86400000));
  }, 0);
  return Math.round(total / completed.length);
}

function getPartyColor(party) {
  return {creditor: "#0891B2", bank: B.accent, debtor: "#EA580C"}[party] || B.t3;
}

const AUDIT_ACTION_LABELS = {
  verify_and_sign:"Одобрено и подписано ЭЦП",
  verified:"Верифицировано",
  approved:"Одобрено",
  rejected:"Отклонено",
  returned_to_usko:"Возврат УСКО на доработку",
  returned_to_supplier:"Запрос документов у поставщика",
  contract_generated:"Договор сгенерирован",
  contract_signed_bank:"Договор подписан банком",
  activated:"Клиент активирован, может создавать уступки",
  login:"Вход в систему",
  logout:"Выход из системы",
  stoplist_added:"Добавлено в стоп-лист",
  scoring_model_updated:"Обновлена модель скоринга",
  limit_changed:"Изменён лимит",
};

const STOPLIST = [
  {id:1, type:"legal", unp:"891234567", name:"ООО «ФейкТрейд»", reason:"Стоп-лист НБРБ",
   addedBy:"Комплаенс", addedDate:"2026-01-10"},
  {id:2, type:"person", personalId:"3150190A001PB5", name:"Иванов И.И.",
   reason:"Учредитель в стоп-листе", addedBy:"Комплаенс", addedDate:"2026-02-15"},
];


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
  {id:"pipeline", label:"Кредитный конвейер", icon:Zap, badge:11},
  {id:"assignments", label:"Уступки", icon:Package, badge:5},
  {id:"clients", label:"Клиенты", icon:Users},
  {id:"portfolio", label:"Портфель", icon:TrendingUp},
  {id:"documents", label:"Документы", icon:Archive},
  {id:"stoplist", label:"Стоп-листы", icon:Ban},
  {id:"scoring-admin", label:"Скоринг", icon:GitBranch},
  {id:"audit-log", label:"Журнал действий", icon:FileText},
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
  {id:1, name:"Смирнов Д.К.", position:"Кредитный аналитик", role:"analyst", email:"smirnov@neobank.by", status:"active"},
  {id:2, name:"Иванов А.С.", position:"Начальник упр. финансирования", role:"lpr", email:"ivanov@neobank.by", status:"active"},
  {id:3, name:"Петрова Н.А.", position:"Специалист УСКО (оформление)", role:"usko_prepare", email:"petrova@neobank.by", status:"active"},
  {id:4, name:"Татьяна К.", position:"Замначальника (доверенность)", role:"signer", email:"tatyana@neobank.by", status:"active"},
  {id:5, name:"Козлова Е.В.", position:"Руководитель / Комплаенс", role:"admin", email:"kozlova@neobank.by", status:"active"},
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

const Btn = ({children, variant = "primary", size = "md", onClick, disabled, icon: Icon, className = "", rateLimit = 500}) => {
  const [cooldown, setCooldown] = useState(false);
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 whitespace-nowrap";
  const sz = {sm: "px-3 py-1.5 text-xs", md: "px-5 py-2.5 text-sm", lg: "px-6 py-3 text-base"}[size];
  const isDisabled = disabled || cooldown;
  const vars = {
    primary: `text-white shadow-sm ${isDisabled ? "opacity-50 cursor-not-allowed" : "hover:shadow-md hover:-translate-y-0.5"}`,
    secondary: `bg-slate-100 text-slate-700 ${isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-200"}`,
    ghost: `text-slate-600 ${isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-100"}`,
    success: `text-white ${isDisabled ? "opacity-50 cursor-not-allowed" : "hover:-translate-y-0.5"}`,
    danger: `bg-red-50 text-red-600 ${isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-red-100"}`,
  }[variant];
  const bg = variant === "primary" ? {background: B.accent} : variant === "success" ? {background: B.green} : undefined;

  const handleClick = (e) => {
    if (isDisabled || !onClick) return;
    onClick(e);
    if (rateLimit > 0) {
      setCooldown(true);
      setTimeout(() => setCooldown(false), rateLimit);
    }
  };

  return <button onClick={handleClick} disabled={isDisabled} className={`${base} ${sz} ${vars} ${className}`} style={bg}>
    {Icon && <Icon size={size === "sm" ? 14 : 16}/>}
    {children}
  </button>;
};

const Modal = ({open,onClose,title,children,wide}) => {
  if(!open) return null;
  return <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:9999,overflow:"auto",background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:48,paddingBottom:48}} onClick={onClose}>
    <div className={`bg-white rounded-2xl shadow-2xl ${wide?"w-full max-w-3xl":"w-full max-w-lg"} flex flex-col mx-4`} style={{maxHeight:"85vh"}} onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0"><h2 className="text-lg font-bold" style={{color:B.t1}}>{title}</h2><button aria-label="Закрыть окно" onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={20} className="text-slate-400"/></button></div>
      <div className="p-6 overflow-y-auto flex-1">{children}</div>
    </div>
  </div>;
};

// ─── EmptyState — standardized empty state with icon + message + optional CTA ───
const EmptyState = ({icon: Icon = Inbox, title = "Нет данных", subtitle, action, actionLabel}) => (
  <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{background: "#F1F5F9"}}>
      <Icon size={24} style={{color: B.t3}}/>
    </div>
    <div className="text-sm font-semibold mb-1" style={{color: B.t1}}>{title}</div>
    {subtitle && <div className="text-[11px] mb-3 max-w-xs" style={{color: B.t3}}>{subtitle}</div>}
    {action && actionLabel && <Btn size="sm" variant="secondary" onClick={action}>{actionLabel}</Btn>}
  </div>
);

// ─── TableSkeleton — placeholder while data loads ───
const TableSkeleton = ({rows = 5, cols = 6}) => (
  <div className="p-4 animate-pulse">
    <div className="space-y-2">
      {Array.from({length: rows}).map((_, i) => (
        <div key={i} className="flex gap-2">
          {Array.from({length: cols}).map((_, j) => (
            <div key={j} className="h-8 rounded" style={{background: "#F1F5F9", flex: 1}}/>
          ))}
        </div>
      ))}
    </div>
  </div>
);

// ─── usePagination — reusable pagination state + slicing ───
function usePagination(items, pageSize = 25) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((items?.length || 0) / pageSize));

  // Reset to page 1 when filters change (items length shrinks)
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const slicedItems = items ? items.slice((page - 1) * pageSize, page * pageSize) : [];
  return {page, setPage, totalPages, slicedItems, total: items?.length || 0};
}

// ─── Pagination UI component ───
const Pagination = ({page, setPage, totalPages, total, pageSize = 25}) => {
  if (totalPages <= 1) return null;
  const startIdx = (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, total);
  return <div className="flex items-center justify-between px-3 py-2 border-t text-xs" style={{borderColor: B.border, background: "#F8FAFC"}}>
    <div style={{color: B.t3}}>
      {startIdx}–{endIdx} из {total}
    </div>
    <div className="flex items-center gap-1">
      <button disabled={page === 1} onClick={() => setPage(1)}
        className="px-2 py-1 rounded text-[10px] font-semibold disabled:opacity-30 hover:bg-white"
        style={{color: B.t2}}>«</button>
      <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
        className="px-2 py-1 rounded text-[10px] font-semibold disabled:opacity-30 hover:bg-white"
        style={{color: B.t2}}>‹</button>
      <span className="px-3 py-1 rounded font-bold text-[11px]" style={{background: B.accentL, color: B.accent}}>
        {page} / {totalPages}
      </span>
      <button disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
        className="px-2 py-1 rounded text-[10px] font-semibold disabled:opacity-30 hover:bg-white"
        style={{color: B.t2}}>›</button>
      <button disabled={page === totalPages} onClick={() => setPage(totalPages)}
        className="px-2 py-1 rounded text-[10px] font-semibold disabled:opacity-30 hover:bg-white"
        style={{color: B.t2}}>»</button>
    </div>
  </div>;
};

// ─── exportToCSV — download data as CSV (opens in Excel) ───
// columns: [{key, label, formatter?}]
function exportToCSV(filename, columns, rows) {
  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(";") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = columns.map(c => escape(c.label)).join(";");
  const body = rows.map(r => columns.map(c => {
    const v = c.formatter ? c.formatter(r) : r[c.key];
    return escape(v);
  }).join(";")).join("\n");
  const csv = "\uFEFF" + header + "\n" + body; // BOM for Excel cyrillic
  try {
    const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch(e) {
    console.error("CSV export failed", e);
    return false;
  }
}

// ─── ExportButton — reusable button to export current data to CSV ───
const ExportButton = ({filename, columns, rows, setToast, disabled}) => {
  const handleExport = () => {
    if (rows.length === 0) {
      setToast && setToast({msg: "Нет данных для экспорта", type: "warning"});
      return;
    }
    const ok = exportToCSV(filename, columns, rows);
    if (ok) setToast && setToast({msg: `Экспортировано: ${rows.length} строк в ${filename}.csv`, type: "success"});
    else setToast && setToast({msg: "Ошибка экспорта", type: "error"});
  };
  return <Btn size="sm" variant="ghost" icon={Download} onClick={handleExport} disabled={disabled || rows.length === 0}>
    Excel
  </Btn>;
};

const Toast = ({message, type = "success", onClose, onUndo, actionLabel = "Отменить"}) => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const delay = onUndo ? 8000 : 3500;
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, delay);
    return () => clearTimeout(t);
  }, [onClose, onUndo]);

  const config = {
    success: {bg: B.green, icon: CheckCircle, label: "Готово"},
    error:   {bg: B.red, icon: XCircle, label: "Ошибка"},
    info:    {bg: B.accent, icon: Info, label: "Инфо"},
    warning: {bg: B.yellow, icon: AlertTriangle, label: "Внимание"},
  };
  const cfg = config[type] || config.info;
  const Icon = cfg.icon;

  return <div className="fixed bottom-6 right-6 z-[100] transition-all duration-300"
    style={{opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)"}}>
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-white text-sm font-medium shadow-xl min-w-[280px] max-w-md"
      style={{background: cfg.bg}}>
      <Icon size={18} className="shrink-0"/>
      <span className="flex-1">{message}</span>
      {onUndo && <button onClick={() => {onUndo(); setVisible(false); setTimeout(onClose, 300);}}
        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/20 hover:bg-white/30 transition-colors shrink-0">
        {actionLabel}
      </button>}
      <button aria-label="Закрыть уведомление" onClick={() => {setVisible(false); setTimeout(onClose, 300);}}
        className="text-white/70 hover:text-white shrink-0">
        <X size={14}/>
      </button>
    </div>
  </div>;
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

const KPICard = ({label, value, sub, icon: Icon, color, trend, trendLabel = "vs прошлый месяц", tooltip, periodValue}) => (
  <Card className="p-5">
    <div className="flex items-start justify-between mb-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background: color + "18"}}>
        <Icon size={20} style={{color}}/>
      </div>
      {trend != null && <div className="flex flex-col items-end">
        <span className={`text-xs font-semibold flex items-center gap-0.5 ${trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-500" : "text-slate-400"}`}>
          {trend > 0 ? <ArrowUpRight size={14}/> : trend < 0 ? <ArrowDownRight size={14}/> : "—"}
          {trend !== 0 ? Math.abs(trend) + "%" : "—"}
        </span>
        <span className="text-[9px]" style={{color: B.t3}}>{trendLabel}</span>
      </div>}
    </div>
    <div className="text-2xl font-bold mb-1" style={{color: B.t1, fontFamily: "'Plus Jakarta Sans',sans-serif"}}>{value}</div>
    <div className="text-xs font-medium flex items-center gap-1" style={{color: B.t2}}>
      {tooltip ? <InfoTooltip text={tooltip}>{label}</InfoTooltip> : label}
    </div>
    {sub && <div className="text-xs mt-1" style={{color: B.t3}}>{sub}</div>}
    {periodValue != null && <div className="text-[10px] mt-2 pt-2 border-t flex justify-between" style={{color: B.t3, borderColor: B.border}}>
      <span>Было месяц назад:</span>
      <span className="mono font-semibold" style={{color: B.t2}}>{periodValue}</span>
    </div>}
  </Card>
);

const PageHeader = ({title,subtitle,breadcrumbs,onBack,actions}) => (
  <div className="mb-6">
    {breadcrumbs&&<div className="flex items-center gap-1.5 text-xs mb-2" style={{color:B.t3}}>
      {onBack&&<button onClick={onBack} className="flex items-center gap-1 hover:text-slate-600 mr-1"><ArrowLeft size={14}/>Назад</button>}
      {breadcrumbs.map((b,i)=><span key={i} className="flex items-center gap-1.5">{i>0&&<ChevronRight size={12}/>}<span className={i===breadcrumbs.length-1?"font-medium text-slate-600":""}>{b}</span></span>)}
    </div>}
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
        <h1 className="text-xl font-bold" style={{color:B.t1}}>{title}</h1>
        {subtitle && <h2 className="text-base font-medium truncate" style={{color:B.t2}}>
          <span className="mx-1" style={{color:B.t3}}>·</span>
          {subtitle}
        </h2>}
      </div>
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

// ─── ROLE SWITCHER (in header, for demo) ───
function RoleSwitcherHeader({currentUser, onChange}) {
  const [open, setOpen] = useState(false);
  const current = ROLE_ACCESS[currentUser.role];
  const ref = useRef(null);

  useEffect(()=>{
    const h = (e) => {if(ref.current && !ref.current.contains(e.target)) setOpen(false)};
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={()=>setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all hover:bg-slate-50"
        style={{borderColor:B.border, background:"white"}}>
        <Eye size={13} style={{color:B.t3}}/>
        <span className="text-[11px] font-semibold" style={{color:B.t3}}>Смотреть как:</span>
        <span className="text-xs font-bold flex items-center gap-1" style={{color:current.color}}>
          <span>{current.icon}</span>
          <span>{current.label}</span>
        </span>
        <ChevronDown size={12} style={{color:B.t3}}/>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-xl z-50" style={{borderColor:B.border, minWidth:280}}>
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b" style={{color:B.t3, borderColor:B.border}}>
            Выбрать роль:
          </div>
          {Object.entries(ROLE_ACCESS).map(([key, role])=>(
            <button key={key}
              onClick={()=>{onChange(key); setOpen(false)}}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 border-b last:border-0"
              style={{borderColor:B.border}}>
              <span className="text-base shrink-0 mt-0.5">{role.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold" style={{color:role.color}}>{role.label}</div>
                <div className="text-[10px] mt-0.5" style={{color:B.t3}}>{role.description}</div>
              </div>
              {currentUser.role === key && <Check size={14} style={{color:role.color}} className="shrink-0 mt-1"/>}
            </button>
          ))}
          <div className="px-3 py-2 text-[10px] flex items-center gap-1.5" style={{color:B.t3, background:"#F8FAFC", borderTop:`1px solid ${B.border}`, borderRadius:"0 0 12px 12px"}}>
            <Info size={10}/>
            Демонстрация ролевого доступа
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NOTIFICATION BELL ───
function NotificationBell({currentUser, notifications, onNotificationClick}) {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState(notifications);
  const ref = useRef(null);

  useEffect(()=>{
    const h = (e) => {if(ref.current && !ref.current.contains(e.target)) setOpen(false)};
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[]);

  // Filter by role (admin sees all)
  const myNotifs = currentUser.role === "admin"
    ? notifs
    : notifs.filter(n => n.userRole === currentUser.role);

  const unread = myNotifs.filter(n => !n.read);
  const unreadCount = unread.length;

  const markAllRead = () => {
    setNotifs(prev => prev.map(n => ({...n, read:true})));
  };

  const handleClick = (notif) => {
    setNotifs(prev => prev.map(n => n.id===notif.id ? {...n, read:true} : n));
    onNotificationClick(notif);
    setOpen(false);
  };

  const typeIcons = {
    new_task: "🆕",
    returned: "↩",
    stage_complete: "✓",
    client_waiting_long: "⏳",
    sla_warning: "⚠",
    sla_breach: "🔥",
    comment_added: "💬",
  };

  const timeAgo = (dateStr) => {
    // Simple mock — just show date part
    return dateStr.slice(0, 16);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={()=>setOpen(!open)} className="relative p-2 rounded-lg hover:bg-slate-100">
        <Bell size={16} style={{color:B.t2}}/>
        {unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{background:B.red}}>
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-xl z-50" style={{borderColor:B.border, width:360, maxHeight:480}}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{borderColor:B.border}}>
            <div className="text-xs font-bold" style={{color:B.t1}}>
              Уведомления {unreadCount > 0 && <span style={{color:B.t3}}>({unreadCount} новых)</span>}
            </div>
            {unreadCount > 0 && <button onClick={markAllRead} className="text-[10px] font-semibold hover:underline" style={{color:B.accent}}>Очистить все</button>}
          </div>
          <div className="overflow-y-auto" style={{maxHeight:400}}>
            {myNotifs.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{color:B.t3}}>Нет уведомлений</div>
            ) : myNotifs.slice(0, 10).map(notif => (
              <button key={notif.id} onClick={()=>handleClick(notif)}
                className="w-full flex items-start gap-2.5 px-4 py-3 hover:bg-slate-50 text-left border-b last:border-0"
                style={{borderColor:B.border, background:notif.read?"white":"#F0F9FF"}}>
                {!notif.read && <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{background:B.accent}}/>}
                {notif.read && <div className="w-1.5 h-1.5 shrink-0"/>}
                <span className="text-base shrink-0">{typeIcons[notif.type]||"📬"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold" style={{color:B.t1}}>{notif.title}</div>
                  <div className="text-[11px] mt-0.5 truncate" style={{color:B.t2}}>{notif.subtext}</div>
                  <div className="text-[10px] mt-0.5" style={{color:B.t3}}>{timeAgo(notif.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ACCESS DENIED ───
function AccessDenied({moduleName, onGoHome}) {
  return (
    <div className="flex items-center justify-center py-20">
      <Card className="p-10 text-center" style={{maxWidth:420}}>
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{background:B.redL}}>
          <Lock size={28} style={{color:B.red}}/>
        </div>
        <div className="text-lg font-bold mb-2" style={{color:B.t1}}>Доступ ограничен</div>
        <div className="text-sm mb-5" style={{color:B.t2}}>Модуль «{moduleName}» недоступен для вашей роли.</div>
        <Btn onClick={onGoHome} icon={ChevronRight}>Вернуться на дашборд</Btn>
      </Card>
    </div>
  );
}

// ─── MAIN APP ───
// ─── ErrorBoundary: protects against runtime errors (white screen) ───
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {hasError: false, error: null};
  }
  static getDerivedStateFromError(error) {
    return {hasError: true, error};
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-lg p-6 rounded-2xl bg-white shadow-xl">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-xl font-bold mb-2" style={{color:"#DC2626"}}>Что-то пошло не так</h1>
          <p className="text-sm mb-4" style={{color:"#64748B"}}>
            Страница столкнулась с ошибкой и не может корректно отобразиться.
          </p>
          <pre className="text-[10px] p-3 rounded-lg bg-slate-50 overflow-x-auto" style={{color:"#475569"}}>
            {this.state.error?.message || "Неизвестная ошибка"}
          </pre>
          <div className="flex gap-2 mt-4">
            <button onClick={()=>window.location.reload()} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold">
              Перезагрузить
            </button>
            <button onClick={()=>{try{sessionStorage.clear()}catch(e){};window.location.reload()}} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold">
              Сбросить настройки
            </button>
          </div>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

// ─── PageErrorBoundary — per-page isolated error boundary ───
// Catches errors within a page without crashing the whole app.
// User can go to another page via sidebar.
class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {hasError: false, error: null};
  }
  static getDerivedStateFromError(error) {
    return {hasError: true, error};
  }
  componentDidCatch(error, info) {
    console.error(`PageErrorBoundary (${this.props.pageName || "unknown"}) caught:`, error, info);
  }
  resetError = () => {
    this.setState({hasError: false, error: null});
  };
  render() {
    if (this.state.hasError) {
      return <div className="p-6">
        <div className="max-w-lg mx-auto p-6 rounded-2xl bg-white border shadow-sm" style={{borderColor: "#FECACA"}}>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{background: "#FEE2E2"}}>
              <AlertTriangle size={20} style={{color: "#DC2626"}}/>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold" style={{color: "#DC2626"}}>
                Ошибка на странице «{this.props.pageName || "?"}»
              </h2>
              <p className="text-xs mt-1" style={{color: "#64748B"}}>
                Эта страница не загрузилась. Остальные разделы доступны через боковое меню.
              </p>
            </div>
          </div>
          <pre className="text-[10px] p-2 rounded-lg overflow-x-auto mb-3" style={{background: "#F8FAFC", color: "#475569"}}>
            {this.state.error?.message || "Неизвестная ошибка"}
          </pre>
          <div className="flex gap-2">
            <button onClick={this.resetError}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-white"
              style={{background: "#1E40AF"}}>
              Попробовать ещё раз
            </button>
            <button onClick={() => window.location.reload()}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold border"
              style={{borderColor: "#E2E8F0", color: "#475569"}}>
              Перезагрузить
            </button>
          </div>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

function AppInner() {
  // Initialize `active` from URL hash, fallback to dashboard
  const getInitialPage = () => {
    try {
      const hash = window.location.hash.replace(/^#\/?/, "");
      const validPages = ["dashboard", "pipeline", "assignments", "clients", "portfolio", "documents", "stoplist", "scoring-admin", "audit-log", "settings", "overdue", "rates", "abs", "document-detail", "client-detail", "deal-detail"];
      if (hash && validPages.includes(hash)) return hash;
    } catch(e) {}
    return "dashboard";
  };

  const [active, setActiveRaw] = useState(getInitialPage);
  // Wrapped setter that also updates URL hash
  const setActive = useCallback((page) => {
    setActiveRaw(page);
    try {
      if (page && page !== "dashboard") {
        window.history.pushState({page}, "", `#/${page}`);
      } else {
        window.history.pushState({page: "dashboard"}, "", window.location.pathname);
      }
    } catch(e) {}
  }, []);

  // Sync state on browser back/forward
  useEffect(() => {
    const handlePopState = (e) => {
      const page = e.state?.page || getInitialPage();
      setActiveRaw(page);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const [navStack, setNavStack] = useState([]);
  const [dark, setDark] = usePersistedState("dark-mode", false, v => v === true || v === false);
  const [toast, setToast] = useState(null);
  const [globalSearch, setGlobalSearch] = useState(false);
  const [gsQuery, setGsQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = usePersistedState("sidebar-open", true, v => v === true || v === false);
  const [selectedDocId, setSelectedDocId] = useState(null);

  // ─── UX REDESIGN: Favorites (pipeline) ───
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = sessionStorage.getItem("pipeline-favorites");
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const toggleFavorite = useCallback((reqId) => {
    setFavorites(prev => {
      const next = prev.includes(reqId) ? prev.filter(x => x !== reqId) : [...prev, reqId];
      try { sessionStorage.setItem("pipeline-favorites", JSON.stringify(next)); } catch(e) {}
      return next;
    });
  }, []);

  // ─── UX REDESIGN: New task indicator (sidebar pulse + toast + tab title badge) ───
  const [newTaskIndicator, setNewTaskIndicator] = useState({});
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  // ─── Simple event tracker (writes to sessionStorage, ready for PostHog/Plausible integration) ───
  const trackEvent = useCallback((eventName, props = {}) => {
    try {
      const event = {
        name: eventName,
        props,
        timestamp: new Date().toISOString(),
        user: currentUser?.name,
        role: currentUser?.role,
      };
      const key = "oborotka-events";
      const existing = JSON.parse(sessionStorage.getItem(key) || "[]");
      existing.push(event);
      if (existing.length > 200) existing.shift(); // Keep last 200
      sessionStorage.setItem(key, JSON.stringify(existing));
    } catch(e) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track page visits (must be AFTER trackEvent declaration to avoid TDZ)
  useEffect(() => {
    if (active) trackEvent("page_view", {page: active});
  }, [active, trackEvent]);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = usePersistedState("notifications-sound", false, v => v === true || v === false);

  useEffect(() => {
    const handler = (e) => {
      if (!e.detail?.module) return;
      const module = e.detail.module;

      // 1. Pulse badge in sidebar
      setNewTaskIndicator(prev => ({...prev, [module]: true}));
      setTimeout(() => {
        setNewTaskIndicator(prev => ({...prev, [module]: false}));
      }, 6000);

      // 2. Increment unread counter
      setUnreadCount(prev => prev + 1);

      // 3. Show toast with navigation action — only if user is NOT currently on that module
      if (active !== module) {
        const moduleLabels = {
          pipeline: "заявка в конвейере",
          assignments: "уступка",
          documents: "документ",
        };
        const label = moduleLabels[module] || "задача";
        setToast({
          msg: `🆕 Новая ${label}`,
          type: "info",
          actionLabel: "Открыть",
          onUndo: () => {
            setActive(module);
            setUnreadCount(0);
          },
        });
      }

      // 4. Optional sound (silent by default unless user enables in settings)
      if (soundEnabled) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        } catch(e) {}
      }
    };
    window.addEventListener("oborotka:new-task", handler);
    return () => window.removeEventListener("oborotka:new-task", handler);
  }, [active, soundEnabled]);

  // Update document title with unread count
  useEffect(() => {
    try {
      const baseTitle = "Oborotka.by — Банковская панель";
      document.title = unreadCount > 0 ? `(${unreadCount}) ${baseTitle}` : baseTitle;
    } catch(e) {}
  }, [unreadCount]);

  // Clear unread count when user navigates
  useEffect(() => {
    if (unreadCount > 0) {
      const t = setTimeout(() => setUnreadCount(0), 2000);
      return () => clearTimeout(t);
    }
  }, [active, unreadCount]);

  // Demo: imitate new tasks every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      if (Math.random() > 0.65) {
        const modules = ["pipeline", "assignments", "documents"];
        const m = modules[Math.floor(Math.random() * modules.length)];
        window.dispatchEvent(new CustomEvent("oborotka:new-task", {detail: {module: m}}));
      }
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const openDocument = useCallback((docId) => {
    setNavStack(s=>[...s, active]);
    setSelectedDocId(docId);
    setActive("document-detail");
  }, [active]);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.docId) openDocument(e.detail.docId);
    };
    window.addEventListener("oborotka:open-doc", handler);
    return () => window.removeEventListener("oborotka:open-doc", handler);
  }, [openDocument]);

  // Programmatic navigation via custom event
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.page) {
        setActive(e.detail.page);
        setNavStack([]);
      }
    };
    window.addEventListener("oborotka:nav", handler);
    return () => window.removeEventListener("oborotka:nav", handler);
  }, []);

  // Current user (role switcher for demo)
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem("currentUser");
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return DEFAULT_USER;
  });

  const changeRole = useCallback((newRole) => {
    const access = ROLE_ACCESS[newRole];
    // Pick a user with that role if exists, otherwise default with new role
    const userWithRole = BANK_USERS.find(u => u.role === newRole);
    const next = userWithRole
      ? {...userWithRole}
      : {...DEFAULT_USER, role: newRole, name: access.label};
    setCurrentUser(next);
    try { sessionStorage.setItem("currentUser", JSON.stringify(next)); } catch(e) {}
    // If current module is not accessible → go to dashboard
    if (!canAccessModule(next, active)) {
      setActive("dashboard");
      setNavStack([]);
    }
  }, [active]);

  // Dynamic task counts for current user — used for sidebar badges
  const myTaskCounts = useMemo(() => countMyTasks(currentUser, {
    pipeline: PIPELINE,
    assignments: ASSIGNMENTS,
    documents: DOCUMENTS_REGISTRY,
  }), [currentUser]);

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

  // Cmd+K for global search, ? for help, ESC closes modals, g+n for navigation
  const [helpModal, setHelpModal] = useState(false);
  const [gPressed, setGPressed] = useState(false);
  useEffect(()=>{
    const h = e => {
      // Cmd+K / Ctrl+K — open global search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setGlobalSearch(true);
        setGsQuery("");
        return;
      }
      // Skip navigation hotkeys when typing in input
      if (e.target.matches("input,textarea,select")) return;

      // ? — open help modal
      if (e.key === "?") {
        e.preventDefault();
        setHelpModal(true);
        return;
      }
      // ESC — close open modals
      if (e.key === "Escape") {
        if (globalSearch) setGlobalSearch(false);
        else if (helpModal) setHelpModal(false);
        setGPressed(false);
        return;
      }
      // "g" — navigation prefix (then d/p/a/c/o/s/u)
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        setGPressed(true);
        setTimeout(() => setGPressed(false), 2000);
        return;
      }
      if (gPressed) {
        const navMap = {
          d: "dashboard", p: "pipeline", a: "assignments", c: "clients",
          o: "overdue", s: "stoplist", u: "audit-log", r: "portfolio",
        };
        const target = navMap[e.key];
        if (target) {
          e.preventDefault();
          setActive(target);
          setGPressed(false);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [globalSearch, helpModal, gPressed, setActive]);

  // Global search results — groups: Заявки, Уступки, Клиенты, Сделки, Документы
  const gsResults = useMemo(() => {
    if (!gsQuery.trim()) return [];
    const q = gsQuery.toLowerCase();
    const groups = {pipeline: [], assignments: [], clients: [], deals: [], documents: []};

    // Companies (clients)
    COMPANIES.forEach(c => {
      if (c.name.toLowerCase().includes(q) || c.unp.includes(q)) {
        groups.clients.push({
          label: c.name,
          sub: `УНП ${c.unp} · ${c.role === "creditor" ? "Кредитор" : "Должник"}`,
          page: "clients", icon: Users, type: "client", id: c.id,
        });
      }
    });

    // Pipeline requests
    PIPELINE.forEach(p => {
      if (p.id.toLowerCase().includes(q) || p.company?.toLowerCase().includes(q) || p.unp?.includes(q)) {
        groups.pipeline.push({
          label: p.id,
          sub: `${p.company || "—"} · ${PIPELINE_STAGES.find(s => s.id === p.stage)?.label || p.stage}`,
          page: "pipeline", icon: Zap, type: "pipeline", id: p.id,
        });
      }
    });

    // Assignments
    ASSIGNMENTS.forEach(a => {
      const creditor = COMPANIES.find(c => c.id === a.creditorId);
      const debtor = COMPANIES.find(c => c.id === a.debtorId);
      if (a.id.toLowerCase().includes(q)
        || a.dealId?.toLowerCase().includes(q)
        || a.ttnNumber?.toLowerCase().includes(q)
        || creditor?.name?.toLowerCase().includes(q)
        || debtor?.name?.toLowerCase().includes(q)) {
        groups.assignments.push({
          label: a.id,
          sub: `${creditor?.name || "—"} → ${debtor?.name || "—"} · ${fmtByn(a.amount || 0)}`,
          page: "assignments", icon: Package, type: "assignment", id: a.id,
        });
      }
    });

    // Deals (portfolio)
    ALL_DEALS.forEach(d => {
      if (d.id.toLowerCase().includes(q)) {
        groups.deals.push({
          label: d.id,
          sub: `${fmtByn(d.amount)} · ${getCreditorName(d.creditorId)}`,
          page: "portfolio", icon: TrendingUp, type: "deal", id: d.id,
        });
      }
    });

    // Documents
    if (typeof DOCUMENTS_REGISTRY !== "undefined") {
      DOCUMENTS_REGISTRY.forEach(d => {
        if (d.id?.toLowerCase().includes(q) || d.name?.toLowerCase().includes(q)) {
          groups.documents.push({
            label: d.id || d.name,
            sub: `${d.type || "—"} · ${d.stage || "—"}`,
            page: "documents", icon: FileText, type: "document", id: d.id,
          });
        }
      });
    }

    // Cap each group at 5
    Object.keys(groups).forEach(k => { groups[k] = groups[k].slice(0, 5); });

    return groups;
  }, [gsQuery]);

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
          {BANK_NAV.filter(item => canAccessModule(currentUser, item.id)).map(item=>{
            const isActive = active===item.id || (navStack.length>0 && navStack[0]===item.id);
            const Icon = item.icon;
            // Dynamic badge count based on current user's tasks (not static mock)
            const countKey = item.id === "pipeline" ? "pipeline"
              : item.id === "assignments" ? "assignments"
              : item.id === "documents" ? "documents" : null;
            const dynCount = countKey ? myTaskCounts[countKey] : 0;
            const hasUrgent = countKey && myTaskCounts.urgent > 0 && dynCount > 0;
            return <button key={item.id} onClick={()=>{setActive(item.id);setNavStack([])}} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${isActive?"text-white":"text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`} style={isActive?{background:B.accent}:undefined}>
              <Icon size={18} className="shrink-0"/>
              {sidebarOpen&&<span className="text-[13px] leading-tight">{item.label}</span>}
              {sidebarOpen && dynCount > 0 && <span className={`ml-auto px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white ${newTaskIndicator[item.id] || hasUrgent ? "animate-pulse" : ""}`}
                style={{background: hasUrgent ? B.red : "#64748B"}}>{dynCount}</span>}
            </button>;
          })}
        </nav>
        <div className="p-4 border-t border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{background:ROLE_ACCESS[currentUser.role]?.color||"#334155"}}>
              {currentUser.name.split(" ").map(n=>n[0]).slice(0,2).join("")}
            </div>
            {sidebarOpen&&<div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">{currentUser.name}</div>
              <div className="text-[10px] truncate flex items-center gap-1" style={{color:ROLE_ACCESS[currentUser.role]?.color==="#0F172A"?"#94A3B8":ROLE_ACCESS[currentUser.role]?.color}}>
                <span>{ROLE_ACCESS[currentUser.role]?.icon}</span>
                <span>{ROLE_ACCESS[currentUser.role]?.label||currentUser.position}</span>
              </div>
            </div>}
          </div>
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 shrink-0 flex items-center justify-between px-6 border-b" style={{background:cardBg,borderColor:B.border}}>
          <button aria-label={sidebarOpen ? "Свернуть боковое меню" : "Развернуть боковое меню"} onClick={()=>setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-slate-100"><LayoutDashboard size={16} style={{color:B.t2}}/></button>
          <div className="flex items-center gap-3">
            <RoleSwitcherHeader currentUser={currentUser} onChange={changeRole}/>
            <button onClick={()=>{setGlobalSearch(true);setGsQuery("")}} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-400 hover:border-slate-300">
              <Search size={14}/><span>Поиск</span><span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono">⌘K</span>
            </button>
            <NotificationBell currentUser={currentUser} notifications={NOTIFICATIONS} onNotificationClick={(notif)=>{
              if(notif.link?.page) setActive(notif.link.page);
            }}/>
            <button aria-label={dark ? "Выключить тёмную тему" : "Включить тёмную тему"} onClick={()=>setDark(!dark)} className="p-2 rounded-lg hover:bg-slate-100">{dark?<ToggleRight size={16} style={{color:B.accent}}/>:<ToggleLeft size={16} style={{color:B.t3}}/>}</button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6" style={{background:mainBg}}>
          {!isOnline && <div className="mb-4 p-3 rounded-xl flex items-center gap-3" style={{background: B.redL, borderLeft: `3px solid ${B.red}`}}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{background: "white"}}>
              <AlertTriangle size={14} style={{color: B.red}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{color: B.red}}>🔌 Нет подключения к интернету</div>
              <div className="text-[11px] mt-0.5" style={{color: B.t2}}>
                Данные не обновляются. Действия будут сохранены локально и синхронизированы при восстановлении связи.
              </div>
            </div>
          </div>}
          {!canAccessModule(currentUser, active) ? <AccessDenied moduleName={active} onGoHome={()=>setActive("dashboard")}/> : <PageErrorBoundary key={active} pageName={BANK_NAV.find(n => n.id === active)?.label || active}>
          {active==="dashboard"&&<DashboardPage currentUser={currentUser} pushNav={pushNav} setToast={setToast}/>}
          {active==="pipeline"&&<PipelinePage currentUser={currentUser} setToast={setToast} favorites={favorites} toggleFavorite={toggleFavorite}/>}
          {active==="assignments"&&<AssignmentsPage currentUser={currentUser} setToast={setToast}/>}
          {active==="audit-log"&&<AuditLogPage currentUser={currentUser} setToast={setToast}/>}
          {active==="document-detail"&&<DocumentDetailPage docId={selectedDocId} onBack={popNav} setToast={setToast}/>}
          {active==="clients"&&<ClientsPage currentUser={currentUser} pushNav={pushNav} setToast={setToast}/>}
          {active==="client-detail"&&<ClientDetailPage popNav={popNav} pushNav={pushNav} setToast={setToast}/>}
          {active==="portfolio"&&<PortfolioPage pushNav={pushNav} setToast={setToast}/>}
          {active==="deal-detail"&&<DealDetailPage popNav={popNav} setToast={setToast}/>}
          {active==="documents"&&<DocumentsPage currentUser={currentUser} setToast={setToast}/>}
          {active==="stoplist"&&<StoplistPage setToast={setToast}/>}
          {active==="scoring-admin"&&<ScoringPage setToast={setToast}/>}
          {active==="settings"&&<SettingsPage setToast={setToast}/>}
          </PageErrorBoundary>}
        </div>
      </main>

      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.type} onUndo={toast.onUndo} actionLabel={toast.actionLabel} onClose={() => setToast(null)}/>}

      {/* Global Search Modal */}
      {globalSearch && <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:9999,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)"}} onClick={()=>setGlobalSearch(false)}>
        <div className="max-w-xl mx-auto mt-20" onClick={e=>e.stopPropagation()}>
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
              <Search size={18} style={{color:B.t3}}/>
              <input autoFocus value={gsQuery} onChange={e=>setGsQuery(e.target.value)}
                placeholder="Поиск по ID, УНП, названию, ТТН..."
                className="flex-1 text-sm outline-none" style={{color:B.t1}}/>
              <kbd className="px-2 py-0.5 rounded bg-slate-100 text-[10px] text-slate-400 font-mono">ESC</kbd>
            </div>
            {gsQuery && <div className="py-2 max-h-[28rem] overflow-y-auto">
              {(() => {
                const groupLabels = {
                  pipeline: "Заявки", assignments: "Уступки", clients: "Клиенты",
                  deals: "Сделки", documents: "Документы",
                };
                const groupColors = {
                  pipeline: B.accent, assignments: B.purple || "#7C3AED", clients: B.green,
                  deals: "#6366F1", documents: "#0891B2",
                };
                const totalCount = Object.values(gsResults).reduce((s, arr) => s + arr.length, 0);
                if (totalCount === 0) return <div className="p-8 text-center text-sm" style={{color: B.t3}}>Ничего не найдено</div>;

                return Object.entries(gsResults)
                  .filter(([_, items]) => items.length > 0)
                  .map(([key, items]) => <div key={key} className="mb-2">
                    <div className="px-5 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2"
                      style={{color: groupColors[key]}}>
                      <span>{groupLabels[key]}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px]" style={{background: groupColors[key] + "15"}}>{items.length}</span>
                    </div>
                    {items.map((r, i) => <button key={`${key}-${i}`}
                      onClick={() => {setActive(r.page); setGlobalSearch(false);}}
                      className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 text-left transition-colors">
                      <r.icon size={15} style={{color: groupColors[key]}}/>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate" style={{color: B.t1}}>{r.label}</div>
                        <div className="text-[11px] truncate" style={{color: B.t3}}>{r.sub}</div>
                      </div>
                      <ChevronRight size={12} style={{color: B.t3}}/>
                    </button>)}
                  </div>);
              })()}
            </div>}
            {!gsQuery && <div className="p-8 text-center text-[11px]" style={{color: B.t3}}>
              Начните вводить: <strong>ID заявки</strong>, <strong>УНП</strong>, <strong>название компании</strong>, <strong>номер ТТН</strong>…
            </div>}
          </div>
        </div>
      </div>}

      {/* Help / hotkeys modal */}
      {helpModal && <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:9999,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)"}} onClick={()=>setHelpModal(false)}>
        <div className="max-w-lg mx-auto mt-20" onClick={e=>e.stopPropagation()}>
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="text-sm font-bold" style={{color: B.t1}}>⌨️ Горячие клавиши</div>
              <button onClick={()=>setHelpModal(false)} className="text-[11px] hover:underline" style={{color: B.t3}}>
                ESC для закрытия
              </button>
            </div>
            <div className="p-5 text-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>Общие</div>
              <div className="space-y-2 mb-4">
                {[
                  {keys: ["⌘", "K"], desc: "Открыть глобальный поиск"},
                  {keys: ["?"], desc: "Показать эту справку"},
                  {keys: ["ESC"], desc: "Закрыть модалку"},
                ].map((hk, i) => <div key={i} className="flex items-center justify-between">
                  <span style={{color: B.t1}}>{hk.desc}</span>
                  <div className="flex gap-1">
                    {hk.keys.map((k, j) => <kbd key={j} className="px-2 py-0.5 rounded border text-[10px] font-mono"
                      style={{background: "#F8FAFC", borderColor: B.border, color: B.t2}}>{k}</kbd>)}
                  </div>
                </div>)}
              </div>

              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
                Навигация <span className="normal-case font-normal" style={{color: B.t2}}>— нажать <kbd className="px-1 rounded text-[9px]" style={{background: B.accentL, color: B.accent}}>G</kbd> затем букву</span>
              </div>
              <div className="space-y-2">
                {[
                  {keys: ["G", "D"], desc: "Дашборд"},
                  {keys: ["G", "P"], desc: "Кредитный конвейер (Pipeline)"},
                  {keys: ["G", "A"], desc: "Уступки (Assignments)"},
                  {keys: ["G", "C"], desc: "Клиенты (Clients)"},
                  {keys: ["G", "R"], desc: "Портфель (poRtfolio)"},
                  {keys: ["G", "O"], desc: "Просрочки (Overdue)"},
                  {keys: ["G", "S"], desc: "Стоп-лист"},
                  {keys: ["G", "U"], desc: "Аудит-лог (aUdit)"},
                ].map((hk, i) => <div key={i} className="flex items-center justify-between">
                  <span style={{color: B.t1}}>{hk.desc}</span>
                  <div className="flex gap-1">
                    {hk.keys.map((k, j) => <kbd key={j} className="px-2 py-0.5 rounded border text-[10px] font-mono"
                      style={{background: "#F8FAFC", borderColor: B.border, color: B.t2}}>{k}</kbd>)}
                  </div>
                </div>)}
              </div>
            </div>
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
        /* Accessibility: visible focus ring for keyboard users */
        :focus-visible { outline: 2px solid ${B.accent}; outline-offset: 2px; border-radius: 4px; }
        button:focus { outline: none; }
        button:focus-visible { outline: 2px solid ${B.accent}; outline-offset: 2px; }
        /* Reduced motion support (respects OS preference or persisted user pref) */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════
// PAGE 1: DASHBOARD
// ═══════════════════════════════════════
function DashboardPage({pushNav, setToast, currentUser}) {
  const activeDeals = ALL_DEALS.filter(d=>d.status==="active");
  const overdueDeals = ALL_DEALS.filter(d=>d.status==="overdue");
  const totalPortfolio = activeDeals.reduce((s,d)=>s+d.amount,0)+overdueDeals.reduce((s,d)=>s+d.amount,0);
  const totalDiscount = ALL_DEALS.filter(d=>d.status!=="paid").reduce((s,d)=>s+d.discount,0);
  const bankIncome = Math.round(totalDiscount * 0.655);
  const activeClients = COMPANIES.filter(c=>c.status==="active").length;
  const isAdmin = currentUser?.role === "admin";

  // Assignments waiting for client (supplier or debtor)
  const waitingAsgs = ASSIGNMENTS.filter(a => isAssignmentWaitingClient(a));
  const waitingCritical = waitingAsgs.filter(a => getClientWaitLevel(a)==="critical");
  const waitingUrgent = waitingAsgs.filter(a => getClientWaitLevel(a)==="urgent");
  const waitingWarning = waitingAsgs.filter(a => getClientWaitLevel(a)==="warning");

  const pieDataTerms = [
    {name:"30 дней", value: activeDeals.filter(d=>d.term<=30).reduce((s,d)=>s+d.amount,0)||15000, fill:B.accent},
    {name:"60 дней", value: activeDeals.filter(d=>d.term>30&&d.term<=60).reduce((s,d)=>s+d.amount,0), fill:B.purple},
    {name:"90 дней", value: activeDeals.filter(d=>d.term>60).reduce((s,d)=>s+d.amount,0), fill:B.green},
  ];

  // Portfolio by scoring class (A/B/C cohorts)
  const cohortA = COMPANIES.filter(c=>c.role==="debtor"&&(c.scoringClass==="A"||c.scoringClass==="AA")).length;
  const cohortB = COMPANIES.filter(c=>c.role==="debtor"&&(c.scoringClass==="B"||c.scoringClass==="BB")).length;
  const cohortC = COMPANIES.filter(c=>c.role==="debtor"&&(c.scoringClass==="C"||c.scoringClass==="CC")).length;
  const pieDataClasses = [
    {name:"Класс A", value: cohortA||1, fill:B.green},
    {name:"Класс B", value: cohortB||1, fill:B.yellow},
    {name:"Класс C", value: cohortC||1, fill:B.red},
  ];

  return <div>
    <PageHeader title="Дашборд" breadcrumbs={["Главная"]}/>

    <div className="grid grid-cols-2 gap-4 mb-4">
      <KPICard label="Активный портфель" value={fmtByn(totalPortfolio)}
        icon={TrendingUp} color={B.accent} trend={12}
        periodValue={fmtByn(Math.round(totalPortfolio / 1.12))}
        tooltip="Сумма всех активных и просроченных уступок"/>
      <KPICard label="Клиентов" value={activeClients}
        sub="активных на платформе" icon={Users} color={B.accent}
        trend={3} periodValue={activeClients - 1}
        tooltip="Количество активных компаний"/>
    </div>
    <div className="grid grid-cols-2 gap-4 mb-6">
      <KPICard label="Просрочки"
        value={`${overdueDeals.length} / ${fmtByn(overdueDeals.reduce((s,d)=>s+d.amount,0))}`}
        icon={AlertTriangle} color={B.red}
        trend={-8} trendLabel="просрочек меньше"
        tooltip="Количество и сумма просроченных уступок"/>
      <KPICard label="Доход банка (мес)" value={fmtByn(bankIncome)}
        icon={Building2} color={B.green} trend={8}
        periodValue={fmtByn(Math.round(bankIncome / 1.08))}
        tooltip="15.5% от суммы дисконтов"/>
    </div>

    <div className="grid grid-cols-2 gap-6">
      {/* Portfolio by term */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>
          <InfoTooltip text="Распределение активного портфеля по срокам уступок">Портфель по срокам</InfoTooltip>
        </h3>
        <div className="flex items-center gap-6">
          <ResponsiveContainer width={180} height={180}>
            <PieChart><Pie data={pieDataTerms} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" strokeWidth={2} stroke="#fff">
              {pieDataTerms.map((e,i)=><Cell key={i} fill={e.fill}/>)}
            </Pie></PieChart>
          </ResponsiveContainer>
          <div className="space-y-3">{pieDataTerms.map((d,i)=><div key={i} className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{background:d.fill}}/><div><div className="text-xs font-semibold" style={{color:B.t1}}>{d.name}</div><div className="text-xs" style={{color:B.t2}}>{fmtByn(d.value)}</div></div></div>)}</div>
        </div>
      </Card>

      {/* Portfolio by scoring class (A/B/C) */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>
          <InfoTooltip text="Распределение клиентов по скоринг-классам">Портфель по скоринг-классам</InfoTooltip>
        </h3>
        <div className="flex items-center gap-6">
          <ResponsiveContainer width={180} height={180}>
            <PieChart><Pie data={pieDataClasses} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" strokeWidth={2} stroke="#fff">
              {pieDataClasses.map((e,i)=><Cell key={i} fill={e.fill}/>)}
            </Pie></PieChart>
          </ResponsiveContainer>
          <div className="space-y-3">{pieDataClasses.map((d,i)=><div key={i} className="flex items-center gap-2"><div className="w-3 h-3 rounded" style={{background:d.fill}}/><div><div className="text-xs font-semibold" style={{color:B.t1}}>{d.name}</div><div className="text-xs" style={{color:B.t2}}>{d.value} клиент{d.value===1?"":"ов"}</div></div></div>)}</div>
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
// PIPELINE v2 — CRM FUNNEL (50K threshold)
// ═══════════════════════════════════════

// Stages (CRM-style, 11 etaпов + 2 side: rejected/grey_zone)
const PIPELINE_STAGES = [
  {id:"analyst_verification",label:"Верификация аналитика",color:B.purple,role:"analyst",
   description:"Кредитный аналитик верифицирует скоринг. ≤50K → подписывает решение. >50K → передаёт ЛПР"},
  {id:"lpr_decision",label:"Решение ЛПР",color:"#6366F1",role:"lpr",
   description:"Лицо принимающее решение (только для >50K). Подписывает Решение ЭЦП"},
  {id:"contract_preparation",label:"Подготовка договора",color:B.accent,role:"usko_prepare",
   description:"УСКО вносит номер счёта из АБС, генерирует ген.договор факторинга"},
  {id:"contract_signing",label:"Подписание банком",color:"#06B6D4",role:"signer",
   description:"Подписант подписывает ген.договор ЭЦП"},
  {id:"client_signing",label:"Подписание клиентом",color:"#0891B2",role:"client",
   description:"Клиент получает договор, подписывает ЭЦП в своём кабинете"},
  {id:"client_activation",label:"Активация клиента",color:B.orange,role:"usko_activate",
   description:"УСКО активирует клиента в АБС → клиент получает доступ к созданию уступок"},
  {id:"active",label:"Активный клиент",color:B.green,role:"—",
   description:"Клиент активен — может создавать уступки по лимиту ген.договора факторинга"},
  {id:"rejected",label:"Отклонено",color:B.red,role:"—",
   description:"Отклонено системой или решением"},
  {id:"grey_zone",label:"Серая зона",color:"#6B7280",role:"—",
   description:"Пограничные клиенты для ручного рассмотрения"},
];

const PIPELINE_ROLES = {
  analyst:{label:"Кредитный аналитик",short:"Аналитик",color:B.accent,icon:"👤"},
  lpr:{label:"Лицо принимающее решение (>50K)",short:"ЛПР",color:B.purple,icon:"✍️"},
  usko_prepare:{label:"УСКО — подготовка договора",short:"УСКО (оформ.)",color:B.orange,icon:"📄"},
  signer:{label:"Подписант договоров",short:"Подписант",color:"#06B6D4",icon:"🔏"},
  usko_activate:{label:"УСКО — активация",short:"УСКО (актив.)",color:B.green,icon:"⚡"},
  all:{label:"Все роли",short:"Все",color:B.t2,icon:"👥"},
};

const TIER_LABELS = {
  simple:{label:"До 50K",full:"Упрощённая: Легат + БКИ",color:B.green},
  extended:{label:"Свыше 50K",full:"Расширенная: Легат + БКИ + Баланс ОПУ",color:B.accent},
};

const SCORING_ZONES = {
  white:{label:"Белая зона",color:B.green,desc:"Автоскоринг пройден, идёт на ручное подтверждение"},
  grey:{label:"Серая зона",color:"#6B7280",desc:"Пограничные клиенты"},
  black:{label:"Чёрная зона",color:B.red,desc:"Автоматический отказ"},
};

const DOC_KEY_LABELS = {
  consentBki:"Согласие БКИ",consent_bki:"Согласие БКИ",legat:"Выписка Легат",bki:"Кредитный отчёт БКИ",
  balance:"Баланс ОПУ",balanceQ4:"Баланс ОПУ (послед. квартал)",balanceOpu:"Баланс ОПУ",pl:"Баланс ОПУ",
  decision:"Решение о предоставлении факторинга",generalContract:"Генеральный договор факторинга",
  supAg:"Допсоглашение",ttn:"ТТН (товарно-транспортная накладная)",esfchf:"ЭСЧФ",
  dkp:"Договор купли-продажи",notification:"Уведомление должнику",
  anketa:"Анкета (Прил.12)",consentOeb:"Согласие ОЭБ",consent_oeb:"Согласие ОЭБ",
  dkp_doc:"Договор купли-продажи (ДКП)",actReconciliation:"Акт сверки",
  supplementaryAgreement:"Допсоглашение к ГД",
};

// Return-to-USKO issue types (from signer)
const RETURN_ISSUE_LABELS = {
  wrong_account: "Неверные реквизиты счёта",
  wrong_amount: "Ошибка в сумме / лимите",
  wrong_client_name: "Неправильное наименование клиента",
  wrong_date: "Неверная дата",
  other: "Другое",
};

// Return-to-supplier issue types (from USKO)
const SUPPLIER_RETURN_ISSUES = {
  dkp_missing: "Договор купли-продажи (ДКП) отсутствует",
  ttn_illegible: "ТТН не читается / отсутствует",
  ttn_registry_missing: "Реестр ТТН за день не приложен",
  act_not_signed: "Акт сверки не подписан должником",
  debtor_signature_wrong: "Подпись должника некорректна",
  amounts_mismatch: "Суммы в ТТН и ДКП не совпадают",
  date_mismatch: "Несоответствие дат",
  other: "Другое",
};

// ═══════════════════════════════════════
// ASSIGNMENTS (Branch 6) — constants
// ═══════════════════════════════════════
const ASSIGNMENT_STAGES = [
  {id:"docs_received", label:"Документы от поставщика", color:"#D97706", role:"system", actor:"supplier", phase:"docs",
    actionHint:"Поставщик загружает ДКП, ТТН, ЭСЧФ", whoActs:"👤 Поставщик"},
  {id:"debtor_notified", label:"Уведомление должнику", color:"#0891B2", role:"system", actor:"platform", phase:"docs",
    actionHint:"Платформа автоматически отправляет уведомление", whoActs:"⚙ Платформа"},
  {id:"debtor_confirming", label:"Подпись должника", color:"#06B6D4", role:"debtor", actor:"debtor", phase:"docs",
    actionHint:"Должник подтверждает получение товара в своём кабинете", whoActs:"🚚 Должник"},
  {id:"usko_checking", label:"Проверка комплекта", color:"#EA580C", role:"usko_prepare", actor:"bank", phase:"check",
    actionHint:"УСКО: проверить ДКП, ТТН, ЭСЧФ → принять комплект (или вернуть поставщику)", whoActs:"🏦 УСКО-специалист"},
  {id:"returned_to_supplier", label:"Возврат поставщику", color:"#DC2626", role:"supplier", actor:"supplier", phase:"check",
    actionHint:"Поставщик исправляет комплект и загружает заново", whoActs:"👤 Поставщик"},
  {id:"ds_preparing", label:"Формирование ДС", color:"#EA580C", role:"usko_prepare", actor:"bank", phase:"sign",
    actionHint:"УСКО: сформировать ДС (платформа генерирует автоматически)", whoActs:"🏦 УСКО-специалист"},
  {id:"ds_signing_bank", label:"Подпись ДС банком", color:"#06B6D4", role:"signer", actor:"bank", phase:"sign",
    actionHint:"Подписант: подписать ДС ЭЦП банка (PIN)", whoActs:"🏦 Подписант банка"},
  {id:"ds_signing_client", label:"Подпись ДС клиентом", color:"#0891B2", role:"supplier", actor:"supplier", phase:"sign",
    actionHint:"Клиент подписывает ДС ЭЦП в своём кабинете", whoActs:"👤 Клиент (поставщик)"},
  {id:"payment_approved", label:"Разрешение на оплату", color:"#EA580C", role:"usko_prepare", actor:"bank", phase:"pay",
    actionHint:"УСКО: проверить реквизиты → разрешить оплату в АБС", whoActs:"🏦 УСКО-специалист"},
  {id:"paid", label:"Оплачено", color:"#059669", role:"—", actor:"system", phase:"pay",
    actionHint:"Средства поступили клиенту через АБС банка", whoActs:"⚙ Система"},
];

// ─── 4 логические фазы для UI (упрощение 10 микро-этапов) ───
const ASSIGNMENT_PHASES = [
  {id:"docs", label:"Документы", icon:"📄",
    description:"Загрузка комплекта и подтверждение должником",
    actorsInvolved:"👤 Поставщик + 🚚 Должник",
    bankAction:"Банк ожидает (не действует)"},
  {id:"check", label:"Проверка", icon:"🔍",
    description:"УСКО проверяет комплект документов",
    actorsInvolved:"🏦 УСКО-специалист",
    bankAction:"Проверить ДКП/ТТН/ЭСЧФ → принять или вернуть"},
  {id:"sign", label:"Подписание ДС", icon:"✍️",
    description:"Банк формирует ДС и обе стороны подписывают",
    actorsInvolved:"🏦 УСКО + 🏦 Подписант + 👤 Клиент",
    bankAction:"Сформировать ДС → подписать ЭЦП → ждать клиента"},
  {id:"pay", label:"Оплата", icon:"💰",
    description:"УСКО разрешает оплату, платформа проводит",
    actorsInvolved:"🏦 УСКО-специалист",
    bankAction:"Проверить реквизиты → разрешить оплату в АБС"},
];

function getAssignmentPhase(stage) {
  const stageInfo = ASSIGNMENT_STAGES.find(s => s.id === stage);
  return stageInfo?.phase || "docs";
}

const ASSIGNMENT_SLA_LIMITS = {
  docs_received: {days:0, actor:"platform"},
  debtor_notified: {days:0, actor:"platform"},
  debtor_confirming: {days:3, actor:"debtor"},
  usko_checking: {days:2, actor:"bank"},
  returned_to_supplier: {days:5, actor:"supplier"},
  ds_preparing: {days:1, actor:"bank"},
  ds_signing_bank: {days:1, actor:"bank"},
  ds_signing_client: {days:3, actor:"supplier"},
  payment_approved: {days:1, actor:"bank"},
};

const CLIENT_ACTIVITY_THRESHOLDS = {normal:1, warning:3, urgent:7};

function getAssignmentDaysOnStage(asg) {
  const start = asg.stageStartDate || asg.createdDate;
  const now = new Date("2026-03-26");
  return Math.max(0, Math.floor((now - new Date(start)) / 86400000));
}
function getAssignmentSlaInfo(asg) {
  const cfg = ASSIGNMENT_SLA_LIMITS[asg.stage] || {days:5, actor:"bank"};
  const days = getAssignmentDaysOnStage(asg);
  return {days, limit:cfg.days, actor:cfg.actor, overdue: days > cfg.days};
}
function isAssignmentBankOverdue(asg) {
  const info = getAssignmentSlaInfo(asg);
  return info.overdue && info.actor === "bank";
}
// isAssignmentSupplierOverdue — supplier/debtor ответственен и просрочил ответ
function isAssignmentClientOverdue(asg) {
  const info = getAssignmentSlaInfo(asg);
  return info.overdue && (info.actor === "supplier" || info.actor === "debtor");
}
// isAssignmentDebtorPaymentOverdue — должник не оплатил в срок после получения уведомления
function isAssignmentDebtorPaymentOverdue(asg) {
  if (asg.stage !== "paid") return false; // only applies to paid assignments awaiting debtor repayment
  if (!asg.dueDate) return false;
  try {
    const due = new Date(asg.dueDate);
    const now = new Date();
    return now > due && !asg.debtorRepaid;
  } catch(e) { return false; }
}
function isAssignmentWaitingClient(asg) {
  const info = getAssignmentSlaInfo(asg);
  return info.actor === "debtor" || info.actor === "supplier";
}
function getClientWaitLevel(asg) {
  const days = getAssignmentDaysOnStage(asg);
  if (days >= CLIENT_ACTIVITY_THRESHOLDS.urgent) return "critical";
  if (days >= CLIENT_ACTIVITY_THRESHOLDS.warning+1) return "urgent";
  if (days >= CLIENT_ACTIVITY_THRESHOLDS.warning) return "warning";
  return "normal";
}
function canActOnAssignmentStage(user, stageId) {
  const access = ROLE_ACCESS[user.role];
  if (!access) return false;
  if (access.assignmentStages === "all") return true;
  if (!access.assignmentStages) return false;
  return access.assignmentStages.includes(stageId);
}
function getMyAssignmentStages(user) {
  const access = ROLE_ACCESS[user.role];
  if (!access?.assignmentStages) return [];
  if (access.assignmentStages === "all") return ASSIGNMENT_STAGES.map(s=>s.id);
  return access.assignmentStages;
}

function calcSlaDays(created) {
  const c = new Date(created);
  const now = new Date("2026-03-26");
  return Math.max(0, Math.floor((now - c) / 86400000));
}

// ═══════════════════════════════════════
// ROLE SWITCHER
// ═══════════════════════════════════════
function RoleSwitcher({currentRole, onChange}) {
  const roles = [
    {id:"all",label:"Все этапы"},
    {id:"analyst",label:"Кредитный аналитик"},
    {id:"lpr",label:"ЛПР (>50K)"},
    {id:"usko_prepare",label:"УСКО (подготовка)"},
    {id:"signer",label:"Подписант"},
    {id:"usko_activate",label:"УСКО (активация)"},
  ];
  return <div className="flex items-center gap-2 mb-4 flex-wrap">
    <span className="text-xs font-semibold" style={{color:B.t3}}>Роль:</span>
    {roles.map(r=><button key={r.id} onClick={()=>onChange(r.id)}
      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all"
      style={currentRole===r.id?{background:B.accent,color:"white",borderColor:B.accent}:{background:"white",color:B.t2,borderColor:B.border}}>
      {r.label}
    </button>)}
  </div>;
}

// ═══════════════════════════════════════
// PIPELINE PAGE v3 (roles + my queue)
// ═══════════════════════════════════════

// Priority badge: text instead of colored dot
function PriorityBadge({priority, onClick}) {
  if(priority==="medium") return null;
  const cfg = priority==="high"
    ? {label:"🔥 СРОЧНО", bg:B.redL, color:B.red}
    : {label:"⏬ Низкий", bg:"#F1F5F9", color:B.t3};
  return (
    <button onClick={onClick} className="px-1.5 py-0.5 rounded text-[9px] font-bold hover:opacity-80"
      style={{background:cfg.bg, color:cfg.color}} title="Клик — изменить приоритет">
      {cfg.label}
    </button>
  );
}

// ─── UX REDESIGN: helper components ───
// PriorityDot — компактная цветная точка вместо текстового бейджа
function PriorityDot({priority, onClick}) {
  const color = priority === "high" ? B.red
    : priority === "medium" ? B.yellow : "#CBD5E1";
  const size = priority === "high" ? 10 : priority === "medium" ? 9 : 8;
  const title = priority === "high" ? "Высокий приоритет"
    : priority === "medium" ? "Средний приоритет" : "Низкий приоритет";
  return <button onClick={onClick}
    className="rounded-full transition-all hover:scale-125 shrink-0"
    style={{
      width: size, height: size, background: color,
      boxShadow: priority === "high" ? `0 0 0 3px ${B.red}20` : "none",
    }}
    title={`${title} · клик — сменить`}
  />;
}

// SLARing — прогресс-кольцо SLA
function SLARing({days, limit, size=32}) {
  if (!limit || limit <= 0) return <div className="text-[10px] mono font-bold" style={{color:B.t2}}>{days}д</div>;
  const pct = Math.min(100, (days / limit) * 100);
  const r = size/2 - 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct/100) * circumference;
  const color = pct >= 100 ? B.red : pct >= 66 ? B.yellow : B.green;
  const isOverdueStage = pct >= 100;

  return <div className="relative shrink-0" title={`${days} ${days===1?"день":"дней"} из лимита ${limit}`}>
    <svg width={size} height={size} className={isOverdueStage ? "animate-pulse" : ""}>
      <circle cx={size/2} cy={size/2} r={r} stroke={B.border} strokeWidth={2} fill="none"/>
      <circle cx={size/2} cy={size/2} r={r}
        stroke={color} strokeWidth={2.5} fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{transition:"stroke-dashoffset 0.3s"}}/>
    </svg>
    <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black mono"
      style={{color}}>
      {days}д
    </div>
  </div>;
}

// MiniProgress — точки этапов с подписью
function MiniProgress({currentIdx, total, stageLabel}) {
  return <div className="flex items-center gap-1.5 min-w-0">
    <div className="flex items-center gap-0.5 shrink-0">
      {Array.from({length: total}).map((_, i) => (
        <div key={i} className="rounded-full transition-all"
          style={{
            width: i === currentIdx ? 10 : 5,
            height: 5,
            background: i < currentIdx ? B.green
              : i === currentIdx ? B.accent
              : B.border,
          }}/>
      ))}
    </div>
    <span className="text-[10px] font-semibold shrink-0" style={{color:B.t3}}>
      {currentIdx + 1}/{total}
    </span>
    <span className="text-[10px] truncate" style={{color:B.t2}}>
      · {stageLabel}
    </span>
  </div>;
}

// Single pipeline request card
// ─── UNIFIED TASK HUB ───
// Shows all tasks for current user from all modules (pipeline + assignments + documents)
// grouped by category: Urgent → New → In Progress → Waiting Client → Expiring
function UnifiedTaskHub({tasks, onNavigate, currentUser}) {
  if (!tasks || tasks.length === 0) return null;

  // Only show priority-critical buckets here (urgent/urgent_sign/expiring).
  // All other tasks (new, in_progress, review, waiting_client) go to the unified table below.
  const PRIORITY_CATEGORIES = ["urgent", "urgent_sign", "expiring"];
  const priorityTasks = tasks.filter(t => PRIORITY_CATEGORIES.includes(t.category));
  if (priorityTasks.length === 0) return null;

  // Group by category
  const buckets = {
    urgent: [],
    urgent_sign: [],
    expiring: [],
  };
  priorityTasks.forEach(t => {
    if (buckets[t.category]) buckets[t.category].push(t);
  });

  // Sort each bucket: (1) unclaimed analyst tasks first, (2) overdue, (3) by days desc
  Object.keys(buckets).forEach(k => {
    buckets[k].sort((a, b) => {
      // Prioritize pipeline tasks with no analyst taken yet
      const aUnclaimed = a.type === "pipeline" && a.raw?.stage === "analyst_verification" && !a.raw?.analystTakenBy;
      const bUnclaimed = b.type === "pipeline" && b.raw?.stage === "analyst_verification" && !b.raw?.analystTakenBy;
      if (aUnclaimed && !bUnclaimed) return -1;
      if (!aUnclaimed && bUnclaimed) return 1;
      if (a.overdue && !b.overdue) return -1;
      if (!a.overdue && b.overdue) return 1;
      return (b.days || 0) - (a.days || 0);
    });
  });

  const categoryConfig = {
    urgent: {label: "🔥 Срочно — просрочено SLA", color: B.red, bg: B.redL, pulse: true},
    urgent_sign: {label: "🔏 На вашей подписи", color: "#06B6D4", bg: "#CFFAFE", pulse: true},
    expiring: {label: "📅 Истекающие документы", color: B.orange, bg: "#FFEDD5"},
  };

  const totalUrgent = buckets.urgent.length + buckets.urgent_sign.length;

  return <div className="space-y-3 mb-5">
    {/* Summary header */}
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-black" style={{color: B.t1}}>
          Требует внимания
        </h2>
        <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
          style={{background: B.redL, color: B.red}}>
          {priorityTasks.length}
        </span>
        {totalUrgent > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full font-bold animate-pulse"
          style={{background: B.red, color: "white"}}>
          🔥 {totalUrgent} срочно
        </span>}
      </div>
      <div className="text-[10px]" style={{color: B.t3}}>
        Остальные задачи — в таблице ниже
      </div>
    </div>

    {/* Category blocks — in priority order */}
    {Object.entries(buckets).filter(([_, items]) => items.length > 0).map(([key, items]) => {
      const cfg = categoryConfig[key];
      return <Card key={key} className="overflow-hidden"
        style={{borderColor: cfg.color + "40", borderWidth: 2}}>
        {/* Category header */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5"
          style={{background: cfg.bg}}>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black ${cfg.pulse && items.length > 0 ? "animate-pulse" : ""}`}
              style={{color: cfg.color}}>
              {cfg.label}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
              style={{background: "white", color: cfg.color}}>
              {items.length}
            </span>
          </div>
          {key === "urgent" && <span className="text-[10px] font-semibold" style={{color: B.red}}>
            Требует немедленного действия
          </span>}
        </div>
        {/* Task rows */}
        <div className="divide-y" style={{borderColor: B.border}}>
          {items.map(task => <TaskHubRow key={`${task.type}-${task.id}`} task={task} onNavigate={onNavigate}/>)}
        </div>
      </Card>;
    })}
  </div>;
}

function TaskHubRow({task, onNavigate}) {
  return <button onClick={()=>onNavigate(task)}
    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left group">
    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
      style={{background: task.color + "15", color: task.color}}>
      <task.icon size={14}/>
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="mono text-[11px] font-bold" style={{color: task.color}}>{task.id}</span>
        <span className="text-xs font-semibold truncate" style={{color: B.t1}}>{task.title}</span>
        {task.priority === "high" && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: B.red}}/>}
      </div>
      <div className="text-[10px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{color: B.t3}}>
        <span>{task.subtitle}</span>
        {task.amount && <><span>·</span><span className="mono">{fmtByn(task.amount)}</span></>}
        {task.days != null && <><span>·</span>
          <span className="mono font-bold" style={{color: task.overdue ? B.red : B.t2}}>
            {task.days} раб.д{task.limit != null ? ` / ${task.limit}` : ""}
          </span>
        </>}
      </div>
    </div>
    <div className="shrink-0 flex items-center gap-2">
      <span className="text-[10px] font-semibold px-2 py-1 rounded hidden sm:block"
        style={{background: task.color + "15", color: task.color}}>
        {task.action}
      </span>
      <ArrowRight size={14} className="opacity-40 group-hover:opacity-100 transition-opacity" style={{color: task.color}}/>
    </div>
  </button>;
}

// HeroTaskCard — большая карточка «главная задача» сверху MyQueueView
function HeroTaskCard({task, currentUser, onOpen, onSkip, onHideForever}) {
  const stage = PIPELINE_STAGES.find(s => s.id === task.stage);
  const isOverdueNow = isOverdue(task);
  const recommendation = task.analystRecommendation;
  const days = getDaysOnStage(task);
  const slaLimit = getSlaLimit(task.stage, task.tier);

  const reason = isOverdueNow
    ? `⚠ Просрочена на ${Math.max(1, days - slaLimit)}д`
    : task.priority === "high" ? "🔥 Высокий приоритет"
    : `${days}д на этапе`;

  const mainAction = getMainActionLabel(task.stage, currentUser?.role);

  return <Card className="p-6 mb-5 relative overflow-hidden"
    style={{background: "linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)", color: "white", border: "none"}}>
    <div className="absolute -top-4 -right-4 w-32 h-32 rounded-full opacity-10" style={{background:"white"}}/>
    <div className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full opacity-5" style={{background:"white"}}/>

    <div className="relative z-10">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-widest opacity-80">🎯 Ваша главная задача</span>
        <div className="flex-1 h-px bg-white/20"/>
      </div>

      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] mono opacity-70">{task.id}</div>
          <div className="text-2xl font-black mb-1 truncate">{task.company}</div>
          {task.requestedAmount && <div className="text-3xl font-black mono">{fmtByn(task.requestedAmount)}</div>}
        </div>
        {task.scoringClass && <div className="text-right shrink-0">
          <div className="text-[10px] opacity-70">Скоринг</div>
          <div className="text-3xl font-black">{task.scoringClass}</div>
        </div>}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
        {stage && <div className="p-2 rounded-lg bg-white/10">
          <div className="opacity-70 text-[10px]">Этап</div>
          <div className="font-bold truncate">{stage.label}</div>
        </div>}
        <div className="p-2 rounded-lg bg-white/10">
          <div className="opacity-70 text-[10px]">Статус</div>
          <div className="font-bold truncate">{reason}</div>
        </div>
        {recommendation && <div className="p-2 rounded-lg bg-white/10">
          <div className="opacity-70 text-[10px]">Аналитик рекомендует</div>
          <div className="font-bold">{recommendation === "approve" ? "✓ Одобрить" : recommendation === "reject" ? "✗ Не одобрять" : "⚠ Рассмотреть"}</div>
        </div>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={()=>onOpen(task)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm bg-white hover:bg-slate-50 transition-colors"
          style={{color:"#1E40AF"}}>
          <ArrowRight size={16}/>
          Открыть и {mainAction}
        </button>
        <button onClick={onSkip} className="text-xs opacity-70 hover:opacity-100 underline">
          Отложить на потом
        </button>
        {onHideForever && <button onClick={onHideForever} className="text-xs opacity-50 hover:opacity-80 underline ml-auto">
          Скрыть подсказку
        </button>}
      </div>
    </div>
  </Card>;
}

function PipelineCard({req, onClick, onCyclePriority, onToggleFavorite, isFavorite, showOverdueVisual, isAdmin, isKeyboardSelected, draggable, onDragStart, onDragEnd}) {
  const tierInfo = TIER_LABELS[req.tier];
  const slaDays = getDaysOnStage(req);
  const slaLimit = getSlaLimit(req.stage, req.tier);
  const overdue = showOverdueVisual && isOverdue(req);
  const isRejected = req.stage === "rejected";
  const isGrey = req.stage === "grey_zone";
  const isActive = req.stage === "active";
  const isDone = isRejected || isGrey || isActive;

  const scColor = (req.scoringClass==="A"||req.scoringClass==="AA") ? B.green
    : (req.scoringClass==="B"||req.scoringClass==="BB") ? B.yellow : B.red;
  const scBg = (req.scoringClass==="A"||req.scoringClass==="AA") ? B.greenL
    : (req.scoringClass==="B"||req.scoringClass==="BB") ? B.yellowL : B.redL;

  // Client silence indicator (shown only when critical ≥3 days)
  const clientSilenceDays = getClientSilenceDays(req);
  const hasClientSilence = clientSilenceDays > 2;
  const silenceColor = clientSilenceDays >= 6 ? B.red
    : clientSilenceDays >= 3 ? "#EA580C" : B.yellow;

  // Priority left border
  const priorityColor = req.priority === "high" ? B.red
    : req.priority === "medium" ? "#F59E0B" : null;

  // Background
  const bg = isGrey ? "#F9FAFB"
    : isRejected ? "#FEF2F2"
    : overdue ? "#FEF2F2"
    : "white";

  // Border-left color/width
  const borderLeftColor = priorityColor ? priorityColor
    : isRejected ? B.red
    : isGrey ? "#6B7280"
    : "transparent";
  const borderLeftWidth = priorityColor ? 4 : (isRejected || isGrey) ? 3 : 0;

  return (
    <Card
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`transition-all cursor-pointer hover:shadow-md group relative ${isKeyboardSelected ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
      onClick={onClick}
      style={{
        borderLeft: `${borderLeftWidth}px solid ${borderLeftColor}`,
        background: bg,
      }}>

      {/* Row 1: ID + Amount + Scoring + SLA ring */}
      <div className="flex items-start gap-3 px-4 pt-3">
        <div className="shrink-0 mt-1.5">
          <PriorityDot priority={req.priority}
            onClick={(e)=>{e.stopPropagation(); onCyclePriority && onCyclePriority(req.id)}}/>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="mono text-xs font-semibold" style={{color: isRejected ? B.red : B.accent}}>{req.id}</span>
            <span className="text-slate-300">·</span>
            {req.requestedAmount && <span className="mono text-base font-black" style={{color:B.t1}}>{fmtByn(req.requestedAmount)}</span>}
          </div>
          <div className="text-sm font-semibold truncate" style={{color:B.t1}}>{req.company || "—"}</div>
          <div className="text-[10px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{color:B.t3}}>
            {req.unp && <span className="mono">УНП {req.unp}</span>}
            {req.unp && tierInfo && <span>·</span>}
            {tierInfo && <span>{tierInfo.label}</span>}
            <span>·</span>
            <span>{req.created}</span>
          </div>
        </div>

        <div className="shrink-0 flex items-start gap-2">
          {req.scoringClass && <div className="px-1.5 py-1 rounded text-[10px] font-black"
            style={{background: scBg, color: scColor}}>
            {req.scoringClass}
          </div>}
          {!isDone && <SLARing days={slaDays} limit={slaLimit}/>}
        </div>
      </div>

      {/* Row 2: critical client silence (≥3 days) OR reject reason — only when actionable */}
      {((hasClientSilence && clientSilenceDays >= 3) || req.rejectReason) && <div className="px-4 pb-2 pt-1 flex items-center gap-2">
        {hasClientSilence && clientSilenceDays >= 3 && <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold ${clientSilenceDays >= 6 ? "animate-pulse" : ""}`}
          style={{background: silenceColor + "15", color: silenceColor}}>
          {clientSilenceDays >= 6 ? <AlertTriangle size={10}/> : <Clock size={10}/>}
          Клиент молчит {clientSilenceDays}д
        </div>}
        {req.rejectReason && <div className="text-[10px] truncate flex-1" style={{color:B.red}}>{req.rejectReason}</div>}
      </div>}

      {/* Bottom padding */}
      <div className="pb-2"/>

      {/* Quick actions on hover (admin only) */}
      {isAdmin && <div className="absolute right-3 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button onClick={(e)=>{e.stopPropagation(); onToggleFavorite && onToggleFavorite(req.id)}}
          className="p-1 rounded bg-white border hover:border-yellow-500"
          title={isFavorite ? "Убрать из избранного" : "В избранное"}>
          <Star size={11} fill={isFavorite ? B.yellow : "none"} style={{color: isFavorite ? B.yellow : B.t3}}/>
        </button>
      </div>}

      {/* Favorite always visible if marked */}
      {!isAdmin && isFavorite && <button onClick={(e)=>{e.stopPropagation(); onToggleFavorite && onToggleFavorite(req.id)}}
        className="absolute right-3 top-2 p-1">
        <Star size={11} fill={B.yellow} style={{color: B.yellow}}/>
      </button>}

      {/* Hover tooltip with hotkey hint */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none z-10 hidden lg:block">
        <div className="text-[9px] px-1.5 py-0.5 rounded mono whitespace-nowrap"
          style={{background:"#0F172A",color:"white"}}>
          Enter — открыть · J/K — навигация
        </div>
      </div>
    </Card>
  );
}

// ─── UX REDESIGN v2: Terminology glossary modal ───
function TerminologyHelp() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={()=>setOpen(true)}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-slate-100"
      style={{color: B.t3}}>
      <Info size={12}/>
      Термины
    </button>
    <Modal open={open} onClose={()=>setOpen(false)} title="Глоссарий: заявка / договор / уступка" wide>
      <div className="space-y-3 text-xs">
        <div className="p-3 rounded-lg" style={{background: B.accentL+"50"}}>
          <div className="font-bold mb-1.5" style={{color: B.accent}}>📝 Заявка</div>
          <div style={{color: B.t2}}>
            Первичное обращение клиента с запросом на открытие факторингового обслуживания.
            Включает <strong>запрашиваемый лимит</strong> и <strong>список предполагаемых должников</strong>,
            по которым клиент планирует уступать. Проходит автоскоринг, верификацию аналитиком
            и решение ЛПР (для суммы {">"} 50 000 BYN).
          </div>
        </div>
        <div className="p-3 rounded-lg" style={{background: B.greenL+"80"}}>
          <div className="font-bold mb-1.5" style={{color: B.green}}>📄 Генеральный договор факторинга</div>
          <div style={{color: B.t2}}>
            Рамочное соглашение между клиентом и банком на <strong>весь одобренный лимит</strong>.
            Подписывается <strong>один раз</strong> после одобрения заявки. Содержит
            условия (ставка, срок, лимит), но <strong>не привязан</strong> к конкретным сделкам.
            Внутри этого договора клиент потом может подавать уступки.
          </div>
        </div>
        <div className="p-3 rounded-lg" style={{background: B.yellowL+"80"}}>
          <div className="font-bold mb-1.5" style={{color: B.yellow}}>📋 Уступка требования</div>
          <div style={{color: B.t2}}>
            Конкретная операция <strong>внутри ген.договора</strong>: клиент уступает банку
            право требования к должнику (по ДКП + ТТН + счёту-фактуре). Проходит <strong>упрощённый процесс</strong> —
            только проверка должника и документов, <strong>без</strong> повторного скоринга клиента
            (т.к. его лимит уже одобрен). Обрабатывается в модуле «Уступки».
          </div>
        </div>
        <div className="p-3 rounded-lg" style={{background: "#EEF2FF"}}>
          <div className="font-bold mb-1.5" style={{color: "#6366F1"}}>🏦 Интеграция с АБС банка</div>
          <div style={{color: B.t2}}>
            Oborotka.by — это <strong>рабочая среда</strong> для сотрудников банка (аналитик, ЛПР, УСКО,
            подписант). Резервирование средств, движения по корр.счёту, ФОР, начисление пеней — всё это
            выполняет <strong>АБС банка</strong>. Oborotka показывает статусы и остатки, полученные из АБС.
          </div>
        </div>
      </div>
    </Modal>
  </>;
}

function PipelinePage({currentUser, setToast, favorites, toggleFavorite}) {
  const isAdmin = currentUser.role === "admin";
  // Default to "my tasks" for ALL roles with a persistent choice.
  // Admin with no personal tasks falls back to "all" automatically (first-run only).
  const [viewMode, setViewMode] = usePersistedState("pipeline-view-mode", "my", v => v === "my" || v === "all");
  const [stageFilter, setStageFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [pipelineData, setPipelineData] = useState(PIPELINE.map(p=>({...p})));

  const myStages = getMyStages(currentUser);
  const myData = myStages === null
    ? pipelineData
    : pipelineData.filter(p => myStages.includes(p.stage));

  const cyclePriority = (id) => {
    const cycle = {low:"medium", medium:"high", high:"low"};
    setPipelineData(prev => prev.map(p => p.id===id ? {...p, priority:cycle[p.priority]||"medium"} : p));
    setToast({msg:"Приоритет изменён", type:"success"});
  };

  if (selectedReq) {
    return <PipelineDetailView req={selectedReq} currentUser={currentUser}
      pipelineData={pipelineData} setPipelineData={setPipelineData}
      onBack={()=>setSelectedReq(null)} setToast={setToast}/>;
  }

  // ─── "My Queue" view ───
  if (viewMode === "my" && !isAdmin) {
    return <MyQueueView
      currentUser={currentUser}
      myData={myData}
      tierFilter={tierFilter} setTierFilter={setTierFilter}
      search={search} setSearch={setSearch}
      onSelectReq={setSelectedReq}
      onCyclePriority={cyclePriority}
      onSwitchToAll={()=>setViewMode("all")}
      favorites={favorites}
      toggleFavorite={toggleFavorite}
      isAdmin={isAdmin}
      allPipelineData={pipelineData}
      allAssignments={ASSIGNMENTS}
      allDocuments={DOCUMENTS_REGISTRY}
    />;
  }

  // ─── "All pipeline" view (admin or switched) ───
  return <AllPipelineView
    currentUser={currentUser}
    pipelineData={pipelineData}
    setPipelineData={setPipelineData}
    stageFilter={stageFilter} setStageFilter={setStageFilter}
    roleFilter={roleFilter} setRoleFilter={setRoleFilter}
    tierFilter={tierFilter} setTierFilter={setTierFilter}
    search={search} setSearch={setSearch}
    overdueOnly={overdueOnly} setOverdueOnly={setOverdueOnly}
    onSelectReq={setSelectedReq}
    onCyclePriority={cyclePriority}
    onSwitchToMy={isAdmin ? null : ()=>setViewMode("my")}
    viewMode={viewMode}
    favorites={favorites}
    toggleFavorite={toggleFavorite}
    favoritesOnly={favoritesOnly}
    setFavoritesOnly={setFavoritesOnly}
    setToast={setToast}
  />;
}

// ─── "My Queue" view component ───
function MyQueueView({currentUser, myData, tierFilter, setTierFilter, search, setSearch, onSelectReq, onCyclePriority, onSwitchToAll, favorites, toggleFavorite, isAdmin, allPipelineData, allAssignments, allDocuments}) {
  const roleInfo = ROLE_ACCESS[currentUser.role];
  const isSigner = currentUser.role === "signer";

  // Batch sign state (signer only)
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchSignModal, setBatchSignModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [signingProgress, setSigningProgress] = useState(null); // {total, done}

  // Hero task state
  const [skippedHeroIds, setSkippedHeroIds] = useState([]);
  const [hotkeysHelpOpen, setHotkeysHelpOpen] = useState(false);
  const [keyboardSelectedIdx, setKeyboardSelectedIdx] = useState(0);
  const [heroHidden, setHeroHidden] = useState(() => {
    try { return sessionStorage.getItem("hero-task-hidden") === "true"; }
    catch(e) { return false; }
  });
  const hideHeroForever = () => {
    setHeroHidden(true);
    try { sessionStorage.setItem("hero-task-hidden", "true"); } catch(e) {}
  };

  const filtered = myData.filter(p=>{
    if(tierFilter!=="all" && p.tier!==tierFilter) return false;
    if(search){const q=search.toLowerCase(); return p.id.toLowerCase().includes(q)||(p.company||"").toLowerCase().includes(q)||(p.unp||"").includes(q)}
    return true;
  });

  // Collect ALL tasks from all modules for current user (pipeline + assignments + documents)
  const allMyTasks = useMemo(() => {
    return collectAllMyTasks(currentUser, {
      pipeline: allPipelineData || myData,
      assignments: allAssignments || [],
      documents: allDocuments || [],
    });
  }, [currentUser, allPipelineData, myData, allAssignments, allDocuments]);

  // Cross-module task navigation
  const navigateToTask = (task) => {
    if (task.type === "pipeline") {
      onSelectReq(task.raw);
    } else if (task.type === "assignment") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("oborotka:nav", {detail: {page: "assignments", assignmentId: task.id}}));
      }
    } else if (task.type === "document") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("oborotka:open-doc", {detail: {docId: task.id}}));
      }
    }
  };

  // Hero task: most urgent, exclude skipped
  const heroTask = useMemo(() => {
    const candidates = filtered.filter(t => !skippedHeroIds.includes(t.id));
    return selectHeroTask(candidates);
  }, [filtered, skippedHeroIds]);

  // Items excluding hero (so it doesn't duplicate)
  const itemsWithoutHero = filtered.filter(p => !heroTask || p.id !== heroTask.id);
  const overdueItems = itemsWithoutHero.filter(isOverdue);
  const inWorkItems = itemsWithoutHero.filter(p => !isOverdue(p));

  // Sort overdue: longest first
  // Overdue count for empty-state CTA
  const allPipelineOverdueCount = (allPipelineData || []).filter(isOverdue).length;
  overdueItems.sort((a,b) => getDaysOnStage(b) - getDaysOnStage(a));
  inWorkItems.sort((a,b) => {
    const pri = {high:0, medium:1, low:2};
    return (pri[a.priority]||1) - (pri[b.priority]||1);
  });

  // Combined ordered list for keyboard navigation (overdue first, then in-work)
  const orderedForKeys = [...(heroTask?[heroTask]:[]), ...overdueItems, ...inWorkItems];

  useKeyboardShortcuts({
    enabled: !batchMode && filtered.length > 0,
    onNext: () => setKeyboardSelectedIdx(i => Math.min(orderedForKeys.length - 1, i + 1)),
    onPrev: () => setKeyboardSelectedIdx(i => Math.max(0, i - 1)),
    onOpen: () => {
      const target = orderedForKeys[keyboardSelectedIdx];
      if (target) onSelectReq(target);
    },
    onToggleHelp: () => setHotkeysHelpOpen(v => !v),
  });

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  };
  const selectAll = () => setSelectedIds(filtered.map(p=>p.id));
  const deselectAll = () => setSelectedIds([]);

  const runBatchSign = () => {
    setBatchSignModal(false);
    setSigningProgress({total:selectedIds.length, done:0});
    // Simulate progress
    let i = 0;
    const timer = setInterval(()=>{
      i++;
      setSigningProgress({total:selectedIds.length, done:i});
      if (i >= selectedIds.length) {
        clearInterval(timer);
        setTimeout(()=>{
          setSigningProgress(null);
          setSelectedIds([]);
          setBatchMode(false);
          setPinInput("");
        }, 500);
      }
    }, 400);
  };

  return <div>
    <PageHeader title="Мои задачи" breadcrumbs={["Мои задачи"]}/>

    {/* Overload warning — when tasks count indicates overload */}
    {allMyTasks.length >= 15 && <Card className="p-3 mb-4" style={{background: B.yellowL, borderColor: B.yellow + "40"}}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background: "white"}}>
          <AlertTriangle size={16} style={{color: B.yellow}} className="animate-pulse"/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold" style={{color: B.yellow}}>
            ⚠ У вас {allMyTasks.length} активных задач — высокая загрузка
          </div>
          <div className="text-[10px] mt-0.5" style={{color: B.t2}}>
            Приоритет: закрывать «🔥 Срочно» первым. Если не справляетесь — сообщите руководителю.
          </div>
        </div>
        {isAdmin && <Btn size="sm" variant="ghost" onClick={()=>{}}>
          Перераспределить
        </Btn>}
      </div>
    </Card>}

    {/* View mode switcher */}
    <div className="flex items-center gap-2 mb-5">
      <button className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs" style={{background:B.accent, color:"white"}}>
        <Inbox size={14}/>Моя очередь ({filtered.length})
      </button>
      <button onClick={onSwitchToAll} className="flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-xs border hover:bg-slate-50" style={{borderColor:B.border, color:B.t2}}>
        <GitBranch size={14}/>Весь конвейер
      </button>

      {/* Batch mode toggle (signer only) */}
      {isSigner && filtered.length>0 && <div className="ml-auto flex items-center gap-2">
        {batchMode ? <>
          <button onClick={selectAll} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border hover:bg-slate-50" style={{borderColor:B.border,color:B.t2}}>Выбрать всё</button>
          <button onClick={deselectAll} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border hover:bg-slate-50" style={{borderColor:B.border,color:B.t2}}>Снять</button>
          <Btn size="sm" icon={Pen} onClick={()=>{setPinInput("");setBatchSignModal(true)}} disabled={selectedIds.length===0}>🔏 Подписать выбранные ({selectedIds.length})</Btn>
          <Btn size="sm" variant="ghost" onClick={()=>{setBatchMode(false);setSelectedIds([])}}>Отмена</Btn>
        </> : <Btn size="sm" variant="secondary" icon={Pen} onClick={()=>setBatchMode(true)}>Подписать пачкой</Btn>}
      </div>}
    </div>

    {/* Greeting */}
    <Card className="p-5 mb-5" style={{background:roleInfo.color+"08", borderColor:roleInfo.color+"30"}}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl" style={{background:"white"}}>
          {roleInfo.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{color:B.t1}}>Здравствуйте, {currentUser.name}</div>
          <div className="text-xs mb-3" style={{color:roleInfo.color}}>Вы — {roleInfo.label}</div>
          {filtered.length===0
            ? <div className="text-sm font-semibold" style={{color:B.green}}>🎉 Все задачи выполнены!</div>
            : <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-bold" style={{color:B.t1}}>
                  У вас <span style={{color:roleInfo.color}}>{filtered.length}</span> {filtered.length===1?"заявка":filtered.length<5?"заявки":"заявок"} в работе
                </span>
                {overdueItems.length>0 && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{background:B.redL, color:B.red}}>
                  ⚠ {overdueItems.length} {overdueItems.length===1?"просрочена":"просрочены"} SLA
                </span>}
              </div>
          }
        </div>
      </div>
    </Card>

    {/* Filters */}
    {filtered.length>0 && <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg border" style={{borderColor:B.border, background:"white"}}>
        <span className="text-[10px] font-semibold" style={{color:B.t3}}>Порог:</span>
        {[{id:"all",label:"Все"},{id:"simple",label:"≤50K"},{id:"extended",label:">50K"}].map(t =>
          <button key={t.id} onClick={()=>setTierFilter(t.id)} className="px-2 py-0.5 rounded text-[10px] font-bold"
            style={tierFilter===t.id?{background:B.accent, color:"white"}:{color:B.t2}}>{t.label}</button>
        )}
      </div>
      <div className="w-56 shrink-0"><SearchBar value={search} onChange={setSearch} placeholder="Номер, компания, УНП..."/></div>
    </div>}

    {/* Empty state with CTA */}
    {filtered.length===0 && <Card className="p-10 text-center relative overflow-hidden"
      style={{background:"linear-gradient(135deg, #ECFDF5 0%, #F0F9FF 100%)", border:"none"}}>
      <div className="text-6xl mb-4">🎉</div>
      <h2 className="text-2xl font-black mb-2" style={{color:B.green}}>Inbox Zero!</h2>
      <p className="text-sm mb-6" style={{color:B.t2}}>
        Все задачи на сегодня закрыты. Отличная работа!
      </p>

      <div className="max-w-md mx-auto space-y-2 text-left">
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{color:B.t3}}>
          Что дальше:
        </div>

        {allPipelineOverdueCount > 0 && <button
          onClick={onSwitchToAll}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white transition-colors text-left">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background:B.redL}}>
            <AlertTriangle size={18} style={{color:B.red}}/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold" style={{color:B.t1}}>Помочь коллеге с просрочками ({allPipelineOverdueCount})</div>
            <div className="text-[10px]" style={{color:B.t3}}>Есть заявки с нарушенным SLA в общем конвейере</div>
          </div>
          <ChevronRight size={16} style={{color:B.t3}}/>
        </button>}

        <button onClick={onSwitchToAll}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white transition-colors text-left">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background:B.accentL}}>
            <GitBranch size={18} style={{color:B.accent}}/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold" style={{color:B.t1}}>Посмотреть весь конвейер</div>
            <div className="text-[10px]" style={{color:B.t3}}>Следить за общей картиной</div>
          </div>
          <ChevronRight size={16} style={{color:B.t3}}/>
        </button>

        <button onClick={()=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("oborotka:nav",{detail:{page:"audit-log"}}))}}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white transition-colors text-left">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background:"#F1F5F9"}}>
            <Activity size={18} style={{color:B.t2}}/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold" style={{color:B.t1}}>Мои действия за сегодня</div>
            <div className="text-[10px]" style={{color:B.t3}}>Обработано заявок, подписано документов</div>
          </div>
          <ChevronRight size={16} style={{color:B.t3}}/>
        </button>
      </div>
    </Card>}

    {/* UNIFIED TASK HUB — срочные задачи (urgent/urgent_sign/expiring) */}
    {allMyTasks.length > 0 && <UnifiedTaskHub
      tasks={allMyTasks}
      onNavigate={navigateToTask}
      currentUser={currentUser}
    />}

    {/* UNIFIED TABLE — все остальные задачи (не приоритетные) из всех модулей */}
    {!batchMode && allMyTasks.length > 0 && (() => {
      // All non-priority tasks across all modules (pipeline + assignment + document)
      const tableTasks = allMyTasks.filter(t => !["urgent", "urgent_sign", "expiring"].includes(t.category));
      if (tableTasks.length === 0) return null;
      return <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-base font-black" style={{color: B.t1}}>Мои задачи в работе</h2>
          <span className="text-[11px] px-2 py-0.5 rounded-full font-bold"
            style={{background: B.accentL, color: B.accent}}>
            {tableTasks.length}
          </span>
        </div>
        <UnifiedTasksTable
          tasks={tableTasks}
          currentUser={currentUser}
          onNavigate={navigateToTask}
        />
      </div>;
    })()}

    {/* HERO TASK — глубже-гранулярный hero для конвейерных задач (только если нет cross-module задач) */}
    {allMyTasks.length === 0 && heroTask && filtered.length > 0 && !batchMode && !heroHidden && <HeroTaskCard
      task={heroTask}
      currentUser={currentUser}
      onOpen={onSelectReq}
      onSkip={()=>setSkippedHeroIds(prev => [...prev, heroTask.id])}
      onHideForever={hideHeroForever}
    />}

    {/* Signing progress */}
    {signingProgress && <Card className="p-5 mb-4" style={{background:B.greenL,borderColor:B.green+"40"}}>
      <div className="flex items-center gap-3 mb-2">
        <Loader2 size={18} style={{color:B.green}} className="animate-spin"/>
        <div className="flex-1">
          <div className="text-sm font-bold" style={{color:B.green}}>Пачечная подпись ЭЦП</div>
          <div className="text-xs" style={{color:B.t2}}>Подписано {signingProgress.done} из {signingProgress.total}</div>
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{background:"white"}}>
        <div className="h-full transition-all" style={{width:`${(signingProgress.done/signingProgress.total)*100}%`,background:B.green}}/>
      </div>
    </Card>}

    {/* Legacy sections — shown only in batch-mode (signer) for pachechny podpis workflow */}
    {batchMode && <>
    {/* Overdue section */}
    {overdueItems.length>0 && <div className="mb-5">
      <div className="flex items-center gap-2 mb-2 px-1">
        <AlertTriangle size={14} style={{color:B.red}}/>
        <span className="text-xs font-bold uppercase tracking-wider" style={{color:B.red}}>Требуют вашего внимания (SLA)</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{background:B.redL, color:B.red}}>{overdueItems.length}</span>
        <div className="flex-1 h-px" style={{background:B.red+"30"}}/>
      </div>
      <div className="space-y-1.5">
        {overdueItems.map((p, i) => {
          const keyIdx = (heroTask?1:0) + i;
          return <PipelineBatchRow key={p.id} req={p} checked={selectedIds.includes(p.id)} onToggle={()=>toggleSelect(p.id)}/>;
        })}
      </div>
    </div>}

    {/* In-work section */}
    {inWorkItems.length>0 && <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <Clock size={14} style={{color:B.t2}}/>
        <span className="text-xs font-bold uppercase tracking-wider" style={{color:B.t2}}>В работе</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{background:"#F1F5F9", color:B.t2}}>{inWorkItems.length}</span>
        <div className="flex-1 h-px" style={{background:B.border}}/>
      </div>
      <div className="space-y-1.5">
        {inWorkItems.map((p) => (
          <PipelineBatchRow key={p.id} req={p} checked={selectedIds.includes(p.id)} onToggle={()=>toggleSelect(p.id)}/>
        ))}
      </div>
    </div>}
    </>}

    {/* Batch sign confirm modal */}
    <Modal open={batchSignModal} onClose={()=>setBatchSignModal(false)} title="Подписание пачкой">
      <div className="space-y-4">
        <div className="p-3 rounded-xl" style={{background:"#F8FAFC"}}>
          <div className="text-xs font-bold mb-2" style={{color:B.t1}}>Вы подписываете {selectedIds.length} {selectedIds.length===1?"документ":"документов"} ЭЦП банка:</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {selectedIds.map(id => {
              const r = myData.find(p=>p.id===id);
              return r ? <div key={id} className="text-[11px]" style={{color:B.t2}}>• <span className="mono font-bold">{r.id}</span> — ген.договор · {r.company}</div> : null;
            })}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Введите PIN ЭЦП:</label>
          <input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)} placeholder="••••••"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={()=>setBatchSignModal(false)} className="flex-1">Отмена</Btn>
          <Btn onClick={runBatchSign} icon={Pen} className="flex-1" disabled={pinInput.length<4}>🔏 Подписать все</Btn>
        </div>
      </div>
    </Modal>

    {/* Hotkeys help modal */}
    <HotkeysHelp open={hotkeysHelpOpen} onClose={()=>setHotkeysHelpOpen(false)}/>

    {/* Hotkeys hint (floating) */}
    {filtered.length > 0 && !batchMode && <div className="fixed bottom-4 right-4 text-[10px] px-2 py-1 rounded z-40"
      style={{background: "rgba(15,23,42,0.85)", color: "white"}}>
      Нажмите <kbd className="px-1 bg-white/20 rounded mono">?</kbd> — хоткеи
    </div>}
  </div>;
}
function PipelineBatchRow({req, checked, onToggle}) {
  const tierInfo = TIER_LABELS[req.tier];
  const slaDays = getDaysOnStage(req);
  return <Card className="cursor-pointer transition-all hover:shadow-md" onClick={onToggle}
    style={checked ? {borderColor:B.accent,borderWidth:2,background:B.accentL+"20"} : {}}>
    <div className="flex items-center gap-3 px-4 py-3">
      <input type="checkbox" checked={checked} onChange={onToggle}
        className="w-4 h-4 shrink-0 cursor-pointer" onClick={e=>e.stopPropagation()}/>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="font-bold mono text-xs" style={{color:B.accent}}>{req.id}</span>
          {tierInfo && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{background:tierInfo.color+"15",color:tierInfo.color}}>{tierInfo.label}</span>}
          {req.requestedAmount && <span className="font-bold mono text-xs" style={{color:B.t1}}>{fmtByn(req.requestedAmount)}</span>}
        </div>
        <div className="text-xs font-medium truncate" style={{color:B.t1}}>{req.company||"—"}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[10px] mono font-semibold" style={{color:B.t2}}>{slaDays}д</div>
      </div>
    </div>
  </Card>;
}

// ─── "All pipeline" view (admin + browse mode) ───
// ─── UX REDESIGN: Filter chips, stage header, workflow health ───
function FilterChipsBar({stageFilter, setStageFilter, tierFilter, setTierFilter, roleFilter, setRoleFilter, overdueOnly, setOverdueOnly, favoritesOnly, setFavoritesOnly, search, setSearch, dateFilter, setDateFilter, favoritesCount, myActionOnly, setMyActionOnly}) {
  const chips = [];
  if (stageFilter !== "all") chips.push({key:"stage", label:`Этап: ${PIPELINE_STAGES.find(s=>s.id===stageFilter)?.label||stageFilter}`, onRemove:()=>setStageFilter("all"), color:B.accent});
  if (tierFilter !== "all") chips.push({key:"tier", label: tierFilter==="simple"?"≤50K":">50K", onRemove:()=>setTierFilter("all"), color:B.purple||"#8B5CF6"});
  if (roleFilter && roleFilter !== "all") chips.push({key:"role", label:`Роль: ${ROLE_ACCESS[roleFilter]?.label||roleFilter}`, onRemove:()=>setRoleFilter("all"), color:"#0891B2"});
  if (overdueOnly) chips.push({key:"overdue", label:"🔥 Только просроченные", onRemove:()=>setOverdueOnly(false), color:B.red});
  if (favoritesOnly) chips.push({key:"fav", label:`⭐ Избранные (${favoritesCount||0})`, onRemove:()=>setFavoritesOnly(false), color:B.yellow});
  if (myActionOnly) chips.push({key:"myaction", label:"👤 Только мои действия", onRemove:()=>setMyActionOnly(false), color:B.accent});
  if (search) chips.push({key:"search", label:`Поиск: «${search}»`, onRemove:()=>setSearch(""), color:B.t2});
  if (dateFilter && dateFilter !== "all") chips.push({key:"date", label: dateFilter==="today"?"Сегодня":"Эта неделя", onRemove:()=>setDateFilter("all"), color:B.accent});

  if (chips.length === 0) return null;

  const resetAll = () => {
    setStageFilter("all"); setTierFilter("all");
    if (setRoleFilter) setRoleFilter("all");
    setOverdueOnly(false);
    if (setFavoritesOnly) setFavoritesOnly(false);
    if (setMyActionOnly) setMyActionOnly(false);
    setSearch("");
    if (setDateFilter) setDateFilter("all");
  };

  return <Card className="p-3 mb-4" style={{background: B.accentL+"20", borderColor: B.accent+"40"}}>
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{color:B.t3}}>
        Активные фильтры:
      </span>
      {chips.map(chip => (
        <button key={chip.key} onClick={chip.onRemove}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold hover:opacity-80 transition-opacity"
          style={{background: chip.color+"15", color: chip.color, border:`1px solid ${chip.color}40`}}>
          {chip.label}
          <X size={10}/>
        </button>
      ))}
      <button onClick={resetAll} className="ml-auto text-[11px] font-semibold hover:underline shrink-0" style={{color:B.t2}}>
        Сбросить все
      </button>
    </div>
  </Card>;
}

function StageGroupHeader({stage, stageIdx, count, role, onDragOver, onDragLeave, onDrop, isAdmin}) {
  return <div className="flex items-center gap-3 mb-3 mt-5 px-2 py-2 rounded-lg transition-colors"
    onDragOver={isAdmin ? onDragOver : undefined}
    onDragLeave={isAdmin ? onDragLeave : undefined}
    onDrop={isAdmin ? onDrop : undefined}>
    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black"
      style={{background: stage.color, color: "white"}}>
      {stageIdx + 1}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-black uppercase tracking-wide" style={{color: B.t1}}>
          {stage.label}
        </span>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold"
          style={{background: stage.color+"15", color: stage.color}}>
          {count} {count === 1 ? "заявка" : count < 5 ? "заявки" : "заявок"}
        </span>
      </div>
      {role && role !== "system" && role !== "—" && <div className="text-[10px] mt-0.5" style={{color:B.t3}}>
        → {ROLE_ACCESS[role]?.icon} {ROLE_ACCESS[role]?.label}
      </div>}
    </div>
    <div className="flex-1 h-px" style={{background: stage.color + "30"}}/>
  </div>;
}

function WorkflowHealthBanner({pipelineData, onStageClick, activeStage}) {
  const OVERLOAD_THRESHOLD = 5;
  const stages = PIPELINE_STAGES.filter(s => !["rejected", "grey_zone", "active"].includes(s.id));

  const [expanded, setExpanded] = usePersistedState("pipeline-health-expanded", false, v => v === true || v === false || v === "true" || v === "false");
  // Coerce string "true"/"false" to boolean if loaded from older storage
  const expandedBool = typeof expanded === "string" ? expanded === "true" : expanded;
  const setExpandedBool = (v) => setExpanded(Boolean(v));

  const stats = stages.map(s => ({
    ...s,
    count: pipelineData.filter(p => p.stage === s.id).length,
    overdueCount: pipelineData.filter(p => p.stage === s.id && isOverdue(p)).length,
  }));

  const getLoad = (count) => count === 0 ? "empty" : count >= OVERLOAD_THRESHOLD ? "overload" : "normal";

  const totalCount = stats.reduce((s, st) => s + st.count, 0);
  const totalOverdue = stats.reduce((s, st) => s + st.overdueCount, 0);

  return <Card className="mb-5">
    <button onClick={()=>setExpandedBool(!expandedBool)}
      className="w-full flex items-center justify-between gap-3 p-3 hover:bg-slate-50 transition-colors text-left">
      <div className="flex items-center gap-2">
        {expandedBool ? <ChevronDown size={14} style={{color:B.t3}}/> : <ChevronRight size={14} style={{color:B.t3}}/>}
        <span className="text-sm font-bold" style={{color:B.t1}}>Воронка состояний</span>
        <span className="text-[10px]" style={{color:B.t3}}>
          · {totalCount} заявок в работе
          {totalOverdue > 0 && <span style={{color:B.red}}> · {totalOverdue} просрочек</span>}
        </span>
      </div>
      <span className="text-[10px]" style={{color:B.t3}}>{expandedBool?"Свернуть":"Развернуть"}</span>
    </button>

    {expandedBool && <div className="p-4 pt-0">
    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
      <div className="text-[10px]" style={{color: B.t3}}>Кликните на этап для фильтрации списка</div>
      <div className="flex items-center gap-3 text-[10px]" style={{color: B.t3}}>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{background:B.border}}/>Пусто</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{background:B.accent}}/>Норма</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{background:B.yellow}}/>≥{OVERLOAD_THRESHOLD} перегруз</div>
        <div className="flex items-center gap-1"><AlertTriangle size={10} style={{color:B.red}}/>Просрочки</div>
      </div>
    </div>

    <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
      {stats.map((s, idx) => {
        const load = getLoad(s.count);
        const color = load === "empty" ? B.border : load === "overload" ? B.yellow : B.accent;
        const bg = load === "empty" ? "#FAFAFA" : load === "overload" ? B.yellowL : B.accentL + "40";
        const isActive = activeStage === s.id;
        const hasOverdue = s.overdueCount > 0;
        const wordForm = s.count === 1 ? "заявка" : (s.count >= 2 && s.count <= 4) ? "заявки" : "заявок";

        return <React.Fragment key={s.id}>
          <button onClick={() => onStageClick(s.id)}
            className="relative flex-1 min-w-[120px] flex flex-col items-stretch rounded-xl overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5 text-left"
            style={{
              background: "white",
              border: isActive ? `2px solid ${color}` : `1px solid ${B.border}`,
            }}>
            {/* Top colored strip showing load level */}
            <div className="h-1" style={{background: color}}/>

            {/* Stage number pill top-right */}
            <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold mono"
              style={{background: "#F1F5F9", color: B.t3}}>
              {idx + 1}/{stats.length}
            </div>

            {/* Main count with explicit label */}
            <div className="px-3 pt-3 pb-1.5" style={{background: bg}}>
              <div className="flex items-baseline gap-1.5">
                <div className="text-2xl font-black leading-none" style={{color: load === "empty" ? B.t3 : color}}>
                  {s.count}
                </div>
                <div className="text-[9px] font-semibold" style={{color: B.t3}}>
                  {wordForm}
                </div>
              </div>
              {hasOverdue && <div className="flex items-center gap-1 mt-1.5">
                <AlertTriangle size={9} style={{color: B.red}} className="animate-pulse"/>
                <span className="text-[9px] font-bold" style={{color: B.red}}>
                  {s.overdueCount} просрочено
                </span>
              </div>}
            </div>

            {/* Stage label at bottom */}
            <div className="px-3 py-2 border-t flex-1" style={{borderColor: B.border}}>
              <div className="text-[10px] font-semibold leading-tight" style={{color: isActive ? color : B.t1}}>
                {s.label}
              </div>
            </div>
          </button>

          {/* Arrow between stages */}
          {idx < stats.length - 1 && <div className="flex items-center shrink-0 px-1" style={{color: B.t3}}>
            <ChevronRight size={18}/>
          </div>}
        </React.Fragment>;
      })}
    </div>
    </div>}
  </Card>;
}

// ─── UX REDESIGN: Hotkeys ───
function useKeyboardShortcuts({onNext, onPrev, onOpen, onToggleHelp, enabled}) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (typeof document !== "undefined" && document.querySelector("[data-modal-open]")) return;

      const key = e.key.toLowerCase();
      if (key === "j") { e.preventDefault(); onNext && onNext(); }
      else if (key === "k") { e.preventDefault(); onPrev && onPrev(); }
      else if (key === "o" || e.key === "Enter") { e.preventDefault(); onOpen && onOpen(); }
      else if (key === "?" || (e.shiftKey && e.key === "?")) { e.preventDefault(); onToggleHelp && onToggleHelp(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNext, onPrev, onOpen, onToggleHelp, enabled]);
}

function HotkeysHelp({open, onClose}) {
  if (!open) return null;
  const shortcuts = [
    {keys:["J"], desc:"Следующая заявка"},
    {keys:["K"], desc:"Предыдущая заявка"},
    {keys:["O"], desc:"Открыть выбранную"},
    {keys:["Enter"], desc:"Открыть выбранную"},
    {keys:["⌘","K"], desc:"Глобальный поиск"},
    {keys:["?"], desc:"Показать эту подсказку"},
    {keys:["Esc"], desc:"Закрыть модалку"},
  ];

  return <div onClick={onClose} data-modal-open
    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <Card onClick={e=>e.stopPropagation()} className="p-6 max-w-md w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold" style={{color:B.t1}}>Горячие клавиши</h3>
        <button onClick={onClose}><X size={16} style={{color:B.t3}}/></button>
      </div>
      <div className="space-y-2 text-sm">
        {shortcuts.map(({keys, desc}, i) => (
          <div key={i} className="flex items-center justify-between py-1">
            <span style={{color:B.t2}}>{desc}</span>
            <div className="flex items-center gap-1">
              {keys.map((k, j) => (
                <React.Fragment key={j}>
                  {j > 0 && <span className="text-xs" style={{color:B.t3}}>+</span>}
                  <kbd className="px-2 py-1 rounded bg-slate-100 border text-xs mono font-bold" style={{color:B.t1}}>
                    {k}
                  </kbd>
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-center mt-4" style={{color:B.t3}}>
        Нажмите <kbd className="px-1 py-0.5 rounded bg-slate-100 text-[9px]">Esc</kbd> или кликните вне для закрытия
      </div>
    </Card>
  </div>;
}

// ─── UX REDESIGN v2: Table view for pipeline (like Jira) ───
// ─── UnifiedTasksTable: cross-module task table (pipeline + assignments + documents) ───
function UnifiedTasksTable({tasks, onNavigate, currentUser}) {
  const [sortBy, setSortBy] = usePersistedState("table-sort-unified", {col: "sla", dir: "desc"});

  // Column picker — persist visible columns per user
  const ALL_COLUMNS = [
    {key: "type", label: "Тип", required: false, default: true},
    {key: "id", label: "ID", required: true, default: true},
    {key: "title", label: "Название", required: true, default: true},
    {key: "stage", label: "Этап / Фаза", required: false, default: true},
    {key: "sla", label: "SLA", required: false, default: true},
    {key: "action", label: "Действие", required: false, default: true},
  ];
  const [visibleCols, setVisibleCols] = usePersistedState("cols-unified",
    ALL_COLUMNS.filter(c => c.default).map(c => c.key));
  const [pickerOpen, setPickerOpen] = useState(false);
  const isVisible = (key) => visibleCols.includes(key);
  const toggleCol = (key) => {
    setVisibleCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const sorted = [...tasks].sort((a, b) => {
    const dir = sortBy.dir === "asc" ? 1 : -1;
    switch(sortBy.col) {
      case "type": return (a.type || "").localeCompare(b.type || "") * dir;
      case "id": return (a.id || "").localeCompare(b.id || "") * dir;
      case "title": return (a.title || "").localeCompare(b.title || "") * dir;
      case "stage": return (a.subtitle || "").localeCompare(b.subtitle || "") * dir;
      case "sla": return ((a.days||0) - (b.days||0)) * dir;
      case "action": return (a.action || "").localeCompare(b.action || "") * dir;
      default: return 0;
    }
  });

  // Pagination (25 per page)
  const PAGE_SIZE = 25;
  const {page, setPage, totalPages, slicedItems, total} = usePagination(sorted, PAGE_SIZE);

  const toggleSort = (col) => setSortBy(prev => ({
    col,
    dir: prev.col === col && prev.dir === "desc" ? "asc" : "desc",
  }));

  const SortableHeader = ({col, children, align="left"}) => (
    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none"
      style={{color: B.t3, textAlign: align}}
      onClick={()=>toggleSort(col)}>
      <div className="inline-flex items-center gap-1">
        {children}
        {sortBy.col === col && <span className="text-[10px]">{sortBy.dir==="desc"?"▼":"▲"}</span>}
      </div>
    </th>
  );

  const typeIconMap = {
    pipeline: Zap,
    assignment: Package,
    document: FileText,
  };
  const typeColorMap = {
    pipeline: B.accent,
    assignment: B.purple || "#7C3AED",
    document: "#6366F1",
  };
  const typeLabelMap = {
    pipeline: "Заявка",
    assignment: "Уступка",
    document: "Документ",
  };

  return <Card className="overflow-hidden relative">
    {/* Column picker button */}
    <div className="absolute top-2 right-2 z-10">
      <div className="relative">
        <button onClick={() => setPickerOpen(!pickerOpen)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border bg-white hover:bg-slate-50"
          style={{borderColor: B.border, color: B.t2}}>
          <Settings size={10}/>
          Колонки ({visibleCols.length})
        </button>
        {pickerOpen && <>
          <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)}/>
          <div className="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-lg p-2 border min-w-[200px]" style={{borderColor: B.border}}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5 px-2 pt-1" style={{color: B.t3}}>
              Видимые колонки
            </div>
            {ALL_COLUMNS.map(col => <label key={col.key}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] ${col.required ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-slate-50"}`}
              style={{color: B.t1}}>
              <input type="checkbox" checked={isVisible(col.key)} disabled={col.required}
                onChange={() => !col.required && toggleCol(col.key)}/>
              <span className="flex-1">{col.label}</span>
              {col.required && <span className="text-[9px]" style={{color: B.t3}}>всегда</span>}
            </label>)}
          </div>
        </>}
      </div>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead style={{background: "#F8FAFC"}}>
          <tr>
            {isVisible("type") && <SortableHeader col="type">Тип</SortableHeader>}
            {isVisible("id") && <SortableHeader col="id">ID</SortableHeader>}
            {isVisible("title") && <SortableHeader col="title">Название</SortableHeader>}
            {isVisible("stage") && <SortableHeader col="stage">Этап / Фаза</SortableHeader>}
            {isVisible("sla") && <SortableHeader col="sla" align="right">SLA</SortableHeader>}
            {isVisible("action") && <SortableHeader col="action">Действие</SortableHeader>}
            <th className="px-2"></th>
          </tr>
        </thead>
        <tbody>
          {slicedItems.map(t => {
            const TypeIcon = typeIconMap[t.type] || FileText;
            const typeColor = typeColorMap[t.type] || B.t2;
            const typeLabel = typeLabelMap[t.type] || t.type;
            return <tr key={`${t.type}-${t.id}`}
              onClick={()=>onNavigate && onNavigate(t)}
              className="border-t hover:bg-blue-50 cursor-pointer transition-colors"
              style={{borderColor: B.border, background: t.overdue ? "#FEF2F2" : "white"}}>
              {isVisible("type") && <td className="px-3 py-2">
                <div className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold"
                  style={{background: typeColor+"15", color: typeColor}}>
                  <TypeIcon size={10}/>
                  {typeLabel}
                </div>
              </td>}
              {isVisible("id") && <td className="px-3 py-2 mono font-semibold" style={{color: typeColor}}>{t.id}</td>}
              {isVisible("title") && <td className="px-3 py-2">
                <div className="font-semibold truncate max-w-[260px]" style={{color: B.t1}}>{t.title || "—"}</div>
              </td>}
              {isVisible("stage") && <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold"
                  style={{background: (t.color||B.t2)+"15", color: t.color||B.t2}}>
                  {t.subtitle || "—"}
                </span>
              </td>}
              {isVisible("sla") && <td className="px-3 py-2 text-right">
                <span className="mono font-bold" style={{color: t.overdue ? B.red : t.days > (t.limit||1)*0.66 ? B.yellow : B.t2}}>
                  {t.days != null ? `${t.days}д` : "—"}{t.limit ? ` / ${t.limit}` : ""}
                </span>
              </td>}
              {isVisible("action") && <td className="px-3 py-2 text-[11px]" style={{color: B.t2}}>
                {t.action || "—"}
              </td>}
              <td className="px-2 py-2 text-right">
                <ChevronRight size={14} style={{color: B.t3}}/>
              </td>
            </tr>;
          })}
          {total === 0 && <tr>
            <td colSpan={visibleCols.length + 1}>
              <EmptyState icon={CheckCircle} title="Все задачи закрыты"
                subtitle="У вас нет активных задач. Новые появятся здесь автоматически когда поступят."/>
            </td>
          </tr>}
        </tbody>
      </table>
    </div>
    <Pagination page={page} setPage={setPage} totalPages={totalPages} total={total} pageSize={PAGE_SIZE}/>
  </Card>;
}

function PipelineTableView({items, currentUser, onSelectReq, favorites, toggleFavorite, onCyclePriority, setToast, batchMode, batchSelected = [], toggleBatch}) {
  const [sortBy, setSortBy] = usePersistedState("table-sort-pipeline", {col: "sla", dir: "desc"});

  const sorted = [...items].sort((a, b) => {
    const dir = sortBy.dir === "asc" ? 1 : -1;
    switch(sortBy.col) {
      case "id": return a.id.localeCompare(b.id) * dir;
      case "company": return (a.company||"").localeCompare(b.company||"") * dir;
      case "amount": return ((a.requestedAmount||0) - (b.requestedAmount||0)) * dir;
      case "stage": {
        const ai = PIPELINE_STAGES.findIndex(s => s.id === a.stage);
        const bi = PIPELINE_STAGES.findIndex(s => s.id === b.stage);
        return (ai - bi) * dir;
      }
      case "sla": return (getDaysOnStage(a) - getDaysOnStage(b)) * dir;
      case "priority": {
        const pri = {high:0, medium:1, low:2};
        return ((pri[a.priority]??1) - (pri[b.priority]??1)) * dir;
      }
      case "created": return (new Date(a.created) - new Date(b.created)) * dir;
      default: return 0;
    }
  });

  // Pagination (25 per page)
  const PAGE_SIZE = 25;
  const {page, setPage, totalPages, slicedItems, total} = usePagination(sorted, PAGE_SIZE);

  const toggleSort = (col) => setSortBy(prev => ({
    col,
    dir: prev.col === col && prev.dir === "desc" ? "asc" : "desc",
  }));

  const SortableHeader = ({col, children, align="left"}) => (
    <th className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none`}
      style={{color: B.t3, textAlign: align}}
      onClick={()=>toggleSort(col)}>
      <div className="inline-flex items-center gap-1">
        {children}
        {sortBy.col === col && <span className="text-[10px]">{sortBy.dir==="desc"?"▼":"▲"}</span>}
      </div>
    </th>
  );

  const exportToCsv = () => {
    const rows = [
      ["ID", "Клиент", "УНП", "Сумма", "Класс", "Этап", "Дней", "SLA", "Приоритет", "Создано"],
      ...sorted.map(r => [
        r.id, r.company, r.unp, r.requestedAmount,
        r.scoringClass || "", PIPELINE_STAGES.find(s=>s.id===r.stage)?.label || r.stage,
        getDaysOnStage(r), getSlaLimit(r.stage, r.tier),
        r.priority, r.created,
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${v ?? ""}"`).join(";")).join("\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pipeline-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (setToast) setToast({msg: "CSV экспортирован", type: "success"});
    } catch(e) {
      if (setToast) setToast({msg: "Ошибка экспорта", type: "error"});
    }
  };

  return <Card className="overflow-hidden">
    <div className="flex items-center justify-between p-3 border-b" style={{borderColor: B.border}}>
      <div className="text-xs" style={{color: B.t2}}>
        Показано: <strong style={{color: B.t1}}>{sorted.length}</strong> {sorted.length===1?"заявка":sorted.length<5?"заявки":"заявок"}
      </div>
      <Btn size="sm" variant="ghost" icon={Download} onClick={exportToCsv}>
        Экспорт в CSV
      </Btn>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            {batchMode && <th className="w-8 px-2 py-2">
              <input type="checkbox"
                checked={slicedItems.length > 0 && slicedItems.every(r => batchSelected.includes(r.id))}
                onChange={e => {
                  e.stopPropagation();
                  if (e.target.checked) {
                    slicedItems.forEach(r => { if (!batchSelected.includes(r.id)) toggleBatch && toggleBatch(r.id); });
                  } else {
                    slicedItems.forEach(r => { if (batchSelected.includes(r.id)) toggleBatch && toggleBatch(r.id); });
                  }
                }}
                className="w-3.5 h-3.5"/>
            </th>}
            <th className="w-8 px-2 py-2"></th>
            <SortableHeader col="id">ID</SortableHeader>
            <SortableHeader col="company">Клиент</SortableHeader>
            <SortableHeader col="amount" align="right">Сумма</SortableHeader>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-center" style={{color: B.t3}}>Класс</th>
            <SortableHeader col="stage">Этап</SortableHeader>
            <SortableHeader col="sla" align="right">SLA</SortableHeader>
            <SortableHeader col="priority">Приор.</SortableHeader>
            <SortableHeader col="created">Создано</SortableHeader>
            <th className="w-8 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {slicedItems.map(r => {
            const stage = PIPELINE_STAGES.find(s => s.id === r.stage);
            const days = getDaysOnStage(r);
            const limit = getSlaLimit(r.stage, r.tier);
            const isOver = isOverdue(r);
            const isFav = (favorites||[]).includes(r.id);
            const scColor = (r.scoringClass==="A"||r.scoringClass==="AA") ? B.green
              : (r.scoringClass==="B"||r.scoringClass==="BB") ? B.yellow : B.red;
            const scBg = (r.scoringClass==="A"||r.scoringClass==="AA") ? B.greenL
              : (r.scoringClass==="B"||r.scoringClass==="BB") ? B.yellowL : B.redL;

            return <tr key={r.id}
              onClick={(e) => {
                if (batchMode) { e.stopPropagation(); toggleBatch && toggleBatch(r.id); return; }
                onSelectReq(r);
              }}
              className="border-t hover:bg-blue-50 cursor-pointer transition-colors"
              style={{borderColor: B.border, background: batchSelected.includes(r.id) ? B.accentL + "60" : isOver ? "#FEF2F2" : "white"}}>
              {batchMode && <td className="w-8 px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={batchSelected.includes(r.id)}
                  onChange={() => toggleBatch && toggleBatch(r.id)} className="w-3.5 h-3.5"/>
              </td>}
              <td className="px-2 py-2 text-center">
                <button onClick={(e)=>{e.stopPropagation(); toggleFavorite && toggleFavorite(r.id)}}>
                  <Star size={12} fill={isFav ? B.yellow : "none"} style={{color: isFav ? B.yellow : B.t3}}/>
                </button>
              </td>
              <td className="px-3 py-2 mono font-semibold" style={{color: B.accent}}>{r.id}</td>
              <td className="px-3 py-2">
                <div className="font-semibold" style={{color: B.t1}}>{r.company}</div>
                <div className="text-[10px] mono" style={{color: B.t3}}>УНП {r.unp}</div>
              </td>
              <td className="px-3 py-2 text-right mono font-bold" style={{color: B.t1}}>
                {r.requestedAmount ? fmtByn(r.requestedAmount) : "—"}
              </td>
              <td className="px-3 py-2 text-center">
                {r.scoringClass && <span className="px-1.5 py-0.5 rounded text-[10px] font-black"
                  style={{background: scBg, color: scColor}}>
                  {r.scoringClass}
                </span>}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: stage?.color}}/>
                  <span style={{color: B.t1}}>{stage?.label}</span>
                  {r.stage === "analyst_verification" && !r.analystTakenBy && <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-black animate-pulse"
                    style={{background: B.accent, color: "white"}}>
                    📥 НОВАЯ
                  </span>}
                </div>
              </td>
              <td className="px-3 py-2 text-right">
                <span className="mono font-bold" style={{color: isOver ? B.red : days > limit*0.66 ? B.yellow : B.t2}}>
                  {days}д / {limit}
                </span>
              </td>
              <td className="px-3 py-2">
                <button onClick={(e)=>{e.stopPropagation(); onCyclePriority && onCyclePriority(r.id)}}
                  className="flex items-center justify-center">
                  <PriorityDot priority={r.priority}/>
                </button>
              </td>
              <td className="px-3 py-2 text-[10px]" style={{color: B.t3}}>{r.created}</td>
              <td className="px-2 py-2 text-right">
                <ChevronRight size={14} style={{color: B.t3}}/>
              </td>
            </tr>;
          })}
          {total === 0 && <tr>
            <td colSpan={10}>
              <EmptyState icon={Inbox} title="Заявки не найдены"
                subtitle="Попробуйте изменить фильтры или поисковый запрос"/>
            </td>
          </tr>}
        </tbody>
      </table>
    </div>
    <Pagination page={page} setPage={setPage} totalPages={totalPages} total={total} pageSize={PAGE_SIZE}/>
  </Card>;
}

function AllPipelineView({currentUser, pipelineData, stageFilter, setStageFilter, roleFilter, setRoleFilter, tierFilter, setTierFilter, search, setSearch, overdueOnly, setOverdueOnly, onSelectReq, onCyclePriority, onSwitchToMy, viewMode, favorites, toggleFavorite, favoritesOnly, setFavoritesOnly, setPipelineData, setToast}) {
  const isAdmin = currentUser.role === "admin";
  const [dateFilter, setDateFilter] = useState("all");
  const [moveConfirmModal, setMoveConfirmModal] = useState(null);

  // Bulk-operations state — toggle, select, action
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState([]);
  const [batchActionModal, setBatchActionModal] = useState(null); // "reject" | "pass_lpr" | null
  const [batchReason, setBatchReason] = useState("");
  const toggleBatch = (id) => setBatchSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const clearBatch = () => { setBatchSelected([]); setBatchMode(false); };

  const executeBatchAction = (action) => {
    const count = batchSelected.length;
    if (count === 0) return;
    if (action === "reject") {
      setPipelineData(prev => prev.map(p => batchSelected.includes(p.id)
        ? {...p, stage: "rejected", rejectReason: batchReason, rejectDate: "2026-03-26", rejectedBy: currentUser.name}
        : p));
      setToast && setToast({msg: `${count} заявок отклонено`, type: "success"});
    } else if (action === "pass_lpr") {
      setPipelineData(prev => prev.map(p => batchSelected.includes(p.id) && p.stage === "analyst_verification"
        ? {...p, stage: "lpr_decision"}
        : p));
      setToast && setToast({msg: `${count} заявок передано ЛПР`, type: "success"});
    }
    setBatchActionModal(null);
    setBatchReason("");
    clearBatch();
  };

  const [viewLayout, setViewLayout] = useState(() => {
    // Default: table for everyone (per customer feedback — simple object-model-first approach)
    try {
      const saved = sessionStorage.getItem("pipeline-view-layout");
      return saved || "table";
    } catch(e) { return "table"; }
  });
  // Persist layout choice
  useEffect(() => {
    try { sessionStorage.setItem("pipeline-view-layout", viewLayout); } catch(e) {}
  }, [viewLayout]);
  const [myActionOnly, setMyActionOnly] = useState(false);

  const active = pipelineData.filter(p=>p.stage!=="rejected"&&p.stage!=="grey_zone"&&p.stage!=="active");
  const rejectedCount = pipelineData.filter(p=>p.stage==="rejected").length;
  const greyCount = pipelineData.filter(p=>p.stage==="grey_zone").length;
  const overdueCount = pipelineData.filter(isOverdue).length;

  const filtered = pipelineData.filter(p=>{
    // Active deals (approved factoring limits) belong to "Клиенты" module, not to the pipeline.
    // Only show them if user explicitly filters by stage=active (admin debug case).
    if(p.stage === "active" && stageFilter !== "active") return false;
    if(myActionOnly) {
      const myStages = getMyStages(currentUser);
      if (myStages !== null && !myStages.includes(p.stage)) return false;
    }
    if(overdueOnly && !isOverdue(p)) return false;
    if(favoritesOnly && !(favorites||[]).includes(p.id)) return false;
    if(stageFilter!=="all" && p.stage!==stageFilter) return false;
    if(roleFilter!=="all"){
      const stage = PIPELINE_STAGES.find(s=>s.id===p.stage);
      if(!stage||stage.role!==roleFilter) return false;
    }
    if(tierFilter!=="all"&&p.tier!==tierFilter) return false;
    if(search){const q=search.toLowerCase(); if(!(p.id.toLowerCase().includes(q)||(p.company||"").toLowerCase().includes(q)||(p.unp||"").includes(q))) return false}
    if(dateFilter !== "all") {
      const created = new Date(p.created);
      const now = new Date("2026-03-26");
      const daysAgo = Math.floor((now - created) / 86400000);
      if(dateFilter === "today" && daysAgo > 0) return false;
      if(dateFilter === "week" && daysAgo > 7) return false;
    }
    return true;
  });

  const stageOrder = PIPELINE_STAGES.map(s=>s.id);
  const groups = stageOrder.map(sid=>{
    const items = filtered.filter(p=>p.stage===sid);
    items.sort((a,b) => {
      const aO = isOverdue(a), bO = isOverdue(b);
      if (aO && !bO) return -1;
      if (!aO && bO) return 1;
      return getDaysOnStage(b) - getDaysOnStage(a);
    });
    return {stage: PIPELINE_STAGES.find(s=>s.id===sid), items};
  }).filter(g=>g.items.length>0);

  // Drag & drop handlers
  const handleDragStart = (e, reqId) => {
    if (!isAdmin) return;
    e.dataTransfer.setData("text/plain", reqId);
    e.currentTarget.style.opacity = "0.5";
  };
  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = "1";
  };
  const handleStageDragOver = (e, color) => {
    e.preventDefault();
    e.currentTarget.style.background = color + "20";
  };
  const handleStageDragLeave = (e) => {
    e.currentTarget.style.background = "transparent";
  };
  const handleStageDrop = (e, newStageId) => {
    e.preventDefault();
    e.currentTarget.style.background = "transparent";
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    const req = pipelineData.find(p => p.id === draggedId);
    if (!req || req.stage === newStageId) return;
    setMoveConfirmModal({req, newStageId});
  };

  const confirmMove = () => {
    if (!moveConfirmModal) return;
    const {req, newStageId} = moveConfirmModal;
    if (setPipelineData) {
      setPipelineData(prev => prev.map(p =>
        p.id === req.id
          ? {
              ...p,
              stage: newStageId,
              stageStartDate: "2026-03-26",
              history: [
                ...(p.history || []),
                {
                  action: "manual_move",
                  user: currentUser.name,
                  userRole: "admin",
                  date: "2026-03-26 12:00",
                  comment: `Переведено с «${PIPELINE_STAGES.find(s=>s.id===p.stage)?.label}» на «${PIPELINE_STAGES.find(s=>s.id===newStageId)?.label}» вручную`,
                },
              ],
            }
          : p
      ));
    }
    if (setToast) setToast({msg: `Заявка ${req.id} перемещена`, type: "success"});
    setMoveConfirmModal(null);
  };

  return <div>
    <PageHeader title="Кредитный конвейер" breadcrumbs={["Кредитный конвейер"]}
      actions={<div className="flex items-center gap-2">
        <ExportButton filename="konveyer" setToast={setToast}
          columns={[
            {key: "id", label: "ID"},
            {key: "company", label: "Клиент"},
            {key: "unp", label: "УНП"},
            {key: "stage", label: "Этап", formatter: r => PIPELINE_STAGES.find(s => s.id === r.stage)?.label || r.stage},
            {key: "requestedAmount", label: "Сумма", formatter: r => r.requestedAmount || 0},
            {key: "scoringClass", label: "Скоринг класс"},
            {key: "scoringTotal", label: "Балл"},
            {key: "created", label: "Создана"},
            {key: "priority", label: "Приоритет"},
          ]}
          rows={filtered}/>
        <TerminologyHelp/>
      </div>}/>

    {/* View mode + Layout switcher */}
    <div className="flex items-center gap-3 mb-5 flex-wrap">
      {onSwitchToMy && <div className="flex items-center gap-2">
        <button onClick={onSwitchToMy} className="flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-xs border hover:bg-slate-50" style={{borderColor:B.border, color:B.t2}}>
          <Inbox size={14}/>Моя очередь
        </button>
        <button className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs" style={{background:B.accent, color:"white"}}>
          <GitBranch size={14}/>Весь конвейер
        </button>
      </div>}

      <div className="flex items-center gap-1 p-1 rounded-lg border bg-white ml-auto" style={{borderColor:B.border}}>
        {[
          {id:"table", icon:"📋", label:"Таблица"},
          {id:"cards", icon:"🧩", label:"Карточки"},
          {id:"groups", icon:"📊", label:"Группы"},
        ].map(m => (
          <button key={m.id} onClick={()=>setViewLayout(m.id)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
            style={viewLayout===m.id
              ? {background:B.accent, color:"white"}
              : {color:B.t2}}>
            <span>{m.icon}</span>{m.label}
          </button>
        ))}
      </div>
    </div>

    {/* Search bar in header (wide) */}
    <div className="mb-4">
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{color:B.t3}}/>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Найти заявку: REQ-007, СтройАктив, 290345678..."
          className="w-full pl-12 pr-10 py-3 rounded-xl border text-sm transition-all"
          style={{borderColor: search ? B.accent : B.border, background:"white", color:B.t1}}/>
        {search && <button onClick={()=>setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2">
          <X size={14} style={{color:B.t3}}/>
        </button>}
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {[{id:"all",label:"Всё время"},{id:"today",label:"Сегодня"},{id:"week",label:"Эта неделя"}].map(f =>
          <button key={f.id} onClick={()=>setDateFilter(f.id)}
            className="text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors"
            style={dateFilter===f.id?{background:B.accent,color:"white"}:{background:"#F1F5F9",color:B.t2}}>
            {f.label}
          </button>
        )}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border" style={{borderColor:B.border}}>
          <span className="text-[10px] font-semibold" style={{color:B.t3}}>Порог:</span>
          {[{id:"all",label:"Все"},{id:"simple",label:"≤50K"},{id:"extended",label:">50K"}].map(t =>
            <button key={t.id} onClick={()=>setTierFilter(t.id)} className="px-2 py-0.5 rounded text-[10px] font-bold"
              style={tierFilter===t.id?{background:B.accent, color:"white"}:{color:B.t2}}>{t.label}</button>
          )}
        </div>
        {(favorites||[]).length > 0 && <button onClick={()=>setFavoritesOnly(!favoritesOnly)}
          className="text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors flex items-center gap-1"
          style={favoritesOnly?{background:B.yellow,color:"white"}:{background:B.yellowL,color:B.yellow}}>
          <Star size={10} fill={favoritesOnly ? "white" : B.yellow}/>
          Избранные ({(favorites||[]).length})
        </button>}
        <button onClick={()=>setMyActionOnly(!myActionOnly)}
          className="text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors flex items-center gap-1"
          style={myActionOnly?{background:B.accent,color:"white"}:{background:B.accentL,color:B.accent}}>
          <User size={10}/>
          Требует моей реакции
        </button>
      </div>
    </div>

    {/* Role switcher (for admin) */}
    {isAdmin && <RoleSwitcher currentRole={roleFilter} onChange={setRoleFilter}/>}

    {/* Workflow health (admin only) */}
    {isAdmin && <WorkflowHealthBanner
      pipelineData={pipelineData}
      onStageClick={(sid) => setStageFilter(stageFilter === sid ? "all" : sid)}
      activeStage={stageFilter !== "all" ? stageFilter : null}
    />}

    {/* Overdue alert banner */}
    {overdueCount>0 && <Card className="p-4 mb-4" style={{background:B.redL, borderColor:"#FECACA"}}>
      <div className="flex items-center gap-3">
        <AlertTriangle size={20} style={{color:B.red}} className="shrink-0"/>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{color:B.red}}>{overdueCount} {overdueCount===1?"заявка просрочила":"заявки просрочили"} SLA</div>
          <div className="text-xs" style={{color:B.t2}}>Требуется срочное внимание</div>
        </div>
        <button onClick={()=>setOverdueOnly(!overdueOnly)} className="px-3 py-1.5 rounded-lg text-xs font-bold"
          style={overdueOnly?{background:B.red, color:"white"}:{background:"white", color:B.red, border:`1px solid ${B.red}`}}>
          {overdueOnly?"✓ Только просроченные":"Показать только просроченные"}
        </button>
      </div>
    </Card>}

    {/* KPI strip — clickable filters */}
    <div className="grid grid-cols-4 gap-3 mb-4">
      <button onClick={()=>setStageFilter("all")} className="text-left">
        <Card className="p-3 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer" style={stageFilter==="all"?{borderColor:B.accent,borderWidth:2}:{}}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background:B.accentL}}><Zap size={16} style={{color:B.accent}}/></div>
            <div className="min-w-0">
              <div className="text-[10px]" style={{color:B.t3}}>В работе</div>
              <div className="text-lg font-black" style={{color:B.t1}}>{active.length}</div>
            </div>
          </div>
        </Card>
      </button>
      <button onClick={()=>setOverdueOnly(!overdueOnly)} className="text-left">
        <Card className="p-3 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
          style={overdueOnly?{borderColor:B.red,borderWidth:2}:{}}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background:B.redL}}>
              <AlertTriangle size={16} style={{color:B.red}}/>
            </div>
            <div className="min-w-0">
              <div className="text-[10px]" style={{color:B.t3}}>Просрочено SLA</div>
              <div className="text-lg font-black" style={{color: overdueCount>0 ? B.red : B.t3}}>{overdueCount}</div>
            </div>
          </div>
        </Card>
      </button>
      <button onClick={()=>setStageFilter("grey_zone")} className="text-left">
        <Card className="p-3 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer" style={stageFilter==="grey_zone"?{borderColor:"#6B7280",borderWidth:2}:{}}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background:"#F3F4F6"}}><AlertCircle size={16} style={{color:"#6B7280"}}/></div>
            <div className="min-w-0">
              <div className="text-[10px]" style={{color:B.t3}}>Серая зона</div>
              <div className="text-lg font-black" style={{color:"#6B7280"}}>{greyCount}</div>
            </div>
          </div>
        </Card>
      </button>
      <button onClick={()=>setStageFilter("rejected")} className="text-left">
        <Card className="p-3 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer" style={stageFilter==="rejected"?{borderColor:B.red,borderWidth:2}:{}}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background:B.redL}}><XCircle size={16} style={{color:B.red}}/></div>
            <div className="min-w-0">
              <div className="text-[10px]" style={{color:B.t3}}>Отклонено</div>
              <div className="text-lg font-black" style={{color:B.red}}>{rejectedCount}</div>
            </div>
          </div>
        </Card>
      </button>
    </div>

    {/* Active filter chips */}
    <FilterChipsBar
      stageFilter={stageFilter} setStageFilter={setStageFilter}
      tierFilter={tierFilter} setTierFilter={setTierFilter}
      roleFilter={roleFilter} setRoleFilter={setRoleFilter}
      overdueOnly={overdueOnly} setOverdueOnly={setOverdueOnly}
      favoritesOnly={favoritesOnly} setFavoritesOnly={setFavoritesOnly}
      search={search} setSearch={setSearch}
      dateFilter={dateFilter} setDateFilter={setDateFilter}
      favoritesCount={(favorites||[]).length}
      myActionOnly={myActionOnly} setMyActionOnly={setMyActionOnly}
    />

    {/* Batch toolbar — only visible when batchMode on */}
    {(isAdmin || currentUser.role === "analyst") && <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg" style={{background: batchMode ? B.accentL : "#F8FAFC", border: `1px solid ${batchMode ? B.accent + "40" : B.border}`}}>
      <div className="flex items-center gap-2">
        <button onClick={() => {setBatchMode(!batchMode); if (batchMode) clearBatch();}}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold"
          style={{background: batchMode ? B.accent : "white", color: batchMode ? "white" : B.t2, border: `1px solid ${batchMode ? B.accent : B.border}`}}>
          {batchMode ? <XCircle size={12}/> : <CheckCircle size={12}/>}
          {batchMode ? "Выйти из множественного режима" : "Режим выделения (bulk)"}
        </button>
        {batchMode && <span className="text-[11px]" style={{color: B.t2}}>
          Выбрано: <strong style={{color: B.accent}}>{batchSelected.length}</strong> из {filtered.length}
        </span>}
      </div>
      {batchMode && batchSelected.length > 0 && <div className="flex items-center gap-2">
        <Btn size="sm" variant="ghost" onClick={() => setBatchSelected(filtered.map(f => f.id))}>Выбрать всё</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setBatchSelected([])}>Снять выделение</Btn>
        <Btn size="sm" variant="secondary" icon={ArrowRight} onClick={() => setBatchActionModal("pass_lpr")}>
          Передать ЛПР ({batchSelected.length})
        </Btn>
        <Btn size="sm" variant="danger" icon={XCircle} onClick={() => setBatchActionModal("reject")}>
          Отклонить ({batchSelected.length})
        </Btn>
      </div>}
    </div>}

    {/* Layout: table / flat cards / groups */}
    {viewLayout === "table" && <PipelineTableView
      items={filtered}
      currentUser={currentUser}
      onSelectReq={onSelectReq}
      favorites={favorites}
      toggleFavorite={toggleFavorite}
      onCyclePriority={onCyclePriority}
      setToast={setToast}
      batchMode={batchMode}
      batchSelected={batchSelected}
      toggleBatch={toggleBatch}
    />}

    {/* Batch action confirmation modal */}
    {batchActionModal === "reject" && <Modal open={true} onClose={() => setBatchActionModal(null)} title={`Массовое отклонение (${batchSelected.length})`}>
      <div className="space-y-3">
        <div className="p-3 rounded-lg flex items-start gap-2" style={{background: B.redL, borderLeft: `3px solid ${B.red}`}}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{color: B.red}}/>
          <div className="text-[11px]" style={{color: B.t1}}>
            <strong>Необратимое действие:</strong> все {batchSelected.length} заявок получат статус «Отклонено». Клиенты получат уведомления.
          </div>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{color: B.t2}}>Общая причина отклонения *</label>
          <textarea value={batchReason} onChange={e => setBatchReason(e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200"
            placeholder="Например: дублирующие заявки, данные неактуальны..."/>
        </div>
        <div className="p-2 rounded text-[10px]" style={{background: "#F8FAFC", color: B.t3}}>
          Будет отклонено <strong style={{color: B.red}}>{batchSelected.length}</strong> заявок. Причина будет добавлена в каждую.
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setBatchActionModal(null)} className="flex-1">Отмена</Btn>
          <Btn variant="danger" onClick={() => executeBatchAction("reject")} disabled={!batchReason.trim() || batchReason.trim().length < 5} className="flex-1">
            Отклонить {batchSelected.length} заявок
          </Btn>
        </div>
      </div>
    </Modal>}

    {batchActionModal === "pass_lpr" && <Modal open={true} onClose={() => setBatchActionModal(null)} title={`Передать ${batchSelected.length} заявок ЛПР?`}>
      <div className="space-y-3">
        <div className="text-xs" style={{color: B.t2}}>
          Только заявки на этапе «Верификация аналитика» будут переданы ЛПР. Прочие будут пропущены.
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setBatchActionModal(null)} className="flex-1">Отмена</Btn>
          <Btn variant="primary" onClick={() => executeBatchAction("pass_lpr")} className="flex-1">
            Передать ЛПР
          </Btn>
        </div>
      </div>
    </Modal>}

    {viewLayout === "cards" && batchMode && <Card className="p-3 mb-3" style={{background: B.yellowL, borderColor: B.yellow + "40"}}>
      <div className="flex items-center gap-2 text-xs" style={{color: B.t2}}>
        <Info size={14} style={{color: B.yellow}}/>
        <span>Массовое выделение доступно только в режиме «Таблица». Переключитесь, чтобы выбирать несколько заявок.</span>
      </div>
    </Card>}

    {viewLayout === "cards" && (filtered.length===0
      ? <EmptyState icon={Inbox} title="Заявки не найдены" subtitle="Попробуйте изменить фильтры или поисковый запрос"/>
      : <div className="space-y-1.5">
          {filtered.slice().sort((a,b) => {
            const aO = isOverdue(a), bO = isOverdue(b);
            if (aO && !bO) return -1;
            if (!aO && bO) return 1;
            return getDaysOnStage(b) - getDaysOnStage(a);
          }).map(p => <PipelineCard
            key={p.id} req={p}
            onClick={()=>onSelectReq(p)}
            onCyclePriority={onCyclePriority}
            showOverdueVisual={true}
            isFavorite={(favorites||[]).includes(p.id)}
            onToggleFavorite={toggleFavorite}
            isAdmin={isAdmin}
          />)}
        </div>
    )}

    {viewLayout === "groups" && (groups.length===0
      ? <EmptyState icon={Inbox} title="Заявки не найдены" subtitle="Попробуйте изменить фильтры или поисковый запрос"/>
      : <div className="space-y-1">{groups.map(g => {
          const stageIdx = stageOrder.indexOf(g.stage.id);
          const isGreyGroup = g.stage.id === "grey_zone";
          const isRejectedGroup = g.stage.id === "rejected";
          const isSpecial = isGreyGroup || isRejectedGroup;

          if (isSpecial) {
            const specColor = isGreyGroup ? "#6B7280" : B.red;
            const specBg = isGreyGroup ? "#F9FAFB" : "#FEF2F2";
            return <Card key={g.stage.id} className="p-4 mb-3" style={{background: specBg, border: `2px dashed ${specColor}`}}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-black"
                  style={{background: specColor, color: "white"}}>
                  {isGreyGroup ? "⚪" : "✗"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black uppercase tracking-wide" style={{color: isGreyGroup ? "#374151" : B.red}}>
                    {g.stage.label}
                  </div>
                  <div className="text-[10px]" style={{color: B.t3}}>
                    {isGreyGroup ? "Пограничные клиенты — ждут реанимации аналитиком" : "Окончательно отклонённые заявки"}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-black shrink-0"
                  style={{background: specColor, color: "white"}}>{g.items.length}</span>
              </div>
              <div className="space-y-1.5">
                {g.items.map(p => <PipelineCard
                  key={p.id} req={p}
                  onClick={()=>onSelectReq(p)}
                  onCyclePriority={onCyclePriority}
                  showOverdueVisual={false}
                  isFavorite={(favorites||[]).includes(p.id)}
                  onToggleFavorite={toggleFavorite}
                  isAdmin={isAdmin}
                />)}
              </div>
            </Card>;
          }

          return <div key={g.stage.id}>
            <StageGroupHeader stage={g.stage} stageIdx={stageIdx} count={g.items.length} role={g.stage.role}
              isAdmin={isAdmin}
              onDragOver={(e)=>handleStageDragOver(e, g.stage.color)}
              onDragLeave={handleStageDragLeave}
              onDrop={(e)=>handleStageDrop(e, g.stage.id)}
            />
            <div className="space-y-1.5">
              {g.items.map(p => <PipelineCard
                key={p.id} req={p}
                onClick={()=>onSelectReq(p)}
                onCyclePriority={onCyclePriority}
                showOverdueVisual={true}
                isFavorite={(favorites||[]).includes(p.id)}
                onToggleFavorite={toggleFavorite}
                isAdmin={isAdmin}
                draggable={isAdmin}
                onDragStart={(e)=>handleDragStart(e, p.id)}
                onDragEnd={handleDragEnd}
              />)}
            </div>
          </div>;
        })}</div>
    )}

    {/* Drag&drop confirmation modal */}
    <Modal open={!!moveConfirmModal} onClose={()=>setMoveConfirmModal(null)} title="Переместить заявку">
      <div className="space-y-4">
        <div className="text-sm" style={{color:B.t2}}>
          Вы хотите переместить <strong className="mono" style={{color:B.accent}}>{moveConfirmModal?.req.id}</strong> ({moveConfirmModal?.req.company})<br/>
          с этапа «{PIPELINE_STAGES.find(s=>s.id===moveConfirmModal?.req.stage)?.label}»<br/>
          на этап «<strong>{PIPELINE_STAGES.find(s=>s.id===moveConfirmModal?.newStageId)?.label}</strong>»?
        </div>
        <div className="text-[11px] p-2 rounded-lg flex items-start gap-1.5" style={{background:B.yellowL, color:B.yellow}}>
          <AlertTriangle size={11} className="shrink-0 mt-0.5"/>
          <span>Это действие записывается в журнал аудита. Используйте только для исправления ошибок маршрутизации.</span>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={()=>setMoveConfirmModal(null)} className="flex-1">Отмена</Btn>
          <Btn icon={ArrowRight} onClick={confirmMove} className="flex-1">Переместить</Btn>
        </div>
      </div>
    </Modal>
  </div>;
}

// ═══════════════════════════════════════
// PIPELINE DETAIL VIEW (roles-aware)
// ═══════════════════════════════════════

// Compact 3-stage workflow
function CompactWorkflow({req, defaultExpanded}) {
  const workflowStages = PIPELINE_STAGES.filter(s => s.id!=="rejected" && s.id!=="grey_zone");
  const currentIdx = workflowStages.findIndex(s => s.id===req.stage);
  if (currentIdx === -1) return null;

  const prevStage = currentIdx > 0 ? workflowStages[currentIdx - 1] : null;
  const currentStage = workflowStages[currentIdx];
  const nextStage = currentIdx < workflowStages.length - 1 ? workflowStages[currentIdx + 1] : null;

  // Find prev actor in history
  const prevActor = req.history ? req.history.slice().reverse().find(h =>
    h.action!=="created" && h.action!=="scoring_completed" && h.action!==`moved_to_${req.stage}`
  ) : null;
  const prevDate = prevActor?.date || req.history?.[0]?.date || req.created;

  const daysOnStage = getDaysOnStage(req);
  const nextRoleUser = nextStage ? BANK_USERS.find(u => u.role === nextStage.role) : null;

  const [showFull, setShowFull] = useState(defaultExpanded || false);

  return <Card className="p-4 mb-5">
    <div className="grid grid-cols-3 gap-2">
      {/* Prev */}
      {prevStage ? <div className="p-3 rounded-xl" style={{background:B.greenL+"50", border:`1px solid ${B.green}40`}}>
        <div className="flex items-center gap-1.5 mb-1"><CheckCircle size={11} style={{color:B.green}}/><span className="text-[9px] font-bold uppercase tracking-wider" style={{color:B.green}}>Предыдущий</span></div>
        <div className="text-xs font-semibold" style={{color:B.t1}}>{prevStage.label}</div>
        {prevActor && <div className="text-[10px] mt-0.5" style={{color:B.t2}}>{prevActor.user}</div>}
        <div className="text-[10px]" style={{color:B.t3}}>{prevDate}</div>
      </div> : <div className="p-3 rounded-xl" style={{background:"#F8FAFC", border:`1px solid ${B.border}`}}>
        <div className="flex items-center gap-1.5 mb-1"><FileText size={11} style={{color:B.t3}}/><span className="text-[9px] font-bold uppercase tracking-wider" style={{color:B.t3}}>Создана</span></div>
        <div className="text-xs font-semibold" style={{color:B.t1}}>Заявка от клиента</div>
        <div className="text-[10px] mt-0.5" style={{color:B.t3}}>{req.created}</div>
      </div>}

      {/* Current (highlighted) */}
      <div className="p-3.5 rounded-xl" style={{background:currentStage.color+"10", border:`2px solid ${currentStage.color}`}}>
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{background:currentStage.color}}/>
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{color:currentStage.color}}>Текущий</span>
        </div>
        <div className="text-sm font-bold" style={{color:currentStage.color}}>{currentStage.label}</div>
        <div className="text-[10px] mt-1" style={{color:B.t2}}>с {req.stageStartDate||req.created} · {daysOnStage}д</div>
      </div>

      {/* Next */}
      {nextStage ? <div className="p-3 rounded-xl" style={{background:"#F8FAFC", border:`1px solid ${B.border}`}}>
        <div className="flex items-center gap-1.5 mb-1"><ChevronRight size={11} style={{color:B.t3}}/><span className="text-[9px] font-bold uppercase tracking-wider" style={{color:B.t3}}>Следующий</span></div>
        <div className="text-xs font-semibold" style={{color:B.t2}}>{nextStage.label}</div>
        {nextRoleUser && <div className="text-[10px] mt-0.5" style={{color:B.t3}}>{nextRoleUser.name}</div>}
      </div> : <div className="p-3 rounded-xl" style={{background:B.greenL+"30", border:`1px solid ${B.green}40`}}>
        <div className="flex items-center gap-1.5 mb-1"><CheckCircle size={11} style={{color:B.green}}/><span className="text-[9px] font-bold uppercase tracking-wider" style={{color:B.green}}>Финал</span></div>
        <div className="text-xs font-semibold" style={{color:B.t1}}>Активная сделка</div>
      </div>}
    </div>

    {/* Collapsible full workflow */}
    <button onClick={()=>setShowFull(!showFull)} className="text-[11px] font-semibold hover:underline mt-3 flex items-center gap-1" style={{color:B.accent}}>
      {showFull ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
      {showFull ? "Скрыть полный путь" : `Показать весь путь (${workflowStages.length} этапов)`}
    </button>
    {showFull && <div className="mt-4 pt-4 border-t" style={{borderColor:B.border}}>
      <div className="space-y-3">
        {workflowStages.map((st, idx) => {
          const isCur = st.id===req.stage;
          const isPast = idx < currentIdx;
          const isFuture = idx > currentIdx;
          const stageRole = ROLE_ACCESS[st.role];
          const stageUser = BANK_USERS.find(u => u.role === st.role);
          // Find actor for this stage from history (past stages)
          const historyAction = isPast ? (req.history||[]).find(h => {
            if (idx === 0) return h.action === "created";
            const actionMap = {
              "analyst_verification":"verified",
              "lpr_decision":"approved",
              "contract_preparation":"contract_generated",
              "contract_signing":"contract_signed_bank",
              "client_signing":"contract_signed_client",
              "client_activation":"activated",
            };
            return h.action === actionMap[st.id];
          }) : null;
          const slaLimit = getSlaLimit(st.id, req.tier);
          // Documents that appear at this stage
          const stageDocs = {
            "analyst_verification": ["Согласие БКИ", "Выписка Легат", "Кредитный отчёт БКИ"].concat(req.tier === "extended" ? ["Баланс ОПУ"] : []),
            "lpr_decision": ["Решение о предоставлении факторинга"],
            "contract_preparation": ["Генеральный договор факторинга"],
            "contract_signing": ["Подпись банка (ЭЦП)"],
            "client_signing": ["Подпись клиента (ЭЦП)"],
            "client_activation": ["Активация в АБС"],
          }[st.id] || [];

          return <div key={st.id} className="flex items-stretch gap-4 rounded-xl p-4"
            style={{background:isCur?st.color+"10":isPast?B.greenL+"30":"#F8FAFC",
              border:isCur?`2px solid ${st.color}`:isPast?`1px solid ${B.green}40`:`1px solid ${B.border}`}}>
            {/* Stage number + icon */}
            <div className="flex flex-col items-center shrink-0" style={{minWidth:44}}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{
                  background: isCur ? st.color : isPast ? B.green : "white",
                  color: isCur || isPast ? "white" : B.t3,
                  border: isFuture ? `2px solid ${B.border}` : "none",
                }}>
                {isPast ? <CheckCircle size={18}/> : isCur ? <div className="w-3 h-3 rounded-full bg-white animate-pulse"/> : (idx+1)}
              </div>
              {idx < workflowStages.length - 1 && <div className="w-px flex-1 mt-1" style={{background:isPast?B.green+"40":B.border, minHeight:30}}/>}
            </div>

            {/* Stage content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-base font-bold" style={{color:isCur?st.color:isPast?B.green:B.t2}}>{st.label}</span>
                {isCur && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider" style={{background:st.color,color:"white"}}>Текущий этап</span>}
                {isPast && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider" style={{background:B.green,color:"white"}}>✓ Завершён</span>}
                {isFuture && <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{background:B.border,color:B.t3}}>Ожидается</span>}
              </div>

              <div className="text-xs mb-2" style={{color:B.t2}}>{st.description||"Этап факторингового конвейера"}</div>

              {/* Meta info grid */}
              <div className="grid grid-cols-2 gap-3 mb-2">
                {stageRole && st.role !== "system" && st.role !== "—" && <div className="flex items-center gap-1.5 p-1.5 rounded-lg" style={{background:"white"}}>
                  <span className="text-sm">{stageRole.icon}</span>
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wider" style={{color:B.t3}}>Ответственная роль</div>
                    <div className="text-[11px] font-bold truncate" style={{color:stageRole.color}}>{stageRole.label}</div>
                  </div>
                </div>}
                {slaLimit > 0 && st.role !== "system" && st.role !== "—" && <div className="flex items-center gap-1.5 p-1.5 rounded-lg" style={{background:"white"}}>
                  <Clock size={12} style={{color:B.t3}}/>
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wider" style={{color:B.t3}}>SLA этапа</div>
                    <div className="text-[11px] font-bold" style={{color:B.t1}}>{slaLimit} {slaLimit===1?"день":slaLimit<5?"дня":"дней"}</div>
                  </div>
                </div>}
              </div>

              {/* Actor info */}
              {isPast && historyAction && <div className="mt-2 p-2 rounded-lg flex items-start gap-2" style={{background:"white"}}>
                <CheckCircle size={12} style={{color:B.green}} className="shrink-0 mt-0.5"/>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold" style={{color:B.t1}}>{historyAction.user}</div>
                  <div className="text-[10px]" style={{color:B.t3}}>Завершил этап · {historyAction.date}</div>
                  {historyAction.comment && <div className="text-[11px] italic mt-1.5 p-1.5 rounded" style={{background:"#F8FAFC",color:B.t2}}>💬 «{historyAction.comment}»</div>}
                </div>
              </div>}

              {isCur && <div className="mt-2 p-2 rounded-lg flex items-start gap-2" style={{background:"white",border:`1px solid ${st.color}40`}}>
                <div className="w-3 h-3 rounded-full shrink-0 mt-0.5 animate-pulse" style={{background:st.color}}/>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold" style={{color:st.color}}>В работе: {stageUser?.name || "Не назначено"}</div>
                  <div className="text-[10px]" style={{color:B.t2}}>
                    С {req.stageStartDate||req.created} · <strong>{daysOnStage}д на этапе</strong>
                    {slaLimit > 0 && daysOnStage > slaLimit && <span style={{color:B.red,fontWeight:700}}> · 🔥 SLA нарушен</span>}
                  </div>
                </div>
              </div>}

              {isFuture && stageUser && <div className="mt-2 p-2 rounded-lg flex items-center gap-2" style={{background:"#F8FAFC"}}>
                <ChevronRight size={12} style={{color:B.t3}} className="shrink-0"/>
                <div className="text-[11px]" style={{color:B.t3}}>
                  Будет назначен: <strong style={{color:B.t2}}>{stageUser.name}</strong>
                </div>
              </div>}

              {/* Documents at this stage */}
              {stageDocs.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold" style={{color:B.t3}}>Документы:</span>
                {stageDocs.map((d,i)=><span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]" style={{background:"white",color:B.t2,border:`1px solid ${B.border}`}}>
                  <FileText size={9}/>{d}
                </span>)}
              </div>}
            </div>
          </div>;
        })}
      </div>
    </div>}
  </Card>;
}

// Informational banner when user can't act on stage
function InformationalBanner({req, currentUser}) {
  const stage = PIPELINE_STAGES.find(s=>s.id===req.stage);
  const [limitReviewModal, setLimitReviewModal] = useState(false);
  const [newLimitInput, setNewLimitInput] = useState("");
  const [limitJustification, setLimitJustification] = useState("");
  if (!stage) return null;
  const workerRole = ROLE_ACCESS[stage.role];
  const worker = BANK_USERS.find(u => u.role === stage.role);

  if (req.stage === "active") {
    const canRequestLimit = ROLE_ACCESS[currentUser.role]?.canRequestLimitReview;
    const dealAssignments = ASSIGNMENTS.filter(a => a.dealId === req.id);
    const usedAmount = dealAssignments.filter(a => a.stage === "paid").reduce((s,a) => s+a.amount, 0);
    const activeAssignments = dealAssignments.filter(a => a.stage !== "paid").length;
    const limit = req.approvedLimit || 0;
    const usagePct = limit > 0 ? Math.round(usedAmount/limit*100) : 0;
    return <Card className="p-5 mb-5" style={{background:B.greenL, borderColor:B.green+"40"}}>
      <div className="flex items-start gap-3">
        <CheckCircle size={22} style={{color:B.green}} className="shrink-0 mt-0.5"/>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-bold" style={{color:B.green}}>✅ Активный клиент</div>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold" style={{background:B.accentL, color:B.accent}}>
              Генеральный договор
            </span>
          </div>
          <div className="text-xs mt-1" style={{color:B.t2}}>
            Клиент может создавать уступки (ДКП + ТТН) в рамках лимита
          </div>
          <div className="grid grid-cols-3 gap-4 mt-3 text-xs">
            <div><span style={{color:B.t3}}>Лимит:</span> <strong style={{color:B.t1}}>{fmtByn(limit)}</strong></div>
            <div><span style={{color:B.t3}}>Ставка:</span> <strong style={{color:B.t1}}>{req.approvedRate}%</strong></div>
            <div><span style={{color:B.t3}}>Счёт:</span> <span className="mono" style={{color:B.accent}}>{req.accountNumber}</span></div>
          </div>
          {limit > 0 && <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span style={{color:B.t3}}>Использовано: <strong>{fmtByn(usedAmount)}</strong> · {activeAssignments} активных уступок</span>
              <span className="font-bold" style={{color:B.t1}}>{usagePct}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{background:"white"}}>
              <div className="h-full transition-all" style={{width:`${usagePct}%`,background:usagePct>80?B.red:usagePct>50?B.yellow:B.green}}/>
            </div>
          </div>}
          {canRequestLimit && <div className="mt-3 flex gap-2 flex-wrap">
            <Btn size="sm" variant="ghost" icon={TrendingUp} onClick={()=>{
              setNewLimitInput(String(Math.round(limit * 1.5)));
              setLimitJustification("");
              setLimitReviewModal(true);
            }}>📈 Запросить пересмотр лимита</Btn>
          </div>}
          <div className="text-[10px] mt-3 p-2 rounded-lg flex items-start gap-1.5"
            style={{background:"#EEF2FF", color:"#6366F1"}}>
            <Info size={11} className="shrink-0 mt-0.5"/>
            <span>
              Резервирование средств, движение по корр.счёту и ФОР — операции АБС банка.
              Oborotka.by отображает статус и остатки, полученные из АБС.
            </span>
          </div>
        </div>
      </div>
      <Modal open={limitReviewModal} onClose={()=>setLimitReviewModal(false)} title="Пересмотр лимита">
        <div className="space-y-4">
          <div className="p-3 rounded-xl" style={{background:"#F8FAFC"}}>
            <div className="text-[10px] font-semibold mb-1" style={{color:B.t3}}>Клиент</div>
            <div className="text-sm font-bold" style={{color:B.t1}}>{req.company}</div>
            <div className="text-[11px] mono mt-0.5" style={{color:B.t3}}>УНП {req.unp}</div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-[10px]" style={{color:B.t3}}>Текущий лимит</div>
                <div className="text-sm font-bold mono" style={{color:B.t1}}>{fmtByn(limit)}</div>
              </div>
              <div>
                <div className="text-[10px]" style={{color:B.t3}}>Использовано</div>
                <div className="text-sm font-bold mono" style={{color:usagePct>80?B.red:B.t1}}>{fmtByn(usedAmount)} ({usagePct}%)</div>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Новый запрашиваемый лимит (BYN)</label>
            <input value={newLimitInput} onChange={e=>setNewLimitInput(e.target.value)}
              placeholder="Например: 1 000 000" type="number"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Обоснование (обязательно)</label>
            <textarea value={limitJustification} onChange={e=>setLimitJustification(e.target.value)}
              rows={3} placeholder="Почему клиент просит увеличения? Напр.: «Рост объёма заказов на 40%, новые контракты с X и Y»"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}/>
          </div>
          <div className="p-2.5 rounded-lg text-[10px] flex items-start gap-1.5" style={{background:"#EEF2FF", color:"#6366F1"}}>
            <Info size={11} className="shrink-0 mt-0.5"/>
            <span>Будет создана новая заявка типа «Пересмотр лимита» со ссылкой на текущую сделку {req.id}. Не нужно заново проходить полный скоринг — аналитик увидит историю клиента.</span>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={()=>setLimitReviewModal(false)} className="flex-1">Отмена</Btn>
            <Btn icon={TrendingUp} className="flex-1"
              disabled={!newLimitInput || isNaN(Number(newLimitInput)) || Number(newLimitInput) <= limit || !limitJustification.trim()}
              onClick={()=>{
                setLimitReviewModal(false);
                if(typeof window !== "undefined") {
                  // Would normally call API to create limit_increase request
                  window.dispatchEvent(new CustomEvent("oborotka:limit-review", {
                    detail: {parentId: req.id, currentLimit: limit, newLimit: Number(newLimitInput), justification: limitJustification}
                  }));
                }
              }}>
              Создать заявку на пересмотр
            </Btn>
          </div>
        </div>
      </Modal>
    </Card>;
  }
  if (req.stage === "rejected") {
    return <Card className="p-5 mb-5" style={{background:B.redL, borderColor:"#FECACA"}}>
      <div className="flex items-start gap-3">
        <XCircle size={22} style={{color:B.red}} className="shrink-0 mt-0.5"/>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{color:B.red}}>Заявка отклонена</div>
          {req.rejectReason && <div className="text-xs mt-1" style={{color:B.t1}}>{req.rejectReason}</div>}
          <div className="text-xs mt-1" style={{color:B.t3}}>Отклонил: {req.rejectedBy||"—"} · {req.rejectDate||"—"}</div>
        </div>
      </div>
    </Card>;
  }

  return <Card className="p-5 mb-5" style={{background:"#F8FAFC", borderColor:B.border}}>
    <div className="flex items-start gap-3">
      <Info size={22} style={{color:B.t2}} className="shrink-0 mt-0.5"/>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold" style={{color:B.t1}}>Заявка на этапе «{stage.label}»</div>
        {workerRole && <div className="text-xs mt-1" style={{color:B.t2}}>
          Работает: <strong>{worker?.name||"—"}</strong> ({workerRole.icon} {workerRole.label})
        </div>}
        <div className="text-xs mt-1" style={{color:B.t3}}>Вы можете посмотреть информацию, но действий на этом этапе не требуется.</div>
        <SLABenchmark req={req}/>
      </div>
    </div>
  </Card>;
}

// SLA benchmark — подсказка о среднем времени по похожим заявкам
function SLABenchmark({req}) {
  const avgDays = getAverageDaysOnStage(req.stage, req.tier);
  if (avgDays == null) return null;
  const currentDays = getDaysOnStage(req);
  const isSlower = currentDays > avgDays * 1.5;
  const tierLabel = req.tier === "simple" ? "≤50K" : ">50K";
  const isApproval = isInApprovalPhase(req.stage);

  return <div className="text-[10px] mt-2 p-2 rounded-lg flex items-center gap-2"
    style={{background: isSlower ? B.yellowL : "#F1F5F9", color: B.t2}}>
    <Activity size={12} style={{color: isSlower ? B.yellow : B.t3}} className="shrink-0"/>
    <span>
      {isApproval ? "С подачи заявки" : "На этапе"}: <strong style={{color: isSlower ? B.yellow : B.t1}}>{currentDays} раб.д</strong>
      {" · Среднее по похожим ("}{tierLabel}{"): "}
      <strong>{avgDays} раб.д</strong>
      {isSlower && <span style={{color: B.yellow}}> ⚠</span>}
    </span>
  </div>;
}

// Action block (role-specific task)
// ─── Contract preparation sub-component (isolated hooks) ───
function ContractPreparationBlock({req, roleInfo, signerUser, returnEvent, accountInput, setAccountInput, signing, setHandoverModal, handoverModal, handoverSubmit}) {
  const draftKey = `contract-draft-${req.id}`;
  const [draft, setDraft] = useState(() => {
    try {
      const saved = sessionStorage.getItem(draftKey);
      return saved ? JSON.parse(saved) : null;
    } catch(e) { return null; }
  });
  const [draftDismissed, setDraftDismissed] = useState(false);

  // Autosave on field change
  useEffect(() => {
    if (accountInput) {
      try {
        const d = {accountNumber: accountInput, savedAt: new Date().toISOString()};
        sessionStorage.setItem(draftKey, JSON.stringify(d));
      } catch(e) {}
    }
  }, [accountInput, draftKey]);

  const loadDraft = () => {
    if (draft) {
      setAccountInput(draft.accountNumber || "");
      setDraftDismissed(true);
    }
  };
  const discardDraft = () => {
    try { sessionStorage.removeItem(draftKey); } catch(e) {}
    setDraft(null);
    setDraftDismissed(true);
  };

  return <>
    {/* Contract draft banner */}
    {draft && !draftDismissed && <Card className="p-3 mb-4" style={{background:"#EEF2FF",borderColor:"#6366F1"+"40",borderWidth:1}}>
      <div className="flex items-center gap-3">
        <FileText size={18} style={{color:"#6366F1"}} className="shrink-0"/>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold" style={{color:"#6366F1"}}>Найден черновик от {new Date(draft.savedAt).toLocaleString("ru-BY")}</div>
          <div className="text-[10px]" style={{color:B.t2}}>Счёт: {draft.accountNumber||"—"} · Ген.договор</div>
        </div>
        <Btn size="sm" variant="secondary" onClick={loadDraft}>Продолжить</Btn>
        <Btn size="sm" variant="ghost" onClick={discardDraft}>Начать заново</Btn>
      </div>
    </Card>}

    {/* Return-to-USKO banner */}
    {returnEvent && <Card className="p-4 mb-5" style={{background:B.redL, borderColor:"#FECACA", borderWidth:2}}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} style={{color:B.red}} className="shrink-0 mt-0.5"/>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{color:B.red}}>⚠ ВОЗВРАТ НА ДОРАБОТКУ</div>
          <div className="text-xs mt-1" style={{color:B.t2}}>Подписант вернул заявку на доработку</div>
          {returnEvent.issues && returnEvent.issues.length>0 && <div className="mt-2">
            <div className="text-[10px] font-semibold mb-1" style={{color:B.t3}}>Проблемы:</div>
            <ul className="space-y-0.5">{returnEvent.issues.map((iss,i)=><li key={i} className="text-xs" style={{color:B.t1}}>• {RETURN_ISSUE_LABELS[iss]||iss}</li>)}</ul>
          </div>}
          {returnEvent.comment && <div className="mt-2 p-2 rounded-lg text-[11px] italic" style={{background:"white",color:B.t2}}>💬 «{returnEvent.comment}»</div>}
          <div className="text-[10px] mt-2" style={{color:B.t3}}>{returnEvent.user} · {returnEvent.date}</div>
          <div className="text-[10px] mt-1 font-semibold" style={{color:B.red}}>После исправления нажмите «Сгенерировать» снова</div>
        </div>
      </div>
    </Card>}

    <Card className="p-5 mb-5" style={{background:roleInfo.color+"08", borderColor:roleInfo.color, borderWidth:2}}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background:"white"}}>🎯</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{color:roleInfo.color}}>Ваша задача</div>
          <div className="text-base font-bold mt-0.5" style={{color:B.t1}}>Завести клиента в АБС и сгенерировать договор</div>
          <div className="text-xs mt-1" style={{color:B.t2}}>Решение: {fmtByn(req.approvedLimit||0)} под {req.approvedRate}% · {req.decisionBy}</div>
        </div>
      </div>

      {/* Only general contract is used */}
      <div className="mb-3 p-3 rounded-xl" style={{background: B.accentL + "40", border: `1px solid ${B.accent}30`}}>
        <div className="flex items-center gap-2">
          <FileText size={14} style={{color: B.accent}}/>
          <span className="text-xs font-bold" style={{color: B.t1}}>Генеральный договор факторинга</span>
        </div>
        <div className="text-[10px] mt-1" style={{color: B.t2}}>
          Многократные уступки в рамках одобренного лимита <strong>{fmtByn(req.approvedLimit||0)}</strong>
        </div>
      </div>

      <div className="mb-3">
        <label className="text-[10px] font-semibold block mb-1" style={{color:B.t3}}>Номер счёта (из АБС)</label>
        <input value={accountInput} onChange={e=>setAccountInput(e.target.value)} placeholder="3819..." className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/>
      </div>
      <div className="text-[10px] p-2 rounded-lg bg-slate-50 mb-3" style={{color:B.t3}}>
        <strong>Шаги:</strong> 1) Завести карточку в АБС → 2) Получить номер счёта → 3) «Сгенерировать»
      </div>
      <Btn size="md" icon={signing?Loader2:FileText} disabled={signing||!accountInput} className="w-full"
        onClick={()=>{
          try { sessionStorage.removeItem(draftKey); } catch(e) {}
          setHandoverModal({
            nextStage:"contract_signing",
            extraData:{accountNumber:accountInput},
            message:`Ген.договор сгенерирован. Передан подписанту`,
            toUser: signerUser
          });
        }}>
        {signing?"Генерация...":"📄 СГЕНЕРИРОВАТЬ ГЕН.ДОГОВОР"}
      </Btn>
      <div className="mt-3 text-[10px] italic flex items-center gap-1" style={{color:B.t3}}>
        <Info size={10}/>Договор сформируется автоматически по шаблону на основе данных клиента.
      </div>
    </Card>
    {handoverModal && <HandoverModal config={handoverModal} onSkip={()=>handoverSubmit("")} onConfirm={handoverSubmit} onClose={()=>setHandoverModal(null)}/>}
  </>;
}

// ─── RequestTaskForm — unified editable form shown above ActionBlock ───
// Shows all relevant request data in a structured, editable layout
// so the user sees everything at once and can make decisions fast.
// ─── ScoringBlock — score display with expandable breakdown ───
// ─── DangerConfirmModal — 2-step confirm with cool-down ───
// Used for irreversible / financial actions (approve payment, reject request, block client)
function DangerConfirmModal({open, onClose, onConfirm, title, description, amount, recipient, actionLabel = "Подтвердить", coolDownSec = 3, accent = "#DC2626", icon: Icon = AlertTriangle}) {
  const [typed, setTyped] = useState("");
  const [cooldown, setCooldown] = useState(coolDownSec);
  const requireText = actionLabel.toUpperCase();

  useEffect(() => {
    if (!open) {
      setTyped("");
      setCooldown(coolDownSec);
      return;
    }
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [open, cooldown, coolDownSec]);

  if (!open) return null;

  const canConfirm = cooldown === 0 && typed === requireText;

  return <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)"}} onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="p-5 border-b" style={{background: accent + "10", borderColor: accent + "30"}}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{background: "white", border: `1px solid ${accent}40`}}>
            <Icon size={20} style={{color: accent}}/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider" style={{color: accent}}>⚠ Опасное действие</div>
            <div className="text-base font-black mt-0.5" style={{color: B.t1}}>{title}</div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {description && <div className="text-[12px]" style={{color: B.t2}}>{description}</div>}

        {(amount || recipient) && <div className="p-3 rounded-xl" style={{background: "#F8FAFC", border: `1px solid ${B.border}`}}>
          {recipient && <div className="flex items-center justify-between text-[11px] mb-1">
            <span style={{color: B.t3}}>Получатель:</span>
            <strong style={{color: B.t1}}>{recipient}</strong>
          </div>}
          {amount && <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{color: B.t3}}>Сумма:</span>
            <strong className="text-xl font-black mono" style={{color: accent}}>{typeof amount === "number" ? fmtByn(amount) : amount}</strong>
          </div>}
        </div>}

        <div>
          <label className="text-[11px] font-semibold block mb-1.5" style={{color: B.t2}}>
            Введите <strong style={{color: accent}}>{requireText}</strong> чтобы подтвердить:
          </label>
          <input type="text" value={typed} onChange={e => setTyped(e.target.value)}
            placeholder={requireText}
            className="w-full px-3 py-2 text-sm rounded-lg border-2 uppercase tracking-wider"
            style={{borderColor: typed === requireText ? accent : B.border, color: B.t1}}/>
        </div>

        <div className="flex gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose} className="flex-1">Отмена</Btn>
          <Btn variant="danger" className="flex-1"
            disabled={!canConfirm}
            onClick={() => {onConfirm(); onClose();}}>
            {cooldown > 0 ? `Подождите ${cooldown}с...` : actionLabel}
          </Btn>
        </div>
      </div>
    </div>
  </div>;
}

function ScoringBlock({req, scoreColor, isExtended, openScoringDoc}) {
  const [expanded, setExpanded] = useState(false);

  // Compute breakdown from existing fields. Values are simulated but deterministic.
  const breakdown = [
    {label: "Легат (судебные дела)", weight: 30, value: req.legat === "clean" ? 30 : -10, docType: "legat"},
    {label: "БКИ (кредитная история)", weight: 50, value: req.bki === "good" ? 50 : -20, docType: "bki"},
    {label: "Возраст компании", weight: 25, value: 20, docType: null},
    {label: "Отрасль (сектор риска)", weight: 20, value: 15, docType: null},
    {label: "Обороты последние 12 мес", weight: 30, value: 25, docType: null},
    {label: "Связанные лица / аффилированность", weight: 15, value: -5, docType: null},
  ];
  if (isExtended) {
    breakdown.push({label: "Чистые активы (финотчётность)", weight: 40, value: req.netAssets === "positive" ? 40 : -30, docType: "report"});
  }

  const computedTotal = breakdown.reduce((s, b) => s + b.value, 0);
  const displayTotal = req.scoringTotal || computedTotal;

  return <div className="mb-4">
    <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
      Автоскоринг
    </div>

    {/* Header with class + total */}
    <div className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{background: scoreColor + "10"}}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black shrink-0"
        style={{background: "white", color: scoreColor, border: `2px solid ${scoreColor}`}}>
        {req.scoringClass || "—"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold" style={{color: scoreColor}}>
          Результат: {displayTotal} баллов из 200
        </div>
        <div className="text-[10px] mt-0.5" style={{color: B.t2}}>
          {req.scoringClass === "A" || req.scoringClass === "AA" ? "Высокий балл — можно одобрять стандартно"
            : req.scoringClass === "B" || req.scoringClass === "BB" ? "Средний балл — проверить внимательно"
            : "Низкий балл — требуется детальная проверка"}
        </div>
      </div>
      <button onClick={() => setExpanded(!expanded)}
        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg hover:bg-white/50 flex items-center gap-1 shrink-0"
        style={{color: scoreColor}}>
        {expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
        Breakdown
      </button>
    </div>

    {/* Expandable breakdown */}
    {expanded && <div className="p-3 rounded-xl mb-2 space-y-1.5" style={{background: "#F8FAFC", border: `1px dashed ${B.border}`}}>
      <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
        Компоненты скоринга
      </div>
      {breakdown.map((b, i) => {
        const isPositive = b.value > 0;
        const isZero = b.value === 0;
        const color = isPositive ? B.green : isZero ? B.t3 : B.red;
        const barWidth = Math.min(Math.abs(b.value) / Math.max(b.weight, 50) * 100, 100);
        return <button key={i}
          onClick={() => b.docType && openScoringDoc(b.docType)}
          disabled={!b.docType}
          className={`w-full flex items-center gap-3 p-2 rounded-lg text-left ${b.docType ? "hover:bg-white cursor-pointer" : "cursor-default"}`}>
          <span className="text-[11px] flex-1 min-w-0 truncate" style={{color: B.t1}}>{b.label}</span>
          {/* Mini bar */}
          <div className="w-20 h-1.5 rounded-full shrink-0 relative overflow-hidden" style={{background: "#E2E8F0"}}>
            <div className="absolute top-0 h-full rounded-full transition-all"
              style={{background: color, width: `${barWidth}%`, left: isPositive ? "50%" : `${50 - barWidth}%`}}/>
            <div className="absolute top-0 bottom-0 w-px" style={{background: B.t3, left: "50%"}}/>
          </div>
          <span className="text-xs font-bold mono w-12 text-right shrink-0" style={{color}}>
            {isPositive ? "+" : ""}{b.value}
          </span>
          {b.docType && <ExternalLink size={10} style={{color: B.t3}} className="shrink-0"/>}
        </button>;
      })}
      <div className="flex items-center justify-between pt-2 mt-2 border-t" style={{borderColor: B.border}}>
        <span className="text-[11px] font-bold" style={{color: B.t1}}>Итоговый балл:</span>
        <span className="text-sm font-black mono" style={{color: scoreColor}}>{displayTotal} / 200</span>
      </div>
      <div className="text-[9px] pt-1 italic" style={{color: B.t3}}>
        Клик на компонент с внешней ссылкой открывает первоисточник данных
      </div>
    </div>}

    {/* Quick chips (Legat/BKI/Report) for fast access */}
    <div className="grid grid-cols-3 gap-2">
      <button onClick={() => openScoringDoc("legat")}
        className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors"
        style={{background: req.legat === "clean" ? B.greenL + "50" : B.redL + "50"}}>
        <span className="text-[10px] font-semibold" style={{color: B.t3}}>Легат</span>
        <span className="text-[11px] font-bold flex items-center gap-1" style={{color: req.legat === "clean" ? B.green : B.red}}>
          {req.legat === "clean" ? "✓ Чисто" : "✗ Записи"}
          <ExternalLink size={10}/>
        </span>
      </button>
      <button onClick={() => openScoringDoc("bki")}
        className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors"
        style={{background: req.bki === "good" ? B.greenL + "50" : B.redL + "50"}}>
        <span className="text-[10px] font-semibold" style={{color: B.t3}}>БКИ</span>
        <span className="text-[11px] font-bold flex items-center gap-1" style={{color: req.bki === "good" ? B.green : B.red}}>
          {req.bki === "good" ? "✓ Хорошая" : "✗ Проблемы"}
          <ExternalLink size={10}/>
        </span>
      </button>
      {isExtended && <button onClick={() => openScoringDoc("report")}
        className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors"
        style={{background: req.netAssets === "positive" ? B.greenL + "50" : B.redL + "50"}}>
        <span className="text-[10px] font-semibold" style={{color: B.t3}}>Отчётность</span>
        <span className="text-[11px] font-bold flex items-center gap-1" style={{color: req.netAssets === "positive" ? B.green : B.red}}>
          {req.netAssets === "positive" ? "✓ Чистые активы +" : "✗ Активы −"}
          <ExternalLink size={10}/>
        </span>
      </button>}
    </div>
  </div>;
}

function RequestTaskForm({req, currentUser, onAction, setToast}) {
  const stage = PIPELINE_STAGES.find(s => s.id === req.stage);
  const roleInfo = ROLE_ACCESS[currentUser.role];
  const isExtended = req.requestedAmount > 50000;
  const canAct = currentUser && stage && (stage.role === currentUser.role || currentUser.role === "admin");

  // Editable state
  const [limitInput, setLimitInput] = useState(String(req.approvedLimit || req.requestedAmount || 0));
  const [rateSelect, setRateSelect] = useState(String(req.approvedRate || 25));
  const [termSelect, setTermSelect] = useState("90");
  const [recommendation, setRecommendation] = useState(req.analystRecommendation || "approve");
  const [comment, setComment] = useState("");
  const [passToLpr, setPassToLpr] = useState(isExtended); // Always checked for >50K
  const [signing, setSigning] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDangerModal, setRejectDangerModal] = useState(false);
  const [greyZoneModal, setGreyZoneModal] = useState(false);
  const [greyZoneReason, setGreyZoneReason] = useState("");

  // ─── Contract preparation state ───
  const contractDraftKey = `contract-draft-${req.id}`;
  const [accountNumber, setAccountNumber] = useState(() => {
    try {
      const saved = sessionStorage.getItem(contractDraftKey);
      if (saved) return JSON.parse(saved).accountNumber || req.accountNumber || "";
    } catch(e) {}
    return req.accountNumber || "";
  });
  const [contractTemplate, setContractTemplate] = useState("standard"); // standard / short / extended
  const [generating, setGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0); // 0=not started, 1-4=steps, 5=done
  const [contractNumber, setContractNumber] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // ─── Contract signing (bank) state ───
  const [pin, setPin] = useState("");
  const [returnToUskoModal, setReturnToUskoModal] = useState(false);
  const [returnIssues, setReturnIssues] = useState([]);
  const [returnComment, setReturnComment] = useState("");

  // ─── Client signing state (no extra state, just reminder toasts) ───

  // ─── Grey zone state (reanimate — optional comment) ───
  const [reanimateComment, setReanimateComment] = useState("");

  // Autosave contract draft
  useEffect(() => {
    if (req.stage !== "contract_preparation") return;
    if (accountNumber) {
      try {
        sessionStorage.setItem(contractDraftKey, JSON.stringify({accountNumber, savedAt: new Date().toISOString()}));
      } catch(e) {}
    }
  }, [accountNumber, contractDraftKey, req.stage]);

  // Return early for final states
  if (req.stage === "active" || req.stage === "rejected") return null;
  if (!canAct) return null;

  // Scoring class color
  const scoreColor = req.scoringClass === "A" || req.scoringClass === "AA" ? B.green
    : req.scoringClass === "B" || req.scoringClass === "BB" ? B.yellow : B.red;

  // Days on stage + SLA
  const days = getDaysOnStage(req);
  const slaLimit = getSlaLimit(req.stage, req.tier);
  const overdue = days > slaLimit;
  const slaRemainingText = overdue
    ? `⚠ ПРОСРОЧЕНО на ${days - slaLimit} раб.д`
    : `Осталось ${Math.max(0, slaLimit - days)} раб.д (SLA: ${slaLimit}д)`;

  // Handler: wraps onAction with loading state
  const doAdvance = (nextStageId, extraData = {}, message) => {
    setSigning(true);
    setTimeout(() => {
      setSigning(false);
      onAction && onAction(nextStageId, extraData, message);
    }, 1200);
  };

  // Reject handler
  const rejectSubmit = () => {
    onAction && onAction("rejected", {rejectReason, rejectDate: "2026-03-26", rejectedBy: currentUser.name}, "Заявка отклонена");
    setRejectModal(false);
  };

  // Grey zone handler
  const greyZoneSubmit = () => {
    onAction && onAction("grey_zone", {greyZoneReason, greyZoneBy: currentUser.name}, "Заявка перенесена в серую зону");
    setGreyZoneModal(false);
  };

  // Click on scoring chip — open document
  const openScoringDoc = (docType) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("oborotka:open-doc", {detail: {reqId: req.id, docType}}));
  };

  // Determine primary button config based on stage + role
  let primaryAction = null;
  if (req.stage === "analyst_verification") {
    if (recommendation === "approve") {
      if (isExtended) {
        // >50K → must pass to LPR
        primaryAction = {
          label: signing ? "Передача..." : "✓ Верифицировать и передать на решение ЛПР",
          icon: signing ? Loader2 : ArrowRight,
          onClick: () => doAdvance("lpr_decision", {
            approvedLimit: parseInt(limitInput, 10) || 0,
            approvedRate: parseFloat(rateSelect),
            approvedTerm: parseInt(termSelect, 10),
            analystRecommendation: recommendation,
            analystComment: comment,
            verifiedBy: currentUser.name,
          }, `Верифицировано. Передано ЛПР на решение`),
        };
      } else {
        // ≤50K → analyst signs immediately
        primaryAction = {
          label: signing ? "Подпись..." : "✓ Одобрить и подписать ЭЦП",
          icon: signing ? Loader2 : CheckCircle,
          onClick: () => doAdvance("contract_preparation", {
            approvedLimit: parseInt(limitInput, 10) || 0,
            approvedRate: parseFloat(rateSelect),
            approvedTerm: parseInt(termSelect, 10),
            analystRecommendation: recommendation,
            analystComment: comment,
            decisionBy: currentUser.name,
            decisionDate: "2026-03-26",
          }, `Одобрено. Передано в УСКО на оформление договора`),
        };
      }
    }
    // reject/grey_zone rekomendation → handled by Reject/GreyZone buttons below
  } else if (req.stage === "lpr_decision") {
    if (recommendation === "approve") {
      primaryAction = {
        label: signing ? "Подпись..." : "✓ Одобрить и подписать ЭЦП",
        icon: signing ? Loader2 : CheckCircle,
        onClick: () => doAdvance("contract_preparation", {
          approvedLimit: parseInt(limitInput, 10) || 0,
          approvedRate: parseFloat(rateSelect),
          approvedTerm: parseInt(termSelect, 10),
          lprRecommendation: recommendation,
          lprComment: comment,
          decisionBy: currentUser.name,
          decisionDate: "2026-03-26",
        }, `ЛПР одобрил. Передано в УСКО на оформление договора`),
      };
    }
  } else if (req.stage === "client_activation") {
    primaryAction = {
      label: signing ? "Активация..." : "⚡ АКТИВИРОВАТЬ КЛИЕНТА",
      icon: signing ? Loader2 : CheckCircle,
      onClick: () => doAdvance("active", {}, `🎉 Поздравляем! Клиент ${req.company} активирован и может создавать уступки`),
    };
  } else if (req.stage === "contract_preparation") {
    // Contract preparation — runs generation animation + creates contract
    const runGeneration = () => {
      setGenerating(true);
      setGenerationStep(1);
      // Step 1: Fetch data from ABS (0.5s)
      setTimeout(() => {
        setGenerationStep(2);
        // Step 2: Fill template (0.7s)
        setTimeout(() => {
          setGenerationStep(3);
          // Step 3: Generate PDF (0.8s)
          setTimeout(() => {
            setGenerationStep(4);
            // Step 4: Assign contract number (0.3s)
            setTimeout(() => {
              const newContractNumber = `ДФ-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9000)+1000)}`;
              setContractNumber(newContractNumber);
              setGenerationStep(5);
              setGenerating(false);
              try { sessionStorage.removeItem(contractDraftKey); } catch(e) {}
            }, 300);
          }, 800);
        }, 700);
      }, 500);
    };
    primaryAction = {
      label: generationStep === 5
        ? (signing ? "Передача подписанту..." : "📤 Передать подписанту банка")
        : (generating ? "Генерация договора..." : "🔄 Сгенерировать ген.договор"),
      icon: generationStep === 5 ? (signing ? Loader2 : ArrowRight) : (generating ? Loader2 : FileText),
      disabled: generationStep === 5 ? false : (!accountNumber || generating),
      onClick: generationStep === 5
        ? () => doAdvance("contract_signing", {accountNumber, contractNumber, contractTemplate}, `Ген.договор ${contractNumber} передан подписанту`)
        : runGeneration,
    };
  } else if (req.stage === "contract_signing") {
    // Bank signer: requires PIN to sign ECP
    primaryAction = {
      label: signing ? "Подписание..." : "🔏 Подписать ЭЦП банка",
      icon: signing ? Loader2 : Pen,
      disabled: signing || pin.length !== 4,
      onClick: () => doAdvance("client_signing", {docs: {...req.docs, generalContract: "signed_bank"}, signedByBank: currentUser.name, signedByBankDate: "2026-03-26"}, "Договор подписан банком. Отправлен клиенту"),
    };
  } else if (req.stage === "client_signing") {
    // Waiting for client — no primary action, just reminder + mock "client signed"
    primaryAction = {
      label: signing ? "Переход..." : "🧪 Mock: клиент подписал",
      icon: signing ? Loader2 : CheckCircle,
      onClick: () => doAdvance("client_activation", {docs: {...req.docs, generalContract: "signed_all"}, signedByClientDate: "2026-03-26"}, "Клиент подписал. Переход на активацию"),
    };
  } else if (req.stage === "grey_zone") {
    // Grey zone — reanimate back to analyst_verification
    if (currentUser.role === "analyst" || currentUser.role === "admin") {
      primaryAction = {
        label: signing ? "Возврат..." : "🔄 Реанимировать в работу",
        icon: signing ? Loader2 : RefreshCw,
        onClick: () => doAdvance("analyst_verification", {reanimateComment, analystTakenBy: currentUser.name, analystTakenDate: "2026-03-26"}, "Заявка реанимирована. Возвращена на верификацию аналитика"),
      };
    }
  }

  // No stages are delegated to ActionBlock anymore — all handled inside RequestTaskForm.
  const delegateToActionBlock = false;

  // Determine if we show the "Recommendation" block (analyst_verification / lpr_decision only)
  const showRecommendation = req.stage === "analyst_verification" || req.stage === "lpr_decision";

  // Editable limits block — only for analyst_verification / lpr_decision
  const showEditableLimits = req.stage === "analyst_verification" || req.stage === "lpr_decision";

  return <>
    <Card className="p-5 mb-4" style={{background: roleInfo?.color + "06" || "white", borderColor: roleInfo?.color || B.accent, borderWidth: 2}}>
      {/* ─── Header with stage + SLA badge ─── */}
      <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b" style={{borderColor: B.border}}>
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background: "white", border: `1px solid ${roleInfo?.color || B.accent}30`}}>
            {roleInfo?.icon || "🎯"}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{color: roleInfo?.color || B.accent}}>
              Ваша задача
            </div>
            <div className="text-base font-bold mt-0.5" style={{color: B.t1}}>
              {stage?.label || req.stage}
            </div>
            <div className="text-[10px] mt-1" style={{color: overdue ? B.red : B.t2}}>
              {slaRemainingText}
            </div>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg shrink-0" style={{background: isExtended ? B.purpleL : B.accentL, color: isExtended ? B.purple : B.accent}}>
          {isExtended ? ">50K — расширенная" : "≤50K — упрощённая"}
        </span>
      </div>

      {/* ─── NEW request banner ─── */}
      {req.stage === "analyst_verification" && !req.analystTakenBy && <div className="flex items-center gap-2 p-2.5 rounded-lg mb-4" style={{background: B.accentL, borderLeft: `3px solid ${B.accent}`}}>
        <span className="text-base">📥</span>
        <div>
          <div className="text-xs font-bold" style={{color: B.accent}}>Новая заявка</div>
          <div className="text-[10px]" style={{color: B.t2}}>Автоскоринг завершён, ждёт вашей проверки</div>
        </div>
      </div>}

      {/* ─── Block: Данные клиента ─── */}
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Данные клиента
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>Компания</div>
            <div className="text-xs font-bold" style={{color: B.t1}}>{req.company}</div>
            <div className="text-[10px] mono mt-0.5" style={{color: B.t3}}>УНП {req.unp}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>Запрашиваемая сумма</div>
            <div className="text-sm font-black mono" style={{color: B.t1}}>{fmtByn(req.requestedAmount)}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>Создана</div>
            <div className="text-xs" style={{color: B.t1}}>{req.created}</div>
            <div className="text-[10px] mt-0.5" style={{color: B.t3}}>{days} раб.д на этапе</div>
          </div>
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>Приоритет</div>
            <div className="text-xs" style={{color: req.priority === "high" ? B.red : B.t1}}>
              {req.priority === "high" ? "🔥 Высокий" : req.priority === "medium" ? "Средний" : "Низкий"}
            </div>
          </div>
        </div>

        {/* Editable limit / rate / term */}
        {showEditableLimits && <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{color: B.t3}}>Одобряемый лимит, BYN</label>
            <input type="number" value={limitInput} onChange={e => setLimitInput(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 mono" style={{color: B.t1}}/>
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{color: B.t3}}>Ставка</label>
            <select value={rateSelect} onChange={e => setRateSelect(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200" style={{color: B.t1}}>
              <option value="20.5">20.5%</option>
              <option value="25">25%</option>
              <option value="30">30%</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{color: B.t3}}>Срок, дней</label>
            <select value={termSelect} onChange={e => setTermSelect(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200" style={{color: B.t1}}>
              <option value="30">30 дней</option>
              <option value="60">60 дней</option>
              <option value="90">90 дней</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{color: B.t3}}>Чистые активы</label>
            <div className="px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-50"
              style={{color: isExtended ? (req.netAssets === "positive" ? B.green : B.red) : B.t3}}>
              {isExtended ? (req.netAssets === "positive" ? "✓ Положительные" : "✗ Отрицательные") : "— (для ≤50K)"}
            </div>
          </div>
        </div>}
      </div>

      {/* ─── Block: Скоринг (с раскрываемым breakdown) ─── */}
      <ScoringBlock req={req} scoreColor={scoreColor} isExtended={isExtended} openScoringDoc={openScoringDoc}/>

      {/* ─── Block: Подготовка договора (только для contract_preparation) ─── */}
      {req.stage === "contract_preparation" && <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Генерация ген.договора факторинга
        </div>

        {/* Approved decision summary */}
        <div className="p-3 rounded-xl mb-3" style={{background: B.greenL, borderLeft: `3px solid ${B.green}`}}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={12} style={{color: B.green}}/>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{color: B.green}}>
              Решение по заявке одобрено
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[11px] mt-1">
            <div><span style={{color: B.t3}}>Лимит:</span> <strong className="mono" style={{color: B.t1}}>{fmtByn(req.approvedLimit || 0)}</strong></div>
            <div><span style={{color: B.t3}}>Ставка:</span> <strong className="mono" style={{color: B.t1}}>{req.approvedRate || 25}%</strong></div>
            <div><span style={{color: B.t3}}>Решил:</span> <strong style={{color: B.t1}}>{req.decisionBy || "—"}</strong></div>
          </div>
        </div>

        {generationStep < 5 && <>
          {/* Step 1: account number + template */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{color: B.t3}}>
                Номер счёта в АБС банка <span style={{color: B.red}}>*</span>
              </label>
              <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                disabled={generating}
                placeholder="3819000012345"
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 mono"
                style={{color: B.t1, background: generating ? "#F8FAFC" : "white"}}/>
              <div className="text-[9px] mt-1" style={{color: B.t3}}>
                Получите в АБС после заведения карточки клиента
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{color: B.t3}}>Шаблон договора</label>
              <select value={contractTemplate} onChange={e => setContractTemplate(e.target.value)}
                disabled={generating}
                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200"
                style={{color: B.t1, background: generating ? "#F8FAFC" : "white"}}>
                <option value="standard">Стандартный (2026)</option>
                <option value="short">Короткий (для &lt;100К)</option>
                <option value="extended">Расширенный (с доп.условиями)</option>
              </select>
              <div className="text-[9px] mt-1" style={{color: B.t3}}>
                Большинство случаев — стандартный шаблон
              </div>
            </div>
          </div>

          {/* Generation progress steps */}
          {generating && <div className="p-3 rounded-xl mb-3" style={{background: B.accentL + "40", borderLeft: `3px solid ${B.accent}`}}>
            <div className="text-[10px] font-bold mb-2" style={{color: B.accent}}>Платформа генерирует договор...</div>
            <div className="space-y-1.5">
              {[
                {step: 1, label: "Загрузка данных клиента из АБС"},
                {step: 2, label: "Заполнение шаблона договора"},
                {step: 3, label: "Генерация PDF-файла"},
                {step: 4, label: "Присвоение номера договора"},
              ].map(s => <div key={s.step} className="flex items-center gap-2 text-[11px]">
                {generationStep > s.step
                  ? <CheckCircle size={12} style={{color: B.green}}/>
                  : generationStep === s.step
                    ? <Loader2 size={12} style={{color: B.accent}} className="animate-spin"/>
                    : <div className="w-3 h-3 rounded-full border" style={{borderColor: B.border}}/>}
                <span style={{color: generationStep >= s.step ? B.t1 : B.t3, fontWeight: generationStep === s.step ? 600 : 400}}>
                  {s.label}
                </span>
              </div>)}
            </div>
          </div>}

          {/* What will happen explainer */}
          {!generating && <div className="text-[10px] p-2.5 rounded-lg mb-3" style={{background: "#F8FAFC", color: B.t2}}>
            <strong style={{color: B.t1}}>Что произойдёт при генерации:</strong>
            <ul className="mt-1 space-y-0.5 ml-4 list-disc">
              <li>Платформа вытянет данные клиента из АБС по номеру счёта</li>
              <li>Заполнит выбранный шаблон суммой лимита {fmtByn(req.approvedLimit || 0)}, ставкой {req.approvedRate || 25}% и параметрами клиента</li>
              <li>Сформирует PDF-файл договора и присвоит уникальный номер</li>
              <li>Договор попадёт в очередь подписанту банка на подпись ЭЦП</li>
            </ul>
          </div>}
        </>}

        {/* Generated contract preview */}
        {generationStep === 5 && contractNumber && <div className="p-4 rounded-xl mb-3" style={{background: B.greenL, borderLeft: `3px solid ${B.green}`}}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background: "white"}}>
              <FileText size={20} style={{color: B.green}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{color: B.green}}>✓ Договор сгенерирован</div>
              <div className="text-sm font-bold mt-0.5" style={{color: B.t1}}>
                Генеральный договор факторинга <span className="mono">№{contractNumber}</span>
              </div>
              <div className="text-[10px] mt-1" style={{color: B.t2}}>
                Клиент: {req.company} · Лимит: {fmtByn(req.approvedLimit || 0)} · Счёт: <span className="mono">{accountNumber}</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => setShowPreview(true)}
                  className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{color: B.accent}}>
                  <Eye size={11}/> Открыть превью
                </button>
                <span style={{color: B.t3}}>·</span>
                <button onClick={() => setToast && setToast({msg: "PDF скачан (mock)", type: "success"})}
                  className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{color: B.accent}}>
                  <Download size={11}/> Скачать PDF
                </button>
                <span style={{color: B.t3}}>·</span>
                <button onClick={() => {setGenerationStep(0); setContractNumber(null);}}
                  className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{color: B.t2}}>
                  <RefreshCw size={11}/> Перегенерировать
                </button>
              </div>
            </div>
          </div>
        </div>}
      </div>}

      {/* ─── Block: Подписание банком (contract_signing) ─── */}
      {req.stage === "contract_signing" && <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Подписание ген.договора ЭЦП банка
        </div>

        {/* Contract info card */}
        <div className="p-4 rounded-xl mb-3" style={{background: "#ECFEFF", borderLeft: `3px solid #06B6D4`}}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background: "white"}}>
              <FileText size={20} style={{color: "#06B6D4"}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{color: "#06B6D4"}}>Договор готов к подписи</div>
              <div className="text-sm font-bold mt-0.5" style={{color: B.t1}}>
                Генеральный договор факторинга {req.contractNumber && <span className="mono">№{req.contractNumber}</span>}
              </div>
              <div className="text-[10px] mt-1" style={{color: B.t2}}>
                Клиент: <strong>{req.company}</strong> · Лимит: <strong className="mono">{fmtByn(req.approvedLimit || 0)}</strong> · Счёт: <span className="mono">{req.accountNumber || "—"}</span>
              </div>
              <div className="text-[10px] mt-1" style={{color: B.t3}}>
                Подготовил: {req.preparedBy || "УСКО"}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => setShowPreview(true)}
                  className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{color: B.accent}}>
                  <Eye size={11}/> Открыть превью
                </button>
                <span style={{color: B.t3}}>·</span>
                <button onClick={() => setToast && setToast({msg: "PDF скачан (mock)", type: "success"})}
                  className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{color: B.accent}}>
                  <Download size={11}/> Скачать PDF
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* PIN input for ECP signature */}
        <div className="mb-3">
          <label className="text-[10px] font-semibold block mb-1" style={{color: B.t3}}>
            PIN-код ЭЦП банка <span style={{color: B.red}}>*</span>
          </label>
          <input type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••"
            maxLength={4}
            className="w-full px-3 py-2 text-lg rounded-lg border border-slate-200 mono text-center tracking-widest"
            style={{color: B.t1, letterSpacing: "0.5em"}}/>
          <div className="text-[9px] mt-1" style={{color: B.t3}}>
            4 цифры. Демо-режим: любые 4 цифры подойдут.
          </div>
        </div>

        {/* Return to USKO link */}
        <div className="flex items-center justify-center pb-2 border-b mb-2" style={{borderColor: B.border}}>
          <button onClick={() => {setReturnIssues([]); setReturnComment(""); setReturnToUskoModal(true);}}
            className="text-[11px] font-semibold hover:underline flex items-center gap-1" style={{color: B.red}}>
            ↩ Вернуть УСКО на доработку
          </button>
        </div>

        <div className="text-[10px] italic flex items-center gap-1" style={{color: B.t3}}>
          <Info size={10}/>Ваша ЭЦП → договор уйдёт клиенту. Если в договоре ошибка — верните на доработку.
        </div>
      </div>}

      {/* ─── Block: Ожидание клиента (client_signing) ─── */}
      {req.stage === "client_signing" && <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Ожидание подписи клиента
        </div>

        <div className="p-4 rounded-xl mb-3" style={{background: "#F0F9FF", borderLeft: `3px solid #0891B2`}}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-2xl" style={{background: "white"}}>
              ⏳
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{color: "#0891B2"}}>Клиент подписывает договор</div>
              <div className="text-sm font-bold mt-0.5" style={{color: B.t1}}>
                Договор отправлен в личный кабинет клиента
              </div>
              <div className="text-[11px] mt-1" style={{color: B.t2}}>
                <strong>{req.company}</strong> должен подписать ген.договор ЭЦП в своём кабинете.
                Платформа автоматически продвинет этап вперёд после подписи.
              </div>
              {req.signedByBankDate && <div className="text-[10px] mt-2" style={{color: B.t3}}>
                Банк подписал: {req.signedByBankDate} · {req.signedByBank || "—"}
              </div>}
            </div>
          </div>
        </div>

        {/* Reminder action */}
        <div className="flex gap-2 mb-2">
          <Btn size="sm" variant="ghost" icon={Mail} className="flex-1"
            onClick={() => setToast && setToast({msg: "Напоминание отправлено клиенту на email", type: "info"})}>
            Напомнить на email
          </Btn>
          <Btn size="sm" variant="ghost" icon={Bell} className="flex-1"
            onClick={() => setToast && setToast({msg: "SMS-напоминание отправлено", type: "info"})}>
            SMS-напоминание
          </Btn>
        </div>

        <div className="text-[10px] italic flex items-center gap-1" style={{color: B.t3}}>
          <Info size={10}/>Клиент подписывает в своём кабинете. Ниже — mock-кнопка для демо.
        </div>
      </div>}

      {/* ─── Block: Серая зона (grey_zone) ─── */}
      {req.stage === "grey_zone" && <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Пограничный случай — ручное рассмотрение
        </div>

        <div className="p-4 rounded-xl mb-3" style={{background: "#F3F4F6", borderLeft: `3px solid #6B7280`}}>
          <div className="flex items-start gap-3">
            <AlertCircle size={22} style={{color: "#6B7280"}} className="shrink-0 mt-0.5"/>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{color: "#6B7280"}}>⚪ Серая зона — пограничный клиент</div>
              <div className="text-sm font-bold mt-1" style={{color: B.t1}}>
                Балл скоринга {req.scoringTotal || "—"}/200
              </div>
              <div className="text-[11px] mt-1" style={{color: B.t2}}>
                Автоскоринг не пропустил заявку — требует ручного рассмотрения. Вы можете реанимировать заявку
                (вернуть на верификацию аналитика) либо окончательно отклонить.
              </div>
              {req.greyZoneReason && <div className="mt-2 p-2 rounded-lg text-[11px] italic" style={{background: "white", color: B.t2}}>
                💬 «{req.greyZoneReason}»
              </div>}
            </div>
          </div>
        </div>

        {/* Optional reanimate comment */}
        <div className="mb-3">
          <label className="text-[10px] font-semibold block mb-1" style={{color: B.t3}}>
            Комментарий при реанимации (необязательно)
          </label>
          <textarea value={reanimateComment} onChange={e => setReanimateComment(e.target.value)} rows={2}
            placeholder="Например: «Клиент донёс дополнительные документы, пересматриваем»"
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200" style={{color: B.t1}}/>
        </div>
      </div>}

      {/* ─── Block: Рекомендация (только для analyst_verification / lpr_decision) ─── */}
      {showRecommendation && <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Решение
        </div>
        <div className="flex items-center gap-2 mb-2">
          {[
            {id: "approve", label: "✓ Одобрить", color: B.green, bg: B.greenL},
            {id: "reject", label: "✗ Отклонить", color: B.red, bg: B.redL},
            {id: "grey_zone", label: "⚪ В серую зону", color: "#6B7280", bg: "#F3F4F6"},
          ].map(opt => <button key={opt.id} onClick={() => setRecommendation(opt.id)}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all"
            style={recommendation === opt.id
              ? {background: opt.bg, color: opt.color, borderColor: opt.color, borderWidth: 2}
              : {background: "white", color: B.t2, borderColor: B.border}}>
            {opt.label}
          </button>)}
        </div>
        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
          placeholder={recommendation === "approve" ? "Комментарий (опционально)" : "Обоснование (обязательно)"}
          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200"
          style={{color: B.t1}}/>

        {/* LPR checkbox (only for >50K at analyst_verification stage) */}
        {req.stage === "analyst_verification" && isExtended && <div className="mt-2 p-2.5 rounded-lg" style={{background: B.purpleL + "50"}}>
          <label className="flex items-center gap-2 cursor-not-allowed">
            <input type="checkbox" checked={passToLpr} disabled
              className="w-4 h-4"/>
            <span className="text-[11px] font-semibold" style={{color: B.purple}}>
              Передать ЛПР на решение (обязательно для сумм &gt;50K)
            </span>
          </label>
        </div>}
      </div>}

      {/* ─── Footer: primary action ─── */}
      {!delegateToActionBlock && <div className="pt-3 border-t" style={{borderColor: B.border}}>
        {/* Primary action — either gated by recommendation (for analyst/lpr) or direct (for contract_prep/activation) */}
        {primaryAction && (!showRecommendation || recommendation === "approve") && <Btn size="lg" icon={primaryAction.icon}
          disabled={primaryAction.disabled != null ? primaryAction.disabled : signing}
          className="w-full"
          onClick={primaryAction.onClick}>
          {primaryAction.label}
        </Btn>}
        {recommendation === "reject" && showRecommendation && <Btn size="lg" variant="danger" icon={XCircle} disabled={signing || !comment.trim()} className="w-full"
          onClick={() => {setRejectReason(comment); rejectSubmit();}}>
          ✗ Отклонить заявку
        </Btn>}
        {recommendation === "grey_zone" && showRecommendation && <Btn size="lg" variant="secondary" icon={AlertCircle} disabled={signing || !comment.trim()} className="w-full"
          onClick={() => {setGreyZoneReason(comment); greyZoneSubmit();}}>
          ⚪ Перенести в серую зону
        </Btn>}

        {/* Secondary reject link (always available) */}
        {(currentUser.role === "analyst" || currentUser.role === "lpr" || currentUser.role === "admin") && recommendation === "approve" && <div className="flex items-center justify-center mt-3">
          <button onClick={() => setRejectModal(true)}
            className="text-[11px] hover:underline" style={{color: B.red}}>
            ✗ Отклонить заявку
          </button>
        </div>}
      </div>}

      {/* Delegation notice for complex stages */}
      {delegateToActionBlock && <div className="pt-3 border-t text-[10px]" style={{borderColor: B.border, color: B.t3}}>
        <Info size={10} className="inline mr-1"/>
        Действия для этапа «{stage?.label}» → см. блок ниже
      </div>}
    </Card>

    {/* Reject modal */}
    <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Отклонить заявку">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{color: B.t2}}>Причина отклонения</label>
          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" placeholder="Например: клиент в стоп-листе, данные неактуальны..." style={{color: B.t1}}/>
        </div>
        <Btn variant="danger" onClick={() => {setRejectModal(false); setRejectDangerModal(true);}} icon={XCircle} className="w-full" disabled={!rejectReason.trim()}>
          Далее →
        </Btn>
      </div>
    </Modal>

    {/* Reject confirmation with cool-down */}
    <DangerConfirmModal
      open={rejectDangerModal}
      onClose={() => setRejectDangerModal(false)}
      onConfirm={rejectSubmit}
      title="Окончательно отклонить заявку?"
      description={`Заявка ${req.id} будет отклонена с причиной: «${rejectReason.slice(0, 100)}${rejectReason.length > 100 ? "..." : ""}». Клиент получит уведомление.`}
      actionLabel="ОТКЛОНИТЬ"
      coolDownSec={3}
      accent={B.red}
      icon={XCircle}
    />

    {/* Grey zone modal */}
    <Modal open={greyZoneModal} onClose={() => setGreyZoneModal(false)} title="Перенести в серую зону">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{color: B.t2}}>Причина переноса</label>
          <textarea value={greyZoneReason} onChange={e => setGreyZoneReason(e.target.value)} rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" placeholder="Описание пограничной ситуации..." style={{color: B.t1}}/>
        </div>
        <Btn variant="secondary" onClick={greyZoneSubmit} icon={AlertCircle} className="w-full" disabled={!greyZoneReason.trim()}>
          Подтвердить перенос
        </Btn>
      </div>
    </Modal>

    {/* Contract preview modal */}
    <Modal open={showPreview} onClose={() => setShowPreview(false)} title={`Превью: Генеральный договор №${contractNumber || "—"}`}>
      <div className="space-y-3">
        <div className="p-4 rounded-xl" style={{background: "#F8FAFC", border: `1px solid ${B.border}`, fontFamily: "serif"}}>
          <div className="text-center mb-3">
            <div className="text-sm font-bold" style={{color: B.t1}}>ГЕНЕРАЛЬНЫЙ ДОГОВОР ФАКТОРИНГА</div>
            <div className="text-[11px] mono mt-1" style={{color: B.t2}}>№ {contractNumber} от 26.03.2026</div>
          </div>
          <div className="text-[11px] leading-relaxed space-y-2" style={{color: B.t2}}>
            <p><strong>ОАО «Банк Оборотка»</strong> (Фактор), именуемое в дальнейшем «Банк», в лице Председателя Правления, действующего на основании Устава, с одной стороны,</p>
            <p>и <strong>{req.company}</strong> (УНП {req.unp}), именуемое в дальнейшем «Клиент», в лице директора, с другой стороны,</p>
            <p className="pt-2">заключили настоящий Договор о нижеследующем:</p>
            <p><strong>1. ПРЕДМЕТ ДОГОВОРА.</strong> Банк обязуется предоставить Клиенту услуги факторинга (финансирование под уступку денежного требования) в пределах установленного лимита.</p>
            <p><strong>2. ФИНАНСОВЫЕ УСЛОВИЯ.</strong></p>
            <p className="pl-4">2.1. Общий лимит финансирования: <strong className="mono">{fmtByn(req.approvedLimit || 0)}</strong></p>
            <p className="pl-4">2.2. Ставка дисконта: <strong className="mono">{req.approvedRate || 25}%</strong> годовых</p>
            <p className="pl-4">2.3. Расчётный счёт клиента в АБС: <strong className="mono">{accountNumber}</strong></p>
            <p><strong>3. ПОРЯДОК УСТУПКИ.</strong> Клиент вправе уступать Банку денежные требования к своим должникам в пределах лимита. Каждая уступка оформляется допсоглашением (ДС).</p>
            <p className="pt-3 text-center italic" style={{color: B.t3}}>— превью сокращено, полный текст договора в PDF —</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setShowPreview(false)} className="flex-1">Закрыть</Btn>
          <Btn variant="secondary" icon={Download} onClick={() => setToast && setToast({msg: "PDF скачан (mock)", type: "success"})} className="flex-1">Скачать PDF</Btn>
        </div>
      </div>
    </Modal>

    {/* Return-to-USKO modal (contract_signing stage) */}
    <Modal open={returnToUskoModal} onClose={() => setReturnToUskoModal(false)} title="Вернуть на доработку УСКО">
      <div className="space-y-4">
        <div className="p-3 rounded-xl" style={{background: "#F8FAFC"}}>
          <div className="text-[10px] font-semibold mb-1" style={{color: B.t3}}>Заявка вернётся на этап «Подготовка договора»</div>
          <div className="text-xs font-bold" style={{color: B.t1}}>УСКО-специалист</div>
          <div className="text-[10px]" style={{color: B.orange}}>📄 УСКО — оформление договоров</div>
        </div>
        <div>
          <label className="text-xs font-medium mb-2 block" style={{color: B.t2}}>Что нужно исправить? (выберите проблемы)</label>
          <div className="space-y-1.5">
            {typeof RETURN_ISSUE_LABELS !== "undefined" && Object.entries(RETURN_ISSUE_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                <input type="checkbox" checked={returnIssues.includes(key)} onChange={e => {
                  setReturnIssues(prev => e.target.checked ? [...prev, key] : prev.filter(x => x !== key));
                }}/>
                <span className="text-xs" style={{color: B.t1}}>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{color: B.t2}}>Комментарий (обязательно)</label>
          <textarea value={returnComment} onChange={e => setReturnComment(e.target.value)} rows={2}
            placeholder="Например: «Сумма в договоре 180K, а лимит 150K»"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color: B.t1}}/>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setReturnToUskoModal(false)} className="flex-1">Отмена</Btn>
          <Btn variant="danger" icon={XCircle} className="flex-1"
            disabled={returnIssues.length === 0 || !returnComment.trim()}
            onClick={() => {
              onAction && onAction("contract_preparation", {_returnIssues: returnIssues, _returnComment: returnComment}, "Возвращено УСКО на доработку");
              setReturnToUskoModal(false);
            }}>
            Вернуть на доработку
          </Btn>
        </div>
      </div>
    </Modal>
  </>;
}

function ActionBlock({req, currentUser, onAction, setToast}) {
  const stage = PIPELINE_STAGES.find(s=>s.id===req.stage);
  const roleInfo = ROLE_ACCESS[currentUser.role];
  const isExtended = req.tier === "extended";
  const [signing, setSigning] = useState(false);
  const [accountInput, setAccountInput] = useState(req.accountNumber||"");
  const [limitInput, setLimitInput] = useState(String(req.approvedLimit||req.requestedAmount||0));
  const [rateSelect, setRateSelect] = useState(String(req.approvedRate||25));
  const [termSelect, setTermSelect] = useState("90");
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [handoverModal, setHandoverModal] = useState(null); // {action, nextStage, fields}
  const [isDataVerified, setIsDataVerified] = useState(false);
  const [analystRecommendation, setAnalystRecommendation] = useState("approve");
  const [returnToUskoModal, setReturnToUskoModal] = useState(false);
  const [returnIssues, setReturnIssues] = useState([]);
  const [returnComment, setReturnComment] = useState("");

  const doAdvance = (nextStageId, extraData={}, message) => {
    setSigning(true);
    setTimeout(()=>{
      setSigning(false);
      onAction(nextStageId, extraData, message);
    }, 1200);
  };

  // Special: grey zone "Take in work" / Reanimate
  if (req.stage === "grey_zone") {
    if (currentUser.role !== "analyst" && currentUser.role !== "admin") return null;
    return <Card className="p-5 mb-5" style={{background:"#F3F4F6", borderColor:"#D1D5DB", borderWidth:2}}>
      <div className="flex items-start gap-3">
        <AlertCircle size={22} style={{color:"#6B7280"}} className="shrink-0 mt-0.5"/>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{color:"#6B7280"}}>⚪ Серая зона — пограничный клиент</div>
          <div className="text-xs mt-1" style={{color:B.t2}}>Балл {req.scoringTotal}/200. Автоскоринг не пропустил — требует ручного рассмотрения.</div>
          <div className="text-[10px] mt-2 p-2 rounded-lg" style={{background:"white", color:B.t3}}>
            <Info size={10} className="inline mr-1"/>
            Вы можете <strong>реанимировать</strong> заявку: взять в работу и провести через обычный процесс верификации с учётом пограничного скоринга.
          </div>
          <div className="mt-3 flex gap-2">
            <Btn size="md" icon={RefreshCw} onClick={()=>doAdvance("analyst_verification", {}, "Заявка реанимирована. Возвращена на верификацию аналитика")}>🔄 Реанимировать в работу</Btn>
            <Btn size="md" variant="danger" icon={XCircle} onClick={()=>setRejectModal(true)}>Окончательно отклонить</Btn>
          </div>
        </div>
      </div>
      <Modal open={rejectModal} onClose={()=>setRejectModal(false)} title="Окончательно отклонить заявку">
        <div className="space-y-4">
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Причина окончательного отклонения</label>
          <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" placeholder="Причина..." style={{color:B.t1}}/></div>
          <Btn variant="danger" onClick={()=>{onAction("rejected", {rejectReason, rejectDate:"2026-03-26", rejectedBy:currentUser.name}, "Заявка окончательно отклонена"); setRejectModal(false);}} icon={XCircle} className="w-full" disabled={!rejectReason.trim()}>Подтвердить отклонение</Btn>
        </div>
      </Modal>
    </Card>;
  }

  // Reject modal
  const rejectSubmit = () => {
    onAction("rejected", {rejectReason, rejectDate:"2026-03-26", rejectedBy:currentUser.name}, "Заявка отклонена");
    setRejectModal(false);
  };

  // Handover modal submit (with optional comment)
  const handoverSubmit = (comment) => {
    const cfg = handoverModal;
    doAdvance(cfg.nextStage, {...cfg.extraData, _handoverComment:comment}, cfg.message);
    setHandoverModal(null);
  };

  // ─── analyst_verification ≤50K: одобрить + ЭЦП ───
  if (req.stage === "analyst_verification" && !isExtended) {
    return <>
      <Card className="p-5 mb-5" style={{background:roleInfo.color+"08", borderColor:roleInfo.color, borderWidth:2}}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background:"white"}}>🎯</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{color:roleInfo.color}}>Ваша задача</div>
            <div className="text-base font-bold mt-0.5" style={{color:B.t1}}>Проверить скоринг и принять решение</div>
            <div className="text-xs mt-1" style={{color:B.t2}}>Клиент: {req.company} · лимит до {fmtByn(req.requestedAmount||0)}</div>
            <SLABenchmark req={req}/>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{color:B.t3}}>Одобряемый лимит (BYN)</label>
            <input value={limitInput} onChange={e=>setLimitInput(e.target.value)} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/>
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{color:B.t3}}>Ставка</label>
            <select value={rateSelect} onChange={e=>setRateSelect(e.target.value)} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}>
              <option value="20.5">20.5%</option><option value="25">25%</option><option value="30">30%</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{color:B.t3}}>Срок</label>
            <select value={termSelect} onChange={e=>setTermSelect(e.target.value)} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}>
              <option value="30">30 дней</option><option value="60">60 дней</option><option value="90">90 дней</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Btn size="lg" icon={signing?Loader2:Pen} disabled={signing} className="w-full"
            onClick={()=>doAdvance("contract_preparation", {approvedLimit:Number(limitInput), approvedRate:Number(rateSelect), decisionDate:"2026-03-26", decisionBy:`${currentUser.name} (Аналитик)`}, "Решение подписано ЭЦП. Передано УСКО")}>
            {signing?"Подписание...":"✓ Одобрить и подписать решение ЭЦП"}
          </Btn>
          <div className="flex items-center gap-3 justify-center mt-3 pt-3 border-t" style={{borderColor:B.border}}>
            <button onClick={()=>doAdvance("grey_zone", {}, "Перенесено в серую зону")}
              className="text-[11px] hover:underline" style={{color:B.t3}}>
              ⚪ В серую зону
            </button>
            <span className="text-[10px]" style={{color:B.border}}>·</span>
            <button onClick={()=>setRejectModal(true)}
              className="text-[11px] hover:underline" style={{color:B.red}}>
              ✗ Отклонить заявку
            </button>
          </div>
        </div>
        <div className="mt-3 text-[10px] italic flex items-center gap-1" style={{color:B.t3}}>
          <Info size={10}/>До 50K: аналитик сам подписывает Решение ЭЦП. Решение сформируется автоматически.
        </div>
      </Card>
      <Modal open={rejectModal} onClose={()=>setRejectModal(false)} title="Отклонить заявку">
        <div className="space-y-4">
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Причина</label>
          <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" placeholder="Причина..." style={{color:B.t1}}/></div>
          <Btn variant="danger" onClick={rejectSubmit} icon={XCircle} className="w-full" disabled={!rejectReason.trim()}>Подтвердить отклонение</Btn>
        </div>
      </Modal>
    </>;
  }

  // ─── analyst_verification >50K: верифицировать и передать ЛПР ───
  if (req.stage === "analyst_verification" && isExtended) {
    const lprUser = BANK_USERS.find(u => u.role === "lpr");
    return <>
      <Card className="p-5 mb-5" style={{background:roleInfo.color+"08", borderColor:roleInfo.color, borderWidth:2}}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background:"white"}}>🎯</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{color:roleInfo.color}}>Ваша задача</div>
            <div className="text-base font-bold mt-0.5" style={{color:B.t1}}>Верифицировать скоринг и передать ЛПР</div>
            <div className="text-xs mt-1" style={{color:B.t2}}>Клиент: {req.company} · лимит до {fmtByn(req.requestedAmount||0)}</div>
          </div>
        </div>

        {/* Verification checkbox block */}
        <div className="p-3 rounded-xl mb-3 border" style={{background:"white", borderColor:isDataVerified?B.green+"40":B.border}}>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={isDataVerified} onChange={e=>setIsDataVerified(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 cursor-pointer"/>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{color:B.t1}}>Данные верифицированы</div>
              <div className="text-[10px] mt-1" style={{color:B.t3}}>Подтверждаю: Легат проверил · БКИ проверил · Баланс изучен · Коэффициенты в норме</div>
            </div>
          </label>
          {isDataVerified && <div className="mt-2.5 pt-2.5 flex items-center gap-2 border-t" style={{borderColor:B.border}}>
            <CheckCircle size={14} style={{color:B.green}}/>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold" style={{color:B.green}}>Верифицировано: {currentUser.name}</div>
              <div className="text-[10px]" style={{color:B.t3}}>2026-03-26 14:22</div>
            </div>
          </div>}
        </div>

        {/* Recommendation */}
        {isDataVerified && <div className="p-3 rounded-xl mb-3" style={{background:"#F8FAFC"}}>
          <div className="text-[10px] font-semibold mb-2" style={{color:B.t3}}>Рекомендация для ЛПР (опционально)</div>
          <div className="flex gap-2">
            {[{id:"approve",label:"✓ Одобрить",color:B.green},{id:"consider",label:"? Рассмотреть",color:B.yellow},{id:"reject",label:"✗ Не одобрять",color:B.red}].map(r=>
              <button key={r.id} onClick={()=>setAnalystRecommendation(r.id)}
                className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all"
                style={analystRecommendation===r.id?{background:r.color,color:"white",borderColor:r.color}:{background:"white",color:r.color,borderColor:B.border}}>
                {r.label}
              </button>
            )}
          </div>
        </div>}

        <div className="space-y-2">
          <Btn size="lg" icon={signing?Loader2:ChevronRight} disabled={signing||!isDataVerified} className="w-full"
            onClick={()=>setHandoverModal({
              nextStage:"lpr_decision",
              extraData:{
                analystVerifiedBy:currentUser.name,
                analystVerifiedRole:"analyst",
                analystVerifiedDate:"2026-03-26",
                analystVerifiedTime:"14:22",
                analystRecommendation,
              },
              message:"Верифицировано. Передано ЛПР",
              toUser: lprUser
            })}>
            {signing?"Обработка...":"→ Передать на решение ЛПР"}
          </Btn>
          <div className="flex items-center gap-3 justify-center mt-3 pt-3 border-t" style={{borderColor:B.border}}>
            <button onClick={()=>doAdvance("grey_zone", {}, "Перенесено в серую зону")}
              className="text-[11px] hover:underline" style={{color:B.t3}}>
              ⚪ В серую зону
            </button>
            <span className="text-[10px]" style={{color:B.border}}>·</span>
            <button onClick={()=>setRejectModal(true)}
              className="text-[11px] hover:underline" style={{color:B.red}}>
              ✗ Отклонить заявку
            </button>
          </div>
        </div>
        <div className="mt-3 text-[10px] italic flex items-center gap-1" style={{color:B.t3}}>
          <Info size={10}/>Свыше 50K: поставьте галочку о верификации данных — тогда можно передать ЛПР.
        </div>
      </Card>
      <Modal open={rejectModal} onClose={()=>setRejectModal(false)} title="Отклонить заявку">
        <div className="space-y-4">
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Причина</label>
          <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" placeholder="Причина..." style={{color:B.t1}}/></div>
          <Btn variant="danger" onClick={rejectSubmit} icon={XCircle} className="w-full" disabled={!rejectReason.trim()}>Подтвердить отклонение</Btn>
        </div>
      </Modal>
      {handoverModal && <HandoverModal config={handoverModal} onSkip={()=>handoverSubmit("")} onConfirm={handoverSubmit} onClose={()=>setHandoverModal(null)}/>}
    </>;
  }

  // ─── lpr_decision ───
  if (req.stage === "lpr_decision") {
    const uskoUser = BANK_USERS.find(u => u.role === "usko_prepare");
    return <>
      <Card className="p-5 mb-5" style={{background:roleInfo.color+"08", borderColor:roleInfo.color, borderWidth:2}}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background:"white"}}>🎯</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{color:roleInfo.color}}>Ваша задача</div>
            <div className="text-base font-bold mt-0.5" style={{color:B.t1}}>Принять финальное решение по заявке</div>
            <div className="text-xs mt-1" style={{color:B.t2}}>Клиент: {req.company} · запрос {fmtByn(req.requestedAmount||0)}</div>
            {req.analystVerifiedBy && <div className="mt-3 p-3 rounded-xl border" style={{background:B.greenL+"60", borderColor:B.green+"50"}}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle size={14} style={{color:B.green}}/>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{color:B.green}}>Данные верифицированы аналитиком</span>
              </div>
              <div className="text-xs font-bold" style={{color:B.t1}}>{req.analystVerifiedBy} · Кредитный аналитик</div>
              <div className="text-[10px]" style={{color:B.t3}}>{req.analystVerifiedDate}{req.analystVerifiedTime?` ${req.analystVerifiedTime}`:""}</div>
              {req.analystRecommendation && <div className="mt-2 text-[11px]" style={{color:B.t2}}>
                Рекомендация: {req.analystRecommendation==="approve"?<span style={{color:B.green,fontWeight:700}}>✓ Одобрить</span>:req.analystRecommendation==="consider"?<span style={{color:B.yellow,fontWeight:700}}>? Рассмотреть</span>:<span style={{color:B.red,fontWeight:700}}>✗ Не одобрять</span>}
              </div>}
              {(req.history||[]).filter(h=>h.comment&&h.userRole==="analyst").slice(-1).map((h,i)=><div key={i} className="mt-2 pt-2 border-t text-[11px] italic" style={{borderColor:B.green+"30",color:B.t2}}>💬 «{h.comment}»</div>)}
            </div>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{color:B.t3}}>Одобряемый лимит (BYN)</label>
            <input value={limitInput} onChange={e=>setLimitInput(e.target.value)} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/>
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{color:B.t3}}>Ставка</label>
            <select value={rateSelect} onChange={e=>setRateSelect(e.target.value)} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}>
              <option value="20.5">20.5%</option><option value="25">25%</option><option value="30">30%</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{color:B.t3}}>Срок</label>
            <select value={termSelect} onChange={e=>setTermSelect(e.target.value)} className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}>
              <option value="30">30 дней</option><option value="60">60 дней</option><option value="90">90 дней</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Btn size="lg" icon={signing?Loader2:Pen} disabled={signing} className="w-full"
            onClick={()=>setHandoverModal({
              nextStage:"contract_preparation",
              extraData:{approvedLimit:Number(limitInput), approvedRate:Number(rateSelect), decisionDate:"2026-03-26", decisionBy:`${currentUser.name} (ЛПР)`},
              message:"Решение подписано ЭЦП ЛПР. Передано УСКО",
              toUser: uskoUser
            })}>
            {signing?"Подписание...":"✓ Одобрить и подписать решение ЭЦП"}
          </Btn>
          <div className="flex items-center gap-3 justify-center mt-3 pt-3 border-t" style={{borderColor:B.border}}>
            <button onClick={()=>setRejectModal(true)}
              className="text-[11px] hover:underline" style={{color:B.red}}>
              ✗ Отклонить заявку
            </button>
          </div>
        </div>
        <div className="mt-3 text-[10px] italic flex items-center gap-1" style={{color:B.t3}}>
          <Info size={10}/>Вы — ЛПР. Подписывая ЭЦП, вы принимаете решение о выдаче факторинга.
        </div>
      </Card>
      <Modal open={rejectModal} onClose={()=>setRejectModal(false)} title="Отклонить заявку">
        <div className="space-y-4">
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Причина</label>
          <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" placeholder="Причина..." style={{color:B.t1}}/></div>
          <Btn variant="danger" onClick={rejectSubmit} icon={XCircle} className="w-full" disabled={!rejectReason.trim()}>Подтвердить отклонение</Btn>
        </div>
      </Modal>
      {handoverModal && <HandoverModal config={handoverModal} onSkip={()=>handoverSubmit("")} onConfirm={handoverSubmit} onClose={()=>setHandoverModal(null)}/>}
    </>;
  }

  // ─── contract_preparation ───
  if (req.stage === "contract_preparation") {
    const signerUser = BANK_USERS.find(u => u.role === "signer");
    const returnEvent = (req.history||[]).slice().reverse().find(h => h.action==="returned_to_usko");
    return <ContractPreparationBlock
      req={req}
      roleInfo={roleInfo}
      signerUser={signerUser}
      returnEvent={returnEvent}
      accountInput={accountInput}
      setAccountInput={setAccountInput}
      signing={signing}
      setHandoverModal={setHandoverModal}
      handoverModal={handoverModal}
      handoverSubmit={handoverSubmit}
    />;
  }

  // ─── contract_signing ───
  if (req.stage === "contract_signing") {
    const submitReturnToUsko = () => {
      const data = {
        _returnIssues: returnIssues,
        _returnComment: returnComment,
      };
      setReturnToUskoModal(false);
      // Custom handleAction with issues in history
      onAction("contract_preparation", data, "Возвращено УСКО на доработку");
    };
    return <>
      <Card className="p-5 mb-5" style={{background:roleInfo.color+"08", borderColor:roleInfo.color, borderWidth:2}}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background:"white"}}>🎯</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{color:roleInfo.color}}>Ваша задача</div>
            <div className="text-base font-bold mt-0.5" style={{color:B.t1}}>Подписать ген.договор ЭЦП банка</div>
            <div className="text-xs mt-1" style={{color:B.t2}}>Ген.договор факторинга сформирован УСКО для клиента {req.company}</div>
          </div>
        </div>
        <div className="space-y-2">
          <Btn size="sm" variant="secondary" icon={Eye} className="w-full" onClick={()=>setToast({msg:"Договор открыт для просмотра",type:"info"})}>Просмотреть договор</Btn>
          <Btn size="lg" icon={signing?Loader2:Pen} disabled={signing} className="w-full"
            onClick={()=>doAdvance("client_signing", {docs:{...req.docs, generalContract:"signed_bank"}}, "Договор подписан банком. Отправлен клиенту")}>
            {signing?"Подписание...":"🔏 Подписать ЭЦП банка"}
          </Btn>
          <div className="flex items-center gap-3 justify-center mt-3 pt-3 border-t" style={{borderColor:B.border}}>
            <button onClick={()=>{setReturnIssues([]);setReturnComment("");setReturnToUskoModal(true)}}
              className="text-[11px] hover:underline" style={{color:B.red}}>
              ↩ Вернуть УСКО на доработку
            </button>
          </div>
        </div>
        <div className="mt-3 text-[10px] italic flex items-center gap-1" style={{color:B.t3}}>
          <Info size={10}/>Ваша ЭЦП → договор уйдёт клиенту. Если в договоре ошибка — верните на доработку.
        </div>
      </Card>

      <Modal open={returnToUskoModal} onClose={()=>setReturnToUskoModal(false)} title="Вернуть на доработку УСКО">
        <div className="space-y-4">
          <div className="p-3 rounded-xl" style={{background:"#F8FAFC"}}>
            <div className="text-[10px] font-semibold mb-1" style={{color:B.t3}}>Заявка вернётся на этап «Подготовка договора»</div>
            <div className="text-xs font-bold" style={{color:B.t1}}>Петрова Н.А.</div>
            <div className="text-[10px]" style={{color:B.orange}}>📄 УСКО — оформление договоров</div>
          </div>
          <div>
            <label className="text-xs font-medium mb-2 block" style={{color:B.t2}}>Что нужно исправить? (выберите проблемы)</label>
            <div className="space-y-1.5">
              {Object.entries(RETURN_ISSUE_LABELS).map(([key,label])=>(
                <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                  <input type="checkbox" checked={returnIssues.includes(key)} onChange={e=>{
                    setReturnIssues(prev => e.target.checked ? [...prev, key] : prev.filter(x=>x!==key));
                  }}/>
                  <span className="text-xs" style={{color:B.t1}}>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Комментарий (обязательно)</label>
            <textarea value={returnComment} onChange={e=>setReturnComment(e.target.value)} rows={2}
              placeholder="Например: «Сумма в договоре 180K, а лимит 150K»"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}/>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={()=>setReturnToUskoModal(false)} className="flex-1">Отмена</Btn>
            <Btn variant="danger" onClick={submitReturnToUsko} icon={XCircle} className="flex-1"
              disabled={returnIssues.length===0 || !returnComment.trim()}>
              Вернуть на доработку
            </Btn>
          </div>
        </div>
      </Modal>
    </>;
  }

  // ─── client_signing (waiting) ───
  if (req.stage === "client_signing") {
    return <Card className="p-5 mb-5" style={{background:"#F0F9FF", borderColor:"#0891B2"+"40", borderWidth:2}}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background:"white"}}>⏳</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{color:"#0891B2"}}>Ожидание клиента</div>
          <div className="text-base font-bold mt-0.5" style={{color:B.t1}}>Клиент подписывает договор</div>
          <div className="text-xs mt-1" style={{color:B.t2}}>Договор отправлен клиенту {req.company} в личный кабинет. Ожидаем ЭЦП клиента.</div>
        </div>
      </div>
      <div className="space-y-2">
        <Btn size="sm" variant="ghost" className="w-full" onClick={()=>setToast({msg:"Напоминание отправлено клиенту",type:"info"})}>📧 Отправить напоминание клиенту</Btn>
        <Btn size="sm" variant="secondary" className="w-full" onClick={()=>doAdvance("client_activation", {docs:{...req.docs, generalContract:"signed_all"}}, "Клиент подписал (mock). Переход на активацию")}>
          🧪 Mock: клиент подписал
        </Btn>
      </div>
      <div className="mt-3 text-[10px] italic flex items-center gap-1" style={{color:B.t3}}>
        <Info size={10}/>Клиент подписывает в своём кабинете. Платформа перейдёт дальше автоматически.
      </div>
    </Card>;
  }

  // ─── client_activation ───
  if (req.stage === "client_activation") {
    return <Card className="p-5 mb-5" style={{background:roleInfo.color+"08", borderColor:roleInfo.color, borderWidth:2}}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background:"white"}}>🎉</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{color:roleInfo.color}}>Ваша задача</div>
          <div className="text-base font-bold mt-0.5" style={{color:B.t1}}>Активировать клиента</div>
          <div className="text-xs mt-1" style={{color:B.t2}}>
            Все стороны подписали ген.договор факторинга. После активации <strong>{req.company}</strong> получит
            доступ к созданию уступок в своём кабинете.
          </div>
        </div>
      </div>
      <div className="text-[10px] p-3 rounded-lg mb-3" style={{background: B.greenL, color: B.t2}}>
        <strong style={{color: B.green}}>Что произойдёт после активации:</strong>
        <ul className="mt-1.5 space-y-0.5 ml-4 list-disc">
          <li>Статус клиента в АБС → «Активный»</li>
          <li>Клиент увидит: <em>«Поздравляем! Вы теперь можете создавать уступки»</em></li>
          <li>В модуле «Клиенты» клиент появится в табе «Активные»</li>
          <li>Клиент сможет загружать ДКП/ТТН для уступок по своему лимиту</li>
        </ul>
      </div>
      <Btn size="md" icon={signing?Loader2:CheckCircle} disabled={signing} className="w-full"
        onClick={()=>doAdvance("active", {}, `🎉 Поздравляем! Клиент ${req.company} активирован и может создавать уступки`)}>
        {signing?"Активация...":"⚡ АКТИВИРОВАТЬ КЛИЕНТА"}
      </Btn>
    </Card>;
  }

  return null;
}

// Handover modal (optional comment when passing to next role)
function HandoverModal({config, onConfirm, onSkip, onClose}) {
  const [comment, setComment] = useState("");
  const toUser = config.toUser;
  const toRole = toUser ? ROLE_ACCESS[toUser.role] : null;

  return <Modal open={true} onClose={onClose} title="Передача на следующий этап">
    <div className="space-y-4">
      <div className="p-3 rounded-xl" style={{background:"#F8FAFC"}}>
        <div className="text-[10px] font-semibold mb-1" style={{color:B.t3}}>Вы передаёте заявку:</div>
        <div className="flex items-center gap-2">
          {toRole && <span className="text-lg">{toRole.icon}</span>}
          <div className="flex-1">
            <div className="text-sm font-bold" style={{color:B.t1}}>{toUser?.name||"—"}</div>
            {toRole && <div className="text-[10px]" style={{color:toRole.color}}>{toRole.label}</div>}
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium block mb-1" style={{color:B.t2}}>Комментарий (что важно знать?)</label>
        <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3}
          placeholder="Например: «КИ пограничная, но клиент давно работает»" maxLength={300}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}/>
        <div className="text-[10px] mt-1" style={{color:B.t3}}>Не обязательно, но помогает следующему сотруднику</div>
      </div>
      <div className="flex gap-2">
        <Btn variant="ghost" onClick={onSkip} className="flex-1">Пропустить</Btn>
        <Btn onClick={()=>onConfirm(comment)} icon={ChevronRight} className="flex-1" disabled={!comment.trim() && false}>Передать</Btn>
      </div>
    </div>
  </Modal>;
}

// History timeline
function HistoryTimeline({history, currentStage}) {
  if (!history || history.length === 0) return null;
  const ACTION_LABELS = {
    created: "Создана",
    scoring_completed: "Скоринг получен",
    verified: "Верифицировано аналитиком",
    approved: "Одобрено",
    contract_generated: "Ген.договор сформирован",
    contract_signed_bank: "Договор подписан банком",
    contract_signed_client: "Договор подписан клиентом",
    activated: "Клиент активирован, может создавать уступки",
    rejected: "Отклонено",
    moved_to_grey: "Перенесено в серую зону",
  };
  return <Card className="p-5">
    <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>История</h3>
    <div className="space-y-3">
      {history.map((h, idx) => {
        const isLast = idx === history.length - 1;
        const roleInfo = h.userRole ? ROLE_ACCESS[h.userRole] : null;
        return <div key={idx} className="flex gap-3">
          <div className="flex flex-col items-center shrink-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{background:B.greenL}}>
              <CheckCircle size={12} style={{color:B.green}}/>
            </div>
            {!isLast && <div className="w-px flex-1 mt-1" style={{background:B.border, minHeight:20}}/>}
          </div>
          <div className="flex-1 min-w-0 pb-2">
            <div className="text-xs font-bold" style={{color:B.t1}}>{ACTION_LABELS[h.action]||h.action}</div>
            <div className="text-[10px] mt-0.5" style={{color:B.t3}}>
              {h.user}{roleInfo && <span> · <span style={{color:roleInfo.color}}>{roleInfo.label}</span></span>} · {h.date}
            </div>
            {h.comment && <div className="text-[11px] italic mt-1 p-2 rounded-lg" style={{background:"#F8FAFC", color:B.t2}}>💬 {h.comment}</div>}
          </div>
        </div>;
      })}
      <div className="flex gap-3">
        <div className="flex flex-col items-center shrink-0">
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{background:"white", border:`2px solid ${B.t3}`}}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{background:B.t3}}/>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold" style={{color:B.t3}}>Ожидает: {PIPELINE_STAGES.find(s=>s.id===currentStage)?.label||currentStage}</div>
        </div>
      </div>
    </div>
  </Card>;
}

// Expandable scoring details (Legat/BKI/Balance/Coefficients)
function ScoringDetailBlock({req, setToast}) {
  const [expanded, setExpanded] = useState({});
  const isExtended = req.tier === "extended";
  const scColor = (req.scoringClass==="A"||req.scoringClass==="AA") ? B.green
    : (req.scoringClass==="B"||req.scoringClass==="BB") ? B.yellow : B.red;
  const scBg = (req.scoringClass==="A"||req.scoringClass==="AA") ? B.greenL
    : (req.scoringClass==="B"||req.scoringClass==="BB") ? B.yellowL : B.redL;

  const toggle = (k) => setExpanded(prev => ({...prev, [k]: !prev[k]}));

  // Generate mock coefficients for extended tier
  const coefs = isExtended ? [
    {label:"Текущая ликвидность", value:"1.8", ok:true},
    {label:"Финансовый леверидж", value:"0.35", ok:true},
    {label:"ROA", value:"8.2%", ok:true},
    {label:"EBITDA margin", value:"12.5%", ok:true},
    {label:"Оборачиваемость", value:"2.1x", ok:true},
  ] : null;

  return <Card className="p-5">
    <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Результаты скоринга (автоматический)</h3>

    {/* Base blocks: Legat + BKI */}
    <div className="grid grid-cols-2 gap-3 mb-3">
      {/* Legat */}
      <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
        <button onClick={()=>toggle("legat")} className="w-full p-3 text-left hover:bg-slate-50 transition-colors">
          <div className="text-[10px] font-semibold mb-1" style={{color:B.t3}}>Легат</div>
          <div className="flex items-center gap-2">
            {req.legat==="clean"?<CheckCircle size={16} style={{color:B.green}}/>:<XCircle size={16} style={{color:B.red}}/>}
            <span className="text-xs font-bold flex-1" style={{color:req.legat==="clean"?B.green:B.red}}>{req.legat==="clean"?"Чист":req.legat==="issue"?"Проблема":"—"}</span>
            {expanded.legat ? <ChevronUp size={12} style={{color:B.t3}}/> : <ChevronDown size={12} style={{color:B.t3}}/>}
          </div>
        </button>
        {expanded.legat && <div className="px-3 pb-3 pt-1 text-[10px] space-y-1" style={{color:B.t2, borderTop:`1px solid ${B.border}`}}>
          <div>Источник: <span className="mono" style={{color:B.accent}}>legat.by</span></div>
          <div>Дата запроса: 20.03.2026 10:12</div>
          <div>Директор: <span style={{color:B.green,fontWeight:600}}>✓ Не в стоп-листе</span></div>
          <div>Учредители: <span style={{color:B.green,fontWeight:600}}>✓ Все проверены</span></div>
          <div>Банкротство: <span style={{color:B.green,fontWeight:600}}>✗ Нет</span></div>
          <div>Исполнительные производства: <span style={{color:B.green,fontWeight:600}}>✗ Нет</span></div>
          <button onClick={()=>setToast&&setToast({msg:"Отчёт открыт",type:"info"})} className="text-[10px] font-semibold mt-1.5" style={{color:B.accent}}>📄 Открыть полный отчёт →</button>
        </div>}
      </div>

      {/* BKI */}
      <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
        <button onClick={()=>toggle("bki")} className="w-full p-3 text-left hover:bg-slate-50 transition-colors">
          <div className="text-[10px] font-semibold mb-1" style={{color:B.t3}}>БКИ</div>
          <div className="flex items-center gap-2">
            {req.bki==="good"?<CheckCircle size={16} style={{color:B.green}}/>:req.bki==="bad"?<XCircle size={16} style={{color:B.red}}/>:<AlertCircle size={16} style={{color:B.yellow}}/>}
            <span className="text-xs font-bold flex-1" style={{color:req.bki==="good"?B.green:req.bki==="bad"?B.red:B.yellow}}>{req.bki==="good"?"Положительная":req.bki==="bad"?"Отрицательная":"Средняя"}</span>
            {expanded.bki ? <ChevronUp size={12} style={{color:B.t3}}/> : <ChevronDown size={12} style={{color:B.t3}}/>}
          </div>
        </button>
        {expanded.bki && <div className="px-3 pb-3 pt-1 text-[10px] space-y-1" style={{color:B.t2, borderTop:`1px solid ${B.border}`}}>
          <div>Источник: <span style={{color:B.accent,fontWeight:600}}>БКИ НБРБ</span></div>
          <div>Дата запроса: 20.03.2026 10:13</div>
          <div>Действующие обязательства: <span style={{color:B.t1,fontWeight:600}}>2 (в срок)</span></div>
          <div>Просрочки: <span style={{color:B.green,fontWeight:600}}>Нет за 24 мес.</span></div>
          <div>Кредитная история: <span style={{color:B.green,fontWeight:600}}>48 мес., положительная</span></div>
          <button onClick={()=>setToast&&setToast({msg:"Отчёт БКИ открыт",type:"info"})} className="text-[10px] font-semibold mt-1.5" style={{color:B.accent}}>📄 Открыть отчёт БКИ →</button>
        </div>}
      </div>

      {/* Extended: Balance OPU + Net Assets */}
      {isExtended && <>
        <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
          <button onClick={()=>toggle("balance")} className="w-full p-3 text-left hover:bg-slate-50 transition-colors">
            <div className="text-[10px] font-semibold mb-1" style={{color:B.t3}}>Баланс ОПУ</div>
            <div className="flex items-center gap-2">
              {req.balanceProvided?<CheckCircle size={16} style={{color:B.green}}/>:<Clock size={16} style={{color:B.yellow}}/>}
              <span className="text-xs font-bold flex-1" style={{color:req.balanceProvided?B.green:B.yellow}}>{req.balanceProvided?"Предоставлен":"Ожидает"}</span>
              {expanded.balance ? <ChevronUp size={12} style={{color:B.t3}}/> : <ChevronDown size={12} style={{color:B.t3}}/>}
            </div>
          </button>
          {expanded.balance && <div className="px-3 pb-3 pt-1 text-[10px] space-y-1" style={{color:B.t2, borderTop:`1px solid ${B.border}`}}>
            <div>Период: <span style={{color:B.t1,fontWeight:600}}>Q4 2025</span></div>
            <div>Выручка: <span className="mono" style={{color:B.t1}}>2 340 000 BYN</span></div>
            <div>Чистая прибыль: <span className="mono" style={{color:B.green,fontWeight:600}}>185 000 BYN</span></div>
            <div>Дебиторская задолж.: <span className="mono" style={{color:B.t1}}>420 000 BYN</span></div>
            <button onClick={()=>setToast&&setToast({msg:"Баланс ОПУ открыт",type:"info"})} className="text-[10px] font-semibold mt-1.5" style={{color:B.accent}}>📄 Открыть Баланс ОПУ →</button>
          </div>}
        </div>
        <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
          <button onClick={()=>toggle("netAssets")} className="w-full p-3 text-left hover:bg-slate-50 transition-colors">
            <div className="text-[10px] font-semibold mb-1" style={{color:B.t3}}>Чистые активы</div>
            <div className="flex items-center gap-2">
              {req.netAssets==="positive"?<CheckCircle size={16} style={{color:B.green}}/>:<XCircle size={16} style={{color:B.red}}/>}
              <span className="text-xs font-bold flex-1" style={{color:req.netAssets==="positive"?B.green:B.red}}>{req.netAssets==="positive"?"Положительные":"Отрицательные"}</span>
              {expanded.netAssets ? <ChevronUp size={12} style={{color:B.t3}}/> : <ChevronDown size={12} style={{color:B.t3}}/>}
            </div>
          </button>
          {expanded.netAssets && <div className="px-3 pb-3 pt-1 text-[10px] space-y-1" style={{color:B.t2, borderTop:`1px solid ${B.border}`}}>
            <div>Сумма чистых активов: <span className="mono font-bold" style={{color:B.green}}>125 000 BYN</span></div>
            <div>Уставный капитал: <span className="mono" style={{color:B.t1}}>100 000 BYN</span></div>
            <div>Соотношение ЧА/УК: <span style={{color:B.green,fontWeight:600}}>1.25 (норма &gt; 1.0)</span></div>
          </div>}
        </div>
      </>}
    </div>

    {/* Key coefficients (for >50K) */}
    {isExtended && <div className="p-3 rounded-xl mb-3" style={{background:"#F8FAFC",border:`1px solid ${B.border}`}}>
      <div className="text-[10px] font-semibold mb-2 uppercase tracking-wider" style={{color:B.t3}}>Ключевые коэффициенты (Баланс ОПУ)</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {coefs.map(c => <div key={c.label} className="flex items-center justify-between text-xs">
          <span style={{color:B.t2}}>{c.label}:</span>
          <span className="flex items-center gap-1">
            <span className="font-semibold mono" style={{color:B.t1}}>{c.value}</span>
            {c.ok ? <CheckCircle size={10} style={{color:B.green}}/> : <XCircle size={10} style={{color:B.red}}/>}
          </span>
        </div>)}
      </div>
    </div>}

    {/* Final score */}
    {req.scoringClass && <div className="flex items-center gap-4 p-4 rounded-xl" style={{background:scBg}}>
      <div className="text-3xl font-black" style={{color:scColor}}>{req.scoringClass}</div>
      <div>
        <div className="text-sm font-bold" style={{color:B.t1}}>Итого: {req.scoringTotal||"—"}/200</div>
        <div className="text-xs" style={{color:B.t2}}>{(req.scoringClass==="A"||req.scoringClass==="AA")?"Белая зона — идёт на подтверждение":(req.scoringClass==="B"||req.scoringClass==="BB")?"Белая/серая зона":"Чёрная зона — автоотказ"}</div>
      </div>
    </div>}
  </Card>;
}

// Блок привязки к должникам — показывает список предполагаемых должников для заявки
function ExpectedDebtorsBlock({req}) {
  if (!req.expectedDebtors?.length) return null;
  if (req.stage === "active" || req.stage === "rejected" || req.stage === "grey_zone") return null;

  const total = req.expectedDebtors.reduce((s, d) => s + (d.expectedVolume || 0), 0);
  const mismatch = total !== req.requestedAmount;

  return <Card className="p-4 mb-4">
    <div className="flex items-center gap-2 mb-3">
      <Users size={16} style={{color: B.accent}}/>
      <h3 className="text-sm font-bold" style={{color: B.t1}}>Привязка к должникам</h3>
      <span className="text-[10px]" style={{color: B.t3}}>
        — клиент планирует уступать по этим контрагентам
      </span>
    </div>
    <div className="space-y-2">
      {req.expectedDebtors.map((d, i) => (
        <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 size={14} style={{color: B.t3}} className="shrink-0"/>
            <span className="text-xs font-semibold truncate" style={{color: B.t1}}>{d.name}</span>
          </div>
          <span className="text-xs font-bold mono shrink-0" style={{color: B.accent}}>
            {fmtByn(d.expectedVolume)}
          </span>
        </div>
      ))}
    </div>
    <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{borderColor: B.border}}>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{color: B.t3}}>
        Планируемый объём
      </span>
      <span className="text-sm font-black mono" style={{color: B.t1}}>{fmtByn(total)}</span>
    </div>
    {mismatch && <div className="text-[10px] mt-2 p-2 rounded-lg flex items-start gap-1.5"
      style={{background: B.yellowL, color: B.yellow}}>
      <AlertTriangle size={11} className="shrink-0 mt-0.5"/>
      <span>Планируемый объём ({fmtByn(total)}) не равен запрашиваемому лимиту ({fmtByn(req.requestedAmount)}). Уточнить у клиента.</span>
    </div>}
  </Card>;
}

function PipelineDetailView({req, currentUser, pipelineData, setPipelineData, onBack, setToast}) {
  const [comments, setComments] = useState(req.comments||[]);
  const [newComment, setNewComment] = useState("");
  const canAct = canActOnStage(currentUser, req.stage);

  // Soft-lock: detect if someone else is already working on this task
  // If analystTakenBy is set and is not current user, warn them.
  const lockedByOther = req.analystTakenBy
    && req.analystTakenBy !== currentUser.name
    && req.stage === "analyst_verification";

  // How long ago was it taken?
  const lockAge = (() => {
    if (!req.analystTakenDate) return null;
    const taken = new Date(req.analystTakenDate);
    const diffMin = Math.floor((new Date() - taken) / 60000);
    if (diffMin < 60) return `${diffMin} мин назад`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)} ч назад`;
    return `${Math.floor(diffMin / 1440)} д назад`;
  })();

  // Implicit take: when analyst (or admin) opens a new analyst_verification task,
  // automatically mark it as taken. Removes need for a separate "Взять в работу" button.
  // BUT do not auto-override if someone else already took it — use soft-lock instead.
  useEffect(() => {
    if (!setPipelineData) return;
    if (req.stage !== "analyst_verification") return;
    if (req.analystTakenBy) return; // already taken (possibly by someone else — handled via lockedByOther)
    if (currentUser.role !== "analyst" && currentUser.role !== "admin") return;
    setPipelineData(prev => prev.map(p => p.id === req.id
      ? {...p, analystTakenBy: currentUser.name, analystTakenDate: "2026-03-26"}
      : p));
  }, [req.id, req.stage, req.analystTakenBy, currentUser.role, currentUser.name, setPipelineData]);

  // Admin can override lock — take over from another analyst
  const takeOverLock = () => {
    setPipelineData(prev => prev.map(p => p.id === req.id
      ? {...p, analystTakenBy: currentUser.name, analystTakenDate: "2026-03-26"}
      : p));
    setToast && setToast({msg: `Заявка ${req.id} переведена на вас`, type: "success"});
  };

  const addComment = (text) => {
    if(!text?.trim()) return;
    const c = {user: currentUser.name, date:"2026-03-26", text};
    setComments(prev=>[...prev, c]);
    setNewComment("");
  };

  const handleAction = (nextStageId, extraData={}, msg) => {
    const handoverComment = extraData._handoverComment;
    const returnIssues = extraData._returnIssues;
    const returnComment = extraData._returnComment;
    delete extraData._handoverComment;
    delete extraData._returnIssues;
    delete extraData._returnComment;

    // Detect special case: signer returning to USKO
    const isReturnToUsko = currentUser.role === "signer" && nextStageId === "contract_preparation";

    const ACTION_MAP = {
      contract_preparation: isReturnToUsko ? "returned_to_usko" : "approved",
      lpr_decision:"verified",
      contract_signing:"contract_generated",
      client_signing:"contract_signed_bank",
      client_activation:"contract_signed_client",
      active:"activated",
      grey_zone:"moved_to_grey",
      rejected:"rejected",
      analyst_verification:"returned",
    };
    const newHistoryItem = {
      action: ACTION_MAP[nextStageId]||`moved_to_${nextStageId}`,
      user: currentUser.name,
      userRole: currentUser.role,
      date: "2026-03-26",
      comment: returnComment || handoverComment || null,
      issues: returnIssues || null,
    };

    setPipelineData(prev => prev.map(p => p.id===req.id
      ? {...p, stage:nextStageId, stageStartDate:"2026-03-26", history:[...(p.history||[]), newHistoryItem], ...extraData}
      : p
    ));
    setToast({msg: msg||"Этап обновлён", type:"success"});
    onBack();
  };

  const isExtended = req.tier === "extended";
  const tierInfo = TIER_LABELS[req.tier];
  const scColor = (req.scoringClass==="A"||req.scoringClass==="AA") ? B.green
    : (req.scoringClass==="B"||req.scoringClass==="BB") ? B.yellow : B.red;
  const scBg = (req.scoringClass==="A"||req.scoringClass==="AA") ? B.greenL
    : (req.scoringClass==="B"||req.scoringClass==="BB") ? B.yellowL : B.redL;
  const mainDataOnLeft = canAct || req.stage==="active" || req.stage==="rejected" || req.stage==="grey_zone";

  return <div>
    <PageHeader title={`Заявка ${req.id}`} subtitle={req.company} breadcrumbs={["Конвейер", req.id]} onBack={onBack}
      actions={<div className="flex items-center gap-2 flex-wrap">
        {tierInfo && <span className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{background:tierInfo.color+"15", color:tierInfo.color}}>{tierInfo.full}</span>}
        <StatusBadge status={req.stage} size="md"/>
      </div>}/>

    {/* Soft-lock banner: someone else is working on this task */}
    {lockedByOther && <Card className="p-3 mb-4" style={{background: B.yellowL, borderColor: B.yellow + "40"}}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background: "white"}}>
          <Users size={16} style={{color: B.yellow}}/>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold" style={{color: B.yellow}}>
            🔒 С этой заявкой уже работает другой сотрудник
          </div>
          <div className="text-[11px] mt-0.5" style={{color: B.t2}}>
            <strong>{req.analystTakenBy}</strong> взял заявку в работу {lockAge ? `(${lockAge})` : ""}.
            {currentUser.role === "admin" ? " Вы можете переназначить её на себя." : " Лучше не перебивать работу коллеги."}
          </div>
        </div>
        {currentUser.role === "admin" && <Btn size="sm" variant="secondary" icon={RefreshCw} onClick={takeOverLock}>
          Забрать себе
        </Btn>}
      </div>
    </Card>}

    {/* TASK FORM — unified form for all stages (analyst/lpr/usko/signer/client_activation) */}
    {canAct && req.stage!=="active" && req.stage!=="rejected" && <RequestTaskForm req={req} currentUser={currentUser} onAction={handleAction} setToast={setToast}/>}
    {(!canAct || req.stage==="active" || req.stage==="rejected") && <InformationalBanner req={req} currentUser={currentUser}/>}

    {/* Compact workflow */}
    {req.stage!=="rejected" && req.stage!=="grey_zone" && <CompactWorkflow req={req} defaultExpanded={currentUser?.role === "admin"}/>}

    <ExpectedDebtorsBlock req={req}/>

    {/* 2-column grid */}
    <div className="grid gap-6" style={{gridTemplateColumns:"1fr 320px"}}>
      <div className="space-y-5 min-w-0">
        {/* Company info */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Информация о клиенте</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div><span style={{color:B.t3}}>Компания:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{req.company}</div></div>
            <div><span style={{color:B.t3}}>УНП:</span><div className="font-semibold mono mt-0.5" style={{color:B.t1}}>{req.unp}</div></div>
            <div><span style={{color:B.t3}}>Запрашиваемая сумма:</span><div className="font-bold mt-0.5" style={{color:B.t1}}>{fmtByn(req.requestedAmount||0)}</div></div>
            <div><span style={{color:B.t3}}>Тип процедуры:</span><div className="font-semibold mt-0.5" style={{color:tierInfo?.color}}>{tierInfo?.full}</div></div>
            {req.approvedLimit && <div><span style={{color:B.t3}}>Одобренный лимит:</span><div className="font-bold mt-0.5" style={{color:B.green}}>{fmtByn(req.approvedLimit)}</div></div>}
            {req.approvedRate && <div><span style={{color:B.t3}}>Одобренная ставка:</span><div className="font-bold mt-0.5" style={{color:B.t1}}>{req.approvedRate}%</div></div>}
            {req.accountNumber && <div><span style={{color:B.t3}}>Счёт (АБС):</span><div className="font-semibold mono mt-0.5" style={{color:B.accent}}>{req.accountNumber}</div></div>}
          </div>
        </Card>

        {/* Scoring with expandable details */}
        <ScoringDetailBlock req={req} setToast={setToast}/>

        {/* History timeline */}
        <HistoryTimeline history={req.history} currentStage={req.stage}/>

        {/* Comments */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Комментарии</h3>
          <div className="space-y-1.5 mb-3 max-h-36 overflow-y-auto">{comments.length===0?<div className="text-xs py-2 text-center" style={{color:B.t3}}>Нет</div>:
          comments.map((c,i)=><div key={i} className="flex gap-2 text-xs p-2 rounded-lg bg-slate-50"><div className="w-1 rounded-full shrink-0" style={{background:B.accent}}/><div className="min-w-0"><div style={{color:B.t1}}>{c.text}</div><div className="mt-0.5" style={{color:B.t3}}>{c.user} · {c.date}</div></div></div>)}</div>
          <div className="flex gap-2"><input value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addComment(newComment)} placeholder="Комментарий..." className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200" style={{color:B.t1}}/><Btn size="sm" onClick={()=>addComment(newComment)} disabled={!newComment.trim()}>Добавить</Btn></div>
        </Card>
      </div>

      <div className="space-y-5">
        {/* Documents */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Документы</h3>
          <div className="space-y-1.5">{Object.entries(req.docs||{}).map(([key,val])=>{
            const isOk = val===true||val==="signed"||val==="signed_all"||val==="signed_bank";
            const status = val===true?"✓":val==="signed"?"подписан":val==="signed_bank"?"банк ✓":val==="signed_all"?"все ✓":val==="pending_bank"?"ожидает банк":val==="pending"?"ожидает":val||"";
            // Synthetic or real doc id
            const existing = DOCUMENTS_REGISTRY.find(d => d.docType===key && d.relatedTo?.reqId===req.id);
            const targetId = existing?.id || `SYNTH:${key}:${req.id}:`;
            const handleClick = () => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("oborotka:open-doc",{detail:{docId:targetId}}));
              }
            };
            return <button key={key} onClick={handleClick}
              className="w-full flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 hover:bg-blue-50 transition-colors text-left group">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {isOk?<CheckCircle size={14} style={{color:B.green}}/>:<Clock size={14} style={{color:B.yellow}}/>}
                <FileText size={11} className="shrink-0" style={{color:B.accent}}/>
                <span className="text-[11px] truncate group-hover:underline" style={{color:B.accent}}>{DOC_KEY_LABELS[key]||DOC_TYPE_LABELS[key]||key}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px]" style={{color:B.t3}}>{status}</span>
                <ChevronRight size={12} style={{color:B.t3}} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
              </div>
            </button>;
          })}</div>
        </Card>
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════
// ASSIGNMENTS MODULE (Branch 6)
// ═══════════════════════════════════════

const ASSIGNMENT_ACTION_LABELS = {
  docs_uploaded: "Документы загружены поставщиком",
  debtor_notified: "Уведомление отправлено должнику",
  debtor_opened_notification: "Должник открыл уведомление",
  debtor_confirmed: "Должник подписал акт сверки",
  checked_ok: "Комплект проверен",
  returned_to_supplier: "Возврат поставщику",
  ds_generated: "ДС сформировано",
  ds_signed_bank: "ДС подписано банком",
  ds_signed_client: "ДС подписано клиентом",
  payment_approved: "Разрешение на оплату",
  paid: "Оплачено",
  client_reminded: "Напоминание клиенту отправлено",
  batch_usko_check: "Пачечная проверка комплектов",
  batch_sign_ds: "Пачечная подпись ДС",
  batch_pay: "Пачечное проведение оплаты",
};

// Badge for priority/waiting on assignment card
// ─── ASSIGNMENTS UX REDESIGN: Table View ───
// ─── AssignmentWorkflowHealthBanner: funnel visualization for assignments ───
// Mirrors WorkflowHealthBanner's pattern: 4 phase cards with chevron arrows,
// expand on click to show micro-stages. Shows load indicators (empty/normal/overload)
// and overdue counts.
function AssignmentWorkflowHealthBanner({assignmentsData, onPhaseClick, activePhase, onStageClick, activeStage}) {
  const OVERLOAD_THRESHOLD = 5;

  const [expanded, setExpanded] = usePersistedState("assignments-funnel-expanded", false, v => v === true || v === false || v === "true" || v === "false");
  const expandedBool = typeof expanded === "string" ? expanded === "true" : expanded;
  const setExpandedBool = (v) => setExpanded(Boolean(v));

  // Exclude final state "paid" and error state "returned_to_supplier" from main funnel
  const activeAssignments = (assignmentsData || []).filter(a => a.stage !== "paid");

  // Phase stats
  const phaseStats = ASSIGNMENT_PHASES.map(phase => {
    const items = activeAssignments.filter(a => getAssignmentPhase(a.stage) === phase.id);
    const overdueCount = items.filter(a => {
      const limit = ASSIGNMENT_SLA_LIMITS[a.stage];
      if (!limit || limit.days === 0) return false;
      const days = typeof getAssignmentDaysOnStage === "function" ? getAssignmentDaysOnStage(a) : 0;
      return days > limit.days;
    }).length;
    return {...phase, count: items.length, overdueCount};
  });

  // Stage stats for currently-expanded phase (when user clicks a phase)
  const stageStatsForPhase = (phaseId) => {
    return ASSIGNMENT_STAGES
      .filter(s => s.phase === phaseId)
      .map(s => {
        const items = activeAssignments.filter(a => a.stage === s.id);
        const overdueCount = items.filter(a => {
          const limit = ASSIGNMENT_SLA_LIMITS[a.stage];
          if (!limit || limit.days === 0) return false;
          const days = typeof getAssignmentDaysOnStage === "function" ? getAssignmentDaysOnStage(a) : 0;
          return days > limit.days;
        }).length;
        return {...s, count: items.length, overdueCount};
      });
  };

  const getLoad = (count) => count === 0 ? "empty" : count >= OVERLOAD_THRESHOLD ? "overload" : "normal";

  const totalCount = phaseStats.reduce((s, p) => s + p.count, 0);
  const totalOverdue = phaseStats.reduce((s, p) => s + p.overdueCount, 0);

  // Currently-showing stages (if a phase is active — show its stages)
  const visibleStages = activePhase && activePhase !== "all" ? stageStatsForPhase(activePhase) : null;

  return <Card className="mb-5">
    <button onClick={() => setExpandedBool(!expandedBool)}
      className="w-full flex items-center justify-between gap-3 p-3 hover:bg-slate-50 transition-colors text-left">
      <div className="flex items-center gap-2">
        {expandedBool ? <ChevronDown size={14} style={{color: B.t3}}/> : <ChevronRight size={14} style={{color: B.t3}}/>}
        <span className="text-sm font-bold" style={{color: B.t1}}>Воронка уступок</span>
        <span className="text-[10px]" style={{color: B.t3}}>
          · {totalCount} {totalCount === 1 ? "уступка" : (totalCount >= 2 && totalCount <= 4) ? "уступки" : "уступок"} в работе
          {totalOverdue > 0 && <span style={{color: B.red}}> · {totalOverdue} {totalOverdue === 1 ? "просрочка" : "просрочек"}</span>}
        </span>
      </div>
      <span className="text-[10px]" style={{color: B.t3}}>{expandedBool ? "Свернуть" : "Развернуть"}</span>
    </button>

    {expandedBool && <div className="p-4 pt-0">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[10px]" style={{color: B.t3}}>Кликните на фазу или этап для фильтрации списка</div>
        <div className="flex items-center gap-3 text-[10px]" style={{color: B.t3}}>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{background: B.border}}/>Пусто</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{background: B.accent}}/>Норма</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{background: B.yellow}}/>≥{OVERLOAD_THRESHOLD} перегруз</div>
          <div className="flex items-center gap-1"><AlertTriangle size={10} style={{color: B.red}}/>Просрочки</div>
        </div>
      </div>

      {/* 4 phase cards */}
      <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
        {phaseStats.map((p, idx) => {
          const load = getLoad(p.count);
          const color = load === "empty" ? B.border : load === "overload" ? B.yellow : B.accent;
          const bg = load === "empty" ? "#FAFAFA" : load === "overload" ? B.yellowL : B.accentL + "40";
          const isActive = activePhase === p.id;
          const hasOverdue = p.overdueCount > 0;
          const wordForm = p.count === 1 ? "уступка" : (p.count >= 2 && p.count <= 4) ? "уступки" : "уступок";

          return <React.Fragment key={p.id}>
            <button onClick={() => onPhaseClick && onPhaseClick(p.id)}
              className="relative flex-1 min-w-[140px] flex flex-col items-stretch rounded-xl overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5 text-left"
              style={{
                background: "white",
                border: isActive ? `2px solid ${color}` : `1px solid ${B.border}`,
              }}>
              <div className="h-1" style={{background: color}}/>

              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold mono"
                style={{background: "#F1F5F9", color: B.t3}}>
                {idx + 1}/{phaseStats.length}
              </div>

              <div className="px-3 pt-3 pb-1.5" style={{background: bg}}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-base">{p.icon}</span>
                  <span className="text-[10px] font-bold" style={{color: B.t1}}>{p.label}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <div className="text-2xl font-black leading-none" style={{color: load === "empty" ? B.t3 : color}}>
                    {p.count}
                  </div>
                  <div className="text-[9px] font-semibold" style={{color: B.t3}}>
                    {wordForm}
                  </div>
                </div>
                {hasOverdue && <div className="flex items-center gap-1 mt-1.5">
                  <AlertTriangle size={9} style={{color: B.red}} className="animate-pulse"/>
                  <span className="text-[9px] font-bold" style={{color: B.red}}>
                    {p.overdueCount} {p.overdueCount === 1 ? "просрочка" : "просрочек"}
                  </span>
                </div>}
              </div>

              <div className="px-3 py-2 border-t flex-1 space-y-1.5" style={{borderColor: B.border}}>
                <div className="text-[10px] font-medium leading-tight" style={{color: isActive ? color : B.t2}}>
                  {p.description}
                </div>
                {p.bankAction && <div className="flex items-start gap-1 pt-1.5 border-t border-dashed" style={{borderColor: B.border}}>
                  <span className="text-[9px] shrink-0 mt-0.5" style={{color: B.t3}}>Что делает банк:</span>
                </div>}
                {p.bankAction && <div className="text-[10px] font-semibold leading-tight" style={{color: B.t1}}>
                  {p.bankAction}
                </div>}
                {p.actorsInvolved && <div className="text-[9px] italic leading-tight pt-1 border-t border-dashed" style={{color: B.t3, borderColor: B.border}}>
                  Участники: {p.actorsInvolved}
                </div>}
              </div>
            </button>

            {idx < phaseStats.length - 1 && <div className="flex items-center shrink-0 px-1" style={{color: B.t3}}>
              <ChevronRight size={18}/>
            </div>}
          </React.Fragment>;
        })}
      </div>

      {/* Micro-stages for active phase */}
      {visibleStages && visibleStages.length > 0 && <div className="mt-3 p-3 rounded-xl" style={{background: "#F8FAFC", border: `1px dashed ${B.border}`}}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Фаза «{ASSIGNMENT_PHASES.find(p => p.id === activePhase)?.label}» — {visibleStages.length} {visibleStages.length === 1 ? "этап" : "этапов"} внутри
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {visibleStages.map((s, idx) => {
            const isStageActive = activeStage === s.id;
            const isActionable = s.actor === "bank" || s.actor === "platform";
            return <button key={s.id} onClick={() => onStageClick && onStageClick(s.id)}
              className="flex items-start gap-3 p-2.5 rounded-lg border transition-all hover:shadow-sm text-left"
              style={isStageActive
                ? {background: s.color + "15", borderColor: s.color, borderWidth: 2}
                : {background: "white", borderColor: B.border}}>
              {/* Number circle */}
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black"
                style={{background: s.color + "20", color: s.color}}>
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                {/* Stage name + count */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold" style={{color: B.t1}}>{s.label}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black"
                    style={{background: s.count > 0 ? s.color + "30" : "#F1F5F9", color: s.count > 0 ? s.color : B.t3}}>
                    {s.count}
                  </span>
                  {s.overdueCount > 0 && <span className="text-[9px] font-bold flex items-center gap-0.5" style={{color: B.red}}>
                    <AlertTriangle size={9} className="animate-pulse"/>
                    {s.overdueCount}
                  </span>}
                </div>

                {/* Who acts */}
                {s.whoActs && <div className="text-[9px] font-semibold" style={{color: isActionable ? s.color : B.t3}}>
                  {s.whoActs}
                </div>}

                {/* Action hint */}
                {s.actionHint && <div className="text-[10px] leading-tight" style={{color: B.t2}}>
                  {s.actionHint}
                </div>}
              </div>
            </button>;
          })}
        </div>
      </div>}
    </div>}
  </Card>;
}

function AssignmentTableView({items, onSelect, onSelectBatch, batchMode, selectedIds, toggleSelect, setToast}) {
  const [sortBy, setSortBy] = usePersistedState("table-sort-assignment", {col: "created", dir: "desc"});

  const sorted = [...items].sort((a, b) => {
    const dir = sortBy.dir === "asc" ? 1 : -1;
    switch(sortBy.col) {
      case "id": return a.id.localeCompare(b.id) * dir;
      case "amount": return ((a.amount||0) - (b.amount||0)) * dir;
      case "supplier": {
        const sa = COMPANIES.find(c=>c.id===a.creditorId)?.name || "";
        const sb = COMPANIES.find(c=>c.id===b.creditorId)?.name || "";
        return sa.localeCompare(sb) * dir;
      }
      case "debtor": {
        const da = COMPANIES.find(c=>c.id===a.debtorId)?.name || "";
        const db = COMPANIES.find(c=>c.id===b.debtorId)?.name || "";
        return da.localeCompare(db) * dir;
      }
      case "phase": {
        const pa = ASSIGNMENT_PHASES.findIndex(p => p.id === getAssignmentPhase(a.stage));
        const pb = ASSIGNMENT_PHASES.findIndex(p => p.id === getAssignmentPhase(b.stage));
        return (pa - pb) * dir;
      }
      case "sla": {
        const sa = getAssignmentSlaInfo(a).days;
        const sb = getAssignmentSlaInfo(b).days;
        return (sa - sb) * dir;
      }
      case "created": return (new Date(a.createdDate) - new Date(b.createdDate)) * dir;
      default: return 0;
    }
  });

  // Pagination (25 per page)
  const PAGE_SIZE = 25;
  const {page, setPage, totalPages, slicedItems, total} = usePagination(sorted, PAGE_SIZE);

  const toggleSort = (col) => setSortBy(prev => ({
    col,
    dir: prev.col === col && prev.dir === "desc" ? "asc" : "desc",
  }));

  const SortableHeader = ({col, children, align="left"}) => (
    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none"
      style={{color: B.t3, textAlign: align}}
      onClick={()=>toggleSort(col)}>
      <div className="inline-flex items-center gap-1">
        {children}
        {sortBy.col === col && <span className="text-[10px]">{sortBy.dir==="desc"?"▼":"▲"}</span>}
      </div>
    </th>
  );

  const exportCsv = () => {
    const rows = [
      ["ID", "Сделка", "Поставщик", "Должник", "Сумма", "ТТН", "Фаза", "Статус", "SLA дней", "Создано"],
      ...sorted.map(a => {
        const supplier = COMPANIES.find(c=>c.id===a.creditorId)?.name || "";
        const debtor = COMPANIES.find(c=>c.id===a.debtorId)?.name || "";
        const phase = ASSIGNMENT_PHASES.find(p => p.id === getAssignmentPhase(a.stage))?.label || "";
        const stage = ASSIGNMENT_STAGES.find(s => s.id === a.stage)?.label || a.stage;
        const sla = getAssignmentSlaInfo(a);
        return [a.id, a.dealId, supplier, debtor, a.amount, a.ttnNumber || "", phase, stage, sla.days, a.createdDate];
      })
    ];
    const csv = rows.map(r => r.map(v => `"${v ?? ""}"`).join(";")).join("\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `assignments-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setToast && setToast({msg: "CSV экспортирован", type: "success"});
    } catch(e) { setToast && setToast({msg: "Ошибка экспорта", type: "error"}); }
  };

  return <Card className="overflow-hidden">
    <div className="flex items-center justify-between p-3 border-b" style={{borderColor: B.border}}>
      <div className="text-xs" style={{color: B.t2}}>
        Показано: <strong style={{color: B.t1}}>{sorted.length}</strong> уступок
        {batchMode && selectedIds.length > 0 && <span> · выбрано <strong style={{color: B.accent}}>{selectedIds.length}</strong></span>}
      </div>
      <div className="flex items-center gap-2">
        {batchMode && selectedIds.length > 0 && <Btn size="sm" icon={Check} onClick={onSelectBatch}>
          Обработать выбранные ({selectedIds.length})
        </Btn>}
        <Btn size="sm" variant="ghost" icon={Download} onClick={exportCsv}>CSV</Btn>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            {batchMode && <th className="w-8 px-2 py-2"></th>}
            <SortableHeader col="id">ID</SortableHeader>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{color:B.t3}}>Сделка</th>
            <SortableHeader col="supplier">Поставщик</SortableHeader>
            <SortableHeader col="debtor">Должник</SortableHeader>
            <SortableHeader col="amount" align="right">Сумма</SortableHeader>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{color:B.t3}}>ТТН</th>
            <SortableHeader col="phase">Фаза</SortableHeader>
            <SortableHeader col="sla" align="right">SLA</SortableHeader>
            <SortableHeader col="created">Создано</SortableHeader>
            <th className="w-8 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {slicedItems.map(a => {
            const supplier = COMPANIES.find(c => c.id === a.creditorId);
            const debtor = COMPANIES.find(c => c.id === a.debtorId);
            const stage = ASSIGNMENT_STAGES.find(s => s.id === a.stage);
            const phase = ASSIGNMENT_PHASES.find(p => p.id === getAssignmentPhase(a.stage));
            const sla = getAssignmentSlaInfo(a);
            const bankOver = isAssignmentBankOverdue(a);
            const waitingClient = isAssignmentWaitingClient(a);
            const isPaid = a.stage === "paid";
            const isChecked = selectedIds?.includes(a.id);

            return <tr key={a.id}
              onClick={()=>batchMode ? toggleSelect(a.id) : onSelect(a)}
              className="border-t hover:bg-blue-50 cursor-pointer transition-colors"
              style={{
                borderColor: B.border,
                background: bankOver ? "#FEF2F2" : isPaid ? "#F0FDF4" : isChecked ? B.accentL + "30" : "white"
              }}>
              {batchMode && <td className="px-2 py-2 text-center">
                <input type="checkbox" checked={isChecked} onChange={()=>toggleSelect(a.id)} onClick={e=>e.stopPropagation()} className="cursor-pointer"/>
              </td>}
              <td className="px-3 py-2 mono font-semibold" style={{color: isPaid ? B.green : B.accent}}>{a.id}</td>
              <td className="px-3 py-2 mono text-[10px]" style={{color: B.t3}}>{a.dealId}</td>
              <td className="px-3 py-2 truncate max-w-[180px]" style={{color: B.t1}}>{supplier?.name || "—"}</td>
              <td className="px-3 py-2 truncate max-w-[180px]" style={{color: B.t2}}>{debtor?.name || "—"}</td>
              <td className="px-3 py-2 text-right mono font-bold" style={{color: B.t1}}>{fmtByn(a.amount)}</td>
              <td className="px-3 py-2 text-[10px]" style={{color: B.t3}}>{a.ttnNumber || "—"}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>{phase?.icon}</span>
                  <span className="text-[11px]" style={{color: stage?.color || B.t2}}>{stage?.label || a.stage}</span>
                  {a.stage === "usko_checking" && !a.uskoTakenBy && <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-black animate-pulse"
                    style={{background: B.accent, color: "white"}}>
                    🆕 НОВАЯ
                  </span>}
                </div>
              </td>
              <td className="px-3 py-2 text-right">
                {isPaid ? <span className="text-[10px]" style={{color: B.green}}>✓</span>
                  : <div className="inline-flex items-center gap-1.5">
                    <span className="mono font-bold text-[11px]" style={{color: bankOver ? B.orange : (waitingClient && sla.overdue) ? B.red : B.t2}}>
                      {sla.days}д{sla.limit > 0 ? ` / ${sla.limit}` : ""}
                    </span>
                    {bankOver && <span title="Банк затянул — действие за УСКО/подписантом" className="text-[8px] font-black px-1 rounded" style={{background: B.orange + "20", color: B.orange}}>⏱ Банк</span>}
                    {waitingClient && sla.overdue && <span title="Клиент/должник не реагирует" className="text-[8px] font-black px-1 rounded" style={{background: B.red + "20", color: B.red}}>⚠ Клиент</span>}
                  </div>}
              </td>
              <td className="px-3 py-2 text-[10px]" style={{color: B.t3}}>{a.createdDate}</td>
              <td className="px-2 py-2 text-right">
                <ChevronRight size={14} style={{color: B.t3}}/>
              </td>
            </tr>;
          })}
          {total === 0 && <tr>
            <td colSpan={batchMode ? 11 : 10}>
              <EmptyState icon={Package} title="Уступки не найдены"
                subtitle="Попробуйте изменить фильтры или поисковый запрос"/>
            </td>
          </tr>}
        </tbody>
      </table>
    </div>
    <Pagination page={page} setPage={setPage} totalPages={totalPages} total={total} pageSize={PAGE_SIZE}/>
  </Card>;
}

// ─── 4-phase workflow visualization (simplified) ───
function AssignmentPhaseWorkflow({asg, compact=false}) {
  const currentPhase = getAssignmentPhase(asg.stage);
  const currentStage = ASSIGNMENT_STAGES.find(s => s.id === asg.stage);
  const phaseIdx = ASSIGNMENT_PHASES.findIndex(p => p.id === currentPhase);
  const isReturned = asg.stage === "returned_to_supplier";
  const isPaid = asg.stage === "paid";

  if (isReturned) {
    return <Card className="p-3 mb-4" style={{background: B.redL, borderColor: "#FECACA", borderWidth: 2}}>
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} style={{color: B.red}}/>
        <span className="text-xs font-bold" style={{color: B.red}}>Возврат поставщику</span>
        {asg.returnReason?.comment && <span className="text-[10px]" style={{color: B.t2}}>— {asg.returnReason.comment}</span>}
      </div>
    </Card>;
  }

  return <Card className="p-3 mb-4">
    <div className="flex items-center gap-1">
      {ASSIGNMENT_PHASES.map((phase, idx) => {
        const isDone = isPaid || idx < phaseIdx;
        const isCurrent = idx === phaseIdx && !isPaid;
        const color = isDone ? B.green : isCurrent ? B.accent : B.border;
        return <React.Fragment key={phase.id}>
          <div className="flex-1 flex flex-col items-center gap-1 relative">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black"
              style={{background: color === B.border ? "#F8FAFC" : color + "20",
                border: `2px solid ${color}`,
                color: color === B.border ? B.t3 : color}}>
              {isDone ? <Check size={18}/> : phase.icon}
            </div>
            <div className="text-[10px] font-semibold text-center leading-tight"
              style={{color: isCurrent ? B.accent : isDone ? B.green : B.t3}}>
              {phase.label}
            </div>
            {isCurrent && currentStage && <div className="text-[9px] leading-tight text-center max-w-[100px]" style={{color: B.t2}}>
              {currentStage.label}
            </div>}
          </div>
          {idx < ASSIGNMENT_PHASES.length - 1 && <div className="h-px flex-1 mt-[-20px]"
            style={{background: idx < phaseIdx ? B.green : B.border}}/>}
        </React.Fragment>;
      })}
    </div>
  </Card>;
}

// ─── Extended filters bar for assignments ───
function AssignmentFiltersBar({
  phaseFilter, setPhaseFilter,
  amountFilter, setAmountFilter,
  supplierFilter, setSupplierFilter,
  debtorFilter, setDebtorFilter,
  dateFilter, setDateFilter,
  search, setSearch,
  suppliers, debtors,
}) {
  const chips = [];
  if (phaseFilter !== "all") chips.push({key:"phase", label:`Фаза: ${ASSIGNMENT_PHASES.find(p=>p.id===phaseFilter)?.label}`, onRemove:()=>setPhaseFilter("all"), color:B.accent});
  if (amountFilter !== "all") chips.push({key:"amount", label: amountFilter==="small"?"≤50K" : amountFilter==="medium"?"50-500K" : ">500K", onRemove:()=>setAmountFilter("all"), color:B.purple});
  if (supplierFilter !== "all") chips.push({key:"supplier", label:`Поставщик: ${suppliers.find(s=>s.id===supplierFilter)?.name||supplierFilter}`, onRemove:()=>setSupplierFilter("all"), color:"#0891B2"});
  if (debtorFilter !== "all") chips.push({key:"debtor", label:`Должник: ${debtors.find(d=>d.id===debtorFilter)?.name||debtorFilter}`, onRemove:()=>setDebtorFilter("all"), color:"#06B6D4"});
  if (dateFilter !== "all") chips.push({key:"date", label: dateFilter==="week"?"За неделю":"За месяц", onRemove:()=>setDateFilter("all"), color:B.accent});
  if (search) chips.push({key:"search", label:`Поиск: «${search}»`, onRemove:()=>setSearch(""), color:B.t2});

  const resetAll = () => {
    setPhaseFilter("all"); setAmountFilter("all");
    setSupplierFilter("all"); setDebtorFilter("all");
    setDateFilter("all"); setSearch("");
  };

  return <div className="space-y-3 mb-4">
    {/* Search + quick filters */}
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex-1 min-w-[240px]">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{color:B.t3}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="ID, ТТН, сделка..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-xs"
            style={{borderColor: search ? B.accent : B.border, background:"white", color:B.t1}}/>
        </div>
      </div>

      {/* Phase filter */}
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg border bg-white" style={{borderColor:B.border}}>
        <span className="text-[10px] font-semibold" style={{color:B.t3}}>Фаза:</span>
        <button onClick={()=>setPhaseFilter("all")} className="px-2 py-0.5 rounded text-[10px] font-bold"
          style={phaseFilter==="all"?{background:B.accent,color:"white"}:{color:B.t2}}>Все</button>
        {ASSIGNMENT_PHASES.map(p => (
          <button key={p.id} onClick={()=>setPhaseFilter(p.id)} className="px-2 py-0.5 rounded text-[10px] font-bold"
            style={phaseFilter===p.id?{background:B.accent,color:"white"}:{color:B.t2}}>
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      {/* Amount filter */}
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg border bg-white" style={{borderColor:B.border}}>
        <span className="text-[10px] font-semibold" style={{color:B.t3}}>Сумма:</span>
        {[{id:"all",label:"Все"},{id:"small",label:"≤50K"},{id:"medium",label:"50-500K"},{id:"large",label:">500K"}].map(o =>
          <button key={o.id} onClick={()=>setAmountFilter(o.id)} className="px-2 py-0.5 rounded text-[10px] font-bold"
            style={amountFilter===o.id?{background:B.accent,color:"white"}:{color:B.t2}}>{o.label}</button>
        )}
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg border bg-white" style={{borderColor:B.border}}>
        <span className="text-[10px] font-semibold" style={{color:B.t3}}>Период:</span>
        {[{id:"all",label:"Весь"},{id:"week",label:"Неделя"},{id:"month",label:"Месяц"}].map(o =>
          <button key={o.id} onClick={()=>setDateFilter(o.id)} className="px-2 py-0.5 rounded text-[10px] font-bold"
            style={dateFilter===o.id?{background:B.accent,color:"white"}:{color:B.t2}}>{o.label}</button>
        )}
      </div>
    </div>

    {/* Supplier/debtor dropdowns */}
    <div className="flex items-center gap-2 flex-wrap">
      <select value={supplierFilter} onChange={e=>setSupplierFilter(e.target.value)}
        className="px-3 py-1.5 rounded-lg border text-xs bg-white" style={{borderColor:B.border, color:B.t1}}>
        <option value="all">Все поставщики</option>
        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select value={debtorFilter} onChange={e=>setDebtorFilter(e.target.value)}
        className="px-3 py-1.5 rounded-lg border text-xs bg-white" style={{borderColor:B.border, color:B.t1}}>
        <option value="all">Все должники</option>
        {debtors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </div>

    {/* Active chips */}
    {chips.length > 0 && <Card className="p-2" style={{background: B.accentL+"20", borderColor: B.accent+"40"}}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{color:B.t3}}>
          Фильтры:
        </span>
        {chips.map(chip => (
          <button key={chip.key} onClick={chip.onRemove}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold hover:opacity-80"
            style={{background: chip.color+"15", color: chip.color, border:`1px solid ${chip.color}40`}}>
            {chip.label}<X size={10}/>
          </button>
        ))}
        <button onClick={resetAll} className="ml-auto text-[10px] font-semibold hover:underline" style={{color:B.t2}}>
          Сбросить все
        </button>
      </div>
    </Card>}
  </div>;
}

function AssignmentBadge({asg}) {
  const bankOver = isAssignmentBankOverdue(asg);
  const waiting = isAssignmentWaitingClient(asg);
  const info = getAssignmentSlaInfo(asg);

  if (bankOver) {
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{background:B.redL,color:B.red}}>
      🔥 SLA БАНКА {info.days}д/{info.limit}
    </span>;
  }
  if (waiting) {
    const level = getClientWaitLevel(asg);
    const colorMap = {normal:B.t3, warning:B.yellow, urgent:B.orange, critical:B.red};
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{background:"#FFFBEB", color:colorMap[level]}}>
      ⏳ КЛИЕНТ {info.days}д
    </span>;
  }
  return null;
}

// Assignment card
function AssignmentCard({asg, onClick}) {
  const stage = ASSIGNMENT_STAGES.find(s=>s.id===asg.stage);
  const bankOver = isAssignmentBankOverdue(asg);
  const isDone = asg.stage === "paid";
  const isReturned = asg.stage === "returned_to_supplier";
  const creditor = COMPANIES.find(c=>c.id===asg.creditorId);
  const debtor = COMPANIES.find(c=>c.id===asg.debtorId);

  return <Card className={`cursor-pointer transition-all ${isDone?"opacity-70 hover:opacity-100":"hover:shadow-md hover:-translate-y-0.5"}`}
    onClick={onClick}
    style={bankOver ? {borderLeft:`4px solid ${B.red}`,background:"#FEF2F2"}
      : isReturned ? {borderLeft:`4px solid ${B.red}`}
      : isDone ? {} : {borderLeft:`3px solid ${stage?.color||B.border}`}}>
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-bold mono text-xs" style={{color:isDone?B.green:B.accent}}>{asg.id}</span>
          <AssignmentBadge asg={asg}/>
          <span className="font-bold mono text-xs" style={{color:B.t1}}>{fmtByn(asg.amount)}</span>
          {asg.ttnNumber && <span className="text-[10px]" style={{color:B.t3}}>{asg.ttnNumber}</span>}
        </div>
        <div className="text-xs font-medium" style={{color:B.t1}}>
          <span style={{color:B.t3}}>Поставщик:</span> {creditor?.name||"—"}
        </div>
        <div className="text-[11px]" style={{color:B.t2}}>
          <span style={{color:B.t3}}>Должник:</span> {debtor?.name||"—"}
        </div>
        {isReturned && asg.returnReason && <div className="text-[10px] mt-1 truncate" style={{color:B.red}}>
          ⚠ {asg.returnReason.comment}
        </div>}
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[10px] font-semibold" style={{color:stage?.color||B.t3}}>
          {isDone?"✓":"●"} {stage?.label||asg.stage}
        </div>
        <div className="text-[10px]" style={{color:B.t3}}>{asg.createdDate}</div>
      </div>
      <ChevronRight size={16} style={{color:B.t3}} className="shrink-0"/>
    </div>
  </Card>;
}

// Assignment workflow (3-stage compact)
function AssignmentWorkflow({asg}) {
  const stages = ASSIGNMENT_STAGES.filter(s => s.id !== "returned_to_supplier");
  const currentIdx = stages.findIndex(s => s.id === asg.stage);
  if (currentIdx === -1) {
    // Returned case — show special
    return <Card className="p-4 mb-5" style={{background:B.redL, borderColor:"#FECACA"}}>
      <div className="text-xs font-bold mb-1" style={{color:B.red}}>⚠ ВОЗВРАТ ПОСТАВЩИКУ</div>
      <div className="text-[11px]" style={{color:B.t2}}>Поставщик получил запрос недостающих документов. Ожидаем исправления.</div>
    </Card>;
  }
  const prev = currentIdx > 0 ? stages[currentIdx-1] : null;
  const current = stages[currentIdx];
  const next = currentIdx < stages.length-1 ? stages[currentIdx+1] : null;
  const days = getAssignmentDaysOnStage(asg);

  return <Card className="p-4 mb-5">
    <div className="grid grid-cols-3 gap-2">
      {prev ? <div className="p-3 rounded-xl" style={{background:B.greenL+"50", border:`1px solid ${B.green}40`}}>
        <div className="flex items-center gap-1.5 mb-1"><CheckCircle size={11} style={{color:B.green}}/><span className="text-[9px] font-bold uppercase tracking-wider" style={{color:B.green}}>Предыдущий</span></div>
        <div className="text-xs font-semibold" style={{color:B.t1}}>{prev.label}</div>
      </div> : <div className="p-3 rounded-xl" style={{background:"#F8FAFC",border:`1px solid ${B.border}`}}>
        <div className="flex items-center gap-1.5 mb-1"><FileText size={11} style={{color:B.t3}}/><span className="text-[9px] font-bold uppercase tracking-wider" style={{color:B.t3}}>Создана</span></div>
        <div className="text-xs font-semibold" style={{color:B.t1}}>Документы загружены</div>
        <div className="text-[10px] mt-0.5" style={{color:B.t3}}>{asg.createdDate}</div>
      </div>}

      <div className="p-3.5 rounded-xl" style={{background:current.color+"10", border:`2px solid ${current.color}`}}>
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{background:current.color}}/>
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{color:current.color}}>Текущий</span>
        </div>
        <div className="text-sm font-bold" style={{color:current.color}}>{current.label}</div>
        <div className="text-[10px] mt-1" style={{color:B.t2}}>{days}д на этапе</div>
      </div>

      {next ? <div className="p-3 rounded-xl" style={{background:"#F8FAFC",border:`1px solid ${B.border}`}}>
        <div className="flex items-center gap-1.5 mb-1"><ChevronRight size={11} style={{color:B.t3}}/><span className="text-[9px] font-bold uppercase tracking-wider" style={{color:B.t3}}>Следующий</span></div>
        <div className="text-xs font-semibold" style={{color:B.t2}}>{next.label}</div>
      </div> : <div className="p-3 rounded-xl" style={{background:B.greenL+"30", border:`1px solid ${B.green}40`}}>
        <div className="flex items-center gap-1.5 mb-1"><CheckCircle size={11} style={{color:B.green}}/><span className="text-[9px] font-bold uppercase tracking-wider" style={{color:B.green}}>Финал</span></div>
        <div className="text-xs font-semibold" style={{color:B.t1}}>Оплачено</div>
      </div>}
    </div>
  </Card>;
}

// Client activity card (shows who's holding the assignment)
function ClientActivityCard({asg}) {
  const stage = ASSIGNMENT_STAGES.find(s=>s.id===asg.stage);
  if (!stage || (stage.actor !== "debtor" && stage.actor !== "supplier")) return null;
  const isSupplier = stage.actor === "supplier";
  const client = isSupplier ? COMPANIES.find(c=>c.id===asg.creditorId) : COMPANIES.find(c=>c.id===asg.debtorId);
  const activity = isSupplier ? asg.clientActivity?.supplier : asg.clientActivity?.debtor;
  const level = getClientWaitLevel(asg);
  const days = getAssignmentDaysOnStage(asg);

  const levelCfg = {
    normal: {bg:"#F8FAFC", color:B.t3, label:"Обычное ожидание"},
    warning: {bg:"#FFFBEB", color:B.yellow, label:"Давно не отвечает"},
    urgent: {bg:"#FFF7ED", color:B.orange, label:"Срочное напоминание"},
    critical: {bg:B.redL, color:B.red, label:"Передать в работу!"},
  }[level];

  return <Card className="p-4 mb-5" style={{background:levelCfg.bg, borderColor:levelCfg.color+"40", borderWidth:1}}>
    <div className="flex items-start gap-3">
      <Clock size={20} style={{color:levelCfg.color}} className="shrink-0 mt-0.5"/>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{color:levelCfg.color}}>Ожидание клиента · {levelCfg.label}</div>
        <div className="text-sm font-bold" style={{color:B.t1}}>{isSupplier?"Поставщик":"Должник"}: {client?.name||"—"}</div>
        <div className="mt-2 space-y-0.5">
          {activity?.notifiedAt && <div className="text-[11px]" style={{color:B.t2}}>📨 Уведомлён: {activity.notifiedAt}</div>}
          {activity?.lastOpenedAt
            ? <div className="text-[11px]" style={{color:B.t2}}>👁 Открыл уведомление: {activity.lastOpenedAt}</div>
            : <div className="text-[11px]" style={{color:B.t2}}>👁 Не открывал уведомление</div>
          }
          <div className="text-[11px] font-semibold" style={{color:levelCfg.color}}>💤 Без активности: {days}д</div>
        </div>
        <div className="flex gap-2 mt-3">
          <Btn size="sm" variant="ghost" className="flex-1">📧 Отправить напоминание</Btn>
          {level === "critical" && <Btn size="sm" variant="danger" className="flex-1">⚙ Передать ответственному</Btn>}
        </div>
      </div>
    </div>
  </Card>;
}

// Assignment action block (role-specific task on assignment)
// ─── AssignmentTaskForm — unified form for all assignment stages ───
// Mirrors RequestTaskForm: header + parameters + documents + stage-specific block + primary action
function AssignmentTaskForm({asg, currentUser, onAction, setToast}) {
  const stage = ASSIGNMENT_STAGES.find(s => s.id === asg.stage);
  const phase = ASSIGNMENT_PHASES.find(p => p.id === stage?.phase);
  const canAct = canActOnAssignmentStage(currentUser, asg.stage);
  const creditor = COMPANIES.find(c => c.id === asg.creditorId);
  const debtor = COMPANIES.find(c => c.id === asg.debtorId);

  // State
  const [signing, setSigning] = useState(false);
  const [checkedDocs, setCheckedDocs] = useState({dkp: false, ttn: false, eschf: false});
  const [returnToSupplierModal, setReturnToSupplierModal] = useState(false);
  const [supplierIssues, setSupplierIssues] = useState([]);
  const [supplierComment, setSupplierComment] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(asg.dsNumber ? 4 : 0);
  const [dsNumber, setDsNumber] = useState(asg.dsNumber || null);
  const [showDsPreview, setShowDsPreview] = useState(false);
  const [pin, setPin] = useState("");
  const [returnToUskoModal, setReturnToUskoModal] = useState(false);
  const [returnToUskoIssues, setReturnToUskoIssues] = useState([]);
  const [returnToUskoComment, setReturnToUskoComment] = useState("");
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [paymentDangerModal, setPaymentDangerModal] = useState(false);

  // Final / non-actionable state
  if (asg.stage === "paid") return null;
  if (!canAct) return null;

  const days = typeof getAssignmentDaysOnStage === "function" ? getAssignmentDaysOnStage(asg) : 0;
  const slaInfo = ASSIGNMENT_SLA_LIMITS[asg.stage] || {days: 5, actor: "bank"};
  const overdue = slaInfo.days > 0 && days > slaInfo.days;
  const slaText = slaInfo.days === 0
    ? "Автоматический этап"
    : overdue
      ? `⚠ ПРОСРОЧЕНО на ${days - slaInfo.days} раб.д`
      : `Осталось ${Math.max(0, slaInfo.days - days)} раб.д (SLA: ${slaInfo.days}д)`;

  // Actor label
  const actorLabelMap = {
    bank: "🏦 Банк", supplier: "👤 Поставщик", debtor: "🚚 Должник", platform: "⚙ Платформа", system: "⚙ Система",
  };
  const actorLabel = actorLabelMap[stage?.actor] || "—";

  // Handlers
  const doAdvance = (nextStage, extraData = {}, msg) => {
    setSigning(true);
    setTimeout(() => {
      setSigning(false);
      onAction && onAction(nextStage, extraData, msg);
    }, 1200);
  };

  // ─── usko_checking: generate DS ───
  const runDsGeneration = () => {
    setGenerating(true);
    setGenerationStep(1);
    setTimeout(() => {
      setGenerationStep(2);
      setTimeout(() => {
        setGenerationStep(3);
        setTimeout(() => {
          const newDsNum = `ДС-${asg.dealId || "XXX"}-${String(Math.floor(Math.random() * 900) + 100)}`;
          setDsNumber(newDsNum);
          setGenerationStep(4);
          setGenerating(false);
        }, 300);
      }, 700);
    }, 500);
  };

  // Document status badge colors
  const docStatusColor = {
    signed: {bg: B.greenL, color: B.green, label: "✓ Подписан"},
    signed_all: {bg: B.greenL, color: B.green, label: "✓ Все подписали"},
    signed_bank: {bg: B.accentL, color: B.accent, label: "✓ Банк подписал"},
    pending: {bg: B.yellowL, color: B.yellow, label: "⏳ Ожидание"},
    draft: {bg: "#F1F5F9", color: B.t2, label: "📝 Черновик"},
    rejected: {bg: B.redL, color: B.red, label: "✗ Отклонён"},
    sent: {bg: B.accentL, color: B.accent, label: "📤 Отправлен"},
    not_applicable: {bg: "#F8FAFC", color: B.t3, label: "— Не требуется"},
  };

  const allDocs = [
    {key: "dkp", label: "ДКП", status: asg.docs?.dkp?.status || "pending", date: asg.docs?.dkp?.date},
    {key: "ttn", label: "ТТН", status: asg.docs?.ttn?.status || "pending", date: asg.docs?.ttn?.date},
    {key: "eschf", label: "ЭСЧФ", status: asg.docs?.eschf?.status || "pending", date: asg.docs?.eschf?.date},
    {key: "ds", label: "ДС", status: asg.docs?.supplementaryAgreement?.status || "not_applicable", date: asg.docs?.supplementaryAgreement?.date},
    {key: "notif", label: "Уведомление", status: asg.docs?.notification?.status || "not_applicable", date: asg.docs?.notification?.date},
  ];

  const openDoc = (docKey) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("oborotka:open-doc", {detail: {assignmentId: asg.id, docType: docKey}}));
    }
  };

  // ─── Primary action per stage ───
  let primaryAction = null;
  if (asg.stage === "usko_checking") {
    const allChecked = checkedDocs.dkp && checkedDocs.ttn && checkedDocs.eschf;
    primaryAction = {
      label: signing ? "Принимаю..." : "✓ Принять комплект и сформировать ДС",
      icon: signing ? Loader2 : CheckCircle,
      disabled: signing || !allChecked,
      onClick: () => doAdvance("ds_preparing", {uskoCheckedBy: currentUser.name, uskoCheckedDate: "2026-03-26"}, `Комплект документов принят для ${asg.id}. Формирование ДС`),
    };
  } else if (asg.stage === "ds_preparing") {
    primaryAction = {
      label: generationStep === 4
        ? (signing ? "Передача..." : "📤 Передать подписанту банка")
        : (generating ? "Генерация ДС..." : "🔄 Сформировать ДС"),
      icon: generationStep === 4 ? (signing ? Loader2 : ArrowRight) : (generating ? Loader2 : FileText),
      disabled: generationStep === 4 ? false : generating,
      onClick: generationStep === 4
        ? () => doAdvance("ds_signing_bank", {dsNumber, dsDate: "2026-03-26", docs: {...(asg.docs || {}), supplementaryAgreement: {status: "pending", number: dsNumber}}}, `ДС ${dsNumber} сформировано. Передано подписанту`)
        : runDsGeneration,
    };
  } else if (asg.stage === "ds_signing_bank") {
    primaryAction = {
      label: signing ? "Подписание..." : "🔏 Подписать ДС ЭЦП банка",
      icon: signing ? Loader2 : Pen,
      disabled: signing || pin.length !== 4,
      onClick: () => doAdvance("ds_signing_client", {signedByBank: currentUser.name, signedByBankDate: "2026-03-26", docs: {...(asg.docs || {}), supplementaryAgreement: {...(asg.docs?.supplementaryAgreement || {}), status: "signed_bank", date: "2026-03-26"}}}, "ДС подписано банком. Отправлено клиенту"),
    };
  } else if (asg.stage === "ds_signing_client") {
    primaryAction = {
      label: signing ? "Переход..." : "🧪 Mock: клиент подписал",
      icon: signing ? Loader2 : CheckCircle,
      onClick: () => doAdvance("payment_approved", {signedByClientDate: "2026-03-26", docs: {...(asg.docs || {}), supplementaryAgreement: {...(asg.docs?.supplementaryAgreement || {}), status: "signed_all", date: "2026-03-26"}}}, "Клиент подписал ДС. Переход на оплату"),
    };
  } else if (asg.stage === "payment_approved") {
    primaryAction = {
      label: signing ? "Разрешение оплаты..." : "💰 Разрешить оплату в АБС",
      icon: signing ? Loader2 : CheckCircle,
      disabled: signing || !paymentVerified,
      onClick: () => setPaymentDangerModal(true),
    };
  }

  // Payment confirmation (triggered from modal)
  const executePaymentApproval = () => {
    doAdvance("paid", {paymentApprovedBy: currentUser.name, paymentApprovedDate: "2026-03-26", paidDate: "2026-03-26"}, `💰 Оплата ${fmtByn(asg.toReceive || 0)} разрешена в АБС. Средства поступят клиенту`);
  };

  return <>
    <Card className="p-5 mb-4" style={{background: (stage?.color || B.accent) + "06", borderColor: stage?.color || B.accent, borderWidth: 2}}>
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b" style={{borderColor: B.border}}>
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background: "white", border: `1px solid ${(stage?.color || B.accent)}30`}}>
            {phase?.icon || "📦"}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{color: stage?.color || B.accent}}>
              Ваша задача
            </div>
            <div className="text-base font-bold mt-0.5" style={{color: B.t1}}>
              {stage?.label || asg.stage}
            </div>
            <div className="text-[10px] mt-1" style={{color: overdue ? B.red : B.t2}}>
              {slaText}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{background: B.accentL, color: B.accent}}>
            {phase?.icon} {phase?.label}
          </span>
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{background: "#F1F5F9", color: B.t2}}>
            {actorLabel}
          </span>
        </div>
      </div>

      {/* ─── NEW assignment banner (for usko_checking without uskoTakenBy) ─── */}
      {asg.stage === "usko_checking" && !asg.uskoTakenBy && <div className="flex items-center gap-2 p-2.5 rounded-lg mb-4" style={{background: B.accentL, borderLeft: `3px solid ${B.accent}`}}>
        <span className="text-base">🆕</span>
        <div>
          <div className="text-xs font-bold" style={{color: B.accent}}>Новая уступка</div>
          <div className="text-[10px]" style={{color: B.t2}}>Документы поступили, ждёт вашей проверки</div>
        </div>
      </div>}

      {/* ─── Block: Параметры уступки ─── */}
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Параметры уступки
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>ID · сделка</div>
            <div className="text-xs font-bold mono" style={{color: B.accent}}>{asg.id}</div>
            <div className="text-[10px] mono mt-0.5" style={{color: B.t3}}>{asg.dealId}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>Клиент (поставщик)</div>
            <div className="text-xs font-bold truncate" style={{color: B.t1}}>{creditor?.name || "—"}</div>
            <div className="text-[10px] mono mt-0.5" style={{color: B.t3}}>УНП {creditor?.unp || "—"}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>Должник</div>
            <div className="text-xs font-bold truncate" style={{color: B.t1}}>{debtor?.name || "—"}</div>
            <div className="text-[10px] mono mt-0.5" style={{color: B.t3}}>УНП {debtor?.unp || "—"}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>Сумма / К получению</div>
            <div className="text-sm font-black mono" style={{color: B.t1}}>{fmtByn(asg.amount || 0)}</div>
            {asg.toReceive && <div className="text-[10px] mono mt-0.5" style={{color: B.green}}>
              → {fmtByn(asg.toReceive)} (дисконт {fmtByn(asg.discount || 0)})
            </div>}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>Номер ТТН</div>
            <div className="text-xs mono" style={{color: B.t1}}>{asg.ttnNumber || "—"}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>Дата отгрузки</div>
            <div className="text-xs" style={{color: B.t1}}>{asg.shippingDate || "—"}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>Создана</div>
            <div className="text-xs" style={{color: B.t1}}>{asg.createdDate || "—"}</div>
          </div>
          <div>
            <div className="text-[10px]" style={{color: B.t3}}>На этапе</div>
            <div className="text-xs" style={{color: overdue ? B.red : B.t1}}>{days} раб.д</div>
          </div>
        </div>
      </div>

      {/* ─── Block: Документы (5 chips) ─── */}
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Документы уступки
        </div>
        <div className="flex flex-wrap gap-2">
          {allDocs.map(d => {
            const cfg = docStatusColor[d.status] || docStatusColor.pending;
            return <button key={d.key} onClick={() => openDoc(d.key)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all hover:shadow-sm"
              style={{background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}20`}}>
              <span>{d.label}</span>
              <span className="text-[9px] font-bold">{cfg.label}</span>
              {d.date && <span className="text-[9px] mono opacity-70">· {d.date}</span>}
              <ExternalLink size={10}/>
            </button>;
          })}
        </div>
      </div>

      {/* ─── Stage-specific block ─── */}

      {/* usko_checking: checklist */}
      {asg.stage === "usko_checking" && <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Проверка комплекта документов
        </div>
        <div className="space-y-1.5 p-3 rounded-xl" style={{background: "#F8FAFC"}}>
          {[
            {key: "dkp", label: "Договор купли-продажи (ДКП) — цена, стороны, подписи"},
            {key: "ttn", label: "ТТН — факт отгрузки, подпись должника"},
            {key: "eschf", label: "ЭСЧФ — электронный счёт-фактура (НДС)"},
          ].map(item => <label key={item.key} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1.5 rounded">
            <input type="checkbox" checked={checkedDocs[item.key]}
              onChange={e => setCheckedDocs(prev => ({...prev, [item.key]: e.target.checked}))}
              className="w-4 h-4"/>
            <span className="text-[11px]" style={{color: B.t1}}>{item.label}</span>
          </label>)}
        </div>
        <div className="text-[10px] mt-2 italic" style={{color: B.t3}}>
          <Info size={10} className="inline mr-1"/>
          Отметьте все проверенные документы, чтобы активировать кнопку приёмки
        </div>
      </div>}

      {/* ds_preparing: DS generation */}
      {asg.stage === "ds_preparing" && <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Формирование дополнительного соглашения (ДС)
        </div>

        {/* Summary of what DS will contain */}
        <div className="p-3 rounded-xl mb-3" style={{background: B.accentL + "40", borderLeft: `3px solid ${B.accent}`}}>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{color: B.accent}}>
            Данные в ДС
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2 text-[11px]">
            <div><span style={{color: B.t3}}>Сумма уступки:</span> <strong className="mono" style={{color: B.t1}}>{fmtByn(asg.amount || 0)}</strong></div>
            <div><span style={{color: B.t3}}>Дисконт:</span> <strong className="mono" style={{color: B.red}}>{fmtByn(asg.discount || 0)}</strong></div>
            <div><span style={{color: B.t3}}>К выплате:</span> <strong className="mono" style={{color: B.green}}>{fmtByn(asg.toReceive || 0)}</strong></div>
            <div><span style={{color: B.t3}}>Должник:</span> <strong style={{color: B.t1}}>{debtor?.name || "—"}</strong></div>
            <div><span style={{color: B.t3}}>ТТН:</span> <strong className="mono" style={{color: B.t1}}>{asg.ttnNumber || "—"}</strong></div>
            <div><span style={{color: B.t3}}>Отгрузка:</span> <strong style={{color: B.t1}}>{asg.shippingDate || "—"}</strong></div>
          </div>
        </div>

        {/* Generation progress */}
        {generating && <div className="p-3 rounded-xl mb-3" style={{background: B.accentL + "40", borderLeft: `3px solid ${B.accent}`}}>
          <div className="text-[10px] font-bold mb-2" style={{color: B.accent}}>Платформа формирует ДС...</div>
          <div className="space-y-1.5">
            {[
              {step: 1, label: "Подтягиваем данные из сделки"},
              {step: 2, label: "Заполняем шаблон ДС"},
              {step: 3, label: "Присваиваем номер"},
            ].map(s => <div key={s.step} className="flex items-center gap-2 text-[11px]">
              {generationStep > s.step
                ? <CheckCircle size={12} style={{color: B.green}}/>
                : generationStep === s.step
                  ? <Loader2 size={12} style={{color: B.accent}} className="animate-spin"/>
                  : <div className="w-3 h-3 rounded-full border" style={{borderColor: B.border}}/>}
              <span style={{color: generationStep >= s.step ? B.t1 : B.t3, fontWeight: generationStep === s.step ? 600 : 400}}>
                {s.label}
              </span>
            </div>)}
          </div>
        </div>}

        {/* Generated DS preview */}
        {generationStep === 4 && dsNumber && <div className="p-4 rounded-xl mb-3" style={{background: B.greenL, borderLeft: `3px solid ${B.green}`}}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background: "white"}}>
              <FileText size={20} style={{color: B.green}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{color: B.green}}>✓ ДС сформировано</div>
              <div className="text-sm font-bold mt-0.5" style={{color: B.t1}}>
                Допсоглашение <span className="mono">№{dsNumber}</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => setShowDsPreview(true)}
                  className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{color: B.accent}}>
                  <Eye size={11}/> Открыть превью
                </button>
                <span style={{color: B.t3}}>·</span>
                <button onClick={() => setToast && setToast({msg: "PDF скачан (mock)", type: "success"})}
                  className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{color: B.accent}}>
                  <Download size={11}/> Скачать PDF
                </button>
              </div>
            </div>
          </div>
        </div>}
      </div>}

      {/* ds_signing_bank: PIN + return link */}
      {asg.stage === "ds_signing_bank" && <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Подписание ДС ЭЦП банка
        </div>

        <div className="p-4 rounded-xl mb-3" style={{background: "#ECFEFF", borderLeft: `3px solid #06B6D4`}}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background: "white"}}>
              <FileText size={20} style={{color: "#06B6D4"}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{color: "#06B6D4"}}>ДС готово к подписи</div>
              <div className="text-sm font-bold mt-0.5" style={{color: B.t1}}>
                Допсоглашение {asg.dsNumber && <span className="mono">№{asg.dsNumber}</span>}
              </div>
              <div className="text-[10px] mt-1" style={{color: B.t2}}>
                Клиент: <strong>{creditor?.name}</strong> · Должник: <strong>{debtor?.name}</strong> · К выплате: <strong className="mono">{fmtByn(asg.toReceive || 0)}</strong>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => setShowDsPreview(true)}
                  className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{color: B.accent}}>
                  <Eye size={11}/> Открыть ДС
                </button>
                <span style={{color: B.t3}}>·</span>
                <button onClick={() => setToast && setToast({msg: "PDF скачан (mock)", type: "success"})}
                  className="text-[11px] font-semibold flex items-center gap-1 hover:underline" style={{color: B.accent}}>
                  <Download size={11}/> Скачать PDF
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className="text-[10px] font-semibold block mb-1" style={{color: B.t3}}>
            PIN-код ЭЦП банка <span style={{color: B.red}}>*</span>
          </label>
          <input type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="••••" maxLength={4}
            className="w-full px-3 py-2 text-lg rounded-lg border border-slate-200 mono text-center"
            style={{color: B.t1, letterSpacing: "0.5em"}}/>
          <div className="text-[9px] mt-1" style={{color: B.t3}}>
            4 цифры. Демо-режим: любые 4 цифры подойдут.
          </div>
        </div>

        <div className="flex items-center justify-center pb-2 border-b mb-2" style={{borderColor: B.border}}>
          <button onClick={() => setReturnToUskoModal(true)}
            className="text-[11px] font-semibold hover:underline flex items-center gap-1" style={{color: B.red}}>
            ↩ Вернуть УСКО на доработку
          </button>
        </div>
      </div>}

      {/* ds_signing_client: waiting */}
      {asg.stage === "ds_signing_client" && <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Ожидание подписи клиента
        </div>
        <div className="p-4 rounded-xl mb-3" style={{background: "#F0F9FF", borderLeft: `3px solid #0891B2`}}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-2xl" style={{background: "white"}}>
              ⏳
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{color: "#0891B2"}}>Клиент подписывает ДС</div>
              <div className="text-[11px] mt-1" style={{color: B.t2}}>
                <strong>{creditor?.name}</strong> должен подписать ДС ЭЦП в своём кабинете.
              </div>
              {asg.signedByBankDate && <div className="text-[10px] mt-2" style={{color: B.t3}}>
                Банк подписал: {asg.signedByBankDate} · {asg.signedByBank || "—"}
              </div>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mb-2">
          <Btn size="sm" variant="ghost" icon={Mail} className="flex-1"
            onClick={() => setToast && setToast({msg: "Напоминание отправлено клиенту на email", type: "info"})}>
            Напомнить на email
          </Btn>
          <Btn size="sm" variant="ghost" icon={Bell} className="flex-1"
            onClick={() => setToast && setToast({msg: "SMS-напоминание отправлено", type: "info"})}>
            SMS-напоминание
          </Btn>
        </div>
        <div className="text-[10px] italic flex items-center gap-1" style={{color: B.t3}}>
          <Info size={10}/>Клиент подписывает в своём кабинете. Ниже — mock-кнопка для демо.
        </div>
      </div>}

      {/* payment_approved: checkbox + warning */}
      {asg.stage === "payment_approved" && <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color: B.t3}}>
          Разрешение на оплату в АБС
        </div>
        <div className="p-4 rounded-xl mb-3" style={{background: B.greenL, borderLeft: `3px solid ${B.green}`}}>
          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <div><span style={{color: B.t3}}>Получатель:</span> <strong style={{color: B.t1}}>{creditor?.name}</strong></div>
            <div><span style={{color: B.t3}}>Счёт:</span> <strong className="mono" style={{color: B.t1}}>{creditor?.accountNumber || "—"}</strong></div>
            <div><span style={{color: B.t3}}>К выплате:</span> <strong className="mono text-sm" style={{color: B.green}}>{fmtByn(asg.toReceive || 0)}</strong></div>
          </div>
        </div>
        <label className="flex items-start gap-2 p-3 rounded-xl cursor-pointer hover:bg-slate-50 mb-3" style={{border: `1px solid ${B.border}`}}>
          <input type="checkbox" checked={paymentVerified}
            onChange={e => setPaymentVerified(e.target.checked)}
            className="w-4 h-4 mt-0.5"/>
          <span className="text-[11px]" style={{color: B.t1}}>
            Я проверил реквизиты получателя и подтверждаю корректность суммы <strong>{fmtByn(asg.toReceive || 0)}</strong>
          </span>
        </label>
        <div className="p-2.5 rounded-lg text-[10px] flex items-start gap-2" style={{background: B.yellowL}}>
          <AlertTriangle size={12} style={{color: B.yellow}} className="shrink-0 mt-0.5"/>
          <span style={{color: B.t2}}>
            <strong style={{color: B.yellow}}>Внимание.</strong> После разрешения сумма уйдёт на счёт поставщика через АБС банка. Отменить нельзя.
          </span>
        </div>
      </div>}

      {/* ─── Footer: primary action ─── */}
      <div className="pt-3 border-t" style={{borderColor: B.border}}>
        {primaryAction && <Btn size="lg" icon={primaryAction.icon}
          disabled={primaryAction.disabled != null ? primaryAction.disabled : signing}
          className="w-full"
          onClick={primaryAction.onClick}>
          {primaryAction.label}
        </Btn>}

        {/* Secondary action: "Return to supplier" for usko_checking */}
        {asg.stage === "usko_checking" && <div className="flex items-center justify-center mt-3">
          <button onClick={() => {setSupplierIssues([]); setSupplierComment(""); setReturnToSupplierModal(true);}}
            className="text-[11px] font-semibold hover:underline flex items-center gap-1" style={{color: B.red}}>
            ↩ Вернуть поставщику на доработку
          </button>
        </div>}
      </div>
    </Card>

    {/* ─── Modal: return to supplier ─── */}
    <Modal open={returnToSupplierModal} onClose={() => setReturnToSupplierModal(false)} title="Вернуть поставщику на доработку">
      <div className="space-y-4">
        <div className="p-3 rounded-xl" style={{background: "#F8FAFC"}}>
          <div className="text-[10px] font-semibold mb-1" style={{color: B.t3}}>Уступка вернётся поставщику</div>
          <div className="text-xs font-bold" style={{color: B.t1}}>{creditor?.name}</div>
        </div>
        <div>
          <label className="text-xs font-medium mb-2 block" style={{color: B.t2}}>Что не так?</label>
          <div className="space-y-1.5">
            {[
              {key: "no_ttn", label: "Отсутствует ТТН"},
              {key: "wrong_amount", label: "Несоответствие суммы в ДКП и ТТН"},
              {key: "no_eschf", label: "Отсутствует ЭСЧФ"},
              {key: "wrong_debtor", label: "Несоответствие данных должника"},
              {key: "other", label: "Другое (указать в комментарии)"},
            ].map(issue => <label key={issue.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
              <input type="checkbox" checked={supplierIssues.includes(issue.key)} onChange={e => {
                setSupplierIssues(prev => e.target.checked ? [...prev, issue.key] : prev.filter(x => x !== issue.key));
              }}/>
              <span className="text-xs" style={{color: B.t1}}>{issue.label}</span>
            </label>)}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{color: B.t2}}>Комментарий (обязательно)</label>
          <textarea value={supplierComment} onChange={e => setSupplierComment(e.target.value)} rows={2}
            placeholder="Например: «ТТН без подписи должника»"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color: B.t1}}/>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setReturnToSupplierModal(false)} className="flex-1">Отмена</Btn>
          <Btn variant="danger" icon={XCircle} className="flex-1"
            disabled={supplierIssues.length === 0 || !supplierComment.trim()}
            onClick={() => {
              onAction && onAction("returned_to_supplier", {_returnIssues: supplierIssues, _returnComment: supplierComment}, "Возвращено поставщику на доработку");
              setReturnToSupplierModal(false);
            }}>
            Вернуть
          </Btn>
        </div>
      </div>
    </Modal>

    {/* ─── Modal: return to USKO ─── */}
    <Modal open={returnToUskoModal} onClose={() => setReturnToUskoModal(false)} title="Вернуть УСКО на доработку">
      <div className="space-y-4">
        <div className="p-3 rounded-xl" style={{background: "#F8FAFC"}}>
          <div className="text-[10px] font-semibold mb-1" style={{color: B.t3}}>ДС вернётся на этап «Формирование ДС»</div>
          <div className="text-xs font-bold" style={{color: B.t1}}>УСКО-специалист</div>
        </div>
        <div>
          <label className="text-xs font-medium mb-2 block" style={{color: B.t2}}>Что исправить в ДС?</label>
          <div className="space-y-1.5">
            {[
              {key: "wrong_amount_ds", label: "Неверная сумма в ДС"},
              {key: "wrong_debtor_ds", label: "Неверные данные должника"},
              {key: "wrong_template", label: "Использован неправильный шаблон"},
              {key: "other_ds", label: "Другое (указать в комментарии)"},
            ].map(issue => <label key={issue.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
              <input type="checkbox" checked={returnToUskoIssues.includes(issue.key)} onChange={e => {
                setReturnToUskoIssues(prev => e.target.checked ? [...prev, issue.key] : prev.filter(x => x !== issue.key));
              }}/>
              <span className="text-xs" style={{color: B.t1}}>{issue.label}</span>
            </label>)}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block" style={{color: B.t2}}>Комментарий (обязательно)</label>
          <textarea value={returnToUskoComment} onChange={e => setReturnToUskoComment(e.target.value)} rows={2}
            placeholder="Например: «В ДС сумма 120K, а в уступке 150K»"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color: B.t1}}/>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setReturnToUskoModal(false)} className="flex-1">Отмена</Btn>
          <Btn variant="danger" icon={XCircle} className="flex-1"
            disabled={returnToUskoIssues.length === 0 || !returnToUskoComment.trim()}
            onClick={() => {
              onAction && onAction("ds_preparing", {_returnIssues: returnToUskoIssues, _returnComment: returnToUskoComment}, "Возвращено УСКО на доработку ДС");
              setReturnToUskoModal(false);
            }}>
            Вернуть
          </Btn>
        </div>
      </div>
    </Modal>

    {/* ─── Modal: DS preview ─── */}
    <Modal open={showDsPreview} onClose={() => setShowDsPreview(false)} title={`Превью: ДС ${dsNumber || asg.dsNumber || "—"}`}>
      <div className="space-y-3">
        <div className="p-4 rounded-xl" style={{background: "#F8FAFC", border: `1px solid ${B.border}`, fontFamily: "serif"}}>
          <div className="text-center mb-3">
            <div className="text-sm font-bold" style={{color: B.t1}}>ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ</div>
            <div className="text-[11px] mono mt-1" style={{color: B.t2}}>№ {dsNumber || asg.dsNumber || "—"} от 26.03.2026</div>
            <div className="text-[11px] mt-1" style={{color: B.t3}}>к Генеральному договору факторинга сделки {asg.dealId}</div>
          </div>
          <div className="text-[11px] leading-relaxed space-y-2" style={{color: B.t2}}>
            <p><strong>Стороны:</strong></p>
            <p className="pl-4">Банк (Фактор): <strong>ОАО «Банк Оборотка»</strong></p>
            <p className="pl-4">Клиент (Кредитор, Поставщик): <strong>{creditor?.name}</strong> (УНП {creditor?.unp})</p>
            <p><strong>1. ПРЕДМЕТ.</strong> Клиент уступает Банку денежное требование к должнику по поставке товара по ТТН № {asg.ttnNumber || "—"} от {asg.shippingDate || "—"}.</p>
            <p><strong>2. ДОЛЖНИК.</strong> {debtor?.name} (УНП {debtor?.unp})</p>
            <p><strong>3. ФИНАНСОВЫЕ УСЛОВИЯ.</strong></p>
            <p className="pl-4">3.1. Сумма уступки: <strong className="mono">{fmtByn(asg.amount || 0)}</strong></p>
            <p className="pl-4">3.2. Дисконт: <strong className="mono">{fmtByn(asg.discount || 0)}</strong></p>
            <p className="pl-4">3.3. К выплате клиенту: <strong className="mono">{fmtByn(asg.toReceive || 0)}</strong></p>
            <p className="pl-4">3.4. Срок оплаты должником: до {asg.dueDate || "—"}</p>
            <p className="pt-3 text-center italic" style={{color: B.t3}}>— превью сокращено, полный текст в PDF —</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setShowDsPreview(false)} className="flex-1">Закрыть</Btn>
          <Btn variant="secondary" icon={Download} onClick={() => setToast && setToast({msg: "PDF скачан (mock)", type: "success"})} className="flex-1">Скачать PDF</Btn>
        </div>
      </div>
    </Modal>

    {/* ─── Payment confirmation modal — 2-step with cool-down ─── */}
    <DangerConfirmModal
      open={paymentDangerModal}
      onClose={() => setPaymentDangerModal(false)}
      onConfirm={executePaymentApproval}
      title="Разрешить оплату в АБС?"
      description="После подтверждения сумма уйдёт на счёт поставщика через АБС банка. Отменить операцию нельзя."
      amount={asg.toReceive || 0}
      recipient={creditor?.name}
      actionLabel="ОПЛАТИТЬ"
      coolDownSec={3}
      icon={CheckCircle}
      accent={B.green}
    />
  </>;
}

function AssignmentActionBlock({asg, currentUser, onAction, setToast}) {
  const [signing, setSigning] = useState(false);
  const [requestDocsModal, setRequestDocsModal] = useState(false);
  const [docsIssues, setDocsIssues] = useState([]);
  const [docsComment, setDocsComment] = useState("");
  const [returnDsModal, setReturnDsModal] = useState(false);
  const [returnDsIssues, setReturnDsIssues] = useState([]);
  const [returnDsComment, setReturnDsComment] = useState("");
  const canAct = canActOnAssignmentStage(currentUser, asg.stage);

  const doAdvance = (nextStage, extraData={}, msg) => {
    setSigning(true);
    setTimeout(()=>{
      setSigning(false);
      onAction(nextStage, extraData, msg);
    }, 1200);
  };

  if (!canAct) {
    const stage = ASSIGNMENT_STAGES.find(s=>s.id===asg.stage);
    const worker = BANK_USERS.find(u=>u.role===stage?.role);
    // Show different banners based on stage type
    if (stage?.actor === "debtor" || stage?.actor === "supplier") {
      return <ClientActivityCard asg={asg}/>;
    }
    if (asg.stage === "paid") {
      return <Card className="p-5 mb-5" style={{background:B.greenL, borderColor:B.green+"40"}}>
        <div className="flex items-start gap-3">
          <CheckCircle size={22} style={{color:B.green}} className="shrink-0 mt-0.5"/>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold" style={{color:B.green}}>✓ Оплачено</div>
            <div className="text-xs mt-1" style={{color:B.t2}}>К получению: {fmtByn(asg.toReceive||0)} (дисконт {fmtByn(asg.discount||0)})</div>
          </div>
        </div>
      </Card>;
    }
    return <Card className="p-5 mb-5" style={{background:"#F8FAFC",borderColor:B.border}}>
      <div className="flex items-start gap-3">
        <Info size={22} style={{color:B.t2}} className="shrink-0 mt-0.5"/>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{color:B.t1}}>Уступка на этапе «{stage?.label}»</div>
          {worker && <div className="text-xs mt-1" style={{color:B.t2}}>Работает: <strong>{worker.name}</strong> ({ROLE_ACCESS[worker.role]?.label})</div>}
          <div className="text-xs mt-1" style={{color:B.t3}}>На этом этапе от вас действий не требуется.</div>
        </div>
      </div>
    </Card>;
  }

  const roleInfo = ROLE_ACCESS[currentUser.role];

  // ─── usko_checking: проверка комплекта ───
  if (asg.stage === "usko_checking") {
    const submitRequestDocs = () => {
      onAction("returned_to_supplier", {
        returnReason: {
          issues: docsIssues,
          comment: docsComment,
          returnedBy: currentUser.name,
          returnedAt: "2026-03-26 14:00",
        }
      }, "Запрос документов отправлен поставщику");
      setRequestDocsModal(false);
    };
    const creditor = COMPANIES.find(c=>c.id===asg.creditorId);
    const debtor = COMPANIES.find(c=>c.id===asg.debtorId);
    return <>
      <Card className="p-5 mb-5" style={{background:roleInfo.color+"08", borderColor:roleInfo.color, borderWidth:2}}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background:"white"}}>🎯</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{color:roleInfo.color}}>Ваша задача</div>
            <div className="text-base font-bold mt-0.5" style={{color:B.t1}}>Проверить комплект документов</div>
            <div className="text-xs mt-1" style={{color:B.t2}}>Уступка {asg.id} · {fmtByn(asg.amount)}</div>
            <div className="text-[11px] mt-1" style={{color:B.t3}}>Поставщик: {creditor?.name} · Должник: {debtor?.name}</div>
          </div>
        </div>
        <div className="p-3 rounded-xl mb-3" style={{background:"white",border:`1px solid ${B.border}`}}>
          <div className="text-[10px] font-semibold mb-2" style={{color:B.t3}}>КОМПЛЕКТ ДОКУМЕНТОВ:</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs"><CheckCircle size={12} style={{color:B.green}}/> Генеральный договор (действует)</div>
            <div className="flex items-center gap-2 text-xs">
              {asg.docs?.dkp?.status==="signed"?<CheckCircle size={12} style={{color:B.green}}/>:<Clock size={12} style={{color:B.yellow}}/>}
              <span>ДКП — {asg.docs?.dkp?.status==="signed"?"подписан":"не загружен"}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {asg.docs?.ttn?.status==="signed"?<CheckCircle size={12} style={{color:B.green}}/>:<Clock size={12} style={{color:B.yellow}}/>}
              <span>{asg.ttnNumber||"ТТН"} — {asg.docs?.ttn?.status==="signed"?"читаемая":"требует проверки"}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {asg.docs?.actReconciliation?.status==="signed"?<CheckCircle size={12} style={{color:B.green}}/>:<Clock size={12} style={{color:B.yellow}}/>}
              <span>Акт сверки — {asg.docs?.actReconciliation?.status==="signed"?`подписан должником ${asg.docs.actReconciliation.date}`:"не подписан"}</span>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Btn size="md" icon={signing?Loader2:Check} disabled={signing} className="w-full"
            onClick={()=>doAdvance("ds_preparing", {}, "Комплект проверен. Переходим к формированию ДС")}>
            {signing?"Обработка...":"✓ КОМПЛЕКТ ПОЛНЫЙ, ФОРМИРОВАТЬ ДС"}
          </Btn>
          <Btn size="sm" variant="danger" icon={AlertTriangle} className="w-full"
            onClick={()=>{setDocsIssues([]);setDocsComment("");setRequestDocsModal(true)}}>
            ⚠ Запросить недостающие документы
          </Btn>
        </div>
      </Card>

      <Modal open={requestDocsModal} onClose={()=>setRequestDocsModal(false)} title="Запросить недостающие документы у поставщика">
        <div className="space-y-4">
          <div className="text-xs" style={{color:B.t2}}>Что нужно доложить? (выберите проблемы)</div>
          <div className="space-y-1.5">
            {Object.entries(SUPPLIER_RETURN_ISSUES).map(([key,label])=>(
              <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                <input type="checkbox" checked={docsIssues.includes(key)} onChange={e=>{
                  setDocsIssues(prev => e.target.checked ? [...prev, key] : prev.filter(x=>x!==key));
                }}/>
                <span className="text-xs" style={{color:B.t1}}>{label}</span>
              </label>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Комментарий для поставщика (обязательно)</label>
            <textarea value={docsComment} onChange={e=>setDocsComment(e.target.value)} rows={2}
              placeholder="Пожалуйста, исправьте и загрузите заново..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}/>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={()=>setRequestDocsModal(false)} className="flex-1">Отмена</Btn>
            <Btn variant="danger" onClick={submitRequestDocs} icon={AlertTriangle} className="flex-1"
              disabled={docsIssues.length===0 || !docsComment.trim()}>
              Отправить запрос
            </Btn>
          </div>
        </div>
      </Modal>
    </>;
  }

  // ─── ds_preparing ───
  if (asg.stage === "ds_preparing") {
    return <Card className="p-5 mb-5" style={{background:roleInfo.color+"08", borderColor:roleInfo.color, borderWidth:2}}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background:"white"}}>🎯</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{color:roleInfo.color}}>Ваша задача</div>
          <div className="text-base font-bold mt-0.5" style={{color:B.t1}}>Сформировать допсоглашение</div>
          <div className="text-xs mt-1" style={{color:B.t2}}>ДС автогенерируется на основании {asg.ttnNumber||"ТТН"} · сумма {fmtByn(asg.amount)}</div>
        </div>
      </div>
      <Btn size="md" icon={signing?Loader2:FileText} disabled={signing} className="w-full"
        onClick={()=>doAdvance("ds_signing_bank", {docs:{...asg.docs, supplementaryAgreement:{status:"pending_bank"}}}, "ДС сформировано. Передано подписанту")}>
        {signing?"Формирование...":"📄 СФОРМИРОВАТЬ ДС ПО ШАБЛОНУ"}
      </Btn>
    </Card>;
  }

  // ─── ds_signing_bank ───
  if (asg.stage === "ds_signing_bank") {
    const submitReturnDs = () => {
      onAction("ds_preparing", {
        _returnDsIssues: returnDsIssues,
        _returnDsComment: returnDsComment,
      }, "ДС возвращено УСКО на доработку");
      setReturnDsModal(false);
    };
    return <>
      <Card className="p-5 mb-5" style={{background:roleInfo.color+"08", borderColor:roleInfo.color, borderWidth:2}}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background:"white"}}>🎯</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{color:roleInfo.color}}>Ваша задача</div>
            <div className="text-base font-bold mt-0.5" style={{color:B.t1}}>Подписать ДС ЭЦП банка</div>
            <div className="text-xs mt-1" style={{color:B.t2}}>Допсоглашение к ген.договору — уступка {asg.id}</div>
          </div>
        </div>
        <div className="space-y-2">
          <Btn size="sm" variant="secondary" icon={Eye} className="w-full" onClick={()=>setToast({msg:"ДС открыто для просмотра",type:"info"})}>Просмотреть ДС</Btn>
          <Btn size="md" icon={signing?Loader2:Pen} disabled={signing} className="w-full"
            onClick={()=>doAdvance("ds_signing_client", {docs:{...asg.docs, supplementaryAgreement:{status:"signed_bank"}}}, "ДС подписано банком. Отправлено клиенту")}>
            {signing?"Подписание...":"🔏 ПОДПИСАТЬ ДС ЭЦП БАНКА"}
          </Btn>
          <Btn size="sm" variant="danger" icon={XCircle} className="w-full" onClick={()=>{setReturnDsIssues([]);setReturnDsComment("");setReturnDsModal(true)}}>Вернуть УСКО на доработку</Btn>
        </div>
      </Card>

      <Modal open={returnDsModal} onClose={()=>setReturnDsModal(false)} title="Вернуть ДС на доработку УСКО">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-2 block" style={{color:B.t2}}>Что нужно исправить?</label>
            <div className="space-y-1.5">
              {Object.entries(RETURN_ISSUE_LABELS).map(([key,label])=>(
                <label key={key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                  <input type="checkbox" checked={returnDsIssues.includes(key)} onChange={e=>{
                    setReturnDsIssues(prev => e.target.checked ? [...prev, key] : prev.filter(x=>x!==key));
                  }}/>
                  <span className="text-xs" style={{color:B.t1}}>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Комментарий (обязательно)</label>
            <textarea value={returnDsComment} onChange={e=>setReturnDsComment(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}/>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={()=>setReturnDsModal(false)} className="flex-1">Отмена</Btn>
            <Btn variant="danger" onClick={submitReturnDs} icon={XCircle} className="flex-1"
              disabled={returnDsIssues.length===0 || !returnDsComment.trim()}>Вернуть на доработку</Btn>
          </div>
        </div>
      </Modal>
    </>;
  }

  // ─── payment_approved ───
  if (asg.stage === "payment_approved") {
    const discount = Math.round(asg.amount * 0.062);
    const toReceive = asg.amount - discount;
    return <Card className="p-5 mb-5" style={{background:roleInfo.color+"08", borderColor:roleInfo.color, borderWidth:2}}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{background:"white"}}>🎯</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{color:roleInfo.color}}>Ваша задача</div>
          <div className="text-base font-bold mt-0.5" style={{color:B.t1}}>Разрешить оплату поставщику</div>
          <div className="text-xs mt-1" style={{color:B.t2}}>Все документы подписаны всеми сторонами</div>
        </div>
      </div>
      <div className="p-3 rounded-xl mb-3" style={{background:"white",border:`1px solid ${B.border}`}}>
        <div className="text-[10px] font-semibold mb-2" style={{color:B.t3}}>К ОПЛАТЕ:</div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs"><span style={{color:B.t3}}>Сумма уступки:</span><span className="font-semibold mono" style={{color:B.t1}}>{fmtByn(asg.amount)}</span></div>
          <div className="flex justify-between text-xs"><span style={{color:B.t3}}>Дисконт:</span><span className="font-semibold mono" style={{color:B.red}}>− {fmtByn(discount)}</span></div>
          <div className="flex justify-between text-sm font-bold pt-1.5 mt-1.5 border-t" style={{borderColor:B.border}}>
            <span style={{color:B.t1}}>К получению:</span>
            <span className="mono" style={{color:B.green}}>{fmtByn(toReceive)}</span>
          </div>
        </div>
      </div>
      <Btn size="md" icon={signing?Loader2:CheckCircle} disabled={signing} className="w-full"
        onClick={()=>doAdvance("paid", {discount, toReceive}, `Оплата разрешена. ${fmtByn(toReceive)} зачислится поставщику`)}>
        {signing?"Обработка...":"✓ РАЗРЕШИТЬ ОПЛАТУ"}
      </Btn>
      <div className="mt-3 text-[10px] italic flex items-center gap-1" style={{color:B.t3}}>
        <Info size={10}/>Оплата будет произведена через АБС автоматически после вашего подтверждения.
      </div>
    </Card>;
  }

  return null;
}

// Assignment detail view
function AssignmentDetailView({asg, currentUser, assignmentsData, setAssignmentsData, onBack, setToast}) {
  const creditor = COMPANIES.find(c=>c.id===asg.creditorId);
  const debtor = COMPANIES.find(c=>c.id===asg.debtorId);
  const deal = PIPELINE.find(p=>p.id===asg.dealId);

  // Implicit take: when usko_prepare (or admin) opens a new usko_checking assignment,
  // automatically mark it as taken. Removes need for a separate "Take in work" button.
  useEffect(() => {
    if (!setAssignmentsData) return;
    if (asg.stage !== "usko_checking") return;
    if (asg.uskoTakenBy) return;
    if (currentUser.role !== "usko_prepare" && currentUser.role !== "admin") return;
    setAssignmentsData(prev => prev.map(a => a.id === asg.id
      ? {...a, uskoTakenBy: currentUser.name, uskoTakenDate: "2026-03-26"}
      : a));
  }, [asg.id, asg.stage, asg.uskoTakenBy, currentUser.role, currentUser.name, setAssignmentsData]);

  const handleAction = (nextStage, extraData={}, msg) => {
    const ACTION_MAP = {
      ds_preparing: "checked_ok",
      ds_signing_bank: "ds_generated",
      ds_signing_client: "ds_signed_bank",
      payment_approved: "ds_signed_client",
      paid: "payment_approved",
      returned_to_supplier: "returned_to_supplier",
    };
    const newHistoryItem = {
      action: ACTION_MAP[nextStage] || `moved_to_${nextStage}`,
      user: currentUser.name,
      userRole: currentUser.role,
      date: "2026-03-26",
      comment: extraData._returnComment || extraData._returnDsComment || extraData.returnReason?.comment || null,
      issues: extraData._returnIssues || extraData._returnDsIssues || null,
    };
    delete extraData._returnIssues;
    delete extraData._returnComment;
    delete extraData._returnDsIssues;
    delete extraData._returnDsComment;

    setAssignmentsData(prev => prev.map(a => a.id===asg.id
      ? {...a, stage: nextStage, stageStartDate:"2026-03-26", history:[...(a.history||[]), newHistoryItem], ...extraData}
      : a
    ));
    setToast({msg: msg||"Этап обновлён", type:"success"});
    onBack();
  };

  return <div>
    <PageHeader title={`Уступка ${asg.id}`} subtitle={creditor?.name} breadcrumbs={["Уступки", asg.dealId, asg.id]} onBack={onBack}
      actions={<div className="flex items-center gap-2">
        {/* Link to parent deal */}
        <button onClick={()=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("oborotka:nav",{detail:{page:"pipeline"}}))}}
          className="text-[10px] px-2 py-1 rounded-lg hover:bg-slate-100 flex items-center gap-1"
          style={{color:B.accent}}>
          <ExternalLink size={10}/>
          К сделке {asg.dealId}
        </button>
        <span className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{background:B.accentL, color:B.accent}}>{fmtByn(asg.amount)}</span>
      </div>}/>

    {/* Unified task form — primary UI for actionable assignments */}
    <AssignmentTaskForm asg={asg} currentUser={currentUser} onAction={handleAction} setToast={setToast}/>
    {/* Fallback: old ActionBlock for edge cases (paid, no action user, etc) */}
    {(!canActOnAssignmentStage(currentUser, asg.stage) || asg.stage === "paid") &&
      <AssignmentActionBlock asg={asg} currentUser={currentUser} onAction={handleAction} setToast={setToast}/>}

    {/* Client reminder — when waiting for supplier/debtor action */}
    {isAssignmentWaitingClient(asg) && asg.stage !== "paid" && <Card className="p-3 mb-4" style={{background: B.yellowL, borderColor: B.yellow+"40"}}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          <Clock size={14} style={{color: B.yellow}} className="shrink-0 mt-0.5"/>
          <div className="text-[11px]" style={{color: B.t2}}>
            <strong style={{color: B.yellow}}>Ожидаем клиента.</strong>{" "}
            {asg.stage === "debtor_confirming" && `Должник (${debtor?.name}) должен подтвердить получение документов.`}
            {asg.stage === "ds_signing_client" && `Клиент (${creditor?.name}) должен подписать ДС.`}
            {" Банк SLA не нарушает. Можно напомнить клиенту."}
          </div>
        </div>
        <Btn size="sm" variant="secondary" icon={Mail} onClick={()=>{
          setToast({msg: `Напоминание отправлено по ${asg.id}`, type: "info"});
          setAssignmentsData(prev => prev.map(a => a.id === asg.id
            ? {...a, history: [...(a.history||[]), {action: "client_reminded", user: currentUser.name, userRole: currentUser.role, date: "2026-03-26 14:00", comment: "Напоминание отправлено"}]}
            : a));
        }}>
          Напомнить клиенту
        </Btn>
      </div>
    </Card>}

    {/* Simplified process banner — shown when parent deal has approved limit */}
    {deal && deal.approvedLimit > 0 && <Card className="p-3 mb-4" style={{background: B.greenL, borderColor: B.green+"40"}}>
      <div className="flex items-start gap-2">
        <CheckCircle size={14} style={{color: B.green}} className="shrink-0 mt-0.5"/>
        <div className="text-[11px]" style={{color: B.t2}}>
          <strong style={{color: B.green}}>Упрощённый процесс.</strong> Лимит по клиенту уже одобрен
          ({fmtByn(deal.approvedLimit)}). Для этой уступки требуется только проверка
          должника и документов (ДКП, ТТН, счёт-фактура) — <strong>без</strong> повторного скоринга клиента.
        </div>
      </div>
    </Card>}

    {/* 4-phase workflow visualization */}
    <AssignmentPhaseWorkflow asg={asg}/>

    <div className="grid gap-6" style={{gridTemplateColumns:"1fr 320px"}}>
      <div className="space-y-5 min-w-0">
        {/* Parties */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Стороны сделки</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl" style={{background:B.accentL+"40"}}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{color:B.accent}}>Поставщик (наш клиент)</div>
              <div className="text-xs font-bold" style={{color:B.t1}}>{creditor?.name}</div>
              <div className="text-[10px] mono mt-0.5" style={{color:B.t3}}>УНП {creditor?.unp}</div>
              <div className="text-[10px] mt-1" style={{color:B.t2}}>Загружает документы, подписывает ДС</div>
            </div>
            <div className="p-3 rounded-xl" style={{background:"#FFF7ED"}}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{color:B.orange}}>Должник (покупатель)</div>
              <div className="text-xs font-bold" style={{color:B.t1}}>{debtor?.name}</div>
              <div className="text-[10px] mono mt-0.5" style={{color:B.t3}}>УНП {debtor?.unp}</div>
              <div className="text-[10px] mt-1" style={{color:B.t2}}>Подписывает акт сверки, оплачивает</div>
            </div>
          </div>
        </Card>

        {/* Assignment info */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Информация об уступке</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div><span style={{color:B.t3}}>ID уступки:</span><div className="font-semibold mono mt-0.5" style={{color:B.accent}}>{asg.id}</div></div>
            <div><span style={{color:B.t3}}>Сделка:</span><div className="font-semibold mono mt-0.5" style={{color:B.t1}}>{asg.dealId}</div></div>
            <div><span style={{color:B.t3}}>Сумма:</span><div className="font-bold mt-0.5" style={{color:B.t1}}>{fmtByn(asg.amount)}</div></div>
            <div><span style={{color:B.t3}}>ТТН:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{asg.ttnNumber||"—"}</div></div>
            <div><span style={{color:B.t3}}>Дата создания:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{asg.createdDate}</div></div>
            {asg.shippingDate && <div><span style={{color:B.t3}}>Дата отгрузки:</span><div className="font-semibold mt-0.5" style={{color:B.t1}}>{asg.shippingDate}</div></div>}
            {asg.toReceive && <div><span style={{color:B.t3}}>К получению:</span><div className="font-bold mt-0.5" style={{color:B.green}}>{fmtByn(asg.toReceive)}</div></div>}
            {asg.discount && <div><span style={{color:B.t3}}>Дисконт:</span><div className="font-bold mt-0.5" style={{color:B.red}}>{fmtByn(asg.discount)}</div></div>}
          </div>
        </Card>

        {/* History */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold" style={{color:B.t1}}>Хронология</h3>
            {asg.history?.length > 1 && <span className="text-[10px]" style={{color:B.t3}}>
              {asg.history.length} событий
            </span>}
          </div>
          <div className="space-y-0">
            {(asg.history||[]).map((h,idx)=>{
              const isLast = idx === asg.history.length-1;
              const isFirst = idx === 0;
              const roleInfo = h.userRole ? ROLE_ACCESS[h.userRole] : null;
              const dotColor = h.action?.includes("return") ? B.red
                : h.action?.includes("paid") ? B.green
                : h.action === "client_reminded" ? B.yellow
                : roleInfo?.color || B.accent;

              // Calculate time since previous event
              let timeSince = null;
              if (!isFirst) {
                const prev = asg.history[idx-1];
                try {
                  const t1 = new Date(prev.date);
                  const t2 = new Date(h.date);
                  const diffMin = Math.floor((t2 - t1) / 60000);
                  if (diffMin < 60) timeSince = `${diffMin}м`;
                  else if (diffMin < 1440) timeSince = `${Math.floor(diffMin/60)}ч`;
                  else timeSince = `${Math.floor(diffMin/1440)}д`;
                } catch(e) {}
              }

              const displayRole = roleInfo?.icon || "🤖";

              return <div key={idx} className="flex gap-3 relative">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 z-10"
                    style={{background: dotColor + "20", border: `2px solid ${dotColor}`}}>
                    <span>{displayRole}</span>
                  </div>
                  {!isLast && <div className="w-0.5 flex-1 mt-0.5" style={{background: B.border, minHeight: 24}}/>}
                </div>
                <div className="flex-1 min-w-0 pb-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs font-bold" style={{color:B.t1}}>
                      {ASSIGNMENT_ACTION_LABELS[h.action]||h.action}
                    </div>
                    {timeSince && <span className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{background: "#F1F5F9", color: B.t3}}>
                      +{timeSince}
                    </span>}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{color:B.t3}}>
                    <strong style={{color: B.t2}}>{h.user}</strong>
                    {roleInfo && <span> · <span style={{color:roleInfo.color, fontWeight: 600}}>{roleInfo.label}</span></span>}
                    {" · "}{h.date}
                  </div>
                  {h.comment && <div className="text-[11px] italic mt-1.5 p-2 rounded-lg" style={{background:"#F8FAFC",color:B.t2}}>
                    💬 {h.comment}
                  </div>}
                  {h.issues && h.issues.length > 0 && <div className="text-[10px] mt-1.5 p-2 rounded-lg" style={{background: B.redL, color: B.red}}>
                    <div className="font-bold mb-0.5">Замечания:</div>
                    {h.issues.map((iss,i) => <div key={i}>• {SUPPLIER_RETURN_ISSUES[iss]||iss}</div>)}
                  </div>}
                </div>
              </div>;
            })}
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        {/* Documents — linked to document registry */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold" style={{color:B.t1}}>Документы комплекта</h3>
            <button onClick={()=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("oborotka:nav",{detail:{page:"documents"}}))}}
              className="text-[10px] hover:underline flex items-center gap-1" style={{color:B.accent}}>
              Все документы <ExternalLink size={10}/>
            </button>
          </div>
          <div className="space-y-1.5">
            {Object.entries(asg.docs||{}).map(([key,val])=>{
              const isOk = val?.status==="signed" || val?.status==="signed_all" || val?.status==="signed_bank" || val?.status==="sent";
              const status = val?.status==="signed"?"✓ подписан":val?.status==="signed_all"?"✓ все стороны":val?.status==="signed_bank"?"✓ банк":val?.status==="pending_bank"?"ожидает банк":val?.status==="pending_client"?"ожидает клиент":val?.status||"";
              const existing = DOCUMENTS_REGISTRY.find(d => d.docType===key && d.relatedTo?.assignmentId===asg.id);
              const targetId = existing?.id || `SYNTH:${key}::${asg.id}`;
              const hasRegistryEntry = !!existing;
              const handleClick = () => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("oborotka:open-doc",{detail:{docId:targetId}}));
                }
              };
              return <button key={key} onClick={handleClick}
                className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 hover:bg-blue-50 transition-colors text-left group">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isOk?<CheckCircle size={14} style={{color:B.green}}/>:<Clock size={14} style={{color:B.yellow}}/>}
                  <FileText size={12} className="shrink-0" style={{color:B.accent}}/>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] truncate group-hover:underline" style={{color:B.accent}}>{DOC_KEY_LABELS[key]||DOC_TYPE_LABELS[key]||key}</div>
                    {existing?.id && <div className="text-[9px] mono" style={{color:B.t3}}>{existing.id}</div>}
                    {val?.date && <div className="text-[9px]" style={{color:B.t3}}>{val.date}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-semibold" style={{color:isOk?B.green:B.yellow}}>{status}</span>
                  {hasRegistryEntry && <span className="text-[9px] px-1 py-0.5 rounded" style={{background:B.accentL, color:B.accent}}>в реестре</span>}
                  <ChevronRight size={12} style={{color:B.t3}} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
                </div>
              </button>;
            })}
          </div>
        </Card>

        {/* Returned reason (if applicable) */}
        {asg.returnReason && <Card className="p-5" style={{background:B.redL,borderColor:"#FECACA"}}>
          <h3 className="text-sm font-bold mb-3" style={{color:B.red}}>⚠ Возврат поставщику</h3>
          {asg.returnReason.issues && <ul className="space-y-1 mb-2">{asg.returnReason.issues.map((iss,i)=><li key={i} className="text-xs" style={{color:B.t1}}>• {SUPPLIER_RETURN_ISSUES[iss]||iss}</li>)}</ul>}
          {asg.returnReason.comment && <div className="text-[11px] italic p-2 rounded-lg" style={{background:"white",color:B.t2}}>💬 «{asg.returnReason.comment}»</div>}
          <div className="text-[10px] mt-2" style={{color:B.t3}}>{asg.returnReason.returnedBy} · {asg.returnReason.returnedAt}</div>
        </Card>}
      </div>
    </div>
  </div>;
}

// Assignments main page
function AssignmentsPage({currentUser, setToast}) {
  const isAdmin = currentUser.role === "admin";
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = sessionStorage.getItem("assignments-view-mode");
      return saved || "my";
    } catch(e) { return "my"; }
  });
  const [viewLayout, setViewLayout] = useState(() => {
    try {
      const saved = sessionStorage.getItem("assignments-view-layout");
      return saved || "table"; // default table
    } catch(e) { return "table"; }
  });
  const [selectedAsg, setSelectedAsg] = useState(null);
  const [assignmentsData, setAssignmentsData] = useState(ASSIGNMENTS.map(a=>({...a})));

  // Filters
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [amountFilter, setAmountFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [debtorFilter, setDebtorFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Batch mode
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    try { sessionStorage.setItem("assignments-view-mode", viewMode); } catch(e) {}
  }, [viewMode]);
  useEffect(() => {
    try { sessionStorage.setItem("assignments-view-layout", viewLayout); } catch(e) {}
  }, [viewLayout]);

  const myStages = getMyAssignmentStages(currentUser);

  if (selectedAsg) {
    return <AssignmentDetailView asg={selectedAsg} currentUser={currentUser}
      assignmentsData={assignmentsData} setAssignmentsData={setAssignmentsData}
      onBack={()=>setSelectedAsg(null)} setToast={setToast}/>;
  }

  // Collect unique suppliers and debtors for filters
  const supplierIds = [...new Set(assignmentsData.map(a => a.creditorId))];
  const debtorIds = [...new Set(assignmentsData.map(a => a.debtorId))];
  const suppliers = supplierIds.map(id => COMPANIES.find(c => c.id === id)).filter(Boolean);
  const debtors = debtorIds.map(id => COMPANIES.find(c => c.id === id)).filter(Boolean);

  // Apply all filters
  const filtered = assignmentsData.filter(a => {
    // View mode
    if (viewMode === "my" && !myStages.includes(a.stage)) return false;
    if (viewMode === "waiting" && !isAssignmentWaitingClient(a)) return false;
    if (viewMode === "overdue" && !isAssignmentBankOverdue(a)) return false;

    // Phase
    if (phaseFilter !== "all" && getAssignmentPhase(a.stage) !== phaseFilter) return false;

    // Stage (when user clicks a micro-stage in the funnel)
    if (stageFilter !== "all" && a.stage !== stageFilter) return false;

    // Amount
    if (amountFilter === "small" && a.amount > 50000) return false;
    if (amountFilter === "medium" && (a.amount <= 50000 || a.amount > 500000)) return false;
    if (amountFilter === "large" && a.amount <= 500000) return false;

    // Supplier/debtor
    if (supplierFilter !== "all" && a.creditorId !== Number(supplierFilter)) return false;
    if (debtorFilter !== "all" && a.debtorId !== Number(debtorFilter)) return false;

    // Date
    if (dateFilter !== "all") {
      const created = new Date(a.createdDate);
      const now = new Date("2026-03-26");
      const daysAgo = Math.floor((now - created) / 86400000);
      if (dateFilter === "week" && daysAgo > 7) return false;
      if (dateFilter === "month" && daysAgo > 30) return false;
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      if (!(a.id.toLowerCase().includes(q)
        || a.dealId.toLowerCase().includes(q)
        || (a.ttnNumber||"").toLowerCase().includes(q))) return false;
    }
    return true;
  });

  // Counters for tabs
  const myCount = assignmentsData.filter(a => myStages.includes(a.stage)).length;
  const waitingCount = assignmentsData.filter(isAssignmentWaitingClient).length;
  const bankOverdue = assignmentsData.filter(isAssignmentBankOverdue);

  // KPI stats
  const activeCount = assignmentsData.filter(a => a.stage !== "paid" && a.stage !== "returned_to_supplier").length;
  const paidMonthCount = assignmentsData.filter(a => {
    if (a.stage !== "paid") return false;
    const d = new Date(a.stageStartDate);
    const now = new Date("2026-03-26");
    return (now - d) / 86400000 <= 30;
  }).length;
  const totalVolume = assignmentsData.filter(a => a.stage === "paid").reduce((s, a) => s + a.amount, 0);
  const avgTurnover = (() => {
    const paid = assignmentsData.filter(a => a.stage === "paid");
    if (paid.length === 0) return null;
    const totalDays = paid.reduce((s, a) => {
      const created = new Date(a.createdDate);
      const paidDate = new Date(a.stageStartDate);
      return s + Math.max(0, Math.floor((paidDate - created) / 86400000));
    }, 0);
    return Math.round(totalDays / paid.length);
  })();

  // Batch operations
  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  // Detect batch action type (all selected must be in same stage)
  const getBatchAction = () => {
    if (selectedIds.length === 0) return null;
    const items = assignmentsData.filter(a => selectedIds.includes(a.id));
    const stages = [...new Set(items.map(a => a.stage))];
    if (stages.length !== 1) return {type: "mixed", count: items.length};
    const stage = stages[0];
    if (stage === "usko_checking") return {type: "usko_check", count: items.length, stage};
    if (stage === "ds_signing_bank") return {type: "sign_ds", count: items.length, stage};
    if (stage === "payment_approved") return {type: "pay", count: items.length, stage};
    return {type: "other", count: items.length, stage};
  };

  const doBatchAction = () => {
    const action = getBatchAction();
    if (!action || action.type === "mixed" || action.type === "other") return;

    let nextStage, msg;
    if (action.type === "usko_check") { nextStage = "ds_preparing"; msg = "Комплекты проверены, ДС к формированию"; }
    else if (action.type === "sign_ds") { nextStage = "ds_signing_client"; msg = "ДС подписаны ЭЦП банка"; }
    else if (action.type === "pay") { nextStage = "paid"; msg = "Оплата проведена"; }

    setAssignmentsData(prev => prev.map(a => selectedIds.includes(a.id)
      ? {...a, stage: nextStage, stageStartDate: "2026-03-26",
          history: [...(a.history||[]), {action: `batch_${action.type}`, user: currentUser.name, userRole: currentUser.role, date: "2026-03-26 14:00", comment: "Пачечная обработка"}]}
      : a));
    setBatchMode(false);
    setSelectedIds([]);
    setToast({msg: `${msg} · ${action.count} уступок`, type: "success"});
  };

  const remindClient = (asgId) => {
    setToast({msg: `Напоминание отправлено по ${asgId}`, type: "info"});
    setAssignmentsData(prev => prev.map(a => a.id === asgId
      ? {...a, history: [...(a.history||[]), {action: "client_reminded", user: currentUser.name, userRole: currentUser.role, date: "2026-03-26 14:00", comment: "Напоминание отправлено"}]}
      : a));
  };

  const batchAction = getBatchAction();

  return <div>
    <PageHeader title="Уступки" breadcrumbs={["Уступки"]}
      actions={<ExportButton filename="ustupki" setToast={setToast}
        columns={[
          {key: "id", label: "ID"},
          {key: "dealId", label: "Сделка"},
          {key: "creditorId", label: "Клиент", formatter: r => COMPANIES.find(c => c.id === r.creditorId)?.name || "—"},
          {key: "debtorId", label: "Должник", formatter: r => COMPANIES.find(c => c.id === r.debtorId)?.name || "—"},
          {key: "amount", label: "Сумма"},
          {key: "toReceive", label: "К выплате"},
          {key: "stage", label: "Этап", formatter: r => ASSIGNMENT_STAGES.find(s => s.id === r.stage)?.label || r.stage},
          {key: "ttnNumber", label: "ТТН"},
          {key: "shippingDate", label: "Отгрузка"},
          {key: "createdDate", label: "Создана"},
        ]}
        rows={filtered}/>}/>

    {/* Workflow health — funnel visualization */}
    <AssignmentWorkflowHealthBanner
      assignmentsData={assignmentsData}
      activePhase={phaseFilter === "all" ? null : phaseFilter}
      onPhaseClick={(phaseId) => {
        setPhaseFilter(phaseFilter === phaseId ? "all" : phaseId);
        setStageFilter("all"); // clear stage filter when phase changes
      }}
      activeStage={stageFilter === "all" ? null : stageFilter}
      onStageClick={(stageId) => setStageFilter(stageFilter === stageId ? "all" : stageId)}
    />

    {/* KPI strip — phase-based, clickable to filter */}
    <div className="grid grid-cols-5 gap-3 mb-5">
      {ASSIGNMENT_PHASES.map(phase => {
        const items = assignmentsData.filter(a => a.stage !== "paid" && getAssignmentPhase(a.stage) === phase.id);
        const isActive = phaseFilter === phase.id;
        const count = items.length;
        return <button key={phase.id}
          onClick={() => {
            setPhaseFilter(phaseFilter === phase.id ? "all" : phase.id);
            setStageFilter("all");
          }}
          className="text-left">
          <Card className="p-3 hover:shadow-md transition-all cursor-pointer"
            style={isActive ? {borderColor: B.accent, borderWidth: 2} : {}}>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-base" style={{background: isActive ? B.accent : B.accentL}}>
                <span>{phase.icon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] leading-tight" style={{color: B.t3}}>{phase.label}</div>
                <div className="text-lg font-black" style={{color: count > 0 ? (isActive ? B.accent : B.t1) : B.t3}}>{count}</div>
              </div>
            </div>
          </Card>
        </button>;
      })}
      {/* Overdue SLA — always visible as 5th card */}
      <button onClick={()=>setViewMode(viewMode === "overdue" ? "all" : "overdue")} className="text-left">
        <Card className="p-3 hover:shadow-md transition-all cursor-pointer"
          style={viewMode === "overdue" ? {borderColor: B.red, borderWidth: 2} : {}}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background: B.redL}}>
              <AlertTriangle size={16} style={{color: B.red}} className={bankOverdue.length > 0 ? "animate-pulse" : ""}/>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] leading-tight" style={{color: B.t3}}>Просрочка SLA</div>
              <div className="text-lg font-black" style={{color: bankOverdue.length > 0 ? B.red : B.t3}}>{bankOverdue.length}</div>
            </div>
          </div>
        </Card>
      </button>
    </div>

    {/* Secondary KPI row (small) */}
    <div className="flex items-center gap-4 mb-5 text-[11px]" style={{color: B.t2}}>
      <span className="flex items-center gap-1.5">
        <CheckCircle size={12} style={{color: B.green}}/>
        Оплачено за 30д: <strong style={{color: B.green}}>{paidMonthCount}</strong>
      </span>
      <span className="flex items-center gap-1.5">
        <Clock size={12} style={{color: "#6366F1"}}/>
        Средняя оборачиваемость: <strong style={{color: B.t1}}>{avgTurnover != null ? `${avgTurnover}д` : "—"}</strong>
      </span>
    </div>

    {/* View mode tabs + layout switcher */}
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <button onClick={()=>setViewMode("my")}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border"
        style={viewMode==="my"?{background:B.accent,color:"white",borderColor:B.accent}:{background:"white",color:B.t2,borderColor:B.border}}>
        <Inbox size={14}/>Мои задачи ({myCount})
      </button>
      <button onClick={()=>setViewMode("all")}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border"
        style={viewMode==="all"?{background:B.accent,color:"white",borderColor:B.accent}:{background:"white",color:B.t2,borderColor:B.border}}>
        <GitBranch size={14}/>Все ({assignmentsData.length})
      </button>
      <button onClick={()=>setViewMode("waiting")}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border"
        style={viewMode==="waiting"?{background:B.accent,color:"white",borderColor:B.accent}:{background:"white",color:B.t2,borderColor:B.border}}>
        <Clock size={14}/>Ожидание клиента ({waitingCount})
      </button>

      <div className="ml-auto flex items-center gap-2">
        {!batchMode && myStages.length > 0 && <Btn size="sm" variant="secondary" icon={Check} onClick={()=>setBatchMode(true)}>
          Пачечная обработка
        </Btn>}
        {batchMode && <>
          <Btn size="sm" variant="ghost" onClick={()=>{setBatchMode(false); setSelectedIds([])}}>Отмена</Btn>
        </>}
        {/* Layout switcher */}
        <div className="flex items-center gap-1 p-1 rounded-lg border bg-white" style={{borderColor:B.border}}>
          {[
            {id:"table", icon:"📋", label:"Таблица"},
            {id:"cards", icon:"🧩", label:"Карточки"},
            {id:"deals", icon:"📊", label:"По сделкам"},
          ].map(m => (
            <button key={m.id} onClick={()=>setViewLayout(m.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
              style={viewLayout===m.id?{background:B.accent,color:"white"}:{color:B.t2}}>
              <span>{m.icon}</span>{m.label}
            </button>
          ))}
        </div>
      </div>
    </div>

    {/* Filters */}
    <AssignmentFiltersBar
      phaseFilter={phaseFilter} setPhaseFilter={setPhaseFilter}
      amountFilter={amountFilter} setAmountFilter={setAmountFilter}
      supplierFilter={supplierFilter} setSupplierFilter={setSupplierFilter}
      debtorFilter={debtorFilter} setDebtorFilter={setDebtorFilter}
      dateFilter={dateFilter} setDateFilter={setDateFilter}
      search={search} setSearch={setSearch}
      suppliers={suppliers} debtors={debtors}
    />

    {/* Batch action bar */}
    {batchMode && selectedIds.length > 0 && <Card className="p-3 mb-4" style={{background: B.accentL+"30", borderColor: B.accent}}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Check size={16} style={{color: B.accent}}/>
          <span className="text-sm font-bold" style={{color: B.accent}}>Выбрано {selectedIds.length}</span>
          {batchAction?.type === "mixed" && <span className="text-[11px]" style={{color: B.red}}>
            ⚠ Выбраны уступки на разных этапах — пачечная обработка недоступна
          </span>}
          {batchAction?.type === "other" && <span className="text-[11px]" style={{color: B.t2}}>
            Этап не поддерживает пачку
          </span>}
          {batchAction?.type === "usko_check" && <span className="text-[11px]" style={{color: B.t2}}>
            → Пачечная проверка комплектов
          </span>}
          {batchAction?.type === "sign_ds" && <span className="text-[11px]" style={{color: B.t2}}>
            → Пачечная подпись ДС ЭЦП банка
          </span>}
          {batchAction?.type === "pay" && <span className="text-[11px]" style={{color: B.t2}}>
            → Пачечное проведение оплаты
          </span>}
        </div>
        {batchAction && (batchAction.type === "usko_check" || batchAction.type === "sign_ds" || batchAction.type === "pay") && <Btn size="sm" icon={Check} onClick={doBatchAction}>
          Обработать пачкой ({selectedIds.length})
        </Btn>}
      </div>
    </Card>}

    {/* Empty */}
    {filtered.length === 0 && <Card className="p-12 text-center">
      <div className="text-5xl mb-3">🎉</div>
      <div className="text-lg font-bold mb-2" style={{color:B.t1}}>Уступки не найдены</div>
      <div className="text-sm" style={{color:B.t3}}>Попробуйте сбросить фильтры или сменить вкладку</div>
    </Card>}

    {/* Content: table / cards / by-deals */}
    {filtered.length > 0 && viewLayout === "table" && <AssignmentTableView
      items={filtered}
      onSelect={setSelectedAsg}
      batchMode={batchMode}
      selectedIds={selectedIds}
      toggleSelect={toggleSelect}
      onSelectBatch={doBatchAction}
      setToast={setToast}
    />}

    {filtered.length > 0 && viewLayout === "cards" && <div className="space-y-1.5">
      {filtered.map(a => <AssignmentCard key={a.id} asg={a} onClick={()=>setSelectedAsg(a)}/>)}
    </div>}

    {filtered.length > 0 && viewLayout === "deals" && <div className="space-y-6">
      {(() => {
        const deals = {};
        filtered.forEach(a => {
          if (!deals[a.dealId]) deals[a.dealId] = [];
          deals[a.dealId].push(a);
        });
        return Object.entries(deals).map(([dealId, items]) => {
          const deal = PIPELINE.find(p=>p.id===dealId);
          const creditor = COMPANIES.find(c=>c.id===deal?.creditorId);
          const allDealAssignments = assignmentsData.filter(a=>a.dealId===dealId);
          const usedAmount = allDealAssignments.filter(a=>a.stage==="paid").reduce((s,a)=>s+a.amount,0);
          const limit = deal?.approvedLimit || 0;
          const usagePct = limit > 0 ? Math.round(usedAmount/limit*100) : 0;

          return <div key={dealId}>
            <Card className="p-4 mb-2" style={{background:B.accentL+"20",borderColor:B.accent+"30"}}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold mono text-sm" style={{color:B.accent}}>{dealId}</span>
                    <span className="text-xs" style={{color:B.t3}}>·</span>
                    <span className="text-sm font-bold" style={{color:B.t1}}>{creditor?.name||deal?.company}</span>
                    {deal && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{background:B.accentL,color:B.accent}}>Генеральный</span>}
                  </div>
                  <div className="text-[10px]" style={{color:B.t3}}>Активен с {deal?.stageStartDate||"—"}</div>
                </div>
                {limit > 0 && <div className="shrink-0 min-w-[220px]">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span style={{color:B.t3}}>Использовано {fmtByn(usedAmount)}</span>
                    <span className="font-bold" style={{color:B.t1}}>{usagePct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{background:B.border}}>
                    <div className="h-full transition-all" style={{width:`${usagePct}%`,background:usagePct>80?B.red:usagePct>50?B.yellow:B.green}}/>
                  </div>
                  <div className="text-[10px] mt-1" style={{color:B.t2}}>Лимит: {fmtByn(limit)}</div>
                </div>}
              </div>
            </Card>
            <div className="space-y-1.5">
              {items.map(a => <AssignmentCard key={a.id} asg={a} onClick={()=>setSelectedAsg(a)}/>)}
            </div>
          </div>;
        });
      })()}
    </div>}
  </div>;
}

// ═══════════════════════════════════════
// AUDIT LOG PAGE (admin only)
// ═══════════════════════════════════════
function AuditLogPage({currentUser, setToast}) {
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [objectTypeFilter, setObjectTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const users = [...new Set(AUDIT_LOG.map(l=>l.userName))];
  const actions = [...new Set(AUDIT_LOG.map(l=>l.action))];
  const objectTypes = [...new Set(AUDIT_LOG.map(l=>l.objectType))];

  const filtered = AUDIT_LOG.filter(log => {
    if (userFilter !== "all" && log.userName !== userFilter) return false;
    if (actionFilter !== "all" && log.action !== actionFilter) return false;
    if (objectTypeFilter !== "all" && log.objectType !== objectTypeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(log.userName.toLowerCase().includes(q) ||
            log.objectId.toLowerCase().includes(q) ||
            (log.details?.comment||"").toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const exportCsv = () => {
    const header = "Дата;Пользователь;Роль;Действие;Тип объекта;ID объекта;IP\n";
    const rows = filtered.map(log =>
      `${log.date};${log.userName};${ROLE_ACCESS[log.userRole]?.label||log.userRole};${AUDIT_ACTION_LABELS[log.action]||log.action};${log.objectType};${log.objectId};${log.details?.ipAddress||"—"}`
    ).join("\n");
    const csv = header + rows;
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({msg:"Журнал экспортирован в CSV",type:"success"});
  };

  const objectTypeLabels = {request:"Заявка", assignment:"Уступка", contract:"Договор", user:"Пользователь", stoplist:"Стоп-лист", settings:"Настройки"};

  return <div>
    <PageHeader title="Журнал действий" breadcrumbs={["Журнал действий"]}
      actions={<Btn size="sm" icon={Download} variant="secondary" onClick={exportCsv}>Экспорт CSV</Btn>}/>

    {/* KPI */}
    <div className="grid grid-cols-4 gap-3 mb-4">
      <Card className="p-3"><div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background:B.accentL}}><FileText size={16} style={{color:B.accent}}/></div>
        <div><div className="text-[10px]" style={{color:B.t3}}>Всего записей</div><div className="text-lg font-black" style={{color:B.t1}}>{AUDIT_LOG.length}</div></div>
      </div></Card>
      <Card className="p-3"><div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background:B.greenL}}><Users size={16} style={{color:B.green}}/></div>
        <div><div className="text-[10px]" style={{color:B.t3}}>Активных пользователей</div><div className="text-lg font-black" style={{color:B.green}}>{users.length}</div></div>
      </div></Card>
      <Card className="p-3"><div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background:B.yellowL}}><AlertTriangle size={16} style={{color:B.yellow}}/></div>
        <div><div className="text-[10px]" style={{color:B.t3}}>Возвратов</div><div className="text-lg font-black" style={{color:B.yellow}}>{AUDIT_LOG.filter(l=>l.action.startsWith("returned")).length}</div></div>
      </div></Card>
      <Card className="p-3"><div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background:B.redL}}><XCircle size={16} style={{color:B.red}}/></div>
        <div><div className="text-[10px]" style={{color:B.t3}}>Отклонено</div><div className="text-lg font-black" style={{color:B.red}}>{AUDIT_LOG.filter(l=>l.action==="rejected").length}</div></div>
      </div></Card>
    </div>

    {/* Filters */}
    <Card className="p-4 mb-4">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{color:B.t3}}>Пользователь</label>
          <select value={userFilter} onChange={e=>setUserFilter(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200" style={{color:B.t1}}>
            <option value="all">Все</option>
            {users.map(u=><option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{color:B.t3}}>Тип действия</label>
          <select value={actionFilter} onChange={e=>setActionFilter(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200" style={{color:B.t1}}>
            <option value="all">Все</option>
            {actions.map(a=><option key={a} value={a}>{AUDIT_ACTION_LABELS[a]||a}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{color:B.t3}}>Тип объекта</label>
          <select value={objectTypeFilter} onChange={e=>setObjectTypeFilter(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200" style={{color:B.t1}}>
            <option value="all">Все</option>
            {objectTypes.map(o=><option key={o} value={o}>{objectTypeLabels[o]||o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{color:B.t3}}>Поиск</label>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Пользователь, ID объекта..." className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200" style={{color:B.t1}}/>
        </div>
      </div>
    </Card>

    {/* Table */}
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{minWidth:900}}>
          <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
            <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Дата и время</th>
            <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Пользователь</th>
            <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Действие</th>
            <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Объект</th>
            <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Детали</th>
            <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>IP</th>
          </tr></thead>
          <tbody>{filtered.length===0 ? <tr><td colSpan={6} className="px-3 py-10 text-center text-xs" style={{color:B.t3}}>Записи не найдены</td></tr>
            : filtered.map((log,i) => {
              const roleInfo = ROLE_ACCESS[log.userRole];
              return <tr key={log.id} className={`border-b border-slate-50 ${i%2===1?"bg-slate-50/30":""}`}>
                <td className="px-3 py-2.5 mono" style={{color:B.t3}}>{log.date}</td>
                <td className="px-3 py-2.5">
                  <div className="font-medium" style={{color:B.t1}}>{log.userName}</div>
                  {roleInfo && <div className="text-[10px]" style={{color:roleInfo.color}}>{roleInfo.icon} {roleInfo.label}</div>}
                </td>
                <td className="px-3 py-2.5 font-semibold" style={{color:B.t1}}>{AUDIT_ACTION_LABELS[log.action]||log.action}</td>
                <td className="px-3 py-2.5">
                  <div className="text-[10px]" style={{color:B.t3}}>{objectTypeLabels[log.objectType]||log.objectType}</div>
                  <div className="mono font-semibold" style={{color:B.accent}}>{log.objectId}</div>
                </td>
                <td className="px-3 py-2.5" style={{color:B.t2}}>
                  {log.details?.amount && <div>Сумма: <strong>{fmtByn(log.details.amount)}</strong></div>}
                  {log.details?.rate && <div>Ставка: {log.details.rate}%</div>}
                  {log.details?.ecpUsed && <div style={{color:B.green}}>ЭЦП: ✓</div>}
                  {log.details?.comment && <div className="italic truncate max-w-[200px]">«{log.details.comment}»</div>}
                  {log.details?.issues && <div className="truncate max-w-[200px]">{log.details.issues.length} проблем</div>}
                  {log.details?.changed && <div>Изменено: {log.details.changed}</div>}
                </td>
                <td className="px-3 py-2.5 mono text-[10px]" style={{color:B.t3}}>{log.details?.ipAddress||"—"}</td>
              </tr>;
            })
          }</tbody>
        </table>
      </div>
    </Card>
  </div>;
}

// ═══════════════════════════════════════
// DOCUMENT DETAIL PAGE + DocLink helper
// ═══════════════════════════════════════

// Shared helper: clickable document link — navigates to the document detail page.
// Always renders a clickable button. If the document isn't in DOCUMENTS_REGISTRY,
// a synthetic ID is passed to DocumentDetailPage, which will auto-generate a minimal
// view from context (reqId/assignmentId + docKey).
function DocLink({docId, docKey, fallbackLabel, assignmentId, reqId, onNavigate, className, style}) {
  let doc = null;
  if (docId) {
    doc = DOCUMENTS_REGISTRY.find(d => d.id === docId);
  }
  if (!doc && docKey) {
    doc = DOCUMENTS_REGISTRY.find(d =>
      d.docType === docKey &&
      ((assignmentId && d.relatedTo?.assignmentId === assignmentId) ||
       (reqId && d.relatedTo?.reqId === reqId))
    );
  }
  const label = doc?.title || fallbackLabel || DOC_TYPE_LABELS[docKey] || docKey || "Документ";

  // Build either real docId or synthetic one encoding the context
  const targetId = doc?.id || (docKey ? `SYNTH:${docKey}:${reqId||""}:${assignmentId||""}` : null);

  const handleClick = (e) => {
    e.stopPropagation();
    if (!targetId) return;
    if (onNavigate) onNavigate(targetId);
    else if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("oborotka:open-doc", {detail:{docId: targetId}}));
    }
  };

  return <button
    onClick={handleClick}
    className={`inline-flex items-center gap-1 hover:underline text-left ${className||""}`}
    style={{color:B.accent, ...(style||{})}}
    title="Открыть страницу документа">
    <FileText size={11} className="shrink-0"/>
    <span className="truncate">{label}</span>
  </button>;
}

function DocumentDetailPage({docId, onBack, setToast}) {
  const [compareModal, setCompareModal] = useState(false);
  let doc = DOCUMENTS_REGISTRY.find(d => d.id === docId);

  // If not found, check for synthetic ID: "SYNTH:docKey:reqId:assignmentId"
  if (!doc && typeof docId === "string" && docId.startsWith("SYNTH:")) {
    const parts = docId.split(":");
    const docKey = parts[1];
    const reqId = parts[2] || null;
    const assignmentId = parts[3] || null;

    // Try to derive meaningful info from source request / assignment
    const req = reqId ? PIPELINE.find(p => p.id === reqId) : null;
    const asg = assignmentId ? ASSIGNMENTS.find(a => a.id === assignmentId) : null;
    const company = req?.company || (asg ? (COMPANIES.find(c=>c.id===asg.creditorId)?.name) : null);

    // Determine status from source docs object
    const srcDocs = req?.docs || asg?.docs || {};
    const raw = srcDocs[docKey];
    let status = "draft";
    if (raw === true) status = "signed";
    else if (typeof raw === "string") status = raw;
    else if (raw?.status) status = raw.status;

    // Build synthetic doc
    doc = {
      id: docId,
      docType: docKey,
      title: DOC_TYPE_LABELS[docKey] || docKey,
      category: assignmentId ? "assignment" : "client",
      relatedTo: {reqId, assignmentId, company},
      status,
      fileFormat: "PDF",
      fileSize: "—",
      signatureChain: [
        {party:"creditor", label:"Клиент", status: (status==="signed"||status==="signed_all") ? "signed" : "pending"},
      ],
      validity: {issueDate:null, expiresAt:null, daysRemaining:null},
      createdAt: req?.created || asg?.createdDate || "—",
      createdBy: "—",
      history: [
        {action: "generated", user: "Система", date: req?.created || asg?.createdDate || "—",
         comment: `Автосгенерированная запись для «${DOC_TYPE_LABELS[docKey]||docKey}»`},
        ...(status === "signed" || status === "signed_all" || status === "signed_bank"
          ? [{action: "signed", user: "Пользователь", date: "—"}] : []),
      ],
      _synthetic: true,
    };
  }

  if (!doc) {
    return <div>
      <PageHeader title="Документ не найден" breadcrumbs={["Документы", "Не найден"]} onBack={onBack}/>
      <Card className="p-10 text-center">
        <div className="text-sm" style={{color:B.t3}}>Документ с ID <span className="mono">{docId}</span> не найден в реестре</div>
      </Card>
    </div>;
  }

  const statusColorMap = {
    signed: B.green, signed_all: B.green, signed_bank: B.accent, signed_client: "#0891B2",
    pending_bank: B.yellow, pending_client: B.yellow, sent: B.accent,
    uploaded_with_issues: B.red, draft: B.t3,
  };
  const statusColor = statusColorMap[doc.status] || B.t2;

  // Navigate to source (request or assignment)
  const goToSource = () => {
    if (doc.relatedTo?.reqId) {
      setToast({msg:`Переход к заявке ${doc.relatedTo.reqId}`, type:"info"});
    } else if (doc.relatedTo?.assignmentId) {
      setToast({msg:`Переход к уступке ${doc.relatedTo.assignmentId}`, type:"info"});
    }
  };

  return <div>
    <PageHeader title={doc.title} subtitle={doc.relatedTo?.company} breadcrumbs={["Документы", doc.id]} onBack={onBack}
      actions={<div className="flex items-center gap-2">
        {/* Cross-module links */}
        {doc.relatedTo?.reqId && <button onClick={()=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("oborotka:nav",{detail:{page:"pipeline"}}))}}
          className="text-[10px] px-2 py-1 rounded-lg hover:bg-slate-100 flex items-center gap-1"
          style={{color:B.accent}}>
          <ExternalLink size={10}/>
          К заявке {doc.relatedTo.reqId}
        </button>}
        {doc.relatedTo?.assignmentId && <button onClick={()=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("oborotka:nav",{detail:{page:"assignments"}}))}}
          className="text-[10px] px-2 py-1 rounded-lg hover:bg-slate-100 flex items-center gap-1"
          style={{color:"#EA580C"}}>
          <ExternalLink size={10}/>
          К уступке {doc.relatedTo.assignmentId}
        </button>}
        {doc.relatedTo?.clientId && <button onClick={()=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("oborotka:nav",{detail:{page:"clients"}}))}}
          className="text-[10px] px-2 py-1 rounded-lg hover:bg-slate-100 flex items-center gap-1"
          style={{color:"#0891B2"}}>
          <ExternalLink size={10}/>
          К клиенту
        </button>}
        <span className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider" style={{background:statusColor+"20", color:statusColor}}>
          {DOC_STATUS_LABELS[doc.status]||doc.status}
        </span>
      </div>}/>

    {/* Big document header card */}
    <Card className="p-6 mb-5">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0" style={{background:B.accentL}}>
          <FileText size={32} style={{color:B.accent}}/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:B.t3}}>{DOC_TYPE_LABELS[doc.docType]||doc.docType}</div>
          <h2 className="text-xl font-bold" style={{color:B.t1}}>{doc.title}</h2>
          <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
            <span className="mono" style={{color:B.t3}}>{doc.id}</span>
            <span style={{color:B.t3}}>·</span>
            <span style={{color:B.t2}}>{doc.fileFormat} · {doc.fileSize}</span>
            <span style={{color:B.t3}}>·</span>
            <span style={{color:B.t2}}>Создан: {doc.createdAt}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Btn size="sm" icon={Eye} onClick={()=>setToast({msg:"Документ открыт в просмотрщике",type:"info"})}>Открыть</Btn>
          <Btn size="sm" variant="secondary" icon={Download} onClick={()=>setToast({msg:"Загрузка...",type:"info"})}>Скачать</Btn>
        </div>
      </div>
    </Card>

    <div className="grid gap-6" style={{gridTemplateColumns:"1fr 340px"}}>
      {/* Left column: signatures + history */}
      <div className="space-y-5 min-w-0">
        {/* Validity / expiration (for consents) */}
        {doc.validity?.expiresAt && <Card className="p-4" style={{
          background: doc.validity.daysRemaining < 0 ? B.redL
            : doc.validity.daysRemaining <= 7 ? B.yellowL : B.greenL,
          borderColor: doc.validity.daysRemaining < 0 ? "#FECACA"
            : doc.validity.daysRemaining <= 7 ? B.yellow+"40" : B.green+"40",
        }}>
          <div className="flex items-center gap-3">
            {doc.validity.daysRemaining < 0
              ? <><XCircle size={18} style={{color:B.red}}/><div>
                  <div className="text-sm font-bold" style={{color:B.red}}>Документ истёк {doc.validity.expiresAt}</div>
                  <div className="text-[11px]" style={{color:B.t2}}>Требуется обновить</div>
                </div></>
              : doc.validity.daysRemaining <= 7
              ? <><AlertTriangle size={18} style={{color:B.yellow}}/><div>
                  <div className="text-sm font-bold" style={{color:B.yellow}}>Истекает через {doc.validity.daysRemaining} {doc.validity.daysRemaining===1?"день":doc.validity.daysRemaining<5?"дня":"дней"} ({doc.validity.expiresAt})</div>
                  <div className="text-[11px]" style={{color:B.t2}}>Рекомендуется запросить новый документ у клиента</div>
                </div></>
              : <><CheckCircle size={18} style={{color:B.green}}/><div>
                  <div className="text-sm font-bold" style={{color:B.green}}>Действует до {doc.validity.expiresAt}</div>
                  <div className="text-[11px]" style={{color:B.t2}}>Осталось {doc.validity.daysRemaining} {doc.validity.daysRemaining===1?"день":doc.validity.daysRemaining<5?"дня":"дней"}</div>
                </div></>
            }
          </div>
        </Card>}

        {/* Signature chain + details */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Цепочка подписей</h3>

          {/* Visual chain — upgraded timeline */}
          <div className="mb-4 p-3 rounded-xl" style={{background: "#F8FAFC"}}>
            <SignatureChainVisual signatureChain={doc.signatureChain}/>
          </div>

          {/* Detailed signatures */}
          {(doc.signatureChain||[]).filter(s => s.status === "signed").length > 0 ? (
            <div className="space-y-2">
              {doc.signatureChain.filter(s => s.status === "signed").map((sig, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{background:B.greenL+"40"}}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{background:B.green}}>
                    <Pen size={14} className="text-white"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold" style={{color:B.t1}}>{sig.signedBy}</div>
                    <div className="text-[10px] font-semibold" style={{color:getPartyColor(sig.party)}}>{sig.label}</div>
                    <div className="text-[11px] mt-1" style={{color:B.t2}}>🔏 {sig.method} · {sig.signedAt}</div>
                  </div>
                  <CheckCircle size={16} style={{color:B.green}} className="shrink-0 mt-1"/>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs py-3 text-center" style={{color:B.t3}}>Документ ещё не подписан</div>
          )}

          {/* Pending */}
          {(doc.signatureChain||[]).filter(s => s.status === "pending").length > 0 && (
            <div className="mt-3 pt-3 border-t" style={{borderColor:B.border}}>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{color:B.t3}}>Ожидается:</div>
              {doc.signatureChain.filter(s => s.status === "pending").map((sig, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Clock size={12} style={{color:B.yellow}}/>
                  <span style={{color:B.t1}}>{sig.label}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* History */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>История документа</h3>
          <div className="space-y-3">
            {(doc.history||[]).map((h,idx)=>{
              const isLast = idx === doc.history.length-1;
              const roleInfo = h.userRole ? ROLE_ACCESS[h.userRole] : null;
              return <div key={idx} className="flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{background:B.greenL}}>
                    <CheckCircle size={12} style={{color:B.green}}/>
                  </div>
                  {!isLast && <div className="w-px flex-1 mt-1" style={{background:B.border, minHeight:20}}/>}
                </div>
                <div className="flex-1 min-w-0 pb-2">
                  <div className="text-xs font-bold" style={{color:B.t1}}>{DOC_ACTION_LABELS[h.action]||h.action}</div>
                  <div className="text-[10px] mt-0.5" style={{color:B.t3}}>
                    {h.user}{roleInfo && <span> · <span style={{color:roleInfo.color}}>{roleInfo.label}</span></span>} · {h.date}
                  </div>
                  {h.comment && <div className="text-[11px] italic mt-1 p-2 rounded-lg" style={{background:"#F8FAFC",color:B.t2}}>💬 {h.comment}</div>}
                </div>
              </div>;
            })}
          </div>
        </Card>

        {/* Version history (if document has versions) */}
        {(doc.version > 1 || doc.previousVersionId) && <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>История версий</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg" style={{background: B.accentL+"40", border:`2px solid ${B.accent}`}}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background: B.accent, color: "white"}}>
                  <FileText size={14}/>
                </div>
                <div>
                  <div className="text-xs font-bold" style={{color: B.t1}}>Версия {doc.version || 1} (текущая)</div>
                  <div className="text-[10px]" style={{color: B.t3}}>{doc.createdAt}</div>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{background: B.accent, color:"white"}}>АКТУАЛЬНАЯ</span>
            </div>
            {doc.previousVersionId && <>
              <div className="ml-4 w-px h-4" style={{background: B.border}}/>
              <button
                onClick={()=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("oborotka:open-doc",{detail:{docId:doc.previousVersionId}}))}}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
                style={{background: "#F8FAFC"}}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background: B.t3 + "30"}}>
                    <FileText size={14} style={{color: B.t3}}/>
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold" style={{color: B.t2}}>Версия {(doc.version||2) - 1}</div>
                    <div className="text-[10px] mono" style={{color: B.t3}}>{doc.previousVersionId}</div>
                  </div>
                </div>
                <ChevronRight size={12} style={{color: B.t3}}/>
              </button>
            </>}
            <Btn size="sm" variant="ghost" className="w-full mt-2" onClick={()=>setCompareModal(true)} disabled={!doc.previousVersionId}>
              Сравнить версии
            </Btn>
          </div>
        </Card>}
      </div>

      {/* Right column: context + metadata */}
      <div className="space-y-5">
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Контекст</h3>
          <div className="space-y-3 text-xs">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:B.t3}}>Тип документа</div>
              <div style={{color:B.t1}}>{DOC_TYPE_LABELS[doc.docType]||doc.docType}</div>
            </div>
            {doc.relatedTo?.reqId && <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:B.t3}}>Заявка</div>
              <button onClick={goToSource} className="font-semibold mono hover:underline" style={{color:B.accent}}>{doc.relatedTo.reqId} →</button>
            </div>}
            {doc.relatedTo?.assignmentId && <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:B.t3}}>Уступка</div>
              <button onClick={goToSource} className="font-semibold mono hover:underline" style={{color:B.accent}}>{doc.relatedTo.assignmentId} →</button>
            </div>}
            {doc.relatedTo?.company && <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:B.t3}}>Клиент</div>
              <div style={{color:B.t1}}>{doc.relatedTo.company}</div>
            </div>}
            {doc.relatedTo?.supplier && <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:B.t3}}>Поставщик</div>
              <div style={{color:B.t1}}>{doc.relatedTo.supplier}</div>
            </div>}
            {doc.relatedTo?.debtor && <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:B.t3}}>Должник</div>
              <div style={{color:B.t1}}>{doc.relatedTo.debtor}</div>
            </div>}
            {doc.relatedTo?.generalContractId && <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{color:B.t3}}>Ген.договор</div>
              <button onClick={()=>window.dispatchEvent(new CustomEvent("oborotka:open-doc",{detail:{docId:doc.relatedTo.generalContractId}}))}
                className="font-semibold mono hover:underline" style={{color:B.accent}}>{doc.relatedTo.generalContractId} →</button>
            </div>}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Метаданные</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span style={{color:B.t3}}>ID документа</span>
              <span className="mono" style={{color:B.t1}}>{doc.id}</span>
            </div>
            <div className="flex justify-between">
              <span style={{color:B.t3}}>Формат</span>
              <span style={{color:B.t1}}>{doc.fileFormat}</span>
            </div>
            <div className="flex justify-between">
              <span style={{color:B.t3}}>Размер</span>
              <span style={{color:B.t1}}>{doc.fileSize}</span>
            </div>
            <div className="flex justify-between">
              <span style={{color:B.t3}}>Создан</span>
              <span style={{color:B.t1}}>{doc.createdAt}</span>
            </div>
            <div className="flex justify-between">
              <span style={{color:B.t3}}>Создатель</span>
              <span className="text-right" style={{color:B.t1}}>{doc.createdBy}</span>
            </div>
            <div className="flex justify-between pt-2 border-t" style={{borderColor:B.border}}>
              <span style={{color:B.t3}}>Статус</span>
              <span className="font-bold" style={{color:statusColor}}>{DOC_STATUS_LABELS[doc.status]||doc.status}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>

    {/* Version comparison modal */}
    <Modal open={compareModal} onClose={()=>setCompareModal(false)} title={`Сравнение версий — ${doc.id}`} wide>
      {(() => {
        const prev = DOCUMENTS_REGISTRY.find(d => d.id === doc.previousVersionId);
        if (!prev) return <div className="text-center py-8 text-sm" style={{color: B.t3}}>Предыдущая версия не найдена в реестре</div>;

        // Compare key fields
        const rows = [
          {field: "Название", v1: prev.title, v2: doc.title},
          {field: "Тип", v1: DOC_TYPE_LABELS[prev.docType]||prev.docType, v2: DOC_TYPE_LABELS[doc.docType]||doc.docType},
          {field: "Статус", v1: DOC_STATUS_LABELS[prev.status]||prev.status, v2: DOC_STATUS_LABELS[doc.status]||doc.status},
          {field: "Создан", v1: prev.createdAt, v2: doc.createdAt},
          {field: "Истекает", v1: prev.validity?.expiresAt || "—", v2: doc.validity?.expiresAt || "—"},
          {field: "Размер", v1: prev.fileSize, v2: doc.fileSize},
        ];

        return <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3" style={{background: "#F8FAFC"}}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background: B.t3 + "30"}}>
                  <FileText size={14} style={{color: B.t3}}/>
                </div>
                <div>
                  <div className="text-xs font-bold" style={{color: B.t2}}>Версия {prev.version || (doc.version||2)-1}</div>
                  <div className="text-[10px] mono" style={{color: B.t3}}>{prev.id}</div>
                </div>
              </div>
            </Card>
            <Card className="p-3" style={{background: B.accentL+"40", borderColor: B.accent}}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background: B.accent, color: "white"}}>
                  <FileText size={14}/>
                </div>
                <div>
                  <div className="text-xs font-bold" style={{color: B.accent}}>Версия {doc.version || 1} (текущая)</div>
                  <div className="text-[10px] mono" style={{color: B.t3}}>{doc.id}</div>
                </div>
              </div>
            </Card>
          </div>

          <div className="rounded-xl overflow-hidden border" style={{borderColor: B.border}}>
            <div className="grid grid-cols-3 text-[10px] font-bold uppercase tracking-wider p-2" style={{background: "#F8FAFC", color: B.t3}}>
              <div>Поле</div>
              <div>Предыдущая</div>
              <div>Текущая</div>
            </div>
            {rows.map((r, i) => {
              const changed = String(r.v1) !== String(r.v2);
              return <div key={i} className="grid grid-cols-3 text-xs p-2 border-t"
                style={{borderColor: B.border, background: changed ? B.yellowL : "white"}}>
                <div className="font-semibold" style={{color: B.t2}}>{r.field}</div>
                <div className="truncate" style={{color: changed ? B.red : B.t2, textDecoration: changed ? "line-through" : "none"}}>
                  {r.v1 || "—"}
                </div>
                <div className="truncate" style={{color: changed ? B.green : B.t1, fontWeight: changed ? 700 : 400}}>
                  {r.v2 || "—"}
                </div>
              </div>;
            })}
          </div>

          <div className="text-[10px] p-2 rounded-lg" style={{background: "#F8FAFC", color: B.t3}}>
            Изменённые поля выделены жёлтым. Удалённые значения — красным зачёркиванием, новые — зелёным жирным.
          </div>
        </div>;
      })()}
    </Modal>
  </div>;
}

// ═══════════════════════════════════════
// PAGE 3: CLIENTS
// ═══════════════════════════════════════
function ClientsPage({pushNav, setToast}) {
  const [topTab, setTopTab] = useState("clients"); // "clients" | "contractors"
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);

  // Show only creditors (companies that take factoring). Debtors are contractors, handled separately.
  const creditors = COMPANIES.filter(c => c.role === "creditor");
  const debtors = COMPANIES.filter(c => c.role === "debtor");

  // Enrich creditors with computed status
  const enriched = creditors.map(c => ({...c, computedStatus: getClientStatus(c, PIPELINE, STOPLIST)}));

  // Debtors enriched with aggregate data from ASSIGNMENTS
  const debtorsEnriched = debtors.map(d => {
    const relatedAsgs = (typeof ASSIGNMENTS !== "undefined" ? ASSIGNMENTS : []).filter(a => a.debtorId === d.id);
    const totalVolume = relatedAsgs.reduce((s, a) => s + (a.amount || 0), 0);
    return {...d, assignmentCount: relatedAsgs.length, totalVolume};
  });

  const filteredClients = enriched.filter(c => {
    if (filter !== "all" && c.computedStatus !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.unp.includes(q);
    }
    return true;
  });

  // Counts per category
  const counts = {
    all: enriched.length,
    active: enriched.filter(c => c.computedStatus === "active").length,
    inactive: enriched.filter(c => c.computedStatus === "inactive").length,
    rejected: enriched.filter(c => c.computedStatus === "rejected").length,
    grey_zone: enriched.filter(c => c.computedStatus === "grey_zone").length,
    stoplist: enriched.filter(c => c.computedStatus === "stoplist").length,
  };

  const statusConfig = {
    active:    {label:"Активный",         icon:"✅", color:B.green,    bg:B.greenL,   description:"Ген.договор подписан, может создавать уступки"},
    inactive:  {label:"Неактивный",       icon:"⏳", color:B.yellow,   bg:B.yellowL,  description:"В процессе подписания ген.договора"},
    rejected:  {label:"Отклонён",         icon:"✗",  color:B.red,      bg:B.redL,     description:"Отклонён скорингом или решением"},
    grey_zone: {label:"Серая зона",       icon:"⚪", color:"#6B7280",  bg:"#F3F4F6",  description:"На ручном рассмотрении"},
    stoplist:  {label:"Стоп-лист",        icon:"🚫", color:B.red,      bg:"#FECACA",  description:"В стоп-листе банка"},
  };

  if (selectedClient) return <ClientDetailView client={selectedClient} onBack={()=>setSelectedClient(null)} setToast={setToast}/>;

  // ─── Contractors (debtors) list filtering ───
  const filteredContractors = debtorsEnriched.filter(d => {
    if (search) {
      const q = search.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.unp.includes(q);
    }
    return true;
  });

  // Pagination (25 per page, separate pages per tab)
  const PAGE_SIZE = 25;
  const clientsPagination = usePagination(filteredClients, PAGE_SIZE);
  const contractorsPagination = usePagination(filteredContractors, PAGE_SIZE);

  return <div>
    <PageHeader title={topTab === "clients" ? "Клиенты" : "Контрагенты-должники"}
      breadcrumbs={["Клиенты", topTab === "contractors" ? "Контрагенты" : undefined].filter(Boolean)}
      actions={<ExportButton filename={topTab === "clients" ? "klienty" : "kontragenty"} setToast={setToast}
        columns={topTab === "clients" ? [
          {key: "name", label: "Название"},
          {key: "unp", label: "УНП"},
          {key: "scoringClass", label: "Скоринг класс"},
          {key: "limit", label: "Лимит"},
          {key: "used", label: "Использовано"},
          {key: "rate", label: "Ставка %"},
          {key: "computedStatus", label: "Статус"},
        ] : [
          {key: "name", label: "Название"},
          {key: "unp", label: "УНП"},
          {key: "scoringClass", label: "Скоринг класс"},
          {key: "rating", label: "Рейтинг"},
          {key: "assignmentCount", label: "Кол-во уступок"},
          {key: "totalVolume", label: "Общая сумма"},
        ]}
        rows={topTab === "clients" ? filteredClients : filteredContractors}/>}/>

    {/* Top tab selector: Clients (creditors) vs Contractors (debtors) */}
    <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 mb-5 inline-flex">
      <button onClick={()=>{setTopTab("clients"); setFilter("all");}}
        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${topTab==="clients"?"bg-white shadow-sm":"hover:text-slate-700"}`}
        style={topTab==="clients" ? {color: B.accent} : {color: B.t3}}>
        Клиенты (кредиторы)
        <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
          style={topTab==="clients" ? {background: B.accentL, color: B.accent} : {background: "transparent", color: B.t3}}>
          {enriched.length}
        </span>
      </button>
      <button onClick={()=>setTopTab("contractors")}
        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${topTab==="contractors"?"bg-white shadow-sm":"hover:text-slate-700"}`}
        style={topTab==="contractors" ? {color: B.purple} : {color: B.t3}}>
        Контрагенты (должники)
        <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
          style={topTab==="contractors" ? {background: B.purpleL, color: B.purple} : {background: "transparent", color: B.t3}}>
          {debtorsEnriched.length}
        </span>
      </button>
    </div>

    {topTab === "clients" && <>

    {/* KPI strip */}
    <div className="grid grid-cols-5 gap-3 mb-5">
      {["active", "inactive", "rejected", "grey_zone", "stoplist"].map(key => {
        const cfg = statusConfig[key];
        const isActive = filter === key;
        return <button key={key} onClick={()=>setFilter(filter === key ? "all" : key)} className="text-left">
          <Card className="p-3 hover:shadow-md transition-all cursor-pointer"
            style={isActive ? {borderColor: cfg.color, borderWidth: 2} : {}}>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-sm" style={{background: cfg.bg}}>
                <span>{cfg.icon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] leading-tight" style={{color: B.t3}}>{cfg.label}</div>
                <div className="text-lg font-black" style={{color: counts[key] > 0 ? cfg.color : B.t3}}>{counts[key]}</div>
              </div>
            </div>
          </Card>
        </button>;
      })}
    </div>

    {/* Tabs + search */}
    <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 overflow-x-auto">
        {[
          {id:"all",       label:"Все",          badge:counts.all},
          {id:"active",    label:"Активные",     badge:counts.active},
          {id:"inactive",  label:"Неактивные",   badge:counts.inactive},
          {id:"rejected",  label:"Отклонены",    badge:counts.rejected},
          {id:"grey_zone", label:"Серая зона",   badge:counts.grey_zone},
          {id:"stoplist",  label:"Стоп-лист",    badge:counts.stoplist},
        ].map(t => <button key={t.id} onClick={()=>setFilter(t.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${filter===t.id?"bg-white shadow-sm":"hover:text-slate-700"}`}
          style={filter===t.id ? {color: statusConfig[t.id]?.color || B.t1} : {color: B.t3}}>
          {t.label}
          {t.badge != null && <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
            style={filter===t.id ? {background: (statusConfig[t.id]?.color || B.accent)+"20", color: statusConfig[t.id]?.color || B.accent} : {background: "transparent", color: B.t3}}>
            {t.badge}
          </span>}
        </button>)}
      </div>
      <div className="w-64 shrink-0"><SearchBar value={search} onChange={setSearch} placeholder="Название, УНП..."/></div>
    </div>

    {/* Active filter description */}
    {filter !== "all" && <Card className="p-3 mb-4" style={{background: statusConfig[filter].bg, borderColor: statusConfig[filter].color+"40"}}>
      <div className="flex items-center gap-2">
        <span className="text-base">{statusConfig[filter].icon}</span>
        <div>
          <div className="text-xs font-bold" style={{color: statusConfig[filter].color}}>
            {statusConfig[filter].label}
          </div>
          <div className="text-[10px]" style={{color: B.t2}}>
            {statusConfig[filter].description}
          </div>
        </div>
      </div>
    </Card>}

    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{minWidth:820}}>
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Компания</th>
          <th className="px-2 py-2.5 text-left font-semibold" style={{color:B.t3}}>УНП</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Скоринг</th>
          <th className="px-2 py-2.5 text-right font-semibold" style={{color:B.t3}}>Лимит</th>
          <th className="px-2 py-2.5 text-right font-semibold" style={{color:B.t3}}>Использ.</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Ставка</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Статус</th>
        </tr></thead>
        <tbody>{clientsPagination.slicedItems.map((c,i)=>{
          const sc2 = c.scoring ? scoringClass(c.scoring.total) : null;
          const cfg = statusConfig[c.computedStatus];
          return <tr key={c.id} onClick={()=>setSelectedClient(c)} className={`border-b border-slate-50 cursor-pointer hover:bg-blue-50/50 transition-colors ${i%2===1?"bg-slate-50/30":""}`}>
            <td className="px-3 py-2.5 font-semibold" style={{color:B.t1}}>{c.name}</td>
            <td className="px-2 py-2.5 mono" style={{color:B.t2}}>{c.unp}</td>
            <td className="px-2 py-2.5 text-center">{sc2?<span className="font-bold px-2 py-0.5 rounded" style={{background:sc2.color+"18",color:sc2.color}}>{c.scoringClass}</span>:<span style={{color:B.t3}}>—</span>}</td>
            <td className="px-2 py-2.5 font-semibold text-right mono" style={{color:B.t1}}>{c.limit?fmtByn(c.limit):"—"}</td>
            <td className="px-2 py-2.5 text-right mono" style={{color:B.t2}}>{c.used!=null?fmtByn(c.used):"—"}</td>
            <td className="px-2 py-2.5 text-center mono" style={{color:B.t1}}>{c.rate?`${c.rate}%`:"—"}</td>
            <td className="px-2 py-2.5 text-center">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
                style={{background: cfg.bg, color: cfg.color}}>
                <span>{cfg.icon}</span>{cfg.label}
              </span>
            </td>
          </tr>})}
          {clientsPagination.total === 0 && <tr>
            <td colSpan={7}>
              <EmptyState icon={Users} title="Клиенты не найдены"
                subtitle="Попробуйте изменить фильтр статуса или поисковый запрос"/>
            </td>
          </tr>}
        </tbody>
      </table>
      </div>
      <Pagination {...clientsPagination} pageSize={PAGE_SIZE}/>
    </Card>
    </>}

    {topTab === "contractors" && <>
      {/* Search only for contractors */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="text-[11px]" style={{color:B.t2}}>
          Контрагенты-должники — компании, по которым кредиторы получают уступки.
          Здесь показан перечень с агрегатом по уступкам.
        </div>
        <div className="w-64 shrink-0"><SearchBar value={search} onChange={setSearch} placeholder="Название, УНП..."/></div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{minWidth:820}}>
          <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
            <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Название</th>
            <th className="px-2 py-2.5 text-left font-semibold" style={{color:B.t3}}>УНП</th>
            <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Скоринг</th>
            <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}>Рейтинг</th>
            <th className="px-2 py-2.5 text-right font-semibold" style={{color:B.t3}}>Кол-во уступок</th>
            <th className="px-2 py-2.5 text-right font-semibold" style={{color:B.t3}}>Общая сумма</th>
          </tr></thead>
          <tbody>{contractorsPagination.slicedItems.map((d,i)=>{
            const sc2 = d.scoring ? scoringClass(d.scoring.total) : null;
            return <tr key={d.id} onClick={()=>setSelectedClient(d)} className={`border-b border-slate-50 cursor-pointer hover:bg-blue-50/50 transition-colors ${i%2===1?"bg-slate-50/30":""}`}>
              <td className="px-3 py-2.5 font-semibold" style={{color:B.t1}}>{d.name}</td>
              <td className="px-2 py-2.5 mono" style={{color:B.t2}}>{d.unp}</td>
              <td className="px-2 py-2.5 text-center">{sc2?<span className="font-bold px-2 py-0.5 rounded" style={{background:sc2.color+"18",color:sc2.color}}>{d.scoringClass}</span>:<span style={{color:B.t3}}>—</span>}</td>
              <td className="px-2 py-2.5 text-center" style={{color:B.t2}}>
                {d.rating ? <span className="font-bold">{d.rating}/5</span> : <span style={{color:B.t3}}>—</span>}
              </td>
              <td className="px-2 py-2.5 text-right mono font-semibold" style={{color: d.assignmentCount > 0 ? B.accent : B.t3}}>
                {d.assignmentCount || 0}
              </td>
              <td className="px-2 py-2.5 text-right mono font-bold" style={{color: d.totalVolume > 0 ? B.t1 : B.t3}}>
                {d.totalVolume > 0 ? fmtByn(d.totalVolume) : "—"}
              </td>
            </tr>;
          })}
          {contractorsPagination.total === 0 && <tr>
            <td colSpan={6}>
              <EmptyState icon={Building2} title="Контрагенты не найдены"
                subtitle="Попробуйте изменить поисковый запрос"/>
            </td>
          </tr>}
          </tbody>
        </table>
        </div>
        <Pagination {...contractorsPagination} pageSize={PAGE_SIZE}/>
      </Card>
    </>}
  </div>;
}

function ClientDetailView({client, onBack, setToast}) {
  const [limitModal, setLimitModal] = useState(false);
  const [blockDangerModal, setBlockDangerModal] = useState(false);
  const [rateModal, setRateModal] = useState(false);
  const [newLimit, setNewLimit] = useState(client.limit||0);
  const [newRate, setNewRate] = useState(client.rate||25);

  const clientDeals = ALL_DEALS.filter(d=>d.creditorId===client.id||d.debtorId===client.id);
  // Active factoring deals (from pipeline) — per customer feedback, show them on client page
  const clientActiveDeals = PIPELINE.filter(p => p.stage === "active" && p.creditorId === client.id);
  const sc2 = client.scoring ? scoringClass(client.scoring.total) : null;
  const relatedCompanies = client.role==="creditor"
    ? COMPANIES.filter(c=>c.role==="debtor"&&ALL_DEALS.some(d=>d.creditorId===client.id&&d.debtorId===c.id))
    : COMPANIES.filter(c=>c.role==="creditor"&&ALL_DEALS.some(d=>d.debtorId===client.id&&d.creditorId===c.id));

  // Computed status + latest request for banner
  const computedStatus = getClientStatus(client, PIPELINE, STOPLIST);
  const latestRequest = getLatestClientRequest(client, PIPELINE);

  const historyLog = [
    {date:"2026-01-15", action:"Регистрация на платформе", user:"Система"},
    {date:"2026-01-16", action:`Лимит установлен: ${fmtByn(client.limit||0)}`, user:"Иванов А.С."},
    {date:"2026-02-01", action:`Ставка изменена: ${client.rate}%`, user:"Иванов А.С."},
  ];

  // PDF export — opens print-friendly window
  const exportToPdf = () => {
    const sc2 = client.scoring ? scoringClass(client.scoring.total) : null;
    const statusLabels = {active: "Активный", inactive: "В процессе", rejected: "Отклонён", grey_zone: "В серой зоне", stoplist: "В стоп-листе"};
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Досье: ${client.name}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; max-width: 900px; margin: 40px auto; padding: 0 40px; line-height: 1.5; }
  h1 { font-size: 22px; margin-bottom: 4px; color: #1E40AF; }
  h2 { font-size: 14px; border-bottom: 2px solid #DBEAFE; padding-bottom: 6px; margin-top: 28px; color: #1E40AF; }
  .meta { color: #64748B; font-size: 11px; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .field { border-left: 3px solid #DBEAFE; padding: 4px 10px; background: #F8FAFC; border-radius: 4px; }
  .field-label { font-size: 9px; color: #64748B; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }
  .field-value { font-size: 12px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
  th { background: #F8FAFC; text-align: left; padding: 6px 10px; font-size: 10px; color: #64748B; }
  td { padding: 6px 10px; border-bottom: 1px solid #E2E8F0; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 10px; color: #94A3B8; text-align: center; }
  @media print { body { margin: 0; padding: 20px; } h1 { page-break-after: avoid; } }
</style>
</head>
<body>
  <h1>Досье клиента: ${client.name}</h1>
  <div class="meta">УНП ${client.unp} · Роль: ${client.role === "creditor" ? "Кредитор" : "Должник"} · Статус: ${statusLabels[computedStatus] || computedStatus} · Сформировано: ${new Date().toLocaleString("ru")}</div>

  <h2>Основные данные</h2>
  <div class="grid">
    <div class="field"><div class="field-label">Название</div><div class="field-value">${client.name}</div></div>
    <div class="field"><div class="field-label">УНП</div><div class="field-value">${client.unp}</div></div>
    <div class="field"><div class="field-label">Роль</div><div class="field-value">${client.role === "creditor" ? "Кредитор (поставщик)" : "Должник"}</div></div>
    <div class="field"><div class="field-label">Лимит факторинга</div><div class="field-value">${client.limit ? fmtByn(client.limit) : "—"}</div></div>
    <div class="field"><div class="field-label">Использовано</div><div class="field-value">${client.used != null ? fmtByn(client.used) : "—"}</div></div>
    <div class="field"><div class="field-label">Ставка</div><div class="field-value">${client.rate ? client.rate + "%" : "—"}</div></div>
  </div>

  ${sc2 ? `
  <h2>Скоринг</h2>
  <div class="grid">
    <div class="field"><div class="field-label">Скоринг-класс</div><div class="field-value" style="color: ${sc2.color}">${client.scoringClass}</div></div>
    <div class="field"><div class="field-label">Балл</div><div class="field-value">${client.scoring.total} / 200</div></div>
    <div class="field"><div class="field-label">Риск</div><div class="field-value">${sc2.risk || "—"}</div></div>
    <div class="field"><div class="field-label">Рекомендация</div><div class="field-value">${sc2.rec || "—"}</div></div>
  </div>
  ` : ""}

  <h2>Сделки клиента (${clientDeals.length})</h2>
  ${clientDeals.length > 0 ? `
  <table>
    <thead><tr><th>№</th><th>Сумма</th><th>Срок</th><th>Статус</th></tr></thead>
    <tbody>
      ${clientDeals.slice(0, 20).map(d => `<tr><td style="font-family: monospace; color: #1E40AF;">${d.id}</td><td>${fmtByn(d.amount)}</td><td>${d.term} дн.</td><td>${d.status}</td></tr>`).join("")}
    </tbody>
  </table>
  ` : `<div style="color: #64748B; font-size: 11px; padding: 12px 0;">Нет сделок</div>`}

  <h2>Связанные компании</h2>
  ${relatedCompanies.length > 0 ? `
  <table>
    <thead><tr><th>Название</th><th>УНП</th><th>Роль</th></tr></thead>
    <tbody>
      ${relatedCompanies.slice(0, 20).map(c => `<tr><td>${c.name}</td><td style="font-family: monospace;">${c.unp}</td><td>${c.role === "creditor" ? "Кредитор" : "Должник"}</td></tr>`).join("")}
    </tbody>
  </table>
  ` : `<div style="color: #64748B; font-size: 11px; padding: 12px 0;">Нет связей</div>`}

  <h2>История</h2>
  <table>
    <thead><tr><th>Дата</th><th>Действие</th><th>Пользователь</th></tr></thead>
    <tbody>
      ${historyLog.map(h => `<tr><td>${h.date}</td><td>${h.action}</td><td>${h.user}</td></tr>`).join("")}
    </tbody>
  </table>

  <div class="footer">
    Oborotka.by · Банк Oborotka (Нео Банк Азия) · Конфиденциальная информация · Документ сформирован автоматически
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;
    try {
      const w = window.open("", "_blank", "width=900,height=1200");
      if (w) {
        w.document.write(html);
        w.document.close();
        setToast && setToast({msg: "Досье открыто для печати. Используйте «Сохранить как PDF» в диалоге печати.", type: "success"});
      } else {
        setToast && setToast({msg: "Блокировка всплывающих окон. Разрешите popup для скачивания.", type: "warning"});
      }
    } catch(e) {
      setToast && setToast({msg: "Ошибка экспорта", type: "error"});
    }
  };

  return <div>
    <PageHeader title={client.name} breadcrumbs={["Клиенты",client.name]} onBack={onBack}
      actions={<div className="flex gap-2">
        <Btn size="sm" variant="ghost" icon={Download} onClick={exportToPdf}>Досье PDF</Btn>
        <Btn size="sm" variant="secondary" icon={CreditCard} onClick={()=>setLimitModal(true)}>Изменить лимит</Btn>
        <Btn size="sm" variant="secondary" icon={TrendingUp} onClick={()=>setRateModal(true)}>Изменить ставку</Btn>
        <Btn size="sm" variant="danger" icon={Lock} onClick={() => setBlockDangerModal(true)}>Заблокировать</Btn>
      </div>}/>

    {/* ─── STATUS BANNERS ─── */}
    {computedStatus === "inactive" && latestRequest && <Card className="p-4 mb-4" style={{background: B.yellowL, borderColor: B.yellow+"40"}}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-bold" style={{color: B.yellow}}>⏳ В процессе подписания ген.договора</div>
          <div className="text-sm font-semibold mt-1" style={{color: B.t1}}>
            Заявка <span className="mono">{latestRequest.id}</span> · этап: {PIPELINE_STAGES.find(s => s.id === latestRequest.stage)?.label || latestRequest.stage}
          </div>
          <div className="text-[10px] mt-1" style={{color: B.t2}}>
            {getDaysOnStage(latestRequest)} раб.д на этапе
            {getSlaLimit(latestRequest.stage, latestRequest.tier) && <> · SLA: {getSlaLimit(latestRequest.stage, latestRequest.tier)}д</>}
          </div>
        </div>
        <Btn size="sm" variant="secondary" icon={ArrowRight}
          onClick={()=>{if(typeof window!=="undefined") window.dispatchEvent(new CustomEvent("oborotka:nav", {detail:{page:"pipeline", reqId: latestRequest.id}}));}}>
          К заявке
        </Btn>
      </div>
    </Card>}

    {computedStatus === "rejected" && latestRequest && <Card className="p-4 mb-4" style={{background: B.redL, borderColor: B.red+"40"}}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-bold" style={{color: B.red}}>✗ Клиент отклонён</div>
          <div className="text-sm font-semibold mt-1" style={{color: B.t1}}>
            Заявка <span className="mono">{latestRequest.id}</span>
          </div>
          {latestRequest.rejectReason && <div className="text-[10px] mt-1 italic" style={{color: B.t2}}>
            Причина: «{latestRequest.rejectReason}»
          </div>}
          {latestRequest.rejectDate && <div className="text-[10px] mt-0.5" style={{color: B.t3}}>
            Дата: {latestRequest.rejectDate}
          </div>}
        </div>
        <Btn size="sm" variant="secondary" icon={RefreshCw}
          onClick={()=>setToast&&setToast({msg:"Заявка возвращена на рассмотрение (mock)", type:"success"})}>
          Рассмотреть повторно
        </Btn>
      </div>
    </Card>}

    {computedStatus === "grey_zone" && latestRequest && <Card className="p-4 mb-4" style={{background: "#F3F4F6", borderColor: "#D1D5DB"}}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-bold" style={{color: "#6B7280"}}>⚪ В серой зоне</div>
          <div className="text-sm font-semibold mt-1" style={{color: B.t1}}>
            Заявка <span className="mono">{latestRequest.id}</span> · балл {latestRequest.scoringTotal || "—"}/200
          </div>
          <div className="text-[10px] mt-1" style={{color: B.t2}}>
            Требует ручного рассмотрения — автоскоринг не пропустил
          </div>
          <div className="text-[10px] mt-1 p-2 rounded" style={{background: "white", color: B.t3}}>
            <strong style={{color: B.t2}}>Как работает серая зона:</strong> балл {latestRequest.scoringTotal || "—"} находится в диапазоне <strong>100–140</strong> — пограничный случай.
            Автоматически одобрять рисковано, отказывать — теряем клиента. Решение за аналитиком/ЛПР.
          </div>
        </div>
        <Btn size="sm" variant="secondary" icon={ArrowRight}
          onClick={()=>{if(typeof window!=="undefined") window.dispatchEvent(new CustomEvent("oborotka:nav", {detail:{page:"pipeline", reqId: latestRequest.id}}));}}>
          Рассмотреть
        </Btn>
      </div>
    </Card>}

    {computedStatus === "stoplist" && <Card className="p-4 mb-4" style={{background: "#FECACA", borderColor: B.red+"60", borderWidth: 2}}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-bold" style={{color: B.red}}>🚫 В стоп-листе банка</div>
          <div className="text-[11px] mt-1" style={{color: B.t2}}>
            Этот клиент в стоп-листе. Заявки от него автоматически отклоняются.
          </div>
        </div>
        <Btn size="sm" variant="secondary" icon={ArrowRight}
          onClick={()=>{if(typeof window!=="undefined") window.dispatchEvent(new CustomEvent("oborotka:nav", {detail:{page:"stoplist"}}));}}>
          К стоп-листу
        </Btn>
      </div>
    </Card>}

    {computedStatus === "active" && clientActiveDeals.length > 0 && <Card className="p-4 mb-4" style={{background: B.greenL, borderColor: B.green+"40"}}>
      <div className="flex items-center gap-3">
        <CheckCircle size={18} style={{color: B.green}} className="shrink-0"/>
        <div>
          <div className="text-xs font-bold" style={{color: B.green}}>✅ Активный клиент</div>
          <div className="text-[11px] mt-0.5" style={{color: B.t2}}>
            Ген.договор факторинга подписан. Клиент может создавать уступки по лимиту {fmtByn(client.limit||0)}.
          </div>
        </div>
      </div>
    </Card>}

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

        {/* Active factoring deals (from pipeline, per customer feedback) */}
        {clientActiveDeals.length > 0 && <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold" style={{color:B.t1}}>
              ✅ Активные факторинговые сделки ({clientActiveDeals.length})
            </h3>
          </div>
          <div className="space-y-2">
            {clientActiveDeals.map(deal => {
              const dealAssignments = ASSIGNMENTS.filter(a => a.dealId === deal.id);
              const usedAmount = dealAssignments.filter(a => a.stage === "paid").reduce((s,a) => s+a.amount, 0);
              const limit = deal.approvedLimit || 0;
              const usagePct = limit > 0 ? Math.round(usedAmount/limit*100) : 0;
              return <button key={deal.id}
                onClick={()=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("oborotka:nav",{detail:{page:"assignments"}}))}}
                className="w-full text-left p-3 rounded-lg border hover:bg-slate-50 transition-colors"
                style={{borderColor: B.border}}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="mono text-xs font-bold" style={{color: B.accent}}>{deal.id}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{background: B.accentL, color: B.accent}}>
                      Ген.договор
                    </span>
                  </div>
                  <div className="text-xs font-bold mono" style={{color: B.t1}}>{fmtByn(limit)}</div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-[10px]">
                  <div>
                    <div style={{color: B.t3}}>Ставка</div>
                    <div className="font-semibold" style={{color: B.t1}}>{deal.approvedRate}%</div>
                  </div>
                  <div>
                    <div style={{color: B.t3}}>Уступок</div>
                    <div className="font-semibold" style={{color: B.t1}}>{dealAssignments.length}</div>
                  </div>
                  <div>
                    <div style={{color: B.t3}}>Использовано</div>
                    <div className="font-semibold" style={{color: usagePct>80?B.red:B.t1}}>{usagePct}%</div>
                  </div>
                </div>
              </button>;
            })}
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

        {/* Activity timeline — heatmap по месяцам */}
        <Card className="p-5">
          <h3 className="text-sm font-bold mb-1" style={{color: B.t1}}>Активность клиента</h3>
          <div className="text-[10px] mb-3" style={{color: B.t3}}>
            Количество уступок по месяцам — виден ритм работы с клиентом
          </div>
          {(() => {
            // Build activity by month (last 12 months)
            const months = [];
            const now = new Date("2026-03-26");
            for (let i = 11; i >= 0; i--) {
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              const label = d.toLocaleDateString("ru", {month: "short"});
              months.push({key, label, count: 0, year: d.getFullYear(), month: d.getMonth() + 1});
            }
            // Count assignments per month for this client
            if (typeof ASSIGNMENTS !== "undefined") {
              ASSIGNMENTS.filter(a => a.creditorId === client.id || a.debtorId === client.id).forEach(a => {
                if (!a.createdDate) return;
                const m = months.find(mo => a.createdDate.startsWith(mo.key));
                if (m) m.count++;
              });
            }
            const maxCount = Math.max(1, ...months.map(m => m.count));
            return <div>
              <div className="flex items-end gap-1 h-20 mb-2">
                {months.map((m, i) => {
                  const height = (m.count / maxCount) * 100;
                  const isCurrent = i === months.length - 1;
                  return <div key={m.key} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="w-full rounded-t relative transition-all hover:opacity-80"
                      style={{
                        height: `${Math.max(height, m.count > 0 ? 10 : 2)}%`,
                        background: m.count === 0 ? "#F1F5F9" : isCurrent ? B.accent : B.accent + "70",
                        minHeight: 2,
                      }}>
                      {m.count > 0 && <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold" style={{color: B.t1}}>
                        {m.count}
                      </div>}
                    </div>
                  </div>;
                })}
              </div>
              <div className="flex items-end gap-1">
                {months.map(m => <div key={m.key} className="flex-1 text-[9px] text-center" style={{color: B.t3}}>
                  {m.label}
                </div>)}
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px]" style={{color: B.t3}}>
                <span>Всего за 12 мес: <strong style={{color: B.t1}}>{months.reduce((s, m) => s + m.count, 0)}</strong> уступок</span>
                <span>Пиковый месяц: <strong style={{color: B.t1}}>
                  {months.reduce((best, m) => m.count > best.count ? m : best, months[0]).label} ({maxCount})
                </strong></span>
              </div>
            </div>;
          })()}
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
        <Btn onClick={()=>{
          const oldLimit = client.limit;
          setLimitModal(false);
          setToast({
            msg: `Лимит ${client.name} изменён: ${fmtByn(oldLimit)} → ${fmtByn(newLimit)}`,
            type: "success",
            actionLabel: "Отменить",
            onUndo: () => {
              setNewLimit(oldLimit);
              setToast && setToast({msg: "Изменение лимита отменено", type: "info"});
            },
          });
        }} className="w-full">Сохранить</Btn>
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
        <Btn onClick={()=>{
          const oldRate = client.rate;
          setRateModal(false);
          setToast({
            msg: `Ставка ${client.name} изменена: ${oldRate}% → ${newRate}%`,
            type: "success",
            actionLabel: "Отменить",
            onUndo: () => {
              setNewRate(oldRate);
              setToast && setToast({msg: "Изменение ставки отменено", type: "info"});
            },
          });
        }} className="w-full">Сохранить</Btn>
      </div>
    </Modal>

    {/* Block client confirmation */}
    <DangerConfirmModal
      open={blockDangerModal}
      onClose={() => setBlockDangerModal(false)}
      onConfirm={() => setToast && setToast({msg: `Клиент ${client.name} заблокирован`, type: "success"})}
      title={`Заблокировать клиента «${client.name}»?`}
      description="Клиент будет заблокирован. Новые заявки от него будут автоматически отклоняться. Действующие уступки останутся в системе."
      actionLabel="ЗАБЛОКИРОВАТЬ"
      coolDownSec={3}
      accent={B.red}
      icon={Lock}
    />
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

  // Mock period-over-period deltas (in real product — compute from historical snapshots)
  const deltas = {
    totalPortfolio: {value: 12.3, dir: "up"},     // +12.3% vs last month
    avgCheck:       {value: 5.8, dir: "up"},
    avgTerm:        {value: 2.1, dir: "down"},    // term decreased (good — faster rotation)
    war:            {value: 0.3, dir: "up"},
  };

  if(selectedDeal) return <DealDetailView deal={selectedDeal} onBack={()=>setSelectedDeal(null)} setToast={setToast}/>;

  // Delta badge helper
  const DeltaBadge = ({delta, invertColor}) => {
    if (!delta) return null;
    const isUp = delta.dir === "up";
    // Green if growth is good (portfolio up, war up), red if bad (term up, for example invertColor=true)
    const isPositive = invertColor ? !isUp : isUp;
    const color = isPositive ? B.green : B.red;
    return <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ml-1" style={{background: color + "15", color}}>
      {isUp ? "↑" : "↓"} {delta.value}%
    </span>;
  };

  return <div>
    <PageHeader title="Портфель" breadcrumbs={["Портфель"]}/>

    <div className="grid grid-cols-2 gap-4 mb-6">
      <KPICard label={<>Общий портфель <DeltaBadge delta={deltas.totalPortfolio}/></>} value={fmtByn(totalPortfolio)} icon={TrendingUp} color={B.accent} tooltip="Все активные + просроченные · сравнение с прошлым месяцем"/>
      <KPICard label={<>Средний чек <DeltaBadge delta={deltas.avgCheck}/></>} value={fmtByn(avgCheck)} icon={CreditCard} color={B.purple}/>
      <KPICard label={<>Средний срок <DeltaBadge delta={deltas.avgTerm} invertColor/></>} value={`${avgTerm} дн.`} icon={Clock} color={B.yellow}/>
      <KPICard label={<>WAR <DeltaBadge delta={deltas.war}/></>} value={`${war}%`} icon={TrendingUp} color={B.green} tooltip="Средневзвешенная ставка"/>
    </div>

    {/* Portfolio forecast — next 30/60/90 days */}
    <Card className="p-5 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold" style={{color: B.t1}}>
            Прогноз портфеля на 30/60/90 дней
          </h3>
          <div className="text-[10px] mt-0.5" style={{color: B.t3}}>
            Экстраполяция на основе текущих темпов выдачи/погашения. Серая полоса — интервал уверенности ±15%.
          </div>
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded" style={{background: "#EEF2FF", color: "#6366F1"}}>
          Модель v1.0 · Линейная
        </span>
      </div>

      {(() => {
        // Generate forecast points (daily growth rate ~0.4% based on deltas.totalPortfolio.value / 30)
        const dailyGrowth = deltas.totalPortfolio.value / 30 / 100; // e.g., 12.3% / 30 days / 100 = 0.0041
        const forecastData = [];
        for (let day = 0; day <= 90; day += 5) {
          const base = totalPortfolio * Math.pow(1 + dailyGrowth, day);
          const spread = base * 0.15; // ±15% confidence
          forecastData.push({
            day: day === 0 ? "Сейчас" : `+${day}д`,
            forecast: Math.round(base),
            lower: Math.round(base - spread),
            upper: Math.round(base + spread),
            isActual: day === 0,
          });
        }

        // Bank limit (hardcoded mock — 15M)
        const bankLimit = 15000000;
        const forecast30 = forecastData.find(f => f.day === "+30д");
        const forecast60 = forecastData.find(f => f.day === "+60д");
        const forecast90 = forecastData.find(f => f.day === "+90д");

        // Check if forecast exceeds bank limit
        const breakPoint = forecastData.find(f => f.upper >= bankLimit);

        return <div>
          {/* Chart */}
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={forecastData} margin={{top: 10, right: 20, bottom: 0, left: 40}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
              <XAxis dataKey="day" tick={{fontSize: 10, fill: B.t3}}/>
              <YAxis tick={{fontSize: 10, fill: B.t3}} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`}/>
              <Tooltip formatter={v => fmtByn(v)} labelStyle={{fontSize: 11}}/>
              {/* Confidence interval bands - manual rendering with Area if available */}
              <Line type="monotone" dataKey="upper" stroke="#E2E8F0" strokeWidth={1} strokeDasharray="2 2" dot={false} name="Верхний +15%"/>
              <Line type="monotone" dataKey="lower" stroke="#E2E8F0" strokeWidth={1} strokeDasharray="2 2" dot={false} name="Нижний -15%"/>
              <Line type="monotone" dataKey="forecast" stroke={B.accent} strokeWidth={2} dot={{fill: B.accent, r: 3}} name="Прогноз"/>
              {/* Bank limit line */}
              <Line type="monotone" dataKey={() => bankLimit} stroke={B.red} strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Лимит банка"/>
            </LineChart>
          </ResponsiveContainer>

          {/* Forecast summary */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="p-3 rounded-xl" style={{background: "#F8FAFC", border: `1px solid ${B.border}`}}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{color: B.t3}}>Через 30 дней</div>
              <div className="text-base font-black mono mt-1" style={{color: B.t1}}>{fmtByn(forecast30?.forecast || 0)}</div>
              <div className="text-[9px] mt-0.5" style={{color: B.t3}}>
                {fmtByn(forecast30?.lower || 0)} — {fmtByn(forecast30?.upper || 0)}
              </div>
            </div>
            <div className="p-3 rounded-xl" style={{background: "#F8FAFC", border: `1px solid ${B.border}`}}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{color: B.t3}}>Через 60 дней</div>
              <div className="text-base font-black mono mt-1" style={{color: B.t1}}>{fmtByn(forecast60?.forecast || 0)}</div>
              <div className="text-[9px] mt-0.5" style={{color: B.t3}}>
                {fmtByn(forecast60?.lower || 0)} — {fmtByn(forecast60?.upper || 0)}
              </div>
            </div>
            <div className="p-3 rounded-xl" style={{background: "#F8FAFC", border: `1px solid ${B.border}`}}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{color: B.t3}}>Через 90 дней</div>
              <div className="text-base font-black mono mt-1" style={{color: B.t1}}>{fmtByn(forecast90?.forecast || 0)}</div>
              <div className="text-[9px] mt-0.5" style={{color: B.t3}}>
                {fmtByn(forecast90?.lower || 0)} — {fmtByn(forecast90?.upper || 0)}
              </div>
            </div>
          </div>

          {/* Limit warning */}
          {breakPoint && <div className="mt-3 p-3 rounded-lg flex items-start gap-2" style={{background: B.yellowL, borderLeft: `3px solid ${B.yellow}`}}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{color: B.yellow}}/>
            <div className="text-[11px]" style={{color: B.t1}}>
              <strong>Приближение к лимиту банка ({fmtByn(bankLimit)}):</strong> при текущих темпах верхняя граница превысит лимит через <strong>{breakPoint.day}</strong>. Рассмотреть: повышение лимита, временный стоп новых уступок.
            </div>
          </div>}
        </div>;
      })()}
    </Card>

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
    <PageHeader title="Просрочки" breadcrumbs={["Просрочки"]}
      actions={<ExportButton filename="prosrochki" setToast={setToast}
        columns={[
          {key: "id", label: "ID"},
          {key: "debtorId", label: "Должник", formatter: d => getDebtorName(d.debtorId)},
          {key: "creditorId", label: "Кредитор", formatter: d => getCreditorName(d.creditorId)},
          {key: "amount", label: "Сумма"},
          {key: "daysLeft", label: "Дней просрочки", formatter: d => Math.abs(d.daysLeft)},
          {key: "reservePct", label: "Резерв %", formatter: d => getReservePercent(Math.abs(d.daysLeft))},
          {key: "reserveByn", label: "Резерв BYN", formatter: d => Math.round(d.amount * getReservePercent(Math.abs(d.daysLeft)) / 100)},
        ]}
        rows={overdueDeals}/>}/>

    {/* Reserve scale visual */}
    <Card className="p-5 mb-6">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-bold" style={{color:B.t1}}>
          <InfoTooltip text="Шкала формирования резерва по просроченным уступкам согласно внутренней политике банка">Шкала резервов</InfoTooltip>
        </h3>
        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{background:"#EEF2FF", color:"#6366F1"}}>АБС банка · read-only</span>
      </div>
      <div className="flex items-end gap-0 h-24">
        {reserveScale.map((r,i)=><div key={i} className="flex-1 flex flex-col items-center justify-end">
          <div className="text-xs font-bold mb-1" style={{color:r.color}}>{r.pct}%</div>
          <div className="w-full rounded-t-lg" style={{height:`${r.pct*0.8}px`,background:r.color+"30",borderTop:`3px solid ${r.color}`}}/>
          <div className="text-[10px] mt-1 font-medium" style={{color:B.t3}}>День {r.day}{i===3?"+":""}</div>
        </div>)}
      </div>
      <div className="text-[10px] mt-4 p-2 rounded-lg flex items-start gap-1.5" style={{background:"#EEF2FF", color:"#6366F1"}}>
        <Info size={11} className="shrink-0 mt-0.5"/>
        <span>Резервирование средств, начисление пеней и движение по корр.счёту — операции АБС банка. Oborotka.by отображает актуальные значения, полученные из АБС «Нео Банк Азия».</span>
      </div>
    </Card>

    {/* Escalation workflow */}
    <Card className="p-5 mb-6">
      <h3 className="text-sm font-bold mb-1" style={{color: B.t1}}>
        <InfoTooltip text="Автоматические действия при просрочке платежа должником">Автоматическая эскалация</InfoTooltip>
      </h3>
      <div className="text-[10px] mb-4" style={{color: B.t3}}>
        Платформа автоматически выполняет эти действия по мере увеличения просрочки
      </div>
      <div className="grid grid-cols-4 gap-0">
        {[
          {day: 3, label: "Напоминание", desc: "Платформа отправляет email и SMS должнику о приближающемся сроке", color: B.yellow, icon: Bell, action: "Auto"},
          {day: 7, label: "Претензия", desc: "Автоматическая отправка официальной претензии с расчётом пеней", color: B.orange, icon: AlertTriangle, action: "Auto"},
          {day: 14, label: "Юр.отдел", desc: "Передача дела в юридический отдел, блокировка новых уступок от кредитора", color: B.red, icon: FileText, action: "Auto + manual review"},
          {day: 30, label: "Взыскание", desc: "Подача иска в суд, досудебное урегулирование", color: "#991B1B", icon: Ban, action: "Manual"},
        ].map((step, idx, arr) => <React.Fragment key={idx}>
          <div className="flex flex-col items-center p-3 rounded-xl" style={{background: step.color + "08", border: `1px solid ${step.color}30`}}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2 shrink-0" style={{background: "white", border: `2px solid ${step.color}`}}>
              <step.icon size={16} style={{color: step.color}}/>
            </div>
            <div className="text-[11px] font-bold mb-0.5" style={{color: step.color}}>День {step.day}+</div>
            <div className="text-[11px] font-bold mb-1" style={{color: B.t1}}>{step.label}</div>
            <div className="text-[9px] leading-tight text-center" style={{color: B.t2}}>{step.desc}</div>
            <div className="text-[8px] mt-2 px-1.5 py-0.5 rounded-full font-bold" style={{background: step.action === "Manual" ? B.yellowL : B.accentL, color: step.action === "Manual" ? B.yellow : B.accent}}>
              {step.action === "Auto" ? "⚙ Автоматически" : step.action === "Manual" ? "👤 Ручное" : "⚙+👤"}
            </div>
          </div>
        </React.Fragment>)}
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
                <Btn size="sm" variant="ghost" onClick={()=>setToast({msg:`Уведомление о просрочке направлено клиенту по ${d.id}`,type:"info"})}>Уведомить</Btn>
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
// PAGE 6: DOCUMENTS (3-tab redesign)
// ═══════════════════════════════════════

// Reusable: visual signature chain (Creditor → Bank → Debtor)
function SignatureChain({signatureChain, compact}) {
  const chain = (signatureChain || []).filter(s => s.status !== "na");
  if (chain.length === 0) return <span className="text-[10px]" style={{color:B.t3}}>—</span>;

  return <div className="flex items-center flex-wrap gap-0">
    {chain.map((sig, idx) => {
      const isSigned = sig.status === "signed";
      const isPending = sig.status === "pending";
      const color = isSigned ? B.green : isPending ? B.yellow : B.t3;
      const bg = isSigned ? B.greenL : isPending ? B.yellowL : "#F1F5F9";

      return <div key={idx} className="flex items-center">
        <div className={`flex items-center gap-1 ${compact?"px-1.5 py-0.5":"px-2 py-1"} rounded-full`} style={{background:bg}}>
          {isSigned && <CheckCircle size={compact?9:10} style={{color}}/>}
          {isPending && <Clock size={compact?9:10} style={{color}}/>}
          <span className={`${compact?"text-[9px]":"text-[10px]"} font-semibold whitespace-nowrap`} style={{color}}>
            {sig.label}{isPending?" ⏳":""}
          </span>
        </div>
        {idx < chain.length - 1 && <div className={compact?"w-2 h-px":"w-3 h-px"} style={{background: B.border}}/>}
      </div>;
    })}
  </div>;
}

// Reusable: single document row (used in all tabs)
// ─── DOCUMENTS UX REDESIGN ───
// Upgraded signature chain — timeline-like visualization
function SignatureChainVisual({signatureChain}) {
  const chain = (signatureChain || []).filter(s => s.status !== "na");
  if (chain.length === 0) return <span className="text-[10px]" style={{color:B.t3}}>—</span>;

  // Find next pending step for "waiting" label
  const pendingIdx = chain.findIndex(s => s.status === "pending");

  return <div className="flex items-stretch gap-0">
    {chain.map((sig, idx) => {
      const isSigned = sig.status === "signed";
      const isPending = sig.status === "pending";
      const isWaiting = idx === pendingIdx;
      const color = isSigned ? B.green : isWaiting ? B.yellow : isPending ? B.t3 : B.border;
      const bg = isSigned ? B.greenL : isWaiting ? B.yellowL : "#F8FAFC";
      const partyColor = getPartyColor(sig.party);

      // Days waiting calc
      const waitingDays = isWaiting && sig.status === "pending" ? getDocumentDaysOnStage({history: [{date: sig.signedAt || new Date("2026-03-26").toISOString().slice(0,10)}]}) : null;

      return <React.Fragment key={idx}>
        <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 relative"
            style={{background: bg, border: `2px solid ${color}`}}>
            {isSigned ? <Check size={14} style={{color}}/> : isWaiting ? <Clock size={12} style={{color}} className="animate-pulse"/> : <span className="w-2 h-2 rounded-full" style={{background: color}}/>}
          </div>
          <div className="text-[9px] font-bold text-center" style={{color: partyColor}}>
            {sig.label}
          </div>
          {isWaiting && <div className="text-[8px] font-semibold" style={{color: B.yellow}}>
            ждёт
          </div>}
          {isSigned && sig.signedAt && <div className="text-[8px]" style={{color: B.t3}}>
            {sig.signedAt.slice(5, 10)}
          </div>}
        </div>
        {idx < chain.length - 1 && <div className="flex items-center pt-4 shrink-0 mx-1">
          <div className="w-4 h-0.5" style={{background: isSigned ? B.green : B.border}}/>
        </div>}
      </React.Fragment>;
    })}
  </div>;
}

// Documents filters bar
function DocumentFiltersBar({
  phaseFilter, setPhaseFilter,
  docTypeFilter, setDocTypeFilter,
  clientFilter, setClientFilter,
  partyFilter, setPartyFilter,
  myActionOnly, setMyActionOnly,
  search, setSearch,
  clients,
  currentUser,
}) {
  const chips = [];
  if (phaseFilter !== "all") {
    const ph = DOC_PROCESS_PHASES.find(p => p.id === phaseFilter);
    chips.push({key:"phase", label:`${ph?.icon} ${ph?.label}`, onRemove:()=>setPhaseFilter("all"), color:B.accent});
  }
  if (docTypeFilter !== "all") chips.push({key:"type", label:DOC_TYPE_LABELS[docTypeFilter]||docTypeFilter, onRemove:()=>setDocTypeFilter("all"), color:B.purple});
  if (clientFilter !== "all") {
    const c = clients.find(cl => String(cl.id) === String(clientFilter));
    chips.push({key:"client", label:`Клиент: ${c?.name||clientFilter}`, onRemove:()=>setClientFilter("all"), color:"#0891B2"});
  }
  if (partyFilter !== "all") chips.push({key:"party", label: partyFilter==="bank"?"Ожидает банк":"Ожидает клиент", onRemove:()=>setPartyFilter("all"), color:"#EA580C"});
  if (myActionOnly) chips.push({key:"me", label:"👤 Требуют моего действия", onRemove:()=>setMyActionOnly(false), color:B.accent});
  if (search) chips.push({key:"search", label:`Поиск: «${search}»`, onRemove:()=>setSearch(""), color:B.t2});

  const resetAll = () => {
    setPhaseFilter("all"); setDocTypeFilter("all");
    setClientFilter("all"); setPartyFilter("all");
    setMyActionOnly(false); setSearch("");
  };

  return <div className="space-y-3 mb-4">
    {/* Search + main quick filters */}
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex-1 min-w-[240px]">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{color:B.t3}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Название, ID, клиент..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-xs"
            style={{borderColor: search ? B.accent : B.border, background:"white", color:B.t1}}/>
        </div>
      </div>

      {/* My action toggle */}
      {currentUser && (currentUser.role === "signer" || currentUser.role === "usko_prepare") && <button onClick={()=>setMyActionOnly(!myActionOnly)}
        className="text-[11px] px-3 py-2 rounded-lg font-semibold border flex items-center gap-1.5"
        style={myActionOnly
          ? {background: B.accent, color: "white", borderColor: B.accent}
          : {background: "white", color: B.t2, borderColor: B.border}}>
        <User size={12}/>
        Мои действия
      </button>}

      {/* Party filter */}
      <div className="flex items-center gap-1 px-2 py-1 rounded-lg border bg-white" style={{borderColor:B.border}}>
        <span className="text-[10px] font-semibold" style={{color:B.t3}}>Ожидает:</span>
        {[{id:"all",label:"Все"},{id:"bank",label:"Банк"},{id:"client",label:"Клиент"}].map(o =>
          <button key={o.id} onClick={()=>setPartyFilter(o.id)} className="px-2 py-0.5 rounded text-[10px] font-bold"
            style={partyFilter===o.id?{background:B.accent,color:"white"}:{color:B.t2}}>{o.label}</button>
        )}
      </div>
    </div>

    {/* Phase pill row */}
    <div className="flex items-center gap-1.5 flex-wrap">
      <button onClick={()=>setPhaseFilter("all")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
        style={phaseFilter==="all"?{background:B.accent,color:"white",borderColor:B.accent}:{background:"white",color:B.t2,borderColor:B.border}}>
        Все
      </button>
      {DOC_PROCESS_PHASES.map(ph => (
        <button key={ph.id} onClick={()=>setPhaseFilter(ph.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
          style={phaseFilter===ph.id
            ? {background:ph.colors.fg, color:"white", borderColor:ph.colors.fg}
            : {background:"white", color:ph.colors.fg, borderColor:B.border}}>
          <span>{ph.icon}</span>{ph.label}
        </button>
      ))}
    </div>

    {/* Second row: docType + client selects */}
    <div className="flex items-center gap-2 flex-wrap">
      <select value={docTypeFilter} onChange={e=>setDocTypeFilter(e.target.value)}
        className="px-3 py-1.5 rounded-lg border text-xs bg-white" style={{borderColor:B.border, color:B.t1}}>
        <option value="all">Все типы документов</option>
        {Object.entries(DOC_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={clientFilter} onChange={e=>setClientFilter(e.target.value)}
        className="px-3 py-1.5 rounded-lg border text-xs bg-white" style={{borderColor:B.border, color:B.t1}}>
        <option value="all">Все клиенты</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>

    {/* Active filter chips */}
    {chips.length > 0 && <Card className="p-2" style={{background: B.accentL+"20", borderColor: B.accent+"40"}}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{color:B.t3}}>
          Фильтры:
        </span>
        {chips.map(chip => (
          <button key={chip.key} onClick={chip.onRemove}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold hover:opacity-80"
            style={{background: chip.color+"15", color: chip.color, border:`1px solid ${chip.color}40`}}>
            {chip.label}<X size={10}/>
          </button>
        ))}
        <button onClick={resetAll} className="ml-auto text-[10px] font-semibold hover:underline" style={{color:B.t2}}>
          Сбросить все
        </button>
      </div>
    </Card>}
  </div>;
}

// Documents table view — with sorting, CSV export, batch selection
function DocumentTable({items, onSelect, setToast, batchMode, selectedIds, toggleSelect, onBatchAction}) {
  const [sortBy, setSortBy] = usePersistedState("table-sort-assignment", {col: "created", dir: "desc"});

  const sorted = [...items].sort((a, b) => {
    const dir = sortBy.dir === "asc" ? 1 : -1;
    switch(sortBy.col) {
      case "id": return a.id.localeCompare(b.id) * dir;
      case "type": return (DOC_TYPE_LABELS[a.docType]||a.docType).localeCompare(DOC_TYPE_LABELS[b.docType]||b.docType) * dir;
      case "title": return (a.title||"").localeCompare(b.title||"") * dir;
      case "client": return (a.relatedTo?.company||"").localeCompare(b.relatedTo?.company||"") * dir;
      case "phase": {
        const pa = DOC_PROCESS_PHASES.findIndex(p => p.id === getDocPhase(a));
        const pb = DOC_PROCESS_PHASES.findIndex(p => p.id === getDocPhase(b));
        return (pa - pb) * dir;
      }
      case "created": return (new Date(a.createdAt||0) - new Date(b.createdAt||0)) * dir;
      case "expiry": return ((a.validity?.daysRemaining ?? 9999) - (b.validity?.daysRemaining ?? 9999)) * dir;
      default: return 0;
    }
  });

  const toggleSort = (col) => setSortBy(prev => ({col, dir: prev.col === col && prev.dir === "desc" ? "asc" : "desc"}));
  const SortableHeader = ({col, children, align="left"}) => (
    <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none"
      style={{color: B.t3, textAlign: align}} onClick={()=>toggleSort(col)}>
      <div className="inline-flex items-center gap-1">
        {children}
        {sortBy.col === col && <span className="text-[10px]">{sortBy.dir==="desc"?"▼":"▲"}</span>}
      </div>
    </th>
  );

  const exportCsv = () => {
    const rows = [
      ["ID", "Тип", "Название", "Клиент", "Статус", "Фаза", "Создан", "Истекает"],
      ...sorted.map(d => {
        const phase = DOC_PROCESS_PHASES.find(p => p.id === getDocPhase(d))?.label || "";
        return [d.id, DOC_TYPE_LABELS[d.docType]||d.docType, d.title, d.relatedTo?.company||"",
          DOC_STATUS_LABELS[d.status]||d.status, phase, d.createdAt||"",
          d.validity?.expiresAt || "—"];
      })
    ];
    const csv = rows.map(r => r.map(v => `"${v ?? ""}"`).join(";")).join("\n");
    try {
      const blob = new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `documents-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setToast && setToast({msg: "CSV экспортирован", type: "success"});
    } catch(e) { setToast && setToast({msg: "Ошибка экспорта", type: "error"}); }
  };

  return <Card className="overflow-hidden">
    <div className="flex items-center justify-between p-3 border-b" style={{borderColor: B.border}}>
      <div className="text-xs" style={{color: B.t2}}>
        Показано: <strong style={{color: B.t1}}>{sorted.length}</strong> документов
        {batchMode && selectedIds.length > 0 && <span> · выбрано <strong style={{color: B.accent}}>{selectedIds.length}</strong></span>}
      </div>
      <div className="flex items-center gap-2">
        {batchMode && selectedIds.length > 0 && onBatchAction && <Btn size="sm" icon={Pen} onClick={onBatchAction}>
          Подписать выбранные ({selectedIds.length})
        </Btn>}
        <Btn size="sm" variant="ghost" icon={Download} onClick={exportCsv}>CSV</Btn>
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            {batchMode && <th className="w-8 px-2 py-2"></th>}
            <SortableHeader col="id">ID</SortableHeader>
            <SortableHeader col="type">Тип</SortableHeader>
            <SortableHeader col="title">Название</SortableHeader>
            <SortableHeader col="client">Клиент</SortableHeader>
            <SortableHeader col="phase">Фаза</SortableHeader>
            <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{color:B.t3}}>Подписи</th>
            <SortableHeader col="created">Создан</SortableHeader>
            <SortableHeader col="expiry">Истекает</SortableHeader>
            <th className="w-20 px-2 py-2 text-[10px] font-bold uppercase tracking-wider" style={{color:B.t3}}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(d => {
            const phase = DOC_PROCESS_PHASES.find(p => p.id === getDocPhase(d));
            const isChecked = selectedIds?.includes(d.id);
            const isExpiring = d.validity?.daysRemaining != null && d.validity.daysRemaining >= 0 && d.validity.daysRemaining <= 7;
            const isExpired = d.validity?.daysRemaining != null && d.validity.daysRemaining < 0;

            return <tr key={d.id}
              onClick={()=>batchMode ? toggleSelect(d.id) : onSelect(d)}
              className="border-t hover:bg-blue-50 cursor-pointer transition-colors"
              style={{
                borderColor: B.border,
                background: isExpired ? "#FEF2F2" : isChecked ? B.accentL+"30" : "white"
              }}>
              {batchMode && <td className="px-2 py-2 text-center">
                <input type="checkbox" checked={isChecked || false} onChange={()=>toggleSelect(d.id)} onClick={e=>e.stopPropagation()} className="cursor-pointer"/>
              </td>}
              <td className="px-3 py-2 mono font-semibold" style={{color: B.accent}}>{d.id}</td>
              <td className="px-3 py-2">
                <span className="text-[10px]" style={{color: B.t2}}>{DOC_TYPE_LABELS[d.docType]||d.docType}</span>
              </td>
              <td className="px-3 py-2 truncate max-w-[200px]" style={{color: B.t1}}>{d.title}</td>
              <td className="px-3 py-2 truncate max-w-[160px]" style={{color: B.t2}}>{d.relatedTo?.company || "—"}</td>
              <td className="px-3 py-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1"
                  style={{background: phase?.colors.bg, color: phase?.colors.fg}}>
                  <span>{phase?.icon}</span>
                  {phase?.label}
                </span>
              </td>
              <td className="px-3 py-2">
                {d.signatureChain ? <SignatureChain signatureChain={d.signatureChain} compact/> : <span className="text-[10px]" style={{color:B.t3}}>—</span>}
              </td>
              <td className="px-3 py-2 text-[10px]" style={{color: B.t3}}>{d.createdAt?.slice(0,10) || "—"}</td>
              <td className="px-3 py-2">
                {d.validity?.daysRemaining == null ? <span className="text-[10px]" style={{color:B.t3}}>бессрочно</span>
                  : isExpired ? <span className="text-[10px] font-bold" style={{color:B.red}}>⚠ истёк</span>
                  : isExpiring ? <span className="text-[10px] font-bold" style={{color:B.orange}}>⚠ {d.validity.daysRemaining}д</span>
                  : <span className="text-[10px]" style={{color:B.t2}}>{d.validity.daysRemaining}д</span>}
              </td>
              <td className="px-3 py-2 text-right">
                <ChevronRight size={14} style={{color: B.t3}}/>
              </td>
            </tr>;
          })}
          {sorted.length === 0 && <tr>
            <td colSpan={batchMode?10:9} className="p-10 text-center text-sm" style={{color: B.t3}}>
              Документы не найдены
            </td>
          </tr>}
        </tbody>
      </table>
    </div>
  </Card>;
}

// Document types glossary modal
// ─── Document templates ───
const DOC_TEMPLATES = [
  {id:"tpl-gen", docType:"generalContract", label:"Генеральный договор факторинга", icon:"📜", description:"Основной договор с клиентом-поставщиком"},
  {id:"tpl-ds", docType:"supplementaryAgreement", label:"Допсоглашение (ДС)", icon:"📄", description:"К конкретной уступке с определённой суммой"},
  {id:"tpl-notify", docType:"notification", label:"Уведомление об уступке", icon:"✉️", description:"Должнику о переходе прав требования"},
  {id:"tpl-act", docType:"actReconciliation", label:"Акт сверки", icon:"📊", description:"Для подтверждения задолженности"},
  {id:"tpl-consent-bki", docType:"consentBki", label:"Согласие на проверку БКИ", icon:"✅", description:"Типовая форма, подписывается клиентом"},
];

function TemplatePicker({open, onClose, onGenerate}) {
  const [search, setSearch] = useState("");
  const filtered = DOC_TEMPLATES.filter(t =>
    !search || t.label.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase())
  );
  return <Modal open={open} onClose={onClose} title="Выбрать шаблон документа" wide>
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{color:B.t3}}/>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Поиск шаблона..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border text-xs"
          style={{borderColor: B.border, background:"white", color:B.t1}}/>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {filtered.map(tpl => <button key={tpl.id} onClick={()=>onGenerate(tpl)}
          className="text-left p-3 rounded-xl border hover:shadow-md hover:border-blue-300 transition-all"
          style={{borderColor: B.border, background: "white"}}>
          <div className="flex items-start gap-2">
            <div className="text-xl shrink-0">{tpl.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold" style={{color: B.t1}}>{tpl.label}</div>
              <div className="text-[10px] mt-1" style={{color: B.t3}}>{tpl.description}</div>
            </div>
          </div>
        </button>)}
      </div>
      {filtered.length === 0 && <div className="text-center py-8 text-xs" style={{color: B.t3}}>Шаблоны не найдены</div>}
    </div>
  </Modal>;
}

// Batch generate documents for selected assignments
function BatchGenerateModal({open, onClose, onGenerate, assignments}) {
  const [selectedAsgIds, setSelectedAsgIds] = useState([]);
  const [docType, setDocType] = useState("notification");
  const eligible = assignments.filter(a => a.stage === "docs_received" || a.stage === "debtor_notified" || a.stage === "debtor_confirming");

  const toggleAsg = (id) => setSelectedAsgIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  const selectAll = () => setSelectedAsgIds(eligible.map(a => a.id));
  const deselectAll = () => setSelectedAsgIds([]);

  const handleGenerate = () => {
    onGenerate(selectedAsgIds, docType);
    setSelectedAsgIds([]);
    onClose();
  };

  return <Modal open={open} onClose={onClose} title="Пачечная генерация документов" wide>
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Тип документа</label>
        <select value={docType} onChange={e=>setDocType(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-xs bg-white" style={{borderColor:B.border,color:B.t1}}>
          <option value="notification">Уведомление об уступке</option>
          <option value="supplementaryAgreement">Допсоглашение (ДС)</option>
          <option value="actReconciliation">Акт сверки</option>
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium" style={{color:B.t2}}>Уступки для генерации ({eligible.length} подходящих)</label>
          <div className="flex items-center gap-1">
            <button onClick={selectAll} className="text-[10px] px-2 py-0.5 rounded hover:bg-slate-100" style={{color: B.accent}}>Все</button>
            <button onClick={deselectAll} className="text-[10px] px-2 py-0.5 rounded hover:bg-slate-100" style={{color: B.t3}}>Снять</button>
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto space-y-1 p-2 rounded-lg" style={{background: "#F8FAFC"}}>
          {eligible.map(a => {
            const creditor = COMPANIES.find(c => c.id === a.creditorId);
            const debtor = COMPANIES.find(c => c.id === a.debtorId);
            const isSelected = selectedAsgIds.includes(a.id);
            return <label key={a.id} className="flex items-center gap-2 p-2 rounded hover:bg-white cursor-pointer">
              <input type="checkbox" checked={isSelected} onChange={()=>toggleAsg(a.id)}/>
              <span className="mono text-[11px] font-bold" style={{color: B.accent}}>{a.id}</span>
              <span className="text-[11px] truncate" style={{color: B.t1}}>{creditor?.name} → {debtor?.name}</span>
              <span className="ml-auto text-[10px] mono" style={{color: B.t3}}>{fmtByn(a.amount)}</span>
            </label>;
          })}
          {eligible.length === 0 && <div className="text-center py-4 text-xs" style={{color:B.t3}}>Нет подходящих уступок</div>}
        </div>
      </div>

      <div className="flex gap-2">
        <Btn variant="ghost" onClick={onClose} className="flex-1">Отмена</Btn>
        <Btn onClick={handleGenerate} icon={Check} className="flex-1" disabled={selectedAsgIds.length === 0}>
          Сгенерировать {selectedAsgIds.length || ""}
        </Btn>
      </div>
    </div>
  </Modal>;
}

function DocumentTypeHelp() {
  const [open, setOpen] = useState(false);
  const grouped = {
    contracts: {label:"Договоры", types:["generalContract","supplementaryAgreement","decision"]},
    operational: {label:"Операционные", types:["dkp","ttn","actReconciliation","notification","esfchf"]},
    consents: {label:"Согласия и анкеты", types:["consentBki","consent_oeb","consent_pd","anketa"]},
    reports: {label:"Справки и отчёты", types:["balanceOpu","legat","bki","report"]},
  };

  return <>
    <button onClick={()=>setOpen(true)}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-slate-100"
      style={{color: B.t3}}>
      <Info size={12}/>
      Типы документов
    </button>
    <Modal open={open} onClose={()=>setOpen(false)} title="Глоссарий типов документов" wide>
      <div className="space-y-4 text-xs">
        {Object.entries(grouped).map(([key, g]) => (
          <div key={key}>
            <div className="font-bold mb-2 text-[10px] uppercase tracking-wider" style={{color:B.t3}}>{g.label}</div>
            <div className="grid grid-cols-2 gap-2">
              {g.types.map(t => (
                <div key={t} className="p-2 rounded-lg bg-slate-50">
                  <div className="font-bold" style={{color:B.t1}}>{DOC_TYPE_LABELS[t] || t}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  </>;
}

function DocumentRow({doc, showContext}) {
  const expired = doc.validity?.daysRemaining != null && doc.validity.daysRemaining < 0;
  const expiring = doc.validity?.daysRemaining != null && doc.validity.daysRemaining >= 0 && doc.validity.daysRemaining <= 7;
  const pendingBank = doc.signatureChain?.some(s => s.party === "bank" && s.status === "pending");

  const rightSide = expired
    ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{background:B.redL, color:B.red}}>ИСТЁК</span>
    : expiring
    ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{background:B.yellowL, color:B.yellow}}>
        {doc.validity.daysRemaining===0?"истекает сегодня":`истекает через ${doc.validity.daysRemaining}д`}
      </span>
    : pendingBank
    ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{background:B.yellowL, color:B.yellow}}>Ожидает подписи</span>
    : doc.status === "signed_all"
    ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{background:B.greenL, color:B.green}}>✓ Подписан</span>
    : <span className="text-[10px] whitespace-nowrap" style={{color:B.t3}}>{DOC_STATUS_LABELS[doc.status]||doc.status}</span>;

  const handleClick = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("oborotka:open-doc", {detail:{docId: doc.id}}));
    }
  };

  return <button onClick={handleClick}
    className="w-full flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 hover:bg-blue-50 transition-colors text-left group">
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <FileText size={14} style={{color:B.accent}} className="shrink-0"/>
      <div className="min-w-0">
        <div className="text-xs font-semibold truncate group-hover:underline" style={{color:B.accent}}>{doc.title}</div>
        {showContext && <div className="text-[10px] truncate" style={{color:B.t3}}>
          {doc.relatedTo?.reqId || doc.relatedTo?.assignmentId} · {doc.relatedTo?.company}
        </div>}
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {rightSide}
      <ChevronRight size={12} style={{color:B.t3}} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
    </div>
  </button>;
}

// ─── Tab 1: Картотека клиентов ───
function CardfileTab({setToast}) {
  const [search, setSearch] = useState("");
  const [contractTypeFilter, setContractTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const clientsWithDocs = useMemo(() => {
    const map = {};
    DOCUMENTS_REGISTRY.filter(d => d.category === "client").forEach(doc => {
      const cid = doc.relatedTo?.clientId;
      if (!cid) return;
      if (!map[cid]) map[cid] = [];
      map[cid].push(doc);
    });
    return Object.entries(map).map(([clientId, docs]) => {
      const client = COMPANIES.find(c => c.id === Number(clientId));
      const activeDeal = PIPELINE.find(p => (p.creditorId === Number(clientId)) && p.stage === "active");
      return {client, docs, activeDeal};
    }).filter(x => x.client);
  }, []);

  const filtered = clientsWithDocs.filter(({client, activeDeal, docs}) => {
    if (search) {
      const q = search.toLowerCase();
      if (!client.name.toLowerCase().includes(q) && !(client.unp||"").includes(q)) return false;
    }
    if (contractTypeFilter === "with_contract" && !activeDeal) return false;
    if (contractTypeFilter === "closed" && activeDeal) return false;
    if (statusFilter === "expiring") {
      const hasExpiring = docs.some(d => d.validity?.daysRemaining != null && d.validity.daysRemaining >= 0 && d.validity.daysRemaining <= 7);
      if (!hasExpiring) return false;
    }
    return true;
  });

  const expiringDocs = getExpiringDocuments(7);

  return <div>
    {/* Filters */}
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <div className="flex-1 min-w-[240px]">
        <SearchBar value={search} onChange={setSearch} placeholder="Клиент или УНП..."/>
      </div>
      <select value={contractTypeFilter} onChange={e=>setContractTypeFilter(e.target.value)}
        className="px-3 py-2 rounded-lg border text-xs bg-white" style={{borderColor:B.border, color:B.t1}}>
        <option value="all">Все клиенты</option>
        <option value="with_contract">С активным ген.договором</option>
        <option value="closed">Без активного договора</option>
      </select>
      <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
        className="px-3 py-2 rounded-lg border text-xs bg-white" style={{borderColor:B.border, color:B.t1}}>
        <option value="all">Все</option>
        <option value="expiring">Истекают ≤7 дней</option>
      </select>
    </div>

    {/* Alert for expiring */}
    {expiringDocs.length > 0 && statusFilter !== "expiring" && <Card className="p-3 mb-4" style={{background:B.yellowL, borderColor:B.yellow+"40"}}>
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} style={{color:B.yellow}}/>
        <span className="text-xs font-semibold flex-1" style={{color:B.yellow}}>
          {expiringDocs.length} {expiringDocs.length===1?"документ истекает":"документов истекают"} в ближайшие 7 дней
        </span>
        <button className="text-xs underline" style={{color:B.yellow}} onClick={()=>setStatusFilter("expiring")}>
          Показать
        </button>
      </div>
    </Card>}

    {/* Client cards */}
    <div className="space-y-3">
      {filtered.map(({client, docs, activeDeal}) => (
        <ClientDocumentCard key={client.id} client={client} docs={docs} deal={activeDeal} setToast={setToast}/>
      ))}
      {filtered.length === 0 && <Card className="p-10 text-center">
        <div className="text-sm" style={{color:B.t3}}>Нет клиентов по выбранным фильтрам</div>
      </Card>}
    </div>
  </div>;
}

function ClientDocumentCard({client, docs, deal, setToast}) {
  const [expanded, setExpanded] = useState(false);
  const hasExpiring = docs.some(d => d.validity?.daysRemaining != null && d.validity.daysRemaining >= 0 && d.validity.daysRemaining <= 7);

  return <Card className="overflow-hidden">
    <button onClick={()=>setExpanded(!expanded)}
      className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-50 text-left transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {expanded ? <ChevronDown size={16} style={{color:B.t3}}/> : <ChevronRight size={16} style={{color:B.t3}}/>}
        <div className="min-w-0">
          <div className="text-sm font-bold flex items-center gap-2" style={{color:B.t1}}>
            {client.name}
            {hasExpiring && <AlertTriangle size={12} style={{color:B.yellow}}/>}
          </div>
          <div className="text-[10px] mono" style={{color:B.t3}}>УНП {client.unp}</div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[10px]" style={{color:B.t3}}>{docs.length} документов</div>
        {deal && <div className="text-[10px]" style={{color:B.accent}}>
          Генеральный · {fmtByn(deal.approvedLimit)}
        </div>}
      </div>
    </button>

    {expanded && <div className="border-t px-4 py-3" style={{borderColor:B.border, background:"#FAFAFA"}}>
      {deal && <div className="text-[11px] mb-3 p-2 rounded-lg" style={{background:B.accentL+"30"}}>
        <strong style={{color:B.accent}}>
          Ген.договор — активен с {deal.stageStartDate}
        </strong>
        <span style={{color:B.t2}}> · Лимит {fmtByn(deal.approvedLimit)}</span>
      </div>}

      <div className="space-y-1.5">
        {docs.map(doc => <DocumentRow key={doc.id} doc={doc}/>)}
      </div>

      <div className="flex gap-2 mt-4">
        <Btn size="sm" variant="secondary" icon={Users} onClick={()=>setToast({msg:`Переход к ${client.name}`,type:"info"})}>
          Открыть клиента
        </Btn>
        <Btn size="sm" variant="ghost" icon={Download} onClick={()=>setToast({msg:`Пакет документов ${client.name} скачан ZIP`,type:"success"})}>
          Скачать пакет ZIP
        </Btn>
      </div>
    </div>}
  </Card>;
}

// ─── Tab 2: На подпись ───
function PendingSignTab({currentUser, setToast}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [signModal, setSignModal] = useState(false);
  const [signing, setSigning] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [progress, setProgress] = useState(null);

  const pendingDocs = useMemo(() => getPendingSignDocuments(currentUser.role), [currentUser.role]);

  const urgent = pendingDocs.filter(d => getDocumentDaysOnStage(d) >= 2);
  const inWork = pendingDocs.filter(d => getDocumentDaysOnStage(d) < 2);

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  };
  const selectAll = () => setSelectedIds(pendingDocs.map(d => d.id));
  const deselectAll = () => setSelectedIds([]);

  const runBatchSign = () => {
    setSigning(true);
    setProgress({total: selectedIds.length, done: 0});
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setProgress({total: selectedIds.length, done: i});
      if (i >= selectedIds.length) {
        clearInterval(timer);
        setTimeout(() => {
          setSigning(false);
          setProgress(null);
          setSignModal(false);
          setToast({msg: `${selectedIds.length} ${selectedIds.length===1?"документ подписан":"документов подписаны"}`, type:"success"});
          setSelectedIds([]);
          setPinInput("");
        }, 400);
      }
    }, 350);
  };

  if (currentUser.role !== "signer" && currentUser.role !== "admin") {
    return <Card className="p-12 text-center">
      <div className="text-5xl mb-3">🔒</div>
      <div className="text-lg font-bold mb-2" style={{color:B.t1}}>Только для подписанта</div>
      <div className="text-sm" style={{color:B.t3}}>Эта вкладка доступна роли «Подписант договоров»</div>
    </Card>;
  }

  if (pendingDocs.length === 0) {
    return <Card className="p-12 text-center">
      <div className="text-5xl mb-3">🎉</div>
      <div className="text-lg font-bold mb-2" style={{color:B.t1}}>Inbox пуст!</div>
      <div className="text-sm" style={{color:B.t3}}>Документов на вашу подпись сейчас нет.</div>
    </Card>;
  }

  return <div>
    {/* Header with batch actions */}
    <Card className="p-4 mb-4" style={{background:B.accentL+"20", borderColor:B.accent+"40"}}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-bold" style={{color:B.accent}}>
            ✍️ На подпись: {pendingDocs.length} {pendingDocs.length===1?"документ":"документов"}
          </div>
          <div className="text-[11px]" style={{color:B.t2}}>
            Выбрано: <strong>{selectedIds.length}</strong>
            {selectedIds.length > 0 && <span style={{color:B.t3}}> — введите PIN один раз для подписания всех</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length < pendingDocs.length
            ? <Btn size="sm" variant="ghost" onClick={selectAll}>☑ Выбрать всё</Btn>
            : <Btn size="sm" variant="ghost" onClick={deselectAll}>Снять выбор</Btn>
          }
          <Btn size="sm" icon={Pen} disabled={selectedIds.length===0} onClick={()=>setSignModal(true)}>
            🔏 Подписать выбранные ({selectedIds.length})
          </Btn>
        </div>
      </div>
    </Card>

    {/* Urgent */}
    {urgent.length > 0 && <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold uppercase tracking-wider" style={{color:B.red}}>🔥 Срочно (старше 2 дней)</span>
        <div className="flex-1 h-px" style={{background:B.red+"30"}}/>
      </div>
      <div className="space-y-1.5">
        {urgent.map(doc => <PendingDocRow key={doc.id} doc={doc}
          selected={selectedIds.includes(doc.id)} onToggle={()=>toggleSelect(doc.id)}/>
        )}
      </div>
    </div>}

    {/* In work */}
    {inWork.length > 0 && <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold uppercase tracking-wider" style={{color:B.t3}}>В работе</span>
        <div className="flex-1 h-px" style={{background:B.border}}/>
      </div>
      <div className="space-y-1.5">
        {inWork.map(doc => <PendingDocRow key={doc.id} doc={doc}
          selected={selectedIds.includes(doc.id)} onToggle={()=>toggleSelect(doc.id)}/>
        )}
      </div>
    </div>}

    {/* Sign modal */}
    <Modal open={signModal} onClose={()=>!signing&&setSignModal(false)} title="Подписание пачкой">
      <div className="space-y-4">
        <div className="text-xs" style={{color:B.t2}}>
          Вы подписываете <strong style={{color:B.t1}}>{selectedIds.length}</strong> {selectedIds.length===1?"документ":"документов"} ЭЦП банка:
        </div>
        <div className="max-h-40 overflow-y-auto space-y-1 p-2 rounded-lg bg-slate-50">
          {selectedIds.map(id => {
            const doc = DOCUMENTS_REGISTRY.find(d => d.id === id);
            return <div key={id} className="text-[11px]" style={{color:B.t1}}>• {doc?.title}</div>;
          })}
        </div>

        {progress ? <div>
          <div className="flex items-center gap-2 mb-2">
            <Loader2 size={14} className="animate-spin" style={{color:B.green}}/>
            <span className="text-xs font-bold" style={{color:B.green}}>
              Подписано {progress.done} из {progress.total}
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{background:B.border}}>
            <div className="h-full transition-all" style={{width:`${progress.done/progress.total*100}%`, background:B.green}}/>
          </div>
        </div> : <>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>PIN ЭЦП</label>
            <input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono"/>
            <div className="text-[10px] mt-1" style={{color:B.t3}}>PIN вводится один раз — подпись применяется ко всем выбранным документам</div>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={()=>setSignModal(false)} className="flex-1">Отмена</Btn>
            <Btn icon={Pen} onClick={runBatchSign} disabled={!pinInput || signing} className="flex-1">
              🔏 Подписать все
            </Btn>
          </div>
        </>}
      </div>
    </Modal>
  </div>;
}

function PendingDocRow({doc, selected, onToggle}) {
  const days = getDocumentDaysOnStage(doc);
  const urgent = days >= 2;

  const handleOpenDoc = (e) => {
    e.stopPropagation();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("oborotka:open-doc", {detail:{docId: doc.id}}));
    }
  };

  return <div className="flex items-center gap-3 p-2.5 rounded-lg border transition-all hover:shadow-sm"
    style={{borderColor: selected ? B.accent : B.border, background: selected ? B.accentL+"20" : "white"}}>
    <input type="checkbox" checked={selected} onChange={onToggle}
      className="w-4 h-4 shrink-0 cursor-pointer"/>
    <FileText size={14} style={{color:B.accent}} className="shrink-0"/>
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold truncate" style={{color:B.t1}}>{doc.title}</div>
      <div className="text-[10px] truncate" style={{color:B.t3}}>
        <span className="mono font-semibold" style={{color:B.accent}}>
          {doc.relatedTo?.reqId || doc.relatedTo?.assignmentId}
        </span>
        {" · "}создан {doc.createdAt?.slice(0,10)}
        {" · "}<strong style={{color: urgent ? B.red : B.t2}}>{days}д ожидает</strong>
      </div>
    </div>
    <button onClick={handleOpenDoc}
      className="text-[10px] font-semibold hover:underline shrink-0" style={{color:B.accent}}>
      Открыть →
    </button>
  </div>;
}

// ─── Tab 3: Активные процессы ───
function ActiveProcessTab({currentUser, setToast}) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [partyFilter, setPartyFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("fresh");
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadAsgId, setUploadAsgId] = useState("");
  const [uploadFiles, setUploadFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []).map(f => ({name: f.name, size: f.size}));
    setUploadFiles(prev => [...prev, ...files]);
  };

  const submitUpload = () => {
    setToast({msg:`${uploadFiles.length} ${uploadFiles.length===1?"документ":"документов"} загружено к ${uploadAsgId}`, type:"success"});
    setUploadModal(false);
    setUploadFiles([]);
    setUploadAsgId("");
  };

  const canUpload = currentUser?.role === "usko_prepare" || currentUser?.role === "admin";

  const activeDocs = useMemo(() => getActiveProcessDocuments(), []);

  const filtered = activeDocs.filter(doc => {
    if (typeFilter !== "all" && doc.docType !== typeFilter) return false;
    if (clientFilter !== "all" && String(doc.relatedTo?.clientId) !== clientFilter) return false;
    if (partyFilter === "bank") {
      if (!doc.signatureChain?.some(s => s.party === "bank" && s.status === "pending")) return false;
    } else if (partyFilter === "client") {
      if (!doc.signatureChain?.some(s => (s.party === "creditor" || s.party === "debtor") && s.status === "pending")) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!doc.title.toLowerCase().includes(q) && !(doc.relatedTo?.company||"").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "fresh") return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortBy === "old") return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortBy === "stuck") return getDocumentDaysOnStage(b) - getDocumentDaysOnStage(a);
    return 0;
  });

  const uniqueTypes = [...new Set(activeDocs.map(d => d.docType))];
  const uniqueClients = [...new Set(activeDocs.map(d => d.relatedTo?.clientId).filter(Boolean))];

  return <div>
    {/* Filters */}
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
        className="px-3 py-2 rounded-lg border text-xs bg-white" style={{borderColor:B.border, color:B.t1}}>
        <option value="all">Все типы</option>
        {uniqueTypes.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[t]||t}</option>)}
      </select>

      <select value={clientFilter} onChange={e=>setClientFilter(e.target.value)}
        className="px-3 py-2 rounded-lg border text-xs bg-white" style={{borderColor:B.border, color:B.t1}}>
        <option value="all">Все клиенты</option>
        {uniqueClients.map(cid => {
          const client = COMPANIES.find(c => c.id === cid);
          return client ? <option key={cid} value={String(cid)}>{client.name}</option> : null;
        })}
      </select>

      <select value={partyFilter} onChange={e=>setPartyFilter(e.target.value)}
        className="px-3 py-2 rounded-lg border text-xs bg-white" style={{borderColor:B.border, color:B.t1}}>
        <option value="all">Все стороны</option>
        <option value="bank">Ждут банк</option>
        <option value="client">Ждут клиента</option>
      </select>

      <div className="flex-1 min-w-[200px]">
        <SearchBar value={search} onChange={setSearch} placeholder="Документ или клиент..."/>
      </div>

      <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
        className="px-3 py-2 rounded-lg border text-xs bg-white" style={{borderColor:B.border, color:B.t1}}>
        <option value="fresh">Свежие сверху</option>
        <option value="old">Старые сверху</option>
        <option value="stuck">Зависшие</option>
      </select>
    </div>

    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <div className="text-xs" style={{color:B.t2}}>
        Активных документов: <strong style={{color:B.t1}}>{sorted.length}</strong>
      </div>
      {canUpload && <Btn size="sm" icon={Plus} onClick={()=>setUploadModal(true)}>
        Загрузить документы
      </Btn>}
    </div>

    {/* Cards */}
    <div className="space-y-3">
      {sorted.map(doc => <ActiveProcessCard key={doc.id} doc={doc}/>)}
      {sorted.length === 0 && <Card className="p-10 text-center">
        <div className="text-sm" style={{color:B.t3}}>Нет документов по выбранным фильтрам</div>
      </Card>}
    </div>

    {/* Upload modal */}
    <Modal open={uploadModal} onClose={()=>setUploadModal(false)} title="Загрузка документов" wide>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Привязка к уступке (обязательно)</label>
          <select value={uploadAsgId} onChange={e=>setUploadAsgId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border text-xs bg-white" style={{borderColor:B.border, color:B.t1}}>
            <option value="">Выберите уступку...</option>
            {ASSIGNMENTS.filter(a => a.stage !== "paid").map(a => {
              const cred = COMPANIES.find(c => c.id === a.creditorId);
              return <option key={a.id} value={a.id}>{a.id} · {cred?.name||""} · {fmtByn(a.amount)}</option>;
            })}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Файлы</label>
          <div onDragOver={e=>{e.preventDefault();setDragOver(true)}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles(e.dataTransfer.files)}}
            className="border-2 border-dashed rounded-xl p-8 text-center transition-colors"
            style={{borderColor:dragOver?B.accent:B.border, background:dragOver?B.accentL+"30":"transparent"}}>
            <FileText size={32} style={{color:B.t3}} className="mx-auto mb-2"/>
            <div className="text-xs mb-2" style={{color:B.t3}}>Перетащите файлы сюда или</div>
            <label className="inline-block">
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer" style={{background:B.accentL, color:B.accent}}>
                Выбрать файлы
              </span>
              <input type="file" multiple className="hidden" onChange={e=>handleFiles(e.target.files)}/>
            </label>
            <div className="text-[10px] mt-2" style={{color:B.t3}}>PDF, до 20 МБ каждый</div>
          </div>
        </div>

        {uploadFiles.length > 0 && <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{color:B.t3}}>
            Загружено: {uploadFiles.length} {uploadFiles.length===1?"файл":"файлов"}
          </div>
          {uploadFiles.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={12} style={{color:B.accent}}/>
                <span className="text-xs truncate" style={{color:B.t1}}>{f.name}</span>
              </div>
              <button onClick={()=>setUploadFiles(prev=>prev.filter((_,idx)=>idx!==i))}
                className="text-[10px]" style={{color:B.red}}>Удалить</button>
            </div>
          ))}
        </div>}

        <div className="flex gap-2">
          <Btn variant="ghost" onClick={()=>setUploadModal(false)} className="flex-1">Отмена</Btn>
          <Btn icon={Plus} onClick={submitUpload} disabled={!uploadAsgId || uploadFiles.length===0} className="flex-1">
            Загрузить ({uploadFiles.length})
          </Btn>
        </div>
      </div>
    </Modal>
  </div>;
}

function ActiveProcessCard({doc}) {
  const days = getDocumentDaysOnStage(doc);
  const pendingParty = doc.signatureChain?.find(s => s.status === "pending");
  const stuck = days >= 3;

  const handleClick = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("oborotka:open-doc", {detail:{docId: doc.id}}));
    }
  };

  return <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={handleClick}
    style={stuck?{borderLeft:`3px solid ${B.yellow}`}:{}}>
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <FileText size={16} style={{color:B.accent}} className="shrink-0"/>
        <div className="min-w-0">
          <div className="text-sm font-bold" style={{color:B.t1}}>{doc.title}</div>
          <div className="text-[10px] truncate" style={{color:B.t3}}>
            <span className="mono" style={{color:B.accent}}>{doc.relatedTo?.assignmentId || doc.relatedTo?.reqId}</span>
            {" · "}{doc.relatedTo?.company}
          </div>
        </div>
      </div>
      <ChevronRight size={16} style={{color:B.t3}} className="shrink-0"/>
    </div>

    {/* Signature chain */}
    <SignatureChain signatureChain={doc.signatureChain}/>

    <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t" style={{borderColor:B.border}}>
      <div className="text-[10px]" style={{color:B.t3}}>
        Создан: {doc.createdAt?.slice(0, 10)}
      </div>
      <div className="text-[10px] font-semibold" style={{color: days >= 3 ? B.red : days >= 2 ? B.yellow : B.t2}}>
        {days}д {pendingParty ? `ожидает: ${pendingParty.label}` : "в работе"}
      </div>
    </div>
  </Card>;
}

// ─── Main DocumentsPage ───
function DocumentsPage({currentUser, setToast}) {
  // Unified state (persistent)
  const [viewLayout, setViewLayout] = useState(() => {
    try { return sessionStorage.getItem("documents-view-layout") || "table"; }
    catch(e) { return "table"; }
  });
  const [phaseFilter, setPhaseFilter] = useState(() => {
    try { return sessionStorage.getItem("documents-phase") || "all"; }
    catch(e) { return "all"; }
  });
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [partyFilter, setPartyFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [myActionOnly, setMyActionOnly] = useState(() => {
    // Auto-enable "my actions" for signer and usko by default
    return currentUser?.role === "signer" || currentUser?.role === "usko_prepare";
  });

  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchSignModal, setBatchSignModal] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signProgress, setSignProgress] = useState(null);
  const [pinInput, setPinInput] = useState("");

  const [uploadModal, setUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadTarget, setUploadTarget] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [batchGenModal, setBatchGenModal] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem("documents-view-layout", viewLayout); } catch(e) {}
  }, [viewLayout]);
  useEffect(() => {
    try { sessionStorage.setItem("documents-phase", phaseFilter); } catch(e) {}
  }, [phaseFilter]);

  // Data
  const allDocs = DOCUMENTS_REGISTRY;
  const clients = [...new Set(allDocs.map(d => d.relatedTo?.clientId).filter(Boolean))]
    .map(id => COMPANIES.find(c => c.id === id)).filter(Boolean);

  const filters = {phase: phaseFilter, docType: docTypeFilter, clientId: clientFilter, party: partyFilter, search, myActionOnly};
  const filtered = filterDocuments(allDocs, filters, currentUser);

  // Counts
  const counts = countDocsByPhase(allDocs);
  const avgSign = getAvgSigningTime(allDocs);
  const myPendingCount = currentUser?.role === "signer"
    ? getPendingSignDocuments(currentUser.role).length
    : 0;

  // Batch
  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  const canBatchSign = currentUser?.role === "signer";

  const runBatchSign = () => {
    setSigning(true);
    setSignProgress({total: selectedIds.length, done: 0});
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setSignProgress({total: selectedIds.length, done: i});
      if (i >= selectedIds.length) {
        clearInterval(timer);
        setTimeout(() => {
          setSigning(false);
          setSignProgress(null);
          setBatchSignModal(false);
          setToast({msg: `${selectedIds.length} ${selectedIds.length===1?"документ подписан":"документов подписаны"}`, type:"success"});
          setSelectedIds([]);
          setBatchMode(false);
          setPinInput("");
        }, 400);
      }
    }, 350);
  };

  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []).map(f => ({name: f.name, size: f.size}));
    setUploadFiles(prev => [...prev, ...files]);
  };
  const submitUpload = () => {
    setToast({msg: `${uploadFiles.length} ${uploadFiles.length===1?"файл":"файлов"} загружено`, type:"success"});
    setUploadModal(false);
    setUploadFiles([]);
    setUploadTarget("");
  };

  // Request new document from client (for expiring)
  const requestNewDoc = (docId, clientName) => {
    setToast({msg: `Запрос отправлен клиенту ${clientName} по документу ${docId}`, type: "info"});
  };

  return <div>
    <PageHeader title="Документы" breadcrumbs={["Документы"]}
      actions={<div className="flex items-center gap-2">
        <DocumentTypeHelp/>
        {(currentUser?.role === "usko_prepare" || currentUser?.role === "admin") && <>
          <Btn size="sm" variant="ghost" icon={FileText} onClick={()=>setTemplateModal(true)}>
            По шаблону
          </Btn>
          <Btn size="sm" variant="ghost" icon={Check} onClick={()=>setBatchGenModal(true)}>
            Пачкой
          </Btn>
          <Btn size="sm" icon={Plus} onClick={()=>setUploadModal(true)}>
            Загрузить
          </Btn>
        </>}
      </div>}/>

    {/* KPI strip */}
    <div className="grid grid-cols-4 gap-3 mb-5">
      <Card className="p-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background: B.accentL}}>
            <Archive size={16} style={{color: B.accent}}/>
          </div>
          <div className="min-w-0">
            <div className="text-[10px]" style={{color: B.t3}}>Всего документов</div>
            <div className="text-lg font-black" style={{color: B.t1}}>{counts.total}</div>
          </div>
        </div>
      </Card>
      <button onClick={()=>{setMyActionOnly(true); setPhaseFilter("pending")}} className="text-left">
        <Card className="p-3 hover:shadow-md transition-all cursor-pointer"
          style={myActionOnly && phaseFilter === "pending" ? {borderColor: "#06B6D4", borderWidth: 2} : {}}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background: "#CFFAFE"}}>
              <Pen size={16} style={{color: "#06B6D4"}}/>
            </div>
            <div className="min-w-0">
              <div className="text-[10px]" style={{color: B.t3}}>{currentUser?.role === "signer" ? "На моей подписи" : "На подписи"}</div>
              <div className="text-lg font-black" style={{color: "#06B6D4"}}>{myPendingCount > 0 ? myPendingCount : counts.pending}</div>
            </div>
          </div>
        </Card>
      </button>
      <button onClick={()=>setPhaseFilter("expiring")} className="text-left">
        <Card className="p-3 hover:shadow-md transition-all cursor-pointer"
          style={phaseFilter === "expiring" ? {borderColor: B.orange, borderWidth: 2} : {}}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background: "#FFEDD5"}}>
              <AlertTriangle size={16} style={{color: B.orange}}/>
            </div>
            <div className="min-w-0">
              <div className="text-[10px]" style={{color: B.t3}}>Истекают ≤7д</div>
              <div className="text-lg font-black" style={{color: counts.expiring > 0 ? B.orange : B.t3}}>{counts.expiring}</div>
            </div>
          </div>
        </Card>
      </button>
      <Card className="p-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{background: "#EEF2FF"}}>
            <Clock size={16} style={{color: "#6366F1"}}/>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px]" style={{color: B.t3}}>Среднее время подписания</div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-lg font-black" style={{color: B.t1}}>{avgSign != null ? `${avgSign}д` : "—"}</div>
              {/* Mini sparkline: last 6 months */}
              <div className="w-16 h-6 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[
                    {m:"Окт", v:5.2}, {m:"Ноя", v:4.8}, {m:"Дек", v:4.5},
                    {m:"Янв", v:3.9}, {m:"Фев", v:3.5}, {m:"Мар", v:avgSign || 3.2},
                  ]} margin={{top:2,right:2,bottom:2,left:2}}>
                    <Line type="monotone" dataKey="v" stroke="#6366F1" strokeWidth={1.5} dot={false}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>

    {/* Filters */}
    <DocumentFiltersBar
      phaseFilter={phaseFilter} setPhaseFilter={setPhaseFilter}
      docTypeFilter={docTypeFilter} setDocTypeFilter={setDocTypeFilter}
      clientFilter={clientFilter} setClientFilter={setClientFilter}
      partyFilter={partyFilter} setPartyFilter={setPartyFilter}
      myActionOnly={myActionOnly} setMyActionOnly={setMyActionOnly}
      search={search} setSearch={setSearch}
      clients={clients}
      currentUser={currentUser}
    />

    {/* Layout switcher + batch controls */}
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <div className="text-xs" style={{color: B.t2}}>
        Найдено: <strong style={{color: B.t1}}>{filtered.length}</strong> из {allDocs.length}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {canBatchSign && !batchMode && <Btn size="sm" variant="secondary" icon={Pen} onClick={()=>setBatchMode(true)}>
          Подписать пачкой
        </Btn>}
        {batchMode && <>
          <Btn size="sm" variant="ghost" onClick={()=>{setBatchMode(false); setSelectedIds([])}}>Отмена</Btn>
          {selectedIds.length > 0 && <Btn size="sm" icon={Pen} onClick={()=>{setPinInput(""); setBatchSignModal(true)}}>
            Подписать {selectedIds.length}
          </Btn>}
        </>}
        <div className="flex items-center gap-1 p-1 rounded-lg border bg-white" style={{borderColor:B.border}}>
          {[
            {id:"table", icon:"📋", label:"Таблица"},
            {id:"cards", icon:"🧩", label:"Карточки"},
            {id:"grouped", icon:"📂", label:"По клиентам"},
          ].map(m => (
            <button key={m.id} onClick={()=>setViewLayout(m.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
              style={viewLayout===m.id?{background:B.accent,color:"white"}:{color:B.t2}}>
              <span>{m.icon}</span>{m.label}
            </button>
          ))}
        </div>
      </div>
    </div>

    {/* Expiring inline alert with actions */}
    {counts.expiring > 0 && phaseFilter !== "expiring" && <Card className="p-3 mb-4" style={{background: "#FFEDD5", borderColor: B.orange}}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} style={{color: B.orange}}/>
          <span className="text-xs font-bold" style={{color: B.orange}}>
            {counts.expiring} {counts.expiring === 1 ? "документ истекает" : "документов истекают"} в ближайшие 7 дней
          </span>
        </div>
        <Btn size="sm" variant="secondary" onClick={()=>setPhaseFilter("expiring")}>
          Показать
        </Btn>
      </div>
    </Card>}

    {/* Content */}
    {filtered.length === 0 && <Card className="p-12 text-center">
      <div className="text-5xl mb-3">🎉</div>
      <div className="text-lg font-bold mb-2" style={{color: B.t1}}>Документы не найдены</div>
      <div className="text-sm" style={{color: B.t3}}>Попробуйте сбросить фильтры</div>
    </Card>}

    {filtered.length > 0 && viewLayout === "table" && <DocumentTable
      items={filtered}
      onSelect={(d)=>{
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("oborotka:open-doc", {detail: {docId: d.id}}));
        }
      }}
      setToast={setToast}
      batchMode={batchMode}
      selectedIds={selectedIds}
      toggleSelect={toggleSelect}
      onBatchAction={canBatchSign ? () => {setPinInput(""); setBatchSignModal(true)} : null}
    />}

    {filtered.length > 0 && viewLayout === "cards" && <div className="space-y-1.5">
      {filtered.map(d => <DocumentCardItem key={d.id} doc={d}
        onClick={()=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("oborotka:open-doc",{detail:{docId:d.id}}))}}
        onRequestNew={requestNewDoc}/>)}
    </div>}

    {filtered.length > 0 && viewLayout === "grouped" && <DocumentsGroupedByClient docs={filtered} onRequestNew={requestNewDoc}/>}

    {/* Batch sign modal */}
    <Modal open={batchSignModal} onClose={()=>setBatchSignModal(false)} title="Пачечная подпись ЭЦП">
      <div className="space-y-4">
        <div className="p-3 rounded-xl" style={{background:"#F8FAFC"}}>
          <div className="text-xs font-bold mb-2" style={{color:B.t1}}>Подпишете {selectedIds.length} {selectedIds.length===1?"документ":"документов"}:</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {selectedIds.map(id => {
              const d = allDocs.find(doc => doc.id === id);
              return <div key={id} className="flex items-center gap-2 text-[11px]">
                <CheckCircle size={10} style={{color:B.green}}/>
                <span className="mono" style={{color:B.accent}}>{d?.id}</span>
                <span className="truncate" style={{color:B.t2}}>{d?.title}</span>
              </div>;
            })}
          </div>
        </div>
        {signProgress ? <div className="p-3 rounded-xl" style={{background: B.greenL}}>
          <div className="text-xs font-bold mb-2" style={{color: B.green}}>Подписание... {signProgress.done}/{signProgress.total}</div>
          <div className="w-full h-2 rounded-full overflow-hidden" style={{background: B.border}}>
            <div className="h-full transition-all" style={{width: `${(signProgress.done/signProgress.total)*100}%`, background: B.green}}/>
          </div>
        </div> : <>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>PIN-код ЭЦП</label>
            <input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)}
              placeholder="****" maxLength={6}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={()=>setBatchSignModal(false)} className="flex-1">Отмена</Btn>
            <Btn onClick={runBatchSign} icon={Pen} className="flex-1" disabled={pinInput.length < 4}>
              🔏 Подписать все
            </Btn>
          </div>
        </>}
      </div>
    </Modal>

    {/* Upload modal */}
    <Modal open={uploadModal} onClose={()=>{setUploadModal(false); setUploadFiles([]); setUploadTarget("")}} title="Загрузить документы">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium mb-1 block" style={{color: B.t2}}>Привязать к уступке (опционально)</label>
          <select value={uploadTarget} onChange={e=>setUploadTarget(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white" style={{color:B.t1}}>
            <option value="">— Не привязывать —</option>
            {ASSIGNMENTS.map(a => <option key={a.id} value={a.id}>{a.id} · {a.ttnNumber || `ДКП-${a.id}`}</option>)}
          </select>
        </div>
        <div
          onDragOver={(e)=>{e.preventDefault(); setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={(e)=>{e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files)}}
          className="p-8 rounded-xl border-2 border-dashed text-center cursor-pointer"
          style={{borderColor: dragOver ? B.accent : B.border, background: dragOver ? B.accentL+"30" : "#F8FAFC"}}>
          <Download size={32} className="mx-auto mb-2" style={{color: B.t3}}/>
          <div className="text-sm font-semibold mb-1" style={{color: B.t1}}>Перетащите файлы сюда</div>
          <div className="text-[11px]" style={{color: B.t3}}>или нажмите для выбора</div>
          <input type="file" multiple onChange={e=>handleFiles(e.target.files)} className="hidden" id="doc-upload"/>
          <label htmlFor="doc-upload" className="mt-2 inline-block px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer" style={{background:B.accent,color:"white"}}>
            Выбрать файлы
          </label>
        </div>
        {uploadFiles.length > 0 && <div className="space-y-1 max-h-40 overflow-y-auto">
          {uploadFiles.map((f, i) => <div key={i} className="flex items-center justify-between text-[11px] p-2 rounded" style={{background: "#F1F5F9"}}>
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={11} style={{color: B.accent}}/>
              <span className="truncate" style={{color: B.t1}}>{f.name}</span>
            </div>
            <button onClick={()=>setUploadFiles(prev => prev.filter((_,ix)=>ix!==i))}>
              <X size={11} style={{color: B.t3}}/>
            </button>
          </div>)}
        </div>}
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={()=>{setUploadModal(false); setUploadFiles([])}} className="flex-1">Отмена</Btn>
          <Btn onClick={submitUpload} icon={Check} className="flex-1" disabled={uploadFiles.length === 0}>
            Загрузить {uploadFiles.length}
          </Btn>
        </div>
      </div>
    </Modal>

    {/* Template picker */}
    <TemplatePicker
      open={templateModal}
      onClose={()=>setTemplateModal(false)}
      onGenerate={(tpl) => {
        setTemplateModal(false);
        setToast({msg:`Черновик создан по шаблону: ${tpl.label}`, type:"success"});
      }}
    />

    {/* Batch generate */}
    <BatchGenerateModal
      open={batchGenModal}
      onClose={()=>setBatchGenModal(false)}
      onGenerate={(ids, docType) => {
        setToast({msg:`Сгенерировано ${ids.length} ${DOC_TYPE_LABELS[docType]||docType} для выбранных уступок`, type:"success"});
      }}
      assignments={ASSIGNMENTS}
    />
  </div>;
}

// Card-style document item
function DocumentCardItem({doc, onClick, onRequestNew}) {
  const phase = DOC_PROCESS_PHASES.find(p => p.id === getDocPhase(doc));
  const isExpiring = doc.validity?.daysRemaining != null && doc.validity.daysRemaining >= 0 && doc.validity.daysRemaining <= 7;
  const isExpired = doc.validity?.daysRemaining != null && doc.validity.daysRemaining < 0;

  return <Card className="cursor-pointer hover:shadow-md transition-all" onClick={onClick}
    style={{borderLeft: `3px solid ${phase?.colors.fg || B.border}`}}>
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{background: phase?.colors.bg}}>
        <FileText size={16} style={{color: phase?.colors.fg}}/>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="mono text-[11px] font-bold" style={{color: B.accent}}>{doc.id}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{background: phase?.colors.bg, color: phase?.colors.fg}}>
            {phase?.icon} {phase?.label}
          </span>
          {isExpiring && !isExpired && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold animate-pulse" style={{background: B.orange+"20", color: B.orange}}>
            ⚠ истекает {doc.validity.daysRemaining}д
          </span>}
          {isExpired && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{background: B.redL, color: B.red}}>
            ⚠ ИСТЁК
          </span>}
        </div>
        <div className="text-xs font-semibold mt-1" style={{color: B.t1}}>{doc.title}</div>
        <div className="text-[10px] mt-0.5" style={{color: B.t3}}>
          {DOC_TYPE_LABELS[doc.docType]||doc.docType} · {doc.relatedTo?.company || "—"}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {(isExpiring || isExpired) && <Btn size="sm" variant="secondary" onClick={(e)=>{e.stopPropagation(); onRequestNew && onRequestNew(doc.id, doc.relatedTo?.company)}}>
          Запросить новое
        </Btn>}
        {doc.signatureChain && <div className="hidden md:block"><SignatureChain signatureChain={doc.signatureChain} compact/></div>}
        <ChevronRight size={14} style={{color: B.t3}}/>
      </div>
    </div>
  </Card>;
}

// Group documents by client (secondary layout)
function DocumentsGroupedByClient({docs, onRequestNew}) {
  const grouped = {};
  docs.forEach(d => {
    const key = d.relatedTo?.clientId || "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  });

  return <div className="space-y-5">
    {Object.entries(grouped).map(([clientId, items]) => {
      const client = COMPANIES.find(c => c.id === Number(clientId));
      return <div key={clientId}>
        <Card className="p-3 mb-2" style={{background: B.accentL+"30", borderColor: B.accent+"30"}}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-bold" style={{color: B.t1}}>{client?.name || "—"}</div>
              <div className="text-[10px] mono mt-0.5" style={{color: B.t3}}>УНП {client?.unp || "—"}</div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-lg font-bold" style={{background:"white", color:B.accent}}>
              {items.length} {items.length === 1 ? "документ" : items.length < 5 ? "документа" : "документов"}
            </span>
          </div>
        </Card>
        <div className="space-y-1.5">
          {items.map(d => <DocumentCardItem key={d.id} doc={d}
            onClick={()=>{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("oborotka:open-doc",{detail:{docId:d.id}}))}}
            onRequestNew={onRequestNew}/>)}
        </div>
      </div>;
    })}
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
  const [tab, setTab] = useState("legal"); // 'legal' or 'person'
  const [addModal, setAddModal] = useState(false);
  const [checkId, setCheckId] = useState("");
  const [checkResult, setCheckResult] = useState(null);
  const [newEntry, setNewEntry] = useState({type:"legal",unp:"",name:"",reason:""});

  const legalItems = items.filter(i=>i.type==="legal");
  const personItems = items.filter(i=>i.type==="person");
  const displayItems = tab==="legal" ? legalItems : personItems;

  const handleCheck = () => {
    const found = items.find(i=>i.unp===checkId||(i.personalId&&i.personalId===checkId));
    setCheckResult(found ? {found:true, item:found} : {found:false});
  };

  const handleAdd = () => {
    const entry = tab==="legal"
      ? {id:items.length+1, type:"legal", unp:newEntry.unp, name:newEntry.name, reason:newEntry.reason, addedBy:"Иванов А.С.", addedDate:"2026-03-26"}
      : {id:items.length+1, type:"person", personalId:newEntry.unp, name:newEntry.name, reason:newEntry.reason, addedBy:"Иванов А.С.", addedDate:"2026-03-26"};
    setItems([...items, entry]);
    setAddModal(false);
    setNewEntry({type:tab,unp:"",name:"",reason:""});
    setToast({msg:`${tab==="legal"?"ЮЛ":"ФЛ"} добавлено в стоп-лист`,type:"success"});
  };

  const openAddModal = () => {
    setNewEntry({type:tab,unp:"",name:"",reason:""});
    setAddModal(true);
  };

  const handleDelete = (id) => {
    setItems(items.filter(i=>i.id!==id));
    setToast({msg:"Запись удалена из стоп-листа",type:"info"});
  };

  return <div>
    <PageHeader title="Стоп-листы" breadcrumbs={["Стоп-листы"]}
      actions={<div className="flex gap-2">
        <Btn size="sm" variant="secondary" icon={Download} onClick={()=>setToast({msg:"Импорт CSV/Excel",type:"info"})}>Импорт</Btn>
        <Btn size="sm" icon={Plus} onClick={openAddModal}>Добавить в {tab==="legal"?"ЮЛ":"ФЛ"}</Btn>
      </div>}/>

    {/* Quick check */}
    <Card className="p-5 mb-6">
      <h3 className="text-sm font-bold mb-3" style={{color:B.t1}}>Проверить УНП или личный номер</h3>
      <div className="flex gap-2">
        <input value={checkId} onChange={e=>setCheckId(e.target.value)} placeholder="Введите УНП (для ЮЛ) или личный номер (для ФЛ)" className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 mono" style={{color:B.t1}}/>
        <Btn size="md" icon={Search} onClick={handleCheck}>Проверить</Btn>
      </div>
      {checkResult&&<div className={`mt-3 p-3 rounded-xl text-xs font-medium ${checkResult.found?"bg-red-50 border border-red-200":"bg-green-50 border border-green-200"}`} style={{color:checkResult.found?B.red:B.green}}>
        {checkResult.found?`⚠ Найден: ${checkResult.item.name} — ${checkResult.item.reason}`:"✅ Не найден в стоп-листе"}
      </div>}
    </Card>

    {/* Tabs ЮЛ/ФЛ */}
    <div className="mb-4">
      <TabFilter tabs={[
        {id:"legal", label:"Юридические лица", badge:legalItems.length},
        {id:"person", label:"Физические лица", badge:personItems.length},
      ]} active={tab} onChange={setTab}/>
    </div>

    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{minWidth:700}}>
        <thead><tr className="border-b border-slate-100" style={{background:"#F8FAFC"}}>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>{tab==="legal"?"УНП":"Личный №"}</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>{tab==="legal"?"Наименование":"ФИО"}</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Основание</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Добавлен</th>
          <th className="px-3 py-2.5 text-left font-semibold" style={{color:B.t3}}>Кем</th>
          <th className="px-2 py-2.5 text-center font-semibold" style={{color:B.t3}}></th>
        </tr></thead>
        <tbody>{displayItems.length===0?<tr><td colSpan={6} className="px-3 py-10 text-center text-xs" style={{color:B.t3}}>Нет записей в стоп-листе {tab==="legal"?"юридических":"физических"} лиц</td></tr>:
        displayItems.map((s,i)=><tr key={s.id} className={`border-b border-slate-50 ${i%2===1?"bg-slate-50/30":""}`}>
          <td className="px-3 py-2.5 font-semibold mono" style={{color:B.red}}>{s.unp||s.personalId}</td>
          <td className="px-3 py-2.5 font-medium" style={{color:B.t1}}>{s.name}</td>
          <td className="px-3 py-2.5" style={{color:B.t2}}>{s.reason}</td>
          <td className="px-3 py-2.5" style={{color:B.t3}}>{s.addedDate}</td>
          <td className="px-3 py-2.5" style={{color:B.t3}}>{s.addedBy}</td>
          <td className="px-2 py-2.5 text-center"><Btn size="sm" variant="danger" onClick={()=>handleDelete(s.id)}>Удалить</Btn></td>
        </tr>)}</tbody>
      </table>
      </div>
    </Card>

    {/* Add modal — форма зависит от таба */}
    <Modal open={addModal} onClose={()=>setAddModal(false)} title={`Добавить ${tab==="legal"?"юридическое":"физическое"} лицо`}>
      <div className="space-y-4">
        {tab==="legal"?<>
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>УНП</label>
            <input value={newEntry.unp} onChange={e=>setNewEntry({...newEntry,unp:e.target.value})} placeholder="9-значный УНП" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/></div>
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Наименование организации</label>
            <input value={newEntry.name} onChange={e=>setNewEntry({...newEntry,name:e.target.value})} placeholder="ООО «Название»" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}/></div>
        </>:<>
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Личный номер</label>
            <input value={newEntry.unp} onChange={e=>setNewEntry({...newEntry,unp:e.target.value})} placeholder="Например: 3150190A001PB5" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 mono" style={{color:B.t1}}/></div>
          <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>ФИО</label>
            <input value={newEntry.name} onChange={e=>setNewEntry({...newEntry,name:e.target.value})} placeholder="Иванов Иван Иванович" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}/></div>
        </>}
        <div><label className="text-xs font-medium mb-1 block" style={{color:B.t2}}>Основание</label>
          <textarea value={newEntry.reason} onChange={e=>setNewEntry({...newEntry,reason:e.target.value})} rows={2} placeholder="Причина внесения в стоп-лист" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" style={{color:B.t1}}/></div>
        <Btn onClick={handleAdd} disabled={!newEntry.unp||!newEntry.name||!newEntry.reason} className="w-full">Добавить в стоп-лист</Btn>
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
  const [emailNotifs, setEmailNotifs] = useState({newDeal:true, overdue:true, payment:true, scoring:true, stoplist:true});
  const [soundEnabled, setSoundEnabled] = usePersistedState("notifications-sound", false, v => v === true || v === false);
  const [reducedMotion, setReducedMotion] = usePersistedState("reduced-motion", false, v => v === true || v === false);
  const [darkMode, setDarkMode] = usePersistedState("dark-mode", false, v => v === true || v === false);

  return <div>
    <PageHeader title="Настройки" breadcrumbs={["Настройки"]}/>

    <div className="space-y-6">
      {/* Personal UX preferences */}
      <Card className="p-5">
        <h3 className="text-sm font-bold mb-4" style={{color:B.t1}}>Личные настройки</h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-slate-50" style={{border: `1px solid ${B.border}`}}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background: darkMode ? "#0F172A" : "#F1F5F9"}}>
                <span style={{color: darkMode ? "white" : B.t3, fontSize: 14}}>🌙</span>
              </div>
              <div>
                <div className="text-xs font-semibold" style={{color: B.t1}}>Тёмная тема</div>
                <div className="text-[10px]" style={{color: B.t3}}>Сохраняет зрение при длительной работе (8+ часов)</div>
              </div>
            </div>
            <input type="checkbox" checked={darkMode} onChange={e => setDarkMode(e.target.checked)} className="w-4 h-4"/>
          </label>

          <label className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-slate-50" style={{border: `1px solid ${B.border}`}}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background: soundEnabled ? B.accentL : "#F1F5F9"}}>
                <Bell size={14} style={{color: soundEnabled ? B.accent : B.t3}}/>
              </div>
              <div>
                <div className="text-xs font-semibold" style={{color: B.t1}}>Звук при новых задачах</div>
                <div className="text-[10px]" style={{color: B.t3}}>Короткий сигнал когда поступает новая уступка или заявка</div>
              </div>
            </div>
            <input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)} className="w-4 h-4"/>
          </label>

          <label className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-slate-50" style={{border: `1px solid ${B.border}`}}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background: "#F1F5F9"}}>
                <Zap size={14} style={{color: B.t3}}/>
              </div>
              <div>
                <div className="text-xs font-semibold" style={{color: B.t1}}>Уменьшить анимации</div>
                <div className="text-[10px]" style={{color: B.t3}}>Отключить переходы и анимации интерфейса (доступность)</div>
              </div>
            </div>
            <input type="checkbox" checked={reducedMotion} onChange={e => setReducedMotion(e.target.checked)} className="w-4 h-4"/>
          </label>
        </div>
      </Card>

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
            <td className="px-3 py-2.5" style={{color:B.t2}}>{u.position} <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded" style={{background:ROLE_ACCESS[u.role]?.color+"15",color:ROLE_ACCESS[u.role]?.color}}>{ROLE_ACCESS[u.role]?.icon} {ROLE_ACCESS[u.role]?.label}</span></td>
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
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-bold" style={{color:B.t1}}>Тарифный план пеней</h3>
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{background:"#EEF2FF", color:"#6366F1"}}>АБС банка</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-[10px]" style={{color:B.t3}}>По основному долгу</div>
              <div className="text-sm font-bold mono mt-0.5" style={{color:B.t1}}>0.1 % / день</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50">
              <div className="text-[10px]" style={{color:B.t3}}>По дисконту</div>
              <div className="text-sm font-bold mono mt-0.5" style={{color:B.t1}}>0.05 % / день</div>
            </div>
          </div>
          <div className="text-[10px] mt-3 p-2 rounded-lg flex items-start gap-1.5" style={{background:"#EEF2FF", color:"#6366F1"}}>
            <Info size={11} className="shrink-0 mt-0.5"/>
            <span>Настройки правил пеней ведутся в АБС банка. Oborotka.by только отображает текущие значения. Источник: АБС «Нео Банк Азия» · обновлено сегодня в 06:00</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-bold" style={{color:B.t1}}>Шкала резервирования</h3>
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{background:"#EEF2FF", color:"#6366F1"}}>АБС банка</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[{label:"День 0",val:"5"},{label:"День 8",val:"20"},{label:"День 31",val:"50"},{label:"День 180",val:"100"}].map((r,i)=>(
              <div key={i} className="p-2 rounded-lg bg-slate-50 text-center">
                <div className="text-[9px]" style={{color:B.t3}}>{r.label}</div>
                <div className="text-sm font-bold mono" style={{color:B.t1}}>{r.val}%</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] mt-3 p-2 rounded-lg flex items-start gap-1.5" style={{background:"#EEF2FF", color:"#6366F1"}}>
            <Info size={11} className="shrink-0 mt-0.5"/>
            <span>Резервирование средств, движение по корр.счёту и ФОР — операции АБС банка. Oborotka.by отображает статус и остатки, полученные из АБС.</span>
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


// ─── Default export: wrap AppInner with ErrorBoundary ───
export default function App() {
  return <ErrorBoundary>
    <AppInner/>
  </ErrorBoundary>;
}
