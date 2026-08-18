/**
 * tool-auth-service.ts — 工具授权服务层
 *
 * ToolAuthServiceImpl (local single-user):
 * matches dangerous command patterns in tool argument strings; on a hit
 * returns ASK to trigger user approval.
 * 本地单用户无 DENY（拒绝即审批拒绝）；危险操作一律走审批。
 *
 * 边界：只对【框架内建终端类工具】(terminal/pwsh/*_terminal) 做灾难/危险命令门检。
 * 外部工具安全不由框架写死——交给工具自声明安全分级 + 后续优化（非强制）。
 */
import { AuthzDecision } from './types'
export { AuthzDecision } from './types'

/** 灾难性命令模式 — 命中后返回 DENY（绝对不执行，不进审批，直接拦截） */
const CATASTROPHIC_PATTERNS: RegExp[] = [
  // ── 全盘/家目录递归删除 ────────────────────────
  /rm\s+-[rf]+\s+\//,
  /rm\s+-[rf]+\s+.*~\//,
  // ── 磁盘/设备写入 ──────────────────────────────
  /dd\s+if=/,
  /mkfs\./,
  // ── Windows 灾难性操作 ─────────────────────────
  /format\s+\w:.*\/fs:/i,
  /del\s+\/f\s+\/s\s+\/[a-z]:\\/i,
  /rd\s+\/s\s+\/q\s+\/[a-z]:\\/i,
  /(powershell|pwsh)(\.exe)?\b.*\s(clear-disk|format-volume|remove-driveletter|reset-computer|restore-computer)\b/i,
  // ── 系统关机/重启 ──────────────────────────────
  /shutdown\s+\/s\b/i,
  /shutdown\s+-h\b/i,
  // ── fork 炸弹 ──────────────────────────────────
  /:\(\)\s*\{.*:.*\};/i,
]

