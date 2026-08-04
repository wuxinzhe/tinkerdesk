/** 客户端环境信息，由 SPLASH 流程采集后发送到 /app/client/env/register */
export interface ClientEnvInfo {
  os: string
  arch: string
  clientType: string
  shell: string
  homeDir: string
  pathFormat: string
}
