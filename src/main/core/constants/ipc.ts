/**
 * constants/ipc.ts — IPC 通道名常量（本地传输层单一来源）
 *
 * main（webContents.send）与 preload（ipcRenderer.on）共用同一份通道名。
 * 协议统一：所有 main → renderer 事件走单通道 IPC_MESSAGE，消息内 type 用 EVT_*（见 ./event）。
 * 未来接入云 Agent：传输换 WebSocket（单通道 + type 同义），此常量即本地实现细节。
 */
/** 统一消息通道（main → renderer：{ type: EVT_*, data, sessionId }） */
export const IPC_MESSAGE = 'agent:message'