/** 危险参数模式列表 — 命中后触发 ASK（需用户审批） */
const DANGEROUS_ARG_PATTERNS: RegExp[] = [
  // ── 文件系统破坏 ────────────────────────────
  /rm\s+-[^\s]*r/i,                                        // recursive delete
  /rm\s+--recursive\b/i,                                   // recursive delete (long flag)

  // ── Windows 破坏性操作 ──────────────────────
  /cmd(\.exe)?\s+\/(c|k)\s+.*\b(del|erase|rd|rmdir)\b/i,
  /(powershell|pwsh)(\.exe)?\b.*\s(remove-item|rmdir|erase|del|rd|ri|rm)\b/i,
  /(powershell|pwsh)(\.exe)?\b.*\s-(encodedcommand|enc|e)\b/i,

  // ── 权限修改 ────────────────────────────────
  /chmod\s+(-[^\s]*\s+)*(777|666|o\+[rwx]*w|a\+[rwx]*w)/,
  /chmod\s+--recursive\b.*(777|666|o\+[rwx]*w|a\+[rwx]*w)/,
  /chmod\s+\+x\b.*[;&|]+\s*\.\//,
  /chown\s+(-[^\s]*)?R\s+root/,
  /chown\s+--recur[a-z]*\b.*root/,

  // ── SQL 破坏 ────────────────────────────────
  /DROP\s+(TABLE|DATABASE)\b/i,
  /DELETE\s+FROM\b(?!.*\bWHERE\b)/is,
  /TRUNCATE\s+(TABLE\s+)?\w+/i,

  // ── 进程/系统操作 ──────────────────────────
  /systemctl\s+(-[^\s]+\s+)*(stop|restart|disable|mask)\b/,
  /kill\s*-9\s+-1\b/,
  /pkill\s*-9\b/,
  /killall\s+(-[^\s]*\s+)*-(9|KILL|SIGKILL)\b/,
  /killall\s+(-[^\s]*\s+)*-s\s+(KILL|SIGKILL|9)\b/,
  /xargs\s+.*\brm\b/,

  // ── find + 删除组合 ─────────────────────────
  /find\b.*-exec(dir)?\s+(\/\S*\/)?rm\b/,
  /find\b.*-delete\b/,

  // ── 远程内容执行 ────────────────────────────
  /(curl|wget)\b.*\|\s*(\/\w*\/)?(ba)?sh\b/,
  /(bash|sh|zsh|ksh)\s+<\s*<?\s*\(\s*(curl|wget)\b/,
  /(eval|source|\.)\s*(\$\(\s*|`\s*)(curl|wget)\b/,

  // ── 编码混淆执行 ────────────────────────────
  /(base64|base32|base16)\s+(-[dD]|--decode)\b.*\|\s*(bash|sh|zsh|ksh|dash)\b/,
  /xxd\s+-r\b.*\|\s*(bash|sh|zsh|ksh|dash)\b/,
  /echo\b[^|]*\|\s*tr\b[^|]*\|\s*(bash|sh|zsh|ksh|dash)\b/,

  // ── heredoc 脚本执行 ────────────────────────
  /(bash|sh|zsh|ksh)\s+<</,

  // ── Git 破坏性操作 ─────────────────────────
  /git\s+reset\s+--hard\b/,
  /git\s+push\b.*--force\b/,
  /git\s+push\b.*-f\b/,
  /git\s+clean\s+-[^\s]*f/,
  /git\s+branch\s+-D\b/,

  // ── 覆盖敏感文件 ────────────────────────────
  />>?\s*["']?(\/etc\/|~\/\.ssh\/|~\/\.bashrc|~\/\.bash_profile|~\/\.zshrc|~\/\.env|~\/\.hermes\/config\.yaml)/,
  /tee\b.*["']?(\/etc\/|~\/\.ssh\/|~\/\.bashrc|~\/\.bash_profile|~\/\.zshrc|~\/\.env|~\/\.hermes\/config\.yaml)/,
  /(cp|mv|install)\b.*\s["']?(\/etc\/|~\/\.ssh\/|~\/\.hermes\/config\.yaml)/,
  /sed\s+-[^\s]*i.*(\/etc\/|~\/\.ssh\/|~\/\.bashrc|~\/\.bash_profile|~\/\.zshrc|~\/\.env|~\/\.hermes\/config\.yaml)/,

  // ── Docker 容器生命周期 ────────────────────
  /docker\s+compose\s+(restart|stop|kill|down)\b/,
  /docker\s+(restart|stop|kill)\b/,

  // ── sudo 特权操作 ───────────────────────────
  /sudo\b[^;|&\n]*?\s+(-s\b|--stdin|--askpass|-a\b)/,
  /sudo\b[^;|&\n]*?\s+-[a-z]*[sa][a-z]*\b/,

  // ── 系统磁盘/设备操作 ──────────────────────
  /dd\s+.*if=/i,
  />\s*\/dev\/sd/i,
]

/** 工具授权服务 */
export class ToolAuthService {
  /** 检查工具调用：灾难命令 → DENY（直接拦截）；危险模式 → ASK（审批）；其余 ALLOW。
   *  仅对框架内建终端类工具判参数；外部工具不写死安全（由工具自声明 + 后续优化）。 */
  check(toolName: string, args: Record<string, unknown>): AuthzDecision {
    // 仅对终端类工具做参数危险检测（其它工具参数非命令语义）
    const isTerminalLike = toolName === 'terminal'
      || toolName === 'desktop_tinker_terminal'
      || toolName === 'desktop_tinker_pwsh'
      || toolName.endsWith('_terminal')

    if (!isTerminalLike) {
      return AuthzDecision.ALLOW
    }

    const argsStr = JSON.stringify(args ?? {})
    // 第一层：灾难性命令 → DENY（绝对不执行——不进审批，直接拦截返回）
    for (const pattern of CATASTROPHIC_PATTERNS) {
      if (pattern.test(argsStr)) {
        return AuthzDecision.DENY
      }
    }
    // 第二层：风险操作 → ASK（需用户审批）
    for (const pattern of DANGEROUS_ARG_PATTERNS) {
      if (pattern.test(argsStr)) {
        return AuthzDecision.ASK
      }
    }
    return AuthzDecision.ALLOW
  }
}
