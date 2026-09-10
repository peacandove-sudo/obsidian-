const {
  ItemView,
  Menu,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
  setIcon,
} = require("obsidian");

const VIEW_TYPE = "wjq-task-hub-view";
const HOME_VIEW_TYPE = "wjq-workbench-home-view";
const TASK_CENTER_VIEW_TYPE = "wjq-task-center-view";
const PROJECT_VIEW_TYPE = "wjq-project-page-view";
const TASK_DETAIL_VIEW_TYPE = "wjq-task-detail-view";
const PLUGIN_BUILD = "0.9.60";
const TASK_WORKSPACE_AUTOSAVE_DELAY_MS = 10000;
const INTERNAL_TASK_PATH = "__wjq_internal_tasks__";
const TASK_META_REGEX = /%%wjq-task:(\{.*?\})%%/;
const TASK_STATUS_OPTIONS = ["待开始", "进行中", "等待中", "阅读中", "写作中", "整理中", "修改中", "暂停", "已完成"];

const DEFAULT_SETTINGS = {
  standaloneTaskFile: "00 任务总控/任务收件箱.md",
  inboxFile: "00 任务总控/收件箱.md",
  annualDiaryPathTemplate: "03 内容产出/00 随笔创作/日记/{year}.md",
  diaryOpenMode: "open",
  projectTagPrefix: "#p/",
  statusTagPrefix: "#s/",
  defaultProjects: ["论文写作", "博士申请", "专业课学习", "读书整理", "散文写作"],
  quickEntries: [
    { label: "年度日记", type: "annual-diary", target: "", icon: "calendar-days" },
    { label: "任务库", type: "command", target: "wjq-task-hub:open-task-hub", icon: "inbox" },
    { label: "毕业论文", type: "folder", target: "03 内容产出/01 学术写作/毕业论文", icon: "graduation-cap" },
    { label: "开题报告", type: "note", target: "03 内容产出/01 学术写作/毕业论文/开题报告.md", icon: "file-text" },
    { label: "新建任务", type: "command", target: "wjq-task-hub:create-standalone-task", icon: "plus-square" },
    { label: "完整主页", type: "home", target: "", icon: "layout-dashboard" },
  ],
  pinnedPaths: [],
  recentLimit: 8,
  homeWeekMode: "next7",
  homeWeekGroup: "project",
  homeWeekHideCompleted: false,
  homeGlobalView: "flow",
  homeProjectFilter: "全部",
  homeShowAllUnscheduled: false,
  homeProjectOrder: [],
  archivedProjects: [],
  recentOpenedPaths: [],
  homeStatusFilter: "全部",
  homeLevelFilter: "全部",
  homeTaskSearch: "",
  homeHideCompleted: false,
  homeGanttRange: "month",
  homeGanttOffsetDays: 0,
  projectGlobalView: "flow",
  homeFlowProject: "全部",
  homeFlowZoom: 1,
  homeFlowHideCompleted: false,
  homeFlowShowUnlinked: true,
  homeTreeProject: "全部",
  homeTreeSidebarWidth: 210,
  homeFlowSidebarWidth: 210,
  homeFlowLooseWidth: 240,
  sidebarScheduleView: "week",
  sidebarScheduleAnchor: "",
  homeOverviewColumns: [1, 1.35, 0.9, 0.9],
  homeCalendarColumns: [0.28, 0.72],
  projectPrimaryColumns: [1, 1, 1],
  projectSecondaryColumns: [1, 1, 1],
  projectPageColumns: [1, 1, 1, 1, 1],
  taskDetailViewMode: "flow",
  taskDetailSecondaryColumns: [1, 1, 1, 1],
  taskDetailWorkspaceColumns: [1, 1, 1, 1],
  taskDetailStructureColumns: [1, 1],
  currentProjectPage: "",
  currentTaskId: "",
  currentFullTaskId: "",
  sidebarSession: 0,
  taskPageFolder: "00 任务总控/任务页",
  projectNoteFolder: "00 任务总控/项目页",
  internalTasks: [],
  internalTaskDeletedAt: {},
  migratedStandaloneTaskFiles: [],
  legacyTodoStatusMigrated: false,
  todoStatusMigrationVersion: 0,
  projectRecords: {},
  hideCompletedByDefault: true,
  collectOnlyClassifiedTasks: true,
  activeStatusNames: ["待开始", "进行中", "等待中", "阅读中", "写作中", "整理中", "修改中", "暂停"],
  internalTaskSyncEnabled: true,
  internalTaskSyncIntervalSeconds: 8,
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeDateInput(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-$/.test(text)) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{1,2}$/.test(text)) {
    return `${currentYearMonth()}-${text.padStart(2, "0")}`;
  }
  if (/^\d{1,2}-\d{1,2}$/.test(text)) {
    const [month, day] = text.split("-").map((item) => item.padStart(2, "0"));
    return `${new Date().getFullYear()}-${month}-${day}`;
  }
  return text;
}

function dateInputValue(value) {
  return String(value || "").trim() || `${currentYearMonth()}-`;
}

function humanDate(date = new Date()) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function datesBetween(start, end) {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end || start);
  if (!startDate || !endDate || endDate < startDate) return [];
  const dates = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    dates.push(localDateString(date));
  }
  return dates;
}

function addDaysToDateString(value, days) {
  const date = parseLocalDate(value);
  return date ? localDateString(addDays(date, days)) : "";
}

function dateDiffDays(from, to) {
  const start = parseLocalDate(from);
  const end = parseLocalDate(to);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateFromParts(year, monthIndex, day) {
  return new Date(year, monthIndex, day);
}

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function taskSnapshotSignature(tasks) {
  return JSON.stringify((Array.isArray(tasks) ? tasks : [])
    .filter((item) => item && item.id)
    .map((item) => Object.assign({}, item))
    .sort((a, b) => String(a.id).localeCompare(String(b.id))));
}

function taskUpdateTime(task) {
  const value = Date.parse(String(task && task.updated_at || ""));
  return Number.isFinite(value) ? value : 0;
}

function generateTaskId() {
  return `wjq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeFileName(value) {
  return String(value || "未命名任务")
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "未命名任务";
}

function parseTaskMetadata(text) {
  const match = text.match(TASK_META_REGEX);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function taskMetadataComment(metadata) {
  const clean = {};
  if (metadata.id) clean.id = metadata.id;
  if (metadata.text) clean.text = metadata.text;
  if (metadata.project) clean.project = metadata.project;
  if (metadata.status) clean.status = metadata.status;
  if (metadata.due) clean.due = metadata.due;
  if (metadata.completed !== undefined) clean.completed = !!metadata.completed;
  if (metadata.parent) clean.parent = metadata.parent;
  if (metadata.progress) clean.progress = metadata.progress;
  if (metadata.priority) clean.priority = metadata.priority;
  if (metadata.blocked_by) clean.blocked_by = metadata.blocked_by;
  if (metadata.deadline) clean.deadline = metadata.deadline;
  if (metadata.planned_at) clean.planned_at = metadata.planned_at;
  if (metadata.hard_deadline) clean.hard_deadline = metadata.hard_deadline;
  if (metadata.completed_at) clean.completed_at = metadata.completed_at;
  if (metadata.canceled_at) clean.canceled_at = metadata.canceled_at;
  if (metadata.previous_status) clean.previous_status = metadata.previous_status;
  if (metadata.task_page) clean.task_page = metadata.task_page;
  if (metadata.next_step) clean.next_step = metadata.next_step;
  if (metadata.note) clean.note = metadata.note;
  if (metadata.materials) clean.materials = metadata.materials;
  if (metadata.output_draft) clean.output_draft = metadata.output_draft;
  if (Array.isArray(metadata.record_dates) && metadata.record_dates.length) clean.record_dates = uniq(metadata.record_dates);
  if (Array.isArray(metadata.record_notes) && metadata.record_notes.length) {
    clean.record_notes = metadata.record_notes
      .filter((item) => item && (item.date || item.text))
      .map((item) => ({
        id: item.id || "",
        date: item.date || "",
        text: item.text || "",
        task_id: item.task_id || item.taskId || "",
        task_title: item.task_title || item.taskTitle || "",
        project: item.project || "",
      }));
  }
  return `%%wjq-task:${JSON.stringify(clean)}%%`;
}

function upsertTaskMetadata(line, metadata) {
  const comment = taskMetadataComment(metadata);
  if (TASK_META_REGEX.test(line)) {
    return line.replace(TASK_META_REGEX, comment).trimEnd();
  }
  return `${line.trimEnd()} ${comment}`;
}

function hiddenTaskComment(data) {
  const metadata = Object.assign({}, data);
  if (!metadata.id) metadata.id = generateTaskId();
  return taskMetadataComment(metadata);
}

function taskIsCompletedStatus(status) {
  return /已完成|完成/.test(String(status || ""));
}

function availableTaskStatusChoices(configuredStatuses = [], includeCompleted = true) {
  const configured = Array.isArray(configuredStatuses) ? configuredStatuses : [];
  const values = uniq([...TASK_STATUS_OPTIONS, ...configured].filter((status) => status && status !== "待办"));
  return includeCompleted ? values : values.filter((status) => !taskIsCompletedStatus(status));
}

function scheduledTaskStatus(status, due, completedAt = "") {
  if (completedAt || taskIsCompletedStatus(status)) return "已完成";
  const current = String(status || "").trim();
  if (/取消|归档/.test(current)) return current;
  // Only lifecycle statuses follow the schedule; deliberate workflow states stay intact.
  if (current && !["待办", "待开始", "进行中"].includes(current)) return current;
  if (!due) return current === "待办" ? "待开始" : (current || "待开始");
  return due > localDateString() ? "待开始" : "进行中";
}

function removeTaskMetadata(text) {
  return text.replace(TASK_META_REGEX, "");
}

function removeDueDate(text) {
  return text
    .replace(/\s*\uD83D\uDCC5\s*\d{4}-\d{2}-\d{2}/g, "")
    .replace(/\s*\[?due::?\s*\d{4}-\d{2}-\d{2}\]?/gi, "")
    .replace(/\s*\[?截止::?\s*\d{4}-\d{2}-\d{2}\]?/gi, "");
}

function insertBeforeMetadata(line, addition) {
  const match = line.match(TASK_META_REGEX);
  if (!match) return `${line.trimEnd()} ${addition}`;
  const before = line.slice(0, match.index).trimEnd();
  const after = line.slice(match.index).trim();
  return `${before} ${addition} ${after}`.trimEnd();
}

function replaceStatusTag(line, prefix, status) {
  const statusRegex = new RegExp(`\\s*${escapeRegExp(prefix)}[^\\s#\\[\\]]+`, "g");
  const withoutStatus = line.replace(statusRegex, "").trimEnd();
  const cleanStatus = String(status || "").trim();
  return cleanStatus ? insertBeforeMetadata(withoutStatus, `${prefix}${cleanStatus}`) : withoutStatus;
}

function sameTask(left, right) {
  return left && right && left.path === right.path && left.lineNumber === right.lineNumber;
}

function shortTaskLabel(task) {
  const title = task.displayText || task.text || "未命名任务";
  const prefix = task.projects && task.projects.length ? `[${task.projects.join(", ")}] ` : "";
  return `${prefix}${title}`.slice(0, 90);
}

function shortNoteLabel(file) {
  if (!(file instanceof TFile)) return "";
  const folder = file.parent && file.parent.path ? file.parent.path.split("/").pop() : "";
  return folder ? `${file.basename} - ${folder}` : file.basename;
}

function taskStatusText(task) {
  if (!task) return "";
  if (task.completed) return "已完成";
  return task.status || (task.statuses && task.statuses[0]) || "";
}

function taskProgressText(task) {
  if (!task || !task.progress) return "";
  return /^\d+$/.test(String(task.progress)) ? `${task.progress}%` : String(task.progress);
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  if (diff < day * 30) return `${Math.floor(diff / day)}天前`;
  return new Date(timestamp).toLocaleDateString();
}

function normalizeQuickEntry(entry) {
  if (!entry) return null;
  return {
    label: String(entry.label || entry.target || "入口").trim(),
    type: String(entry.type || "note").trim(),
    target: String(entry.target || "").trim(),
    icon: String(entry.icon || "file-text").trim(),
  };
}

function quickEntriesToText(entries) {
  return (entries || [])
    .map((entry) => normalizeQuickEntry(entry))
    .filter(Boolean)
    .map((entry) => `${entry.label}|${entry.type}|${entry.target}|${entry.icon}`)
    .join("\n");
}

function quickEntriesFromText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, type = "note", target = "", icon = "file-text"] = line.split("|");
      return normalizeQuickEntry({ label, type, target, icon });
    })
    .filter(Boolean);
}

function frontmatterValue(frontmatter, keys) {
  if (!frontmatter) return "";
  for (const key of keys) {
    if (frontmatter[key] !== undefined && frontmatter[key] !== null && String(frontmatter[key]).trim() !== "") {
      return frontmatter[key];
    }
  }
  return "";
}

function normalizePropertyList(value) {
  if (Array.isArray(value)) {
    return uniq(value.map((item) => String(item || "").trim()).filter(Boolean));
  }
  const text = String(value || "").trim();
  if (!text) return [];
  return uniq(text
    .split(/[,，;；、\n]+/)
    .map((item) => item.trim())
    .filter(Boolean));
}

function simpleFolderLabel(path) {
  const parts = normalizePath(path || "").split("/").filter(Boolean);
  if (!parts.length) return "笔记";
  return parts[parts.length - 1].replace(/^\d+\s*/, "");
}

function contentTypeLabel(itemOrFile) {
  if (!itemOrFile) return "笔记";
  if (itemOrFile.type) return itemOrFile.type;
  const path = itemOrFile.path || "";
  if (/日记/.test(path)) return "日记";
  if (/毕业论文|学术写作|论文/.test(path)) return "学术写作";
  if (/随笔|散文|诗歌|歌词|文学创作/.test(path)) return "写作";
  if (/读书|微信读书|阅读|文献/.test(path)) return "阅读";
  return simpleFolderLabel(itemOrFile.folder || (itemOrFile.parent && itemOrFile.parent.path) || "");
}

class WjqTaskHubPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settingsWriteQueue = Promise.resolve();
    this.refreshTimer = null;
    this.refreshInFlight = null;
    this.refreshQueued = false;
    this.taskScanInFlight = null;
    this.lastErrorNoticeAt = 0;
    this.settings.quickEntries = (this.settings.quickEntries || DEFAULT_SETTINGS.quickEntries)
      .map((entry) => normalizeQuickEntry(entry))
      .map((entry) => {
        if (entry.type === "note" && normalizePath(entry.target || "") === normalizePath(DEFAULT_SETTINGS.standaloneTaskFile)) {
          return normalizeQuickEntry({ label: "任务库", type: "command", target: "wjq-task-hub:open-task-hub", icon: "inbox" });
        }
        return entry;
      })
      .filter(Boolean);
    this.settings.pinnedPaths = this.settings.pinnedPaths || [];
    this.settings.homeProjectOrder = this.settings.homeProjectOrder || [];
    this.settings.archivedProjects = this.settings.archivedProjects || [];
    this.settings.recentOpenedPaths = this.settings.recentOpenedPaths || [];
    this.settings.internalTasks = Array.isArray(this.settings.internalTasks) ? this.settings.internalTasks : [];
    this.settings.internalTaskDeletedAt = this.settings.internalTaskDeletedAt && typeof this.settings.internalTaskDeletedAt === "object" ? this.settings.internalTaskDeletedAt : {};
    this.settings.migratedStandaloneTaskFiles = Array.isArray(this.settings.migratedStandaloneTaskFiles) ? this.settings.migratedStandaloneTaskFiles : [];
    this.settings.activeStatusNames = uniq((this.settings.activeStatusNames || DEFAULT_SETTINGS.activeStatusNames)
      .map((status) => String(status || "").trim())
      .filter((status) => status && status !== "待办" && !taskIsCompletedStatus(status)));
    this.settings.sidebarScheduleAnchor = localDateString();
    if (this.settings.lastPluginBuild !== PLUGIN_BUILD) {
      this.settings.homeFlowShowUnlinked = true;
      this.settings.taskDetailViewMode = "flow";
      this.settings.lastPluginBuild = PLUGIN_BUILD;
      await this.saveData(this.settings);
    }
    if ((Number(this.settings.todoStatusMigrationVersion) || 0) < 2) {
      await this.deleteStatus("待办", "待开始");
      this.settings.legacyTodoStatusMigrated = true;
      this.settings.todoStatusMigrationVersion = 2;
      await this.saveData(this.settings);
    }
    await this.migrateStandaloneTaskFileToInternalTasks();
    this.captureInternalTaskSyncBaseline();
    this.startInternalTaskSync();

    this.registerView(VIEW_TYPE, (leaf) => new TaskHubView(leaf, this));
    this.registerView(HOME_VIEW_TYPE, (leaf) => new WorkbenchHomeView(leaf, this));
    this.registerView(TASK_CENTER_VIEW_TYPE, (leaf) => new TaskCenterView(leaf, this));
    this.registerView(PROJECT_VIEW_TYPE, (leaf) => new ProjectPageView(leaf, this));
    this.registerView(TASK_DETAIL_VIEW_TYPE, (leaf) => new TaskDetailView(leaf, this));

    this.addRibbonIcon("layout-dashboard", "打开任务控制台", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-task-hub",
      name: "打开任务控制台",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "open-workbench-home",
      name: "打开完整主页",
      callback: () => this.activateHomeView(),
    });

    this.addCommand({
      id: "open-current-project-page",
      name: "打开当前项目页",
      callback: () => this.activateProjectPageView(this.settings.currentProjectPage || this.settings.homeProjectFilter || "全部"),
    });

    this.addCommand({
      id: "open-annual-diary",
      name: "打开年度日记",
      callback: () => this.openAnnualDiary(),
    });

    this.addCommand({
      id: "insert-task-in-current-note",
      name: "关联当前笔记到已有任务",
      callback: () => this.openSidebarTaskLinkerForCurrentNote(),
    });

    this.addCommand({
      id: "create-standalone-task",
      name: "创建独立任务",
      callback: () => this.openSidebarNewTaskFromSelection({ sourcePath: "", insertLine: -1 }),
    });

    this.addCommand({
      id: "create-hidden-task-from-selection",
      name: "从选中文字建立任务",
      callback: () => this.openSidebarNewTaskFromSelection(),
    });

    this.addCommand({
      id: "refresh-task-hub",
      name: "刷新个人工作台",
      callback: () => this.refreshViews(),
    });

    this.addSettingTab(new TaskHubSettingTab(this.app, this));

    const refreshOnMarkdownChange = (file) => {
      if (file instanceof TFile && file.extension === "md") this.queueRefreshViews();
    };
    this.registerEvent(this.app.vault.on("modify", refreshOnMarkdownChange));
    this.registerEvent(this.app.vault.on("create", refreshOnMarkdownChange));
    this.registerEvent(this.app.vault.on("delete", refreshOnMarkdownChange));
    this.registerEvent(this.app.vault.on("rename", refreshOnMarkdownChange));
    this.registerEvent(this.app.workspace.on("file-open", (file) => this.recordOpenedFile(file)));
    this.registerDomEvent(window, "error", (event) => {
      this.reportTaskHubError("插件脚本错误", event.error || event.message || event);
    });
    this.registerDomEvent(window, "unhandledrejection", (event) => {
      this.reportTaskHubError("插件异步操作失败", event.reason || event);
    });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, view) => {
      menu.addItem((item) => {
        item.setTitle("建立任务");
        item.setIcon("list-plus");
        item.onClick(() => this.openSidebarNewTaskFromEditor(editor, view));
      });
      menu.addItem((item) => {
        item.setTitle("关联到已有任务");
        item.setIcon("link");
        item.onClick(() => this.openSidebarTaskLinkerFromEditor(editor, view));
      });
    }));
  }

  async onunload() {
    if (this.internalTaskSyncIntervalId) window.clearInterval(this.internalTaskSyncIntervalId);
    this.internalTaskSyncIntervalId = null;
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(HOME_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(TASK_CENTER_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(PROJECT_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(TASK_DETAIL_VIEW_TYPE);
  }

  async saveData(data) {
    // Obsidian 允许多个事件同时触发保存；按调用顺序串行写入快照，避免长时间使用后的相互覆盖。
    const snapshot = JSON.parse(JSON.stringify(data || {}));
    const previous = this.settingsWriteQueue || Promise.resolve();
    const write = previous
      .catch((error) => {
        console.error("[wjq-task-hub] 上一次数据保存失败", error);
      })
      .then(() => super.saveData(snapshot));
    this.settingsWriteQueue = write;
    return write;
  }

  startInternalTaskSync() {
    if (this.internalTaskSyncIntervalId) window.clearInterval(this.internalTaskSyncIntervalId);
    this.internalTaskSyncIntervalId = null;
    if (this.settings.internalTaskSyncEnabled === false) return;
    const seconds = Math.max(5, Math.min(60, Number(this.settings.internalTaskSyncIntervalSeconds) || 8));
    this.settings.internalTaskSyncIntervalSeconds = seconds;
    this.internalTaskSyncIntervalId = window.setInterval(() => this.syncInternalTasksFromDisk(), seconds * 1000);
    this.registerInterval(this.internalTaskSyncIntervalId);
  }

  captureInternalTaskSyncBaseline(tasks = this.settings.internalTasks) {
    this.internalTaskSyncBaseline = new Map((Array.isArray(tasks) ? tasks : [])
      .filter((item) => item && item.id)
      .map((item) => [item.id, JSON.stringify(item)]));
  }

  async readInternalTasksFromDisk() {
    const configDir = this.app.vault && this.app.vault.configDir;
    if (!configDir || !this.manifest || !this.manifest.id) return null;
    const path = `${configDir}/plugins/${this.manifest.id}/data.json`;
    try {
      const raw = await this.app.vault.adapter.read(path);
      const data = JSON.parse(raw);
      if (!Array.isArray(data.internalTasks)) return null;
      return {
        tasks: data.internalTasks.map((item) => this.normalizeInternalTaskMetadata(item)),
        deletedAt: data.internalTaskDeletedAt && typeof data.internalTaskDeletedAt === "object" ? data.internalTaskDeletedAt : {},
      };
    } catch (error) {
      return null;
    }
  }

  async syncInternalTasksFromDisk() {
    if (this.internalTaskSyncReading) return;
    this.internalTaskSyncReading = true;
    try {
      const remoteState = await this.readInternalTasksFromDisk();
      this.internalTaskSyncLastCheckedAt = Date.now();
      if (!remoteState) return;
      const localTasks = Array.isArray(this.settings.internalTasks) ? this.settings.internalTasks.map((item) => this.normalizeInternalTaskMetadata(item)) : [];
      const localDeletedAt = this.settings.internalTaskDeletedAt && typeof this.settings.internalTaskDeletedAt === "object" ? this.settings.internalTaskDeletedAt : {};
      const remoteTasks = remoteState.tasks;
      const remoteDeletedAt = remoteState.deletedAt;
      const localById = new Map(localTasks.map((item) => [item.id, item]));
      const remoteById = new Map(remoteTasks.map((item) => [item.id, item]));
      const ids = uniq([...localById.keys(), ...remoteById.keys(), ...Object.keys(localDeletedAt), ...Object.keys(remoteDeletedAt)]);
      const merged = [];
      const mergedDeletedAt = {};
      for (const id of ids) {
        const local = localById.get(id);
        const remote = remoteById.get(id);
        const newestTask = !local ? remote : !remote ? local : (taskUpdateTime(remote) >= taskUpdateTime(local) ? remote : local);
        const localDelete = Date.parse(String(localDeletedAt[id] || "")) || 0;
        const remoteDelete = Date.parse(String(remoteDeletedAt[id] || "")) || 0;
        const deletedAt = Math.max(localDelete, remoteDelete);
        if (deletedAt && (!newestTask || deletedAt >= taskUpdateTime(newestTask))) {
          mergedDeletedAt[id] = new Date(deletedAt).toISOString();
          continue;
        }
        if (newestTask) merged.push(newestTask);
      }
      const tasksChanged = taskSnapshotSignature(merged) !== taskSnapshotSignature(localTasks);
      const deletionsChanged = JSON.stringify(mergedDeletedAt) !== JSON.stringify(localDeletedAt);
      if (tasksChanged || deletionsChanged) {
        this.settings.internalTasks = merged;
        this.settings.internalTaskDeletedAt = mergedDeletedAt;
        this.captureInternalTaskSyncBaseline(merged);
        await this.saveData(this.settings);
        await this.refreshViews();
        new Notice("个人工作台：已同步另一台设备的任务更新");
      } else {
        this.captureInternalTaskSyncBaseline(remoteTasks);
      }
    } finally {
      this.internalTaskSyncReading = false;
    }
  }
  internalTaskSyncDescription() {
    const checked = this.internalTaskSyncLastCheckedAt
      ? `上次检查：${new Date(this.internalTaskSyncLastCheckedAt).toLocaleTimeString()}`
      : "尚未检查";
    const taskCount = Array.isArray(this.settings.internalTasks) ? this.settings.internalTasks.length : 0;
    const enabled = this.settings.internalTaskSyncEnabled === false ? "自动合并已关闭" : `每 ${this.settings.internalTaskSyncIntervalSeconds || 8} 秒检查`;
    return `当前内部任务：${taskCount} 项；${enabled}。${checked}。任务继续保存在插件 data.json 中；请在 Remotely Save 中同步 .obsidian，并不要排除 plugins/wjq-task-hub/data.json。`;
  }
  async saveSettings(options = {}) {
    await this.saveData(this.settings);
    if (options.refresh !== false) await this.refreshViews();
  }

  reportTaskHubError(context, error) {
    console.error(`[wjq-task-hub] ${context}`, error);
    const now = Date.now();
    if (now - (this.lastErrorNoticeAt || 0) > 5000) {
      this.lastErrorNoticeAt = now;
      new Notice(`${context}，已阻止视图卡死，请刷新后再试`);
    }
  }

  async activateView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    let leaf = leaves[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  async activateHomeView() {
    const leaves = this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE);
    let leaf = leaves[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(false);
      await leaf.setViewState({ type: HOME_VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  async activateProjectPageView(project) {
    const name = String(project || "全部").trim() || "全部";
    this.settings.currentProjectPage = name;
    await this.saveData(this.settings);
    const leaf = this.newPageLeaf();
    await leaf.setViewState({ type: PROJECT_VIEW_TYPE, active: true, state: { project: name } });
    this.app.workspace.revealLeaf(leaf);
    if (leaf.view && leaf.view.refresh) await leaf.view.refresh();
    this.refreshLeafAfterVisible(leaf);
  }

  async activateTaskDetailView(task) {
    const taskId = await this.ensureTaskId(task);
    if (!taskId) {
      new Notice("无法打开任务详情");
      return;
    }
    this.settings.currentTaskId = taskId;
    this.settings.sidebarSession = (Number(this.settings.sidebarSession) || 0) + 1;
    this.pendingTaskDraft = null;
    this.pendingTaskLinkDraft = null;
    await this.saveData(this.settings);
    await this.activateView();
    await this.refreshViews();
  }

  async activateTaskFullPage(task) {
    const taskId = await this.ensureTaskId(task);
    if (!taskId) {
      new Notice("无法打开任务完整页");
      return;
    }
    this.settings.currentFullTaskId = taskId;
    await this.saveData(this.settings);
    const leaf = this.newPageLeaf();
    await leaf.setViewState({ type: TASK_DETAIL_VIEW_TYPE, active: true, state: { taskId } });
    this.app.workspace.revealLeaf(leaf);
    if (leaf.view && leaf.view.refresh) await leaf.view.refresh();
    this.refreshLeafAfterVisible(leaf);
  }

  refreshLeafAfterVisible(leaf) {
    // 新标签首次进入时容器尺寸可能仍为 0，延后刷新让流程图按可见尺寸完成布局。
    const refresh = async () => {
      if (!leaf || !leaf.view || typeof leaf.view.refresh !== "function") return;
      const container = leaf.view.containerEl;
      if (container && !container.isConnected) return;
      try {
        await leaf.view.refresh();
      } catch (error) {
        this.reportTaskHubError("页面显示后刷新失败", error);
      }
    };
    window.requestAnimationFrame(() => window.setTimeout(refresh, 120));
    window.setTimeout(refresh, 500);
  }

  async closeTaskSideEditor() {
    this.settings.currentTaskId = "";
    this.pendingTaskDraft = null;
    this.pendingTaskLinkDraft = null;
    this.settings.sidebarSession = (Number(this.settings.sidebarSession) || 0) + 1;
    await this.saveData(this.settings);
    await this.refreshViews();
  }

  async closeTaskSideEditorIfUnchanged(session) {
    if (Number(this.settings.sidebarSession) !== Number(session)) return false;
    this.settings.currentTaskId = "";
    this.pendingTaskDraft = null;
    this.pendingTaskLinkDraft = null;
    this.settings.sidebarSession = (Number(this.settings.sidebarSession) || 0) + 1;
    await this.saveData(this.settings);
    await this.refreshViews();
    return true;
  }

  async clearTaskSideEditorSilently() {
    this.settings.currentTaskId = "";
    this.pendingTaskDraft = null;
    this.pendingTaskLinkDraft = null;
    this.settings.sidebarSession = (Number(this.settings.sidebarSession) || 0) + 1;
    await this.saveData(this.settings);
  }

  taskDraftFromMarkdownContext(editor = null, view = null) {
    const markdownView = view && view.file instanceof TFile
      ? view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    const activeEditor = editor || (markdownView && markdownView.editor ? markdownView.editor : null);
    const file = markdownView && markdownView.file instanceof TFile
      ? markdownView.file
      : null;
    if (file) {
      const cursor = activeEditor ? activeEditor.getCursor("to") : null;
      return {
        title: activeEditor ? activeEditor.getSelection().trim() : "",
        sourcePath: file.path,
        insertLine: cursor ? cursor.line : -1,
        linkedNotePath: file.path,
      };
    }
    const recentPath = (this.settings.recentOpenedPaths || [])
      .find((path) => this.app.vault.getAbstractFileByPath(path) instanceof TFile);
    if (!recentPath) return { title: "", sourcePath: "", insertLine: -1, linkedNotePath: "" };
    return {
      title: "",
      sourcePath: recentPath,
      insertLine: -1,
      linkedNotePath: recentPath,
    };
  }

  async openSidebarNewTaskFromEditor(editor = null, view = null, overrides = {}) {
    return this.openSidebarNewTaskFromSelection(Object.assign({}, this.taskDraftFromMarkdownContext(editor, view), overrides || {}));
  }

  async openSidebarTaskLinkerFromEditor(editor = null, view = null, overrides = {}) {
    return this.openSidebarTaskLinker(Object.assign({}, this.taskDraftFromMarkdownContext(editor, view), overrides || {}));
  }

  async openSidebarTaskLinkerForCurrentNote(overrides = {}) {
    return this.openSidebarTaskLinker(Object.assign({}, this.taskDraftFromMarkdownContext(), overrides || {}));
  }

  async openSidebarTaskLinker(overrides = {}) {
    const sourcePath = normalizePath(String(overrides.sourcePath || overrides.linkedNotePath || "").replace(/\\/g, "/"));
    const file = sourcePath ? this.app.vault.getAbstractFileByPath(sourcePath) : null;
    if (!(file instanceof TFile) || file.extension !== "md") {
      new Notice("请先打开一篇要关联的 Markdown 笔记");
      return false;
    }
    this.pendingTaskLinkDraft = Object.assign({
      sourcePath,
      selectedTaskKeys: [],
    }, overrides || {}, { sourcePath });
    this.pendingTaskDraft = null;
    this.settings.currentTaskId = "";
    this.settings.sidebarSession = (Number(this.settings.sidebarSession) || 0) + 1;
    await this.saveData(this.settings);
    await this.activateView();
    await this.refreshViews();
    return true;
  }

  async openSidebarNewTaskFromSelection(overrides = {}) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view && view.editor ? view.editor : null;
    const selected = editor ? editor.getSelection().trim() : "";
    const cursor = editor ? editor.getCursor("to") : null;
    const activeNotePath = view && view.file instanceof TFile ? view.file.path : "";
    const sourcePath = overrides && Object.prototype.hasOwnProperty.call(overrides, "sourcePath")
      ? overrides.sourcePath
      : activeNotePath;
    const insertLine = overrides && Object.prototype.hasOwnProperty.call(overrides, "insertLine")
      ? overrides.insertLine
      : (cursor ? cursor.line : -1);
    const linkedNotePath = overrides && Object.prototype.hasOwnProperty.call(overrides, "linkedNotePath")
      ? overrides.linkedNotePath
      : (sourcePath || activeNotePath);
    this.pendingTaskDraft = Object.assign({
      title: selected,
      project: "",
      status: "待开始",
      due: "",
      deadline: "",
      hardDeadline: "",
      completedAt: "",
      progress: "",
      priority: "",
      sourcePath,
      insertLine,
      linkedNotePath,
      mode: "hidden",
    }, overrides || {});
    this.pendingTaskLinkDraft = null;
    this.settings.currentTaskId = "";
    this.settings.sidebarSession = (Number(this.settings.sidebarSession) || 0) + 1;
    await this.saveData(this.settings);
    await this.activateView();
    await this.refreshViews();
  }

  async createHiddenTaskFromDraft(data) {
    const title = String(data.title || "").trim();
    if (!title) {
      new Notice("先写任务内容");
      return false;
    }
    const project = String(data.project || "").trim();
    if (!project) {
      new Notice("请选择所属项目");
      return false;
    }
    const due = normalizeDateInput(data.due);
    const deadline = normalizeDateInput(data.deadline);
    const hardDeadline = normalizeDateInput(data.hardDeadline || data.hard_deadline || "");
    const completedAt = normalizeDateInput(data.completedAt || data.completed_at || "");
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
      new Notice("开始日期格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
      new Notice("计划完成格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }
    if (hardDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(hardDeadline)) {
      new Notice("截止日期格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }
    if (due && deadline && deadline < due) {
      new Notice("计划完成不能早于开始日期");
      return false;
    }
    if (completedAt && !/^\d{4}-\d{2}-\d{2}$/.test(completedAt)) {
      new Notice("实际完成格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }
    const status = scheduledTaskStatus(data.status, due, completedAt);
    const metadata = {
      id: generateTaskId(),
      text: title,
      project,
      status,
      due: due || completedAt,
      planned_at: deadline,
      hard_deadline: hardDeadline,
      completed_at: completedAt,
      progress: data.progress || "",
      priority: data.priority || "",
      parent: data.parentId || "",
      blocked_by: data.blockedBy || "",
      completed: !!completedAt,
      materials: data.materials || "",
    };
    const path = normalizePath(data.sourcePath || "");
    // 所有通过任务控制台创建的任务都保存在插件数据中，绝不改写来源笔记。
    await this.saveInternalTaskMetadata(metadata);
    const childTasks = data.childTasks || (data.childTask ? [data.childTask] : []);
    for (const childTask of childTasks) {
      await this.updateTaskMetadata(childTask, (childMetadata) => {
        childMetadata.parent = metadata.id;
        return childMetadata;
      });
    }
    if ((data.parentId || "").trim()) await this.reopenParentChainForOpenChild(data.parentId);
    const nextTasks = data.nextTasks || (data.nextTask ? [data.nextTask] : []);
    for (const nextTask of nextTasks) {
      await this.updateTaskMetadata(nextTask, (nextMetadata) => {
        nextMetadata.blocked_by = metadata.id;
        return nextMetadata;
      });
    }
    this.pendingTaskDraft = null;
    new Notice("已创建任务");
    await this.refreshViews();
    if (data.linkSourceToMaterials && path) {
      const latest = (await this.scanTasks()).find((task) => task.taskId === metadata.id);
      if (latest) await this.addMaterialToTask(latest, path, { silent: true, skipRefresh: true });
    }
    const linkedNotePaths = uniq([data.linkedNotePath || "", ...(Array.isArray(data.linkedNotePaths) ? data.linkedNotePaths : [])]);
    if (linkedNotePaths.length) {
      const latest = (await this.scanTasks()).find((task) => task.taskId === metadata.id);
      if (latest) {
        for (const notePath of linkedNotePaths) {
          await this.addMaterialToTask(latest, notePath, { silent: true, skipRefresh: true });
        }
      }
    }
    await this.autoCompleteParentChainForTaskId(metadata.id);
    return true;
  }

  normalizeInternalTaskMetadata(metadata = {}) {
    const id = String(metadata.id || "").trim() || generateTaskId();
    const text = String(metadata.text || metadata.title || "").trim();
    const project = String(metadata.project || "").trim();
    const status = String(metadata.status || (metadata.completed || metadata.completed_at ? "已完成" : "待开始")).trim();
    const due = normalizeDateInput(metadata.due || "");
    const plannedAt = normalizeDateInput(metadata.planned_at || metadata.deadline || "");
    const hardDeadline = normalizeDateInput(metadata.hard_deadline || metadata.hardDeadline || metadata.cutoff_at || metadata.cutoff || "");
    const completedAt = normalizeDateInput(metadata.completed_at || "");
    const canceledAt = normalizeDateInput(metadata.canceled_at || "");
    const clean = {
      id,
      text,
      project,
      status,
      due,
      planned_at: plannedAt,
      hard_deadline: hardDeadline,
      completed_at: completedAt,
      canceled_at: canceledAt,
      completed: !!metadata.completed || !!completedAt || taskIsCompletedStatus(status),
    };
    const optionalKeys = [
      "parent",
      "blocked_by",
      "progress",
      "priority",
      "previous_status",
      "task_page",
      "next_step",
      "note",
      "materials",
      "output_draft",
      "updated_at",
    ];
    for (const key of optionalKeys) {
      if (metadata[key] !== undefined && metadata[key] !== null && String(metadata[key]).trim() !== "") {
        clean[key] = String(metadata[key]).trim();
      }
    }
    if (Array.isArray(metadata.record_dates) && metadata.record_dates.length) clean.record_dates = uniq(metadata.record_dates);
    if (Array.isArray(metadata.record_notes) && metadata.record_notes.length) clean.record_notes = metadata.record_notes;
    return clean;
  }

  internalTaskFromMetadata(metadata, index = 0) {
    const item = this.normalizeInternalTaskMetadata(metadata);
    const status = item.status || "";
    const completed = !!item.completed || !!item.completed_at || taskIsCompletedStatus(status);
    const project = String(item.project || "").trim();
    return {
      id: item.id,
      taskId: item.id,
      parentId: item.parent || "",
      blockedBy: item.blocked_by || "",
      progress: item.progress || "",
      priority: item.priority || "",
      deadline: item.planned_at || "",
      plannedAt: item.planned_at || "",
      hardDeadline: item.hard_deadline || "",
      completedAt: item.completed_at || "",
      canceledAt: item.canceled_at || "",
      previousStatus: item.previous_status || "",
      taskPage: item.task_page || "",
      nextStep: item.next_step || "",
      note: item.note || "",
      materials: item.materials || "",
      outputDraft: item.output_draft || "",
      recordDates: Array.isArray(item.record_dates) ? uniq(item.record_dates) : [],
      recordNotes: Array.isArray(item.record_notes) ? item.record_notes.filter((record) => record && (record.date || record.text)) : [],
      runtimeId: `internal:${item.id}`,
      path: INTERNAL_TASK_PATH,
      basename: "插件任务库",
      lineNumber: index + 1,
      indent: "",
      rawLine: "",
      text: item.text,
      displayText: item.text,
      completed,
      due: item.due || "",
      projects: project ? [project] : [],
      status,
      statuses: status ? [status] : [],
      hidden: true,
      internal: true,
    };
  }

  internalTaskMetadataFromTask(task) {
    if (!task) return null;
    const list = Array.isArray(this.settings.internalTasks) ? this.settings.internalTasks : [];
    const id = task.taskId || String(task.runtimeId || "").replace(/^internal:/, "");
    return list.find((item) => item && item.id === id) || null;
  }

  async saveInternalTaskMetadata(metadata) {
    const clean = this.normalizeInternalTaskMetadata(metadata);
    clean.updated_at = new Date().toISOString();
    if (!clean.text) return false;
    const list = Array.isArray(this.settings.internalTasks) ? this.settings.internalTasks.slice() : [];
    const index = list.findIndex((item) => item && item.id === clean.id);
    if (index >= 0) list[index] = clean;
    else list.push(clean);
    this.settings.internalTasks = list;
    await this.saveData(this.settings);
    return true;
  }

  async updateInternalTaskMetadata(task, updater) {
    const current = this.internalTaskMetadataFromTask(task);
    if (!current) {
      new Notice("找不到内部任务");
      return null;
    }
    const updated = updater ? updater(Object.assign({}, current)) || current : current;
    const clean = this.normalizeInternalTaskMetadata(updated);
    await this.saveInternalTaskMetadata(clean);
    return clean;
  }

  async createInternalTaskFromData(data = {}) {
    const title = String(data.title || data.text || "").trim();
    if (!title) {
      new Notice("先写任务内容");
      return false;
    }
    const project = String(data.project || "").trim();
    if (!project) {
      new Notice("请选择所属项目");
      return false;
    }
    const due = normalizeDateInput(data.due || "");
    const deadline = normalizeDateInput(data.deadline || data.planned_at || "");
    const hardDeadline = normalizeDateInput(data.hardDeadline || data.hard_deadline || "");
    const completedAt = normalizeDateInput(data.completedAt || data.completed_at || "");
    const status = scheduledTaskStatus(data.status, due, completedAt);
    const metadata = this.normalizeInternalTaskMetadata({
      id: data.id || generateTaskId(),
      text: title,
      project,
      status,
      due: due || completedAt,
      planned_at: deadline,
      hard_deadline: hardDeadline,
      completed_at: completedAt,
      progress: data.progress || "",
      priority: data.priority || "",
      parent: data.parentId || data.parent || "",
      blocked_by: data.blockedBy || data.blocked_by || "",
      completed: !!completedAt,
      materials: data.materials || "",
      note: data.note || "",
      next_step: data.nextStep || data.next_step || "",
      output_draft: data.outputDraft || data.output_draft || "",
    });
    await this.saveInternalTaskMetadata(metadata);
    return metadata;
  }

  async migrateStandaloneTaskFileToInternalTasks() {
    const targetPath = normalizePath(this.settings.standaloneTaskFile || DEFAULT_SETTINGS.standaloneTaskFile);
    if (!targetPath) return;
    const file = this.app.vault.getAbstractFileByPath(targetPath);
    if (!(file instanceof TFile)) {
      this.settings.migratedStandaloneTaskFiles = uniq([...(this.settings.migratedStandaloneTaskFiles || []), targetPath]);
      await this.saveData(this.settings);
      return;
    }
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n/);
    const existingIds = new Set((this.settings.internalTasks || []).map((item) => item && item.id).filter(Boolean));
    const imported = [];
    for (let index = 0; index < lines.length; index += 1) {
      const task = this.parseTaskLine(file, lines[index], index + 1) || this.parseHiddenTaskLine(file, lines[index], index + 1);
      if (!task) continue;
      const metadata = parseTaskMetadata(lines[index]);
      const id = metadata.id || task.taskId || generateTaskId();
      if (existingIds.has(id)) continue;
      existingIds.add(id);
      imported.push(this.normalizeInternalTaskMetadata(Object.assign({}, metadata, {
        id,
        text: task.displayText || task.text,
        project: task.projects[0] || metadata.project || "",
        status: taskStatusText(task) || metadata.status || "",
        due: task.due || metadata.due || "",
        planned_at: task.deadline || metadata.planned_at || metadata.deadline || "",
        hard_deadline: task.hardDeadline || metadata.hard_deadline || metadata.hardDeadline || metadata.cutoff_at || metadata.cutoff || "",
        completed_at: task.completedAt || metadata.completed_at || "",
        canceled_at: task.canceledAt || metadata.canceled_at || "",
        completed: task.completed,
        parent: task.parentId || metadata.parent || "",
        blocked_by: task.blockedBy || metadata.blocked_by || "",
        progress: task.progress || metadata.progress || "",
        priority: task.priority || metadata.priority || "",
        previous_status: task.previousStatus || metadata.previous_status || "",
        task_page: task.taskPage || metadata.task_page || "",
        next_step: task.nextStep || metadata.next_step || "",
        note: task.note || metadata.note || "",
        materials: task.materials || metadata.materials || "",
        output_draft: task.outputDraft || metadata.output_draft || "",
        record_dates: task.recordDates && task.recordDates.length ? task.recordDates : metadata.record_dates,
        record_notes: task.recordNotes && task.recordNotes.length ? task.recordNotes : metadata.record_notes,
      })));
    }
    if (imported.length) this.settings.internalTasks = [...(this.settings.internalTasks || []), ...imported];
    this.settings.migratedStandaloneTaskFiles = uniq([...(this.settings.migratedStandaloneTaskFiles || []), targetPath]);
    await this.saveData(this.settings);
    if (imported.length) new Notice(`已导入任务收件箱 ${imported.length} 项到插件任务库`);
  }

  async appendHiddenTaskComments(comments, sourcePath = "", insertLine = -1) {
    const block = comments.filter(Boolean).join("\n");
    if (!block) return false;
    // 保留函数名以兼容旧调用；重复任务同样只写插件数据，不插入来源笔记。
    const imported = comments
      .map((comment) => parseTaskMetadata(comment))
      .filter((metadata) => metadata && metadata.text)
      .map((metadata) => this.normalizeInternalTaskMetadata(metadata));
    for (const metadata of imported) await this.saveInternalTaskMetadata(metadata);
    return true;
  }

  async createRepeatedHiddenTasksFromDraft(data) {
    const title = String(data.title || "").trim();
    if (!title) {
      new Notice("先写任务内容");
      return false;
    }
    const project = String(data.project || "").trim();
    if (!project) {
      new Notice("请选择所属项目");
      return false;
    }
    const count = Math.floor(Number(data.repeatCount || data.repeatDays || 0));
    if (!Number.isFinite(count) || count < 2) {
      new Notice("重复任务至少需要 2 天");
      return false;
    }
    if (count > 366) {
      new Notice("一次最多创建 366 条重复任务");
      return false;
    }
    const start = normalizeDateInput(data.due) || localDateString();
    const deadline = normalizeDateInput(data.deadline);
    const hardDeadline = normalizeDateInput(data.hardDeadline || data.hard_deadline || "");
    const completedAt = normalizeDateInput(data.completedAt || data.completed_at || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      new Notice("开始日期格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
      new Notice("计划完成格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }
    if (hardDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(hardDeadline)) {
      new Notice("截止日期格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }
    if (deadline && deadline < start) {
      new Notice("计划完成不能早于开始日期");
      return false;
    }
    if (completedAt && !/^\d{4}-\d{2}-\d{2}$/.test(completedAt)) {
      new Notice("实际完成格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }

    const comments = [];
    let parentId = data.parentId || "";
    const deadlineSpan = deadline ? dateDiffDays(start, deadline) : 0;
    const hardDeadlineSpan = hardDeadline ? dateDiffDays(start, hardDeadline) : 0;
    const lastDue = addDaysToDateString(start, count - 1);
    const lastDeadline = deadline ? addDaysToDateString(lastDue, deadlineSpan) : lastDue;
    const lastHardDeadline = hardDeadline ? addDaysToDateString(lastDue, hardDeadlineSpan) : "";
    if (!parentId) {
      parentId = generateTaskId();
      const parentTitle = String(data.repeatParentTitle || "").trim() || `${title}（连续 ${count} 天）`;
      comments.push(hiddenTaskComment({
        id: parentId,
        text: parentTitle,
        project,
        status: scheduledTaskStatus("待开始", start),
        due: start,
        planned_at: lastDeadline,
        hard_deadline: lastHardDeadline,
        progress: "",
        priority: "",
        completed: false,
      }));
    }

    const blockedBy = data.blockedBy || "";
    for (let index = 0; index < count; index += 1) {
      const due = addDaysToDateString(start, index);
      const plannedAt = deadline ? addDaysToDateString(due, deadlineSpan) : "";
      const itemHardDeadline = hardDeadline ? addDaysToDateString(due, hardDeadlineSpan) : "";
      comments.push(hiddenTaskComment({
        id: generateTaskId(),
        text: title,
        project,
        status: scheduledTaskStatus("待开始", due, completedAt),
        due,
        planned_at: plannedAt,
        hard_deadline: itemHardDeadline,
        completed_at: completedAt,
        progress: data.progress || "",
        priority: data.priority || "",
        parent: parentId,
        blocked_by: blockedBy,
        completed: !!completedAt,
      }));
    }

    await this.appendHiddenTaskComments(comments, data.sourcePath, data.insertLine);
    const childTasks = data.childTasks || (data.childTask ? [data.childTask] : []);
    for (const childTask of childTasks) {
      await this.updateTaskMetadata(childTask, (childMetadata) => {
        childMetadata.parent = parentId;
        return childMetadata;
      });
    }
    if ((data.parentId || "").trim()) await this.reopenParentChainForOpenChild(data.parentId);
    const nextTasks = data.nextTasks || (data.nextTask ? [data.nextTask] : []);
    for (const nextTask of nextTasks) {
      await this.updateTaskMetadata(nextTask, (nextMetadata) => {
        nextMetadata.blocked_by = parentId;
        return nextMetadata;
      });
    }
    this.pendingTaskDraft = null;
    new Notice(`已创建 ${count} 条重复任务`);
    await this.refreshViews();
    const linkedNotePaths = uniq([data.linkedNotePath || "", ...(Array.isArray(data.linkedNotePaths) ? data.linkedNotePaths : [])]);
    if (linkedNotePaths.length) {
      const latest = (await this.scanTasks()).find((task) => task.taskId === parentId);
      if (latest) {
        for (const notePath of linkedNotePaths) {
          await this.addMaterialToTask(latest, notePath, { silent: true, skipRefresh: true });
        }
      }
    }
    return true;
  }

  async refreshViews(options = {}) {
    if (this.refreshInFlight) {
      this.refreshQueued = true;
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.refreshViewsOnce(options)
      .catch((error) => {
        this.reportTaskHubError("刷新任务视图失败", error);
      })
      .finally(() => {
        const shouldRefreshAgain = this.refreshQueued;
        this.refreshQueued = false;
        this.refreshInFlight = null;
        if (shouldRefreshAgain) this.queueRefreshViews(80);
      });

    return this.refreshInFlight;
  }

  async refreshViewsOnce(options = {}) {
    const tasks = await this.scanTasks({ force: options.force !== false });
    const leaves = [
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE),
      ...this.app.workspace.getLeavesOfType(HOME_VIEW_TYPE),
      ...this.app.workspace.getLeavesOfType(TASK_CENTER_VIEW_TYPE),
      ...this.app.workspace.getLeavesOfType(PROJECT_VIEW_TYPE),
      ...this.app.workspace.getLeavesOfType(TASK_DETAIL_VIEW_TYPE),
    ];
    for (const leaf of leaves) {
      if (leaf.view && leaf.view.refresh) {
        try {
          if (leaf.view.refreshWithTasks) await leaf.view.refreshWithTasks(tasks);
          else await leaf.view.refresh();
        } catch (error) {
          const label = leaf.view.getDisplayText ? leaf.view.getDisplayText() : "任务视图";
          this.reportTaskHubError(`${label}刷新失败`, error);
        }
      }
    }
  }

  queueRefreshViews(delay = 350) {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refreshViews();
    }, delay);
  }

  resolveAnnualDiaryPath() {
    const year = String(new Date().getFullYear());
    return normalizePath((this.settings.annualDiaryPathTemplate || "{year}.md").replace(/\{year\}/g, year));
  }

  async openAnnualDiary() {
    const path = this.resolveAnnualDiaryPath();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`未找到年度日记：${path}`);
      return;
    }

    const leaf = this.newPageLeaf();
    await leaf.openFile(file, { active: true });
    const view = leaf.view;
    if (this.settings.diaryOpenMode === "end" && view instanceof MarkdownView && view.editor) {
      const lastLine = Math.max(view.editor.lineCount() - 1, 0);
      view.editor.setCursor({ line: lastLine, ch: view.editor.getLine(lastLine).length });
      view.editor.scrollIntoView({ from: { line: lastLine, ch: 0 }, to: { line: lastLine, ch: 0 } }, true);
    }
  }

  async openPath(path, options = {}) {
    const normalized = normalizePath(path);
    const target = this.app.vault.getAbstractFileByPath(normalized);
    if (target instanceof TFile) {
      await this.newPageLeaf().openFile(target, { active: true });
      return;
    }

    if (target && target.children) {
      const firstMarkdown = target.children.find((child) => child instanceof TFile && child.extension === "md");
      if (firstMarkdown) {
        await this.newPageLeaf().openFile(firstMarkdown, { active: true });
      } else {
        new Notice(`文件夹没有可直接打开的 Markdown：${normalized}`);
      }
      return;
    }

    if (options.create) {
      await this.ensureFolderForFile(normalized);
      const created = await this.app.vault.create(normalized, "");
      await this.newPageLeaf().openFile(created, { active: true });
      return;
    }

    new Notice(`未找到入口：${normalized}`);
  }

  async openMaterialTarget(target) {
    const raw = String(target || "").trim();
    if (!raw) return;
    if (/^https?:\/\//i.test(raw)) {
      window.open(raw);
      return;
    }
    const clean = raw.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
    const normalized = normalizePath(clean.replace(/\\/g, "/"));
    const direct = this.app.vault.getAbstractFileByPath(normalized);
    if (direct instanceof TFile || (direct && direct.children)) {
      await this.openPath(normalized);
      return;
    }
    const byName = this.app.vault.getMarkdownFiles().find((file) => file.basename === clean || file.path === `${clean}.md`);
    if (byName) {
      await this.newPageLeaf().openFile(byName, { active: true });
      return;
    }
    await this.openPath(normalized);
  }

  newPageLeaf() {
    try {
      return this.app.workspace.getLeaf("tab");
    } catch (error) {
      return this.app.workspace.getLeaf(true);
    }
  }

  taskPagePathFor(task) {
    const existing = String(task.taskPage || "").trim();
    if (existing) return normalizePath(existing);
    const project = safeFileName((task.projects && task.projects[0]) || "未设项目");
    const title = safeFileName(task.displayText || task.text || "未命名任务");
    const idTail = String(task.taskId || task.id || "").slice(-6) || String(task.lineNumber || Date.now());
    return normalizePath(`${this.settings.taskPageFolder || DEFAULT_SETTINGS.taskPageFolder}/${project}/${title}-${idTail}.md`);
  }

  projectNotePathFor(project) {
    const name = safeFileName(project || "全部项目");
    return normalizePath(`${this.settings.projectNoteFolder || DEFAULT_SETTINGS.projectNoteFolder}/${name}.md`);
  }

  async openProjectNote(project) {
    const cleanProject = String(project || "全部").trim() || "全部";
    const path = this.projectNotePathFor(cleanProject);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      await this.ensureFolderForFile(path);
      const content = [
        `# ${cleanProject}`,
        "",
        "## 项目目标",
        "",
        "## 当前判断",
        "",
        "## 最近卡点",
        "",
        "## 下一次打开先做什么",
        "",
        "## 项目日志",
        `### ${localDateString()}`,
        "",
        "## 相关材料",
        "",
      ].join("\n");
      file = await this.app.vault.create(path, content);
    }
    await this.newPageLeaf().openFile(file, { active: true });
  }

  async openTaskPageNote(task) {
    const taskId = await this.ensureTaskId(task);
    if (!taskId) {
      new Notice("无法建立任务页");
      return;
    }
    const latestTasks = await this.scanTasks();
    const latest = latestTasks.find((item) => item.taskId === taskId) || task;
    const path = this.taskPagePathFor(latest);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      await this.ensureFolderForFile(path);
      const project = (latest.projects && latest.projects[0]) || "未设项目";
      const title = latest.displayText || latest.text || "未命名任务";
      const content = [
        `# ${title}`,
        "",
        "## 自动区",
        `- 任务ID：${taskId}`,
        `- 项目：${project}`,
        `- 状态：${taskStatusText(latest) || "待开始"}`,
        `- 开始日期：${latest.due || ""}`,
        `- 截止日期：${latest.hardDeadline || ""}`,
        `- 计划完成：${latest.deadline || ""}`,
        `- 实际完成：${latest.completedAt || ""}`,
        "",
        "## 推进记录",
        `### ${localDateString()}`,
        "",
        "## 备注",
        "",
        "## 下一步",
        "",
        "## 相关材料",
        "",
        "## 输出草稿",
        "",
      ].join("\n");
      file = await this.app.vault.create(path, content);
    }
    await this.updateTaskMetadata(latest, (metadata) => {
      metadata.task_page = path;
      return metadata;
    });
    await this.newPageLeaf().openFile(file, { active: true });
    await this.refreshViews();
  }

  async renamePath(path, nextName) {
    const normalized = normalizePath(path);
    const target = this.app.vault.getAbstractFileByPath(normalized);
    const cleanName = String(nextName || "").trim();
    if (!target) {
      new Notice("找不到要重命名的内容");
      return false;
    }
    if (!cleanName) {
      new Notice("名称不能为空");
      return false;
    }
    if (/[\\/:*?"<>|]/.test(cleanName)) {
      new Notice("名称不能包含 \\ / : * ? \" < > |");
      return false;
    }

    const oldPath = target.path;
    const parentPath = oldPath.includes("/") ? oldPath.slice(0, oldPath.lastIndexOf("/")) : "";
    const extension = target instanceof TFile ? `.${target.extension}` : "";
    const nextFileName = target instanceof TFile && !cleanName.endsWith(extension) ? `${cleanName}${extension}` : cleanName;
    const nextPath = normalizePath(parentPath ? `${parentPath}/${nextFileName}` : nextFileName);
    if (oldPath === nextPath) return true;
    if (this.app.vault.getAbstractFileByPath(nextPath)) {
      new Notice("同名内容已经存在");
      return false;
    }

    await this.app.vault.rename(target, nextPath);
    this.updatePathReferences(oldPath, nextPath);
    await this.saveSettings();
    new Notice("已重命名");
    await this.refreshViews();
    return true;
  }

  updatePathReferences(oldPath, nextPath) {
    const replacePath = (value) => {
      const normalized = normalizePath(value || "");
      if (normalized === oldPath) return nextPath;
      if (normalized.startsWith(`${oldPath}/`)) return `${nextPath}${normalized.slice(oldPath.length)}`;
      return value;
    };
    this.settings.quickEntries = (this.settings.quickEntries || []).map((entry) => {
      const next = Object.assign({}, entry);
      next.target = replacePath(next.target);
      return next;
    });
    this.settings.pinnedPaths = (this.settings.pinnedPaths || []).map(replacePath);
    this.settings.recentOpenedPaths = (this.settings.recentOpenedPaths || []).map(replacePath);
  }

  async renameQuickEntry(entry, nextName) {
    const cleanName = String(nextName || "").trim();
    if (!cleanName) {
      new Notice("名称不能为空");
      return false;
    }
    const entries = this.settings.quickEntries || [];
    const index = entries.findIndex((item) => item === entry);
    if (index < 0) return false;
    entries[index] = Object.assign({}, entries[index], { label: cleanName });
    this.settings.quickEntries = entries;
    await this.saveSettings();
    new Notice("已重命名入口");
    return true;
  }

  async renameProject(oldName, nextName) {
    const from = String(oldName || "").trim();
    const to = String(nextName || "").trim();
    if (!from || !to) {
      new Notice("项目名称不能为空");
      return false;
    }
    if (from === to) return true;

    this.settings.defaultProjects = uniq((this.settings.defaultProjects || []).map((project) => (project === from ? to : project)));
    this.settings.homeProjectOrder = uniq((this.settings.homeProjectOrder || []).map((project) => (project === from ? to : project)));
    this.settings.archivedProjects = uniq((this.settings.archivedProjects || []).map((project) => (project === from ? to : project)));
    if (this.settings.homeProjectFilter === from) this.settings.homeProjectFilter = to;
    this.settings.internalTasks = (this.settings.internalTasks || []).map((item) =>
      item && item.project === from ? Object.assign({}, item, { project: to }) : item
    );
    const prefix = this.settings.projectTagPrefix || "#p/";
    const tagPattern = new RegExp(`${escapeRegExp(prefix)}${escapeRegExp(from)}(?=$|\\s|[，,。；;：:])`, "g");
    const linkPattern = new RegExp(`\\+\\[\\[${escapeRegExp(from)}(?=\\]|\\|)`, "g");
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.read(file);
      const next = content
        .replace(tagPattern, `${prefix}${to}`)
        .replace(linkPattern, `+[[${to}`);
      if (next !== content) {
        await this.app.vault.modify(file, next);
      }
    }
    await this.saveSettings();
    new Notice("已重命名项目");
    await this.refreshViews();
    return true;
  }

  async renameStatus(oldName, nextName) {
    const from = String(oldName || "").trim();
    const to = String(nextName || "").trim();
    if (!from || !to) {
      new Notice("状态名称不能为空");
      return false;
    }
    if (from === to) return true;
    this.settings.activeStatusNames = uniq((this.settings.activeStatusNames || DEFAULT_SETTINGS.activeStatusNames).map((status) => (status === from ? to : status)));
    if (!this.settings.activeStatusNames.includes(to)) this.settings.activeStatusNames.push(to);
    this.settings.internalTasks = (this.settings.internalTasks || []).map((item) =>
      item && item.status === from ? Object.assign({}, item, { status: to }) : item
    );
    const prefix = this.settings.statusTagPrefix || "#s/";
    const tagPattern = new RegExp(`${escapeRegExp(prefix)}${escapeRegExp(from)}(?=$|\\s|[，,。；;：:])`, "g");
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.read(file);
      const lines = content.split(/\r?\n/);
      let changed = false;
      const nextLines = lines.map((line) => {
        let next = line.replace(tagPattern, `${prefix}${to}`);
        const metadata = parseTaskMetadata(next);
        if (metadata.status === from) {
          metadata.status = to;
          next = upsertTaskMetadata(next, metadata);
        }
        if (next !== line) changed = true;
        return next;
      });
      if (changed) await this.app.vault.modify(file, nextLines.join("\n"));
    }
    await this.saveSettings();
    new Notice("已重命名状态");
    await this.refreshViews();
    return true;
  }

  async deleteStatus(status, fallback = "待开始") {
    const from = String(status || "").trim();
    const to = String(fallback || "待开始").trim();
    if (!from || from === to) return false;
    this.settings.activeStatusNames = uniq((this.settings.activeStatusNames || DEFAULT_SETTINGS.activeStatusNames).filter((item) => item !== from));
    if (!this.settings.activeStatusNames.includes(to)) this.settings.activeStatusNames.unshift(to);
    this.settings.internalTasks = (this.settings.internalTasks || []).map((item) =>
      item && item.status === from ? Object.assign({}, item, { status: to }) : item
    );
    const prefix = this.settings.statusTagPrefix || "#s/";
    const tagPattern = new RegExp(`${escapeRegExp(prefix)}${escapeRegExp(from)}(?=$|\\s|[，,。；;：:])`, "g");
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.read(file);
      const lines = content.split(/\r?\n/);
      let changed = false;
      const nextLines = lines.map((line) => {
        let next = line.replace(tagPattern, `${prefix}${to}`);
        const metadata = parseTaskMetadata(next);
        if (metadata.status === from) {
          metadata.status = to;
          next = upsertTaskMetadata(next, metadata);
        }
        if (next !== line) changed = true;
        return next;
      });
      if (changed) await this.app.vault.modify(file, nextLines.join("\n"));
    }
    await this.saveSettings();
    new Notice("已删除状态，相关任务已改为待开始");
    await this.refreshViews();
    return true;
  }

  async archiveProject(project) {
    const name = String(project || "").trim();
    if (!name || name === "全部") return;
    this.settings.archivedProjects = uniq([...(this.settings.archivedProjects || []), name]);
    if (this.settings.homeProjectFilter === name) this.settings.homeProjectFilter = "全部";
    await this.saveSettings();
    new Notice("已归档项目");
  }

  async deleteProject(project, options = {}) {
    const name = String(project || "").trim();
    if (!name || name === "全部" || name === "鍏ㄩ儴") return false;
    const mode = options.mode || "remove";
    const target = String(options.target || "").trim();
    if (mode === "move" && (!target || target === name || target === "全部" || target === "鍏ㄩ儴")) {
      new Notice("请选择要移动到的其他项目");
      return false;
    }
    this.settings.defaultProjects = (this.settings.defaultProjects || []).filter((item) => item !== name);
    this.settings.homeProjectOrder = (this.settings.homeProjectOrder || []).filter((item) => item !== name);
    this.settings.archivedProjects = (this.settings.archivedProjects || []).filter((item) => item !== name);
    if (this.settings.homeProjectFilter === name) this.settings.homeProjectFilter = "全部";
    if (this.settings.currentProjectPage === name) this.settings.currentProjectPage = "全部";
    if (mode === "move" && !(this.settings.defaultProjects || []).includes(target)) {
      this.settings.defaultProjects = uniq([...(this.settings.defaultProjects || []), target]);
    }
    this.settings.internalTasks = (this.settings.internalTasks || []).map((item) => {
      if (!item || item.project !== name) return item;
      const next = Object.assign({}, item);
      if (mode === "move") next.project = target;
      else delete next.project;
      return next;
    });

    if (!options.settingsOnly) {
      const prefix = this.settings.projectTagPrefix || "#p/";
      const tagPattern = new RegExp(`${escapeRegExp(prefix)}${escapeRegExp(name)}(?=$|\\s|[,，。;；:：\\]\\)])`, "g");
      const linkPattern = new RegExp(`\\+\\[\\[${escapeRegExp(name)}(?:\\|[^\\]]*)?\\]\\]`, "g");
      const tagReplacement = mode === "move" ? `${prefix}${target}` : "";
      const linkReplacement = mode === "move" ? `+[[${target}]]` : "";
      for (const file of this.app.vault.getMarkdownFiles()) {
        const content = await this.app.vault.read(file);
        let changed = false;
        const lines = content.split(/\r?\n/).map((line) => {
          let next = line;
          const metadata = parseTaskMetadata(next);
          if (metadata && Object.keys(metadata).length && String(metadata.project || "").trim() === name) {
            if (mode === "move") metadata.project = target;
            else delete metadata.project;
            next = upsertTaskMetadata(next, metadata);
          }
          next = next
            .replace(tagPattern, tagReplacement)
            .replace(linkPattern, linkReplacement)
            .replace(/[ \t]{2,}/g, " ")
            .replace(/[ \t]+$/g, "");
          if (next !== line) changed = true;
          return next;
        });
        if (changed) await this.app.vault.modify(file, lines.join("\n"));
      }
    }
    await this.saveSettings();
    new Notice(mode === "move" ? "已移动项目任务" : "已删除项目归属");
    await this.refreshViews();
    return true;
  }

  async restoreProject(project) {
    const name = String(project || "").trim();
    this.settings.archivedProjects = (this.settings.archivedProjects || []).filter((item) => item !== name);
    if (name && !(this.settings.defaultProjects || []).includes(name)) {
      this.settings.defaultProjects = uniq([...(this.settings.defaultProjects || []), name]);
    }
    await this.saveSettings();
    new Notice("已恢复项目");
  }

  async recordOpenedFile(file) {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    const path = file.path;
    const next = [path, ...(this.settings.recentOpenedPaths || []).filter((item) => item !== path)].slice(0, 60);
    this.settings.recentOpenedPaths = next;
    await this.saveData(this.settings);
    this.queueRefreshViews();
  }

  async renameTaskTitle(task, nextTitle) {
    return this.updateStructuredTask(task, {
      title: nextTitle,
      project: task.projects[0] || this.settings.defaultProjects[0] || "",
      due: task.due || "",
      deadline: task.deadline || "",
      hardDeadline: task.hardDeadline || "",
      status: taskStatusText(task) || "待开始",
      progress: task.progress || "",
      priority: task.priority || "",
      parentId: task.parentId || "",
      blockedBy: task.blockedBy || "",
      recordDates: task.recordDates || [],
      completedAt: task.completedAt || "",
      canceledAt: task.canceledAt || "",
      childDraft: "",
    });
  }

  async deleteTask(task) {
    if (!task) return false;
    const title = task.displayText || task.text || "当前任务";
    const parentId = task.parentId || "";
    if (!window.confirm(`删除任务“${title}”？\n\n会删除它所在的任务行，并移除其他任务中指向它的上级/前置关系。`)) return false;
    if (task.internal) {
      const id = task.taskId || "";
      this.settings.internalTasks = (this.settings.internalTasks || []).filter((item) => item && item.id !== id);
      this.settings.internalTaskDeletedAt = this.settings.internalTaskDeletedAt && typeof this.settings.internalTaskDeletedAt === "object" ? this.settings.internalTaskDeletedAt : {};
      if (id) this.settings.internalTaskDeletedAt[id] = new Date().toISOString();
      if (id) await this.removeDeletedTaskReferences(id);
      if (this.settings.currentTaskId === id) this.settings.currentTaskId = "";
      if (this.settings.currentFullTaskId === id) this.settings.currentFullTaskId = "";
      await this.saveData(this.settings);
      const completedParents = await this.autoCompleteParentChainAfterChildRemoval(parentId);
      new Notice("已删除任务");
      if (completedParents.length) new Notice(`已自动完成上级任务 ${completedParents.length} 项`);
      await this.refreshViews();
      return true;
    }
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      new Notice("找不到任务所在笔记");
      return false;
    }
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n/);
    const index = this.resolveTaskLineIndex(file, lines, task);
    if (index < 0 || !lines[index]) {
      new Notice("任务行已变化，请刷新后再试");
      return false;
    }
    lines.splice(index, 1);
    await this.app.vault.modify(file, lines.join("\n"));
    if (task.taskId) await this.removeDeletedTaskReferences(task.taskId, file.path);
    if (this.settings.currentTaskId === task.taskId) this.settings.currentTaskId = "";
    if (this.settings.currentFullTaskId === task.taskId) this.settings.currentFullTaskId = "";
    await this.saveData(this.settings);
    const completedParents = await this.autoCompleteParentChainAfterChildRemoval(parentId);
    new Notice("已删除任务");
    if (completedParents.length) new Notice(`已自动完成上级任务 ${completedParents.length} 项`);
    await this.refreshViews();
    return true;
  }

  async removeDeletedTaskReferences(taskId, deletedPath = "") {
    if (!taskId) return;
    let internalChanged = false;
    this.settings.internalTasks = (this.settings.internalTasks || []).map((item) => {
      if (!item) return item;
      const next = Object.assign({}, item);
      if (next.parent === taskId) {
        delete next.parent;
        internalChanged = true;
      }
      if (next.blocked_by === taskId) {
        delete next.blocked_by;
        internalChanged = true;
      }
      return next;
    });
    if (internalChanged) await this.saveData(this.settings);
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.read(file);
      const lines = content.split(/\r?\n/);
      let changed = false;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const metadata = parseTaskMetadata(line);
        if (!metadata.parent && !metadata.blocked_by) continue;
        let touched = false;
        if (metadata.parent === taskId) {
          delete metadata.parent;
          touched = true;
        }
        if (metadata.blocked_by === taskId) {
          delete metadata.blocked_by;
          touched = true;
        }
        if (!touched) continue;
        lines[index] = line.trim().startsWith("%%wjq-task:") ? hiddenTaskComment(metadata) : upsertTaskMetadata(line, metadata);
        changed = true;
      }
      if (changed || file.path === deletedPath) await this.app.vault.modify(file, lines.join("\n"));
    }
  }

  async deletePathWithConfirm(path, label = "") {
    const target = this.app.vault.getAbstractFileByPath(normalizePath(path || ""));
    if (!target) {
      new Notice("找不到要删除的文件或文件夹");
      return false;
    }
    const name = label || target.name || path;
    if (!window.confirm(`删除“${name}”？\n\n会使用 Obsidian 的删除流程处理这个文件或文件夹。`)) return false;
    if (this.app.vault.trash) await this.app.vault.trash(target, true);
    else await this.app.vault.delete(target);
    this.settings.pinnedPaths = (this.settings.pinnedPaths || []).filter((item) => item !== target.path);
    this.settings.recentOpenedPaths = (this.settings.recentOpenedPaths || []).filter((item) => item !== target.path);
    await this.saveSettings();
    new Notice("已删除");
    await this.refreshViews();
    return true;
  }

  async openQuickEntry(entry) {
    const normalized = normalizeQuickEntry(entry);
    if (!normalized) return;

    if (normalized.type === "annual-diary") {
      await this.openAnnualDiary();
      return;
    }
    if (normalized.type === "home") {
      await this.activateHomeView();
      return;
    }
    if (normalized.type === "command") {
      if (this.app.commands && this.app.commands.executeCommandById) {
        this.app.commands.executeCommandById(normalized.target);
      } else {
        new Notice("当前 Obsidian 版本不支持从插件执行命令");
      }
      return;
    }
    if (normalized.type === "note") {
      await this.openPath(normalized.target, { create: true });
      return;
    }
    if (normalized.type === "folder") {
      await this.openPath(normalized.target, { create: false });
      return;
    }
    new Notice(`未知入口类型：${normalized.type}`);
  }

  getRecentFiles(limit = this.settings.recentLimit || 8) {
    const pinned = new Set(this.settings.pinnedPaths || []);
    const byPath = new Map(this.app.vault.getMarkdownFiles().map((file) => [file.path, file]));
    const opened = (this.settings.recentOpenedPaths || [])
      .map((path) => byPath.get(path))
      .filter(Boolean);
    const fallback = this.app.vault
      .getMarkdownFiles()
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .filter((file) => !opened.some((item) => item.path === file.path));
    return [...opened, ...fallback]
      .slice(0, limit * 5)
      .sort((a, b) => {
        const aPinned = pinned.has(a.path) ? 1 : 0;
        const bPinned = pinned.has(b.path) ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        const aRecent = opened.findIndex((item) => item.path === a.path);
        const bRecent = opened.findIndex((item) => item.path === b.path);
        if (aRecent !== -1 || bRecent !== -1) {
          if (aRecent === -1) return 1;
          if (bRecent === -1) return -1;
          return aRecent - bRecent;
        }
        return b.stat.mtime - a.stat.mtime;
      })
      .slice(0, limit);
  }

  async togglePinnedPath(path) {
    const pinned = new Set(this.settings.pinnedPaths || []);
    if (pinned.has(path)) {
      pinned.delete(path);
      new Notice("已取消固定");
    } else {
      pinned.add(path);
      new Notice("已固定");
    }
    this.settings.pinnedPaths = Array.from(pinned);
    await this.saveSettings();
  }

  scanWorkspaceItems() {
    const files = this.app.vault.getMarkdownFiles();
    return files.map((file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache && cache.frontmatter ? cache.frontmatter : {};
      const title = String(frontmatterValue(frontmatter, ["题目", "title"]) || file.basename || "").trim();
      const author = normalizePropertyList(frontmatterValue(frontmatter, ["作者", "author", "authors"]));
      const source = String(frontmatterValue(frontmatter, ["来源", "source"]) || "").trim();
      const keywords = normalizePropertyList(frontmatterValue(frontmatter, ["关键词", "keywords", "keyword"]));
      const created = String(frontmatterValue(frontmatter, ["创建时间", "created"]) || "").trim();
      const type = String(frontmatterValue(frontmatter, ["类型", "type"]) || "").trim();
      const genre = String(frontmatterValue(frontmatter, ["体裁", "genre"]) || "").trim();
      const status = String(frontmatterValue(frontmatter, ["状态", "status"]) || "").trim();
      const nextAction = String(frontmatterValue(frontmatter, ["下一步", "next-action", "next_action"]) || "").trim();
      const currentStage = String(frontmatterValue(frontmatter, ["阶段", "进度", "current-stage", "current_stage", "progress"]) || "").trim();
      const progressType = String(frontmatterValue(frontmatter, ["进度类型", "progress-type", "progress_type"]) || "").trim();
      const progressCurrent = frontmatterValue(frontmatter, ["当前进度", "progress-current", "progress_current"]);
      const progressTotal = frontmatterValue(frontmatter, ["总进度", "progress-total", "progress_total"]);
      const due = String(frontmatterValue(frontmatter, ["截止日期", "截止", "deadline", "due"]) || "").trim();
      const pinnedValue = frontmatterValue(frontmatter, ["固定", "pinned"]);
      const pinned = pinnedValue === true || pinnedValue === "true" || pinnedValue === "是" || (this.settings.pinnedPaths || []).includes(file.path);

      return {
        file,
        path: file.path,
        title,
        folder: file.parent ? file.parent.path : "",
        author,
        source,
        keywords,
        created,
        type,
        genre,
        status,
        nextAction,
        currentStage,
        progressType,
        progressCurrent,
        progressTotal,
        due,
        pinned,
        mtime: file.stat.mtime,
      };
    });
  }

  progressText(item) {
    if (item.progressCurrent !== "" && item.progressCurrent !== undefined && item.progressTotal !== "" && item.progressTotal !== undefined) {
      return `${item.progressCurrent}/${item.progressTotal}`;
    }
    if (item.currentStage) return item.currentStage;
    if (item.status) return item.status;
    return "";
  }

  activeItems(limit = 8) {
    const activeStatuses = new Set(["进行中", "阅读中", "写作中", "整理中", "修改中", "等待中", "未开始", "暂停"]);
    return this.scanWorkspaceItems()
      .filter((item) => {
        if (item.status === "已完成" || item.status === "已归档" || item.status === "归档") return false;
        return item.pinned || item.nextAction || activeStatuses.has(item.status);
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.mtime - a.mtime;
      })
      .slice(0, limit);
  }

  writingItems(limit = 8) {
    return this.scanWorkspaceItems()
      .filter((item) => {
        const explicit = `${item.type} ${item.genre} ${item.status}`;
        if (/writing|essay|poem|lyrics|novel|draft|写作|散文|随笔|诗歌|歌词|草稿|初稿|修改中|写作中/.test(explicit)) {
          return true;
        }
        if (item.type || item.genre || item.status) return false;
        return /随笔创作|文学创作|写作草稿/.test(item.folder);
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);
  }

  readingItems(limit = 8) {
    return this.scanWorkspaceItems()
      .filter((item) => {
        const explicit = `${item.type} ${item.genre} ${item.status}`;
        if (/book|paper|article|reading|literature|读书|阅读|文献|论文|微信读书|待读|阅读中|需要重读|待整理/.test(explicit)) {
          return true;
        }
        if (item.type || item.genre || item.status) return false;
        return /读书|微信读书|阅读|文献/.test(item.folder);
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);
  }

  getInboxCandidates(limit = 5) {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => /收件箱|待整理|未分类|自动采集|小红书收藏|笔记同步助手|临时|inbox/i.test(file.path))
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, limit);
  }

  parseTaskLine(file, line, lineNumber) {
    const match = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (!match) return null;

    const rawText = match[3].trim();
    const metadata = parseTaskMetadata(rawText);
    const projects = this.extractProjects(rawText);
    if (this.settings.collectOnlyClassifiedTasks && !projects.length && !metadata.id && !metadata.parent) {
      return null;
    }
    const statuses = this.extractStatuses(rawText);
    const due = this.extractDueDate(rawText);
    const status = metadata.status || statuses[0] || "";
    const completed = match[2].toLowerCase() === "x" || !!metadata.completed || !!metadata.completed_at || taskIsCompletedStatus(status);

    return {
      id: metadata.id || `${file.path}:${lineNumber}`,
      taskId: metadata.id || "",
      parentId: metadata.parent || "",
      blockedBy: metadata.blocked_by || "",
      progress: metadata.progress || "",
      priority: metadata.priority || "",
      deadline: metadata.planned_at || metadata.deadline || "",
      plannedAt: metadata.planned_at || metadata.deadline || "",
      hardDeadline: metadata.hard_deadline || metadata.hardDeadline || metadata.cutoff_at || metadata.cutoff || "",
      completedAt: metadata.completed_at || "",
      canceledAt: metadata.canceled_at || "",
      previousStatus: metadata.previous_status || "",
      taskPage: metadata.task_page || "",
      nextStep: metadata.next_step || "",
      note: metadata.note || "",
      materials: metadata.materials || "",
      outputDraft: metadata.output_draft || "",
      recordDates: Array.isArray(metadata.record_dates) ? uniq(metadata.record_dates) : [],
      recordNotes: Array.isArray(metadata.record_notes) ? metadata.record_notes.filter((item) => item && (item.date || item.text)) : [],
      runtimeId: `${file.path}:${lineNumber}`,
      path: file.path,
      basename: file.basename,
      lineNumber,
      indent: match[1] || "",
      rawLine: line,
      text: rawText,
      displayText: this.cleanDisplayText(rawText),
      completed,
      due,
      projects,
      status,
      statuses,
    };
  }

  parseHiddenTaskLine(file, line, lineNumber) {
    if (/^\s*[-*]\s+\[[ xX]\]/.test(line)) return null;
    const metadata = parseTaskMetadata(line);
    if (!metadata || !metadata.text) return null;
    const completed = !!metadata.completed || !!metadata.completed_at;
    const project = String(metadata.project || "").trim();
    const status = metadata.status || "";
    return {
      id: metadata.id || `${file.path}:${lineNumber}`,
      taskId: metadata.id || "",
      parentId: metadata.parent || "",
      blockedBy: metadata.blocked_by || "",
      progress: metadata.progress || "",
      priority: metadata.priority || "",
      deadline: metadata.planned_at || metadata.deadline || "",
      plannedAt: metadata.planned_at || metadata.deadline || "",
      hardDeadline: metadata.hard_deadline || metadata.hardDeadline || metadata.cutoff_at || metadata.cutoff || "",
      completedAt: metadata.completed_at || "",
      canceledAt: metadata.canceled_at || "",
      previousStatus: metadata.previous_status || "",
      taskPage: metadata.task_page || "",
      nextStep: metadata.next_step || "",
      note: metadata.note || "",
      materials: metadata.materials || "",
      outputDraft: metadata.output_draft || "",
      recordDates: Array.isArray(metadata.record_dates) ? uniq(metadata.record_dates) : [],
      recordNotes: Array.isArray(metadata.record_notes) ? metadata.record_notes.filter((item) => item && (item.date || item.text)) : [],
      runtimeId: `${file.path}:${lineNumber}:hidden`,
      path: file.path,
      basename: file.basename,
      lineNumber,
      indent: "",
      rawLine: line,
      text: metadata.text,
      displayText: metadata.text,
      completed,
      due: metadata.due || "",
      projects: project ? [project] : [],
      status,
      statuses: status ? [status] : [],
      hidden: true,
    };
  }

  extractProjects(text) {
    const prefix = this.settings.projectTagPrefix || "#p/";
    const tagRegex = new RegExp(`${escapeRegExp(prefix)}([^\\s#\\[\\]，,。；;：:]+)`, "g");
    const projects = [];
    for (const match of text.matchAll(tagRegex)) {
      projects.push(match[1]);
    }

    const projectLinkRegex = /\+\[\[([^\]]+)\]\]/g;
    for (const match of text.matchAll(projectLinkRegex)) {
      projects.push(match[1].split("|")[0].trim());
    }

    return uniq(projects);
  }

  extractStatuses(text) {
    const prefix = this.settings.statusTagPrefix || "#s/";
    const statusRegex = new RegExp(`${escapeRegExp(prefix)}([^\\s#\\[\\]，,。；;：:]+)`, "g");
    const statuses = [];
    for (const match of text.matchAll(statusRegex)) {
      statuses.push(match[1]);
    }
    return uniq(statuses);
  }

  extractDueDate(text) {
    const patterns = [
      /\uD83D\uDCC5\s*(\d{4}-\d{2}-\d{2})/,
      /\[?due::?\s*(\d{4}-\d{2}-\d{2})\]?/i,
      /\[?截止::?\s*(\d{4}-\d{2}-\d{2})\]?/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return "";
  }

  cleanDisplayText(text) {
    return removeTaskMetadata(text)
      .replace(/\uD83D\uDCC5\s*\d{4}-\d{2}-\d{2}/g, "")
      .replace(/\[?due::?\s*\d{4}-\d{2}-\d{2}\]?/gi, "")
      .replace(/\[?截止::?\s*\d{4}-\d{2}-\d{2}\]?/gi, "")
      .replace(new RegExp(`${escapeRegExp(this.settings.projectTagPrefix)}[^\\s#\\[\\]，,。；;：:]+`, "g"), "")
      .replace(new RegExp(`${escapeRegExp(this.settings.statusTagPrefix)}[^\\s#\\[\\]，,。；;：:]+`, "g"), "")
      .replace(/\+\[\[[^\]]+\]\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  async scanTasks(options = {}) {
    if (!options.force && this.taskScanInFlight) return this.taskScanInFlight;
    const scan = this.scanTasksUncached()
      .catch((error) => {
        this.reportTaskHubError("扫描任务失败", error);
        return [];
      })
      .finally(() => {
        if (this.taskScanInFlight === scan) this.taskScanInFlight = null;
      });
    this.taskScanInFlight = scan;
    return scan;
  }

  async scanTasksUncached() {
    const files = this.app.vault.getMarkdownFiles();
    const standalonePath = normalizePath(this.settings.standaloneTaskFile || DEFAULT_SETTINGS.standaloneTaskFile);
    const tasks = (this.settings.internalTasks || [])
      .map((metadata, index) => this.internalTaskFromMetadata(metadata, index))
      .filter((task) => task.displayText || task.text);

    for (const file of files) {
      if (standalonePath && file.path === standalonePath) continue;
      const content = await this.app.vault.read(file);
      const lines = content.split(/\r?\n/);
      let inFence = false;
      lines.forEach((line, index) => {
        if (/^\s*```/.test(line)) {
          inFence = !inFence;
          return;
        }
        if (inFence) return;
        const task = this.parseTaskLine(file, line, index + 1) || this.parseHiddenTaskLine(file, line, index + 1);
        if (task) tasks.push(task);
      });
    }

    return tasks.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      return `${a.path}:${a.lineNumber}`.localeCompare(`${b.path}:${b.lineNumber}`);
    });
  }

  formatTaskLine(title, project, due, status, options = {}) {
    const parts = [`- [ ] ${title.trim()}`];
    if (project && project.trim()) {
      parts.push(`${this.settings.projectTagPrefix}${project.trim()}`);
    }
    if (status && status.trim()) {
      parts.push(`${this.settings.statusTagPrefix}${status.trim()}`);
    }
    if (due && due.trim()) {
      parts.push(`\uD83D\uDCC5 ${due.trim()}`);
    }
    const metadata = {};
    if (options.id) metadata.id = options.id;
    if (options.parentId || options.parent) metadata.parent = options.parentId || options.parent;
    if (options.progress) metadata.progress = String(options.progress).trim();
    if (options.priority) metadata.priority = String(options.priority).trim();
    if (options.blockedBy || options.blocked_by) metadata.blocked_by = String(options.blockedBy || options.blocked_by).trim();
    if (options.deadline || options.plannedAt || options.planned_at) metadata.planned_at = String(options.deadline || options.plannedAt || options.planned_at).trim();
    if (options.hardDeadline || options.hard_deadline) metadata.hard_deadline = String(options.hardDeadline || options.hard_deadline).trim();
    if (options.completedAt || options.completed_at) metadata.completed_at = String(options.completedAt || options.completed_at).trim();
    if (options.canceledAt || options.canceled_at) metadata.canceled_at = String(options.canceledAt || options.canceled_at).trim();
    if (options.previousStatus || options.previous_status) metadata.previous_status = String(options.previousStatus || options.previous_status).trim();
    if (options.note) metadata.note = String(options.note).trim();
    if (options.materials) metadata.materials = String(options.materials).trim();
    if (options.nextStep || options.next_step) metadata.next_step = String(options.nextStep || options.next_step).trim();
    if (options.outputDraft || options.output_draft) metadata.output_draft = String(options.outputDraft || options.output_draft).trim();
    if (Array.isArray(options.recordDates) && options.recordDates.length) metadata.record_dates = uniq(options.recordDates);
    if (Array.isArray(options.record_dates) && options.record_dates.length) metadata.record_dates = uniq(options.record_dates);
    if (Array.isArray(options.recordNotes) && options.recordNotes.length) metadata.record_notes = options.recordNotes;
    if (Array.isArray(options.record_notes) && options.record_notes.length) metadata.record_notes = options.record_notes;
    const line = parts.join(" ");
    return Object.keys(metadata).length ? upsertTaskMetadata(line, metadata) : line;
  }

  async ensureFolderForFile(path) {
    const normalized = normalizePath(path);
    const parts = normalized.split("/");
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  async appendStandaloneTask(title, project, due, status, options = {}) {
    const line = this.formatTaskLine(title, project, due, status, options);
    const metadata = parseTaskMetadata(line);
    await this.createInternalTaskFromData(Object.assign({}, metadata, { title, project, due, status }));
    new Notice("已创建单独任务");
    await this.refreshViews();
  }

  async insertTaskInCurrentNote(title, project, due, status, options = {}) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.editor) {
      await this.appendStandaloneTask(title, project, due, status, options);
      return;
    }
    const line = this.formatTaskLine(title, project, due, status, options);
    view.editor.replaceSelection(`${line}\n`);
    new Notice("已插入当前笔记");
    await this.refreshViews();
  }

  async createStructuredTask(mode, data) {
    const title = (data.title || "").trim();
    data.due = normalizeDateInput(data.due);
    data.deadline = normalizeDateInput(data.deadline);
    data.hardDeadline = normalizeDateInput(data.hardDeadline || data.hard_deadline || "");
    data.completedAt = normalizeDateInput(data.completedAt || data.completed_at || "");
    if (!title) {
      new Notice("先写任务内容");
      return false;
    }
    if (data.due && !/^\d{4}-\d{2}-\d{2}$/.test(data.due)) {
      new Notice("开始日期格式应为 YYYY-MM-DD");
      return false;
    }
    if (data.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(data.deadline)) {
      new Notice("计划完成格式应为 YYYY-MM-DD");
      return false;
    }
    if (data.hardDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(data.hardDeadline)) {
      new Notice("截止日期格式应为 YYYY-MM-DD");
      return false;
    }
    if (data.due && data.deadline && data.deadline < data.due) {
      new Notice("计划完成不能早于开始日期");
      return false;
    }
    if (data.completedAt && !/^\d{4}-\d{2}-\d{2}$/.test(data.completedAt)) {
      new Notice("实际完成格式应为 YYYY-MM-DD");
      return false;
    }
    if (data.completedAt && !data.due) data.due = data.completedAt;
    data.status = scheduledTaskStatus(data.status, data.due, data.completedAt);

    let parentId = data.parentId || "";
    if (data.parentTask) {
      parentId = await this.ensureTaskId(data.parentTask);
    }

    const childTitles = String(data.childDraft || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const taskId = childTitles.length ? generateTaskId() : data.id || "";
    const options = {
      id: taskId,
      parentId,
      progress: data.progress,
      priority: data.priority,
      blockedBy: data.blockedBy,
      deadline: data.deadline,
      hardDeadline: data.hardDeadline,
      completedAt: data.completedAt,
      note: data.note,
      materials: data.materials,
      nextStep: data.nextStep,
      outputDraft: data.outputDraft,
    };

    if (mode === "insert") {
      const lines = [
        this.formatTaskLine(title, data.project, data.due, data.status, options),
        ...childTitles.map((child) =>
          this.formatTaskLine(child, data.project, "", "待开始", { parentId: taskId || data.parentId || "" })
        ),
      ];
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.editor) {
        view.editor.replaceSelection(`${lines.join("\n")}\n`);
        new Notice("已插入当前笔记");
        if (parentId) await this.reopenParentChainForOpenChild(parentId);
        await this.refreshViews();
        return true;
      }
    }

    const saved = await this.createInternalTaskFromData(Object.assign({}, data, {
      id: taskId || data.id || generateTaskId(),
      title,
      parentId,
      blockedBy: data.blockedBy,
    }));
    if (!saved) return false;
    const savedId = saved.id;
    for (const child of childTitles) {
      await this.createInternalTaskFromData({
        title: child,
        project: data.project,
        status: "待开始",
        parentId: savedId,
      });
    }
    new Notice("已创建任务");
    if (parentId) await this.reopenParentChainForOpenChild(parentId);
    if (childTitles.length && savedId) await this.reopenParentChainForOpenChild(savedId);
    await this.refreshViews();
    return true;
  }

  async updateStructuredTask(task, data) {
    const title = (data.title || "").trim();
    data.due = normalizeDateInput(data.due);
    data.deadline = normalizeDateInput(data.deadline);
    data.hardDeadline = normalizeDateInput(data.hardDeadline || data.hard_deadline || "");
    data.completedAt = normalizeDateInput(data.completedAt || data.completed_at || "");
    if (!title) {
      new Notice("先写任务内容");
      return false;
    }
    if (data.due && !/^\d{4}-\d{2}-\d{2}$/.test(data.due)) {
      new Notice("开始日期格式应为 YYYY-MM-DD");
      return false;
    }
    if (data.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(data.deadline)) {
      new Notice("计划完成格式应为 YYYY-MM-DD");
      return false;
    }
    if (data.hardDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(data.hardDeadline)) {
      new Notice("截止日期格式应为 YYYY-MM-DD");
      return false;
    }
    if (data.due && data.deadline && data.deadline < data.due) {
      new Notice("计划完成不能早于开始日期");
      return false;
    }
    if (data.completedAt && !/^\d{4}-\d{2}-\d{2}$/.test(data.completedAt)) {
      new Notice("实际完成格式应为 YYYY-MM-DD");
      return false;
    }
    if (data.completedAt && !data.due) data.due = data.completedAt;
    if (taskIsCompletedStatus(data.status) && !data.completedAt) data.completedAt = localDateString();
    data.status = scheduledTaskStatus(data.status, data.due, data.completedAt);
    if (data.completedAt && !data.due) data.due = data.completedAt;

    if (task.internal) {
      let parentId = data.parentId || "";
      if (data.parentTask) parentId = await this.ensureTaskId(data.parentTask);
      const childTitles = String(data.childDraft || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
      const taskId = task.taskId || "";
      if (parentId && taskId && this.wouldCreateCycle(taskId, parentId, await this.scanTasks())) {
        new Notice("不能这样设置，会形成循环关系");
        return false;
      }
      const updated = await this.updateInternalTaskMetadata(task, (metadata) => {
        metadata.text = title;
        metadata.project = data.project || "";
        metadata.status = data.status || "";
        metadata.due = data.due || "";
        metadata.planned_at = data.deadline || "";
        if (data.hardDeadline) metadata.hard_deadline = data.hardDeadline;
        else delete metadata.hard_deadline;
        metadata.progress = data.progress || "";
        metadata.priority = data.priority || "";
        if (parentId) metadata.parent = parentId;
        else delete metadata.parent;
        if (data.blockedBy) metadata.blocked_by = data.blockedBy;
        else delete metadata.blocked_by;
        if (data.completedAt) metadata.completed_at = data.completedAt;
        else delete metadata.completed_at;
        const completedByData = !!data.completedAt || taskIsCompletedStatus(data.status);
        metadata.completed = completedByData;
        if (completedByData && !task.completed && !metadata.previous_status) metadata.previous_status = task.status || "待开始";
        if (!completedByData) delete metadata.previous_status;
        if (data.canceledAt) metadata.canceled_at = data.canceledAt;
        else delete metadata.canceled_at;
        if (Array.isArray(data.recordDates)) metadata.record_dates = uniq(data.recordDates);
        else if (data.recordDates === "") delete metadata.record_dates;
        if (data.note !== undefined) metadata.note = String(data.note || "").trim();
        if (data.materials !== undefined) metadata.materials = String(data.materials || "").trim();
        if (data.nextStep !== undefined) metadata.next_step = String(data.nextStep || "").trim();
        if (data.outputDraft !== undefined) metadata.output_draft = String(data.outputDraft || "").trim();
        return metadata;
      });
      for (const child of childTitles) {
        await this.createInternalTaskFromData({
          title: child,
          project: data.project,
          status: "待开始",
          parentId: updated ? updated.id : taskId,
        });
      }
      new Notice("已更新任务");
      if (parentId) await this.reopenParentChainForOpenChild(parentId);
      if (childTitles.length && (updated && updated.id)) await this.reopenParentChainForOpenChild(updated.id);
      await this.refreshViews();
      if (updated && updated.completed) await this.autoCompleteParentChainForTaskId(updated.id);
      return true;
    }

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      new Notice("找不到任务所在笔记");
      return false;
    }

    let parentId = data.parentId || "";
    if (data.parentTask) parentId = await this.ensureTaskId(data.parentTask);
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n/);
    const index = this.resolveTaskLineIndex(file, lines, task);
    if (index < 0 || !lines[index]) {
      new Notice("任务行已变化，请刷新后再试");
      return false;
    }

    if (task.hidden) {
      const metadata = parseTaskMetadata(lines[index]);
      metadata.id = metadata.id || task.taskId || generateTaskId();
      metadata.text = title;
      metadata.project = data.project || "";
      metadata.status = data.status || "";
      metadata.due = normalizeDateInput(data.due);
      metadata.planned_at = normalizeDateInput(data.deadline);
      delete metadata.deadline;
      if (data.hardDeadline) metadata.hard_deadline = data.hardDeadline;
      else delete metadata.hard_deadline;
      metadata.progress = data.progress || "";
      metadata.priority = data.priority || "";
      if (parentId) metadata.parent = parentId;
      else delete metadata.parent;
      if (data.blockedBy) metadata.blocked_by = data.blockedBy;
      else delete metadata.blocked_by;
      if (data.completedAt) metadata.completed_at = data.completedAt;
      else if (data.completedAt === "") delete metadata.completed_at;
      const hiddenCompletedByData = !!metadata.completed_at || taskIsCompletedStatus(metadata.status);
      if (hiddenCompletedByData && !task.completed && !metadata.previous_status) metadata.previous_status = task.status || "待开始";
      if (!hiddenCompletedByData) delete metadata.previous_status;
      metadata.completed = hiddenCompletedByData;
      if (data.canceledAt) metadata.canceled_at = data.canceledAt;
      else if (data.canceledAt === "") delete metadata.canceled_at;
      if (Array.isArray(data.recordDates)) metadata.record_dates = uniq(data.recordDates);
      if (data.note !== undefined) metadata.note = String(data.note || "").trim();
      if (data.materials !== undefined) metadata.materials = String(data.materials || "").trim();
      if (data.nextStep !== undefined) metadata.next_step = String(data.nextStep || "").trim();
      if (data.outputDraft !== undefined) metadata.output_draft = String(data.outputDraft || "").trim();
      lines[index] = hiddenTaskComment(metadata);
      await this.app.vault.modify(file, lines.join("\n"));
      new Notice("已更新任务");
      if (parentId) await this.reopenParentChainForOpenChild(parentId);
      await this.refreshViews();
      if (hiddenCompletedByData && metadata.id) await this.autoCompleteParentChainForTaskId(metadata.id);
      return true;
    }

    const childTitles = String(data.childDraft || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const metadata = parseTaskMetadata(lines[index]);
    if (parentId || childTitles.length) {
      if (!metadata.id) metadata.id = task.taskId || generateTaskId();
      if (parentId && this.wouldCreateCycle(metadata.id, parentId, await this.scanTasks())) {
        new Notice("不能这样设置，会形成循环关系");
        return false;
      }
    }
    if (parentId) metadata.parent = parentId;
    else delete metadata.parent;
    if (data.progress) metadata.progress = data.progress;
    else delete metadata.progress;
    if (data.priority) metadata.priority = data.priority;
    else delete metadata.priority;
    if (data.blockedBy) metadata.blocked_by = data.blockedBy;
    else delete metadata.blocked_by;
    const completedByData = !!data.completedAt || taskIsCompletedStatus(data.status);
    if (data.deadline) metadata.planned_at = data.deadline;
    else delete metadata.planned_at;
    delete metadata.deadline;
    if (data.hardDeadline) metadata.hard_deadline = data.hardDeadline;
    else delete metadata.hard_deadline;
    if (data.completedAt) metadata.completed_at = data.completedAt;
    else if (data.completedAt === "") delete metadata.completed_at;
    if (completedByData && !task.completed && !metadata.previous_status) metadata.previous_status = task.status || "待开始";
    if (!completedByData) delete metadata.previous_status;
    metadata.completed = completedByData;
    if (data.canceledAt) metadata.canceled_at = data.canceledAt;
    else if (data.canceledAt === "") delete metadata.canceled_at;
    if (Array.isArray(data.recordDates)) metadata.record_dates = uniq(data.recordDates);
    else if (data.recordDates === "") delete metadata.record_dates;
    if (data.note !== undefined) metadata.note = String(data.note || "").trim();
    if (data.materials !== undefined) metadata.materials = String(data.materials || "").trim();
    if (data.nextStep !== undefined) metadata.next_step = String(data.nextStep || "").trim();
    if (data.outputDraft !== undefined) metadata.output_draft = String(data.outputDraft || "").trim();

    const prefix = (lines[index].match(/^(\s*[-*]\s+\[)[ xX](\]\s+)/) || ["", `${task.indent || ""}- [`, `] `]);
    const checkboxPrefix = `${prefix[1]}${completedByData ? "x" : " "}${prefix[2]}`;
    const formatted = this.formatTaskLine(title, data.project, data.due, data.status, metadata).replace(/^- \[ \]\s+/, checkboxPrefix);
    const childLines = childTitles.map((child) => `${task.indent || ""}  ${this.formatTaskLine(child, data.project, "", "待开始", { parentId: metadata.id })}`);
    lines.splice(index, 1, formatted, ...childLines);
    await this.app.vault.modify(file, lines.join("\n"));
    new Notice("已更新任务");
    if (parentId) await this.reopenParentChainForOpenChild(parentId);
    if (childTitles.length && metadata.id) await this.reopenParentChainForOpenChild(metadata.id);
    await this.refreshViews();
    if (completedByData && metadata.id) await this.autoCompleteParentChainForTaskId(metadata.id);
    return true;
  }

  async toggleTask(task, completed, options = {}) {
    const completedDate = completed ? (normalizeDateInput(options.completedAt || options.completedDate || "") || localDateString()) : "";
    if (completedDate && !/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) {
      new Notice("实际完成日期格式应为 YYYY-MM-DD");
      return [];
    }
    if (task && task.internal) {
      const metadata = await this.updateInternalTaskMetadata(task, (current) => {
        current.id = current.id || task.taskId || generateTaskId();
        current.text = current.text || task.displayText || task.text;
        current.project = current.project || task.projects[0] || "";
        if (completed) {
          if (!current.previous_status) current.previous_status = task.status || "待开始";
          if (!current.due && !task.due) current.due = completedDate;
          current.completed = true;
          current.completed_at = completedDate;
          current.status = "已完成";
          delete current.canceled_at;
        } else {
          current.completed = false;
          delete current.completed_at;
          current.status = current.previous_status || task.previousStatus || "待开始";
          delete current.previous_status;
        }
        return current;
      });
      await this.refreshViews();
      if (completed && options.autoCompleteParents !== false) return await this.autoCompleteParentChainForTaskId(metadata ? metadata.id : task.taskId || "", completedDate);
      return [];
    }

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      new Notice("找不到任务所在笔记");
      return;
    }

    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n/);
    const index = this.resolveTaskLineIndex(file, lines, task);
    if (index < 0 || !lines[index]) {
      new Notice("任务行已变化，请刷新后再试");
      return;
    }

    if (task.hidden) {
      const metadata = parseTaskMetadata(lines[index]);
      metadata.id = metadata.id || task.taskId || generateTaskId();
      metadata.text = metadata.text || task.displayText || task.text;
      metadata.project = metadata.project || task.projects[0] || "";
      if (completed) {
        if (!metadata.previous_status) metadata.previous_status = task.status || "待开始";
        if (!metadata.due && !task.due) metadata.due = completedDate;
        metadata.completed = true;
        metadata.completed_at = completedDate;
        metadata.status = "已完成";
        delete metadata.canceled_at;
      } else {
        metadata.completed = false;
        delete metadata.completed_at;
        metadata.status = metadata.previous_status || task.previousStatus || "待开始";
        delete metadata.previous_status;
      }
      lines[index] = hiddenTaskComment(metadata);
      await this.app.vault.modify(file, lines.join("\n"));
      await this.refreshViews();
      if (completed && options.autoCompleteParents !== false) return await this.autoCompleteParentChainForTaskId(metadata.id || task.taskId || "", completedDate);
      return [];
    }

    let nextLine = lines[index].replace(
      /^(\s*[-*]\s+\[)[ xX](\]\s+)/,
      `$1${completed ? "x" : " "}$2`
    );
    const metadata = parseTaskMetadata(nextLine);
    if (completed) {
      if (!metadata.id) metadata.id = task.taskId || generateTaskId();
      if (!metadata.previous_status) {
        metadata.previous_status = task.status || (task.statuses && task.statuses[0]) || "待开始";
      }
      metadata.completed_at = completedDate;
      metadata.completed = true;
      delete metadata.canceled_at;
      nextLine = replaceStatusTag(nextLine, this.settings.statusTagPrefix || "#s/", "已完成");
      if (!task.due) {
        nextLine = insertBeforeMetadata(removeDueDate(nextLine), `\uD83D\uDCC5 ${completedDate}`);
      }
    } else {
      delete metadata.completed_at;
      metadata.completed = false;
      const restoredStatus = metadata.previous_status || task.previousStatus || "待开始";
      delete metadata.previous_status;
      nextLine = replaceStatusTag(nextLine, this.settings.statusTagPrefix || "#s/", restoredStatus);
    }
    nextLine = upsertTaskMetadata(nextLine, metadata);
    lines[index] = nextLine;
    await this.app.vault.modify(file, lines.join("\n"));
    await this.refreshViews();
    if (completed && options.autoCompleteParents !== false) return await this.autoCompleteParentChainForTaskId(metadata.id || task.taskId || "", completedDate);
    return [];
  }

  async setTaskStatus(task, status, options = {}) {
    const nextDue = options.due !== undefined ? normalizeDateInput(options.due) : options.setTodayIfNoDue && !task.due ? localDateString() : task.due || "";
    const nextCompletedAt = options.completedAt !== undefined ? normalizeDateInput(options.completedAt) : task.completedAt || "";
    await this.updateStructuredTask(task, {
      title: task.displayText || task.text,
      project: task.projects[0] || this.settings.defaultProjects[0] || "",
      due: nextDue,
      deadline: task.deadline || "",
      hardDeadline: task.hardDeadline || "",
      status,
      progress: task.progress || "",
      priority: task.priority || "",
      parentId: task.parentId || "",
      blockedBy: task.blockedBy || "",
      recordDates: task.recordDates || [],
      completedAt: taskIsCompletedStatus(status) ? (nextCompletedAt || localDateString()) : nextCompletedAt,
      canceledAt: "",
      childDraft: "",
    });
  }

  async startTask(task) {
    await this.setTaskStatus(task, "进行中", { setTodayIfNoDue: true });
    new Notice("已开始任务");
  }

  async completeTask(task, completedAt = "") {
    const cleanCompletedAt = normalizeDateInput(completedAt || "");
    if (cleanCompletedAt && !/^\d{4}-\d{2}-\d{2}$/.test(cleanCompletedAt)) {
      new Notice("实际完成日期格式应为 YYYY-MM-DD");
      return;
    }
    const taskId = await this.ensureTaskId(task);
    if (taskId && !task.taskId) task.taskId = taskId;
    const autoCompleted = await this.toggleTask(task, true, { completedAt: cleanCompletedAt });
    new Notice(cleanCompletedAt ? `已按 ${cleanCompletedAt} 完成任务` : "已完成任务");
    if (autoCompleted && autoCompleted.length) new Notice(`已自动完成上级任务 ${autoCompleted.length} 项`);
    await this.showCompletionFollowup(taskId);
  }

  async completeTaskOnDate(task, date) {
    return this.completeTask(task, date);
  }

  async cancelTask(task) {
    await this.updateStructuredTask(task, {
      title: task.displayText || task.text,
      project: task.projects[0] || this.settings.defaultProjects[0] || "",
      due: task.due || "",
      deadline: task.deadline || "",
      hardDeadline: task.hardDeadline || "",
      status: "已取消",
      progress: task.progress || "",
      priority: task.priority || "",
      parentId: task.parentId || "",
      blockedBy: task.blockedBy || "",
      recordDates: task.recordDates || [],
      completedAt: "",
      canceledAt: localDateString(),
      childDraft: "",
    });
    new Notice("已取消任务");
  }

  async addRecordDate(task, date = localDateString()) {
    const cleanDate = String(date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      new Notice("记录日期格式应为 YYYY-MM-DD");
      return;
    }
    await this.ensureTaskId(task);
    await this.updateTaskMetadata(task, (metadata) => {
      metadata.record_dates = uniq([...(Array.isArray(metadata.record_dates) ? metadata.record_dates : []), cleanDate]).sort();
      const notes = Array.isArray(metadata.record_notes) ? metadata.record_notes : [];
      metadata.record_notes = [...notes, this.buildProgressRecord(task, cleanDate, "")];
      return metadata;
    });
    new Notice("已添加推进记录日期");
    await this.refreshViews();
  }

  buildProgressRecord(task, date, text = "", existing = {}, associatedTask = null) {
    const linkedTask = associatedTask || ((existing.task_id || existing.taskId) ? null : task);
    return {
      id: existing.id || generateTaskId(),
      date,
      text: String(text || "").trim(),
      task_id: linkedTask ? linkedTask.taskId || "" : existing.task_id || existing.taskId || "",
      task_title: linkedTask ? linkedTask.displayText || linkedTask.text || "" : existing.task_title || existing.taskTitle || "",
      project: linkedTask ? (linkedTask.projects && linkedTask.projects[0] ? linkedTask.projects[0] : "") : existing.project || "",
    };
  }

  async addProgressRecord(task, date = localDateString(), text = "", options = {}) {
    const cleanDate = normalizeDateInput(date || localDateString());
    const cleanText = String(text || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      new Notice("记录日期格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }
    await this.ensureTaskId(task);
    const associatedTask = options.associatedTask || task;
    if (associatedTask) await this.ensureTaskId(associatedTask);
    await this.updateTaskMetadata(task, (metadata) => {
      metadata.record_dates = uniq([...(Array.isArray(metadata.record_dates) ? metadata.record_dates : []), cleanDate]).sort();
      const notes = Array.isArray(metadata.record_notes) ? metadata.record_notes : [];
      metadata.record_notes = [...notes, this.buildProgressRecord(task, cleanDate, cleanText, {}, associatedTask)];
      return metadata;
    });
    new Notice(cleanText ? "已记录一次推进" : "已添加推进记录日期");
    await this.refreshViews();
    return true;
  }

  recordMatches(target, record, index, currentIndex) {
    if (!target) return false;
    if (target.id && record.id) return target.id === record.id;
    return index === currentIndex
      && String(target.date || "") === String(record.date || "")
      && String(target.text || "") === String(record.text || "");
  }

  async updateProgressRecord(task, target, index, data = {}) {
    const cleanDate = normalizeDateInput(data.date || target.date || localDateString());
    const cleanText = String(data.text || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      new Notice("记录日期格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }
    await this.ensureTaskId(task);
    const associatedTask = data.associatedTask || null;
    if (associatedTask) await this.ensureTaskId(associatedTask);
    await this.updateTaskMetadata(task, (metadata) => {
      let notes = Array.isArray(metadata.record_notes) ? metadata.record_notes.slice() : [];
      if (!notes.length && Array.isArray(metadata.record_dates)) {
        notes = metadata.record_dates.map((date) => this.buildProgressRecord(task, date, ""));
      }
      let changed = false;
      notes = notes.map((record, currentIndex) => {
        if (!this.recordMatches(target, record, index, currentIndex)) return record;
        changed = true;
        return this.buildProgressRecord(task, cleanDate, cleanText, record, associatedTask);
      });
      if (!changed) notes.push(this.buildProgressRecord(task, cleanDate, cleanText, target || {}, associatedTask));
      metadata.record_notes = notes;
      metadata.record_dates = uniq(notes.map((record) => record.date).filter(Boolean)).sort();
      return metadata;
    });
    new Notice("已修改推进记录");
    await this.refreshViews();
    return true;
  }

  async deleteProgressRecord(task, target, index) {
    if (!window.confirm("删除这条推进记录？")) return false;
    await this.ensureTaskId(task);
    await this.updateTaskMetadata(task, (metadata) => {
      let notes = Array.isArray(metadata.record_notes) ? metadata.record_notes.slice() : [];
      if (!notes.length && Array.isArray(metadata.record_dates)) {
        notes = metadata.record_dates.map((date) => this.buildProgressRecord(task, date, ""));
      }
      notes = notes.filter((record, currentIndex) => !this.recordMatches(target, record, index, currentIndex));
      metadata.record_notes = notes;
      metadata.record_dates = uniq(notes.map((record) => record.date).filter(Boolean)).sort();
      return metadata;
    });
    new Notice("已删除推进记录");
    await this.refreshViews();
    return true;
  }

  async updateTaskWorkspaceFields(task, fields = {}, options = {}) {
    await this.ensureTaskId(task);
    await this.updateTaskMetadata(task, (metadata) => {
      if (fields.nextStep !== undefined) metadata.next_step = String(fields.nextStep || "").trim();
      if (fields.note !== undefined) metadata.note = String(fields.note || "").trim();
      if (fields.materials !== undefined) metadata.materials = String(fields.materials || "").trim();
      if (fields.outputDraft !== undefined) metadata.output_draft = String(fields.outputDraft || "").trim();
      return metadata;
    });
    if (!options.silent) {
      new Notice("已保存任务页面内容");
      await this.refreshViews();
    }
    return true;
  }

  materialLinkForPath(path) {
    const normalized = normalizePath(String(path || "").replace(/\\/g, "/"));
    if (!normalized) return "";
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (file instanceof TFile && file.extension === "md") return `[[${file.basename}]]`;
    return normalized;
  }

  resolveMaterialNotePath(target) {
    const raw = String(target || "").trim();
    if (!raw || /^https?:\/\//i.test(raw)) return "";
    const wiki = raw.match(/^\[\[([^\]]+)\]\]$/);
    const clean = (wiki ? wiki[1] : raw)
      .split("|")[0]
      .trim()
      .replace(/\\/g, "/");
    if (!clean) return "";
    const candidates = uniq([
      normalizePath(clean),
      normalizePath(clean.endsWith(".md") ? clean : `${clean}.md`),
    ]);
    for (const candidate of candidates) {
      const direct = this.app.vault.getAbstractFileByPath(candidate);
      if (direct instanceof TFile && direct.extension === "md") return direct.path;
    }
    const byName = this.app.vault.getMarkdownFiles().find((file) =>
      file.basename === clean ||
      file.path === clean ||
      file.path === `${clean}.md`
    );
    return byName ? byName.path : "";
  }

  materialNotePathsFromText(value) {
    const paths = [];
    const lines = String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      const wikiMatches = Array.from(line.matchAll(/\[\[([^\]]+)\]\]/g))
        .map((match) => match[1].split("|")[0].trim())
        .filter(Boolean);
      if (wikiMatches.length) {
        for (const target of wikiMatches) {
          const path = this.resolveMaterialNotePath(target);
          if (path) paths.push(path);
        }
        continue;
      }
      const path = this.resolveMaterialNotePath(line);
      if (path) paths.push(path);
    }
    return uniq(paths);
  }

  firstMaterialNotePath(task) {
    const paths = this.materialNotePathsFromText(task && task.materials);
    return paths[0] || "";
  }

  taskPropertyEntry(task) {
    if (!task) return "";
    const id = task.taskId || "";
    const title = task.displayText || task.text || "";
    return id && title ? `${title} | ${id}` : (id || title);
  }

  normalizePropertyArray(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    const text = String(value || "").trim();
    if (!text) return [];
    return text.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  }

  async linkTaskToNoteProperty(task, path, options = {}) {
    const normalized = normalizePath(String(path || "").replace(/\\/g, "/"));
    const file = normalized ? this.app.vault.getAbstractFileByPath(normalized) : null;
    if (!(file instanceof TFile) || file.extension !== "md" || !task) return false;
    await this.ensureTaskId(task);
    const entry = this.taskPropertyEntry(task);
    if (!entry) return false;
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const current = this.normalizePropertyArray(frontmatter["关联任务"]);
      if (!current.includes(entry)) current.unshift(entry);
      const reordered = { "关联任务": current };
      for (const [key, value] of Object.entries(frontmatter)) {
        if (key !== "关联任务") reordered[key] = value;
      }
      for (const key of Object.keys(frontmatter)) delete frontmatter[key];
      Object.assign(frontmatter, reordered);
    });
    if (!options.silent) new Notice("已写入笔记属性：关联任务");
    return true;
  }

  async addMaterialToTask(task, path, options = {}) {
    const material = this.materialLinkForPath(path);
    if (!task || !material) return false;
    await this.ensureTaskId(task);
    await this.updateTaskMetadata(task, (metadata) => {
      const current = String(metadata.materials || "").trim();
      const lines = current ? current.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
      if (!lines.includes(material)) lines.push(material);
      metadata.materials = lines.join("\n");
      return metadata;
    });
    if (!options.silent) new Notice("已加入任务相关材料");
    // 关联信息只保存在任务数据中；仅在明确要求时才改写笔记属性。
    if (options.syncNoteProperty === true) await this.linkTaskToNoteProperty(task, path, { silent: true });
    if (!options.skipRefresh) await this.refreshViews();
    return true;
  }

  async addProjectProgressRecord(project, date = localDateString(), text = "", options = {}) {
    const cleanProject = String(project || "全部").trim() || "全部";
    const cleanDate = normalizeDateInput(date || localDateString());
    const cleanText = String(text || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      new Notice("记录日期格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }
    if (!cleanText) {
      new Notice("请写一句推进说明");
      return false;
    }
    const associatedTask = options.associatedTask || null;
    if (associatedTask) await this.ensureTaskId(associatedTask);
    const records = Object.assign({}, this.settings.projectRecords || {});
    const list = Array.isArray(records[cleanProject]) ? records[cleanProject].slice() : [];
    list.push({
      id: generateTaskId(),
      date: cleanDate,
      text: cleanText,
      project: cleanProject,
      task_id: associatedTask ? associatedTask.taskId || "" : "",
      task_title: associatedTask ? associatedTask.displayText || associatedTask.text || "" : "",
    });
    records[cleanProject] = list.slice(-200);
    this.settings.projectRecords = records;
    await this.saveSettings();
    new Notice("已记录项目推进");
    return true;
  }

  async updateProjectProgressRecord(project, target, index, data = {}) {
    const cleanProject = String(project || "全部").trim() || "全部";
    const cleanDate = normalizeDateInput(data.date || target.date || localDateString());
    const cleanText = String(data.text || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      new Notice("记录日期格式应为 YYYY-MM-DD，或只填日期数字");
      return false;
    }
    if (!cleanText) {
      new Notice("请写一句推进说明");
      return false;
    }
    const records = Object.assign({}, this.settings.projectRecords || {});
    const list = Array.isArray(records[cleanProject]) ? records[cleanProject].slice() : [];
    const associatedTask = data.associatedTask || null;
    if (associatedTask) await this.ensureTaskId(associatedTask);
    records[cleanProject] = list.map((record, currentIndex) => {
      const same = target && target.id && record.id ? target.id === record.id : currentIndex === index;
      return same ? {
        id: record.id || generateTaskId(),
        date: cleanDate,
        text: cleanText,
        project: cleanProject,
        task_id: associatedTask ? associatedTask.taskId || "" : record.task_id || record.taskId || "",
        task_title: associatedTask ? associatedTask.displayText || associatedTask.text || "" : record.task_title || record.taskTitle || "",
      } : record;
    });
    this.settings.projectRecords = records;
    await this.saveSettings();
    new Notice("已修改项目推进记录");
    await this.refreshViews();
    return true;
  }

  async deleteProjectProgressRecord(project, target, index) {
    if (!window.confirm("删除这条项目推进记录？")) return false;
    const cleanProject = String(project || "全部").trim() || "全部";
    const records = Object.assign({}, this.settings.projectRecords || {});
    const list = Array.isArray(records[cleanProject]) ? records[cleanProject].slice() : [];
    records[cleanProject] = list.filter((record, currentIndex) => {
      if (target && target.id && record.id) return target.id !== record.id;
      return currentIndex !== index;
    });
    this.settings.projectRecords = records;
    await this.saveSettings();
    new Notice("已删除项目推进记录");
    await this.refreshViews();
    return true;
  }

  async showCompletionFollowup(taskId) {
    if (!taskId) return;
    const tasks = await this.scanTasks();
    const completed = tasks.find((task) => task.taskId === taskId);
    if (!completed) return;

    let parentTask = null;
    if (completed.parentId) {
      const siblings = tasks.filter((task) => task.parentId === completed.parentId);
      const allDone = siblings.length > 0 && siblings.every((task) => task.completed);
      parentTask = allDone ? tasks.find((task) => task.taskId === completed.parentId && !task.completed) : null;
    }

    const nextTasks = tasks.filter((task) => task.blockedBy === taskId && !task.completed);
    if (parentTask || nextTasks.length) {
      new CompletionFollowupModal(this, completed, parentTask, nextTasks).open();
    }
  }

  taskIsDoneForParent(task) {
    return !!task && (task.completed || /完成|取消|归档/.test(taskStatusText(task)));
  }

  latestCompletionDate(tasks = []) {
    return (tasks || [])
      .map((task) => normalizeDateInput((task && (task.completedAt || task.completed_at)) || ""))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort()
      .pop() || "";
  }

  async autoCompleteParentChain(taskId, completedAt = "") {
    return this.autoCompleteParentChainForTaskId(taskId, completedAt);
  }

  async autoCompleteParentChainForTaskId(taskId, completedAt = "") {
    const cleanCompletedAt = normalizeDateInput(completedAt || "");
    const completedParents = [];
    let tasks = await this.scanTasks();
    let current = tasks.find((task) => task.taskId === taskId);
    const seen = new Set();
    while (current && current.parentId && !seen.has(current.parentId)) {
      seen.add(current.parentId);
      const parent = tasks.find((task) => task.taskId === current.parentId);
      if (!parent || parent.completed) break;
      const children = tasks.filter((task) => task.parentId === parent.taskId);
      if (!children.length || !children.every((task) => this.taskIsDoneForParent(task))) break;
      // 上级的完成日以全部直接子任务中最晚的实际完成日为准。
      const parentCompletedAt = this.latestCompletionDate(children) || cleanCompletedAt || localDateString();
      await this.toggleTask(parent, true, { autoCompleteParents: false, completedAt: parentCompletedAt });
      completedParents.push(parent);
      tasks = await this.scanTasks();
      current = tasks.find((task) => task.taskId === parent.taskId);
    }
    if (completedParents.length) await this.refreshViews();
    return completedParents;
  }

  async autoCompleteParentChainAfterChildRemoval(parentId) {
    if (!parentId) return [];
    const completedParents = [];
    let tasks = await this.scanTasks({ force: true });
    let currentParentId = parentId;
    const seen = new Set();
    while (currentParentId && !seen.has(currentParentId)) {
      seen.add(currentParentId);
      const parent = tasks.find((task) => task.taskId === currentParentId);
      if (!parent || parent.completed || taskIsCompletedStatus(taskStatusText(parent))) break;
      const children = tasks.filter((task) => task.parentId === parent.taskId);
      if (!children.length || !children.every((task) => this.taskIsDoneForParent(task))) break;
      const completedAt = this.latestCompletionDate(children) || localDateString();
      await this.toggleTask(parent, true, { autoCompleteParents: false, completedAt });
      completedParents.push(parent);
      tasks = await this.scanTasks({ force: true });
      currentParentId = parent.parentId || "";
    }
    if (completedParents.length) await this.refreshViews({ force: true });
    return completedParents;
  }

  async reopenParentChainForOpenChild(parentId) {
    if (!parentId) return [];
    const reopened = [];
    let tasks = await this.scanTasks();
    let currentParentId = parentId;
    const seen = new Set();
    while (currentParentId && !seen.has(currentParentId)) {
      seen.add(currentParentId);
      const parent = tasks.find((task) => task.taskId === currentParentId);
      if (!parent) break;
      const hasOpenChild = tasks.some((task) => task.parentId === parent.taskId && !this.taskIsDoneForParent(task));
      if (!hasOpenChild) break;
      // 存在未完成子任务的父任务统一标记为“进行中”。
      if (taskStatusText(parent) !== "进行中" || parent.completed || parent.completedAt) {
        const saved = await this.updateStructuredTask(parent, {
          title: parent.displayText || parent.text,
          project: parent.projects[0] || this.settings.defaultProjects[0] || "",
          due: parent.due || "",
          deadline: parent.deadline || "",
          hardDeadline: parent.hardDeadline || "",
          status: "进行中",
          progress: parent.progress || "",
          priority: parent.priority || "",
          parentId: parent.parentId || "",
          blockedBy: parent.blockedBy || "",
          recordDates: parent.recordDates || [],
          completedAt: "",
          canceledAt: "",
          childDraft: "",
        });
        if (saved) reopened.push(parent);
        tasks = await this.scanTasks();
      }
      currentParentId = parent.parentId || "";
    }
    if (reopened.length) await this.refreshViews();
    return reopened;
  }

  async replaceTaskLine(task, transform) {
    if (task && task.internal) {
      const current = this.internalTaskMetadataFromTask(task);
      if (!current) {
        new Notice("找不到内部任务");
        return null;
      }
      const line = hiddenTaskComment(current);
      const result = transform(line);
      const nextLine = typeof result === "string" ? result : result.line;
      const metadata = parseTaskMetadata(nextLine);
      await this.saveInternalTaskMetadata(metadata);
      return typeof result === "string" ? null : result.value;
    }

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      new Notice("找不到任务所在笔记");
      return null;
    }

    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n/);
    const index = this.resolveTaskLineIndex(file, lines, task);
    if (index < 0 || !lines[index]) {
      new Notice("任务行已变化，请刷新后再试");
      return null;
    }

    const result = transform(lines[index]);
    lines[index] = typeof result === "string" ? result : result.line;
    await this.app.vault.modify(file, lines.join("\n"));
    return typeof result === "string" ? null : result.value;
  }

  resolveTaskLineIndex(file, lines, task) {
    if (!task || !Array.isArray(lines)) return -1;
    if (task.taskId) {
      const idIndex = lines.findIndex((line) => parseTaskMetadata(line).id === task.taskId);
      if (idIndex >= 0) return idIndex;
    }
    const title = String(task.displayText || task.text || "").trim();
    const lineIndex = Number(task.lineNumber || 0) - 1;
    if (lineIndex >= 0 && lineIndex < lines.length) {
      const current = this.parseTaskLine(file, lines[lineIndex], lineIndex + 1) || this.parseHiddenTaskLine(file, lines[lineIndex], lineIndex + 1);
      if (current && task.taskId && current.taskId === task.taskId) return lineIndex;
      if (current && !task.taskId && title && String(current.displayText || current.text || "").trim() === title) return lineIndex;
      if (task.rawLine && lines[lineIndex] === task.rawLine) return lineIndex;
    }
    if (task.rawLine) {
      const rawIndex = lines.findIndex((line) => line === task.rawLine);
      if (rawIndex >= 0) return rawIndex;
    }
    if (!title) return -1;
    return lines.findIndex((line, index) => {
      const parsed = this.parseTaskLine(file, line, index + 1) || this.parseHiddenTaskLine(file, line, index + 1);
      return parsed && String(parsed.displayText || parsed.text || "").trim() === title;
    });
  }

  async updateTaskMetadata(task, updater) {
    if (task && task.internal) return this.updateInternalTaskMetadata(task, updater);
    let nextMetadata = null;
    await this.replaceTaskLine(task, (line) => {
      const metadata = parseTaskMetadata(line);
      if (!metadata.id) metadata.id = generateTaskId();
      const updated = updater ? updater(Object.assign({}, metadata)) || metadata : metadata;
      nextMetadata = updated;
      return upsertTaskMetadata(line, updated);
    });
    return nextMetadata;
  }

  async ensureTaskId(task) {
    if (task.taskId) return task.taskId;
    const metadata = await this.updateTaskMetadata(task, (current) => current);
    return metadata ? metadata.id : "";
  }

  wouldCreateCycle(childId, parentId, tasks) {
    if (!childId || !parentId) return false;
    const parentByTask = new Map();
    for (const task of tasks) {
      if (task.taskId && task.parentId) {
        parentByTask.set(task.taskId, task.parentId);
      }
    }

    let current = parentId;
    const seen = new Set();
    while (current) {
      if (current === childId) return true;
      if (seen.has(current)) return true;
      seen.add(current);
      current = parentByTask.get(current);
    }
    return false;
  }

  async setParent(childTask, parentTask) {
    if (sameTask(childTask, parentTask)) {
      new Notice("任务不能成为自己的子任务");
      return;
    }

    const childId = await this.ensureTaskId(childTask);
    const parentId = await this.ensureTaskId(parentTask);
    const latestTasks = await this.scanTasks();
    if (this.wouldCreateCycle(childId, parentId, latestTasks)) {
      new Notice("不能这样设置，会形成循环关系");
      return;
    }

    await this.updateTaskMetadata(childTask, (metadata) => {
      metadata.parent = parentId;
      return metadata;
    });
    await this.reopenParentChainForOpenChild(parentId);
    new Notice("已设置父子任务关系");
    await this.refreshViews();
  }

  async clearParent(task) {
    await this.updateTaskMetadata(task, (metadata) => {
      delete metadata.parent;
      return metadata;
    });
    new Notice("已取消父任务");
    await this.refreshViews();
  }

  async setBlockedBy(task, blockedByTask) {
    if (sameTask(task, blockedByTask)) {
      new Notice("任务不能依赖自己");
      return;
    }
    const blockedById = await this.ensureTaskId(blockedByTask);
    await this.updateTaskMetadata(task, (metadata) => {
      metadata.blocked_by = blockedById;
      return metadata;
    });
    new Notice("已设置前置/后续关系");
    await this.refreshViews();
  }

  async clearBlockedBy(task) {
    await this.updateTaskMetadata(task, (metadata) => {
      delete metadata.blocked_by;
      return metadata;
    });
    new Notice("已取消前置关系");
    await this.refreshViews();
  }

  async applyTaskRelationSelection(task, relations = {}) {
    const sourceId = await this.ensureTaskId(task);
    if (!sourceId) return false;
    let latestTasks = await this.scanTasks();
    const sourceTask = latestTasks.find((item) => item.taskId === sourceId) || task;
    const parentTask = relations.parentTask || null;
    const blockedByTask = relations.blockedByTask || null;
    const childTasks = Array.isArray(relations.childTasks) ? relations.childTasks.filter(Boolean) : [];
    const nextTasks = Array.isArray(relations.nextTasks) ? relations.nextTasks.filter(Boolean) : [];

    if (parentTask) {
      const parentId = await this.ensureTaskId(parentTask);
      latestTasks = await this.scanTasks();
      if (this.wouldCreateCycle(sourceId, parentId, latestTasks)) {
        new Notice("不能这样设置，会形成循环关系");
        return false;
      }
      await this.updateTaskMetadata(sourceTask, (metadata) => {
        metadata.parent = parentId;
        return metadata;
      });
      await this.reopenParentChainForOpenChild(parentId);
    } else if (sourceTask.parentId) {
      await this.updateTaskMetadata(sourceTask, (metadata) => {
        delete metadata.parent;
        return metadata;
      });
    }

    if (blockedByTask) {
      const blockedById = await this.ensureTaskId(blockedByTask);
      await this.updateTaskMetadata(sourceTask, (metadata) => {
        metadata.blocked_by = blockedById;
        return metadata;
      });
    } else if (sourceTask.blockedBy) {
      await this.updateTaskMetadata(sourceTask, (metadata) => {
        delete metadata.blocked_by;
        return metadata;
      });
    }

    latestTasks = await this.scanTasks();
    const selectedChildIds = new Set();
    for (const childTask of childTasks) {
      if (sameTask(childTask, sourceTask)) continue;
      const childId = await this.ensureTaskId(childTask);
      if (!childId) continue;
      latestTasks = await this.scanTasks();
      if (this.wouldCreateCycle(childId, sourceId, latestTasks)) {
        new Notice(`已跳过会形成循环的下级任务：${childTask.displayText || childTask.text}`);
        continue;
      }
      selectedChildIds.add(childId);
      await this.updateTaskMetadata(childTask, (metadata) => {
        metadata.parent = sourceId;
        return metadata;
      });
    }
    if (relations.syncChildren) {
      for (const existingChild of latestTasks.filter((item) => item.parentId === sourceId)) {
        if (existingChild.taskId && !selectedChildIds.has(existingChild.taskId)) {
          await this.updateTaskMetadata(existingChild, (metadata) => {
            delete metadata.parent;
            return metadata;
          });
        }
      }
    }
    if (selectedChildIds.size) await this.reopenParentChainForOpenChild(sourceId);

    latestTasks = await this.scanTasks();
    const selectedNextIds = new Set();
    for (const nextTask of nextTasks) {
      if (sameTask(nextTask, sourceTask)) continue;
      const nextId = await this.ensureTaskId(nextTask);
      if (!nextId) continue;
      selectedNextIds.add(nextId);
      await this.updateTaskMetadata(nextTask, (metadata) => {
        metadata.blocked_by = sourceId;
        return metadata;
      });
    }
    if (relations.syncNext) {
      for (const existingNext of latestTasks.filter((item) => item.blockedBy === sourceId)) {
        if (existingNext.taskId && !selectedNextIds.has(existingNext.taskId)) {
          await this.updateTaskMetadata(existingNext, (metadata) => {
            delete metadata.blocked_by;
            return metadata;
          });
        }
      }
    }
    if (relations.skipRefresh) this.queueRefreshViews();
    else await this.refreshViews();
    return true;
  }

  async createRelatedTask(sourceTask, relation, title, due = "") {
    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) {
      new Notice("先写任务内容");
      return false;
    }
    const payload = {
      title: cleanTitle,
      project: sourceTask.projects[0] || this.settings.defaultProjects[0] || "",
      due: String(due || "").trim(),
      deadline: "",
      hardDeadline: "",
      status: "待开始",
      progress: "",
      priority: "",
      parentTask: relation === "child" ? sourceTask : null,
      blockedBy: relation === "next" ? await this.ensureTaskId(sourceTask) : "",
      childDraft: "",
    };
    return this.createStructuredTask("standalone", payload);
  }

  async setTaskDueDate(task, due) {
    const cleanDue = due.trim();
    if (cleanDue && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDue)) {
      new Notice("日期格式应为 YYYY-MM-DD");
      return;
    }

    await this.replaceTaskLine(task, (line) => {
      let next = removeDueDate(line).trimEnd();
      if (cleanDue) {
        next = insertBeforeMetadata(next, `\uD83D\uDCC5 ${cleanDue}`);
      }
      return next;
    });
    new Notice(cleanDue ? "已设置规划日期" : "已清除规划日期");
    await this.refreshViews();
  }

  async setTaskSchedule(task, due, deadline) {
    const cleanDue = normalizeDateInput(due);
    const cleanDeadline = normalizeDateInput(deadline);
    if (cleanDue && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDue)) {
      new Notice("开始日期格式应为 YYYY-MM-DD");
      return;
    }
    if (cleanDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDeadline)) {
      new Notice("计划完成格式应为 YYYY-MM-DD");
      return;
    }
    if (!cleanDue && cleanDeadline) {
      new Notice("请先设置开始日期");
      return;
    }
    if (cleanDue && cleanDeadline && cleanDeadline < cleanDue) {
      new Notice("计划完成不能早于开始日期");
      return;
    }

    await this.updateStructuredTask(task, {
      title: task.displayText || task.text,
      project: task.projects[0] || this.settings.defaultProjects[0] || "",
      due: cleanDue,
      deadline: cleanDeadline,
      hardDeadline: task.hardDeadline || "",
      status: taskStatusText(task) || "待开始",
      progress: task.progress || "",
      priority: task.priority || "",
      parentId: task.parentId || "",
      blockedBy: task.blockedBy || "",
      completedAt: task.completedAt || "",
      childDraft: "",
    });
    new Notice(cleanDue ? "已设置计划日期" : "已清除计划日期");
  }

  async setTaskDates(task, data = {}) {
    const cleanDue = normalizeDateInput(data.due);
    const cleanHardDeadline = normalizeDateInput(data.hardDeadline || data.hard_deadline || "");
    const cleanDeadline = normalizeDateInput(data.deadline);
    const cleanCompletedAt = normalizeDateInput(data.completedAt || data.completed_at || "");
    if (cleanDue && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDue)) {
      new Notice("开始日期格式应为 YYYY-MM-DD");
      return;
    }
    if (cleanHardDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(cleanHardDeadline)) {
      new Notice("截止日期格式应为 YYYY-MM-DD");
      return;
    }
    if (cleanDeadline && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDeadline)) {
      new Notice("计划完成格式应为 YYYY-MM-DD");
      return;
    }
    if (cleanCompletedAt && !/^\d{4}-\d{2}-\d{2}$/.test(cleanCompletedAt)) {
      new Notice("实际完成格式应为 YYYY-MM-DD");
      return;
    }
    if (!cleanDue && cleanDeadline) {
      new Notice("请先设置开始日期");
      return;
    }
    if (cleanDue && cleanDeadline && cleanDeadline < cleanDue) {
      new Notice("计划完成不能早于开始日期");
      return;
    }

    await this.updateStructuredTask(task, {
      title: task.displayText || task.text,
      project: task.projects[0] || this.settings.defaultProjects[0] || "",
      due: cleanDue,
      hardDeadline: cleanHardDeadline,
      deadline: cleanDeadline,
      status: taskStatusText(task) || "待开始",
      progress: task.progress || "",
      priority: task.priority || "",
      parentId: task.parentId || "",
      blockedBy: task.blockedBy || "",
      recordDates: task.recordDates || [],
      completedAt: cleanCompletedAt,
      canceledAt: task.canceledAt || "",
      childDraft: "",
    });
    new Notice("已保存任务日期");
  }

  async setTaskProject(task, project) {
    const name = String(project || "").trim();
    if (!task || !name || name === "全部" || name === "鍏ㄩ儴") return;
    await this.updateStructuredTask(task, {
      title: task.displayText || task.text,
      project: name,
      due: task.due || "",
      deadline: task.deadline || "",
      hardDeadline: task.hardDeadline || "",
      status: taskStatusText(task) || "待开始",
      progress: task.progress || "",
      priority: task.priority || "",
      parentId: task.parentId || "",
      blockedBy: task.blockedBy || "",
      recordDates: task.recordDates || [],
      completedAt: task.completedAt || "",
      canceledAt: task.canceledAt || "",
      childDraft: "",
    });
    new Notice(`已移动到项目：${name}`);
  }

  async moveTaskSchedule(task, due) {
    const cleanDue = String(due || "").trim();
    if (!task || !cleanDue || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDue)) return;
    const oldEnd = task.deadline && task.deadline >= task.due ? task.deadline : task.due;
    const span = task.due && oldEnd ? Math.max(0, dateDiffDays(task.due, oldEnd)) : 0;
    const nextDeadline = span > 0 ? localDateString(addDays(parseLocalDate(cleanDue), span)) : "";
    await this.setTaskSchedule(task, cleanDue, nextDeadline);
  }

  async openTaskSource(task) {
    if (task && task.internal) {
      if (task.taskPage) {
        await this.openPath(task.taskPage, { create: false });
        return;
      }
      await this.activateTaskDetailView(task);
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) return;
    const leaf = this.newPageLeaf();
    await leaf.openFile(file, { active: true });
    const view = leaf.view;
    if (view instanceof MarkdownView && view.editor) {
      const line = Math.max(task.lineNumber - 1, 0);
      view.editor.setCursor({ line, ch: 0 });
      view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    }
  }
}

class TaskHubView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.tasks = [];
    this.filter = "open";
    this.project = "全部";
    this.search = "";
    const anchor = this.plugin.settings.sidebarScheduleAnchor || localDateString();
    this.calendarDate = parseLocalDate(anchor) || new Date();
    this.selectedDate = anchor;
    // 任务控制台首次打开时直接落在今天；用户仍可通过“全部”查看整周或整月。
    this.sidebarSelectedDate = localDateString();
    this.viewRefreshInFlight = null;
    this.viewRefreshQueued = false;
    this.flowAnimationFrames = [];
    this.flowRenderTimers = [];
    this.flowResizeObservers = [];
    this.renderCleanups = [];
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "任务控制台";
  }

  getIcon() {
    return "list-checks";
  }

  async onOpen() {
    await this.refresh();
  }

  async onClose() {
    this.clearTransientRenderState();
  }

  async refresh() {
    if (this.viewRefreshInFlight) {
      this.viewRefreshQueued = true;
      return this.viewRefreshInFlight;
    }

    this.viewRefreshInFlight = (async () => {
      const tasks = await this.plugin.scanTasks({ force: true });
      await this.refreshWithTasks(tasks);
    })()
      .catch((error) => {
        this.plugin.reportTaskHubError(`${this.getDisplayText()}刷新失败`, error);
      })
      .finally(() => {
        const shouldRefreshAgain = this.viewRefreshQueued;
        this.viewRefreshQueued = false;
        this.viewRefreshInFlight = null;
        if (shouldRefreshAgain) this.refresh();
      });

    return this.viewRefreshInFlight;
  }

  async refreshWithTasks(tasks) {
    this.tasks = Array.isArray(tasks) ? tasks.slice() : [];
    this.renderSafely();
  }

  clearScheduledFlowRenders() {
    for (const frame of this.flowAnimationFrames || []) {
      window.cancelAnimationFrame(frame);
    }
    for (const timer of this.flowRenderTimers || []) {
      window.clearTimeout(timer);
    }
    for (const observer of this.flowResizeObservers || []) {
      observer.disconnect();
    }
    this.flowAnimationFrames = [];
    this.flowRenderTimers = [];
    this.flowResizeObservers = [];
  }

  registerRenderWindowEvent(type, listener, options) {
    window.addEventListener(type, listener, options);
    this.renderCleanups.push(() => window.removeEventListener(type, listener, options));
  }

  clearRenderCleanups() {
    for (const cleanup of this.renderCleanups || []) {
      try {
        cleanup();
      } catch (error) {
        console.error("[wjq-task-hub] 清理临时事件失败", error);
      }
    }
    this.renderCleanups = [];
  }

  clearTransientRenderState() {
    this.clearRenderCleanups();
    this.clearScheduledFlowRenders();
  }

  renderSafely() {
    try {
      this.clearTransientRenderState();
      this.render();
    } catch (error) {
      this.plugin.reportTaskHubError(`${this.getDisplayText()}渲染失败`, error);
      this.renderError(error);
    }
  }

  renderError(error) {
    try {
      const container = this.containerEl.children[1];
      container.empty();
      container.addClass("wjq-task-hub");
      const panel = container.createDiv({ cls: "wjq-task-hub-error" });
      panel.createEl("h2", { text: "这个视图刚才渲染失败" });
      panel.createDiv({ text: "已拦截错误，避免插件卡住。可以刷新一次继续使用。" });
      const detail = String(error && (error.stack || error.message) || error || "").split(/\r?\n/)[0];
      if (detail) panel.createDiv({ cls: "wjq-task-hub-error-detail", text: detail });
      const actions = panel.createDiv({ cls: "wjq-task-hub-actions" });
      this.createButton(actions, "刷新", () => this.refresh());
    } catch (renderError) {
      console.error("[wjq-task-hub] 渲染错误面板失败", renderError);
    }
  }

  calendarAnchorDate() {
    const raw = this.sidebarSelectedDate || this.plugin.settings.sidebarScheduleAnchor || this.selectedDate || localDateString();
    return parseLocalDate(raw) || new Date();
  }

  calendarAnchorDateString() {
    return localDateString(this.calendarAnchorDate());
  }

  filteredTasks() {
    const today = this.calendarAnchorDateString();
    const weekEnd = localDateString(addDays(this.calendarAnchorDate(), 6));

    return this.tasks.filter((task) => {
      if (!this.matchesProjectAndSearch(task)) return false;
      if (this.filter === "open") return !task.completed;
      if (this.filter === "today") return !task.completed && task.due === today;
      if (this.filter === "week") return !task.completed && task.due && task.due >= today && task.due <= weekEnd;
      if (this.filter === "overdue") return !task.completed && task.due && task.due < today;
      if (this.filter === "done") return task.completed;
      return true;
    });
  }

  matchesProjectAndSearch(task) {
    if (this.project !== "全部" && !task.projects.includes(this.project)) return false;
    const query = this.search.trim().toLowerCase();
    if (!query) return true;
    const haystack = `${task.text} ${task.path} ${task.projects.join(" ")}`.toLowerCase();
    return haystack.includes(query);
  }

  allProjects() {
    const fromTasks = this.tasks.flatMap((task) => task.projects);
    return ["全部", ...uniq([...this.plugin.settings.defaultProjects, ...fromTasks]).sort()];
  }

  projectStats() {
    const today = this.calendarAnchorDateString();
    const stats = new Map();
    for (const task of this.tasks) {
      for (const project of task.projects) {
        if (!stats.has(project)) stats.set(project, { project, total: 0, done: 0, overdue: 0 });
        const item = stats.get(project);
        item.total += 1;
        if (task.completed) item.done += 1;
        if (!task.completed && task.due && task.due < today) item.overdue += 1;
      }
    }
    return Array.from(stats.values()).sort((a, b) => a.project.localeCompare(b.project));
  }

  render() {
    const container = this.containerEl.children[1];
    this.clearScheduledFlowRenders();
    container.empty();
    container.addClass("wjq-task-hub");
    container.addClass("wjq-quick-sidebar");
    container.removeClass("has-task-side-editor");

    if (this.plugin.pendingTaskLinkDraft) {
      this.renderSidebarTaskLinker(container, this.plugin.pendingTaskLinkDraft);
      return;
    }

    if (this.plugin.pendingTaskDraft) {
      this.renderSidebarNewTaskEditor(container, this.plugin.pendingTaskDraft);
      return;
    }

    const currentTaskId = this.plugin.settings.currentTaskId || "";
    const currentTask = currentTaskId ? this.tasks.find((item) => item.taskId === currentTaskId) : null;
    if (currentTask) {
      this.renderSidebarTaskEditor(container, currentTask);
      return;
    }

    const header = container.createDiv({ cls: "wjq-task-hub-header" });
    header.createEl("h2", { text: "任务控制台" });
    const actions = header.createDiv({ cls: "wjq-task-hub-actions" });
    this.createButton(actions, "刷新", () => this.refresh());
    this.createButton(actions, "主页", () => this.plugin.activateHomeView());

    this.renderSidebarProgressConsole(container);
  }

  openTasks() {
    return this.tasks.filter((task) => !task.completed);
  }

  renderHomeToggle(parent, label, active, callback) {
    const button = this.createButton(parent, label, callback);
    if (active) button.addClass("is-active");
    return button;
  }

  shortDate(value) {
    if (!value) return "";
    const text = typeof value === "string" ? value : localDateString(value);
    return text.slice(5).replace("-", "/");
  }

  taskCreationValue(task) {
    const rawId = String((task && task.taskId) || "");
    const match = rawId.match(/^wjq-([a-z0-9]+)/i);
    if (match) {
      const parsed = parseInt(match[1], 36);
      if (Number.isFinite(parsed)) return parsed;
    }
    const file = task && task.path ? this.plugin.app.vault.getAbstractFileByPath(task.path) : null;
    if (file instanceof TFile && file.stat && Number.isFinite(file.stat.ctime)) return file.stat.ctime;
    return Number.MAX_SAFE_INTEGER;
  }

  compareTasksByCreation(a, b) {
    const created = this.taskCreationValue(a) - this.taskCreationValue(b);
    if (created !== 0) return created;
    const pathCompare = String(a.path || "").localeCompare(String(b.path || ""));
    if (pathCompare !== 0) return pathCompare;
    return (a.lineNumber || 0) - (b.lineNumber || 0);
  }

  compareTasksBySchedule(a, b) {
    const aStart = this.calendarTaskStartDate ? this.calendarTaskStartDate(a) : (a.due || a.completedAt || "");
    const bStart = this.calendarTaskStartDate ? this.calendarTaskStartDate(b) : (b.due || b.completedAt || "");
    if (aStart !== bStart) return String(aStart || "9999-99-99").localeCompare(String(bStart || "9999-99-99"));
    const aEnd = this.calendarTaskEndDate ? this.calendarTaskEndDate(a) : this.taskEndDate(a);
    const bEnd = this.calendarTaskEndDate ? this.calendarTaskEndDate(b) : this.taskEndDate(b);
    if (aEnd !== bEnd) return String(aEnd || "9999-99-99").localeCompare(String(bEnd || "9999-99-99"));
    return this.compareTasksByCreation(a, b);
  }

  taskHardDeadline(task) {
    return task && (task.hardDeadline || task.hard_deadline || "");
  }

  countdownText(date) {
    if (!date) return "";
    const diff = dateDiffDays(localDateString(), date);
    if (diff === 0) return "今天截止";
    if (diff > 0) return `剩 ${diff} 天`;
    return `已超 ${Math.abs(diff)} 天`;
  }

  countdownTasks(tasks, options = {}) {
    const includeCompleted = !!options.includeCompleted;
    return (tasks || [])
      .filter((task) => {
        const hardDeadline = this.taskHardDeadline(task);
        if (!hardDeadline || !/^\d{4}-\d{2}-\d{2}$/.test(hardDeadline)) return false;
        if (!includeCompleted && (task.completed || /完成|取消|归档/.test(taskStatusText(task)))) return false;
        return true;
      })
      .sort((a, b) => {
        const aDate = this.taskHardDeadline(a);
        const bDate = this.taskHardDeadline(b);
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        return this.compareTasksByCreation(a, b);
      });
  }

  taskMaterialPaths(tasks) {
    return uniq((tasks || [])
      .flatMap((task) => [
        task.path && task.path !== INTERNAL_TASK_PATH ? task.path : "",
        ...this.plugin.materialNotePathsFromText(task.materials || ""),
      ])
      .filter(Boolean));
  }

  renderMaterialPathRow(parent, path) {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    const row = parent.createDiv({ cls: "wjq-home-list-row wjq-material-path-row" });
    const main = row.createDiv({ cls: "wjq-home-row-main" });
    main.createDiv({ cls: "wjq-home-row-title", text: file instanceof TFile ? file.basename : path });
    main.createDiv({ cls: "wjq-home-row-meta", text: path });
    row.onclick = () => this.plugin.openPath(path);
    if (file instanceof TFile) {
      this.attachContextMenu(row, [
        { title: "打开", icon: "file-text", callback: () => this.plugin.openPath(path) },
        { title: "重命名", icon: "pencil", callback: () => this.openRenamePathModal(path, file.basename) },
      ]);
    }
  }

  renderCountdownTask(parent, task) {
    const hardDeadline = this.taskHardDeadline(task);
    const diff = dateDiffDays(localDateString(), hardDeadline);
    const row = parent.createDiv({
      cls: `wjq-home-task-row wjq-countdown-task-row ${diff < 0 ? "is-overdue" : ""} ${diff === 0 ? "is-today" : ""}`.trim(),
    });
    const date = row.createDiv({ cls: "wjq-home-task-date", text: this.shortDate(hardDeadline) });
    date.onclick = (event) => {
      event.stopPropagation();
      new DateModal(this.plugin, task).open();
    };
    const title = row.createDiv({ cls: "wjq-home-task-title", text: task.displayText || task.text });
    title.onclick = () => this.openTaskByDefault(task);
    row.createDiv({ cls: "wjq-home-task-status", text: this.countdownText(hardDeadline) });
    const actions = row.createDiv({ cls: "wjq-home-task-actions" });
    this.createButton(actions, "日期", (event) => {
      if (event) event.stopPropagation();
      new DateModal(this.plugin, task).open();
    });
    this.attachContextMenu(row, this.taskContextActions(task));
  }

  scheduleLabel(task) {
    if (!task || !task.due) return "";
    const end = this.calendarTaskEndDate ? this.calendarTaskEndDate(task) : this.taskEndDate(task);
    return end && end !== task.due ? `${this.shortDate(task.due)}-${this.shortDate(end)}` : this.shortDate(task.due);
  }

  taskEndDate(task) {
    const start = task && (task.due || task.completedAt || "");
    if (!task || !start) return "";
    if (task.completedAt && task.completedAt >= start) return task.completedAt;
    return task.deadline && task.deadline >= start ? task.deadline : start;
  }

  isCalendarTask(task) {
    return !!task && (!!task.due || !!task.completedAt) && !this.taskHasOpenChildren(task);
  }

  taskTouchesDate(task, date) {
    if (!this.isCalendarTask(task) || !date) return false;
    const start = this.calendarTaskStartDate ? this.calendarTaskStartDate(task) : task.due;
    const end = this.calendarTaskEndDate ? this.calendarTaskEndDate(task) : this.taskEndDate(task);
    return start <= date && end >= date;
  }

  currentProgressTasks() {
    return this.tasks
      .filter((task) => !task.completed && !!task.due && (this.taskIsStarted(task) || this.taskHasOpenChildren(task)) && !this.isCalendarTask(task))
      .sort((a, b) => `${a.path}:${a.lineNumber}`.localeCompare(`${b.path}:${b.lineNumber}`));
  }

  sidebarWeekTasks() {
    const today = this.calendarAnchorDateString();
    const end = localDateString(addDays(this.calendarAnchorDate(), 6));
    return this.tasks
      .filter((task) => this.isCalendarTask(task) && task.due <= end && this.taskEndDate(task) >= today)
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 12);
  }

  renderSidebarProgressConsole(container) {
    const today = this.calendarAnchorDateString();
    const todayTasks = this.tasks
      .filter((task) => !task.completed && this.taskTouchesDate(task, today))
      .sort((a, b) => `${a.due || ""}:${a.path}:${a.lineNumber}`.localeCompare(`${b.due || ""}:${b.path}:${b.lineNumber}`));
    this.renderSidebarProgressSection(container, "今日推进", todayTasks, "今天没有已排期任务。");
    this.renderSidebarProgressSection(container, "当前推进", this.currentProgressTasks().slice(0, 8), "没有已开始且未排期的任务。");
    this.renderSidebarProgressSection(container, "近期安排", this.upcomingSidebarTasks(), "未来 7 天没有明确排期。");
    this.renderSidebarScheduleModule(container);
    this.renderSidebarQuickActions(container);
  }

  renderSidebarProgressSection(container, title, tasks, emptyText) {
    const section = container.createDiv({ cls: "wjq-sidebar-progress-section" });
    section.createDiv({ cls: "wjq-sidebar-progress-title", text: title });
    if (!tasks.length) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: emptyText });
      return;
    }
    for (const task of tasks) this.renderSidebarProgressTask(section, task);
  }

  renderSidebarProgressTask(parent, task) {
    const row = parent.createDiv({ cls: "wjq-sidebar-progress-task" });
    const main = row.createDiv({ cls: "wjq-sidebar-progress-main" });
    main.createDiv({ cls: "wjq-sidebar-progress-name", text: task.displayText || task.text });
    main.createDiv({ cls: "wjq-sidebar-progress-meta", text: [task.projects[0] || "未设项目", this.homeTaskBadge ? this.homeTaskBadge(task) : taskStatusText(task), task.due ? this.scheduleLabel(task) : ""].filter(Boolean).join(" · ") });
    main.onclick = () => this.openTaskByDefault(task);
    const actions = row.createDiv({ cls: "wjq-sidebar-progress-actions" });
    if (!this.taskIsStarted(task)) this.createButton(actions, "开始", () => this.plugin.startTask(task));
    else actions.createSpan({ cls: "wjq-sidebar-progress-state", text: "进行中" });
    this.createButton(actions, "完成", () => this.plugin.completeTask(task));
    this.createButton(actions, "排期", () => new DateModal(this.plugin, task).open());
    this.attachContextMenu(row, this.taskContextActions(task));
  }

  renderSidebarScheduleModule(container) {
    const section = container.createDiv({ cls: "wjq-sidebar-schedule" });
    const header = section.createDiv({ cls: "wjq-sidebar-schedule-header" });
    header.createDiv({ cls: "wjq-sidebar-progress-title", text: "日程" });
    const switcher = header.createDiv({ cls: "wjq-home-segmented" });
    const view = this.plugin.settings.sidebarScheduleView || "week";
    this.renderHomeToggle(switcher, "周历", view !== "month", async () => {
      this.plugin.settings.sidebarScheduleView = "week";
      await this.plugin.saveSettings();
    });
    this.renderHomeToggle(switcher, "月历", view === "month", async () => {
      this.plugin.settings.sidebarScheduleView = "month";
      await this.plugin.saveSettings();
    });
    if (view === "month") this.renderSidebarCompactMonth(section);
    else this.renderSidebarWeekSchedule(section);
  }

  renderSidebarWeekSchedule(parent) {
    const wrap = parent.createDiv({ cls: "wjq-sidebar-week" });
    const base = this.calendarAnchorDate();
    for (let offset = 0; offset < 7; offset += 1) {
      const date = localDateString(addDays(base, offset));
      const tasks = this.tasks.filter((task) => !task.completed && this.taskTouchesDate(task, date)).slice(0, 4);
      const day = wrap.createDiv({ cls: `wjq-sidebar-week-day ${date === localDateString() ? "is-today" : ""}` });
      day.createDiv({ cls: "wjq-sidebar-week-date", text: date === localDateString() ? "今天" : this.shortDate(date) });
      const body = day.createDiv({ cls: "wjq-sidebar-week-tasks" });
      if (!tasks.length) body.createSpan({ text: "无" });
      for (const task of tasks) {
        const item = body.createDiv({ cls: "wjq-sidebar-week-task", text: task.displayText || task.text });
        item.onclick = () => this.openTaskByDefault(task);
      }
    }
  }

  renderSidebarCompactMonth(parent) {
    this.renderSidebarMiniCalendar(parent);
  }

  renderSidebarProgressConsole(container) {
    const unscheduled = this.tasks
      .filter((task) => !task.completed && !this.isCalendarTask(task) && !this.taskIsStarted(task) && !this.taskHasOpenChildren(task))
      .sort((a, b) => `${a.path}:${a.lineNumber}`.localeCompare(`${b.path}:${b.lineNumber}`))
      .slice(0, 8);
    this.renderSidebarWeekTodo(container);
    this.renderSidebarProgressSection(container, "当前推进", this.currentProgressTasks().slice(0, 8), "没有已开始或有未完成下级的阶段任务。", { showSchedule: true });
    this.renderSidebarProgressSection(container, "待排期任务", unscheduled, "没有待排期任务。", { unscheduled: true });
    this.renderSidebarQuickActions(container);
  }

  renderSidebarProgressSection(container, title, tasks, emptyText, options = {}) {
    const section = container.createDiv({ cls: "wjq-sidebar-progress-section" });
    section.createDiv({ cls: "wjq-sidebar-progress-title", text: title });
    if (!tasks.length) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: emptyText });
      return;
    }
    for (const task of tasks) this.renderSidebarProgressTask(section, task, options);
  }

  renderSidebarProgressTask(parent, task, options = {}) {
    const row = parent.createDiv({ cls: "wjq-sidebar-progress-task" });
    const main = row.createDiv({ cls: "wjq-sidebar-progress-main" });
    main.createDiv({ cls: "wjq-sidebar-progress-name", text: task.displayText || task.text });
    const hasOpenChildren = this.taskHasOpenChildren(task);
    const status = hasOpenChildren ? "进行中" : taskStatusText(task);
    if (!options.compact) main.createDiv({ cls: "wjq-sidebar-progress-meta", text: [task.projects[0] || "未设项目", status, task.due ? this.scheduleLabel(task) : ""].filter(Boolean).join(" · ") });
    main.onclick = () => this.openTaskByDefault(task);
    const actions = row.createDiv({ cls: "wjq-sidebar-progress-actions" });
    if (options.unscheduled) this.createButton(actions, "排期", () => new DateModal(this.plugin, task).open());
    if (!this.taskIsStarted(task) && !hasOpenChildren) this.createButton(actions, "开始", () => options.unscheduled ? new StartDateModal(this.plugin, task).open() : this.plugin.startTask(task));
    else actions.createSpan({ cls: "wjq-sidebar-progress-state", text: "进行中" });
    this.createButton(actions, "完成", () => this.plugin.completeTask(task));
    this.attachContextMenu(row, this.taskContextActions(task));
  }

  renderSidebarWeekTodo(container) {
    const section = container.createDiv({ cls: "wjq-sidebar-progress-section wjq-sidebar-week-todo" });
    const header = section.createDiv({ cls: "wjq-sidebar-week-header" });
    header.createDiv({ cls: "wjq-sidebar-progress-title", text: "周待办" });
    const switcher = header.createDiv({ cls: "wjq-home-segmented" });
    const view = this.plugin.settings.sidebarScheduleView || "week";
    this.renderHomeToggle(switcher, "周历", view !== "day", async () => {
      this.plugin.settings.sidebarScheduleView = "week";
      await this.plugin.saveSettings();
    });
    this.renderHomeToggle(switcher, "日历", view === "day", async () => {
      this.plugin.settings.sidebarScheduleView = "day";
      await this.plugin.saveSettings();
    });
    this.renderSidebarWeekStrip(section);
    const tasks = view === "day"
      ? this.tasks.filter((task) => !task.completed && this.taskTouchesDate(task, this.selectedDate))
      : this.sidebarWeekTasks();
    this.renderSidebarProgressSection(section, view === "day" ? `${this.selectedDate} 任务` : "整周任务", tasks, "这个范围内没有任务。", { compact: true });
  }

  renderSidebarWeekStrip(parent) {
    const strip = parent.createDiv({ cls: "wjq-sidebar-week-strip" });
    const base = this.calendarAnchorDate();
    for (let offset = 0; offset < 7; offset += 1) {
      const date = localDateString(addDays(base, offset));
      const tasks = this.tasks.filter((task) => !task.completed && this.taskTouchesDate(task, date));
      const button = strip.createEl("button", { cls: date === this.selectedDate ? "is-selected" : "" });
      button.createSpan({ cls: "wjq-sidebar-week-strip-date", text: date === localDateString() ? "今天" : this.shortDate(date) });
      if (tasks.length) button.createSpan({ cls: "wjq-sidebar-week-strip-count", text: String(tasks.length) });
      button.onclick = async () => {
        this.selectedDate = date;
        this.sidebarSelectedDate = date;
        this.plugin.settings.sidebarScheduleAnchor = date;
        await this.plugin.saveSettings();
        this.renderSafely();
      };
    }
  }

  renderSidebarQuickActions(container) {
    const section = container.createDiv({ cls: "wjq-sidebar-quick-actions" });
    section.createDiv({ cls: "wjq-sidebar-progress-title", text: "快速处理" });
    this.createButton(section, "新建任务", () => this.plugin.openSidebarNewTaskFromSelection({ sourcePath: "", insertLine: -1 }));
    this.createButton(section, "关联任务", () => this.plugin.openSidebarTaskLinkerForCurrentNote());
  }

  taskChildren(task) {
    if (!task || !task.taskId) return [];
    return this.tasks.filter((item) => item.parentId === task.taskId);
  }

  taskHasChildren(task) {
    return this.taskChildren(task).length > 0;
  }

  openTaskByDefault(task) {
    if (this.taskHasChildren(task)) return this.plugin.activateTaskFullPage(task);
    return this.plugin.activateTaskDetailView(task);
  }

  taskHasOpenDescendants(task, seen = new Set()) {
    if (!task || !task.taskId || seen.has(task.taskId)) return false;
    seen.add(task.taskId);
    for (const child of this.taskChildren(task)) {
      const childStatus = taskStatusText(child);
      const childDone = child.completed || /完成|取消|归档/.test(childStatus);
      if (!childDone) return true;
      if (this.taskHasOpenDescendants(child, seen)) return true;
    }
    return false;
  }

  taskHasUnscheduledDescendants(task, seen = new Set()) {
    if (!task || !task.taskId || seen.has(task.taskId)) return false;
    seen.add(task.taskId);
    for (const child of this.taskChildren(task)) {
      if (!child.completed && !child.due && !child.deadline) return true;
      if (this.taskHasUnscheduledDescendants(child, seen)) return true;
    }
    return false;
  }

  isCalendarTask(task) {
    return !!task
      && (!!task.due || !!task.completedAt)
      && !this.taskHasOpenDescendants(task);
  }

  calendarTaskStartDate(task) {
    if (!task) return "";
    if (task.due) return task.due;
    return task.completedAt || "";
  }

  calendarTaskEndDate(task) {
    const start = this.calendarTaskStartDate(task);
    if (!start) return "";
    const actual = task.completedAt || "";
    if (actual && actual >= start) return actual;
    const planned = task.deadline || task.plannedAt || "";
    if (planned && planned >= start) return planned;
    return start;
  }

  isUnscheduledTask(task) {
    return !!task
      && !task.completed
      && !task.due
      && !task.deadline;
  }

  currentProgressTasks() {
    return this.tasks
      .filter((task) => !task.completed && !!task.due && !this.isCalendarTask(task) && !this.isUnscheduledTask(task))
      .sort((a, b) => `${a.due || "9999-99-99"}:${a.path}:${a.lineNumber}`.localeCompare(`${b.due || "9999-99-99"}:${b.path}:${b.lineNumber}`));
  }

  sidebarWeekRange() {
    const base = this.calendarAnchorDate();
    const day = base.getDay() || 7;
    const start = localDateString(addDays(base, 1 - day));
    const end = localDateString(addDays(parseLocalDate(start), 6));
    return { start, end };
  }

  sidebarMonthRange() {
    const base = this.calendarAnchorDate();
    const start = localDateString(dateFromParts(base.getFullYear(), base.getMonth(), 1));
    const end = localDateString(dateFromParts(base.getFullYear(), base.getMonth() + 1, 0));
    return { start, end };
  }

  async shiftSidebarSchedule(mode, amount) {
    const base = this.calendarAnchorDate();
    const next = mode === "month"
      ? dateFromParts(base.getFullYear(), base.getMonth() + amount, 1)
      : addDays(base, amount * 7);
    const anchor = amount === 0 ? localDateString() : localDateString(next);
    this.plugin.settings.sidebarScheduleAnchor = anchor;
    this.selectedDate = anchor;
    this.sidebarSelectedDate = "";
    this.calendarDate = parseLocalDate(anchor) || this.calendarDate;
    await this.plugin.saveSettings();
    this.renderSafely();
  }

  taskTouchesRange(task, start, end) {
    if (!this.isCalendarTask(task) || !start || !end) return false;
    const taskStart = this.calendarTaskStartDate(task);
    const taskEnd = this.calendarTaskEndDate(task);
    return taskStart <= end && taskEnd >= start;
  }

  sidebarRangeTasks(start, end) {
    return this.tasks
      .filter((task) => this.taskTouchesRange(task, start, end))
      .sort((a, b) => `${this.calendarTaskStartDate(a)}:${this.calendarTaskEndDate(a)}:${a.path}:${a.lineNumber}`.localeCompare(`${this.calendarTaskStartDate(b)}:${this.calendarTaskEndDate(b)}:${b.path}:${b.lineNumber}`));
  }

  sidebarTaskDateLabel(task) {
    return task && task.due ? this.shortDate(task.due) : "";
  }

  renderSidebarProgressConsole(container) {
    this.renderSidebarQuickActions(container);
    this.renderSidebarWeekTodo(container);
    this.renderSidebarProgressSection(container, "当前推进", this.currentProgressTasks().slice(0, 10), "没有正在推进的阶段任务。", { showSchedule: true });
  }

  renderSidebarProgressSection(container, title, tasks, emptyText, options = {}) {
    const section = container.createDiv({ cls: "wjq-sidebar-progress-section" });
    section.createDiv({ cls: "wjq-sidebar-progress-title", text: title });
    if (!tasks.length) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: emptyText });
      return;
    }
    const list = section.createDiv({ cls: "wjq-sidebar-inline-list" });
    for (const task of tasks) this.renderSidebarProgressTask(list, task, options);
  }

  renderSidebarProgressTask(parent, task, options = {}) {
    const row = parent.createDiv({ cls: "wjq-sidebar-progress-task" });
    const main = row.createDiv({ cls: "wjq-sidebar-progress-main" });
    main.createSpan({ cls: "wjq-sidebar-progress-name", text: task.displayText || task.text });
    const dateLabel = this.sidebarTaskDateLabel(task);
    if (dateLabel) main.createSpan({ cls: "wjq-sidebar-progress-meta", text: dateLabel });
    if (this.taskIsStarted(task) || this.taskHasOpenChildren(task)) main.createSpan({ cls: "wjq-sidebar-progress-state", text: "进行中" });
    main.onclick = () => this.openTaskByDefault(task);

    const actions = row.createDiv({ cls: "wjq-sidebar-progress-actions" });
    if (options.unscheduled) this.createButton(actions, "排期", () => new DateModal(this.plugin, task).open());
    if (!this.taskIsStarted(task)) {
      this.createButton(actions, "开始", () => options.unscheduled ? new StartDateModal(this.plugin, task).open() : this.plugin.startTask(task));
    }
    this.createButton(actions, "完成", () => this.plugin.completeTask(task));
    this.attachContextMenu(row, this.taskContextActions(task));
  }

  renderSidebarWeekTodo(container) {
    const section = container.createDiv({ cls: "wjq-sidebar-progress-section wjq-sidebar-week-todo" });
    section.createDiv({ cls: "wjq-sidebar-progress-title", text: "周待办" });
    const mode = this.plugin.settings.sidebarScheduleView === "month" ? "month" : "week";
    const controls = section.createDiv({ cls: "wjq-sidebar-schedule-controls" });
    this.createButton(controls, "新建", () => {
      const date = this.sidebarSelectedDate || "";
      this.plugin.openSidebarNewTaskFromSelection(date ? { due: date } : {});
    });
    const switcher = controls.createDiv({ cls: "wjq-home-segmented" });
    this.renderHomeToggle(switcher, "全部", !this.sidebarSelectedDate, () => {
      this.sidebarSelectedDate = "";
      this.renderSafely();
    });
    this.renderHomeToggle(switcher, "周历", mode === "week", async () => {
      this.plugin.settings.sidebarScheduleView = "week";
      await this.plugin.saveSettings();
      this.renderSafely();
    });
    this.renderHomeToggle(switcher, "月历", mode === "month", async () => {
      this.plugin.settings.sidebarScheduleView = "month";
      await this.plugin.saveSettings();
      this.renderSafely();
    });

    const navigator = section.createDiv({ cls: "wjq-sidebar-schedule-nav" });
    if (mode === "month") {
      this.createButton(navigator, "上月", () => this.shiftSidebarSchedule("month", -1));
      this.createButton(navigator, "本月", () => this.shiftSidebarSchedule("month", 0));
      this.createButton(navigator, "下月", () => this.shiftSidebarSchedule("month", 1));
    } else {
      this.createButton(navigator, "上周", () => this.shiftSidebarSchedule("week", -1));
      this.createButton(navigator, "本周", () => this.shiftSidebarSchedule("week", 0));
      this.createButton(navigator, "下周", () => this.shiftSidebarSchedule("week", 1));
    }

    if (mode === "month") this.renderSidebarMonthGrid(section);
    else this.renderSidebarWeekStrip(section);

    let tasks = [];
    if (this.sidebarSelectedDate) {
      tasks = this.tasks
        .filter((task) => this.taskTouchesDate(task, this.sidebarSelectedDate))
        .sort((a, b) => `${this.calendarTaskStartDate(a)}:${this.calendarTaskEndDate(a)}:${a.path}:${a.lineNumber}`.localeCompare(`${this.calendarTaskStartDate(b)}:${this.calendarTaskEndDate(b)}:${b.path}:${b.lineNumber}`));
    } else {
      const range = mode === "month" ? this.sidebarMonthRange() : this.sidebarWeekRange();
      tasks = this.sidebarRangeTasks(range.start, range.end);
    }

    if (!tasks.length) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: "这个范围内没有任务。" });
      return;
    }
    const list = section.createDiv({ cls: "wjq-sidebar-inline-list" });
    for (const task of tasks.slice(0, 18)) this.renderSidebarProgressTask(list, task, { compact: true });
  }

  renderSidebarWeekStrip(parent) {
    const range = this.sidebarWeekRange();
    const dates = datesBetween(range.start, range.end);
    const strip = parent.createDiv({ cls: "wjq-sidebar-week-strip" });
    for (const date of dates) {
      const tasks = this.tasks.filter((task) => !/取消|归档/.test(taskStatusText(task)) && this.taskTouchesDate(task, date));
      const button = strip.createEl("button", { cls: date === this.sidebarSelectedDate ? "is-selected" : "" });
      if (date === localDateString()) button.addClass("is-today");
      button.createSpan({ cls: "wjq-sidebar-week-strip-date", text: date === localDateString() ? "今天" : String((parseLocalDate(date) || new Date()).getDate()) });
      button.createSpan({ cls: "wjq-sidebar-week-strip-count", text: tasks.length ? String(tasks.length) : "" });
      button.onclick = async () => {
        this.sidebarSelectedDate = date;
        this.selectedDate = date;
        this.plugin.settings.sidebarScheduleAnchor = date;
        this.calendarDate = parseLocalDate(date) || this.calendarDate;
        await this.plugin.saveSettings();
        this.renderSafely();
      };
    }
  }

  renderSidebarMonthGrid(parent) {
    const range = this.sidebarMonthRange();
    const startDate = parseLocalDate(range.start);
    const endDate = parseLocalDate(range.end);
    if (!startDate || !endDate) return;
    const firstDay = startDate.getDay() || 7;
    const daysInMonth = endDate.getDate();
    const grid = parent.createDiv({ cls: "wjq-sidebar-month-grid" });
    for (let blank = 1; blank < firstDay; blank += 1) {
      grid.createDiv({ cls: "wjq-sidebar-month-blank" });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = localDateString(dateFromParts(startDate.getFullYear(), startDate.getMonth(), day));
      const tasks = this.tasks.filter((task) => !/取消|归档/.test(taskStatusText(task)) && this.taskTouchesDate(task, date));
      const button = grid.createEl("button", { cls: date === this.sidebarSelectedDate ? "is-selected" : "" });
      if (date === localDateString()) button.addClass("is-today");
      button.createSpan({ cls: "wjq-sidebar-month-day", text: date === localDateString() ? "今天" : String(day) });
      button.createSpan({ cls: "wjq-sidebar-month-count", text: tasks.length ? String(tasks.length) : "" });
      button.onclick = async () => {
        this.sidebarSelectedDate = date;
        this.selectedDate = date;
        this.plugin.settings.sidebarScheduleAnchor = date;
        this.calendarDate = parseLocalDate(date) || this.calendarDate;
        await this.plugin.saveSettings();
        this.renderSafely();
      };
    }
  }

  taskIsActive(task) {
    if (task.completed) return false;
    const status = taskStatusText(task);
    if (!status) return true;
    if (/完成|取消|归档/.test(status)) return false;
    const activeNames = new Set(this.plugin.settings.activeStatusNames || DEFAULT_SETTINGS.activeStatusNames);
    return activeNames.has(status) || /进行|等待|待|修改|整理|写作|阅读|暂停/.test(status);
  }

  taskIsStarted(task) {
    if (task.completed) return false;
    // 有未完成子任务的父任务处于实际推进中，不能再显示“开始”操作。
    if (this.taskHasOpenChildren(task)) return true;
    const status = taskStatusText(task);
    if (status === "待开始") return false;
    return /进行|等待|修改|整理|写作|阅读|暂停/.test(status || "");
  }

  taskHasOpenChildren(task) {
    if (!task || !task.taskId) return false;
    return this.tasks.some((item) => item.parentId === task.taskId && !item.completed && !/完成|取消|归档/.test(taskStatusText(item)));
  }

  renderSidebarTaskSummary(container) {
    const active = this.tasks.filter((task) => this.taskIsActive(task));
    const doing = active.filter((task) => /进行|修改|整理|写作|阅读/.test(taskStatusText(task))).length;
    const unscheduled = active.filter((task) => !task.due).length;
    const summary = container.createDiv({ cls: "wjq-sidebar-summary" });
    const top = summary.createDiv({ cls: "wjq-sidebar-summary-top" });
    top.createDiv({ cls: "wjq-sidebar-summary-label", text: "当前任务" });
    top.createDiv({ cls: "wjq-sidebar-summary-count", text: String(active.length) });
    this.createButton(top, "+", () => this.plugin.openSidebarNewTaskFromSelection(this.selectedDate ? { due: this.selectedDate } : {}));
    summary.createDiv({ cls: "wjq-sidebar-summary-meta", text: `进行中 ${doing} · 待安排 ${unscheduled}` });
  }

  tasksByDate() {
    const grouped = new Map();
    for (const task of this.tasks.filter((item) => this.isCalendarTask(item))) {
      if (!grouped.has(task.due)) grouped.set(task.due, []);
      grouped.get(task.due).push(task);
    }
    return grouped;
  }

  renderSidebarMiniCalendar(container) {
    const section = container.createDiv({ cls: "wjq-sidebar-calendar-card" });
    const header = section.createDiv({ cls: "wjq-sidebar-calendar-header" });
    this.createButton(header, "‹", () => {
      this.calendarDate = dateFromParts(this.calendarDate.getFullYear(), this.calendarDate.getMonth() - 1, 1);
      this.renderSafely();
    });
    header.createDiv({ cls: "wjq-sidebar-calendar-title", text: `${this.calendarDate.getFullYear()}年${this.calendarDate.getMonth() + 1}月` });
    this.createButton(header, "›", () => {
      this.calendarDate = dateFromParts(this.calendarDate.getFullYear(), this.calendarDate.getMonth() + 1, 1);
      this.renderSafely();
    });

    const tasksByDate = this.tasksByDate();
    const grid = section.createDiv({ cls: "wjq-sidebar-calendar-grid" });
    for (const label of ["一", "二", "三", "四", "五", "六", "日"]) {
      grid.createDiv({ cls: "wjq-sidebar-calendar-weekday", text: label });
    }
    const year = this.calendarDate.getFullYear();
    const month = this.calendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const offset = (firstDay + 6) % 7;
    for (let index = 0; index < offset; index += 1) {
      grid.createDiv({ cls: "wjq-sidebar-calendar-day is-empty" });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${monthKey(this.calendarDate)}-${String(day).padStart(2, "0")}`;
      const dayTasks = tasksByDate.get(date) || [];
      const button = grid.createEl("button", { cls: "wjq-sidebar-calendar-day" });
      if (date === localDateString()) button.addClass("is-today");
      if (date === this.selectedDate) button.addClass("is-selected");
      if (dayTasks.length) button.addClass("has-tasks");
      button.createSpan({ cls: "wjq-sidebar-calendar-number", text: date === localDateString() ? "今天" : String(day) });
      if (dayTasks.length) {
        button.createSpan({ cls: "wjq-sidebar-calendar-badge", text: dayTasks.length > 9 ? "9+" : String(dayTasks.length) });
      }
      button.onclick = async () => {
        this.selectedDate = date;
        this.sidebarSelectedDate = date;
        this.plugin.settings.sidebarScheduleAnchor = date;
        this.calendarDate = parseLocalDate(date) || this.calendarDate;
        await this.plugin.saveSettings();
        this.renderSafely();
      };
    }
  }

  renderSelectedDateTasks(container) {
    const tasks = this.tasks
      .filter((task) => task.due === this.selectedDate && !task.completed)
      .sort((a, b) => `${a.path}:${a.lineNumber}`.localeCompare(`${b.path}:${b.lineNumber}`));
    const section = container.createDiv({ cls: "wjq-sidebar-date-panel" });
    const header = section.createDiv({ cls: "wjq-sidebar-date-header" });
    header.createDiv({ cls: "wjq-sidebar-date-title", text: `${this.selectedDate} · ${tasks.length}项` });
    this.createButton(header, "+", () => this.plugin.openSidebarNewTaskFromSelection(this.selectedDate ? { due: this.selectedDate } : {}));

    if (!tasks.length) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: "这天还没有规划任务。" });
    } else {
      for (const task of tasks.slice(0, 12)) {
        this.renderSidebarTaskCard(section, task, { completeDate: this.selectedDate });
      }
    }

    const unscheduled = this.openTasks().filter((task) => !task.due).length;
    const footer = container.createDiv({ cls: "wjq-sidebar-footer" });
    footer.createDiv({ cls: "wjq-sidebar-footer-line", text: `未安排日期的任务 ${unscheduled}` });
  }

  renderSidebarTaskCard(parent, task, options = {}) {
    const row = parent.createDiv({ cls: "wjq-sidebar-task-card" });
    const checkbox = row.createEl("input", { attr: { type: "checkbox" } });
    checkbox.checked = task.completed;
    checkbox.onchange = () => checkbox.checked
      ? (options.completeDate ? this.plugin.completeTaskOnDate(task, options.completeDate) : this.plugin.completeTask(task))
      : this.plugin.toggleTask(task, false);
    const body = row.createDiv({ cls: "wjq-sidebar-task-body" });
    const title = body.createDiv({ cls: "wjq-sidebar-task-title", text: task.displayText || task.text });
    title.onclick = () => this.openTaskByDefault(task);
    const meta = [
      this.sidebarTaskPath(task),
      this.taskHasOpenChildren(task) ? "进行中" : taskStatusText(task),
      taskProgressText(task),
    ].filter(Boolean);
    body.createDiv({ cls: "wjq-sidebar-task-meta", text: meta.join(" · ") || "未设项目" });
    this.attachContextMenu(row, this.taskContextActions(task, options.completeDate ? { completeDate: options.completeDate } : {}));
  }

  sidebarTaskPath(task) {
    const byId = new Map(this.tasks.filter((item) => item.taskId).map((item) => [item.taskId, item]));
    const parts = [];
    let current = task;
    const seen = new Set();
    while (current && current.parentId && !seen.has(current.parentId)) {
      seen.add(current.parentId);
      const parent = byId.get(current.parentId);
      if (!parent) break;
      parts.unshift(parent.displayText || parent.text);
      current = parent;
    }
    const project = task.projects && task.projects[0] ? task.projects[0] : "";
    return [project, ...parts].filter(Boolean).slice(-3).join(" › ");
  }

  renderSidebarQuickStrip(container) {
    const section = container.createDiv({ cls: "wjq-sidebar-quick-strip" });
    const entries = (this.plugin.settings.quickEntries || []).filter((entry) => entry.type !== "home").slice(0, 7);
    for (const entry of entries) {
      this.createIconButton(section, entry.icon, entry.label, () => this.plugin.openQuickEntry(entry));
    }
  }

  renderSidebarRecent(container) {
    const section = container.createDiv({ cls: "wjq-task-hub-section" });
    section.createEl("h3", { text: "最近使用" });
    this.renderRecentFiles(section, this.plugin.getRecentFiles(6));
  }

  renderSidebarTasks(container) {
    const today = this.calendarAnchorDateString();
    const weekEnd = localDateString(addDays(this.calendarAnchorDate(), 6));
    const todayTasks = this.tasks.filter((task) => !task.completed && task.due === today);
    const overdueTasks = this.tasks.filter((task) => !task.completed && task.due && task.due < today);
    const upcomingTasks = this.tasks.filter((task) => !task.completed && task.due && task.due > today && task.due <= weekEnd);

    this.renderSidebarTaskGroup(container, "今日任务", todayTasks, "今天没有已规划任务。");

    const section = container.createDiv({ cls: "wjq-task-hub-section" });
    section.createEl("h3", { text: "近期任务" });
    if (!overdueTasks.length && !upcomingTasks.length) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: "未来 7 天内没有已规划任务。" });
      return;
    }
    if (overdueTasks.length) this.renderMiniTaskGroup(section, "已逾期", overdueTasks.slice(0, 8));
    if (upcomingTasks.length) this.renderMiniTaskGroup(section, "未来7天", upcomingTasks.slice(0, 12));
  }

  renderSidebarTaskGroup(container, title, tasks, emptyText) {
    const section = container.createDiv({ cls: "wjq-task-hub-section" });
    section.createEl("h3", { text: title });
    if (!tasks.length) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: emptyText });
      return;
    }
    for (const task of tasks) {
      const row = section.createDiv({ cls: `wjq-task-sidebar-task ${task.completed ? "is-done" : ""}` });
      const checkbox = row.createEl("input", { attr: { type: "checkbox" } });
      checkbox.checked = task.completed;
      checkbox.onchange = () => checkbox.checked ? this.plugin.completeTask(task) : this.plugin.toggleTask(task, false);
      const body = row.createDiv({ cls: "wjq-task-sidebar-task-body" });
      body.createDiv({ cls: "wjq-task-sidebar-task-title", text: task.displayText || task.text });
      body.createDiv({ cls: "wjq-task-sidebar-task-meta", text: [task.projects.join(", "), task.due].filter(Boolean).join(" · ") });
      body.onclick = () => this.openTaskByDefault(task);
    }
  }

  renderQuickPanel(container) {
    const section = container.createDiv({ cls: "wjq-task-hub-quick-grid" });
    const quick = section.createDiv({ cls: "wjq-task-hub-panel" });
    quick.createEl("h3", { text: "快捷入口" });
    const entries = this.plugin.settings.quickEntries || [];
    const quickList = quick.createDiv({ cls: "wjq-task-hub-quick-list" });
    for (const entry of entries.slice(0, 8)) {
      const button = quickList.createEl("button", { text: entry.label });
      button.onclick = () => this.plugin.openQuickEntry(entry);
    }
    if (!entries.length) {
      quick.createDiv({ cls: "wjq-task-hub-empty", text: "还没有配置快捷入口。" });
    }

    const recent = section.createDiv({ cls: "wjq-task-hub-panel" });
    recent.createEl("h3", { text: "最近编辑" });
    this.renderRecentFiles(recent, this.plugin.getRecentFiles(6));
  }

  renderRecentFiles(parent, files) {
    if (!files.length) {
      parent.createDiv({ cls: "wjq-task-hub-empty", text: "暂无最近编辑。" });
      return;
    }
    const pinned = new Set(this.plugin.settings.pinnedPaths || []);
    for (const file of files) {
      const row = parent.createDiv({ cls: "wjq-task-hub-recent-row" });
      const main = row.createDiv({ cls: "wjq-task-hub-recent-main" });
      main.createDiv({ cls: "wjq-task-hub-recent-title", text: file.basename });
      main.createDiv({ cls: "wjq-task-hub-recent-meta", text: `${contentTypeLabel(file)} · ${formatRelativeTime(file.stat.mtime)}` });
      main.onclick = () => this.plugin.openPath(file.path);
      const actions = row.createDiv({ cls: "wjq-row-actions" });
      const pin = actions.createEl("button", { text: pinned.has(file.path) ? "已固定" : "固定" });
      pin.onclick = () => this.plugin.togglePinnedPath(file.path);
      this.attachContextMenu(row, [
        { title: "重命名", icon: "pencil", callback: () => this.openRenamePathModal(file.path, file.basename) },
        { title: pinned.has(file.path) ? "取消固定" : "固定", icon: "pin", callback: () => this.plugin.togglePinnedPath(file.path) },
        { title: "打开", icon: "file-text", callback: () => this.plugin.openPath(file.path) },
        { separator: true },
        { title: "删除", icon: "trash-2", callback: () => this.plugin.deletePathWithConfirm(file.path, file.basename) },
      ]);
    }
  }

  renderOngoingCompact(container) {
    const items = this.plugin.activeItems(5);
    if (!items.length) {
      return;
    }
    const section = container.createDiv({ cls: "wjq-task-hub-section" });
    section.createEl("h3", { text: "当前进行中" });
    for (const item of items) {
      const card = section.createDiv({ cls: "wjq-task-hub-work-item" });
      const title = card.createDiv({ cls: "wjq-task-hub-work-title", text: item.title });
      title.onclick = () => this.plugin.openPath(item.path);
      const metaParts = [item.type, item.status, this.plugin.progressText(item), formatRelativeTime(item.mtime)].filter(Boolean);
      card.createDiv({ cls: "wjq-task-hub-work-meta", text: metaParts.join(" · ") });
      if (item.nextAction) {
        card.createDiv({ cls: "wjq-task-hub-work-next", text: `下一步：${item.nextAction}` });
      }
    }
  }

  renderUpcomingCompact(container) {
    const today = this.calendarAnchorDateString();
    const weekEnd = localDateString(addDays(this.calendarAnchorDate(), 6));
    const overdue = this.tasks.filter((task) => !task.completed && task.due && task.due < today);
    const week = this.tasks.filter((task) => !task.completed && task.due && task.due >= today && task.due <= weekEnd);
    if (!overdue.length && !week.length) {
      return;
    }
    const section = container.createDiv({ cls: "wjq-task-hub-section" });
    section.createEl("h3", { text: "近期提醒" });
    if (overdue.length) this.renderMiniTaskGroup(section, "已逾期", overdue.slice(0, 4));
    if (week.length) this.renderMiniTaskGroup(section, "未来7天", week.slice(0, 6));
  }

  renderSidebarHomeAction(container) {
    const section = container.createDiv({ cls: "wjq-sidebar-home-action" });
    this.createButton(section, "打开完整主页", () => this.plugin.activateHomeView());
  }

  renderMiniTaskGroup(parent, title, tasks) {
    parent.createDiv({ cls: "wjq-task-hub-mini-title", text: title });
    for (const task of tasks) {
      const row = parent.createDiv({ cls: "wjq-task-hub-mini-task" });
      row.createSpan({ text: task.due ? `${task.due} · ` : "" });
      const link = row.createSpan({ text: task.displayText || task.text });
      link.onclick = () => this.openTaskByDefault(task);
    }
  }

  renderStats(container) {
    const today = this.calendarAnchorDateString();
    const open = this.tasks.filter((task) => !task.completed).length;
    const done = this.tasks.filter((task) => task.completed).length;
    const overdue = this.tasks.filter((task) => !task.completed && task.due && task.due < today).length;
    const dueToday = this.tasks.filter((task) => !task.completed && task.due === today).length;

    const wrap = container.createDiv({ cls: "wjq-task-hub-stats" });
    this.createStat(wrap, "未完成", open);
    this.createStat(wrap, "今日", dueToday);
    this.createStat(wrap, "逾期", overdue);
    this.createStat(wrap, "已完成", done);
  }

  renderControls(container) {
    const controls = container.createDiv({ cls: "wjq-task-hub-controls" });
    const filters = [
      ["open", "未完成"],
      ["today", "今日"],
      ["week", "7 天内"],
      ["overdue", "逾期"],
      ["calendar", "日历"],
      ["done", "已完成"],
      ["all", "全部"],
    ];
    for (const [key, label] of filters) {
      const button = this.createButton(controls, label, () => {
        this.filter = key;
        this.renderSafely();
      });
      if (this.filter === key) button.addClass("is-active");
    }

    const projectSelect = controls.createEl("select", { cls: "wjq-task-hub-select" });
    for (const project of this.allProjects()) {
      const option = projectSelect.createEl("option", { text: project, value: project });
      option.selected = project === this.project;
    }
    projectSelect.onchange = () => {
      this.project = projectSelect.value;
      this.renderSafely();
    };

    const search = controls.createEl("input", {
      cls: "wjq-task-hub-search",
      attr: { type: "search", placeholder: "搜索任务或笔记" },
    });
    search.value = this.search;
    search.oninput = () => {
      this.search = search.value;
      this.renderSafely();
    };
  }

  renderProjectProgress(container) {
    const stats = this.projectStats().filter((item) => item.total > 0);
    if (!stats.length) return;

    const section = container.createDiv({ cls: "wjq-task-hub-section" });
    section.createEl("h3", { text: "项目进度" });
    const grid = section.createDiv({ cls: "wjq-task-hub-project-grid" });
    for (const item of stats) {
      const percent = Math.round((item.done / item.total) * 100);
      const card = grid.createDiv({ cls: "wjq-task-hub-project" });
      const top = card.createDiv({ cls: "wjq-task-hub-project-top" });
      top.createEl("span", { text: item.project });
      top.createEl("strong", { text: `${percent}%` });
      const bar = card.createDiv({ cls: "wjq-task-hub-progress" });
      bar.createDiv({ cls: "wjq-task-hub-progress-fill", attr: { style: `width: ${percent}%` } });
      card.createEl("small", {
        text: `${item.done}/${item.total} 已完成${item.overdue ? ` · ${item.overdue} 逾期` : ""}`,
      });
      card.onclick = () => {
        this.project = item.project;
        this.filter = "all";
        this.renderSafely();
      };
    }
  }

  renderTaskList(container) {
    const tasks = this.filteredTasks();
    const section = container.createDiv({ cls: "wjq-task-hub-section" });
    section.createEl("h3", { text: `任务树 · ${tasks.length}` });

    if (!tasks.length) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: "这里暂时没有任务。" });
      return;
    }

    const { roots, childrenByParent } = this.buildTaskTree(tasks);
    for (const task of roots) {
      this.renderTaskRow(section, task, 0, childrenByParent, new Set());
    }
  }

  buildTaskTree(tasks) {
    const byId = new Map();
    for (const task of tasks) {
      if (task.taskId) byId.set(task.taskId, task);
    }

    const childrenByParent = new Map();
    const roots = [];
    for (const task of tasks) {
      if (task.parentId && byId.has(task.parentId)) {
        if (!childrenByParent.has(task.parentId)) childrenByParent.set(task.parentId, []);
        childrenByParent.get(task.parentId).push(task);
      } else {
        roots.push(task);
      }
    }

    return { roots, childrenByParent };
  }

  descendantStats(task, childrenByParent, seen = new Set()) {
    if (!task.taskId || seen.has(task.taskId)) return { total: 0, done: 0 };
    seen.add(task.taskId);
    const children = childrenByParent.get(task.taskId) || [];
    let total = children.length;
    let done = children.filter((child) => child.completed).length;
    for (const child of children) {
      const nested = this.descendantStats(child, childrenByParent, seen);
      total += nested.total;
      done += nested.done;
    }
    return { total, done };
  }

  renderTaskRow(parent, task, depth, childrenByParent, seen) {
    const row = parent.createDiv({ cls: `wjq-task-hub-task ${task.completed ? "is-done" : ""}` });
    row.style.setProperty("--task-depth", String(Math.min(depth, 12)));

    const checkbox = row.createEl("input", { attr: { type: "checkbox" } });
    checkbox.checked = task.completed;
    checkbox.onchange = () => checkbox.checked ? this.plugin.completeTask(task) : this.plugin.toggleTask(task, false);

    const body = row.createDiv({ cls: "wjq-task-hub-task-body" });
    body.createDiv({ cls: "wjq-task-hub-task-title", text: task.displayText || task.text });
    const meta = body.createDiv({ cls: "wjq-task-hub-task-meta" });
    meta.createSpan({ text: task.projects.length ? task.projects.join(", ") : "未设项目" });
    if (task.statuses.length) meta.createSpan({ text: ` · ${task.statuses.join(", ")}` });
    if (task.due) meta.createSpan({ text: ` · ${task.due}` });
    const childStats = this.descendantStats(task, childrenByParent);
    if (childStats.total) meta.createSpan({ text: ` · 子任务 ${childStats.done}/${childStats.total}` });
    meta.createSpan({ text: ` · ${task.path}:${task.lineNumber}` });

    const actions = row.createDiv({ cls: "wjq-task-hub-task-actions" });
    this.createButton(actions, "编辑", () => this.plugin.activateTaskDetailView(task));
    this.createButton(actions, "日期", () => new DateModal(this.plugin, task).open());
    this.createButton(actions, "结构", () => this.plugin.activateTaskDetailView(task));
    if (task.parentId) {
      this.createButton(actions, "脱离", () => this.plugin.clearParent(task));
    }
    this.createButton(actions, "打开", () => this.plugin.openTaskSource(task));
    this.attachContextMenu(row, this.taskContextActions(task));

    if (!task.taskId || seen.has(task.taskId)) return;
    seen.add(task.taskId);
    const children = childrenByParent.get(task.taskId) || [];
    for (const child of children) {
      this.renderTaskRow(parent, child, depth + 1, childrenByParent, seen);
    }
  }

  renderCalendar(container) {
    const section = container.createDiv({ cls: "wjq-task-hub-section" });
    this.renderCalendarShell(
      section,
      this.tasks.filter((item) => this.isCalendarTask(item) && this.matchesProjectAndSearch(item) && !(this.plugin.settings.homeHideCompleted && item.completed)),
      "没有设置日期的任务不会显示在日历里，也不会被强制排期。"
    );
  }

  renderCalendarShell(section, tasks, note) {
    const header = section.createDiv({ cls: "wjq-task-hub-calendar-header" });
    this.createButton(header, "上月", () => {
      this.calendarDate = dateFromParts(this.calendarDate.getFullYear(), this.calendarDate.getMonth() - 1, 1);
      this.renderSafely();
    });
    header.createEl("h3", { text: `${monthKey(this.calendarDate)} 日历` });
    this.createButton(header, "下月", () => {
      this.calendarDate = dateFromParts(this.calendarDate.getFullYear(), this.calendarDate.getMonth() + 1, 1);
      this.renderSafely();
    });

    if (note) section.createDiv({ cls: "wjq-task-hub-calendar-note", text: note });
    this.renderMonthSpanCalendar(section, tasks);
  }

  calendarNewTaskDefaults(date) {
    const defaults = { due: date, sourcePath: "", insertLine: -1 };
    if (this.currentTask && this.currentTask.projects && this.currentTask.projects[0]) {
      defaults.project = this.currentTask.projects[0];
      defaults.parentKey = this.currentTask.runtimeId;
    } else if (this.project && this.project !== "全部" && this.project !== "鍏ㄩ儴") {
      defaults.project = this.project;
    }
    return defaults;
  }

  calendarDateFromWeekPointer(event, weekStart, host) {
    const start = parseLocalDate(weekStart);
    if (!event || !start) return weekStart;
    const rect = (host || event.currentTarget).getBoundingClientRect();
    const width = Math.max(1, rect.width || 1);
    const x = Math.max(0, Math.min(width - 1, event.clientX - rect.left));
    const column = Math.max(0, Math.min(6, Math.floor((x / width) * 7)));
    return localDateString(addDays(start, column));
  }

  renderMonthSpanCalendar(parent, tasks) {
    const year = this.calendarDate.getFullYear();
    const month = this.calendarDate.getMonth();
    const firstOfMonth = dateFromParts(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = firstOfMonth.getDay();
    const mondayFirstOffset = (firstDay + 6) % 7;
    const totalDays = Math.ceil((mondayFirstOffset + daysInMonth) / 7) * 7;
    const calendarStart = localDateString(addDays(firstOfMonth, -mondayFirstOffset));
    const currentMonth = monthKey(this.calendarDate);
    const board = parent.createDiv({ cls: "wjq-calendar-span-board" });
    const weekdays = board.createDiv({ cls: "wjq-calendar-span-weekdays" });
    for (const label of ["一", "二", "三", "四", "五", "六", "日"]) {
      weekdays.createDiv({ cls: "wjq-calendar-span-weekday", text: label });
    }

    const scheduledTasks = tasks
      .filter((task) => this.isCalendarTask(task))
      .map((task) => ({
        task,
        start: this.calendarTaskStartDate(task),
        end: this.calendarTaskEndDate(task),
      }))
      .filter((item) => item.start && item.end)
      .sort((a, b) => {
        if (a.start !== b.start) return a.start.localeCompare(b.start);
        const aLength = dateDiffDays(a.start, a.end);
        const bLength = dateDiffDays(b.start, b.end);
        if (aLength !== bLength) return bLength - aLength;
        return (a.task.displayText || a.task.text).localeCompare(b.task.displayText || b.task.text);
      });

    for (let weekOffset = 0; weekOffset < totalDays; weekOffset += 7) {
      const weekStart = localDateString(addDays(parseLocalDate(calendarStart), weekOffset));
      const weekEnd = localDateString(addDays(parseLocalDate(weekStart), 6));
      const week = board.createDiv({ cls: "wjq-calendar-span-week" });
      week.ondragover = (event) => {
        event.preventDefault();
        week.addClass("is-drop-target");
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      };
      week.ondragleave = () => week.removeClass("is-drop-target");
      week.ondrop = async (event) => {
        event.preventDefault();
        week.removeClass("is-drop-target");
        const dragId = event.dataTransfer ? event.dataTransfer.getData("application/x-wjq-task") || event.dataTransfer.getData("text/plain") : "";
        if (!dragId) return;
        const rect = week.getBoundingClientRect();
        const column = Math.max(0, Math.min(6, Math.floor(((event.clientX - rect.left) / rect.width) * 7)));
        const nextDue = localDateString(addDays(parseLocalDate(weekStart), column));
        const draggedTask = tasks.find((item) => item.taskId === dragId || item.runtimeId === dragId) ||
          this.tasks.find((item) => item.taskId === dragId || item.runtimeId === dragId);
        if (draggedTask) await this.plugin.moveTaskSchedule(draggedTask, nextDue);
      };
      const dayGrid = week.createDiv({ cls: "wjq-calendar-span-days" });
      for (let index = 0; index < 7; index += 1) {
        const date = localDateString(addDays(parseLocalDate(weekStart), index));
        const day = dayGrid.createDiv({ cls: `wjq-calendar-span-day ${date.startsWith(currentMonth) ? "" : "is-outside"} ${date === localDateString() ? "is-today" : ""}` });
        day.dataset.date = date;
        day.createDiv({ cls: "wjq-calendar-span-day-number", text: String(Number(date.slice(-2))) });
        this.attachContextMenu(day, [
          { title: "新增任务", icon: "plus", callback: () => this.plugin.openSidebarNewTaskFromSelection(this.calendarNewTaskDefaults(date)) },
        ]);
      }

      const eventGrid = week.createDiv({ cls: "wjq-calendar-span-events" });
      const occupiedRows = [];
      const firstAvailableRow = (startColumn, endColumn) => {
        for (let rowIndex = 0; rowIndex < occupiedRows.length; rowIndex += 1) {
          const occupied = occupiedRows[rowIndex];
          let free = true;
          for (let column = startColumn; column <= endColumn; column += 1) {
            if (occupied.has(column)) {
              free = false;
              break;
            }
          }
          if (free) return rowIndex + 1;
        }
        occupiedRows.push(new Set());
        return occupiedRows.length;
      };
      const occupyRow = (row, startColumn, endColumn) => {
        const occupied = occupiedRows[row - 1];
        for (let column = startColumn; column <= endColumn; column += 1) occupied.add(column);
      };
      for (const item of scheduledTasks) {
        if (item.start > weekEnd || item.end < weekStart) continue;
        const segmentStart = item.start > weekStart ? item.start : weekStart;
        const segmentEnd = item.end < weekEnd ? item.end : weekEnd;
        const startColumn = dateDiffDays(weekStart, segmentStart) + 1;
        const span = dateDiffDays(segmentStart, segmentEnd) + 1;
        const endColumn = startColumn + span - 1;
        const row = firstAvailableRow(startColumn, endColumn);
        occupyRow(row, startColumn, endColumn);
        const task = item.task;
        const bar = eventGrid.createDiv({
          cls: `wjq-calendar-span-task ${task.completed ? "is-done" : ""} ${item.start < weekStart ? "continues-left" : ""} ${item.end > weekEnd ? "continues-right" : ""}`,
          attr: { title: `${task.displayText || task.text} ${this.calendarTaskRangeLabel(task)}`.trim() },
        });
        bar.style.gridColumn = `${startColumn} / span ${span}`;
        bar.style.gridRow = String(row);
        bar.draggable = true;
        bar.ondragstart = (event) => {
          const dragId = task.taskId || task.runtimeId;
          if (!dragId || !event.dataTransfer) return;
          event.dataTransfer.setData("application/x-wjq-task", dragId);
          event.dataTransfer.setData("text/plain", dragId);
          event.dataTransfer.effectAllowed = "move";
        };
        bar.onclick = () => this.openTaskByDefault(task);
        const checkbox = bar.createEl("input", { attr: { type: "checkbox", title: "完成/取消完成" } });
        checkbox.checked = task.completed;
        checkbox.onclick = (event) => {
          event.stopPropagation();
          checkbox.dataset.completeDate = this.calendarDateFromWeekPointer(event, weekStart, week);
        };
        checkbox.onchange = () => {
          const completeDate = checkbox.dataset.completeDate || segmentStart;
          return checkbox.checked ? this.plugin.completeTaskOnDate(task, completeDate) : this.plugin.toggleTask(task, false);
        };
        bar.createSpan({ cls: "wjq-calendar-span-title", text: task.displayText || task.text });
        this.attachContextMenu(bar, (event) => this.taskContextActions(task, {
          completeDate: this.calendarDateFromWeekPointer(event, weekStart, week),
        }));
      }
    }
  }

  calendarTaskRangeLabel(task) {
    if (!task) return "";
    const start = this.calendarTaskStartDate ? this.calendarTaskStartDate(task) : task.due;
    const end = this.calendarTaskEndDate ? this.calendarTaskEndDate(task) : this.taskEndDate(task);
    if (!start) return "";
    return end && end !== start ? `${start} 至 ${end}` : start;
  }

  createStat(parent, label, value) {
    const item = parent.createDiv({ cls: "wjq-task-hub-stat" });
    item.createEl("strong", { text: String(value) });
    item.createEl("span", { text: label });
  }

  runViewAction(callback, event, label = "操作") {
    try {
      const result = callback ? callback(event) : undefined;
      if (result && typeof result.then === "function") {
        result.catch((error) => this.plugin.reportTaskHubError(`${label}失败`, error));
      }
      return result;
    } catch (error) {
      this.plugin.reportTaskHubError(`${label}失败`, error);
      return undefined;
    }
  }

  createButton(parent, text, callback) {
    const button = parent.createEl("button", { text });
    button.onclick = (event) => this.runViewAction(callback, event, text);
    return button;
  }

  attachContextMenu(element, actions) {
    element.oncontextmenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = new Menu();
      let items = [];
      try {
        items = typeof actions === "function" ? actions(event) : actions;
      } catch (error) {
        this.plugin.reportTaskHubError("右键菜单打开失败", error);
        return;
      }
      for (const action of (items || []).filter(Boolean)) {
        if (action.separator) {
          if (typeof menu.addSeparator === "function") menu.addSeparator();
          continue;
        }
        menu.addItem((item) => {
          item.setTitle(action.title);
          if (action.icon) item.setIcon(action.icon);
          item.onClick(() => this.runViewAction(action.callback, null, action.title || "右键菜单"));
        });
      }
      menu.showAtMouseEvent(event);
    };
  }

  taskContextActions(task, options = {}) {
    const actions = [];
    if (options.rename !== false) actions.push({ title: "重命名", icon: "pencil", callback: () => this.openRenameTaskModal(task) });
    actions.push(task.completed
      ? { title: "取消完成", icon: "rotate-ccw", callback: () => this.plugin.toggleTask(task, false) }
      : { title: "完成任务", icon: "check", callback: () => this.plugin.completeTask(task) });
    if (!task.completed && options.completeDate) {
      actions.push({ title: "当天完成", icon: "calendar-check", callback: () => this.plugin.completeTaskOnDate(task, options.completeDate) });
    }
    actions.push({ title: "设置日期", icon: "calendar", callback: () => new DateModal(this.plugin, task).open() });
    actions.push({ title: "编辑任务", icon: "settings-2", callback: () => this.plugin.activateTaskDetailView(task) });
    actions.push({ separator: true });
    actions.push({ title: "打开完整页", icon: "panel-top-open", callback: () => this.plugin.activateTaskFullPage(task) });
    actions.push({ separator: true });
    actions.push({ title: "新增下级任务", icon: "list-plus", callback: () => this.openRelatedTaskInSidebar(task, "child") });
    actions.push({ title: "新增后续任务", icon: "corner-down-right", callback: () => this.openRelatedTaskInSidebar(task, "next") });
    actions.push({ separator: true });
    actions.push({ title: task.taskPage ? "打开任务页" : "创建任务页", icon: "notebook-tabs", callback: () => this.plugin.openTaskPageNote(task) });
    actions.push({ title: "打开来源", icon: "file-text", callback: () => this.plugin.openTaskSource(task) });
    actions.push({ separator: true });
    actions.push({ title: "记录推进", icon: "message-square-plus", callback: () => new ProgressRecordModal(this.plugin, task).open() });
    actions.push({ title: "查看任务判定", icon: "help-circle", callback: () => this.openTaskDiagnosis(task) });
    actions.push({ separator: true });
    actions.push({ title: "删除任务", icon: "trash-2", callback: () => this.plugin.deleteTask(task) });
    return actions;
  }

  openRelatedTaskInSidebar(task, relation) {
    return this.plugin.openSidebarNewTaskFromSelection({
      project: task.projects[0] || "",
      status: "待开始",
      parentKey: relation === "child" ? task.runtimeId : "",
      blockedByKey: relation === "next" ? task.runtimeId : "",
      due: "",
      deadline: "",
      hardDeadline: "",
      progress: "",
      sourcePath: "",
      insertLine: -1,
    });
  }

  openTaskDiagnosis(task) {
    new TaskDiagnosisModal(this.plugin, this, task).open();
  }

  taskPlacementInfo(task) {
    const rows = [];
    const add = (label, value) => rows.push({ label, value: value || "无" });
    const childCount = task && task.taskId ? this.taskChildrenOf(task).length : 0;
    const openDescendantCount = (source, seen = new Set()) => {
      if (!source || !source.taskId || seen.has(source.taskId)) return 0;
      seen.add(source.taskId);
      let count = 0;
      for (const child of this.taskChildrenOf(source)) {
        const childDone = child.completed || /完成|取消|归档/.test(taskStatusText(child));
        if (!childDone) count += 1;
        count += openDescendantCount(child, seen);
      }
      return count;
    };
    const hasOpenChildren = this.taskHasOpenDescendants ? this.taskHasOpenDescendants(task) : this.taskHasOpenChildren(task);
    const isCalendar = this.isCalendarTask(task);
    const isUnscheduled = this.isUnscheduledTask ? this.isUnscheduledTask(task) : (!!task && !task.completed && !task.due && !task.deadline);
    const start = this.calendarTaskStartDate ? this.calendarTaskStartDate(task) : (task && task.due);
    const end = this.calendarTaskEndDate ? this.calendarTaskEndDate(task) : this.taskEndDate(task);
    const status = this.homeTaskBadge ? this.homeTaskBadge(task) : taskStatusText(task);

    add("任务", task.displayText || task.text);
    add("项目", task.projects.join(", ") || "未设项目");
    add("状态显示", status);
    add("开始日期", task.due || "未设置");
    add("截止日期", task.hardDeadline || "无");
    add("计划完成", task.deadline || task.plannedAt || "未设置");
    add("实际完成", task.completedAt || "未完成");
    add("下级任务", childCount ? `${childCount} 个；${hasOpenChildren ? "仍有未完成下级" : "下级均已完成"}` : "没有下级任务");

    if (isCalendar) {
      add("日历判定", `进入日历：${start}${end && end !== start ? ` 至 ${end}` : ""}`);
    } else if (hasOpenChildren) {
      add("日历判定", "不进入日历：存在未完成下级任务，作为阶段任务看待");
    } else if (!task.due && !task.completedAt) {
      add("日历判定", "不进入日历：没有开始日期或实际完成日期");
    } else {
      add("日历判定", "暂不进入日历：日期或状态不满足当前日历规则");
    }

    if (!task.completed && task.due && !isCalendar && !isUnscheduled) {
      add("当前推进判定", "进入当前推进：已有开始日期，但因阶段/下级规则不进日历");
    } else {
      add("当前推进判定", "不进入当前推进");
    }

    add("待排期判定", isUnscheduled ? "进入待排期：没有开始日期、计划完成，也未完成" : "不进入待排期");
    add("来源", `${task.path}:${task.lineNumber}`);
    let explanation = "";
    if (isCalendar) {
      explanation = end && end !== start
        ? `这个任务会进入日历，因为它没有未完成下级任务，并且有明确日期范围：${start} 至 ${end}。`
        : `这个任务会进入日历，因为它没有未完成下级任务，并且有明确日期：${start}。`;
    } else if (hasOpenChildren) {
      const count = openDescendantCount(task);
      explanation = `这个任务没有进入日历，因为它下面还有 ${count || childCount} 个未完成下级任务。建议你排期它的下级任务，而不是母任务。`;
    } else if (isUnscheduled) {
      explanation = "这个任务还没有开始日期或计划完成，所以会留在待排期里；给它设置开始日期后，它才会进入后续推进判断。";
    } else if (task.completed) {
      explanation = "这个任务已经完成，会按实际完成日期或原日期显示；如果开启隐藏已完成，它会从部分列表中隐藏。";
    } else {
      explanation = "这个任务目前没有命中主要视图规则。你可以检查开始日期、计划完成、实际完成和下级任务状态。";
    }
    add("解释", explanation);
    return rows;
  }

  openRenamePathModal(path, currentName) {
    new RenameModal(
      this.plugin,
      "重命名内容",
      currentName || path.split("/").pop().replace(/\.md$/i, ""),
      (nextName) => this.plugin.renamePath(path, nextName),
      "会直接重命名 Obsidian 中的笔记或文件夹。"
    ).open();
  }

  openRenameProjectModal(project) {
    new RenameModal(
      this.plugin,
      "重命名项目",
      project,
      async (nextName) => {
        const saved = await this.plugin.renameProject(project, nextName);
        if (saved && this.project === project) this.project = nextName.trim();
        return saved;
      },
      "会同步修改任务中的项目标签。"
    ).open();
  }

  openRenameStatusModal(status) {
    new RenameModal(
      this.plugin,
      "重命名状态",
      status,
      (nextName) => this.plugin.renameStatus(status, nextName),
      "会同步修改任务中的状态标签。"
    ).open();
  }

  taskStatusChoices(includeCompleted = true) {
    return availableTaskStatusChoices(this.plugin.settings.activeStatusNames, includeCompleted);
  }

  openRenameTaskModal(task) {
    new RenameModal(
      this.plugin,
      "重命名任务",
      task.displayText || task.text,
      (nextName) => this.plugin.renameTaskTitle(task, nextName),
      "只修改任务标题，项目、日期和父子关系保持不变。"
    ).open();
  }

  renderSidebarNewTaskEditor(container, draft) {
    const panel = container.createDiv({ cls: "wjq-sidebar-editor" });
    const header = panel.createDiv({ cls: "wjq-task-side-editor-header" });
    header.createEl("h2", { text: "新建任务" });
    const headerActions = header.createDiv({ cls: "wjq-task-side-editor-actions" });

    const state = Object.assign({
      title: "",
      project: "",
      status: "待开始",
      due: "",
      deadline: "",
      hardDeadline: "",
      completedAt: "",
      progress: "",
      priority: "",
      parentKey: "",
      childKeys: [],
      blockedByKey: "",
      nextKeys: [],
      linkedNotePath: "",
      repeatEnabled: false,
      repeatDays: "",
      repeatParentTitle: "",
    }, draft);
    if (state.childKey && !state.childKeys.length) state.childKeys = [state.childKey];
    if (state.nextKey && !state.nextKeys.length) state.nextKeys = [state.nextKey];
    const tasks = this.tasks;
    const taskByKey = (key) => tasks.find((task) => task.runtimeId === key) || null;
    const markdownFiles = this.plugin.app.vault.getMarkdownFiles();

    const body = panel.createDiv({ cls: "wjq-task-side-editor-body" });
    if (draft.sourcePath) {
      if (!state.linkedNotePath) state.linkedNotePath = draft.sourcePath;
    }
    this.renderSideTextField(body, "任务", state.title, (value) => (state.title = value));
    this.renderSideChoiceBlock(body, "所属项目", this.allProjects().filter((project) => project !== "全部" && project !== "鍏ㄩ儴"), state.project, (value) => (state.project = value), "", "project");
    this.renderSideChoiceBlock(body, "状态", this.taskStatusChoices(true), state.status, (value) => (state.status = value), "", "status");
    this.renderSideNoteSelect(body, "关联笔记", markdownFiles, state.linkedNotePath, (value) => (state.linkedNotePath = value));
    const dateGrid = body.createDiv({ cls: "wjq-task-side-editor-grid" });
    this.renderSideTextField(dateGrid, "开始日期", dateInputValue(state.due), (value) => (state.due = value), `${currentYearMonth()}-`);
    this.renderSideTextField(dateGrid, "截止日期", dateInputValue(state.hardDeadline), (value) => (state.hardDeadline = value), `${currentYearMonth()}-`);
    this.renderSideTextField(dateGrid, "计划完成", dateInputValue(state.deadline), (value) => (state.deadline = value), `${currentYearMonth()}-`);
    this.renderSideTextField(dateGrid, "实际完成", dateInputValue(state.completedAt), (value) => (state.completedAt = value), `${currentYearMonth()}-`);
    this.renderSideTextField(dateGrid, "进度", state.progress, (value) => (state.progress = value), "65 / 4/16章");

    const repeatBlock = body.createDiv({ cls: "wjq-task-side-field wjq-task-side-repeat-field" });
    repeatBlock.createDiv({ cls: "wjq-task-side-label", text: "重复任务" });
    const repeatBody = repeatBlock.createDiv({ cls: "wjq-task-side-repeat-body" });
    const repeatToggle = repeatBody.createEl("label", { cls: "wjq-task-side-repeat-toggle" });
    const repeatCheckbox = repeatToggle.createEl("input", { attr: { type: "checkbox" } });
    repeatCheckbox.checked = !!state.repeatEnabled;
    repeatToggle.createSpan({ text: "连续多天创建" });
    repeatCheckbox.onchange = () => {
      state.repeatEnabled = repeatCheckbox.checked;
      repeatBody.toggleClass("is-enabled", !!state.repeatEnabled);
    };
    const repeatInputs = repeatBody.createDiv({ cls: "wjq-task-side-repeat-inputs" });
    const repeatDaysInput = repeatInputs.createEl("input", {
      attr: { type: "number", min: "2", max: "366", placeholder: "天数，如 9" },
    });
    repeatDaysInput.value = String(state.repeatDays || "");
    repeatDaysInput.oninput = () => {
      state.repeatDays = repeatDaysInput.value;
      if (Number(state.repeatDays) > 1) {
        state.repeatEnabled = true;
        repeatCheckbox.checked = true;
        repeatBody.addClass("is-enabled");
      }
    };
    const repeatParentInput = repeatInputs.createEl("input", {
      attr: { type: "text", placeholder: "自动母任务名称，未填则用任务名" },
    });
    repeatParentInput.value = state.repeatParentTitle || "";
    repeatParentInput.oninput = () => (state.repeatParentTitle = repeatParentInput.value);
    repeatBody.createDiv({ cls: "wjq-task-side-repeat-hint", text: "未填开始日期时，从今天开始；已选上级任务时，不再新建母任务。" });
    repeatBody.toggleClass("is-enabled", !!state.repeatEnabled);

    const structure = body.createDiv({ cls: "wjq-task-side-relations" });
    structure.createDiv({ cls: "wjq-task-side-label", text: "任务结构" });
    this.renderSideTaskSelect(structure, "上级任务", tasks, state.parentKey, (value) => (state.parentKey = value), [
      ["移除", ({ clear }) => clear()],
    ]);
    this.renderSideTaskSelect(structure, "下级任务", tasks, state.childKeys, (value) => (state.childKeys = value));
    this.renderSideTaskSelect(structure, "前置任务", tasks, state.blockedByKey, (value) => (state.blockedByKey = value), [
      ["移除", ({ clear }) => clear()],
    ]);
    this.renderSideTaskSelect(structure, "后续任务", tasks, state.nextKeys, (value) => (state.nextKeys = value));

    const saveNewTask = async () => {
      const saveSession = Number(this.plugin.settings.sidebarSession) || 0;
      const parentTask = taskByKey(state.parentKey);
      const blockedByTask = taskByKey(state.blockedByKey);
      const payload = {
        title: state.title,
        project: state.project,
        status: state.status,
        due: state.due,
        deadline: state.deadline,
        hardDeadline: state.hardDeadline,
        completedAt: state.completedAt,
        progress: state.progress,
        parentId: parentTask ? await this.plugin.ensureTaskId(parentTask) : "",
        blockedBy: blockedByTask ? await this.plugin.ensureTaskId(blockedByTask) : "",
        childTasks: (state.childKeys || []).map(taskByKey).filter(Boolean),
        nextTasks: (state.nextKeys || []).map(taskByKey).filter(Boolean),
        sourcePath: draft.sourcePath,
        insertLine: draft.insertLine,
        linkSourceToMaterials: !!draft.sourcePath,
        materials: draft.sourcePath ? this.plugin.materialLinkForPath(draft.sourcePath) : "",
        linkedNotePath: state.linkedNotePath,
      };
      const repeatCount = Math.floor(Number(state.repeatDays || 0));
      const saved = state.repeatEnabled || repeatCount > 1
        ? await this.plugin.createRepeatedHiddenTasksFromDraft(Object.assign({}, payload, {
            repeatCount,
            repeatParentTitle: state.repeatParentTitle,
          }))
        : await this.plugin.createHiddenTaskFromDraft(payload);
      if (saved) {
        const closed = await this.plugin.closeTaskSideEditorIfUnchanged(saveSession);
        if (!closed) await this.plugin.refreshViews();
      }
    };
    this.createButton(headerActions, "返回", () => this.plugin.closeTaskSideEditor());
    const save = this.createButton(headerActions, "保存", saveNewTask);
    save.addClass("mod-cta");
  }

  renderSidebarTaskLinker(container, draft) {
    const panel = container.createDiv({ cls: "wjq-sidebar-editor wjq-sidebar-task-linker-editor" });
    const header = panel.createDiv({ cls: "wjq-task-side-editor-header" });
    header.createEl("h2", { text: "关联任务" });
    const headerActions = header.createDiv({ cls: "wjq-task-side-editor-actions" });
    this.createButton(headerActions, "返回", () => this.plugin.closeTaskSideEditor());

    const sourcePath = normalizePath(draft.sourcePath || draft.linkedNotePath || "");
    const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
    const markdownFiles = this.plugin.app.vault.getMarkdownFiles();
    const state = {
      selectedTaskKeys: Array.isArray(draft.selectedTaskKeys) ? draft.selectedTaskKeys.slice() : [],
      linkedNotePath: sourcePath,
    };
    const tasks = this.tasks;
    const taskByKey = (key) => tasks.find((task) => task.runtimeId === key) || null;

    const body = panel.createDiv({ cls: "wjq-task-side-editor-body wjq-task-linker-body" });
    this.renderSideNoteSelect(
      body,
      "关联笔记",
      markdownFiles,
      state.linkedNotePath,
      (value) => (state.linkedNotePath = value),
      "wjq-task-linker-note-select"
    );
    const noteBlock = body.createDiv({ cls: "wjq-task-linker-note-block" });
    noteBlock.createDiv({ cls: "wjq-task-side-label", text: "当前笔记" });
    noteBlock.createDiv({ cls: "wjq-task-side-static-value", text: file instanceof TFile ? shortNoteLabel(file) : sourcePath });
    this.renderSideTaskSelect(
      body,
      "选择任务",
      tasks,
      state.selectedTaskKeys,
      (value) => (state.selectedTaskKeys = Array.isArray(value) ? value : (value ? [value] : [])),
      [],
      "wjq-task-linker-task-select wjq-task-linker-task-select-full"
    );

    const saveLink = async () => {
      const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(state.linkedNotePath || ""));
      if (!(file instanceof TFile)) {
        new Notice("找不到要关联的当前笔记");
        return;
      }
      const selectedTasks = (state.selectedTaskKeys || []).map(taskByKey).filter(Boolean);
      if (!selectedTasks.length) {
        new Notice("请至少选择一个任务");
        return;
      }
      const saveSession = Number(this.plugin.settings.sidebarSession) || 0;
      for (const task of selectedTasks) {
        await this.plugin.addMaterialToTask(task, file.path, { silent: true, skipRefresh: true });
      }
      new Notice(`已关联 ${selectedTasks.length} 个任务`);
      const closed = await this.plugin.closeTaskSideEditorIfUnchanged(saveSession);
      if (!closed) await this.plugin.refreshViews();
    };
    const save = this.createButton(headerActions, "保存关联", saveLink);
    save.addClass("mod-cta");
    const footer = panel.createDiv({ cls: "wjq-task-side-editor-footer" });
    const footerSave = footer.createEl("button", { text: "保存关联" });
    footerSave.addClass("mod-cta");
    footerSave.onclick = saveLink;
  }

  renderCurrentNoteTaskLinker(parent, sourcePath, tasks) {
    const block = parent.createDiv({ cls: "wjq-task-side-field wjq-current-note-linker" });
    block.createDiv({ cls: "wjq-task-side-label", text: "当前笔记关联" });
    const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(sourcePath));
    block.createDiv({ cls: "wjq-task-side-static-value", text: file instanceof TFile ? file.basename : sourcePath });
    let selectedKey = "";
    this.renderSideTaskSelect(block, "选择已有任务", tasks, selectedKey, (value) => (selectedKey = value), [], "wjq-task-linker-task-select");
    const actions = block.createDiv({ cls: "wjq-task-side-link-actions" });
    const linkButton = this.createButton(actions, "加入所选任务材料", async () => {
      const selectedTask = tasks.find((task) => task.runtimeId === selectedKey);
      if (!selectedTask) {
        new Notice("请先选择一个已有任务");
        return;
      }
      const saved = await this.plugin.addMaterialToTask(selectedTask, sourcePath);
      if (saved) await this.plugin.closeTaskSideEditor();
    });
    linkButton.addClass("mod-cta");
  }

  renderSideNoteSelect(parent, label, files, selectedPath, onChange, extraClass = "") {
    const field = parent.createDiv({ cls: `wjq-task-side-field wjq-task-side-note-select ${extraClass}`.trim() });
    field.createDiv({ cls: "wjq-task-side-label wjq-task-side-subrelation-label", text: label });
    let selected = normalizePath(selectedPath || "");
    const control = field.createDiv({ cls: "wjq-task-side-relation-picker" });
    const inputRow = control.createDiv({ cls: "wjq-task-side-relation-input-row" });
    const input = inputRow.createEl("input", { attr: { type: "text", placeholder: "输入笔记关键词" } });
    const actionBar = inputRow.createDiv({ cls: "wjq-task-side-relation-inline-actions" });
    const clearButton = this.createButton(actionBar, "移除", (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      selected = "";
      input.value = "";
      onChange("");
      renderResults();
    });
    clearButton.onmousedown = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const resultWrap = control.createDiv({ cls: "wjq-task-side-relation-results" });
    const selectedLabel = () => {
      const file = files.find((item) => item.path === selected);
      return file ? shortNoteLabel(file) : selected;
    };
    let open = false;
    const renderResults = () => {
      resultWrap.empty();
      resultWrap.toggleClass("is-open", open);
      if (!open) return;
      const query = input.value.trim().toLowerCase();
      const matches = files
        .filter((file) => file.path !== selected)
        .filter((file) => {
          if (!query) return true;
          return `${file.basename} ${file.path}`.toLowerCase().includes(query);
        })
        .slice(0, 80);
      for (const file of matches) {
        const button = resultWrap.createEl("button", { text: shortNoteLabel(file) });
        button.onmousedown = (event) => event.preventDefault();
        button.onclick = () => {
          selected = file.path;
          input.value = selectedLabel();
          open = false;
          onChange(selected);
          renderResults();
        };
      }
      if (!matches.length && query) resultWrap.createDiv({ cls: "wjq-task-hub-empty", text: "没有匹配笔记" });
    };
    input.onfocus = () => {
      open = true;
      input.value = "";
      renderResults();
    };
    input.onblur = () => {
      window.setTimeout(() => {
        open = false;
        input.value = selectedLabel();
        renderResults();
      }, 120);
    };
    input.oninput = () => {
      open = true;
      if (!input.value.trim()) {
        selected = "";
        onChange("");
      }
      renderResults();
    };
    input.value = selectedLabel();
  }

  renderSideMaterialNoteAdder(parent, task) {
    const field = parent.createDiv({ cls: "wjq-task-side-field wjq-task-side-note-select wjq-task-side-material-note" });
    field.createDiv({ cls: "wjq-task-side-label wjq-task-side-subrelation-label", text: "关联笔记" });
    const body = field.createDiv({ cls: "wjq-task-side-material-note-body" });
    const currentPaths = this.plugin.materialNotePathsFromText(task.materials || "");
    const selectedWrap = body.createDiv({ cls: "wjq-task-side-selected-relations" });
    if (currentPaths.length) {
      for (const path of currentPaths.slice(0, 8)) {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        const chip = selectedWrap.createEl("button", {
          cls: "wjq-task-side-relation-chip",
          text: file instanceof TFile ? shortNoteLabel(file) : path,
        });
        chip.onclick = () => this.plugin.openMaterialTarget(path);
      }
    } else {
      selectedWrap.createDiv({ cls: "wjq-task-hub-empty", text: "还没有关联笔记" });
    }
    let selectedPath = "";
    this.renderSideNoteSelect(body, "添加笔记", this.plugin.app.vault.getMarkdownFiles(), selectedPath, (value) => (selectedPath = value), "wjq-material-note-select");
    const actions = body.createDiv({ cls: "wjq-task-side-link-actions" });
    const add = this.createButton(actions, "添加", async () => {
      if (!selectedPath) {
        new Notice("请先选择一篇笔记");
        return;
      }
      const saved = await this.plugin.addMaterialToTask(task, selectedPath);
      if (saved) await this.plugin.activateTaskDetailView(task);
    });
    add.addClass("mod-cta");
  }

  renderSideTaskSelect(parent, label, tasks, selectedKey, onChange, actions = [], extraClass = "") {
    const field = parent.createDiv({ cls: "wjq-task-side-field" });
    field.addClass("wjq-task-side-relation-select");
    // Element#addClass 接受单个类名；关联任务面板会传入多个类名。
    for (const className of String(extraClass || "").split(/\s+/).filter(Boolean)) field.addClass(className);
    field.createDiv({ cls: "wjq-task-side-label wjq-task-side-subrelation-label", text: label });
    const multiple = Array.isArray(selectedKey);
    let selected = multiple ? selectedKey.slice() : (selectedKey ? [selectedKey] : []);
    const control = field.createDiv({ cls: "wjq-task-side-relation-picker" });
    const inputRow = control.createDiv({ cls: "wjq-task-side-relation-input-row" });
    const input = inputRow.createEl("input", { attr: { type: "text", placeholder: "输入任务关键词" } });
    if (actions.length) {
      const actionBar = inputRow.createDiv({ cls: "wjq-task-side-relation-inline-actions" });
      for (const [actionLabel, callback] of actions) {
        const actionButton = this.createButton(actionBar, actionLabel, (event) => {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          callback({
            clear: () => {
              selected = [];
              input.value = "";
              commit();
              renderSelected();
              renderResults();
            },
          });
        });
        actionButton.onmousedown = (event) => {
          event.preventDefault();
          event.stopPropagation();
        };
      }
    }
    const selectedWrap = control.createDiv({ cls: "wjq-task-side-selected-relations" });
    const resultWrap = control.createDiv({ cls: "wjq-task-side-relation-results" });
    const persistentResults = String(extraClass || "").split(/\s+/).includes("wjq-task-linker-task-select-full");
    let open = persistentResults;
    const commit = () => onChange(multiple ? selected.slice() : (selected[0] || ""));
    const selectedLabel = () => {
      const task = tasks.find((item) => item.runtimeId === selected[0]);
      return task ? shortTaskLabel(task) : "";
    };
    const renderSelected = () => {
      selectedWrap.empty();
      if (!multiple) {
        input.value = selectedLabel();
        return;
      }
      for (const key of selected) {
        const task = tasks.find((item) => item.runtimeId === key);
        if (!task) continue;
        const chip = selectedWrap.createEl("button", { cls: "wjq-task-side-relation-chip", text: shortTaskLabel(task) });
        chip.onclick = () => {
          selected = selected.filter((item) => item !== key);
          commit();
          renderSelected();
          renderResults();
        };
      }
    };
    const renderResults = () => {
      resultWrap.empty();
      resultWrap.toggleClass("is-open", open);
      if (!open) return;
      const query = input.value.trim().toLowerCase();
      const matches = tasks
        .filter((task) => !selected.includes(task.runtimeId))
        .filter((task) => {
          if (!query) return true;
          return `${task.displayText || task.text} ${(task.projects || []).join(" ")} ${task.path || ""}`.toLowerCase().includes(query);
        });
      for (const task of matches) {
        const button = resultWrap.createEl("button", { text: shortTaskLabel(task) });
        button.onmousedown = (event) => event.preventDefault();
        button.onclick = () => {
          selected = multiple ? uniq([...selected, task.runtimeId]) : [task.runtimeId];
          input.value = "";
          open = persistentResults || multiple;
          commit();
          renderSelected();
          renderResults();
        };
      }
      if (!matches.length && query) resultWrap.createDiv({ cls: "wjq-task-hub-empty", text: "没有匹配任务" });
    };
    input.onfocus = () => {
      open = true;
      if (!multiple) input.value = "";
      renderResults();
    };
    input.onblur = () => {
      window.setTimeout(() => {
        open = persistentResults;
        if (!multiple) input.value = selectedLabel();
        renderResults();
      }, 120);
    };
    input.oninput = () => {
      open = true;
      if (!multiple && !input.value.trim()) {
        selected = [];
        commit();
      }
      renderResults();
    };
    renderSelected();
    renderResults();
  }

  openRenameQuickEntryModal(entry) {
    if ((entry.type === "note" || entry.type === "folder") && entry.target) {
      const target = this.plugin.app.vault.getAbstractFileByPath(normalizePath(entry.target));
      if (target) {
        this.openRenamePathModal(entry.target, target instanceof TFile ? target.basename : target.name);
        return;
      }
    }
    new RenameModal(
      this.plugin,
      "重命名入口",
      entry.label,
      (nextName) => this.plugin.renameQuickEntry(entry, nextName),
      "只修改工作台里的入口名称，不改文件名。"
    ).open();
  }

  createIconButton(parent, icon, label, callback) {
    const button = parent.createEl("button", {
      cls: "wjq-icon-button",
      attr: { "aria-label": label, title: label },
    });
    const iconEl = button.createSpan({ cls: "wjq-icon-button-icon" });
    setIcon(iconEl, icon || "file-text");
    button.createSpan({ cls: "wjq-icon-button-label", text: label });
    button.onclick = (event) => this.runViewAction(callback, event, label);
    return button;
  }

  renderSidebarTaskEditor(container, task) {
    const panel = container.createDiv({ cls: "wjq-sidebar-editor" });
    const header = panel.createDiv({ cls: "wjq-task-side-editor-header" });
    header.createEl("h2", { text: "任务编辑" });
    const headerActions = header.createDiv({ cls: "wjq-task-side-editor-actions" });

    const progressSummary = this.taskProgressSummary(task);
    const state = {
      title: task.displayText || task.text || "",
      project: task.projects[0] || this.plugin.settings.defaultProjects[0] || "",
      status: taskStatusText(task) || "待开始",
      due: task.due || "",
      deadline: task.deadline || "",
      hardDeadline: task.hardDeadline || "",
      completedAt: task.completedAt || "",
      progress: progressSummary.totalText,
      priority: task.priority || "",
      parentKey: "",
      childKeys: [],
      blockedByKey: "",
      nextKeys: [],
    };
    const relationTasks = this.tasks.filter((item) => !sameTask(item, task));
    const relationTaskByKey = (key) => relationTasks.find((item) => item.runtimeId === key) || null;
    const relationById = new Map(relationTasks.filter((item) => item.taskId).map((item) => [item.taskId, item]));
    const currentParent = task.parentId ? relationById.get(task.parentId) : null;
    const currentBlockedBy = task.blockedBy ? relationById.get(task.blockedBy) : null;
    if (currentParent) state.parentKey = currentParent.runtimeId;
    if (currentBlockedBy) state.blockedByKey = currentBlockedBy.runtimeId;
    state.childKeys = relationTasks.filter((item) => item.parentId === task.taskId).map((item) => item.runtimeId);
    state.nextKeys = relationTasks.filter((item) => item.blockedBy === task.taskId).map((item) => item.runtimeId);

    const saveChanges = async () => {
      const saveSession = Number(this.plugin.settings.sidebarSession) || 0;
      const saved = await this.plugin.updateStructuredTask(task, {
        title: state.title,
        project: state.project,
        due: state.due.trim(),
        deadline: state.deadline.trim(),
        hardDeadline: state.hardDeadline.trim(),
        status: state.status,
        progress: state.progress.trim(),
        parentId: "",
        blockedBy: "",
        recordDates: task.recordDates || [],
        completedAt: state.completedAt.trim(),
        canceledAt: task.canceledAt || "",
        childDraft: "",
      });
      if (saved) {
        await this.plugin.applyTaskRelationSelection(task, {
          parentTask: relationTaskByKey(state.parentKey),
          childTasks: (state.childKeys || []).map(relationTaskByKey).filter(Boolean),
          blockedByTask: relationTaskByKey(state.blockedByKey),
          nextTasks: (state.nextKeys || []).map(relationTaskByKey).filter(Boolean),
          syncChildren: true,
          syncNext: true,
          skipRefresh: true,
        });
      }
      if (saved) {
        const closed = await this.plugin.closeTaskSideEditorIfUnchanged(saveSession);
        if (!closed) await this.plugin.refreshViews();
      }
    };
    this.createButton(headerActions, "返回", () => this.plugin.closeTaskSideEditor());
    const saveTop = this.createButton(headerActions, "保存", saveChanges);
    saveTop.addClass("mod-cta");
    this.createButton(headerActions, "全部", () => this.plugin.activateTaskFullPage(task));
    this.createButton(headerActions, "记录推进", () => new ProgressRecordModal(this.plugin, task).open());

    const body = panel.createDiv({ cls: "wjq-task-side-editor-body" });
    this.renderSideTextField(body, "任务", state.title, (value) => (state.title = value));
    this.renderSideChoiceBlock(body, "所属项目", this.allProjects().filter((project) => project !== "全部"), state.project, (value) => (state.project = value), "", "project");
    this.renderSideChoiceBlock(body, "状态", this.taskStatusChoices(true), state.status, (value) => (state.status = value), "", "status");
    this.renderSideMaterialNoteAdder(body, task);
    this.renderSideTextField(body, "开始日期", dateInputValue(state.due), (value) => (state.due = value), `${currentYearMonth()}-`);
    this.renderSideTextField(body, "截止日期", dateInputValue(state.hardDeadline), (value) => (state.hardDeadline = value), `${currentYearMonth()}-`);
    this.renderSideTextField(body, "计划完成", dateInputValue(state.deadline), (value) => (state.deadline = value), `${currentYearMonth()}-`);
    this.renderSideTextField(body, "实际完成", dateInputValue(state.completedAt), (value) => (state.completedAt = value), `${currentYearMonth()}-`);
    this.renderSideProgressSummary(body, progressSummary, task);
    this.renderSideRelationEditor(body, relationTasks, state, task);

    const footer = panel.createDiv({ cls: "wjq-task-side-editor-footer wjq-task-side-editor-footer-hidden" });
    const save = footer.createEl("button", { text: "保存修改" });
    save.addClass("mod-cta");
    save.onclick = saveChanges;
  }

  renderTaskSideEditor(container) {
    return;
    container.removeClass("has-task-side-editor");
    const taskId = this.plugin.settings.currentFullTaskId || this.plugin.settings.currentTaskId || "";
    if (!taskId) return;
    const task = this.tasks.find((item) => item.taskId === taskId);
    if (!task) return;
    container.addClass("has-task-side-editor");

    const panel = container.createDiv({ cls: "wjq-task-side-editor" });
    const header = panel.createDiv({ cls: "wjq-task-side-editor-header" });
    header.createDiv({ cls: "wjq-task-side-editor-kicker", text: "任务编辑" });
    header.createEl("h2", { text: task.displayText || task.text });
    const headerActions = header.createDiv({ cls: "wjq-task-side-editor-actions" });
    this.createButton(headerActions, "右侧", () => this.plugin.activateTaskDetailView(task));
    this.createButton(headerActions, "关闭", () => this.plugin.closeTaskSideEditor());

    const state = {
      title: task.displayText || task.text || "",
      project: task.projects[0] || this.plugin.settings.defaultProjects[0] || "",
      status: taskStatusText(task) || "待开始",
      due: task.due || "",
      deadline: task.deadline || "",
      hardDeadline: task.hardDeadline || "",
      completedAt: task.completedAt || "",
      progress: task.progress || "",
      priority: task.priority || "",
    };

    const body = panel.createDiv({ cls: "wjq-task-side-editor-body" });
    this.renderSideTextField(body, "任务", state.title, (value) => (state.title = value));
    this.renderSideChoiceBlock(
      body,
      "所属项目",
      this.allProjects().filter((project) => project !== "全部"),
      state.project,
      (value) => (state.project = value)
    );
    this.renderSideChoiceBlock(
      body,
      "状态",
      this.taskStatusChoices(true),
      state.status,
      (value) => (state.status = value)
    );

    const dateGrid = body.createDiv({ cls: "wjq-task-side-editor-grid" });
    this.renderSideTextField(dateGrid, "开始日期", state.due, (value) => (state.due = value), "YYYY-MM-DD");
    this.renderSideTextField(dateGrid, "截止日期", state.hardDeadline, (value) => (state.hardDeadline = value), "YYYY-MM-DD");
    this.renderSideTextField(dateGrid, "计划完成", state.deadline, (value) => (state.deadline = value), "YYYY-MM-DD");
    this.renderSideTextField(dateGrid, "进度", state.progress, (value) => (state.progress = value), "65 / 4/16章");

    this.renderSideRelations(body, task);

    const footer = panel.createDiv({ cls: "wjq-task-side-editor-footer" });
    const save = footer.createEl("button", { text: "保存修改" });
    save.addClass("mod-cta");
    save.onclick = async () => {
      await this.plugin.updateStructuredTask(task, {
        title: state.title,
        project: state.project,
        due: state.due.trim(),
        deadline: state.deadline.trim(),
        hardDeadline: state.hardDeadline.trim(),
        status: state.status,
        progress: state.progress.trim(),
        priority: state.priority,
        parentId: "",
        blockedBy: "",
        recordDates: task.recordDates || [],
        completedAt: task.completedAt || "",
        canceledAt: task.canceledAt || "",
        childDraft: "",
      });
    };
  }

  renderSideTextField(parent, label, value, onChange, placeholder = "") {
    const field = parent.createDiv({ cls: "wjq-task-side-field" });
    field.createDiv({ cls: "wjq-task-side-label", text: label });
    const input = field.createEl("input", { attr: { type: "text", placeholder } });
    input.value = value || "";
    input.onchange = () => onChange(input.value);
  }

  renderSideStaticField(parent, label, value, extraClass = "") {
    const field = parent.createDiv({ cls: `wjq-task-side-field wjq-task-side-static-field ${extraClass}`.trim() });
    field.createDiv({ cls: "wjq-task-side-label", text: label });
    field.createDiv({ cls: "wjq-task-side-static-value", text: value || "" });
    return field;
  }

  taskChildrenOf(task) {
    if (!task || !task.taskId) return [];
    return this.tasks.filter((item) => item.parentId === task.taskId);
  }

  taskProgressCount(task, seen = new Set()) {
    if (!task || !task.taskId) return { done: 0, total: 0 };
    if (seen.has(task.taskId)) return { done: 0, total: 0 };
    seen.add(task.taskId);
    const children = this.taskChildrenOf(task);
    if (!children.length) return { done: 0, total: 0 };
    let done = 0;
    let total = 0;
    for (const child of children) {
      total += 1;
      if (child.completed || /完成|取消|归档/.test(taskStatusText(child))) done += 1;
      const nested = this.taskProgressCount(child, new Set(seen));
      done += nested.done;
      total += nested.total;
    }
    return { done, total };
  }

  taskProgressSummary(task) {
    const total = this.taskProgressCount(task);
    const children = this.taskChildrenOf(task).map((child, index) => {
      const count = this.taskProgressCount(child);
      return {
        task: child,
        index: index + 1,
        text: `${index + 1}. ${child.displayText || child.text} ${count.total ? `${count.done}/${count.total}` : (child.completed ? "1/1" : "0/1")}`,
      };
    });
    return {
      done: total.done,
      total: total.total,
      totalText: total.total ? `总进度 ${total.done}/${total.total}` : "",
      children,
    };
  }

  renderSideProgressSummary(parent, summary, task) {
    const field = parent.createDiv({ cls: "wjq-task-side-field wjq-task-side-progress-field" });
    field.createDiv({ cls: "wjq-task-side-label", text: "进度" });
    const body = field.createDiv({ cls: "wjq-task-side-progress-body" });
    const top = body.createDiv({ cls: "wjq-task-side-progress-top" });
    top.createSpan({ cls: "wjq-task-side-static-value", text: summary.totalText || "" });
    if (summary.total) this.createButton(top, "全部", () => this.plugin.activateTaskFullPage(task));
    for (const child of summary.children.slice(0, 3)) {
      body.createDiv({ cls: "wjq-task-side-progress-child", text: child.text });
    }
  }

  renderSideChoiceBlock(parent, label, options, activeValue, onChoose, emptyLabel = "", manageType = "") {
    const block = parent.createDiv({ cls: "wjq-task-side-choice-block" });
    block.createDiv({ cls: "wjq-task-side-label", text: label });
    const choices = block.createDiv({ cls: "wjq-task-side-choices" });
    for (const option of options) {
      const text = option || emptyLabel || "未设置";
      const button = choices.createEl("button", { text, cls: option === activeValue ? "is-active" : "" });
      button.onclick = () => {
        choices.querySelectorAll("button").forEach((item) => item.removeClass("is-active"));
        button.addClass("is-active");
        onChoose(option);
      };
      if (option && manageType === "project") {
        this.attachContextMenu(button, [
          { title: "重命名", icon: "pencil", callback: () => this.openRenameProjectModal(option) },
          { title: "删除", icon: "trash-2", callback: () => new ProjectDeleteModal(this.plugin, option, this.tasks).open() },
        ]);
      } else if (option && manageType === "status") {
        this.attachContextMenu(button, [
          { title: "重命名", icon: "pencil", callback: () => this.openRenameStatusModal(option) },
          { title: "删除", icon: "trash-2", callback: async () => {
            if (window.confirm(`删除状态“${option}”？相关任务会改为“待开始”。`)) {
              const saved = await this.plugin.deleteStatus(option, "待开始");
              if (saved && activeValue === option) onChoose("待开始");
            }
          } },
        ]);
      }
    }
  }

  renderSideRelations(parent, task) {
    const byId = new Map(this.tasks.filter((item) => item.taskId).map((item) => [item.taskId, item]));
    const parentTask = task.parentId ? byId.get(task.parentId) : null;
    const children = this.tasks.filter((item) => item.parentId === task.taskId);
    const previous = task.blockedBy ? byId.get(task.blockedBy) : null;
    const next = this.tasks.filter((item) => item.blockedBy === task.taskId);
    const section = parent.createDiv({ cls: "wjq-task-side-relations" });
    section.createDiv({ cls: "wjq-task-side-label", text: "任务结构" });
    this.renderSideRelationGroup(section, "上级任务", parentTask ? [parentTask] : [], [
      ["编辑", () => this.plugin.activateTaskDetailView(task)],
      ["移除", () => this.plugin.clearParent(task)],
    ]);
    this.renderSideRelationGroup(section, "下级任务", children, [
      ["编辑", () => this.plugin.activateTaskDetailView(task)],
      ["新增", () => this.plugin.openSidebarNewTaskFromSelection({ project: task.projects[0] || "", parentKey: task.runtimeId, sourcePath: "", insertLine: -1 })],
    ]);
    this.renderSideRelationGroup(section, "前置任务", previous ? [previous] : [], [
      ["编辑", () => this.plugin.activateTaskDetailView(task)],
      ["移除", () => this.plugin.clearBlockedBy(task)],
    ]);
    this.renderSideRelationGroup(section, "后续任务", next, [
      ["编辑", () => this.plugin.activateTaskDetailView(task)],
      ["新增", () => this.plugin.openSidebarNewTaskFromSelection({ project: task.projects[0] || "", blockedByKey: task.runtimeId, sourcePath: "", insertLine: -1 })],
    ]);
  }

  renderSideRelationEditor(parent, tasks, state, sourceTask = null) {
    const section = parent.createDiv({ cls: "wjq-task-side-relations" });
    section.createDiv({ cls: "wjq-task-side-label", text: "任务结构" });
    this.renderSideTaskSelect(section, "上级任务", tasks, state.parentKey, (value) => (state.parentKey = value), [
      ["移除", ({ clear }) => clear()],
    ]);
    this.renderSideTaskSelect(section, "下级任务", tasks, state.childKeys, (value) => (state.childKeys = value), sourceTask ? [
      ["新增", () => this.plugin.openSidebarNewTaskFromSelection({ project: sourceTask.projects[0] || "", status: "待开始", parentKey: sourceTask.runtimeId, due: "", deadline: "", hardDeadline: "", progress: "", sourcePath: "", insertLine: -1 })],
    ] : []);
    this.renderSideTaskSelect(section, "前置任务", tasks, state.blockedByKey, (value) => (state.blockedByKey = value), [
      ["移除", ({ clear }) => clear()],
    ]);
    this.renderSideTaskSelect(section, "后续任务", tasks, state.nextKeys, (value) => (state.nextKeys = value), sourceTask ? [
      ["新增", () => this.plugin.openSidebarNewTaskFromSelection({ project: sourceTask.projects[0] || "", status: "待开始", blockedByKey: sourceTask.runtimeId, due: "", deadline: "", hardDeadline: "", progress: "", sourcePath: "", insertLine: -1 })],
    ] : []);
  }

  renderSideRelationGroup(parent, title, tasks, actions) {
    const group = parent.createDiv({ cls: "wjq-task-side-relation-group" });
    const top = group.createDiv({ cls: "wjq-task-side-relation-top" });
    top.createDiv({ cls: "wjq-task-side-relation-title", text: title });
    const actionWrap = top.createDiv({ cls: "wjq-task-side-relation-actions" });
    for (const [label, callback] of actions) this.createButton(actionWrap, label, callback);
    const names = group.createDiv({ cls: "wjq-task-side-relation-names" });
    if (tasks.length) {
      for (const [index, task] of tasks.slice(0, 6).entries()) {
        const item = names.createDiv({ cls: "wjq-task-side-relation-name", text: `${index + 1}. ${task.displayText || task.text}` });
        item.onclick = () => this.openTaskByDefault(task);
      }
      if (tasks.length > 6) names.createDiv({ text: `等 ${tasks.length} 项` });
    }
  }
}

class WorkbenchHomeView extends TaskHubView {
  getViewType() {
    return HOME_VIEW_TYPE;
  }

  getDisplayText() {
    return "个人工作台";
  }

  getIcon() {
    return "layout-dashboard";
  }

  render() {
    const container = this.containerEl.children[1];
    this.clearScheduledFlowRenders();
    container.empty();
    container.addClass("wjq-task-hub");
    container.addClass("wjq-workbench-home");

    this.project = this.plugin.settings.homeProjectFilter || this.project || "全部";
    if ((this.plugin.settings.archivedProjects || []).includes(this.project)) this.project = "全部";

    const toolbar = container.createDiv({ cls: "wjq-workbench-toolbar" });
    toolbar.createEl("h1", { text: "个人工作台" });
    const search = toolbar.createEl("input", {
      cls: "wjq-task-hub-search",
      attr: { type: "search", placeholder: "搜索项目、任务、文件" },
    });
    search.value = this.search;
    search.oninput = () => {
      this.search = search.value;
      this.renderSafely();
    };
    const actions = toolbar.createDiv({ cls: "wjq-task-hub-actions" });
    this.createButton(actions, "新建任务", () => this.plugin.openSidebarNewTaskFromSelection({ sourcePath: "", insertLine: -1 }));
    this.createButton(actions, "新建项目", () => this.openNewProjectModal());
    this.createButton(actions, "项目归档", () => new ProjectArchiveModal(this.plugin).open());
    this.createButton(actions, "刷新", () => this.refresh());

    if (this.search.trim()) this.renderHomeSearchResults(container);

    this.renderHomeProjectStrip(container);

    const overview = container.createDiv({ cls: "wjq-workbench-overview wjq-workbench-overview-four" });
    this.applyHomeOverviewColumns(overview);
    this.renderHomeMaterialsColumn(overview);
    this.renderOverviewResizeHandle(overview, 0);
    this.renderHomeWeekColumn(overview);
    this.renderOverviewResizeHandle(overview, 1);
    this.renderHomeCountdownColumn(overview);
    this.renderOverviewResizeHandle(overview, 2);
    this.renderHomeUnscheduledColumn(overview);

    this.renderHomeGlobalViews(container);
    this.renderTaskSideEditor(container);
  }

  homeOverviewColumnValues() {
    const fallback = DEFAULT_SETTINGS.homeOverviewColumns;
    return Array.isArray(this.plugin.settings.homeOverviewColumns) && this.plugin.settings.homeOverviewColumns.length === fallback.length
      ? this.plugin.settings.homeOverviewColumns
      : fallback;
  }

  applyHomeOverviewColumns(overview) {
    const values = this.homeOverviewColumnValues();
    overview.style.gridTemplateColumns = values.map((value) => `minmax(180px, ${Math.max(0.5, Number(value) || 1)}fr)`).join(" 8px ");
  }

  renderOverviewResizeHandle(parent, index) {
    const handle = parent.createDiv({ cls: "wjq-home-column-resizer", attr: { title: "拖动调整栏目宽度" } });
    handle.onpointerdown = (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const start = this.homeOverviewColumnValues().slice();
      const onMove = (moveEvent) => {
        const delta = (moveEvent.clientX - startX) / 180;
        const next = start.slice();
        next[index] = Math.max(0.5, start[index] + delta);
        next[index + 1] = Math.max(0.5, start[index + 1] - delta);
        this.plugin.settings.homeOverviewColumns = next;
        this.applyHomeOverviewColumns(parent);
      };
      const onUp = async () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        await this.plugin.saveSettings({ refresh: false });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  applySidebarWidth(layout, key) {
    const width = Math.max(140, Math.min(360, Number(this.plugin.settings[key]) || DEFAULT_SETTINGS[key] || 210));
    layout.style.gridTemplateColumns = `${width}px 8px minmax(0, 1fr)`;
  }

  bindSidebarWidthResizer(handle, layout, key) {
    handle.setAttr("title", "拖动调整项目栏宽度");
    handle.onpointerdown = (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = Math.max(140, Math.min(360, Number(this.plugin.settings[key]) || DEFAULT_SETTINGS[key] || 210));
      const onMove = (moveEvent) => {
        const next = Math.max(140, Math.min(360, startWidth + moveEvent.clientX - startX));
        this.plugin.settings[key] = next;
        this.applySidebarWidth(layout, key);
      };
      const onUp = async () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        await this.plugin.saveSettings({ refresh: false });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  async persistHomeState(key, value) {
    this.plugin.settings[key] = value;
    await this.plugin.saveSettings();
  }

  clearScheduledFlowRenders() {
    for (const frame of this.flowAnimationFrames || []) {
      window.cancelAnimationFrame(frame);
    }
    for (const timer of this.flowRenderTimers || []) {
      window.clearTimeout(timer);
    }
    for (const observer of this.flowResizeObservers || []) {
      observer.disconnect();
    }
    this.flowAnimationFrames = [];
    this.flowRenderTimers = [];
    this.flowResizeObservers = [];
  }

  scheduleFlowRender(callback, targets = []) {
    const requestRun = (run) => {
      const frame = window.requestAnimationFrame(run);
      this.flowAnimationFrames.push(frame);
    };
    const run = () => {
      if (targets.some((target) => target && !target.isConnected)) return;
      try {
        callback();
      } catch (error) {
        this.plugin.reportTaskHubError("流程图渲染失败", error);
      }
    };
    requestRun(run);
    this.flowRenderTimers.push(window.setTimeout(() => requestRun(run), 80));
    this.flowRenderTimers.push(window.setTimeout(() => requestRun(run), 240));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => requestRun(run));
    for (const target of targets) {
      if (target) observer.observe(target);
    }
    this.flowResizeObservers.push(observer);
    this.flowRenderTimers.push(window.setTimeout(() => {
      observer.disconnect();
      this.flowResizeObservers = (this.flowResizeObservers || []).filter((item) => item !== observer);
    }, 3000));
  }

  setHomeProject(project) {
    this.project = project || "全部";
    this.persistHomeState("homeProjectFilter", this.project);
    this.renderSafely();
  }

  openNewProjectModal() {
    new RenameModal(
      this.plugin,
      "新建项目",
      "",
      async (nextName) => {
        const name = nextName.trim();
        if (!name) {
          new Notice("项目名称不能为空");
          return false;
        }
        const projects = uniq([...(this.plugin.settings.defaultProjects || []), name]);
        this.plugin.settings.defaultProjects = projects;
        this.plugin.settings.homeProjectOrder = uniq([...(this.plugin.settings.homeProjectOrder || []), name]);
        this.plugin.settings.archivedProjects = (this.plugin.settings.archivedProjects || []).filter((project) => project !== name);
        this.project = name;
        await this.plugin.saveSettings();
        await this.refresh();
        new Notice("已创建项目");
        return true;
      },
      "会先加入当前项目列表；之后新建任务时可直接选择它。"
    ).open();
  }

  renderHomeSearchResults(container) {
    const query = this.search.trim().toLowerCase();
    if (!query) return;
    const section = container.createDiv({ cls: "wjq-home-search-results" });
    const projects = this.homeProjectNames().filter((project) => project.toLowerCase().includes(query)).slice(0, 5);
    const tasks = this.tasks
      .filter((task) => `${task.displayText || task.text} ${task.projects.join(" ")}`.toLowerCase().includes(query))
      .slice(0, 5);
    const files = this.plugin.app.vault
      .getMarkdownFiles()
      .filter((file) => `${file.basename} ${file.path}`.toLowerCase().includes(query))
      .slice(0, 5);

    this.renderSearchGroup(section, "项目", projects, (row, project) => {
      row.createDiv({ cls: "wjq-home-search-title", text: project });
      row.onclick = () => this.plugin.activateProjectPageView(project);
    });
    this.renderSearchGroup(section, "任务", tasks, (row, task) => {
      row.createDiv({ cls: "wjq-home-search-title", text: task.displayText || task.text });
      row.createDiv({ cls: "wjq-home-search-meta", text: task.projects.join(" / ") || task.path });
      row.onclick = () => this.openTaskByDefault(task);
    });
    this.renderSearchGroup(section, "普通文件", files, (row, file) => {
      row.createDiv({ cls: "wjq-home-search-title", text: file.basename });
      row.createDiv({ cls: "wjq-home-search-meta", text: file.parent ? file.parent.path : file.path });
      row.onclick = () => this.plugin.openPath(file.path);
    });
  }

  renderSearchGroup(parent, title, items, renderItem) {
    if (!items.length) return;
    const group = parent.createDiv({ cls: "wjq-home-search-group" });
    group.createDiv({ cls: "wjq-home-panel-title", text: title });
    for (const item of items) {
      const row = group.createDiv({ cls: "wjq-home-search-row" });
      renderItem(row, item);
    }
  }

  renderHomeProjectStrip(parent) {
    const panel = parent.createDiv({ cls: "wjq-home-panel wjq-home-project-strip" });
    const header = panel.createDiv({ cls: "wjq-home-panel-header" });
    header.createEl("h2", { text: "当前项目" });
    this.createButton(header, "+", () => this.openNewProjectModal());
    const projects = this.projectSummaries().filter((item) => this.matchesHomeQuery(item.project)).slice(0, 16);
    if (!projects.length) {
      panel.createDiv({ cls: "wjq-task-hub-empty", text: "还没有当前项目。" });
      return;
    }

    const list = panel.createDiv({ cls: "wjq-home-project-strip-list" });
    for (const summary of projects) {
      const item = list.createDiv({ cls: `wjq-home-project-pill ${this.project === summary.project ? "is-active" : ""}` });
      item.draggable = true;
      item.ondragstart = (event) => {
        event.dataTransfer.setData("text/plain", summary.project);
        event.dataTransfer.effectAllowed = "move";
      };
      item.ondragover = (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      };
      item.ondrop = async (event) => {
        event.preventDefault();
        const from = event.dataTransfer.getData("text/plain");
        await this.moveProjectBefore(from, summary.project);
        this.renderSafely();
      };
      item.createDiv({ cls: "wjq-home-project-pill-name", text: summary.project });
      item.createDiv({ cls: "wjq-home-project-pill-meta", text: summary.stage });
      const stats = item.createDiv({ cls: "wjq-home-project-pill-stats" });
      if (summary.progress) stats.createSpan({ text: summary.progress });
      if (summary.keyDate) stats.createSpan({ text: summary.keyDate });
      item.onclick = () => this.plugin.activateProjectPageView(summary.project);
      this.attachContextMenu(item, [
        { title: "重命名", icon: "pencil", callback: () => this.openRenameProjectModal(summary.project) },
        { title: "打开项目页", icon: "folder-kanban", callback: () => this.plugin.activateProjectPageView(summary.project) },
        { title: "筛选此项目", icon: "filter", callback: () => this.setHomeProject(summary.project) },
        { title: "新建此项目任务", icon: "plus", callback: () => this.plugin.openSidebarNewTaskFromSelection({ project: summary.project, sourcePath: "", insertLine: -1 }) },
        { title: "归档项目", icon: "archive", callback: () => this.plugin.archiveProject(summary.project) },
        { title: "删除项目", icon: "trash-2", callback: () => new ProjectDeleteModal(this.plugin, summary.project, this.tasks).open() },
      ]);
    }
  }

  renderHomeProjectColumn(parent) {
    const panel = parent.createDiv({ cls: "wjq-home-panel wjq-home-project-column" });
    const header = panel.createDiv({ cls: "wjq-home-panel-header" });
    header.createEl("h2", { text: "当前项目" });
    this.createButton(header, "+", () => this.openNewProjectModal());
    const projects = this.projectSummaries().filter((item) => this.matchesHomeQuery(item.project)).slice(0, 12);
    if (!projects.length) {
      panel.createDiv({ cls: "wjq-task-hub-empty", text: "还没有当前项目。" });
      return;
    }
    for (const summary of projects) {
      const row = panel.createDiv({ cls: `wjq-home-list-row ${this.project === summary.project ? "is-active" : ""}` });
      row.draggable = true;
      row.ondragstart = (event) => {
        event.dataTransfer.setData("text/plain", summary.project);
        event.dataTransfer.effectAllowed = "move";
      };
      row.ondragover = (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      };
      row.ondrop = async (event) => {
        event.preventDefault();
        const from = event.dataTransfer.getData("text/plain");
        await this.moveProjectBefore(from, summary.project);
      };
      const main = row.createDiv({ cls: "wjq-home-row-main" });
      main.createDiv({ cls: "wjq-home-row-title", text: summary.project });
      main.createDiv({ cls: "wjq-home-row-meta", text: summary.stage });
      const filterButton = row.createEl("button", { cls: "wjq-home-filter-button", text: "筛" });
      filterButton.onclick = (event) => {
        event.stopPropagation();
        this.setHomeProject(summary.project);
      };
      row.onclick = () => this.plugin.activateProjectPageView(summary.project);
      this.attachContextMenu(row, [
        { title: "重命名", icon: "pencil", callback: () => this.openRenameProjectModal(summary.project) },
        { title: "打开项目页", icon: "folder-kanban", callback: () => this.plugin.activateProjectPageView(summary.project) },
        { title: "筛选此项目", icon: "filter", callback: () => this.setHomeProject(summary.project) },
        { title: "新建此项目任务", icon: "plus", callback: () => this.plugin.openSidebarNewTaskFromSelection({ project: summary.project, sourcePath: "", insertLine: -1 }) },
        { title: "归档项目", icon: "archive", callback: () => this.plugin.archiveProject(summary.project) },
        { title: "删除项目", icon: "trash-2", callback: () => new ProjectDeleteModal(this.plugin, summary.project, this.tasks).open() },
      ]);
    }
  }

  async moveProjectBefore(from, to) {
    if (!from || !to || from === to) return;
    const projects = this.homeProjectNames();
    const ordered = projects.filter((project) => project !== from);
    const index = ordered.indexOf(to);
    if (index < 0) return;
    ordered.splice(index, 0, from);
    this.plugin.settings.homeProjectOrder = ordered;
    await this.plugin.saveSettings();
  }

  renderHomeWeekColumn(parent) {
    const panel = parent.createDiv({ cls: "wjq-home-panel wjq-home-week-column" });
    const header = panel.createDiv({ cls: "wjq-home-panel-header" });
    header.createEl("h2", { text: "本周任务" });
    const controls = header.createDiv({ cls: "wjq-home-segmented" });
    this.renderHomeToggle(controls, "未来7天", this.plugin.settings.homeWeekMode !== "natural", async () => {
      await this.persistHomeState("homeWeekMode", "next7");
      this.renderSafely();
    });
    this.renderHomeToggle(controls, "自然周", this.plugin.settings.homeWeekMode === "natural", async () => {
      await this.persistHomeState("homeWeekMode", "natural");
      this.renderSafely();
    });
    this.renderHomeToggle(controls, "按项目", this.plugin.settings.homeWeekGroup !== "date", async () => {
      await this.persistHomeState("homeWeekGroup", "project");
      this.renderSafely();
    });
    this.renderHomeToggle(controls, "按日期", this.plugin.settings.homeWeekGroup === "date", async () => {
      await this.persistHomeState("homeWeekGroup", "date");
      this.renderSafely();
    });
    const hideDone = this.renderHomeToggle(controls, "未完成", !!this.plugin.settings.homeWeekHideCompleted, async () => {
      await this.persistHomeState("homeWeekHideCompleted", !this.plugin.settings.homeWeekHideCompleted);
      this.renderSafely();
    });
    hideDone.setAttr("title", "不显示已完成");

    const range = this.homeWeekRange();
    panel.createDiv({ cls: "wjq-home-panel-subtitle", text: `${this.shortDate(range.start)} - ${this.shortDate(range.end)}` });
    const tasks = this.homeWeekTasks(range);
    if (!tasks.length) {
      panel.createDiv({ cls: "wjq-task-hub-empty", text: "这个范围内暂时没有已排期任务。" });
      return;
    }
    if (this.plugin.settings.homeWeekGroup === "date") {
      this.renderHomeTasksByDate(panel, tasks);
    } else {
      this.renderHomeTasksByProject(panel, tasks);
    }
  }

  renderHomeUnscheduledColumn(parent) {
    const panel = parent.createDiv({ cls: "wjq-home-panel wjq-home-unscheduled-column" });
    const header = panel.createDiv({ cls: "wjq-home-panel-header" });
    header.createEl("h2", { text: "待排期任务" });
    this.createButton(header, "+", () => this.plugin.openSidebarNewTaskFromSelection({ project: this.project !== "全部" ? this.project : "", sourcePath: "", insertLine: -1 }));
    const all = this.homeScopedTasks()
      .filter((task) => !task.completed && !task.due && !/完成|取消|归档/.test(taskStatusText(task)))
      .slice()
      .sort((a, b) => `${a.path}:${a.lineNumber}`.localeCompare(`${b.path}:${b.lineNumber}`));
    if (!all.length) {
      panel.createDiv({ cls: "wjq-task-hub-empty", text: "没有待排期任务。" });
      return;
    }
    for (const task of all) this.renderHomeCompactTask(panel, task, { unscheduled: true });
  }

  renderHomeMaterialsColumn(parent) {
    const panel = parent.createDiv({ cls: "wjq-home-panel wjq-home-materials-column" });
    const header = panel.createDiv({ cls: "wjq-home-panel-header" });
    header.createEl("h2", { text: "相关材料" });
    const tasks = this.homeScopedTasks();
    let selectedTaskKey = "";
    let selectedPath = "";
    const addRow = panel.createDiv({ cls: "wjq-material-add-row wjq-home-material-add-row" });
    this.renderSideTaskSelect(addRow, "关联任务", tasks, selectedTaskKey, (value) => (selectedTaskKey = value));
    this.renderSideNoteSelect(addRow, "添加笔记", this.plugin.app.vault.getMarkdownFiles(), selectedPath, (value) => (selectedPath = value), "wjq-material-note-select");
    const addActions = addRow.createDiv({ cls: "wjq-material-add-actions" });
    const confirm = this.createButton(addActions, "添加", async () => {
      const selectedTask = tasks.find((task) => task.runtimeId === selectedTaskKey);
      if (!selectedTask || !selectedPath) {
        new Notice("请先选择任务和笔记");
        return;
      }
      const saved = await this.plugin.addMaterialToTask(selectedTask, selectedPath, { skipRefresh: true });
      if (saved) await this.refresh();
    });
    confirm.addClass("mod-cta");
    this.createButton(header, "添加", () => addRow.toggleClass("is-open", !addRow.classList.contains("is-open")));
    const paths = this.taskMaterialPaths(tasks)
      .filter((path) => this.matchesHomeQuery(path))
      .slice(0, 12);
    if (!paths.length) {
      panel.createDiv({ cls: "wjq-task-hub-empty", text: "暂时没有相关材料。" });
      return;
    }
    for (const path of paths) this.renderMaterialPathRow(panel, path);
  }

  renderHomeCountdownColumn(parent) {
    const panel = parent.createDiv({ cls: "wjq-home-panel wjq-home-countdown-column" });
    const header = panel.createDiv({ cls: "wjq-home-panel-header" });
    header.createEl("h2", { text: "倒计时任务" });
    const tasks = this.countdownTasks(this.homeScopedTasks()).slice(0, 12);
    if (!tasks.length) {
      panel.createDiv({ cls: "wjq-task-hub-empty", text: "没有设置截止日期的未完成任务。" });
      return;
    }
    for (const task of tasks) this.renderCountdownTask(panel, task);
  }

  renderHomeRecentColumn(parent) {
    const panel = parent.createDiv({ cls: "wjq-home-panel wjq-home-recent-column" });
    panel.createEl("h2", { text: "最近内容" });
    const files = this.plugin.getRecentFiles(5).filter((file) => this.matchesHomeQuery(`${file.basename} ${file.path}`));
    if (!files.length) {
      panel.createDiv({ cls: "wjq-task-hub-empty", text: "暂时没有最近内容。" });
      return;
    }
    for (const file of files) {
      const row = panel.createDiv({ cls: "wjq-home-list-row" });
      const main = row.createDiv({ cls: "wjq-home-row-main" });
      main.createDiv({ cls: "wjq-home-row-title", text: file.basename });
      main.createDiv({ cls: "wjq-home-row-meta", text: file.parent ? file.parent.path : file.path });
      row.onclick = () => this.plugin.openPath(file.path);
      this.attachContextMenu(row, [
        { title: "重命名", icon: "pencil", callback: () => this.openRenamePathModal(file.path, file.basename) },
        { title: "打开", icon: "file-text", callback: () => this.plugin.openPath(file.path) },
        { separator: true },
        { title: "删除", icon: "trash-2", callback: () => this.plugin.deletePathWithConfirm(file.path, file.basename) },
      ]);
    }
  }

  renderHomeToggle(parent, label, active, callback) {
    const button = this.createButton(parent, label, callback);
    if (active) button.addClass("is-active");
    return button;
  }

  homeProjectNames() {
    const archived = new Set(this.plugin.settings.archivedProjects || []);
    const projects = this.allProjects().filter((project) => project !== "全部" && !archived.has(project));
    const order = this.plugin.settings.homeProjectOrder || [];
    return projects.sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return a.localeCompare(b);
    });
  }

  matchesHomeQuery(text) {
    const query = this.search.trim().toLowerCase();
    return !query || String(text || "").toLowerCase().includes(query);
  }

  homeScopedTasks() {
    const archived = new Set(this.plugin.settings.archivedProjects || []);
    return this.tasks.filter((task) => {
      if (this.project !== "全部" && !task.projects.includes(this.project)) return false;
      if (this.project === "全部" && task.projects.length && task.projects.every((project) => archived.has(project))) return false;
      return this.matchesHomeQuery(`${task.displayText || task.text} ${task.projects.join(" ")} ${task.path}`);
    });
  }

  homeWeekRange() {
    const anchor = this.calendarAnchorDate();
    const start = dateFromParts(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    if (this.plugin.settings.homeWeekMode === "natural") {
      const mondayOffset = (start.getDay() + 6) % 7;
      const monday = addDays(start, -mondayOffset);
      return { start: localDateString(monday), end: localDateString(addDays(monday, 6)) };
    }
    return { start: localDateString(start), end: localDateString(addDays(start, 6)) };
  }

  homeWeekTasks(range) {
    return this.homeScopedTasks()
      .filter((task) => {
        if (!this.isCalendarTask(task) || /取消|归档/.test(taskStatusText(task))) return false;
        if (this.plugin.settings.homeWeekHideCompleted && task.completed) return false;
        const start = this.calendarTaskStartDate(task);
        const end = this.calendarTaskEndDate(task);
        return start <= range.end && end >= range.start;
      })
      .sort((a, b) => {
        const aStart = this.calendarTaskStartDate(a);
        const bStart = this.calendarTaskStartDate(b);
        if (aStart !== bStart) return aStart.localeCompare(bStart);
        return (a.projects[0] || "").localeCompare(b.projects[0] || "");
      });
  }

  renderHomeTasksByProject(parent, tasks) {
    const grouped = new Map();
    for (const task of tasks) {
      const project = task.projects[0] || "未设项目";
      if (!grouped.has(project)) grouped.set(project, []);
      grouped.get(project).push(task);
    }
    for (const [project, items] of grouped) {
      parent.createDiv({ cls: "wjq-home-group-title", text: project });
      for (const task of items) this.renderHomeCompactTask(parent, task);
    }
  }

  renderHomeTasksByDate(parent, tasks) {
    const grouped = new Map();
    for (const task of tasks) {
      const date = task.due || "未排期";
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date).push(task);
    }
    for (const [date, items] of grouped) {
      parent.createDiv({ cls: "wjq-home-group-title", text: date });
      for (const task of items) this.renderHomeCompactTask(parent, task);
    }
  }

  renderHomeCompactTask(parent, task, options = {}) {
    const row = parent.createDiv({ cls: `wjq-home-task-row ${options.titleOnly ? "is-title-only" : ""} ${options.unscheduled ? "is-unscheduled" : ""} ${task.completed ? "is-done" : ""}` });
    if (options.titleOnly) {
      row.createDiv({ cls: "wjq-home-task-title", text: task.displayText || task.text });
      row.onclick = () => this.openTaskByDefault(task);
      this.attachContextMenu(row, this.taskContextActions(task));
      return;
    }
    if (options.unscheduled) {
      const title = row.createDiv({ cls: "wjq-home-task-title", text: task.displayText || task.text });
      title.onclick = () => this.openTaskByDefault(task);
      const actions = row.createDiv({ cls: "wjq-home-task-actions" });
      this.createButton(actions, "排期", (event) => {
        if (event) event.stopPropagation();
        new DateModal(this.plugin, task).open();
      });
      this.createButton(actions, "开始", async (event) => {
        if (event) event.stopPropagation();
        await this.plugin.startTask(task);
      });
      this.createButton(actions, "完成", async (event) => {
        if (event) event.stopPropagation();
        await this.plugin.completeTask(task);
      });
      this.attachContextMenu(row, this.taskContextActions(task));
      return;
    }
    if (options.calendarQueue) {
      row.addClass("is-calendar-queue");
      const title = row.createDiv({ cls: "wjq-home-task-title", text: task.displayText || task.text });
      title.onclick = () => this.openTaskByDefault(task);
      const meta = row.createDiv({ cls: "wjq-home-task-meta-actions" });
      if (task.due) meta.createSpan({ cls: "wjq-home-task-date-inline", text: this.scheduleLabel(task) });
      if (this.taskIsStarted(task) || this.taskHasOpenDescendants(task)) meta.createSpan({ cls: "wjq-home-task-status", text: "进行中" });
      const actions = meta.createDiv({ cls: "wjq-home-task-actions" });
      if (!this.taskIsStarted(task)) {
        this.createButton(actions, "开始", async (event) => {
          if (event) event.stopPropagation();
          await this.plugin.startTask(task);
        });
      }
      this.createButton(actions, "完成", async (event) => {
        if (event) event.stopPropagation();
        await this.plugin.completeTask(task);
      });
      this.attachContextMenu(row, this.taskContextActions(task));
      return;
    }
    const date = row.createDiv({ cls: "wjq-home-task-date", text: task.due ? this.scheduleLabel(task) : "排期" });
    date.onclick = (event) => {
      event.stopPropagation();
      new DateModal(this.plugin, task).open();
    };
    const title = row.createDiv({ cls: "wjq-home-task-title", text: task.displayText || task.text });
    title.onclick = () => this.openTaskByDefault(task);
    row.createDiv({ cls: "wjq-home-task-status", text: this.homeTaskBadge(task) });
    const actions = row.createDiv({ cls: "wjq-home-task-actions" });
    const start = actions.createEl("button", { text: "开始" });
    start.onclick = async (event) => {
      event.stopPropagation();
      await this.plugin.startTask(task);
    };
    const done = actions.createEl("button", { text: "完成" });
    done.onclick = async (event) => {
      event.stopPropagation();
      await this.plugin.completeTask(task);
    };
    this.attachContextMenu(row, this.taskContextActions(task));
  }

  homeTaskBadge(task) {
    if (task.completed) return "已完成";
    const status = taskStatusText(task) || "待开始";
    if (this.taskIsStarted(task) || this.taskHasOpenChildren(task)) return "进行中";
    const end = this.taskEndDate(task);
    if (end && end < localDateString()) return "逾期";
    return status;
  }

  taskHasOpenChildren(task) {
    if (!task || !task.taskId) return false;
    return this.tasks.some((item) => item.parentId === task.taskId && !item.completed && !/完成|取消|归档/.test(taskStatusText(item)));
  }

  shortDate(value) {
    if (!value) return "";
    const text = typeof value === "string" ? value : localDateString(value);
    return text.slice(5).replace("-", "/");
  }

  scheduleLabel(task) {
    const start = this.calendarTaskStartDate ? this.calendarTaskStartDate(task) : task && task.due;
    if (!task || !start) return "";
    const end = this.calendarTaskEndDate ? this.calendarTaskEndDate(task) : this.taskEndDate(task);
    return end && end !== start ? `${this.shortDate(start)}-${this.shortDate(end)}` : this.shortDate(start);
  }

  renderHomeGlobalViews(container, options = {}) {
    const section = container.createDiv({ cls: "wjq-home-global-view" });
    const tabs = section.createDiv({ cls: "wjq-home-global-tabs" });
    const viewSettingKey = options.viewSettingKey || "homeGlobalView";
    let views = [
      ["flow", "流程"],
      ["calendar", "日历"],
      ["gantt", "甘特图"],
    ];
    if (options.excludeCalendar) views = views.filter(([key]) => key !== "calendar");
    const defaultView = "flow";
    const savedView = this.plugin.settings[viewSettingKey] || defaultView;
    const currentView = views.some(([key]) => key === savedView) ? savedView : defaultView;
    for (const [key, label] of views) {
      this.renderHomeToggle(tabs, label, currentView === key, async () => {
        await this.persistHomeState(viewSettingKey, key);
        this.renderSafely();
      });
    }

    const filters = section.createDiv({ cls: "wjq-home-global-filters" });
    if (!options.lockProject) {
      const projectSelect = filters.createEl("select", { cls: "wjq-task-hub-select" });
      for (const project of this.allProjects()) {
        const option = projectSelect.createEl("option", { text: project, value: project });
        option.selected = project === this.project;
      }
      projectSelect.onchange = () => this.setHomeProject(projectSelect.value);
    } else {
      filters.createDiv({ cls: "wjq-home-filter-label", text: options.scopeLabel || `项目：${this.project}` });
    }

    const statusSelect = filters.createEl("select", { cls: "wjq-task-hub-select" });
    for (const status of this.homeStatusOptions()) {
      const option = statusSelect.createEl("option", { text: `状态：${status}`, value: status });
      option.selected = status === (this.plugin.settings.homeStatusFilter || "全部");
    }
    statusSelect.onchange = () => this.setHomeFilterSetting("homeStatusFilter", statusSelect.value);

    const levelSelect = filters.createEl("select", { cls: "wjq-task-hub-select" });
    for (const level of ["全部", "1", "2", "3", "4", "5+"]) {
      const option = levelSelect.createEl("option", { text: `层级：${level}`, value: level });
      option.selected = level === (this.plugin.settings.homeLevelFilter || "全部");
    }
    levelSelect.onchange = () => this.setHomeFilterSetting("homeLevelFilter", levelSelect.value);

    const taskSearch = filters.createEl("input", {
      cls: "wjq-home-filter-search",
      attr: { type: "search", placeholder: "搜索当前视图任务" },
    });
    taskSearch.value = this.plugin.settings.homeTaskSearch || "";
    taskSearch.onchange = () => this.setHomeFilterSetting("homeTaskSearch", taskSearch.value);

    const hideDoneLabel = filters.createEl("label", { cls: "wjq-home-filter-check" });
    const hideDone = hideDoneLabel.createEl("input", { attr: { type: "checkbox" } });
    hideDone.checked = !!this.plugin.settings.homeHideCompleted;
    hideDone.onchange = () => this.setHomeFilterSetting("homeHideCompleted", hideDone.checked);
    hideDoneLabel.createSpan({ text: "隐藏已完成" });

    this.createButton(filters, "清除筛选", () => {
      this.search = "";
      this.plugin.settings.homeStatusFilter = "全部";
      this.plugin.settings.homeLevelFilter = "全部";
      this.plugin.settings.homeTaskSearch = "";
      this.plugin.settings.homeHideCompleted = false;
      this.setHomeProject("全部");
    });

    const view = currentView;
    const body = section.createDiv({ cls: `wjq-home-global-body ${["calendar", "flow"].includes(view) ? `is-${view}` : ""}` });
    if (view === "calendar") {
      this.renderHomeCalendarView(body);
    } else if (view === "flow") {
      this.renderHomeFlowView(body);
    } else if (view === "gantt") {
      this.renderHomeGanttView(body);
    } else {
      this.renderHomeFlowView(body);
    }
  }

  setHomeFilterSetting(key, value) {
    this.plugin.settings[key] = value;
    this.plugin.saveData(this.plugin.settings);
    this.renderSafely();
  }

  homeStatusOptions() {
    const statuses = this.homeScopedTasks().map((task) => taskStatusText(task) || "待开始");
    return ["全部", ...uniq(["待开始", "进行中", "等待中", "暂停", "已完成", ...statuses]).sort()];
  }

  taskDepthMap(tasks) {
    const byId = new Map(tasks.filter((task) => task.taskId).map((task) => [task.taskId, task]));
    const cache = new Map();
    const depthOf = (task, seen = new Set()) => {
      if (!task || !task.taskId || !task.parentId || !byId.has(task.parentId) || seen.has(task.taskId)) return 1;
      if (cache.has(task.taskId)) return cache.get(task.taskId);
      seen.add(task.taskId);
      const depth = 1 + depthOf(byId.get(task.parentId), seen);
      cache.set(task.taskId, depth);
      return depth;
    };
    const depths = new Map();
    for (const task of tasks) depths.set(task.runtimeId, depthOf(task));
    return depths;
  }

  homeGlobalTasks() {
    const base = this.homeScopedTasks().filter((task) => !/取消|归档/.test(taskStatusText(task)));
    const depths = this.taskDepthMap(base);
    const statusFilter = this.plugin.settings.homeStatusFilter || "全部";
    const levelFilter = this.plugin.settings.homeLevelFilter || "全部";
    const taskSearch = String(this.plugin.settings.homeTaskSearch || "").trim().toLowerCase();
    return base
      .filter((task) => {
        if (this.plugin.settings.homeHideCompleted && task.completed) return false;
        const status = taskStatusText(task) || "待开始";
        if (statusFilter !== "全部" && status !== statusFilter) return false;
        if (taskSearch && !`${task.displayText || task.text} ${task.projects.join(" ")} ${task.path}`.toLowerCase().includes(taskSearch)) return false;
        const depth = depths.get(task.runtimeId) || 1;
        if (levelFilter === "5+") return depth >= 5;
        if (levelFilter !== "全部" && depth !== Number(levelFilter)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
        if (a.due && !b.due) return -1;
        if (!a.due && b.due) return 1;
        return `${a.path}:${a.lineNumber}`.localeCompare(`${b.path}:${b.lineNumber}`);
      });
  }

  taskFromDragEvent(event) {
    const dragId = event.dataTransfer ? event.dataTransfer.getData("application/x-wjq-task") || event.dataTransfer.getData("text/plain") : "";
    if (!dragId) return null;
    return this.tasks.find((task) => task.runtimeId === dragId || task.taskId === dragId) || null;
  }

  makeTaskDraggable(element, task) {
    element.draggable = true;
    element.ondragstart = (event) => {
      const dragId = task.runtimeId || task.taskId;
      if (!dragId || !event.dataTransfer) return;
      event.dataTransfer.setData("application/x-wjq-task", dragId);
      event.dataTransfer.setData("text/plain", dragId);
      event.dataTransfer.effectAllowed = "move";
    };
  }

  renderRelationDropZones(parent, targetTask) {
    const zones = parent.createDiv({ cls: "wjq-relation-drop-zones" });
    parent.ondragenter = () => parent.addClass("is-relation-dragging");
    parent.ondragover = (event) => {
      event.preventDefault();
      event.stopPropagation();
      parent.addClass("is-relation-dragging");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };
    parent.ondragleave = (event) => {
      if (!parent.contains(event.relatedTarget)) parent.removeClass("is-relation-dragging");
    };
    const child = zones.createDiv({ cls: "wjq-relation-drop-zone is-child", text: "设为下级" });
    const next = zones.createDiv({ cls: "wjq-relation-drop-zone is-next", text: "设为后续" });
    const wire = (zone, type) => {
      zone.ondragover = (event) => {
        event.preventDefault();
        event.stopPropagation();
        parent.addClass("is-relation-dragging");
        zone.addClass("is-active");
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      };
      zone.ondragleave = () => zone.removeClass("is-active");
      zone.ondrop = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        zone.removeClass("is-active");
        parent.removeClass("is-relation-dragging");
        const source = this.taskFromDragEvent(event);
        if (!source || sameTask(source, targetTask)) return;
        if (type === "child") await this.plugin.setParent(source, targetTask);
        else await this.plugin.setBlockedBy(source, targetTask);
        if (this.refresh) await this.refresh();
      };
    };
    wire(child, "child");
    wire(next, "next");
  }

  bindRelationDropHost(host, zoneParent) {
    host.ondragenter = () => zoneParent.addClass("is-relation-dragging");
    host.ondragover = (event) => {
      if (!this.taskFromDragEvent(event)) return;
      event.preventDefault();
      zoneParent.addClass("is-relation-dragging");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };
    host.ondragleave = (event) => {
      if (!host.contains(event.relatedTarget)) zoneParent.removeClass("is-relation-dragging");
    };
    host.ondrop = () => zoneParent.removeClass("is-relation-dragging");
  }

  renderHomeTreeView(parent) {
    const allTreeTasks = this.homeGlobalTasks();
    const treeProjectOptions = ["全部", ...uniq(allTreeTasks.flatMap((task) => task.projects || [])).sort()];
    let selectedTreeProject = this.plugin.settings.homeTreeProject || "全部";
    if (!treeProjectOptions.includes(selectedTreeProject)) selectedTreeProject = "全部";

    const treeLayout = parent.createDiv({ cls: "wjq-home-tree-layout" });
    this.applySidebarWidth(treeLayout, "homeTreeSidebarWidth");
    const treeSidebar = treeLayout.createDiv({ cls: "wjq-home-tree-projects" });
    const treeResizer = treeLayout.createDiv({ cls: "wjq-home-side-resizer" });
    this.bindSidebarWidthResizer(treeResizer, treeLayout, "homeTreeSidebarWidth");
    treeSidebar.createDiv({ cls: "wjq-home-panel-title", text: "项目" });
    for (const project of treeProjectOptions) {
      const count = project === "全部"
        ? allTreeTasks.length
        : allTreeTasks.filter((task) => task.projects.includes(project)).length;
      const button = treeSidebar.createEl("button", { cls: selectedTreeProject === project ? "is-active" : "" });
      button.createSpan({ text: project });
      button.createSpan({ cls: "wjq-home-project-count", text: String(count) });
      button.onclick = () => this.setHomeFilterSetting("homeTreeProject", project);
      if (project !== "全部" && project !== "鍏ㄩ儴") {
        button.ondragover = (event) => {
          event.preventDefault();
          button.addClass("is-drop-target");
        };
        button.ondragleave = () => button.removeClass("is-drop-target");
        button.ondrop = async (event) => {
          event.preventDefault();
          button.removeClass("is-drop-target");
          const task = this.taskFromDragEvent(event);
          if (task) await this.plugin.setTaskProject(task, project);
        };
      }
    }

    const treeSection = treeLayout.createDiv({ cls: "wjq-home-global-section" });
    const visibleTreeTasks = selectedTreeProject === "全部"
      ? allTreeTasks
      : allTreeTasks.filter((task) => task.projects.includes(selectedTreeProject));
    if (!visibleTreeTasks.length) {
      treeSection.createDiv({ cls: "wjq-task-hub-empty", text: "这个项目里暂时没有任务。" });
      return;
    }
    const treeData = this.buildTaskTree(visibleTreeTasks);
    for (const task of treeData.roots) {
      this.renderHomeTreeTask(treeSection, task, 0, treeData.childrenByParent, new Set());
    }
    return;

    const section = parent.createDiv({ cls: "wjq-home-global-section" });
    const tasks = this.homeGlobalTasks();
    if (!tasks.length) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: "当前范围内没有任务。" });
      return;
    }
    const { roots, childrenByParent } = this.buildTaskTree(tasks);
    for (const task of roots) {
      this.renderHomeTreeTask(section, task, 0, childrenByParent, new Set());
    }
  }

  renderHomeTreeTask(parent, task, depth, childrenByParent, seen) {
    const row = parent.createDiv({ cls: `wjq-home-tree-row ${task.completed ? "is-done" : ""}` });
    this.makeTaskDraggable(row, task);
    row.style.setProperty("--task-depth", String(Math.min(depth, 8)));
    const checkbox = row.createEl("input", { attr: { type: "checkbox" } });
    checkbox.checked = task.completed;
    checkbox.onchange = () => checkbox.checked ? this.plugin.completeTask(task) : this.plugin.toggleTask(task, false);
    const titleWrap = row.createDiv({ cls: "wjq-home-tree-title-cell" });
    const title = titleWrap.createDiv({ cls: "wjq-home-tree-title", text: task.displayText || task.text });
    title.onclick = () => this.openTaskByDefault(task);
    this.renderRelationDropZones(titleWrap, task);
    this.bindRelationDropHost(row, titleWrap);
    row.createDiv({ cls: "wjq-home-tree-status", text: this.homeTaskBadge(task) });
    this.attachContextMenu(row, this.taskContextActions(task));
    if (!task.taskId || seen.has(task.taskId)) return;
    seen.add(task.taskId);
    for (const child of (childrenByParent.get(task.taskId) || [])) {
      this.renderHomeTreeTask(parent, child, depth + 1, childrenByParent, seen);
    }
  }

  renderHomeCalendarView(parent) {
    const layout = parent.createDiv({ cls: "wjq-home-calendar-layout" });
    this.applyHomeCalendarColumns(layout);
    const queue = layout.createDiv({ cls: "wjq-home-calendar-queues" });
    const current = queue.createDiv({ cls: "wjq-home-calendar-current" });
    current.createDiv({ cls: "wjq-home-panel-title", text: "当前推进" });
    const scopedTasks = this.homeGlobalTasks();
    const currentTasks = this.currentProgressTasks().filter((task) => scopedTasks.some((item) => sameTask(item, task)));
    if (!currentTasks.length) {
      current.createDiv({ cls: "wjq-task-hub-empty", text: "没有已开始但暂不进入日历的任务。" });
    } else {
      for (const task of currentTasks.slice(0, 10)) this.renderHomeCompactTask(current, task, { titleOnly: true });
    }
    const pending = queue.createDiv({ cls: "wjq-home-calendar-current wjq-home-calendar-pending" });
    pending.createDiv({ cls: "wjq-home-panel-title", text: "待排期任务" });
    const pendingTasks = this.homeGlobalTasks().filter((task) => this.isUnscheduledTask(task));
    if (!pendingTasks.length) {
      pending.createDiv({ cls: "wjq-task-hub-empty", text: "没有待排期任务。" });
    } else {
      for (const task of pendingTasks.slice(0, 10)) this.renderHomeCompactTask(pending, task, { titleOnly: true, unscheduled: true });
    }
    this.renderHomeCalendarResizer(layout);
    const section = layout.createDiv({ cls: "wjq-task-hub-section wjq-home-calendar-main" });
    this.renderCalendarShell(
      section,
      scopedTasks.filter((item) => this.isCalendarTask(item) && !(this.plugin.settings.homeHideCompleted && item.completed)),
      ""
    );
  }

  applyHomeCalendarColumns(layout) {
    const values = Array.isArray(this.plugin.settings.homeCalendarColumns) && this.plugin.settings.homeCalendarColumns.length === 2
      ? this.plugin.settings.homeCalendarColumns
      : DEFAULT_SETTINGS.homeCalendarColumns;
    // 左侧任务队列允许收缩到 0；右侧日历仍保留最小可用宽度。
    layout.style.gridTemplateColumns = `minmax(0, ${Math.max(0, Number(values[0]) || 0)}fr) 8px minmax(0, ${Math.max(0.45, Number(values[1]) || 0.72)}fr)`;
  }

  renderHomeCalendarResizer(parent) {
    const handle = parent.createDiv({ cls: "wjq-home-column-resizer wjq-home-calendar-resizer", attr: { title: "拖动调整日历左右宽度" } });
    handle.onpointerdown = (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const start = (Array.isArray(this.plugin.settings.homeCalendarColumns) ? this.plugin.settings.homeCalendarColumns : DEFAULT_SETTINGS.homeCalendarColumns).slice();
      const onMove = (moveEvent) => {
        const delta = (moveEvent.clientX - startX) / 520;
        const next = start.slice();
        next[0] = Math.max(0, start[0] + delta);
        next[1] = Math.max(0.45, start[1] - delta);
        this.plugin.settings.homeCalendarColumns = next;
        this.applyHomeCalendarColumns(parent);
      };
      const onUp = async () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        await this.plugin.saveSettings({ refresh: false });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  renderHomeTableView(parent) {
    const tasks = this.homeGlobalTasks();
    if (!tasks.length) {
      parent.createDiv({ cls: "wjq-task-hub-empty", text: "当前范围内没有任务。" });
      return;
    }
    const table = parent.createEl("table", { cls: "wjq-home-task-table" });
    const head = table.createEl("thead").createEl("tr");
    for (const title of ["名称", "状态", "项目", "日期", "来源"]) {
      head.createEl("th", { text: title });
    }
    const body = table.createEl("tbody");
    for (const task of tasks) {
      const row = body.createEl("tr", { cls: task.completed ? "is-done" : "" });
      const name = row.createEl("td", { cls: "wjq-home-table-name", text: task.displayText || task.text });
      name.onclick = () => this.openTaskByDefault(task);
      row.createEl("td", { text: this.homeTaskBadge(task) });
      row.createEl("td", { text: task.projects.join(", ") || "未设项目" });
      const due = row.createEl("td", { text: task.due ? this.scheduleLabel(task) : "未排期" });
      due.onclick = () => new DateModal(this.plugin, task).open();
      row.createEl("td", { text: task.path });
      this.attachContextMenu(row, this.taskContextActions(task));
    }
  }

  renderHomeFlowView(parent) {
    const hideCompletedFlow = !!this.plugin.settings.homeFlowHideCompleted;
    const allTasks = this.homeGlobalTasks()
      .filter((task) => !(hideCompletedFlow && task.completed && !this.taskHasOpenDescendants(task)))
      .sort((a, b) => this.compareTasksByCreation(a, b));
    const projectOptions = ["全部", ...uniq(allTasks.flatMap((task) => task.projects || [])).sort()];
    let selectedProject = this.plugin.settings.homeFlowProject || "全部";
    if (!projectOptions.includes(selectedProject)) {
      selectedProject = "全部";
      this.plugin.settings.homeFlowProject = "全部";
      this.plugin.saveData(this.plugin.settings);
    }

    const layout = parent.createDiv({ cls: "wjq-home-flow-layout" });
    this.applySidebarWidth(layout, "homeFlowSidebarWidth");
    const sidebar = layout.createDiv({ cls: "wjq-home-flow-projects" });
    const sidebarResizer = layout.createDiv({ cls: "wjq-home-side-resizer" });
    this.bindSidebarWidthResizer(sidebarResizer, layout, "homeFlowSidebarWidth");
    sidebar.createDiv({ cls: "wjq-home-panel-title", text: "项目" });
    for (const project of projectOptions) {
      const count = project === "全部"
        ? allTasks.length
        : allTasks.filter((task) => task.projects.includes(project)).length;
      const button = sidebar.createEl("button", { cls: selectedProject === project ? "is-active" : "" });
      button.createSpan({ text: project });
      button.createSpan({ cls: "wjq-home-flow-project-count", text: String(count) });
      button.onclick = () => this.setHomeFilterSetting("homeFlowProject", project);
      if (project !== "全部" && project !== "鍏ㄩ儴") {
        button.ondragover = (event) => {
          event.preventDefault();
          button.addClass("is-drop-target");
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        };
        button.ondragleave = () => button.removeClass("is-drop-target");
        button.ondrop = async (event) => {
          event.preventDefault();
          button.removeClass("is-drop-target");
          const task = this.taskFromDragEvent(event);
          if (task) {
            await this.plugin.setTaskProject(task, project);
            await this.refresh();
          }
        };
      }
    }

    const flowSection = layout.createDiv({ cls: "wjq-home-flow-view" });
    const selectedTasks = selectedProject === "全部"
      ? allTasks
      : allTasks.filter((task) => task.projects.includes(selectedProject));
    const selectedIds = new Set(selectedTasks.map((task) => task.runtimeId));
    const flowById = new Map(allTasks.filter((task) => task.taskId).map((task) => [task.taskId, task]));
    const flowLinks = [];
    const seen = new Set();
    const addLink = (from, to, type, fromLabel, toLabel) => {
      if (!from || !to) return;
      if (selectedProject !== "全部" && !selectedIds.has(from.runtimeId) && !selectedIds.has(to.runtimeId)) return;
      const key = `${type}:${from.runtimeId}->${to.runtimeId}`;
      if (seen.has(key)) return;
      seen.add(key);
      flowLinks.push({ from, to, type, fromLabel, toLabel, project: to.projects[0] || from.projects[0] || "未设项目" });
    };

    for (const task of allTasks) {
      if (task.parentId) addLink(flowById.get(task.parentId), task, "parent", "上级", "下级");
      if (task.blockedBy) addLink(flowById.get(task.blockedBy), task, "blocked", "前置", "后续");
    }

    this.renderHomeFlowGraph(flowSection, flowLinks, selectedProject, selectedTasks);
    return;

    const grouped = new Map();
    for (const link of flowLinks) {
      if (!grouped.has(link.project)) grouped.set(link.project, new Map());
      const sourceGroups = grouped.get(link.project);
      const sourceKey = link.from.runtimeId;
      if (!sourceGroups.has(sourceKey)) sourceGroups.set(sourceKey, { from: link.from, targets: [] });
      sourceGroups.get(sourceKey).targets.push(link);
    }

    for (const [project, sourceGroups] of grouped) {
      if (selectedProject === "全部") flowSection.createDiv({ cls: "wjq-home-group-title", text: project });
      for (const group of sourceGroups.values()) {
        const row = flowSection.createDiv({ cls: "wjq-home-flow-row is-branch" });
        this.renderHomeFlowNode(row, group.from, "上游");
        row.createDiv({ cls: "wjq-home-flow-arrow", text: "→" });
        const branches = row.createDiv({ cls: "wjq-home-flow-branches" });
        for (const link of group.targets) {
          const branch = branches.createDiv({ cls: `wjq-home-flow-branch is-${link.type}` });
          this.renderHomeFlowNode(branch, link.to, link.toLabel);
        }
      }
    }
    return;

    const tasks = this.homeGlobalTasks();
    const byId = new Map(tasks.filter((task) => task.taskId).map((task) => [task.taskId, task]));
    const links = tasks
      .filter((task) => task.blockedBy && byId.has(task.blockedBy))
      .map((task) => ({ from: byId.get(task.blockedBy), to: task }));

    const section = parent.createDiv({ cls: "wjq-home-flow-view" });
    if (!links.length) {
      section.createDiv({
        cls: "wjq-task-hub-empty",
        text: "当前范围内还没有前置任务关系。可在编辑任务窗口里设置“前置任务”。",
      });
      this.renderHomeFlowFallback(section, tasks);
      return;
    }

    for (const link of links) {
      const row = section.createDiv({ cls: "wjq-home-flow-row" });
      this.renderHomeFlowNode(row, link.from, "前置");
      row.createDiv({ cls: "wjq-home-flow-arrow", text: "→" });
      this.renderHomeFlowNode(row, link.to, "后续");
    }
  }

  renderHomeFlowGraph(parent, links, selectedProject, allNodes = []) {
    const nodeMap = new Map();
    const linkedRuntimeIds = new Set();
    for (const task of allNodes) nodeMap.set(task.runtimeId, task);
    for (const link of links) {
      nodeMap.set(link.from.runtimeId, link.from);
      nodeMap.set(link.to.runtimeId, link.to);
      linkedRuntimeIds.add(link.from.runtimeId);
      linkedRuntimeIds.add(link.to.runtimeId);
    }
    const linkedNodes = Array.from(nodeMap.values()).filter((task) => linkedRuntimeIds.has(task.runtimeId));
    const unlinkedNodes = Array.from(nodeMap.values())
      .filter((task) => !task.completed && !linkedRuntimeIds.has(task.runtimeId))
      .sort((a, b) => this.compareTasksByCreation(a, b));
    // 没有无关联任务时不再预留右侧空栏。
    const shouldShowUnlinked = this.plugin.settings.homeFlowShowUnlinked !== false && unlinkedNodes.length > 0;
    const childrenByParent = new Map();
    const parentByChild = new Map();
    const blockedAfter = new Map();
    const runtimeToTaskId = new Map(linkedNodes.filter((task) => task.taskId).map((task) => [task.runtimeId, task.taskId]));
    for (const link of links) {
      if (link.type === "parent") {
        if (!childrenByParent.has(link.from.runtimeId)) childrenByParent.set(link.from.runtimeId, []);
        childrenByParent.get(link.from.runtimeId).push(link.to);
        if (!parentByChild.has(link.to.runtimeId)) parentByChild.set(link.to.runtimeId, link.from.runtimeId);
      } else if (link.type === "blocked") {
        const fromTaskId = runtimeToTaskId.get(link.from.runtimeId) || link.from.taskId || link.from.runtimeId;
        const toTaskId = runtimeToTaskId.get(link.to.runtimeId) || link.to.taskId || link.to.runtimeId;
        if (!blockedAfter.has(toTaskId)) blockedAfter.set(toTaskId, new Set());
        blockedAfter.get(toTaskId).add(fromTaskId);
        if (!parentByChild.has(link.to.runtimeId)) {
          if (!childrenByParent.has(link.from.runtimeId)) childrenByParent.set(link.from.runtimeId, []);
          childrenByParent.get(link.from.runtimeId).push(link.to);
          parentByChild.set(link.to.runtimeId, link.from.runtimeId);
        }
      }
    }
    const sortByFlowOrder = (tasks) => {
      const keyed = tasks.filter(Boolean);
      const keyOf = (task) => task.taskId || task.runtimeId;
      const keySet = new Set(keyed.map(keyOf));
      const indegree = new Map(keyed.map((task) => [keyOf(task), 0]));
      const outgoing = new Map(keyed.map((task) => [keyOf(task), []]));
      for (const task of keyed) {
        const taskKey = keyOf(task);
        for (const previous of blockedAfter.get(taskKey) || []) {
          if (!keySet.has(previous)) continue;
          indegree.set(taskKey, (indegree.get(taskKey) || 0) + 1);
          outgoing.get(previous).push(taskKey);
        }
      }
      const byKey = new Map(keyed.map((task) => [keyOf(task), task]));
      const ready = keyed.filter((task) => (indegree.get(keyOf(task)) || 0) === 0)
        .sort((a, b) => this.compareTasksByCreation(a, b));
      const result = [];
      while (ready.length) {
        const task = ready.shift();
        result.push(task);
        for (const nextKey of outgoing.get(keyOf(task)) || []) {
          indegree.set(nextKey, (indegree.get(nextKey) || 0) - 1);
          if ((indegree.get(nextKey) || 0) === 0) {
            ready.push(byKey.get(nextKey));
            ready.sort((a, b) => this.compareTasksByCreation(a, b));
          }
        }
      }
      if (result.length !== keyed.length) {
        const used = new Set(result.map(keyOf));
        result.push(...keyed.filter((task) => !used.has(keyOf(task))).sort((a, b) => this.compareTasksByCreation(a, b)));
      }
      return result;
    };
    for (const [parentId, children] of childrenByParent) childrenByParent.set(parentId, sortByFlowOrder(children));
    const roots = sortByFlowOrder(linkedNodes.filter((task) => !parentByChild.has(task.runtimeId)));
    const layout = new Map();
    let nextRow = 1;
    const placeTask = (task, depth, seen = new Set()) => {
      if (!task || seen.has(task.runtimeId)) return { start: nextRow, span: 1 };
      seen.add(task.runtimeId);
      const children = childrenByParent.get(task.runtimeId) || [];
      if (!children.length) {
        const start = nextRow++;
        layout.set(task.runtimeId, { task, depth, start, span: 1 });
        return { start, span: 1 };
      }
      const firstRow = nextRow;
      let lastRow = firstRow;
      for (const child of children) {
        const placed = placeTask(child, depth + 1, new Set(seen));
        lastRow = Math.max(lastRow, placed.start + placed.span - 1);
      }
      const span = Math.max(1, lastRow - firstRow + 1);
      layout.set(task.runtimeId, { task, depth, start: firstRow, span });
      return { start: firstRow, span };
    };
    for (const root of roots) {
      placeTask(root, 0, new Set());
      nextRow += 1;
    }
    for (const task of linkedNodes) {
      if (!layout.has(task.runtimeId)) {
        const start = nextRow++;
        layout.set(task.runtimeId, { task, depth: 0, start, span: 1 });
      }
    }
    const nodes = Array.from(layout.values()).sort((a, b) => a.start - b.start || a.depth - b.depth);
    const graph = parent.createDiv({ cls: "wjq-home-flow-graph" });
    const header = graph.createDiv({ cls: "wjq-home-flow-toolbar" });
    header.createDiv({ cls: "wjq-home-flow-legend", text: "实线箭头：上级 -> 下级　虚线箭头：前置 -> 后续" });
    const zoom = Math.max(0.6, Math.min(1.8, Number(this.plugin.settings.homeFlowZoom) || 1));
    const zoomControls = header.createDiv({ cls: "wjq-home-flow-zoom" });
    const zoomOut = zoomControls.createEl("button", { text: "-" });
    zoomOut.onclick = () => this.setHomeFlowZoom(zoom - 0.1);
    zoomControls.createSpan({ text: `${Math.round(zoom * 100)}%` });
    const zoomIn = zoomControls.createEl("button", { text: "+" });
    zoomIn.onclick = () => this.setHomeFlowZoom(zoom + 0.1);
    const reset = zoomControls.createEl("button", { text: "重置" });
    reset.onclick = () => this.setHomeFlowZoom(1);
    const hideDone = zoomControls.createEl("button", { text: this.plugin.settings.homeFlowHideCompleted ? "显示已完成任务" : "收起已完成任务" });
    hideDone.onclick = async () => {
      this.plugin.settings.homeFlowHideCompleted = !this.plugin.settings.homeFlowHideCompleted;
      await this.plugin.saveSettings();
      this.renderSafely();
    };
    const toggleUnlinked = zoomControls.createEl("button", { text: this.plugin.settings.homeFlowShowUnlinked === false ? "显示无关联任务" : "收起无关联任务" });
    toggleUnlinked.onclick = async () => {
      this.plugin.settings.homeFlowShowUnlinked = this.plugin.settings.homeFlowShowUnlinked === false;
      await this.plugin.saveSettings();
      this.renderSafely();
    };
    const body = graph.createDiv({ cls: "wjq-home-flow-graph-body" });
    this.applyFlowGraphColumns(body, shouldShowUnlinked);
    const stage = body.createDiv({ cls: "wjq-home-flow-stage" });
    this.bindPannableStage(stage);
    if (shouldShowUnlinked) {
      const looseResizer = body.createDiv({ cls: "wjq-home-flow-loose-resizer", attr: { title: "拖动调整无关联任务宽度" } });
      this.bindFlowLooseResizer(looseResizer, body);
    }
    const zoomSpace = stage.createDiv({ cls: "wjq-home-flow-zoom-space" });
    const canvas = zoomSpace.createDiv({ cls: "wjq-home-flow-canvas" });
    canvas.style.transform = `scale(${zoom})`;
    canvas.style.transformOrigin = "top left";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("wjq-home-flow-lines");
    canvas.appendChild(svg);
    const cardByRuntimeId = new Map();
    for (const item of nodes) {
      const task = item.task;
      const card = canvas.createDiv({ cls: `wjq-home-flow-node-card ${task.completed ? "is-done" : ""}` });
      card.style.gridColumn = String(item.depth + 1);
      card.style.gridRow = `${item.start} / span ${item.span}`;
      card.style.alignSelf = "center";
      card.dataset.runtimeId = task.runtimeId;
      const titleWrap = card.createDiv({ cls: "wjq-home-flow-title-cell" });
      titleWrap.createDiv({ cls: "wjq-home-flow-title", text: task.displayText || task.text });
      this.renderRelationDropZones(titleWrap, task);
      this.bindRelationDropHost(card, titleWrap);
      card.createDiv({ cls: "wjq-home-flow-meta", text: [task.projects[0] || "未设项目", this.homeTaskBadge(task), task.due ? this.scheduleLabel(task) : ""].filter(Boolean).join(" · ") });
      this.makeTaskDraggable(card, task);
      card.onclick = () => this.openTaskByDefault(task);
      this.attachContextMenu(card, this.flowTaskContextActions(task));
      cardByRuntimeId.set(task.runtimeId, card);
    }
    if (shouldShowUnlinked) {
      const loose = body.createDiv({ cls: "wjq-home-flow-unlinked" });
      loose.createDiv({ cls: "wjq-home-panel-title", text: "无关联任务" });
      if (!unlinkedNodes.length) {
        loose.createDiv({ cls: "wjq-task-hub-empty", text: "没有无关联任务。" });
      }
      for (const task of unlinkedNodes) {
        const card = loose.createDiv({ cls: `wjq-home-flow-loose-card ${task.completed ? "is-done" : ""}` });
        const titleWrap = card.createDiv({ cls: "wjq-home-flow-title-cell" });
        titleWrap.createDiv({ cls: "wjq-home-flow-title", text: task.displayText || task.text });
        this.renderRelationDropZones(titleWrap, task);
        this.bindRelationDropHost(card, titleWrap);
        card.createDiv({ cls: "wjq-home-flow-meta", text: [task.projects[0] || "未设项目", this.homeTaskBadge(task), task.due ? this.scheduleLabel(task) : ""].filter(Boolean).join(" · ") });
        this.makeTaskDraggable(card, task);
        card.onclick = () => this.openTaskByDefault(task);
        this.attachContextMenu(card, this.flowTaskContextActions(task));
      }
    }

    const drawFlowLines = () => {
      if (!canvas.isConnected) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const width = Math.max(canvas.scrollWidth, canvas.offsetWidth);
      const height = Math.max(canvas.scrollHeight, canvas.offsetHeight);
      zoomSpace.style.width = `${Math.ceil(width * zoom)}px`;
      zoomSpace.style.height = `${Math.ceil(height * zoom)}px`;
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const markerKey = `wjq-flow-arrow-${Date.now()}-${Math.round(Math.random() * 10000)}`;
      const createMarker = (id, cls) => {
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        marker.setAttribute("id", id);
        marker.setAttribute("viewBox", "0 0 10 10");
        marker.setAttribute("refX", "9");
        marker.setAttribute("refY", "5");
        marker.setAttribute("markerWidth", "7");
        marker.setAttribute("markerHeight", "7");
        marker.setAttribute("orient", "auto-start-reverse");
        marker.classList.add(cls);
        const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
        marker.appendChild(arrow);
        defs.appendChild(marker);
      };
      createMarker(`${markerKey}-parent`, "is-parent");
      createMarker(`${markerKey}-blocked`, "is-blocked");
      svg.appendChild(defs);
      const rect = canvas.getBoundingClientRect();
      const point = (value) => (value / zoom).toFixed(1);
      for (const link of links) {
        const from = cardByRuntimeId.get(link.from.runtimeId);
        const to = cardByRuntimeId.get(link.to.runtimeId);
        if (!from || !to) continue;
        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();
        const forward = toRect.left + toRect.width / 2 >= fromRect.left + fromRect.width / 2;
        const x1 = forward ? fromRect.right - rect.left : fromRect.left - rect.left;
        const x2 = forward ? toRect.left - rect.left : toRect.right - rect.left;
        const y1 = fromRect.top + fromRect.height / 2 - rect.top;
        const y2 = toRect.top + toRect.height / 2 - rect.top;
        const midX = x1 + (x2 - x1) / 2;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${point(x1)} ${point(y1)} C ${point(midX)} ${point(y1)}, ${point(midX)} ${point(y2)}, ${point(x2)} ${point(y2)}`);
        const cls = link.type === "parent" ? "is-parent" : "is-blocked";
        path.setAttribute("marker-end", `url(#${markerKey}-${link.type === "parent" ? "parent" : "blocked"})`);
        path.classList.add(cls);
        svg.appendChild(path);
      }
    };
    this.scheduleFlowRender(drawFlowLines, [graph, body, stage, canvas]);
  }

  bindPannableStage(stage) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;
    stage.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (event.target && event.target.closest && event.target.closest(".wjq-home-flow-node-card, .wjq-home-flow-loose-card, button, .wjq-relation-drop-zones")) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      scrollLeft = stage.scrollLeft;
      scrollTop = stage.scrollTop;
      stage.addClass("is-panning");
      event.preventDefault();
    });
    this.registerRenderWindowEvent("mousemove", (event) => {
      if (!dragging) return;
      stage.scrollLeft = scrollLeft - (event.clientX - startX);
      stage.scrollTop = scrollTop - (event.clientY - startY);
    });
    this.registerRenderWindowEvent("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      stage.removeClass("is-panning");
    });
  }

  applyFlowGraphColumns(body, showUnlinked = this.plugin.settings.homeFlowShowUnlinked !== false) {
    if (!showUnlinked) {
      body.style.gridTemplateColumns = "minmax(0, 1fr)";
      return;
    }
    const width = Math.max(150, Math.min(420, Number(this.plugin.settings.homeFlowLooseWidth) || DEFAULT_SETTINGS.homeFlowLooseWidth));
    body.style.gridTemplateColumns = `minmax(0, 1fr) 8px ${width}px`;
  }

  bindFlowLooseResizer(handle, body) {
    handle.onpointerdown = (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = Math.max(150, Math.min(420, Number(this.plugin.settings.homeFlowLooseWidth) || DEFAULT_SETTINGS.homeFlowLooseWidth));
      const onMove = (moveEvent) => {
        const next = Math.max(150, Math.min(420, startWidth - (moveEvent.clientX - startX)));
        this.plugin.settings.homeFlowLooseWidth = next;
        this.applyFlowGraphColumns(body, true);
      };
      const onUp = async () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        await this.plugin.saveSettings({ refresh: false });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  async setHomeFlowZoom(value) {
    const next = Math.max(0.6, Math.min(1.8, Math.round(value * 10) / 10));
    this.plugin.settings.homeFlowZoom = next;
    await this.plugin.saveSettings();
    this.renderSafely();
  }

  renderHomeFlowFallback(parent, tasks) {
    const active = tasks.filter((task) => !task.completed).slice(0, 8);
    if (!active.length) return;
    const fallback = parent.createDiv({ cls: "wjq-home-flow-fallback" });
    fallback.createDiv({ cls: "wjq-home-panel-title", text: "当前可推进任务" });
    for (const task of active) {
      this.renderHomeFlowNode(fallback, task, task.projects[0] || "任务");
    }
  }

  renderHomeFlowNode(parent, task, label) {
    const node = parent.createDiv({ cls: `wjq-home-flow-node ${task.completed ? "is-done" : ""}` });
    node.createDiv({ cls: "wjq-home-flow-label", text: label });
    node.createDiv({ cls: "wjq-home-flow-title", text: task.displayText || task.text });
    node.createDiv({ cls: "wjq-home-flow-meta", text: [this.homeTaskBadge(task), task.due ? this.scheduleLabel(task) : ""].filter(Boolean).join(" · ") });
    node.onclick = () => this.openTaskByDefault(task);
    this.attachContextMenu(node, this.flowTaskContextActions(task));
  }

  flowTaskContextActions(task) {
    return this.taskContextActions(task);
  }

  openFlowRelatedTask(task, relation) {
    return this.plugin.openSidebarNewTaskFromSelection({
      project: task.projects[0] || "",
      status: "待开始",
      parentKey: relation === "child" ? task.runtimeId : "",
      blockedByKey: relation === "next" ? task.runtimeId : "",
      due: "",
      deadline: "",
      hardDeadline: "",
      progress: "",
      sourcePath: "",
      insertLine: -1,
    });
  }

  renderHomeGanttView(parent) {
    const rangeOptions = [
      ["week", "一周 · 今天起7天", 7, 40],
      ["twoWeeks", "两周 · 本周+下周", 14, 36],
      ["month", "一月 · 本月", 31, 28],
      ["year", "一年 · 全年", 366, 18],
    ];
    const selectedRange = this.plugin.settings.homeGanttRange || "month";
    const controls = parent.createDiv({ cls: "wjq-home-gantt-controls" });
    for (const [key, label] of rangeOptions) {
      this.renderHomeToggle(controls, label, selectedRange === key, async () => {
        this.plugin.settings.homeGanttRange = key;
        this.plugin.settings.homeGanttOffsetDays = 0;
        await this.plugin.saveSettings();
        this.renderSafely();
      });
    }
    const range = rangeOptions.find(([key]) => key === selectedRange) || rangeOptions[2];
    const natural = this.homeGanttNaturalRange(selectedRange);
    const offsetDays = Number(this.plugin.settings.homeGanttOffsetDays) || 0;
    const start = localDateString(addDays(parseLocalDate(natural.start), offsetDays));
    const end = localDateString(addDays(parseLocalDate(natural.end), offsetDays));
    const dayMinWidth = range[3];
    const tasks = this.homeGlobalTasks().filter((task) => {
      if (!this.isCalendarTask(task)) return false;
      const taskStart = this.calendarTaskStartDate(task);
      const taskEnd = this.calendarTaskEndDate(task);
      return taskStart <= end && taskEnd >= start;
    }).sort((a, b) => this.compareTasksBySchedule(a, b));
    const days = datesBetween(start, end);

    const wrap = parent.createDiv({ cls: "wjq-home-gantt-view" });
    const header = wrap.createDiv({ cls: "wjq-home-gantt-header" });
    header.createDiv({ cls: "wjq-home-gantt-task-head", text: "任务" });
    const scale = header.createDiv({ cls: "wjq-home-gantt-scale" });
    scale.style.gridTemplateColumns = `repeat(${days.length}, minmax(${dayMinWidth}px, 1fr))`;
    for (const day of days) {
      scale.createDiv({ cls: "wjq-home-gantt-day", text: this.shortDate(day) });
    }
    if (!tasks.length) wrap.createDiv({ cls: "wjq-task-hub-empty", text: "当前范围内还没有设置日期的任务。" });

    for (const task of tasks.slice(0, 50)) {
      const taskStart = this.calendarTaskStartDate(task);
      const taskEnd = this.calendarTaskEndDate(task);
      if (taskStart > end || taskEnd < start) continue;
      const row = wrap.createDiv({ cls: `wjq-home-gantt-row ${task.completed ? "is-done" : ""}` });
      const label = row.createDiv({ cls: "wjq-home-gantt-label", text: task.displayText || task.text });
      label.onclick = () => this.openTaskByDefault(task);
      const track = row.createDiv({ cls: "wjq-home-gantt-track" });
      track.style.gridTemplateColumns = `repeat(${days.length}, minmax(${dayMinWidth}px, 1fr))`;
      const visibleStart = taskStart < start ? start : taskStart;
      const visibleEnd = taskEnd > end ? end : taskEnd;
      const offset = Math.max(0, dateDiffDays(start, visibleStart));
      const span = Math.max(1, Math.min(days.length - offset, dateDiffDays(visibleStart, visibleEnd) + 1));
      const bar = track.createDiv({ cls: "wjq-home-gantt-bar", text: this.scheduleLabel(task) });
      bar.style.gridColumn = `${offset + 1} / span ${span}`;
      bar.onclick = () => new DateModal(this.plugin, task).open();
      this.attachContextMenu(row, this.taskContextActions(task));
    }
    const scrubber = parent.createDiv({ cls: "wjq-home-gantt-scrubber" });
    scrubber.createDiv({ cls: "wjq-home-gantt-scrubber-label", text: `${start} 至 ${end}` });
    const scrubberTrack = scrubber.createDiv({ cls: "wjq-home-gantt-scrubber-track" });
    const scrubberThumb = scrubberTrack.createDiv({ cls: "wjq-home-gantt-scrubber-thumb" });
    this.bindGanttScrubber(scrubberTrack, scrubberThumb, scrubber.querySelector(".wjq-home-gantt-scrubber-label"), dayMinWidth);
  }

  homeGanttNaturalRange(rangeKey) {
    const today = this.calendarAnchorDate();
    if (rangeKey === "twoWeeks") {
      const day = today.getDay() || 7;
      const monday = addDays(today, 1 - day);
      return { start: localDateString(monday), end: localDateString(addDays(monday, 13)) };
    }
    if (rangeKey === "month") {
      return {
        start: localDateString(dateFromParts(today.getFullYear(), today.getMonth(), 1)),
        end: localDateString(dateFromParts(today.getFullYear(), today.getMonth() + 1, 0)),
      };
    }
    if (rangeKey === "year") {
      return {
        start: localDateString(dateFromParts(today.getFullYear(), 0, 1)),
        end: localDateString(dateFromParts(today.getFullYear(), 11, 31)),
      };
    }
    const start = localDateString(today);
    return { start, end: localDateString(addDays(today, 6)) };
  }

  bindGanttScrubber(track, thumb, label, dayMinWidth) {
    let dragging = false;
    let startX = 0;
    let baseOffset = 0;
    let pendingDelta = 0;
    let frame = 0;
    const updatePreview = () => {
      frame = 0;
      const range = this.plugin.settings.homeGanttRange || "month";
      const natural = this.homeGanttNaturalRange(range);
      const offset = baseOffset - pendingDelta;
      const start = localDateString(addDays(parseLocalDate(natural.start), offset));
      const end = localDateString(addDays(parseLocalDate(natural.end), offset));
      if (label) label.setText(`${start} 至 ${end}`);
      thumb.style.transform = `translateX(${Math.max(-120, Math.min(120, pendingDelta * 3))}px)`;
    };
    const queuePreview = () => {
      if (!frame) frame = window.requestAnimationFrame(updatePreview);
    };
    const finish = async (event) => {
      if (!dragging) return;
      dragging = false;
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      track.removeClass("is-dragging");
      thumb.style.transform = "";
      if (thumb.releasePointerCapture && event && thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId);
      if (!pendingDelta) return;
      this.plugin.settings.homeGanttOffsetDays = baseOffset - pendingDelta;
      await this.plugin.saveSettings({ refresh: false });
      this.renderSafely();
    };
    thumb.onpointerdown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      dragging = true;
      startX = event.clientX;
      baseOffset = Number(this.plugin.settings.homeGanttOffsetDays) || 0;
      pendingDelta = 0;
      track.addClass("is-dragging");
      if (thumb.setPointerCapture) thumb.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };
    thumb.onpointermove = (event) => {
      if (!dragging) return;
      const nextDelta = Math.round((event.clientX - startX) / Math.max(12, dayMinWidth));
      if (nextDelta === pendingDelta) return;
      pendingDelta = nextDelta;
      queuePreview();
    };
    thumb.onpointerup = finish;
    thumb.onpointercancel = finish;
  }

  renderHomeProjectDashboard(container) {
    const summaries = this.projectSummaries().filter((item) => {
      const query = this.search.trim().toLowerCase();
      if (!query) return true;
      return `${item.project} ${item.stage} ${item.next} ${item.progress}`.toLowerCase().includes(query);
    });
    if (!summaries.length) return;

    const section = container.createDiv({ cls: "wjq-task-hub-section wjq-home-projects" });
    const heading = section.createDiv({ cls: "wjq-workbench-module-heading" });
    heading.createEl("h2", { text: "当前项目" });
    this.createButton(heading, "新建任务", () => this.plugin.openSidebarNewTaskFromSelection({ project: this.selectedHomeProject(summaries), sourcePath: "", insertLine: -1 }));

    const grid = section.createDiv({ cls: "wjq-home-project-grid" });
    const selectedProject = this.selectedHomeProject(summaries);
    for (const summary of summaries) {
      const card = grid.createDiv({ cls: `wjq-home-project-card ${summary.project === selectedProject ? "is-active" : ""}` });
      const top = card.createDiv({ cls: "wjq-home-project-card-top" });
      top.createDiv({ cls: "wjq-home-project-name", text: summary.project });
      top.createDiv({ cls: "wjq-home-project-dot" });
      card.createDiv({ cls: "wjq-home-project-stage", text: summary.stage });
      if (summary.progress) card.createDiv({ cls: "wjq-home-project-line", text: `当前进度：${summary.progress}` });
      if (summary.next) card.createDiv({ cls: "wjq-home-project-line", text: `下一步：${summary.next}` });
      if (summary.keyDate) card.createDiv({ cls: "wjq-home-project-line", text: `关键节点：${summary.keyDate}` });
      card.onclick = () => {
        this.project = summary.project;
        this.renderSafely();
      };
      this.attachContextMenu(card, [
        { title: "重命名", icon: "pencil", callback: () => this.openRenameProjectModal(summary.project) },
        { title: "选中项目", icon: "check", callback: () => {
          this.project = summary.project;
          this.renderSafely();
        } },
        { title: "删除项目", icon: "trash-2", callback: () => new ProjectDeleteModal(this.plugin, summary.project, this.tasks).open() },
      ]);
    }

    const detail = section.createDiv({ cls: "wjq-home-project-detail" });
    const tree = detail.createDiv({ cls: "wjq-task-hub-section" });
    tree.createEl("h3", { text: `${selectedProject} · 任务树` });
    this.renderHomeProjectTaskTree(tree, selectedProject);
    const schedule = detail.createDiv({ cls: "wjq-task-hub-section" });
    schedule.createEl("h3", { text: `${selectedProject} · 近期安排` });
    this.renderHomeProjectSchedule(schedule, selectedProject);
  }

  selectedHomeProject(summaries) {
    if (this.project !== "全部" && summaries.some((item) => item.project === this.project)) return this.project;
    return summaries[0] ? summaries[0].project : "";
  }

  projectSummaries() {
    const projects = this.homeProjectNames();
    return projects.map((project) => {
      const projectTasks = this.tasks.filter((task) => task.projects.includes(project));
      const open = projectTasks.filter((task) => !task.completed);
      const next = open.slice().sort((a, b) => {
        if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
        if (a.due && !b.due) return -1;
        if (!a.due && b.due) return 1;
        return `${a.path}:${a.lineNumber}`.localeCompare(`${b.path}:${b.lineNumber}`);
      })[0];
      const stage = next ? taskStatusText(next) || "推进中" : projectTasks.length ? "暂时收束" : "尚未开始";
      const progressTask = open.find((task) => taskProgressText(task)) || next;
      const keyTask = open.find((task) => task.due || task.deadline);
      return {
        project,
        stage,
        progress: progressTask ? taskProgressText(progressTask) : "",
        next: next ? next.displayText || next.text : "",
        keyDate: keyTask ? keyTask.deadline || keyTask.due : "",
      };
    });
  }

  renderHomeProjectTaskTree(parent, project) {
    const tasks = this.tasks.filter((task) => !task.completed && task.projects.includes(project));
    if (!tasks.length) {
      parent.createDiv({ cls: "wjq-task-hub-empty", text: "这个项目还没有未完成任务。" });
      return;
    }
    const { roots, childrenByParent } = this.buildTaskTree(tasks);
    for (const task of roots.slice(0, 8)) {
      this.renderHomeProjectTaskRow(parent, task, 0, childrenByParent, new Set());
    }
  }

  renderHomeProjectTaskRow(parent, task, depth, childrenByParent, seen) {
    const row = parent.createDiv({ cls: "wjq-home-project-task-row" });
    row.style.setProperty("--task-depth", String(Math.min(depth, 8)));
    const top = row.createDiv({ cls: "wjq-home-project-task-top" });
    const title = top.createDiv({ cls: "wjq-home-project-task-title", text: task.displayText || task.text });
    title.onclick = () => this.openTaskByDefault(task);
    row.createDiv({ cls: "wjq-home-project-task-meta", text: [taskStatusText(task), taskProgressText(task), task.due].filter(Boolean).join(" · ") });
    this.attachContextMenu(row, this.taskContextActions(task));
    if (!task.taskId || seen.has(task.taskId)) return;
    seen.add(task.taskId);
    for (const child of (childrenByParent.get(task.taskId) || []).slice(0, 6)) {
      this.renderHomeProjectTaskRow(parent, child, depth + 1, childrenByParent, seen);
    }
  }

  renderHomeProjectSchedule(parent, project) {
    const today = this.calendarAnchorDateString();
    const tasks = this.tasks
      .filter((task) => !task.completed && task.projects.includes(project) && task.due && task.due >= today)
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 8);
    if (!tasks.length) {
      parent.createDiv({ cls: "wjq-task-hub-empty", text: "近期没有安排到具体日期的任务。" });
      return;
    }
    for (const task of tasks) {
      const row = parent.createDiv({ cls: "wjq-home-schedule-row" });
      row.createDiv({ cls: "wjq-home-schedule-date", text: task.due });
      const top = row.createDiv({ cls: "wjq-home-project-task-top" });
      const title = top.createDiv({ cls: "wjq-home-schedule-title", text: task.displayText || task.text });
      title.onclick = () => this.openTaskByDefault(task);
      this.attachContextMenu(row, this.taskContextActions(task));
    }
  }

  renderHomeOngoing(container) {
    const items = this.plugin.activeItems(12).filter((item) => this.matchesWorkspaceSearch(item));
    if (!items.length) {
      return;
    }
    const section = container.createDiv({ cls: "wjq-task-hub-section" });
    section.createEl("h2", { text: "当前进行中" });
    const grid = section.createDiv({ cls: "wjq-workbench-card-grid" });
    for (const item of items) {
      this.renderWorkspaceCard(grid, item);
    }
  }

  renderHomeRecent(container) {
    const section = container.createDiv({ cls: "wjq-task-hub-section" });
    section.createEl("h2", { text: "最近内容" });
    this.renderRecentFiles(section, this.plugin.getRecentFiles(6));
  }

  renderHomeTasks(container) {
    const section = container.createDiv({ cls: "wjq-task-hub-section wjq-workbench-task-module" });
    const titleRow = section.createDiv({ cls: "wjq-workbench-module-heading" });
    titleRow.createEl("h2", { text: "项目与任务" });
    this.renderStats(section);
    this.renderProjectProgress(section);
    const today = this.calendarAnchorDateString();
    const soon = localDateString(addDays(this.calendarAnchorDate(), 13));
    const upcoming = this.tasks.filter((task) => !task.completed && task.due && task.due >= today && task.due <= soon).slice(0, 6);
    if (upcoming.length) {
      this.renderMiniTaskGroup(section, "未来14天", upcoming);
    }
  }

  matchesWorkspaceSearch(item) {
    const query = this.search.trim().toLowerCase();
    if (!query) return true;
    const haystack = `${item.title} ${item.path} ${item.type} ${item.status} ${item.nextAction} ${(item.author || []).join(" ")} ${item.source || ""} ${(item.keywords || []).join(" ")}`.toLowerCase();
    return haystack.includes(query);
  }

  renderWorkspaceCard(parent, item) {
    const card = parent.createDiv({ cls: "wjq-workbench-work-card" });
    const title = card.createDiv({ cls: "wjq-task-hub-work-title", text: item.title });
    title.onclick = () => this.plugin.openPath(item.path);
    const meta = [item.type, item.status, this.plugin.progressText(item), formatRelativeTime(item.mtime)].filter(Boolean);
    card.createDiv({ cls: "wjq-task-hub-work-meta", text: meta.join(" · ") || item.folder });
    if (item.nextAction) card.createDiv({ cls: "wjq-task-hub-work-next", text: `下一步：${item.nextAction}` });
    if (item.due) card.createDiv({ cls: "wjq-task-hub-work-meta", text: `截止：${item.due}` });
    this.attachContextMenu(card, [
      { title: "重命名", icon: "pencil", callback: () => this.openRenamePathModal(item.path, item.title) },
      { title: "打开", icon: "file-text", callback: () => this.plugin.openPath(item.path) },
      { separator: true },
      { title: "删除", icon: "trash-2", callback: () => this.plugin.deletePathWithConfirm(item.path, item.title) },
    ]);
  }

  renderCompactWorkspaceRow(parent, item) {
    const row = parent.createDiv({ cls: "wjq-workbench-compact-row" });
    const title = row.createDiv({ cls: "wjq-task-hub-work-title", text: item.title });
    title.onclick = () => this.plugin.openPath(item.path);
    row.createDiv({ cls: "wjq-task-hub-work-meta", text: [item.status, this.plugin.progressText(item), formatRelativeTime(item.mtime)].filter(Boolean).join(" · ") || item.folder });
    if (item.nextAction) row.createDiv({ cls: "wjq-task-hub-work-next", text: item.nextAction });
    this.attachContextMenu(row, [
      { title: "重命名", icon: "pencil", callback: () => this.openRenamePathModal(item.path, item.title) },
      { title: "打开", icon: "file-text", callback: () => this.plugin.openPath(item.path) },
      { separator: true },
      { title: "删除", icon: "trash-2", callback: () => this.plugin.deletePathWithConfirm(item.path, item.title) },
    ]);
  }
}

class ProjectPageView extends WorkbenchHomeView {
  getViewType() {
    return PROJECT_VIEW_TYPE;
  }

  getDisplayText() {
    return "项目页";
  }

  getIcon() {
    return "folder-kanban";
  }

  async setState(state, result) {
    if (state && state.project) this.pageProject = String(state.project || "").trim();
    if (super.setState) await super.setState(state, result);
  }

  getState() {
    const base = super.getState ? super.getState() : {};
    return Object.assign({}, base, { project: this.pageProject || this.project || this.plugin.settings.currentProjectPage || "全部" });
  }

  render() {
    const container = this.containerEl.children[1];
    this.clearScheduledFlowRenders();
    container.empty();
    container.addClass("wjq-task-hub");
    container.addClass("wjq-project-page");
    this.project = this.pageProject || this.plugin.settings.currentProjectPage || "全部";

    const toolbar = container.createDiv({ cls: "wjq-workbench-toolbar" });
    toolbar.createEl("h1", { text: this.project === "全部" ? "全部项目" : this.project });
    toolbar.createDiv({ cls: "wjq-workbench-date", text: "项目独立页" });
    const actions = toolbar.createDiv({ cls: "wjq-task-hub-actions" });
    this.createButton(actions, "新建任务", () => this.plugin.openSidebarNewTaskFromSelection({ project: this.project !== "全部" ? this.project : "", sourcePath: "", insertLine: -1 }));
    this.createButton(actions, "记录推进", () => new ProjectProgressRecordModal(this.plugin, this.project).open());
    this.createButton(actions, "打开项目笔记", () => this.plugin.openProjectNote(this.project));
    this.createButton(actions, "主页", () => this.plugin.activateHomeView());
    if (this.project !== "全部") {
      this.createButton(actions, "重命名", () => this.openRenameProjectModal(this.project));
      this.createButton(actions, "归档", () => this.plugin.archiveProject(this.project));
    }
    this.createButton(actions, "刷新", () => this.refresh());

    this.renderProjectPageSummary(container);
    this.renderProjectPageFocus(container);
    this.renderHomeGlobalViews(container, { lockProject: true, viewSettingKey: "projectGlobalView" });
    this.renderTaskSideEditor(container);
  }

  renderProjectPageSummary(container) {
    const tasks = this.homeScopedTasks();
    const open = tasks.filter((task) => !task.completed && !/取消|归档/.test(taskStatusText(task)));
    const done = tasks.filter((task) => task.completed).length;
    const unscheduled = open.filter((task) => !task.due).length;
    const scheduled = open.filter((task) => task.due).length;
    const wrap = container.createDiv({ cls: "wjq-project-summary-grid wjq-project-summary-strip" });
    this.createStat(wrap, "未完成", open.length);
    this.createStat(wrap, "已排期", scheduled);
    this.createStat(wrap, "待排期", unscheduled);
    this.createStat(wrap, "已完成", done);
  }

  renderProjectPageFocus(container) {
    const tasks = this.homeScopedTasks();
    const open = tasks.filter((task) => !task.completed && !/取消|归档/.test(taskStatusText(task)));
    const current = open
      .filter((task) => task.due || /进行|等待|阅读|写作|整理|修改|暂停/.test(taskStatusText(task)))
      .sort((a, b) => this.compareTasksBySchedule(a, b))
      .slice(0, 30);
    const unscheduled = open
      .filter((task) => !task.due && !task.deadline)
      .sort((a, b) => this.compareTasksByCreation(a, b))
      .slice(0, 30);
    const countdown = this.countdownTasks(tasks).slice(0, 30);
    const materialPaths = this.taskMaterialPaths(tasks).slice(0, 30);
    const taskById = new Map(tasks.filter((task) => task.taskId).map((task) => [task.taskId, task]));
    const projectRecords = ((this.plugin.settings.projectRecords || {})[this.project] || [])
      .map((record, index) => ({
        projectRecord: true,
        index,
        id: record.id || "",
        date: record.date || "",
        text: record.text || "",
        project: this.project,
        taskId: record.task_id || record.taskId || "",
        taskTitle: record.task_title || record.taskTitle || "",
        linkedTask: taskById.get(record.task_id || record.taskId || ""),
      }));
    const recentRecords = tasks
      .flatMap((task) => {
        const notes = Array.isArray(task.recordNotes) && task.recordNotes.length
          ? task.recordNotes.map((record, index) => {
            const linkedId = record.task_id || record.taskId || task.taskId || "";
            return {
              task,
              linkedTask: taskById.get(linkedId) || task,
              index,
              id: record.id || "",
              date: record.date || "",
              text: record.text || "",
              taskId: linkedId,
              taskTitle: record.task_title || record.taskTitle || "",
            };
          })
          : (task.recordDates || []).map((date, index) => ({ task, linkedTask: task, index, id: "", date, text: "", taskId: task.taskId || "", taskTitle: task.displayText || task.text || "" }));
        return notes;
      })
      .filter((record) => record.date)
      .concat(projectRecords.filter((record) => record.date))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 8);

    const renderBlock = (parent, title, items, empty, renderItem, extraClass = "", renderActions = null) => {
      const block = parent.createDiv({ cls: `wjq-home-panel wjq-project-focus-block ${extraClass}`.trim() });
      const header = block.createDiv({ cls: "wjq-home-panel-header" });
      header.createEl("h2", { text: title });
      if (renderActions) renderActions(header, block);
      if (!items.length) {
        block.createDiv({ cls: "wjq-task-hub-empty", text: empty });
        return;
      }
      for (const item of items) renderItem(block, item);
    };

    const section = container.createDiv({ cls: "wjq-project-focus-grid wjq-project-focus-five" });
    this.applyProjectFocusColumns(section, "projectPageColumns");
    renderBlock(section, "相关材料", materialPaths, "还没有相关来源笔记。", (block, path) => {
      this.renderMaterialPathRow(block, path);
    }, "wjq-project-material-column", (header, block) => {
      let selectedTaskKey = "";
      let selectedPath = "";
      const addRow = block.createDiv({ cls: "wjq-material-add-row wjq-project-material-add-row" });
      this.renderSideTaskSelect(addRow, "关联任务", tasks, selectedTaskKey, (value) => (selectedTaskKey = value));
      this.renderSideNoteSelect(addRow, "添加笔记", this.plugin.app.vault.getMarkdownFiles(), selectedPath, (value) => (selectedPath = value), "wjq-material-note-select");
      const addActions = addRow.createDiv({ cls: "wjq-material-add-actions" });
      const confirm = this.createButton(addActions, "添加", async () => {
        const selectedTask = tasks.find((task) => task.runtimeId === selectedTaskKey);
        if (!selectedTask || !selectedPath) {
          new Notice("请先选择任务和笔记");
          return;
        }
        const saved = await this.plugin.addMaterialToTask(selectedTask, selectedPath, { skipRefresh: true });
        if (saved) await this.refresh();
      });
      confirm.addClass("mod-cta");
      this.createButton(header, "添加", () => addRow.toggleClass("is-open", !addRow.classList.contains("is-open")));
    });
    this.renderProjectFocusResizeHandle(section, "projectPageColumns", 0);
    renderBlock(section, "当前推进任务", current, "这个项目暂时没有正在推进的任务。", (block, task) => this.renderHomeCompactTask(block, task), "wjq-project-current-column");
    this.renderProjectFocusResizeHandle(section, "projectPageColumns", 1);
    renderBlock(section, "倒计时任务", countdown, "没有设置截止日期的未完成任务。", (block, task) => this.renderCountdownTask(block, task), "wjq-project-countdown-column");
    this.renderProjectFocusResizeHandle(section, "projectPageColumns", 2);
    renderBlock(section, "最近推进记录", recentRecords, "还没有推进记录。", (block, record) => {
      const row = block.createDiv({ cls: "wjq-home-list-row wjq-progress-record-row" });
      const main = row.createDiv({ cls: "wjq-home-row-main" });
      main.createDiv({ cls: "wjq-home-row-title", text: record.projectRecord ? (record.taskTitle ? `项目记录：${record.taskTitle}` : "项目记录") : (record.task.displayText || record.task.text) });
      main.createDiv({ cls: "wjq-home-row-meta", text: [record.date, record.text].filter(Boolean).join(" · ") });
      if (record.task) {
        row.onclick = () => this.plugin.activateTaskFullPage(record.linkedTask || record.task);
        this.attachContextMenu(row, [
          { title: "修改", icon: "pencil", callback: () => new ProgressRecordModal(this.plugin, record.task, { record, index: record.index }).open() },
          { title: "删除", icon: "trash-2", callback: () => this.plugin.deleteProgressRecord(record.task, record, record.index) },
          { separator: true },
          { title: "打开关联任务", icon: "panel-top-open", callback: () => this.plugin.activateTaskFullPage(record.linkedTask || record.task) },
          { title: "打开来源", icon: "file-text", callback: () => this.plugin.openTaskSource(record.task) },
        ]);
      } else if (record.projectRecord) {
        if (record.linkedTask) row.onclick = () => this.plugin.activateTaskFullPage(record.linkedTask);
        this.attachContextMenu(row, [
          { title: "修改", icon: "pencil", callback: () => new ProjectProgressRecordModal(this.plugin, this.project, { record, index: record.index }).open() },
          { title: "删除", icon: "trash-2", callback: () => this.plugin.deleteProjectProgressRecord(this.project, record, record.index) },
          ...(record.linkedTask ? [
            { separator: true },
            { title: "打开关联任务", icon: "panel-top-open", callback: () => this.plugin.activateTaskFullPage(record.linkedTask) },
          ] : []),
        ]);
      }
    }, "wjq-project-record-column");
    this.renderProjectFocusResizeHandle(section, "projectPageColumns", 3);
    renderBlock(section, "待排期任务", unscheduled, "没有待排期任务。", (block, task) => this.renderHomeCompactTask(block, task, { unscheduled: true }), "wjq-project-attention-column");
  }

  projectFocusColumnValues(key) {
    const fallback = Array.isArray(DEFAULT_SETTINGS[key]) ? DEFAULT_SETTINGS[key] : DEFAULT_SETTINGS.projectPageColumns;
    return Array.isArray(this.plugin.settings[key]) && this.plugin.settings[key].length === fallback.length
      ? this.plugin.settings[key]
      : fallback;
  }

  applyProjectFocusColumns(section, key) {
    const values = this.projectFocusColumnValues(key);
    section.style.gridTemplateColumns = values
      .map((value) => `minmax(180px, ${Math.max(0.45, Number(value) || 1)}fr)`)
      .join(" 8px ");
  }

  renderProjectFocusResizeHandle(parent, key, index) {
    const handle = parent.createDiv({ cls: "wjq-home-column-resizer wjq-project-column-resizer", attr: { title: "拖动调整项目页栏目宽度" } });
    handle.onpointerdown = (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const start = this.projectFocusColumnValues(key).slice();
      const onMove = (moveEvent) => {
        const delta = (moveEvent.clientX - startX) / 180;
        const next = start.slice();
        next[index] = Math.max(0.45, start[index] + delta);
        next[index + 1] = Math.max(0.45, start[index + 1] - delta);
        this.plugin.settings[key] = next;
        this.applyProjectFocusColumns(parent, key);
      };
      const onUp = async () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        await this.plugin.saveSettings({ refresh: false });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }
}

class TaskDetailView extends WorkbenchHomeView {
  getViewType() {
    return TASK_DETAIL_VIEW_TYPE;
  }

  getDisplayText() {
    return "任务详情";
  }

  getIcon() {
    return "list-todo";
  }

  async setState(state, result) {
    if (state && state.taskId) this.pageTaskId = String(state.taskId || "");
    if (super.setState) await super.setState(state, result);
  }

  getState() {
    const base = super.getState ? super.getState() : {};
    return Object.assign({}, base, { taskId: this.pageTaskId || this.plugin.settings.currentFullTaskId || this.plugin.settings.currentTaskId || "" });
  }

  render() {
    const container = this.containerEl.children[1];
    this.clearScheduledFlowRenders();
    container.empty();
    container.addClass("wjq-task-hub");
    container.addClass("wjq-task-detail-page");
    const taskId = this.pageTaskId || this.plugin.settings.currentFullTaskId || this.plugin.settings.currentTaskId || "";
    const task = this.tasks.find((item) => item.taskId === taskId);
    if (!task) {
      container.createDiv({ cls: "wjq-task-hub-empty", text: "没有找到当前任务。请从工作台或任务列表重新打开任务详情。" });
      return;
    }
    this.currentTask = task;
    this.project = task.projects[0] || "全部";

    const toolbar = container.createDiv({ cls: "wjq-workbench-toolbar" });
    toolbar.createEl("h1", { text: task.displayText || task.text });
    toolbar.createDiv({ cls: "wjq-workbench-date", text: task.projects.join(" / ") || task.path });
    const actions = toolbar.createDiv({ cls: "wjq-task-hub-actions" });
    this.createButton(actions, "日期", () => new DateModal(this.plugin, task).open());
    this.createButton(actions, "记录推进", () => new ProgressRecordModal(this.plugin, task).open());
    this.createButton(actions, "开始", () => this.plugin.startTask(task));
    this.createButton(actions, "完成", () => this.plugin.completeTask(task));
    this.createButton(actions, "取消", () => this.plugin.cancelTask(task));
    this.createButton(actions, "打开来源", () => this.plugin.openTaskSource(task));

    this.renderTaskDetailStatusStrip(container, task);

    const hasChildren = this.taskChildrenOf(task).length > 0;
    const section = container.createDiv({ cls: "wjq-task-detail-grid wjq-task-detail-main-grid" });
    this.applyTaskDetailColumns(section, "taskDetailSecondaryColumns", hasChildren ? 4 : 3);
    this.renderTaskWorkspaceTextPanel(section, task, "相关材料", "materials", "每行放一个双链、文件路径、网页或资料说明。", "wjq-task-material-column");
    this.renderTaskDetailResizeHandle(section, "taskDetailSecondaryColumns", 0);
    this.renderTaskDetailRecords(section, task, "wjq-task-record-column");
    this.renderTaskDetailResizeHandle(section, "taskDetailSecondaryColumns", 1);
    if (hasChildren) {
      this.renderTaskDetailCountdown(section, task, "wjq-task-countdown-column");
      this.renderTaskDetailResizeHandle(section, "taskDetailSecondaryColumns", 2);
    }
    this.renderTaskWorkspaceTextPanel(section, task, "备注", "note", "临时想法、提醒、卡点、尚未成体系的判断。", "wjq-task-note-column");

    this.renderHomeGlobalViews(container, {
      lockProject: true,
      scopeLabel: "范围：当前任务关联",
      viewSettingKey: "taskDetailViewMode",
    });
  }

  homeScopedTasks() {
    const task = this.currentTask || this.tasks.find((item) => item.taskId === (this.pageTaskId || this.plugin.settings.currentFullTaskId || this.plugin.settings.currentTaskId || ""));
    if (!task) return [];
    return this.taskDetailScopedTasks(task);
  }

  taskDetailScopedTasks(task) {
    const byId = new Map(this.tasks.filter((item) => item.taskId).map((item) => [item.taskId, item]));
    const scoped = new Map();
    const add = (item) => {
      if (!item || !item.taskId || scoped.has(item.taskId)) return false;
      scoped.set(item.taskId, item);
      return true;
    };
    const addDescendants = (item, seen = new Set()) => {
      if (!item || !item.taskId || seen.has(item.taskId)) return;
      seen.add(item.taskId);
      const children = this.tasks
        .filter((child) => child.parentId === item.taskId)
        .sort((a, b) => this.compareTasksByCreation(a, b));
      for (const child of children) {
        add(child);
        addDescendants(child, new Set(seen));
      }
    };
    const addSuccessors = (item, seen = new Set()) => {
      if (!item || !item.taskId || seen.has(item.taskId)) return;
      seen.add(item.taskId);
      const nextTasks = this.tasks
        .filter((next) => next.blockedBy === item.taskId)
        .sort((a, b) => this.compareTasksByCreation(a, b));
      for (const next of nextTasks) {
        add(next);
        addSuccessors(next, new Set(seen));
      }
    };
    const addPredecessors = (item, seen = new Set()) => {
      if (!item || !item.blockedBy || seen.has(item.taskId)) return;
      seen.add(item.taskId);
      const previous = byId.get(item.blockedBy);
      if (!previous) return;
      add(previous);
      addPredecessors(previous, new Set(seen));
    };

    add(task);
    addDescendants(task);
    addSuccessors(task);
    addPredecessors(task);

    let cursor = task;
    const seenAncestors = new Set();
    while (cursor && cursor.parentId && !seenAncestors.has(cursor.taskId)) {
      seenAncestors.add(cursor.taskId);
      const parent = byId.get(cursor.parentId);
      if (!parent) break;
      add(parent);
      const siblings = this.tasks
        .filter((item) => item.parentId === parent.taskId)
        .sort((a, b) => this.compareTasksByCreation(a, b));
      for (const sibling of siblings) add(sibling);
      cursor = parent;
    }

    return Array.from(scoped.values()).sort((a, b) => this.compareTasksByCreation(a, b));
  }

  renderTaskDetailStatusStrip(container, task) {
    const strip = container.createDiv({ cls: "wjq-task-detail-status-strip" });
    const fields = [
      ["项目", task.projects.join(" / ") || "未设项目"],
      ["状态", this.homeTaskBadge(task)],
      ["开始", task.due || "未设置"],
      ["截止日期", task.hardDeadline || "无"],
      ["计划完成", task.deadline || "未设置"],
      ["实际完成", task.completedAt || "未完成"],
    ];
    for (const [label, value] of fields) {
      const item = strip.createDiv({ cls: "wjq-task-detail-status-item" });
      item.createSpan({ cls: "wjq-task-detail-status-label", text: label });
      item.createSpan({ cls: "wjq-task-detail-status-value", text: value });
    }
  }

  taskDetailColumnValues(key) {
    const fallback = Array.isArray(DEFAULT_SETTINGS[key]) ? DEFAULT_SETTINGS[key] : [1, 1];
    const values = Array.isArray(this.plugin.settings[key]) && this.plugin.settings[key].length === fallback.length
      ? this.plugin.settings[key]
      : fallback;
    return values.map((value) => Math.max(0.4, Number(value) || 1));
  }

  applyTaskDetailColumns(section, key, count = 0) {
    let values = this.taskDetailColumnValues(key);
    if (count > 0 && values.length !== count) {
      values = values.slice(0, count);
      while (values.length < count) values.push(1);
    }
    section.style.gridTemplateColumns = values.map((value, index) => {
      const column = `${value}fr`;
      return index < values.length - 1 ? `${column} 8px` : column;
    }).join(" ");
  }

  renderTaskDetailResizeHandle(parent, key, index) {
    const handle = parent.createDiv({ cls: "wjq-home-column-resizer wjq-task-detail-column-resizer" });
    handle.onpointerdown = (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const start = this.taskDetailColumnValues(key).slice();
      const total = Math.max(0.1, start[index] + start[index + 1]);
      const onMove = (moveEvent) => {
        const delta = (moveEvent.clientX - startX) / 180;
        const left = Math.max(0.4, start[index] + delta);
        const right = Math.max(0.4, start[index + 1] - delta);
        const scale = total / (left + right);
        const next = start.slice();
        next[index] = Number((left * scale).toFixed(3));
        next[index + 1] = Number((right * scale).toFixed(3));
        this.plugin.settings[key] = next;
        this.applyTaskDetailColumns(parent, key);
      };
      const onUp = async () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        await this.plugin.saveSettings({ refresh: false });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  renderTaskInlineEditor(container, task, extraClass = "") {
    const section = container.createDiv({ cls: `wjq-home-panel wjq-task-detail-panel wjq-task-editor-panel ${extraClass}`.trim() });
    const header = section.createDiv({ cls: "wjq-home-panel-header" });
    header.createEl("h2", { text: "任务总览" });
    this.createButton(header, "记录推进", () => new ProgressRecordModal(this.plugin, task).open());

    const state = {
      title: task.displayText || task.text || "",
      project: task.projects[0] || this.plugin.settings.defaultProjects[0] || "",
      status: taskStatusText(task) || "待开始",
      due: task.due || "",
      deadline: task.deadline || "",
      hardDeadline: task.hardDeadline || "",
      completedAt: task.completedAt || "",
      progress: task.progress || "",
      priority: task.priority || "",
      parentKey: "",
      childKeys: [],
      blockedByKey: "",
      nextKeys: [],
    };
    const relationTasks = this.tasks.filter((item) => !sameTask(item, task));
    const relationTaskByKey = (key) => relationTasks.find((item) => item.runtimeId === key) || null;
    const relationById = new Map(relationTasks.filter((item) => item.taskId).map((item) => [item.taskId, item]));
    const currentParent = task.parentId ? relationById.get(task.parentId) : null;
    const currentBlockedBy = task.blockedBy ? relationById.get(task.blockedBy) : null;
    if (currentParent) state.parentKey = currentParent.runtimeId;
    if (currentBlockedBy) state.blockedByKey = currentBlockedBy.runtimeId;
    state.childKeys = relationTasks.filter((item) => item.parentId === task.taskId).map((item) => item.runtimeId);
    state.nextKeys = relationTasks.filter((item) => item.blockedBy === task.taskId).map((item) => item.runtimeId);

    const form = section.createDiv({ cls: "wjq-task-editor-grid" });
    this.renderEditorTextField(form, "任务", state.title, (value) => (state.title = value));
    this.renderEditorSelectField(form, "所属项目", this.allProjects().filter((project) => project !== "全部"), state.project, (value) => (state.project = value));
    this.renderEditorTextField(form, "开始日期", dateInputValue(state.due), (value) => (state.due = value), `${currentYearMonth()}-`);
    this.renderEditorTextField(form, "截止日期", dateInputValue(state.hardDeadline), (value) => (state.hardDeadline = value), `${currentYearMonth()}-`);
    this.renderEditorTextField(form, "计划完成", dateInputValue(state.deadline), (value) => (state.deadline = value), `${currentYearMonth()}-`);
    this.renderEditorTextField(form, "实际完成", dateInputValue(state.completedAt), (value) => (state.completedAt = value), `${currentYearMonth()}-`);
    this.renderDetailProgressField(form, task);

    const statusBlock = section.createDiv({ cls: "wjq-task-editor-choice-block" });
    statusBlock.createDiv({ cls: "wjq-task-editor-label", text: "状态" });
    this.renderChoiceButtons(statusBlock, this.taskStatusChoices(true), state.status, (value) => {
      state.status = value;
    });

    const footer = section.createDiv({ cls: "wjq-task-hub-modal-actions" });
    const save = footer.createEl("button", { text: "保存修改" });
    save.addClass("mod-cta");
    save.onclick = async () => {
      const saved = await this.plugin.updateStructuredTask(task, {
        title: state.title,
        project: state.project,
        due: state.due.trim(),
        deadline: state.deadline.trim(),
        hardDeadline: state.hardDeadline.trim(),
        status: state.status,
        progress: state.progress.trim(),
        priority: state.priority,
        parentId: task.parentId || "",
        blockedBy: task.blockedBy || "",
        recordDates: task.recordDates || [],
        completedAt: state.completedAt.trim(),
        canceledAt: task.canceledAt || "",
        childDraft: "",
      });
      if (saved) await this.refresh();
    };
  }

  renderEditorTextField(parent, label, value, onChange, placeholder = "") {
    const field = parent.createDiv({ cls: "wjq-task-editor-field" });
    field.createDiv({ cls: "wjq-task-editor-label", text: label });
    const input = field.createEl("input", { attr: { type: "text", placeholder } });
    input.value = value || "";
    input.onchange = () => onChange(input.value);
  }

  renderEditorSelectField(parent, label, options, value, onChange) {
    const field = parent.createDiv({ cls: "wjq-task-editor-field" });
    field.createDiv({ cls: "wjq-task-editor-label", text: label });
    const select = field.createEl("select", { cls: "wjq-task-hub-select" });
    for (const optionValue of options) {
      const option = select.createEl("option", { text: optionValue, value: optionValue });
      option.selected = optionValue === value;
    }
    select.onchange = () => onChange(select.value);
  }

  renderDetailProgressField(parent, task) {
    const summary = this.taskProgressSummary(task);
    const field = parent.createDiv({ cls: "wjq-task-editor-field wjq-task-editor-progress-field" });
    field.createDiv({ cls: "wjq-task-editor-label", text: "进度" });
    field.createDiv({ cls: "wjq-task-editor-progress-value", text: summary.totalText || "" });
  }

  renderChoiceButtons(parent, options, activeValue, onChoose, emptyLabel = "") {
    const choices = parent.createDiv({ cls: "wjq-task-editor-choices" });
    for (const option of options) {
      const label = option || emptyLabel || "未设置";
      const button = choices.createEl("button", { text: label, cls: option === activeValue ? "is-active" : "" });
      button.onclick = () => {
        choices.querySelectorAll("button").forEach((item) => item.removeClass("is-active"));
        button.addClass("is-active");
        onChoose(option);
      };
    }
  }

  renderTaskDetailMeta(container, task) {
    const grid = container.createDiv({ cls: "wjq-detail-meta-grid" });
    this.renderDetailField(grid, "状态", this.homeTaskLabel(task));
    this.renderDetailField(grid, "项目", task.projects.join(", ") || "未设项目");
    this.renderDetailField(grid, "开始日期", task.due || "未设置");
    this.renderDetailField(grid, "截止日期", task.hardDeadline || "无");
    this.renderDetailField(grid, "计划完成", task.deadline || "未设置");
    this.renderDetailField(grid, "完成日期", task.completedAt || "未完成");
    this.renderDetailField(grid, "取消日期", task.canceledAt || "未取消");
    this.renderDetailField(grid, "来源", `${task.path}:${task.lineNumber}`);
  }

  homeTaskLabel(task) {
    return this.homeTaskBadge(task);
  }

  detailScheduleLabel(task) {
    const end = task.deadline && task.deadline >= task.due && task.deadline !== task.due ? task.deadline : "";
    return end ? `${task.due} 至 ${end}` : task.due;
  }

  renderDetailField(parent, label, value) {
    const field = parent.createDiv({ cls: "wjq-detail-field" });
    field.createDiv({ cls: "wjq-detail-label", text: label });
    field.createDiv({ cls: "wjq-detail-value", text: value || "无" });
  }

  renderTaskDetailProgress(container, task, extraClass = "") {
    const section = container.createDiv({ cls: `wjq-home-panel wjq-task-detail-panel wjq-task-detail-progress ${extraClass}`.trim() });
    section.createEl("h2", { text: "完整进度" });
    const summary = this.taskProgressSummary(task);
    if (!summary.total) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: "这个任务还没有下级任务。" });
      return;
    }
    section.createDiv({ cls: "wjq-detail-progress-total", text: summary.totalText });
    const roots = this.taskChildrenOf(task);
    for (const child of roots) this.renderProgressTreeItem(section, child, 0, new Set());
  }

  renderProgressTreeItem(parent, task, depth, seen) {
    if (!task || !task.taskId || seen.has(task.taskId)) return;
    seen.add(task.taskId);
    const count = this.taskProgressCount(task);
    const row = parent.createDiv({ cls: `wjq-detail-progress-row ${task.completed ? "is-done" : ""}` });
    row.style.setProperty("--task-depth", String(Math.min(depth, 8)));
    row.createDiv({ cls: "wjq-detail-progress-title", text: task.displayText || task.text });
    row.createDiv({ cls: "wjq-detail-progress-count", text: count.total ? `${count.done}/${count.total}` : (task.completed ? "1/1" : "0/1") });
    row.onclick = () => this.openTaskByDefault(task);
    for (const child of this.taskChildrenOf(task)) this.renderProgressTreeItem(parent, child, depth + 1, new Set(seen));
  }

  renderTaskDetailRelations(container, task, extraClass = "") {
    const section = container.createDiv({ cls: `wjq-home-panel wjq-task-detail-panel ${extraClass}`.trim() });
    section.createEl("h2", { text: "完整任务结构" });
    const byId = new Map(this.tasks.filter((item) => item.taskId).map((item) => [item.taskId, item]));
    const parent = task.parentId ? byId.get(task.parentId) : null;
    const children = this.tasks.filter((item) => item.parentId === task.taskId);
    const previous = task.blockedBy ? byId.get(task.blockedBy) : null;
    const next = this.tasks.filter((item) => item.blockedBy === task.taskId);
    this.renderRelationGroup(section, "上级任务", parent ? [parent] : []);
    this.renderRelationGroup(section, "子任务", children);
    this.renderRelationGroup(section, "前置任务", previous ? [previous] : []);
    this.renderRelationGroup(section, "后续任务", next);
  }

  renderTaskDetailFlow(container, task, extraClass = "") {
    const section = container.createDiv({ cls: `wjq-home-panel wjq-task-detail-panel wjq-task-detail-flow ${extraClass}`.trim() });
    section.createEl("h2", { text: "任务流程图" });
    const byId = new Map(this.tasks.filter((item) => item.taskId).map((item) => [item.taskId, item]));
    const parent = task.parentId ? byId.get(task.parentId) : null;
    const children = this.tasks.filter((item) => item.parentId === task.taskId);
    const previous = task.blockedBy ? byId.get(task.blockedBy) : null;
    const next = this.tasks.filter((item) => item.blockedBy === task.taskId);
    const flow = section.createDiv({ cls: "wjq-detail-flow-board" });
    const makeColumn = (title, tasks) => {
      const column = flow.createDiv({ cls: "wjq-detail-flow-column" });
      column.createDiv({ cls: "wjq-home-panel-title", text: title });
      if (!tasks.length) {
        column.createDiv({ cls: "wjq-task-hub-empty", text: "无" });
        return;
      }
      for (const item of tasks) {
        const card = column.createDiv({ cls: `wjq-detail-flow-card ${sameTask(item, task) ? "is-current" : ""}` });
        card.createDiv({ cls: "wjq-home-task-title", text: item.displayText || item.text });
        card.createDiv({ cls: "wjq-home-task-status", text: this.homeTaskBadge(item) });
        card.onclick = () => this.openTaskByDefault(item);
        this.attachContextMenu(card, this.taskContextActions(item));
      }
    };
    makeColumn("上级 / 前置", [parent, previous].filter(Boolean));
    makeColumn("当前任务", [task]);
    makeColumn("下级 / 后续", [...children, ...next]);
    this.scheduleFlowRender(() => flow.toggleClass("is-ready", true), [section, flow]);
  }

  renderRelationGroup(parent, title, tasks) {
    const group = parent.createDiv({ cls: "wjq-detail-relation-group" });
    group.createDiv({ cls: "wjq-home-group-title", text: title });
    if (!tasks.length) {
      group.createDiv({ cls: "wjq-task-hub-empty", text: "无" });
      return;
    }
    for (const task of tasks) {
      const row = group.createDiv({ cls: "wjq-detail-relation-row" });
      row.createDiv({ cls: "wjq-home-task-title", text: task.displayText || task.text });
      row.createDiv({ cls: "wjq-home-task-status", text: task.completed ? "已完成" : taskStatusText(task) || "待开始" });
      row.onclick = () => this.openTaskByDefault(task);
      this.attachContextMenu(row, this.taskContextActions(task));
    }
  }

  renderTaskDetailCountdown(container, task, extraClass = "") {
    const section = container.createDiv({ cls: `wjq-home-panel wjq-task-detail-panel ${extraClass}`.trim() });
    section.createEl("h2", { text: "倒计时任务" });
    const scoped = this.taskDetailRecordTasks(task, true).map((item) => item.task);
    const tasks = this.countdownTasks(scoped).slice(0, 30);
    if (!tasks.length) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: "当前任务下没有设置截止日期的未完成任务。" });
      return;
    }
    for (const item of tasks) this.renderCountdownTask(section, item);
  }

  renderTaskDetailRecords(container, task, extraClass = "") {
    const section = container.createDiv({ cls: `wjq-home-panel wjq-task-detail-panel ${extraClass}`.trim() });
    const header = section.createDiv({ cls: "wjq-home-panel-header" });
    header.createEl("h2", { text: "推进记录" });
    const input = header.createEl("input", { attr: { type: "date" } });
    input.value = localDateString();
    this.createButton(header, "记录推进", () => new ProgressRecordModal(this.plugin, task).open());
    this.createButton(header, "只记日期", () => this.plugin.addRecordDate(task, input.value));
    const hasChildren = this.taskChildrenOf(task).length > 0;
    const modeKey = `taskDetailRecords:${task.taskId || task.runtimeId}`;
    const recordMode = this.plugin.settings[modeKey] || (hasChildren ? "withChildren" : "self");
    if (hasChildren) {
      const toggles = header.createDiv({ cls: "wjq-home-segmented" });
      this.renderHomeToggle(toggles, "本任务", recordMode === "self", async () => {
        this.plugin.settings[modeKey] = "self";
        await this.plugin.saveSettings();
        this.renderSafely();
      });
      this.renderHomeToggle(toggles, "含下级", recordMode !== "self", async () => {
        this.plugin.settings[modeKey] = "withChildren";
        await this.plugin.saveSettings();
        this.renderSafely();
      });
    }
    const records = this.taskDetailRecordItems(task, recordMode !== "self");
    if (!records.length) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: "还没有记录日期。" });
      return;
    }
    const list = section.createDiv({ cls: "wjq-record-date-list" });
    for (const item of records) {
      const { ownerTask, linkedTask, record, index, depth } = item;
      const row = list.createDiv({ cls: "wjq-record-date" });
      row.style.setProperty("--record-depth", String(Math.min(depth, 8)));
      row.createSpan({ cls: "wjq-record-date-value", text: record.date || "未设日期" });
      const body = row.createSpan({ cls: "wjq-record-date-body" });
      if (record.text) body.createSpan({ cls: "wjq-record-date-note", text: record.text });
      const ownerTitle = ownerTask.displayText || ownerTask.text || "未命名任务";
      const linkedTitle = linkedTask && !sameTask(linkedTask, ownerTask) ? ` · 关联：${linkedTask.displayText || linkedTask.text}` : "";
      body.createSpan({ cls: "wjq-record-date-task", text: `${ownerTitle}${linkedTitle}` });
      row.onclick = () => this.plugin.activateTaskFullPage(ownerTask);
      this.attachContextMenu(row, [
        { title: "修改", icon: "pencil", callback: () => new ProgressRecordModal(this.plugin, ownerTask, { record, index }).open() },
        { title: "删除", icon: "trash-2", callback: () => this.plugin.deleteProgressRecord(ownerTask, record, index) },
        { separator: true },
        { title: "打开记录任务", icon: "panel-top-open", callback: () => this.plugin.activateTaskFullPage(ownerTask) },
        ...(linkedTask && !sameTask(linkedTask, ownerTask) ? [
          { title: "打开关联任务", icon: "panel-top-open", callback: () => this.plugin.activateTaskFullPage(linkedTask) },
        ] : []),
        { title: "打开来源", icon: "file-text", callback: () => this.plugin.openTaskSource(ownerTask) },
      ]);
    }
  }

  taskDetailRecordTasks(rootTask, includeChildren = true) {
    const result = [];
    const visit = (current, depth, seen = new Set()) => {
      if (!current || !current.taskId || seen.has(current.taskId)) return;
      seen.add(current.taskId);
      result.push({ task: current, depth });
      if (!includeChildren) return;
      const children = this.taskChildrenOf(current).sort((a, b) => this.compareTasksByCreation(a, b));
      for (const child of children) visit(child, depth + 1, new Set(seen));
    };
    visit(rootTask, 0);
    return result;
  }

  taskDetailRecordsForTask(ownerTask, depth) {
    const notes = Array.isArray(ownerTask.recordNotes) ? ownerTask.recordNotes : [];
    const records = notes.length
      ? notes.map((item, index) => ({
        id: item.id || "",
        date: item.date || "",
        text: item.text || "",
        taskId: item.task_id || item.taskId || ownerTask.taskId || "",
        taskTitle: item.task_title || item.taskTitle || ownerTask.displayText || ownerTask.text || "",
        project: item.project || ownerTask.projects[0] || "",
        index,
      }))
      : (ownerTask.recordDates || []).map((date, index) => ({
        id: "",
        date,
        text: "",
        taskId: ownerTask.taskId || "",
        taskTitle: ownerTask.displayText || ownerTask.text || "",
        project: ownerTask.projects[0] || "",
        index,
      }));
    const usedDates = new Set(records.map((item) => item.date).filter(Boolean));
    for (const date of ownerTask.recordDates || []) {
      if (!usedDates.has(date)) records.push({
        id: "",
        date,
        text: "",
        taskId: ownerTask.taskId || "",
        taskTitle: ownerTask.displayText || ownerTask.text || "",
        project: ownerTask.projects[0] || "",
        index: records.length,
      });
    }
    return records.map((record) => ({
      ownerTask,
      linkedTask: record.taskId ? this.tasks.find((item) => item.taskId === record.taskId) : ownerTask,
      record,
      index: record.index,
      depth,
    }));
  }

  taskDetailRecordItems(task, includeChildren = true) {
    return this.taskDetailRecordTasks(task, includeChildren)
      .flatMap(({ task: ownerTask, depth }) => this.taskDetailRecordsForTask(ownerTask, depth))
      .sort((a, b) => {
        const dateOrder = String(b.record.date || "").localeCompare(String(a.record.date || ""));
        if (dateOrder) return dateOrder;
        if (a.depth !== b.depth) return a.depth - b.depth;
        return this.compareTasksByCreation(a.ownerTask, b.ownerTask);
      });
  }

  renderTaskWorkspaceTextPanel(container, task, title, field, placeholder, extraClass = "") {
    const section = container.createDiv({ cls: `wjq-home-panel wjq-task-detail-panel wjq-task-work-text-panel ${extraClass}`.trim() });
    const header = section.createDiv({ cls: "wjq-home-panel-header" });
    header.createEl("h2", { text: title });
    const headerActions = header.createDiv({ cls: "wjq-task-workspace-header-actions" });
    const status = headerActions.createSpan({ cls: "wjq-task-workspace-save-state", text: "" });
    if (field === "materials") {
      let selectedPath = "";
      let materialAddRow = null;
      this.createButton(headerActions, "添加", () => {
        if (materialAddRow) materialAddRow.toggleClass("is-open", !materialAddRow.classList.contains("is-open"));
      });
      const save = this.createButton(headerActions, "保存", async () => {
        if (!selectedPath) {
          new Notice("请先选择一篇笔记");
          return;
        }
        const saved = await this.plugin.addMaterialToTask(task, selectedPath, { skipRefresh: true });
        if (saved) await this.refresh();
      });
      save.addClass("mod-cta");
      materialAddRow = section.createDiv({ cls: "wjq-material-add-row" });
      this.renderSideNoteSelect(materialAddRow, "添加笔记", this.plugin.app.vault.getMarkdownFiles(), selectedPath, (value) => (selectedPath = value), "wjq-material-note-select");
      const links = section.createDiv({ cls: "wjq-task-detail-links" });
      const source = links.createDiv({ cls: "wjq-task-detail-link-row" });
      source.createDiv({ cls: "wjq-task-detail-link-label", text: "来源笔记" });
      source.createDiv({ cls: "wjq-task-detail-link-value", text: `${task.path}:${task.lineNumber}` });
      source.onclick = () => this.plugin.openTaskSource(task);
      if (task.taskPage) {
        const page = links.createDiv({ cls: "wjq-task-detail-link-row" });
        page.createDiv({ cls: "wjq-task-detail-link-label", text: "备用任务页" });
        page.createDiv({ cls: "wjq-task-detail-link-value", text: task.taskPage });
        page.onclick = () => this.plugin.openTaskPageNote(task);
      }
      this.renderMaterialQuickLinks(links, task[field] || "");
      return;
    }
    const save = this.createButton(headerActions, "保存", async () => {
      save.disabled = true;
      status.setText("保存中…");
      try {
        await this.plugin.updateTaskWorkspaceFields(task, { [field]: textarea.value }, { silent: true });
        task[field] = textarea.value;
        status.setText("已保存");
      } catch (error) {
        status.setText("保存失败");
        this.plugin.reportTaskHubError("保存任务页面内容失败", error);
      } finally {
        save.disabled = false;
      }
    });
    save.addClass("mod-cta");
    const textarea = section.createEl("textarea", { cls: "wjq-task-workspace-textarea", attr: { placeholder } });
    textarea.value = task[field] || "";
    let timer = null;
    const saveValue = async () => {
      window.clearTimeout(timer);
      timer = null;
      if (textarea.value === (task[field] || "")) return;
      await this.plugin.updateTaskWorkspaceFields(task, { [field]: textarea.value }, { silent: true });
      task[field] = textarea.value;
    };
    textarea.oninput = () => {
      status.setText("");
      window.clearTimeout(timer);
      timer = window.setTimeout(saveValue, TASK_WORKSPACE_AUTOSAVE_DELAY_MS);
    };
    textarea.onblur = () => {
      if (textarea.value === (task[field] || "")) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(saveValue, TASK_WORKSPACE_AUTOSAVE_DELAY_MS);
    };
  }

  renderMaterialQuickLinks(parent, value) {
    const lines = String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const links = [];
    for (const line of lines) {
      const wikiMatches = Array.from(line.matchAll(/\[\[([^\]]+)\]\]/g)).map((match) => match[1].split("|")[0].trim()).filter(Boolean);
      for (const target of wikiMatches) links.push({ label: target, target });
      if (/^https?:\/\//i.test(line)) links.push({ label: line, target: line, url: true });
      if (/\.md$/i.test(line) || /^[A-Z]:[\\/]/i.test(line) || line.includes("/")) links.push({ label: line, target: line });
    }
    if (!links.length) return;
    const quick = parent.createDiv({ cls: "wjq-task-detail-links-auto" });
    for (const link of links.slice(0, 8)) {
      const row = quick.createDiv({ cls: "wjq-task-detail-link-row" });
      row.createDiv({ cls: "wjq-task-detail-link-label", text: link.url ? "网页" : "材料" });
      row.createDiv({ cls: "wjq-task-detail-link-value", text: link.label });
      row.onclick = () => this.plugin.openMaterialTarget(link.target);
    }
  }

  renderTaskWritingWorkspace(container, task, extraClass = "") {
    const section = container.createDiv({ cls: `wjq-home-panel wjq-task-detail-panel wjq-task-writing-workspace ${extraClass}`.trim() });
    const header = section.createDiv({ cls: "wjq-home-panel-header" });
    header.createEl("h2", { text: "任务工作区" });
    this.createButton(header, task.taskPage ? "备用任务页" : "创建备用页", () => this.plugin.openTaskPageNote(task));
    const links = section.createDiv({ cls: "wjq-task-detail-links" });
    const source = links.createDiv({ cls: "wjq-task-detail-link-row" });
    source.createDiv({ cls: "wjq-task-detail-link-label", text: "来源笔记" });
    source.createDiv({ cls: "wjq-task-detail-link-value", text: `${task.path}:${task.lineNumber}` });
    source.onclick = () => this.plugin.openTaskSource(task);
    if (task.taskPage) {
      const page = links.createDiv({ cls: "wjq-task-detail-link-row" });
      page.createDiv({ cls: "wjq-task-detail-link-label", text: "备用任务页" });
      page.createDiv({ cls: "wjq-task-detail-link-value", text: task.taskPage });
      page.onclick = () => this.plugin.openTaskPageNote(task);
    }
    const grid = section.createDiv({ cls: "wjq-task-workspace-grid" });
    const blocks = [
      ["备注", "临时想法、提醒、尚未成体系的判断。"],
      ["下一步", "下一次打开这个任务时最先执行的动作。"],
      ["相关材料", "文献、网页剪藏、笔记、Word 或其他资料链接。"],
      ["输出草稿", "论文段落、申请材料、读书卡片或散文草稿。"],
    ];
    for (const [title, text] of blocks) {
      const card = grid.createDiv({ cls: "wjq-task-workspace-card" });
      card.createDiv({ cls: "wjq-home-panel-title", text: title });
      card.createDiv({ cls: "wjq-task-workspace-desc", text });
      card.onclick = () => {
        if (task.taskPage) this.plugin.openTaskPageNote(task);
        else this.plugin.openTaskSource(task);
      };
    }
  }
}

class ProgressRecordModal extends Modal {
  constructor(plugin, task, options = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.task = task;
    this.record = options.record || null;
    this.index = Number.isInteger(options.index) ? options.index : -1;
    this.date = this.record ? this.record.date || localDateString() : localDateString();
    this.text = this.record ? this.record.text || "" : "";
    this.associatedTask = null;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const tasks = await this.plugin.scanTasks();
    this.associatedTask = this.record && (this.record.taskId || this.record.task_id)
      ? tasks.find((task) => task.taskId === (this.record.taskId || this.record.task_id)) || this.task
      : this.task;
    contentEl.createEl("h2", { text: this.record ? "修改推进记录" : "记录推进" });
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: this.task.displayText || this.task.text });
    this.renderAssociatedTaskPicker(contentEl, tasks);
    new Setting(contentEl)
      .setName("日期")
      .setDesc(`默认当前年月：${currentYearMonth()}，也可以只填日期数字。`)
      .addText((text) => {
        text.setPlaceholder(`${currentYearMonth()}-`);
        text.setValue(dateInputValue(this.date));
        text.onChange((value) => (this.date = value));
      });
    new Setting(contentEl)
      .setName("推进说明")
      .setDesc("可留空；适合写一句话，例如“完成文献综述第一轮压缩”。")
      .addTextArea((area) => {
        area.inputEl.rows = 3;
        area.setPlaceholder("这次推进完成了什么？");
        area.setValue(this.text);
        area.onChange((value) => (this.text = value));
        setTimeout(() => area.inputEl.focus(), 50);
      });
    const footer = contentEl.createDiv({ cls: "wjq-task-hub-modal-actions" });
    const save = footer.createEl("button", { text: this.record ? "保存修改" : "记录" });
    save.addClass("mod-cta");
    save.onclick = async () => {
      const saved = this.record
        ? await this.plugin.updateProgressRecord(this.task, this.record, this.index, { date: this.date, text: this.text, associatedTask: this.associatedTask })
        : await this.plugin.addProgressRecord(this.task, this.date, this.text, { associatedTask: this.associatedTask });
      if (saved) this.close();
    };
    footer.createEl("button", { text: "取消" }).onclick = () => this.close();
  }

  renderAssociatedTaskPicker(parent, tasks) {
    const field = parent.createDiv({ cls: "wjq-task-side-field wjq-task-side-relation-select wjq-progress-linked-task-field" });
    field.createDiv({ cls: "wjq-task-side-label wjq-task-side-subrelation-label", text: "关联任务" });
    const control = field.createDiv({ cls: "wjq-task-side-relation-picker" });
    const inputRow = control.createDiv({ cls: "wjq-task-side-relation-input-row" });
    const input = inputRow.createEl("input", { attr: { type: "text", placeholder: "输入任务关键词" } });
    const resultWrap = control.createDiv({ cls: "wjq-task-side-relation-results" });
    let open = false;
    const selectedLabel = () => this.associatedTask ? shortTaskLabel(this.associatedTask) : "";
    const renderResults = () => {
      resultWrap.empty();
      resultWrap.toggleClass("is-open", open);
      if (!open) return;
      const query = input.value.trim().toLowerCase();
      const matches = tasks
        .filter((task) => {
          if (!query) return true;
          return `${task.displayText || task.text} ${(task.projects || []).join(" ")} ${task.path || ""}`.toLowerCase().includes(query);
        })
        .slice(0, 80);
      for (const task of matches) {
        const button = resultWrap.createEl("button", { text: shortTaskLabel(task) });
        button.onmousedown = (event) => event.preventDefault();
        button.onclick = () => {
          this.associatedTask = task;
          input.value = selectedLabel();
          open = false;
          renderResults();
        };
      }
      if (!matches.length && query) resultWrap.createDiv({ cls: "wjq-task-hub-empty", text: "没有匹配任务" });
    };
    input.value = selectedLabel();
    input.onfocus = () => {
      open = true;
      input.value = "";
      renderResults();
    };
    input.onblur = () => {
      window.setTimeout(() => {
        open = false;
        input.value = selectedLabel();
        renderResults();
      }, 120);
    };
    input.oninput = () => {
      open = true;
      renderResults();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ProjectProgressRecordModal extends Modal {
  constructor(plugin, project, options = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.project = String(project || "全部").trim() || "全部";
    this.record = options.record || null;
    this.index = Number.isInteger(options.index) ? options.index : -1;
    this.date = this.record ? this.record.date || localDateString() : localDateString();
    this.text = this.record ? this.record.text || "" : "";
    this.associatedTask = null;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const allTasks = await this.plugin.scanTasks();
    const tasks = this.project === "全部" ? allTasks : allTasks.filter((task) => task.projects.includes(this.project));
    const linkedId = this.record ? this.record.taskId || this.record.task_id || "" : "";
    this.associatedTask = linkedId ? allTasks.find((task) => task.taskId === linkedId) || null : null;
    contentEl.createEl("h2", { text: this.record ? "修改项目推进" : "记录项目推进" });
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: this.project });
    this.renderAssociatedTaskPicker(contentEl, tasks);
    new Setting(contentEl)
      .setName("日期")
      .setDesc(`默认当前年月：${currentYearMonth()}，也可以只填日期数字。`)
      .addText((text) => {
        text.setPlaceholder(`${currentYearMonth()}-`);
        text.setValue(dateInputValue(this.date));
        text.onChange((value) => (this.date = value));
      });
    new Setting(contentEl)
      .setName("推进说明")
      .setDesc("记录项目层面的判断、卡点或今天整体推进到哪里。")
      .addTextArea((area) => {
        area.inputEl.rows = 4;
        area.setPlaceholder("这个项目今天推进到哪里？");
        area.setValue(this.text);
        area.onChange((value) => (this.text = value));
        setTimeout(() => area.inputEl.focus(), 50);
      });
    const footer = contentEl.createDiv({ cls: "wjq-task-hub-modal-actions" });
    const save = footer.createEl("button", { text: this.record ? "保存修改" : "记录" });
    save.addClass("mod-cta");
    save.onclick = async () => {
      const saved = this.record
        ? await this.plugin.updateProjectProgressRecord(this.project, this.record, this.index, { date: this.date, text: this.text, associatedTask: this.associatedTask })
        : await this.plugin.addProjectProgressRecord(this.project, this.date, this.text, { associatedTask: this.associatedTask });
      if (saved) this.close();
    };
    footer.createEl("button", { text: "取消" }).onclick = () => this.close();
  }

  renderAssociatedTaskPicker(parent, tasks) {
    const field = parent.createDiv({ cls: "wjq-task-side-field wjq-task-side-relation-select wjq-progress-linked-task-field" });
    field.createDiv({ cls: "wjq-task-side-label wjq-task-side-subrelation-label", text: "关联任务" });
    const control = field.createDiv({ cls: "wjq-task-side-relation-picker" });
    const inputRow = control.createDiv({ cls: "wjq-task-side-relation-input-row" });
    const input = inputRow.createEl("input", { attr: { type: "text", placeholder: "输入任务关键词，可留空" } });
    const actionBar = inputRow.createDiv({ cls: "wjq-task-side-relation-inline-actions" });
    const clear = actionBar.createEl("button", { text: "移除" });
    clear.onmousedown = (event) => event.preventDefault();
    clear.onclick = (event) => {
      event.preventDefault();
      this.associatedTask = null;
      input.value = "";
    };
    const resultWrap = control.createDiv({ cls: "wjq-task-side-relation-results" });
    let open = false;
    const selectedLabel = () => this.associatedTask ? shortTaskLabel(this.associatedTask) : "";
    const renderResults = () => {
      resultWrap.empty();
      resultWrap.toggleClass("is-open", open);
      if (!open) return;
      const query = input.value.trim().toLowerCase();
      const matches = tasks
        .filter((task) => {
          if (!query) return true;
          return `${task.displayText || task.text} ${(task.projects || []).join(" ")} ${task.path || ""}`.toLowerCase().includes(query);
        })
        .slice(0, 80);
      for (const task of matches) {
        const button = resultWrap.createEl("button", { text: shortTaskLabel(task) });
        button.onmousedown = (event) => event.preventDefault();
        button.onclick = () => {
          this.associatedTask = task;
          input.value = selectedLabel();
          open = false;
          renderResults();
        };
      }
      if (!matches.length && query) resultWrap.createDiv({ cls: "wjq-task-hub-empty", text: "没有匹配任务" });
    };
    input.value = selectedLabel();
    input.onfocus = () => {
      open = true;
      input.value = "";
      renderResults();
    };
    input.onblur = () => {
      window.setTimeout(() => {
        open = false;
        input.value = selectedLabel();
        renderResults();
      }, 120);
    };
    input.oninput = () => {
      open = true;
      renderResults();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class TaskDiagnosisModal extends Modal {
  constructor(plugin, view, task) {
    super(plugin.app);
    this.plugin = plugin;
    this.view = view;
    this.task = task;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "任务判定" });
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: this.task.displayText || this.task.text });
    const rows = this.view.taskPlacementInfo(this.task);
    const list = contentEl.createDiv({ cls: "wjq-task-diagnosis-list" });
    for (const row of rows) {
      const item = list.createDiv({ cls: "wjq-task-diagnosis-row" });
      item.createDiv({ cls: "wjq-task-diagnosis-label", text: row.label });
      item.createDiv({ cls: "wjq-task-diagnosis-value", text: row.value });
    }
    const footer = contentEl.createDiv({ cls: "wjq-task-hub-modal-actions" });
    footer.createEl("button", { text: "编辑任务" }).onclick = () => {
      this.close();
      this.plugin.activateTaskDetailView(this.task);
    };
    footer.createEl("button", { text: "关闭" }).onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class TaskCenterView extends TaskHubView {
  getViewType() {
    return TASK_CENTER_VIEW_TYPE;
  }

  getDisplayText() {
    return "任务与项目中心";
  }

  getIcon() {
    return "list-checks";
  }

  render() {
    const container = this.containerEl.children[1];
    this.clearScheduledFlowRenders();
    container.empty();
    container.addClass("wjq-task-hub");
    container.addClass("wjq-task-center");

    const hero = container.createDiv({ cls: "wjq-workbench-hero" });
    const titleBlock = hero.createDiv();
    titleBlock.createEl("h1", { text: "任务与项目中心" });
    titleBlock.createDiv({ cls: "wjq-workbench-date", text: "只处理任务、期限、项目拆解和规划日期。" });
    const actions = hero.createDiv({ cls: "wjq-task-hub-actions" });
    this.createButton(actions, "新建任务", () => this.plugin.openSidebarNewTaskFromSelection({ sourcePath: "", insertLine: -1 }));
    this.createButton(actions, "主页", () => this.plugin.activateHomeView());
    this.createButton(actions, "刷新", () => this.refresh());

    this.renderStats(container);
    this.renderControls(container);

    if (this.filter === "calendar") {
      this.renderTimeline(container);
      this.renderCalendar(container);
      this.renderTaskSideEditor(container);
      return;
    }

    const layout = container.createDiv({ cls: "wjq-task-center-layout" });
    const projectPane = layout.createDiv({ cls: "wjq-task-center-projects" });
    projectPane.createEl("h2", { text: "项目" });
    this.renderProjectList(projectPane);

    const taskPane = layout.createDiv({ cls: "wjq-task-center-tasks" });
    this.renderTaskList(taskPane);
    this.renderTaskSideEditor(container);
  }

  renderProjectList(parent) {
    const statsByProject = new Map(this.projectStats().map((item) => [item.project, item]));
    const defaultProjects = new Set(this.plugin.settings.defaultProjects || []);
    const stats = this.allProjects()
      .filter((project) => project !== "全部")
      .map((project) => statsByProject.get(project) || { project, total: 0, done: 0, overdue: 0 })
      .filter((item) => item.total > 0 || defaultProjects.has(item.project));
    const all = parent.createDiv({ cls: `wjq-task-center-project ${this.project === "全部" ? "is-active" : ""}` });
    all.createDiv({ cls: "wjq-task-center-project-name", text: "全部" });
    all.createDiv({ cls: "wjq-task-center-project-meta", text: `${this.tasks.filter((task) => !task.completed).length} 未完成` });
    all.onclick = () => {
      this.project = "全部";
      this.renderSafely();
    };

    for (const item of stats) {
      const percent = item.total ? Math.round((item.done / item.total) * 100) : 0;
      const row = parent.createDiv({ cls: `wjq-task-center-project ${this.project === item.project ? "is-active" : ""}` });
      const top = row.createDiv({ cls: "wjq-home-project-task-top" });
      top.createDiv({ cls: "wjq-task-center-project-name", text: item.project });
      row.createDiv({ cls: "wjq-task-center-project-meta", text: item.total ? `${item.done}/${item.total} · ${percent}%${item.overdue ? ` · ${item.overdue}逾期` : ""}` : "0 项任务" });
      row.onclick = () => {
        this.project = item.project;
        this.renderSafely();
      };
      this.attachContextMenu(row, [
        { title: "重命名", icon: "pencil", callback: () => this.openRenameProjectModal(item.project) },
        { title: "筛选此项目", icon: "filter", callback: () => {
          this.project = item.project;
          this.renderSafely();
        } },
        { title: "删除项目", icon: "trash-2", callback: () => new ProjectDeleteModal(this.plugin, item.project, this.tasks).open() },
      ]);
    }
  }

  renderTimeline(container) {
    const section = container.createDiv({ cls: "wjq-task-hub-section" });
    section.createEl("h2", { text: "未来14天时间轴" });
    const today = this.calendarAnchorDate();
    let rendered = 0;
    for (let offset = 0; offset < 14; offset += 1) {
      const date = localDateString(addDays(today, offset));
      const tasks = this.tasks.filter((task) => !task.completed && task.due === date && this.matchesProjectAndSearch(task));
      if (!tasks.length) continue;
      rendered += 1;
      const day = section.createDiv({ cls: "wjq-task-center-timeline-day" });
      day.createDiv({ cls: "wjq-task-center-timeline-date", text: date });
      for (const task of tasks) {
        const item = day.createDiv({ cls: "wjq-task-center-timeline-task" });
        const checkbox = item.createEl("input", { attr: { type: "checkbox" } });
        checkbox.checked = task.completed;
        checkbox.onchange = () => checkbox.checked ? this.plugin.completeTask(task) : this.plugin.toggleTask(task, false);
        const title = item.createSpan({ text: task.displayText || task.text });
        title.onclick = () => this.openTaskByDefault(task);
      }
    }
    if (!rendered) {
      section.createDiv({ cls: "wjq-task-hub-empty", text: "未来14天没有已规划任务。" });
    }
  }
}

class ProjectDeleteModal extends Modal {
  constructor(plugin, project, tasks) {
    super(plugin.app);
    this.plugin = plugin;
    this.project = project;
    this.tasks = tasks || [];
    this.mode = "remove";
    this.target = "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "删除项目" });
    const count = this.tasks.filter((task) => task.projects.includes(this.project)).length;
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: count ? `项目「${this.project}」下有 ${count} 个任务。` : `项目「${this.project}」下没有任务。` });
    if (!count) {
      new Setting(contentEl)
        .addButton((button) => button.setButtonText("直接删除项目入口").setCta().onClick(async () => {
          const saved = await this.plugin.deleteProject(this.project, { mode: "remove", settingsOnly: true });
          if (saved) this.close();
        }));
      return;
    }

    new Setting(contentEl)
      .setName("处理方式")
      .addDropdown((dropdown) => {
        dropdown.addOption("remove", "改为无项目归属");
        dropdown.addOption("move", "移动到其他项目");
        dropdown.setValue(this.mode);
        dropdown.onChange((value) => {
          this.mode = value;
          this.onOpen();
        });
      });

    if (this.mode === "move") {
      const projects = uniq([...(this.plugin.settings.defaultProjects || []), ...this.tasks.flatMap((task) => task.projects || [])])
        .filter((project) => project && project !== this.project && project !== "全部" && project !== "鍏ㄩ儴")
        .sort();
      this.target = this.target && projects.includes(this.target) ? this.target : projects[0] || "";
      new Setting(contentEl)
        .setName("移动到")
        .addDropdown((dropdown) => {
          for (const project of projects) dropdown.addOption(project, project);
          dropdown.setValue(this.target);
          dropdown.onChange((value) => (this.target = value));
        });
    }

    new Setting(contentEl)
      .addButton((button) => button.setButtonText("确认处理").setCta().onClick(async () => {
        const saved = await this.plugin.deleteProject(this.project, { mode: this.mode, target: this.target });
        if (saved) this.close();
      }))
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()));
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ProjectArchiveModal extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "项目归档" });
    contentEl.createDiv({
      cls: "wjq-task-hub-modal-task",
      text: "归档只会让项目退出个人工作台主页，不会删除任务，也不会修改原笔记。",
    });

    const archived = this.plugin.settings.archivedProjects || [];
    if (!archived.length) {
      contentEl.createDiv({ cls: "wjq-task-hub-empty", text: "目前没有已归档项目。" });
      return;
    }

    for (const project of archived) {
      const row = contentEl.createDiv({ cls: "wjq-archive-project-row" });
      row.createDiv({ cls: "wjq-archive-project-name", text: project });
      const restore = row.createEl("button", { text: "恢复" });
      restore.onclick = async () => {
        await this.plugin.restoreProject(project);
        this.onOpen();
      };
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CompletionFollowupModal extends Modal {
  constructor(plugin, completedTask, parentTask, nextTasks) {
    super(plugin.app);
    this.plugin = plugin;
    this.completedTask = completedTask;
    this.parentTask = parentTask;
    this.nextTasks = nextTasks || [];
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "任务已完成" });
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: this.completedTask.displayText || this.completedTask.text });

    if (this.parentTask) {
      const parent = contentEl.createDiv({ cls: "wjq-followup-block" });
      parent.createDiv({ cls: "wjq-followup-title", text: "上级任务的直接子任务都已完成" });
      parent.createDiv({ cls: "wjq-followup-task", text: this.parentTask.displayText || this.parentTask.text });
      const actions = parent.createDiv({ cls: "wjq-followup-actions" });
      actions.createEl("button", { text: "完成上级任务" }).onclick = async () => {
        await this.plugin.toggleTask(this.parentTask, true);
        this.close();
      };
      actions.createEl("button", { text: "打开上级任务" }).onclick = () => this.plugin.openTaskSource(this.parentTask);
    }

    if (this.nextTasks.length) {
      const next = contentEl.createDiv({ cls: "wjq-followup-block" });
      next.createDiv({ cls: "wjq-followup-title", text: "可以继续推进的后续任务" });
      for (const task of this.nextTasks.slice(0, 8)) {
        const row = next.createDiv({ cls: "wjq-followup-next-row" });
        row.createDiv({ cls: "wjq-followup-task", text: task.displayText || task.text });
        const actions = row.createDiv({ cls: "wjq-followup-actions" });
        actions.createEl("button", { text: "开始" }).onclick = async () => {
          await this.plugin.startTask(task);
          this.close();
        };
        actions.createEl("button", { text: "打开" }).onclick = () => this.plugin.openTaskSource(task);
      }
    }

    const footer = contentEl.createDiv({ cls: "wjq-task-hub-modal-actions" });
    footer.createEl("button", { text: "稍后处理" }).onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class StartDateModal extends Modal {
  constructor(plugin, task) {
    super(plugin.app);
    this.plugin = plugin;
    this.task = task;
    this.day = "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "开始任务" });
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: this.task.displayText || this.task.text });
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: `当前年月：${currentYearMonth()}，可只填写日期。` });
    const shortcuts = contentEl.createDiv({ cls: "wjq-date-shortcuts" });
    shortcuts.createEl("button", { text: "从今天开始" }).onclick = async () => {
      await this.plugin.setTaskStatus(this.task, "进行中", { due: localDateString() });
      this.close();
    };
    shortcuts.createEl("button", { text: "明天开始" }).onclick = async () => {
      await this.plugin.setTaskStatus(this.task, "进行中", { due: localDateString(addDays(new Date(), 1)) });
      this.close();
    };
    new Setting(contentEl)
      .setName("选择某一天开始")
      .setDesc(`可只填日，例如 18；也可填完整日期。默认年月：${currentYearMonth()}`)
      .addText((text) => {
        text.setPlaceholder(`${currentYearMonth()}-`);
        text.setValue(dateInputValue(this.day));
        text.onChange((value) => (this.day = value));
        setTimeout(() => text.inputEl.focus(), 50);
      });
    new Setting(contentEl)
      .addButton((button) => button.setButtonText("确认开始").setCta().onClick(async () => {
        const due = normalizeDateInput(this.day);
        await this.plugin.setTaskStatus(this.task, "进行中", { due });
        this.close();
      }));
  }

  onClose() {
    this.contentEl.empty();
  }
}

class DateModal extends Modal {
  constructor(plugin, task) {
    super(plugin.app);
    this.plugin = plugin;
    this.task = task;
    this.due = task.due || "";
    this.hardDeadline = task.hardDeadline || "";
    this.deadline = task.deadline || "";
    this.completedAt = task.completedAt || "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "设置任务日期" });
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: this.task.displayText || this.task.text });
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: `当前年月：${currentYearMonth()}，可只填写日期。` });

    new Setting(contentEl)
      .setName("开始日期")
      .setDesc("单日任务只填开始日期即可；范围任务再填计划完成。")
      .addText((text) => {
        text.setPlaceholder(`${currentYearMonth()}-`);
        text.setValue(dateInputValue(this.due));
        text.onChange((value) => (this.due = value));
        setTimeout(() => text.inputEl.focus(), 50);
      });

    new Setting(contentEl)
      .setName("截止日期")
      .setDesc("硬性截止日期，只进入倒计时任务，不进入日历。")
      .addText((text) => {
        text.setPlaceholder(`${currentYearMonth()}-`);
        text.setValue(dateInputValue(this.hardDeadline));
        text.onChange((value) => (this.hardDeadline = value));
      });

    new Setting(contentEl)
      .setName("计划完成")
      .setDesc("可留空；填写后会作为日期范围的结束日。")
      .addText((text) => {
        text.setPlaceholder(`${currentYearMonth()}-`);
        text.setValue(dateInputValue(this.deadline));
        text.onChange((value) => (this.deadline = value));
      });

    new Setting(contentEl)
      .setName("实际完成")
      .setDesc("任务完成后，日历会优先按实际完成日期显示。")
      .addText((text) => {
        text.setPlaceholder(`${currentYearMonth()}-`);
        text.setValue(dateInputValue(this.completedAt));
        text.onChange((value) => (this.completedAt = value));
      });

    const shortcuts = contentEl.createDiv({ cls: "wjq-date-shortcuts" });
    const setRange = (start, end = "") => {
      this.due = start;
      this.deadline = end;
      this.onOpen();
    };
    shortcuts.createEl("button", { text: "今天" }).onclick = () => setRange(localDateString());
    shortcuts.createEl("button", { text: "明天" }).onclick = () => setRange(localDateString(addDays(new Date(), 1)));
    shortcuts.createEl("button", { text: "未来7天" }).onclick = () => setRange(localDateString(), localDateString(addDays(new Date(), 6)));

    const footer = contentEl.createDiv({ cls: "wjq-task-hub-modal-actions" });
    const save = footer.createEl("button", { text: "保存日期" });
    save.addClass("mod-cta");
    save.onclick = async () => {
      await this.plugin.setTaskDates(this.task, {
        due: this.due,
        hardDeadline: this.hardDeadline,
        deadline: this.deadline,
        completedAt: this.completedAt,
      });
      this.close();
    };
    const clear = footer.createEl("button", { text: "清除日期" });
    clear.onclick = async () => {
      await this.plugin.setTaskDates(this.task, {
        due: "",
        hardDeadline: "",
        deadline: "",
        completedAt: this.task.completedAt || "",
      });
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class RelationModal extends Modal {
  constructor(plugin, mode, sourceTask, tasks, onDone) {
    super(plugin.app);
    this.plugin = plugin;
    this.mode = mode;
    this.sourceTask = sourceTask;
    this.tasks = tasks.filter((task) => !sameTask(task, sourceTask));
    this.onDone = onDone;
    this.selectedIndex = 0;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    const titles = {
      "set-parent": "设置上级任务",
      "add-child": "选择下级任务",
      "set-blocked-by": "设置前置任务",
      "add-next": "选择后续任务",
    };
    contentEl.createEl("h2", { text: titles[this.mode] || "设置任务关系" });
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: shortTaskLabel(this.sourceTask) });

    if (!this.tasks.length) {
      contentEl.createDiv({ cls: "wjq-task-hub-empty", text: "目前没有其他可选择的任务。" });
      return;
    }

    new Setting(contentEl)
      .setName(titles[this.mode] || "任务")
      .addDropdown((dropdown) => {
        this.tasks.forEach((task, index) => {
          dropdown.addOption(String(index), shortTaskLabel(task));
        });
        dropdown.setValue("0");
        dropdown.onChange((value) => (this.selectedIndex = Number(value)));
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText("确认")
          .setCta()
          .onClick(async () => {
            const selected = this.tasks[this.selectedIndex];
            if (!selected) return;
            if (this.mode === "set-parent") {
              await this.plugin.setParent(this.sourceTask, selected);
            } else if (this.mode === "add-child") {
              await this.plugin.setParent(selected, this.sourceTask);
            } else if (this.mode === "set-blocked-by") {
              await this.plugin.setBlockedBy(this.sourceTask, selected);
            } else if (this.mode === "add-next") {
              await this.plugin.setBlockedBy(selected, this.sourceTask);
            }
            if (this.onDone) await this.onDone();
            this.close();
          });
      });
    return;
    contentEl.createEl("h2", { text: this.mode === "set-parent" ? "设置父任务" : "选择子任务" });
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: shortTaskLabel(this.sourceTask) });

    if (!this.tasks.length) {
      contentEl.createDiv({ cls: "wjq-task-hub-empty", text: "目前没有其他可选择的任务。" });
      return;
    }

    new Setting(contentEl)
      .setName(this.mode === "set-parent" ? "父任务" : "子任务")
      .addDropdown((dropdown) => {
        this.tasks.forEach((task, index) => {
          dropdown.addOption(String(index), shortTaskLabel(task));
        });
        dropdown.setValue("0");
        dropdown.onChange((value) => (this.selectedIndex = Number(value)));
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText("确认")
          .setCta()
          .onClick(async () => {
            const selected = this.tasks[this.selectedIndex];
            if (!selected) return;
            if (this.mode === "set-parent") {
              await this.plugin.setParent(this.sourceTask, selected);
            } else {
              await this.plugin.setParent(selected, this.sourceTask);
            }
            if (this.onDone) await this.onDone();
            this.close();
          });
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class RelatedTaskModal extends Modal {
  constructor(plugin, sourceTask, relation) {
    super(plugin.app);
    this.plugin = plugin;
    this.sourceTask = sourceTask;
    this.relation = relation;
    this.title = "";
    this.due = "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.relation === "child" ? "新增下级任务" : "新增后续任务" });
    contentEl.createDiv({ cls: "wjq-task-hub-modal-task", text: shortTaskLabel(this.sourceTask) });

    new Setting(contentEl)
      .setName("任务")
      .addText((text) => {
        text.setPlaceholder("写下新任务");
        text.setValue(this.title);
        text.onChange((value) => (this.title = value));
        setTimeout(() => text.inputEl.focus(), 50);
      });

    new Setting(contentEl)
      .setName("开始日期")
      .setDesc("可留空；默认当前年月，只补日期即可。")
      .addText((text) => {
        text.setPlaceholder(`${currentYearMonth()}-`);
        text.setValue(dateInputValue(this.due));
        text.onChange((value) => (this.due = value));
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText("创建")
          .setCta()
          .onClick(async () => {
            const saved = await this.plugin.createRelatedTask(this.sourceTask, this.relation, this.title, this.due);
            if (saved) this.close();
          });
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class RenameModal extends Modal {
  constructor(plugin, title, currentName, onSave, desc = "") {
    super(plugin.app);
    this.plugin = plugin;
    this.title = title;
    this.currentName = currentName || "";
    this.nextName = this.currentName;
    this.onSave = onSave;
    this.desc = desc;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.title });
    new Setting(contentEl)
      .setName("新名称")
      .setDesc(this.desc)
      .addText((text) => {
        text.setValue(this.currentName);
        text.onChange((value) => (this.nextName = value));
        setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 50);
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText("保存")
          .setCta()
          .onClick(async () => {
            const saved = await this.onSave(this.nextName);
            if (saved) this.close();
          });
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class TaskModal extends Modal {
  constructor(plugin, mode, options = {}) {
    super(plugin.app);
    this.plugin = plugin;
    this.mode = mode;
    this.task = options.task || null;
    this.title = options.title || (this.task ? this.task.displayText || this.task.text || "" : "");
    this.project = options.project || (this.task && this.task.projects[0]) || plugin.settings.defaultProjects[0] || "";
    this.status = options.status || (this.task ? taskStatusText(this.task) || "待开始" : "待开始");
    this.due = options.due || (this.task ? this.task.due || "" : "");
    this.deadline = options.deadline || (this.task ? this.task.deadline || "" : "");
    this.hardDeadline = options.hardDeadline || options.hard_deadline || (this.task ? this.task.hardDeadline || "" : "");
    this.completedAt = options.completedAt || (this.task ? this.task.completedAt || "" : "");
    this.progress = options.progress || (this.task ? this.task.progress || "" : "");
    this.priority = options.priority || (this.task ? this.task.priority || "" : "");
    this.parentKey = options.parentKey || "";
    this.blockedByKey = options.blockedByKey || "";
    this.childDraft = "";
    this.tasks = [];
  }

  async onOpen() {
    this.tasks = await this.plugin.scanTasks();
    if (this.task) {
      const parent = this.tasks.find((item) => item.taskId && item.taskId === this.task.parentId);
      if (parent) this.parentKey = parent.runtimeId;
      const blockedBy = this.tasks.find((item) => item.taskId && item.taskId === this.task.blockedBy);
      if (blockedBy) this.blockedByKey = blockedBy.runtimeId;
    }
    this.renderForm();
  }

  renderForm() {
    const { contentEl } = this;
    contentEl.empty();
    const editorTitle = this.mode === "edit" ? "编辑任务" : this.mode === "insert" ? "创建任务" : "创建任务";
    contentEl.createEl("h2", { text: editorTitle });
    if (this.mode === "edit" && this.task) {
      const switcher = contentEl.createDiv({ cls: "wjq-task-editor-switch" });
      switcher.createEl("button", { text: "切到右侧页面" }).onclick = async () => {
        this.close();
        await this.plugin.activateTaskDetailView(this.task);
      };
    }
    this.renderNewTaskModalForm(contentEl);
    return;
    contentEl.createEl("h2", { text: this.mode === "edit" ? "编辑任务" : this.mode === "insert" ? "创建任务" : "创建任务" });

    new Setting(contentEl)
      .setName("任务")
      .addText((text) => {
        text.setPlaceholder("例如：修改论文引言第二节");
        text.setValue(this.title);
        text.onChange((value) => (this.title = value));
        setTimeout(() => text.inputEl.focus(), 50);
      });

    new Setting(contentEl)
      .setName("所属项目")
      .addDropdown((dropdown) => {
        for (const project of this.projectOptions()) {
          dropdown.addOption(project, project);
        }
        dropdown.setValue(this.project);
        dropdown.onChange((value) => {
          this.project = value;
          this.parentKey = "";
          this.blockedByKey = "";
          this.renderForm();
        });
      });

    new Setting(contentEl)
      .setName("状态")
      .addDropdown((dropdown) => {
        for (const status of availableTaskStatusChoices(this.plugin.settings.activeStatusNames, true)) {
          dropdown.addOption(status, status);
        }
        dropdown.setValue(this.status);
        dropdown.onChange((value) => (this.status = value));
      });

    new Setting(contentEl)
      .setName("开始日期")
      .setDesc("用于日历起点。默认当前年月，只补日期即可。")
      .addText((text) => {
        text.setPlaceholder(`${currentYearMonth()}-`);
        text.setValue(dateInputValue(this.due));
        text.onChange((value) => (this.due = value));
      });

    new Setting(contentEl)
      .setName("截止日期")
      .setDesc("硬性截止日期，只进入倒计时任务，不进入日历。")
      .addText((text) => {
        text.setPlaceholder(`${currentYearMonth()}-`);
        text.setValue(dateInputValue(this.hardDeadline));
        text.onChange((value) => (this.hardDeadline = value));
      });

    new Setting(contentEl)
      .setName("计划完成")
      .setDesc("用于日历范围结束日。")
      .addText((text) => {
        text.setPlaceholder(`${currentYearMonth()}-`);
        text.setValue(dateInputValue(this.deadline));
        text.onChange((value) => (this.deadline = value));
      });

    new Setting(contentEl)
      .setName("进度")
      .setDesc("例如 65、14/16章、初稿阶段。")
      .addText((text) => {
        text.setPlaceholder("65 或 14/16章");
        text.setValue(this.progress);
        text.onChange((value) => (this.progress = value));
      });

    const structure = contentEl.createEl("details", { cls: "wjq-task-hub-details" });
    structure.createEl("summary", { text: "任务结构" });

    new Setting(structure)
      .setName("上级任务")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "无");
        for (const task of this.parentOptions()) {
          dropdown.addOption(task.runtimeId, shortTaskLabel(task));
        }
        dropdown.setValue(this.parentKey);
        dropdown.onChange((value) => (this.parentKey = value));
      });

    new Setting(structure)
      .setName("前置依赖")
      .setDesc("与上级任务不同：表示必须先完成的任务。")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "无");
        for (const task of this.parentOptions()) {
          dropdown.addOption(task.runtimeId, shortTaskLabel(task));
        }
        dropdown.setValue(this.blockedByKey);
        dropdown.onChange((value) => (this.blockedByKey = value));
      });

    new Setting(structure)
      .setName("新增下级任务")
      .setDesc("可选，每行一个。保存后会自动成为当前任务的子任务。")
      .addTextArea((area) => {
        area.inputEl.rows = 3;
        area.setPlaceholder("例如：补充稳健性检验\n例如：整理参考文献");
        area.setValue(this.childDraft);
        area.onChange((value) => (this.childDraft = value));
      });

    const more = contentEl.createEl("details", { cls: "wjq-task-hub-details" });
    more.createEl("summary", { text: "更多设置" });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText("保存")
          .setCta()
          .onClick(async () => {
            const payload = {
              title: this.title,
              project: this.project,
              due: this.due.trim(),
              deadline: this.deadline.trim(),
              hardDeadline: this.hardDeadline.trim(),
              completedAt: this.completedAt.trim(),
              status: this.status,
              progress: this.progress.trim(),
              priority: this.priority,
              parentTask: this.taskByKey(this.parentKey),
              blockedBy: await this.resolveBlockedBy(),
              childDraft: this.childDraft,
            };
            const saved = this.mode === "edit"
              ? await this.plugin.updateStructuredTask(this.task, payload)
              : await this.plugin.createStructuredTask(this.mode, payload);
            if (saved) this.close();
          });
      });
  }

  renderNewTaskModalForm(contentEl) {
    new Setting(contentEl)
      .setName("任务")
      .addText((text) => {
        text.setPlaceholder("例如：修改论文引言第二节");
        text.setValue(this.title);
        text.onChange((value) => (this.title = value));
        setTimeout(() => text.inputEl.focus(), 50);
      });

    new Setting(contentEl)
      .setName("所属项目")
      .addDropdown((dropdown) => {
        for (const project of this.projectOptions()) {
          dropdown.addOption(project, project);
        }
        dropdown.setValue(this.project);
        dropdown.onChange((value) => {
          this.project = value;
          this.parentKey = "";
          this.blockedByKey = "";
        });
      });

    const statusChoices = contentEl.createDiv({ cls: "wjq-task-editor-choice-block" });
    statusChoices.createDiv({ cls: "wjq-task-editor-label", text: "状态" });
    this.renderModalChoiceButtons(statusChoices, availableTaskStatusChoices(this.plugin.settings.activeStatusNames, true), this.status, (value) => (this.status = value));

    const dates = contentEl.createDiv({ cls: "wjq-task-editor-grid" });
    this.renderModalTextField(dates, "开始日期", dateInputValue(this.due), (value) => (this.due = value), `${currentYearMonth()}-`);
    this.renderModalTextField(dates, "截止日期", dateInputValue(this.hardDeadline), (value) => (this.hardDeadline = value), `${currentYearMonth()}-`);
    this.renderModalTextField(dates, "计划完成", dateInputValue(this.deadline), (value) => (this.deadline = value), `${currentYearMonth()}-`);
    this.renderModalTextField(dates, "实际完成", dateInputValue(this.completedAt), (value) => (this.completedAt = value), `${currentYearMonth()}-`);
    this.renderModalTextField(dates, "进度", this.progress, (value) => (this.progress = value), "65 / 4/16章");

    const structure = contentEl.createEl("details", { cls: "wjq-task-hub-details" });
    structure.open = true;
    structure.createEl("summary", { text: "任务结构" });

    new Setting(structure)
      .setName("上级任务")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "无");
        for (const task of this.parentOptions()) dropdown.addOption(task.runtimeId, shortTaskLabel(task));
        dropdown.setValue(this.parentKey);
        dropdown.onChange((value) => (this.parentKey = value));
      });

    new Setting(structure)
      .setName("前置任务")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "无");
        for (const task of this.parentOptions()) dropdown.addOption(task.runtimeId, shortTaskLabel(task));
        dropdown.setValue(this.blockedByKey);
        dropdown.onChange((value) => (this.blockedByKey = value));
      });

    new Setting(structure)
      .setName("新增下级任务")
      .setDesc("可选，每行一个。保存后会自动成为当前任务的下级任务。")
      .addTextArea((area) => {
        area.inputEl.rows = 3;
        area.setValue(this.childDraft);
        area.onChange((value) => (this.childDraft = value));
      });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText("保存")
          .setCta()
          .onClick(async () => {
            const payload = {
              title: this.title,
              project: this.project,
              due: this.due.trim(),
              deadline: this.deadline.trim(),
              hardDeadline: this.hardDeadline.trim(),
              completedAt: this.completedAt.trim(),
              status: this.status,
              progress: this.progress.trim(),
              priority: this.priority,
              parentTask: this.taskByKey(this.parentKey),
              blockedBy: await this.resolveBlockedBy(),
              childDraft: this.childDraft,
            };
            const saved = this.mode === "edit"
              ? await this.plugin.updateStructuredTask(this.task, payload)
              : await this.plugin.createStructuredTask(this.mode, payload);
            if (saved) this.close();
          });
      });
  }

  renderModalTextField(parent, label, value, onChange, placeholder = "") {
    const field = parent.createDiv({ cls: "wjq-task-editor-field" });
    field.createDiv({ cls: "wjq-task-editor-label", text: label });
    const input = field.createEl("input", { attr: { type: "text", placeholder } });
    input.value = value || "";
    input.onchange = () => onChange(input.value);
  }

  renderModalChoiceButtons(parent, options, activeValue, onChoose, emptyLabel = "") {
    const choices = parent.createDiv({ cls: "wjq-task-editor-choices" });
    for (const option of options) {
      const label = option || emptyLabel || "未设置";
      const button = choices.createEl("button", { text: label, cls: option === activeValue ? "is-active" : "" });
      button.onclick = () => {
        choices.querySelectorAll("button").forEach((item) => item.removeClass("is-active"));
        button.addClass("is-active");
        onChoose(option);
      };
    }
  }

  projectOptions() {
    const fromTasks = this.tasks.flatMap((task) => task.projects || []);
    return uniq([...(this.plugin.settings.defaultProjects || []), ...fromTasks]).sort();
  }

  parentOptions() {
    return this.tasks.filter((task) => !task.completed && (!this.project || task.projects.includes(this.project)));
  }

  taskByKey(key) {
    return this.tasks.find((task) => task.runtimeId === key) || null;
  }

  async resolveBlockedBy() {
    const task = this.taskByKey(this.blockedByKey);
    if (!task) return "";
    return task.taskId || (await this.plugin.ensureTaskId(task));
  }

  onClose() {
    this.contentEl.empty();
  }
}

class TaskHubSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "个人工作台设置" });

    new Setting(containerEl)
      .setName("跨设备任务同步")
      .setDesc(this.plugin.internalTaskSyncDescription())
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.internalTaskSyncEnabled !== false).onChange(async (value) => {
          this.plugin.settings.internalTaskSyncEnabled = value;
          this.plugin.startInternalTaskSync();
          await this.plugin.saveSettings({ refresh: false });
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("立即检查并合并").onClick(async () => {
          await this.plugin.syncInternalTasksFromDisk();
          new Notice("已检查个人工作台任务同步；如有另一台设备的更新，会自动合并。");
          this.display();
        });
      });

    new Setting(containerEl)
      .setName("自动检查频率")
      .setDesc("仅在“跨设备任务同步”开启时生效。较短的频率会更快显示平板更新。")
      .addSlider((slider) => {
        slider.setLimits(5, 60, 5)
          .setValue(Math.max(5, Math.min(60, Number(this.plugin.settings.internalTaskSyncIntervalSeconds) || 8)))
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.internalTaskSyncIntervalSeconds = value;
            this.plugin.startInternalTaskSync();
            await this.plugin.saveSettings({ refresh: false });
          });
      });

    new Setting(containerEl)
      .setName("年度日记路径模板")
      .setDesc("例如 {year}.md 或 日记/{year}.md。默认只打开年度笔记，不创建今日日记。")
      .addText((text) => {
        text.setValue(this.plugin.settings.annualDiaryPathTemplate);
        text.onChange(async (value) => {
          this.plugin.settings.annualDiaryPathTemplate = value.trim() || DEFAULT_SETTINGS.annualDiaryPathTemplate;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("年度日记打开方式")
      .setDesc("open = 只打开；end = 打开并跳到末尾。")
      .addDropdown((dropdown) => {
        dropdown.addOption("open", "只打开年度笔记");
        dropdown.addOption("end", "打开并跳到文件末尾");
        dropdown.setValue(this.plugin.settings.diaryOpenMode || "open");
        dropdown.onChange(async (value) => {
          this.plugin.settings.diaryOpenMode = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("快捷入口")
      .setDesc("每行一个：名称|类型|目标|图标。类型支持 annual-diary、note、folder、command、home。")
      .addTextArea((area) => {
        area.inputEl.rows = 8;
        area.setValue(quickEntriesToText(this.plugin.settings.quickEntries));
        area.onChange(async (value) => {
          this.plugin.settings.quickEntries = quickEntriesFromText(value);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("最近编辑显示数量")
      .addSlider((slider) => {
        slider
          .setLimits(3, 20, 1)
          .setValue(this.plugin.settings.recentLimit || DEFAULT_SETTINGS.recentLimit)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.recentLimit = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("独立任务存储")
      .setDesc("右侧新建的独立任务会保存到插件 data.json，不再追加到任务收件箱 Markdown。旧收件箱只用于首次导入。");

    new Setting(containerEl)
      .setName("项目标签前缀")
      .setDesc("推荐保持 #p/，例如 #p/论文写作。")
      .addText((text) => {
        text.setValue(this.plugin.settings.projectTagPrefix);
        text.onChange(async (value) => {
          this.plugin.settings.projectTagPrefix = value.trim() || DEFAULT_SETTINGS.projectTagPrefix;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("状态标签前缀")
      .setDesc("推荐保持 #s/，例如 #s/进行中。")
      .addText((text) => {
        text.setValue(this.plugin.settings.statusTagPrefix);
        text.onChange(async (value) => {
          this.plugin.settings.statusTagPrefix = value.trim() || DEFAULT_SETTINGS.statusTagPrefix;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("当前推进状态")
      .setDesc("每行一个。右侧任务控制台会用这些状态识别已经开始、需要继续推进的任务。")
      .addTextArea((area) => {
        area.inputEl.rows = 5;
        area.setValue((this.plugin.settings.activeStatusNames || DEFAULT_SETTINGS.activeStatusNames).join("\n"));
        area.onChange(async (value) => {
          this.plugin.settings.activeStatusNames = value
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter((item) => item && item !== "待办" && !taskIsCompletedStatus(item));
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("默认主线")
      .setDesc("每行一个，创建任务时显示在下拉菜单里。")
      .addTextArea((area) => {
        area.inputEl.rows = 6;
        area.setValue(this.plugin.settings.defaultProjects.join("\n"));
        area.onChange(async (value) => {
          this.plugin.settings.defaultProjects = value
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean);
          await this.plugin.saveSettings();
        });
      });
  }
}

module.exports = WjqTaskHubPlugin;
